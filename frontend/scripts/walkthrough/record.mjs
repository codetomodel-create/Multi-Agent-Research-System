/**
 * Drives the app in a real Chromium and captures the walkthrough frames.
 *
 * Exports `record()`, used by build-video.mjs. Each narration segment becomes
 * one "step": show the callout, perform the UI action, then hold until the
 * segment's narration has finished. Step start times are written to
 * timeline.json so the narration audio can be aligned afterwards.
 *
 * Frames come from the CDP screencast and are written to disk as JPEGs with
 * wall-clock timestamps (frames.json); encoding happens offline afterwards.
 * Playwright's built-in recorder encodes in real time and drops the tail of
 * long sessions when the machine is busy, so it is not used here.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { chromium } from "@playwright/test";

import { installOverlay } from "./overlay.mjs";
import { DEMO_IDEA, DEMO_LOCATION, SEGMENTS, VIDEO_TITLE } from "./narration.mjs";

const VIEWPORT = { width: 1440, height: 900 };
const HOLD_PAD_MS = 900;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Rough fallback when no TTS durations are available: ~2.6 words/second. */
function estimateMs(text) {
  return Math.round((text.trim().split(/\s+/).length / 2.6) * 1000) + 600;
}

function makeDriver(page) {
  const center = async (locator) => {
    const box = await locator.first().boundingBox();
    if (!box) return null;
    return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
  };

  const moveTo = async (locator) => {
    const c = await center(locator);
    if (!c) return null;
    await page.evaluate(([x, y]) => window.__wt.cursor(x, y), [c.x, c.y]);
    await sleep(560);
    await page.mouse.move(c.x, c.y);
    return c;
  };

  const click = async (locator) => {
    const c = await moveTo(locator);
    if (c) await page.evaluate(([x, y]) => window.__wt.pulse(x, y), [c.x, c.y]);
    await locator.first().click();
    await sleep(350);
  };

  const type = async (locator, text) => {
    await click(locator);
    await locator.first().pressSequentially(text, { delay: 26 });
  };

  const spot = async (locator, holdMs = 0) => {
    const box = await locator.first().boundingBox();
    await page.evaluate((rect) => window.__wt.spotlight(rect), box);
    if (holdMs) {
      await sleep(holdMs);
      await page.evaluate(() => window.__wt.spotlight(null));
    }
  };

  const unspot = () => page.evaluate(() => window.__wt.spotlight(null));
  const card = (html) => page.evaluate((h) => window.__wt.card(h), html);
  const hideCard = () => page.evaluate(() => window.__wt.hideCard());
  const hideCursor = () => page.evaluate(() => window.__wt.hideCursor());

  return { moveTo, click, type, spot, unspot, card, hideCard, hideCursor };
}

function buildActions(page, d, ctx) {
  const rail = page.getByRole("navigation", { name: "Primary" });
  // Nav items carry a trailing count badge ("Dashboard 2"), so match the prefix.
  const railButton = (name) => rail.getByRole("button", { name: new RegExp(`^${name}`) });

  // A finished run auto-opens its report; Telemetry steps must survive that.
  const ensureTelemetry = async () => {
    const heading = page.getByRole("heading", { name: "Pipeline telemetry" });
    if (!(await heading.isVisible().catch(() => false))) {
      await d.click(railButton("Telemetry"));
      await heading.waitFor();
    }
  };

  return {
    async titleCard() {
      await d.card(`
        <div class="kicker">Product walkthrough</div>
        <h1>${VIDEO_TITLE.replace(" — Product Walkthrough", "")}</h1>
        <p class="lead">From a one-line business idea to an audited, board-ready market report — in minutes.</p>
        <p class="lead" style="font-size:16px;color:#9fb0c8">This guide covers setup, launching research, reading results, comparing studies, and tips for everyday use.</p>
      `);
    },
    async overviewCard() {
      await d.card(`
        <div class="kicker">What it does</div>
        <h1>One idea in. A full market report out.</h1>
        <div class="cols">
          <div class="col"><h2>You provide</h2><p>A business idea, and optionally a target city or region. That is all.</p></div>
          <div class="col"><h2>Seven agents deliver</h2><p>Coordinator plans · 4 researchers gather market, competitor, pricing and trend data in parallel · Writer synthesises · Fact Checker audits.</p></div>
          <div class="col"><h2>You receive</h2><p>Executive summary, market &amp; competitors, SWOT, strategic recommendations and the auditor's critique — exportable as Markdown, JSON or PDF.</p></div>
          <div class="col"><h2>Built for</h2><p>Founders, product managers and analysts who need a credible first-pass market view without a week of desk research.</p></div>
        </div>
      `);
    },
    async rolesCard() {
      await d.card(`
        <div class="kicker">Who uses it</div>
        <h1>Two roles, one screen</h1>
        <div class="cols">
          <div class="col"><h2>Researcher</h2><p>Launches studies, follows progress in Telemetry, reads and exports reports, compares runs. Needs no technical knowledge.</p></div>
          <div class="col"><h2>Workspace owner</h2><p>Opens Settings once to choose the AI providers and models for the light and heavy tiers and to enter API keys. Often the same person.</p></div>
        </div>
        <p class="lead" style="margin-top:18px;font-size:16px;color:#9fb0c8">No separate logins — anyone who can open the app can do both.</p>
      `);
    },

    async openApp() {
      await d.hideCard();
      const dialog = page.getByRole("dialog", { name: "Guided tour" });
      await dialog.waitFor({ state: "visible", timeout: 15000 });
      await sleep(800);
      await d.spot(dialog);
      await sleep(1200);
      await d.unspot();
    },
    async tourNext() {
      const next = page.getByRole("button", { name: "Next", exact: true });
      for (let i = 0; i < 3; i += 1) {
        await d.click(next);
        await sleep(2200);
      }
    },
    async tourFinish() {
      await d.click(page.getByRole("button", { name: "Skip tour" }));
      await page.getByRole("heading", { name: "Research command center" }).waitFor();
    },

    async highlightRail() {
      await d.spot(rail);
      for (const name of ["Dashboard", "New research", "Telemetry", "Compare", "Settings"]) {
        await d.moveTo(railButton(name));
        await sleep(900);
      }
      await d.moveTo(rail.getByRole("group", { name: "Colour theme" }));
      await sleep(900);
      await d.moveTo(rail.getByText("3D canvas"));
      await sleep(900);
      await d.moveTo(rail.getByText(/Backend (connected|unreachable)/));
      await sleep(1200);
      await d.unspot();
    },
    async highlightStats() {
      await d.spot(page.locator(".grid-3"));
      const cards = page.locator(".stat-card");
      for (let i = 0; i < 3; i += 1) {
        await d.moveTo(cards.nth(i));
        await sleep(1200);
      }
      await d.unspot();
    },
    async highlightHistory() {
      const history = page.getByRole("region", { name: "Research history" });
      await d.spot(history);
      const firstRow = page.locator(".run-row").first();
      await d.moveTo(firstRow.locator(".badge"));
      await sleep(2500);
      await d.moveTo(firstRow.getByRole("button", { name: /Report|Logs/ }));
      await sleep(1800);
      await d.moveTo(firstRow.getByRole("button", { name: "Re-run" }));
      await sleep(1800);
      await d.moveTo(firstRow.getByRole("button", { name: /Delete run/ }));
      await sleep(1200);
      await d.unspot();
    },

    async openSettings() {
      await d.click(railButton("Settings"));
      const drawer = page.getByRole("dialog", { name: "Model and provider settings" });
      await drawer.waitFor();
      await sleep(600);
      await d.spot(drawer.getByRole("heading", { name: "Light tier" }).locator(".."), 2600);
      await d.spot(drawer.getByRole("heading", { name: "Heavy tier" }).locator(".."), 2600);
    },
    async settingsProvider() {
      const drawer = page.getByRole("dialog", { name: "Model and provider settings" });
      const heavyProvider = drawer.locator("#heavy-provider");
      await d.moveTo(heavyProvider);
      await sleep(600);
      await heavyProvider.selectOption("openai");
      await sleep(1600);
      await d.moveTo(drawer.locator("#heavy-model"));
      await sleep(1800);
      await d.moveTo(drawer.locator("#heavy-key"));
      await sleep(2200);
      await d.moveTo(drawer.getByRole("button", { name: "Test connection" }).last());
      await sleep(2200);
      await d.moveTo(drawer.getByRole("button", { name: "Save settings" }));
      await sleep(1500);
    },
    async closeSettings() {
      const drawer = page.getByRole("dialog", { name: "Model and provider settings" });
      await d.click(drawer.getByRole("button", { name: "Cancel", exact: true }));
    },

    async openLaunch() {
      await d.click(railButton("New research"));
      await page.getByRole("heading", { name: "New market intelligence task" }).waitFor();
      await sleep(500);
      await d.spot(page.getByLabel("Business idea"), 2400);
      await d.spot(page.getByLabel("Target location"), 2400);
    },
    async fillLaunch() {
      await d.type(page.getByLabel("Business idea"), DEMO_IDEA);
      await sleep(500);
      await d.type(page.getByLabel("Target location"), DEMO_LOCATION);
    },
    async highlightLaunchOptions() {
      const web = page.getByRole("checkbox", { name: /web search/i });
      const override = page.getByRole("checkbox", { name: /Override the API key/i });
      await d.spot(web.locator(".."));
      await d.moveTo(web);
      await sleep(4500);
      await d.spot(override.locator(".."));
      await d.moveTo(override);
      await sleep(3000);
      await d.unspot();
    },
    async submitLaunch() {
      await d.click(page.getByRole("button", { name: /launch agent pipeline/i }));
      await page.getByRole("heading", { name: "Pipeline telemetry" }).waitFor();
      ctx.launchedAt = Date.now();
    },

    async highlightTimeline() {
      await ensureTelemetry();
      const timeline = page.getByRole("region", { name: "Pipeline timeline" });
      await timeline.waitFor();
      await d.spot(timeline);
      for (const stage of ["Coordinate", "Research", "Synthesise", "Audit"]) {
        await d.moveTo(timeline.getByText(stage, { exact: true }));
        await sleep(2600);
      }
      await d.unspot();
    },
    async highlightLog() {
      await ensureTelemetry();
      const log = page.getByRole("region", { name: "Execution log" });
      await log.waitFor();
      await d.spot(log);
      await d.moveTo(log.getByPlaceholder("Search…"));
      await sleep(1800);
      await d.moveTo(log.locator("#log-filter"));
      await sleep(1800);
      await d.moveTo(log.getByRole("button", { name: /Copy/ }));
      await sleep(1200);
      await d.unspot();
    },
    async highlightCancel() {
      await ensureTelemetry();
      const cancel = page.getByRole("button", { name: "Cancel run" });
      if (await cancel.isVisible().catch(() => false)) {
        await d.spot(cancel);
        await d.moveTo(cancel);
        await sleep(3000);
        await d.unspot();
      }
    },

    async waitForReport() {
      const heading = page.getByRole("heading", { name: /C-Suite Strategic Outlook/ });
      const running = page.getByRole("button", { name: "Cancel run" });
      if (!(await heading.isVisible().catch(() => false)) && !(await running.isVisible().catch(() => false))) {
        // The run finished while we were elsewhere: open its report from history.
        await d.click(railButton("Dashboard"));
        await d.click(page.locator(".run-row").first().getByRole("button", { name: "Report" }));
      }
      await heading.waitFor({ timeout: 180000 });
      await sleep(800);
      await d.spot(heading.locator(".."), 3500);
    },
    async reportTabSummary() {
      await d.click(page.getByRole("tab", { name: "Executive Summary" }));
      await sleep(2500);
      await page.mouse.wheel(0, 420);
    },
    async reportTabMarket() {
      await d.click(page.getByRole("tab", { name: "Market & Competitors" }));
      await sleep(2500);
      await page.mouse.wheel(0, 380);
    },
    async reportTabSwot() {
      await d.click(page.getByRole("tab", { name: "SWOT Analysis" }));
    },
    async reportTabCritique() {
      await d.click(page.getByRole("tab", { name: "Critique & Refinements" }));
      await sleep(6000);
      await d.click(page.getByRole("tab", { name: "Raw JSON" }));
      await sleep(2500);
      await d.click(page.getByRole("tab", { name: "Executive Summary" }));
    },
    async highlightReportActions() {
      const read = page.getByRole("button", { name: "Read", exact: true });
      await d.spot(read.locator(".."));
      for (const name of ["Read", "Markdown", "JSON", "Copy section", "Share link"]) {
        await d.moveTo(page.getByRole("button", { name, exact: true }));
        await sleep(2200);
      }
      await d.unspot();
    },
    async openReadingMode() {
      await d.click(page.getByRole("button", { name: "Read", exact: true }));
      const reader = page.getByRole("dialog", { name: "Reading mode" });
      await reader.waitFor();
      await sleep(1500);
      await d.moveTo(reader.getByRole("button", { name: /Print/ }));
      await sleep(1500);
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.mouse.wheel(0, 600);
      await sleep(2200);
      await page.keyboard.press("Escape");
      await reader.waitFor({ state: "hidden" });
    },

    async openTelemetryReplay() {
      await d.click(railButton("Telemetry"));
      const timeline = page.getByRole("region", { name: "Pipeline timeline" });
      await timeline.waitFor();
      await d.spot(timeline, 3000);
      const slider = page.getByLabel("Replay position");
      await d.moveTo(slider);
      const max = Number(await slider.getAttribute("max")) || 10;
      await slider.fill(String(Math.max(1, Math.floor(max / 2))));
      await sleep(3200);
      await d.click(page.getByRole("button", { name: "Resume live" }));
      await sleep(1500);
    },

    async openCompare() {
      await d.click(railButton("Compare"));
      await page.getByRole("heading", { name: "Run comparison" }).waitFor();
      const a = page.getByLabel("Run A");
      const b = page.getByLabel("Run B");
      await d.moveTo(a);
      await a.selectOption(ctx.compareA);
      await sleep(1200);
      await d.moveTo(b);
      await b.selectOption(ctx.compareB);
      await sleep(2500);
      await page.mouse.move(VIEWPORT.width / 2, VIEWPORT.height / 2);
      await page.mouse.wheel(0, 500);
      await sleep(3000);
      await page.mouse.wheel(0, 500);
    },

    async openPalette() {
      await d.hideCursor();
      await page.keyboard.press("Control+k");
      const palette = page.getByRole("dialog", { name: "Command palette" });
      await palette.waitFor();
      await sleep(1800);
      await page.keyboard.type("report tab: swot", { delay: 70 });
      await sleep(2200);
      await page.keyboard.press("Enter");
      await sleep(2500);
      await page.keyboard.press("Control+k");
      await palette.waitFor();
      await page.keyboard.type("dashboard", { delay: 70 });
      await sleep(1200);
      await page.keyboard.press("Enter");
    },
    async cycleThemes() {
      await d.click(rail.getByRole("button", { name: "light theme" }));
      await sleep(2600);
      await d.click(rail.getByRole("button", { name: "dark theme" }));
      await sleep(1600);
      await d.click(rail.getByText("3D canvas"));
      await sleep(2600);
      await d.click(rail.getByText("3D canvas"));
    },

    async tipsCard() {
      await d.hideCursor();
      await d.card(`
        <div class="kicker">Tips &amp; best practices</div>
        <h1>Get the most out of every run</h1>
        <ul>
          <li data-n="1">Be specific: name the customer, the offer and the place in the business idea.</li>
          <li data-n="2">Keep <b>Enable web search</b> on so the report reflects today's market.</li>
          <li data-n="3">Cheap, fast <b>light</b> model + strongest <b>heavy</b> model = best quality per dollar.</li>
          <li data-n="4">Read <b>Critique &amp; Refinements</b> before quoting any number.</li>
          <li data-n="5"><b>Backend unreachable</b>? The server is down or starting — live updates resume automatically.</li>
          <li data-n="6">Stream stalled? Click <b>Reconnect</b>. Wrong idea? Click <b>Cancel run</b>.</li>
          <li data-n="7">Need a variant? <b>Re-run</b> after changing models or the brief, then <b>Compare</b>.</li>
        </ul>
      `);
    },
    async summaryCard() {
      await d.card(`
        <div class="kicker">Summary</div>
        <h1>The complete process</h1>
        <ul>
          <li data-n="1"><b>Settings</b> — choose a light and a heavy model, enter keys, test, save.</li>
          <li data-n="2"><b>New research</b> — describe the idea and location, launch.</li>
          <li data-n="3"><b>Telemetry</b> — watch Coordinate → Research → Synthesise → Audit with live cost.</li>
          <li data-n="4"><b>Report</b> — Executive Summary first, Critique before trusting numbers; export Markdown, JSON or PDF.</li>
          <li data-n="5"><b>Compare</b> — test a different brief, city or model side by side.</li>
        </ul>
        <p class="lead" style="margin-top:22px;font-size:17px;color:#9fb0c8">You are ready to run your first study.</p>
      `);
    },
  };
}

/**
 * @param {object} opts
 * @param {string} opts.baseURL        Backend origin serving the static UI.
 * @param {string} opts.outDir         Where frames/, frames.json and timeline.json go.
 * @param {Record<string, number>} [opts.durations]  Narration length per segment id (ms).
 * @param {{a: string, b: string}} opts.compare       Task ids pre-seeded for Compare.
 */
export async function record({ baseURL, outDir, durations = {}, compare, fast = false }) {
  const framesDir = path.join(outDir, "frames");
  await fs.rm(framesDir, { recursive: true, force: true });
  await fs.mkdir(framesDir, { recursive: true });

  const browser = await chromium.launch({
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    colorScheme: "dark",
  });
  await context.addInitScript(installOverlay);
  await context.addInitScript(() => {
    // Software GL in headless Chromium: low quality keeps the scene smooth.
    if (localStorage.getItem("mr_quality") === null) localStorage.setItem("mr_quality", '"low"');
  });

  const page = await context.newPage();
  const t0 = Date.now();
  const timeline = [];

  // Screencast capture: frames arrive only when the page repaints.
  const frames = [];
  const pendingWrites = new Set();
  const cdp = await context.newCDPSession(page);
  cdp.on("Page.screencastFrame", ({ data, sessionId }) => {
    const t = Date.now() - t0;
    const file = path.join(framesDir, `${String(frames.length).padStart(6, "0")}.jpg`);
    frames.push({ file, t });
    const write = fs.writeFile(file, Buffer.from(data, "base64")).finally(() => pendingWrites.delete(write));
    pendingWrites.add(write);
    cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });
  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 82,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 1,
  });

  const d = makeDriver(page);
  const ctx = { compareA: compare.a, compareB: compare.b };
  const actions = buildActions(page, d, ctx);

  await page.goto(baseURL, { waitUntil: "networkidle" });

  for (const seg of SEGMENTS) {
    const narrationMs = fast ? 0 : (durations[seg.id] ?? estimateMs(seg.say));
    const holdMs = narrationMs + HOLD_PAD_MS;
    const start = Date.now();
    timeline.push({ id: seg.id, chapter: seg.chapter, start: start - t0, narrationMs });

    if (seg.callout) {
      await page.evaluate(
        ([c, t, x, ms, pos]) => window.__wt.callout(c, t, x, ms, pos),
        [seg.chapter, seg.callout.title, seg.callout.text, holdMs, seg.callout.position ?? "bottom"],
      );
    } else {
      await page.evaluate(() => window.__wt.hideCallout());
    }

    const action = actions[seg.action];
    if (!action) throw new Error(`No action named "${seg.action}" for segment ${seg.id}`);
    try {
      await action();
    } catch (err) {
      err.message = `[segment ${seg.id} / ${seg.action}] ${err.message}`;
      throw err;
    }

    const remaining = holdMs - (Date.now() - start);
    if (remaining > 0) await sleep(remaining);
    process.stdout.write(`  ✓ ${seg.id.padEnd(22)} ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }

  await sleep(1500);
  const total = Date.now() - t0;
  await cdp.send("Page.stopScreencast").catch(() => {});
  await Promise.all(pendingWrites);
  await context.close();
  await browser.close();

  if (frames.length === 0) throw new Error("Screencast produced no frames");
  await fs.writeFile(path.join(outDir, "frames.json"), JSON.stringify({ total, frames }));
  await fs.writeFile(path.join(outDir, "timeline.json"), JSON.stringify({ total, segments: timeline }, null, 2));
  process.stdout.write(`  captured ${frames.length} frames\n`);
  return { frames, timeline, total };
}
