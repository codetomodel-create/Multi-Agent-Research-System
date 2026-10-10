#!/usr/bin/env node
/**
 * Builds the narrated product walkthrough video end to end.
 *
 *   1. Starts the FastAPI backend in fixture mode (MOCK_LLM=1) on a spare port,
 *      serving the static export from frontend/out.
 *   2. Renders the narration to WAV with Windows TTS (skipped off-Windows).
 *   3. Captures the UI journey with Playwright + CDP screencast, holding each
 *      step for the length of its narration.
 *   4. Encodes the timestamped frames + narration into an MP4 with ffmpeg, and
 *      writes WebVTT captions plus a printable narration script.
 *
 * Usage (from frontend/):   npm run video:walkthrough
 * Env:  FFMPEG=<path>  full ffmpeg build (needs libx264 + aac for audio);
 *                      defaults to `ffmpeg` on PATH, then ffmpeg-static if installed,
 *                      then Playwright's bundled ffmpeg (video only, no narration).
 *       WALKTHROUGH_PORT, WALKTHROUGH_VOICE, WALKTHROUGH_RATE, MOCK_LLM_DELAY_MS
 *       WALKTHROUGH_REUSE_AUDIO=1  keep previously rendered WAVs
 *       WALKTHROUGH_FAST=1         skip narration holds (selector smoke run, no audio)
 *       WALKTHROUGH_ENCODE_ONLY=1  skip recording; encode the captured frames + audio again
 */
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { record } from "./record.mjs";
import { SEGMENTS, VIDEO_TITLE } from "./narration.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = path.resolve(here, "../..");
const REPO_DIR = path.resolve(FRONTEND_DIR, "..");
const BUILD_DIR = path.join(FRONTEND_DIR, ".walkthrough-build");
const OUT_DIR = path.join(REPO_DIR, "docs", "video");
const PORT = process.env.WALKTHROUGH_PORT ?? "8124";
const BASE_URL = `http://127.0.0.1:${PORT}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (msg) => process.stdout.write(`\n▶ ${msg}\n`);

/* ---- ffmpeg discovery ---------------------------------------------------- */

function hasEncoder(bin, name) {
  const res = spawnSync(bin, ["-hide_banner", "-encoders"], { encoding: "utf8" });
  return res.status === 0 && new RegExp(`\\s${name}\\s`).test(res.stdout);
}

function findFfmpeg() {
  const candidates = [];
  if (process.env.FFMPEG) candidates.push(process.env.FFMPEG);
  candidates.push("ffmpeg");
  try {
    candidates.push(createRequire(import.meta.url)("ffmpeg-static"));
  } catch {
    /* not installed */
  }
  for (const bin of candidates) {
    if (!bin) continue;
    const probe = spawnSync(bin, ["-version"], { encoding: "utf8" });
    if (probe.status !== 0) continue;
    return { bin, audio: hasEncoder(bin, "aac") && hasEncoder(bin, "libx264") };
  }
  // Playwright ships a video-only ffmpeg used for its own recordings.
  const pw = path.join(os.homedir(), "AppData", "Local", "ms-playwright");
  try {
    const dirs = spawnSync("cmd", ["/c", "dir", "/b", pw], { encoding: "utf8" }).stdout.split(/\r?\n/);
    const ff = dirs.find((d) => d.startsWith("ffmpeg-"));
    if (ff) return { bin: path.join(pw, ff, "ffmpeg-win64.exe"), audio: false };
  } catch {
    /* ignore */
  }
  return null;
}

/* ---- backend ------------------------------------------------------------- */

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      /* not up yet */
    }
    await sleep(500);
  }
  throw new Error(`Backend did not become healthy at ${url}`);
}

async function startBackend(reportsDir) {
  const python = process.platform === "win32" ? "py" : "python3";
  const child = spawn(
    python,
    ["-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", PORT],
    {
      cwd: REPO_DIR,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        MOCK_LLM: "1",
        // Long enough for the Telemetry narration to play while the run is live.
        MOCK_LLM_DELAY_MS: process.env.MOCK_LLM_DELAY_MS ?? "15000",
        LITELLM_LOCAL_MODEL_COST_MAP: "True",
        REPORTS_DIR: reportsDir,
      },
    },
  );
  let stderr = "";
  child.stderr.on("data", (d) => {
    stderr += d.toString();
  });
  child.on("exit", (code) => {
    if (code && code !== 0) process.stderr.write(`backend exited (${code}):\n${stderr.slice(-2000)}\n`);
  });
  try {
    await waitForHealth(`${BASE_URL}/api/health`, 120000);
  } catch (err) {
    child.kill();
    throw new Error(`${err.message}\n${stderr.slice(-2000)}`);
  }
  return child;
}

async function resetAndSeedRuns() {
  const runs = await (await fetch(`${BASE_URL}/api/runs`)).json();
  await Promise.all(runs.map((r) => fetch(`${BASE_URL}/api/runs/${r.task_id}`, { method: "DELETE" })));
  const seeded = await (await fetch(`${BASE_URL}/api/demo/seed`, { method: "POST" })).json();
  const ids = (await (await fetch(`${BASE_URL}/api/runs`)).json()).map((r) => r.task_id);
  const a = ids.find((id) => id.includes("remote")) ?? ids[0];
  const b = ids.find((id) => id.includes("office")) ?? ids[1];
  return { a, b, seeded };
}

/* ---- narration audio ----------------------------------------------------- */

function wavDurationMs(buf) {
  // Canonical RIFF: byte rate at 28..32, scan chunks for "data".
  const byteRate = buf.readUInt32LE(28);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    const size = buf.readUInt32LE(off + 4);
    if (id === "data") return Math.round((size / byteRate) * 1000);
    off += 8 + size + (size % 2);
  }
  throw new Error("WAV data chunk not found");
}

async function renderNarration(audioDir) {
  if (process.platform !== "win32") {
    log("Not on Windows: skipping TTS, the video will have captions only.");
    return null;
  }
  await fs.mkdir(audioDir, { recursive: true });
  const manifest = path.join(audioDir, "segments.json");
  const readDurations = async () => {
    const durations = {};
    for (const seg of SEGMENTS) {
      const buf = await fs.readFile(path.join(audioDir, `${seg.id}.wav`));
      durations[seg.id] = wavDurationMs(buf);
    }
    return durations;
  };
  if (process.env.WALKTHROUGH_REUSE_AUDIO) {
    try {
      const cached = await readDurations();
      log("Reusing previously rendered narration audio.");
      return cached;
    } catch {
      /* fall through and render */
    }
  }
  await fs.writeFile(manifest, JSON.stringify(SEGMENTS.map(({ id, say }) => ({ id, say }))));
  const args = [
    "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", path.join(here, "tts.ps1"),
    "-Manifest", manifest, "-OutDir", audioDir,
  ];
  if (process.env.WALKTHROUGH_VOICE) args.push("-Voice", process.env.WALKTHROUGH_VOICE);
  if (process.env.WALKTHROUGH_RATE) args.push("-Rate", process.env.WALKTHROUGH_RATE);
  const res = spawnSync("powershell.exe", args, { encoding: "utf8" });
  if (res.status !== 0) {
    process.stderr.write(res.stderr);
    log("TTS failed: continuing without narration audio.");
    return null;
  }
  return readDurations();
}

/* ---- mux / captions / script --------------------------------------------- */

function runFfmpeg(bin, args) {
  const res = spawnSync(bin, ["-hide_banner", "-loglevel", "error", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (res.status !== 0) throw new Error(`ffmpeg failed:\n${res.stderr}`);
}

/** Writes a concat list where each frame is held until the next one arrived. */
async function writeConcatList(frames, total, listPath) {
  const lines = ["ffconcat version 1.0"];
  const esc = (p) => p.replace(/\\/g, "/").replace(/'/g, "'\\''");
  frames.forEach((f, i) => {
    const next = i + 1 < frames.length ? frames[i + 1].t : total;
    const dur = Math.max(0.001, (next - f.t) / 1000);
    lines.push(`file '${esc(f.file)}'`, `duration ${dur.toFixed(3)}`);
  });
  // Concat demuxer ignores the last duration unless the file is repeated.
  lines.push(`file '${esc(frames[frames.length - 1].file)}'`);
  await fs.writeFile(listPath, lines.join("\n"));
}

async function muxVideo(ff, { frames, total }, timeline, audioDir, outPath, listPath) {
  await writeConcatList(frames, total, listPath);
  const videoIn = ["-f", "concat", "-safe", "0", "-i", listPath];
  const videoOut = ["-c:v", "libx264", "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p", "-r", "25", "-vsync", "cfr"];
  const totalS = (total / 1000).toFixed(3);

  if (!ff.audio || !audioDir) {
    if (ff.audio) runFfmpeg(ff.bin, [...videoIn, ...videoOut, "-an", "-t", totalS, "-movflags", "+faststart", outPath]);
    else {
      outPath = outPath.replace(/\.mp4$/, ".webm");
      runFfmpeg(ff.bin, [...videoIn, "-c:v", "libvpx", "-b:v", "2M", "-r", "25", "-vsync", "cfr", "-an", "-t", totalS, outPath]);
    }
    return outPath;
  }
  const inputs = [...videoIn];
  const delays = [];
  timeline.forEach((seg, i) => {
    inputs.push("-i", path.join(audioDir, `${seg.id}.wav`));
    delays.push(`[${i + 1}:a]adelay=${seg.start}|${seg.start}[a${i}]`);
  });
  const mix = `${timeline.map((_, i) => `[a${i}]`).join("")}amix=inputs=${timeline.length}:duration=longest:normalize=0,apad[aout]`;
  runFfmpeg(ff.bin, [
    ...inputs,
    "-filter_complex", `${delays.join(";")};${mix}`,
    "-map", "0:v", "-map", "[aout]",
    ...videoOut,
    "-c:a", "aac", "-b:a", "160k",
    "-t", totalS, "-movflags", "+faststart",
    outPath,
  ]);
  return outPath;
}

function vttTime(ms) {
  const d = new Date(ms);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}:${String(d.getUTCSeconds()).padStart(2, "0")}.${String(d.getUTCMilliseconds()).padStart(3, "0")}`;
}

function clock(ms) {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

function buildCaptions(timeline, total) {
  const bySegment = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
  const lines = ["WEBVTT", ""];
  timeline.forEach((seg, i) => {
    const end = i + 1 < timeline.length ? timeline[i + 1].start : total;
    // Split long narration into ~2 caption cues so they stay readable.
    const sentences = bySegment[seg.id].say.match(/[^.!?]+[.!?]+/g) ?? [bySegment[seg.id].say];
    const half = Math.ceil(sentences.length / 2);
    const chunks = sentences.length > 3 ? [sentences.slice(0, half).join(" "), sentences.slice(half).join(" ")] : [sentences.join(" ")];
    const span = (end - seg.start) / chunks.length;
    chunks.forEach((text, k) => {
      lines.push(`${vttTime(seg.start + span * k)} --> ${vttTime(seg.start + span * (k + 1) - 50)}`, text.trim(), "");
    });
  });
  return lines.join("\n");
}

function buildScript(timeline) {
  const bySegment = Object.fromEntries(SEGMENTS.map((s) => [s.id, s]));
  const out = [`# ${VIDEO_TITLE} — narration script`, "", "Generated by `npm run video:walkthrough`. Timestamps match `walkthrough.mp4`.", ""];
  let chapter = null;
  for (const seg of timeline) {
    const s = bySegment[seg.id];
    if (s.chapter !== chapter) {
      chapter = s.chapter;
      out.push(`## ${chapter}`, "");
    }
    out.push(`**${clock(seg.start)}** ${s.callout ? `_${s.callout.title}_ — ` : ""}${s.say}`, "");
  }
  return out.join("\n");
}

/* ---- main ---------------------------------------------------------------- */

async function encodeOutputs(ff, { frames, timeline, total }, audioDir, fast) {
  log(`Encoding final video from ${frames.length} frames…`);
  const finalPath = await muxVideo(
    ff, { frames, total }, timeline, audioDir,
    path.join(OUT_DIR, fast ? "walkthrough-fast.mp4" : "walkthrough.mp4"),
    path.join(BUILD_DIR, "frames.ffconcat"),
  );
  const extras = [];
  if (!fast) {
    const vtt = path.join(OUT_DIR, "walkthrough.vtt");
    const script = path.join(OUT_DIR, "WALKTHROUGH_SCRIPT.md");
    await fs.writeFile(vtt, buildCaptions(timeline, total));
    await fs.writeFile(script, buildScript(timeline));
    extras.push(vtt, script);
  }
  const size = (await fs.stat(finalPath)).size / 1024 / 1024;
  log([`Done.`, `   ${finalPath} (${size.toFixed(1)} MB)`, ...extras.map((p) => `   ${p}`)].join("\n"));
}

async function main() {
  const ff = findFfmpeg();
  if (!ff) throw new Error("ffmpeg not found. Set FFMPEG=<path to ffmpeg> or install ffmpeg-static.");
  log(`ffmpeg: ${ff.bin}${ff.audio ? "" : " (video only — no aac/libx264, narration will not be muxed)"}`);

  const fast = Boolean(process.env.WALKTHROUGH_FAST);
  const keepAudio = Boolean(process.env.WALKTHROUGH_REUSE_AUDIO);
  const reportsDir = path.join(BUILD_DIR, "reports");
  const audioDir = path.join(BUILD_DIR, "audio");

  if (process.env.WALKTHROUGH_ENCODE_ONLY) {
    const { frames } = JSON.parse(await fs.readFile(path.join(BUILD_DIR, "frames.json"), "utf8"));
    const { total, segments } = JSON.parse(await fs.readFile(path.join(BUILD_DIR, "timeline.json"), "utf8"));
    const hasAudio = await fs.access(path.join(audioDir, `${SEGMENTS[0].id}.wav`)).then(() => true, () => false);
    log(`Encode-only: reusing ${frames.length} captured frames${hasAudio ? " with narration audio" : " (no audio found)"}`);
    await encodeOutputs(ff, { frames, timeline: segments, total }, hasAudio ? audioDir : null, fast);
    return;
  }

  for (const entry of await fs.readdir(BUILD_DIR).catch(() => [])) {
    if (keepAudio && entry === "audio") continue;
    await fs.rm(path.join(BUILD_DIR, entry), { recursive: true, force: true });
  }
  await fs.mkdir(BUILD_DIR, { recursive: true });
  await fs.mkdir(OUT_DIR, { recursive: true });

  let durations = null;
  if (fast) {
    log("FAST mode: no narration, minimal holds.");
  } else {
    log("Rendering narration with Windows TTS…");
    durations = await renderNarration(audioDir);
  }
  if (durations) {
    const totalS = Object.values(durations).reduce((a, b) => a + b, 0) / 1000;
    log(`Narration: ${SEGMENTS.length} segments, ${totalS.toFixed(0)}s of speech`);
  }

  log(`Starting backend on ${BASE_URL} (MOCK_LLM=1)…`);
  const backend = await startBackend(reportsDir);
  try {
    const { a, b } = await resetAndSeedRuns();
    log(`Seeded Compare runs: ${a}, ${b}`);

    log("Recording walkthrough…");
    const recorded = await record({
      baseURL: BASE_URL,
      outDir: BUILD_DIR,
      durations: durations ?? {},
      compare: { a, b },
      fast,
    });
    log(`Recorded ${(recorded.total / 1000).toFixed(0)}s`);
    backend.kill();

    await encodeOutputs(ff, recorded, durations ? audioDir : null, fast);
  } finally {
    backend.kill();
  }
}

main().catch((err) => {
  process.stderr.write(`\n✖ ${err.stack ?? err.message}\n`);
  process.exit(1);
});
