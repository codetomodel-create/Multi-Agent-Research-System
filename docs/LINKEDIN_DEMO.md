# LinkedIn Demo Pack — MarketAgent Observatory

Use this file as a teleprompter. Read the **Say** lines out loud. Follow the **On screen** clicks. Default cut: **8 minutes, recorded, mixed audience** (engineers + hiring managers).

| | |
| --- | --- |
| Product on screen | **MarketAgent Observatory** |
| What it does | One business idea + optional location → seven agents → a C-suite market report |
| Demo topic | `AI-powered specialty coffee subscription for remote workers` |
| Location | `Bengaluru` |
| Mode | Offline fixture (`MOCK_LLM=1`) so the pipeline never waits on a real model |
| Outcome the viewer should remember | You built a full-stack multi-agent research product, not a chat wrapper |

---

## 1. Demo at a glance

- **Runtime:** 8 minutes recorded (60-second cut at the bottom)
- **Audience:** LinkedIn — recruiters, engineers, founders
- **Format:** Screen recording + your face optional in a corner
- **Hook:** “I typed one business idea. Seven agents planned, researched, wrote, and audited a C-suite report — live, on a 3D observatory.”
- **Remember this:** Light models draft in parallel. Heavy models synthesise and fact-check. The UI shows cost, tokens, and state as it happens.

Cuts if you go short: drop **Compare**, then **Ctrl+K**, then the **Critique** tab.

---

## 2. Where to start (T-minus 10 minutes)

Do this **before** you hit record. Do not narrate setup on LinkedIn unless someone asks.

### 2.1 Boot the app (Windows, no API keys)

From the repo root, one command:

```bash
./start-linkedin-demo.sh
```

Windows CMD:

```bat
start-linkedin-demo.cmd
```

Or Python directly:

```bash
py -m backend.linkedin_demo
```

That starts fixture mode (`MOCK_LLM=1`), seeds two completed Compare runs, and opens **http://localhost:8000/?demo=1**.

On `?demo=1` the tour is skipped, the launch form is prefilled with the coffee / Bengaluru topic, Compare is pre-selected, and a **LinkedIn demo · say this** card follows the script.

Confirm the left rail says **Backend connected** and shows the **LinkedIn demo** badge. If it says **Backend unreachable**, stop. Do not record.

Two-server alternative (hot reload) if you already work that way:

```bash
# Terminal A
py -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload

# Terminal B
npm --prefix frontend run dev
```

Then open **http://localhost:3000**. Same script.

### 2.2 Browser

1. Window **1280×800 or larger**. Full screen after record starts.
2. Dark theme (moon button in the left rail).
3. **3D canvas** checkbox **on**.
4. Hide bookmarks bar. Close Slack / mail / extra tabs.
5. Do **not** add `?perf=1` to the URL. The FPS HUD looks like a debug build.
6. `?demo=1` skips the tour automatically. Only click **Skip tour** if you opened the app without the query flag.
7. Compare is pre-seeded (`…remote workers` vs `…office parks`). You do not need to launch two runs before recording. The live launch in the script still creates a third, on-camera run.

### 2.3 Backup plan

| If this happens | Do this | Say |
| --- | --- | --- |
| Backend unreachable | Stop recording. Restart uvicorn. Retry. | — |
| No WebGL / canvas is a flat gradient | Keep going. The DOM UI is the product. | “The 3D layer is progressive enhancement. The workflow still works.” |
| Run is slow | You set `MOCK_LLM_DELAY_MS=600` on purpose. Talk over Coordinate → Research. | Use the stall line in the script. |
| Compare needs two runs | Skip Compare. Jump to Settings / trust beat. | “Comparison unlocks after two finished runs.” |
| Tour blocks the view | **Skip tour**. | — |

### 2.4 Do not click on camera

- Do not paste real API keys.
- Do not open **Raw JSON** unless a technical viewer asks.
- Do not toggle **Override the API key for this run only**.
- Do not open the Perf HUD.
- Do not linger on empty **Compare** (“Two completed runs are needed”).

---

## 3. What to talk about (beat sheet)

| Time | On screen | You say (one line) | Do not say |
| --- | --- | --- | --- |
| 0:00–0:40 | Dashboard, constellation idle | “One idea in. A full market report out. Seven agents, not one chat.” | “Revolutionary AI platform.” |
| 0:40–1:20 | Still dashboard; point at orbs | “Light models research in parallel. Heavy models write and audit.” | Fake token or cost numbers. |
| 1:20–2:10 | New research form | “Business idea, city, launch. The form gets out of the way the moment it queues.” | “Simply click here.” |
| 2:10–4:10 | Telemetry + glowing orbs + Execution stream | “Four stages: Coordinate, Research, Synthesise, Audit. Duration, tokens, cost per stage.” | “The AI is thinking.” |
| 4:10–5:40 | Report tabs | “Executive Summary, market, SWOT, then the critic’s notes. This is the deliverable.” | Reading paragraphs in full. |
| 5:40–6:20 | Read / Markdown | “Reading mode for the PDF. Export is one click.” | “Game-changing UX.” |
| 6:20–7:10 | Compare **or** Ctrl+K | “Two runs, section by section. Or the whole app from the keyboard.” | Apologising if you skip this. |
| 7:10–7:40 | Settings closed / mention only | “Keys stay masked. Logs scrub secrets. Tests cover the API and the browser.” | Opening a key field. |
| 7:40–8:00 | Back to dashboard | “Repo in the comments if you want to run it locally.” | Asking people to like/subscribe. |

---

## 4. End-to-end speaking script

Read the **Say** blocks. Pause where it says **[pause]**. If a click lags, use **If it stalls**.

---

### [0:00] On screen: Dashboard — “Research command center”

Cursor idle. Constellation visible. **Backend connected**.

**Say:**

Hi — I’m showing a product I built called MarketAgent Observatory.

Most “AI research” tools are one prompt and a wall of text.

This is a pipeline. You give it a business idea and a city.

Seven specialised agents plan, search, write, and audit.

What you get back is a C-suite report you can actually hand to someone.

**[pause 1s]**

Behind me, each glowing body is one agent.

Idle right now. They light up when the run hits their stage.

**If it stalls:** If the canvas is a flat gradient, skip the orb line and go to architecture.

---

### [0:40] On screen: Still dashboard. Slowly point at the seven orbs, left to right.

Optional: if the tour is open, click **Next** through Coordinator → Research → Competitor → Pricing → Trends → Writer → Fact Checker, then **Finish**. Otherwise keep talking over the idle scene.

**Say:**

Here is the architecture in one breath.

A Coordinator — heavy model — plans the work.

Then four light agents run in parallel: Research, Competitor, Pricing, and Trends.

A Writer — heavy again — turns those drafts into one narrative.

A Fact Checker audits gaps and emits structured JSON.

Light models are cheap and fast. Heavy models do the judgement.

That split is how you keep quality without burning tokens on every sentence.

The left rail is the whole product: Dashboard, New research, Telemetry, Compare, Settings.

**If it stalls:** “I will skip the tour and launch a run so you can see them work.”

---

### [1:20] On screen: Click **New research** (left rail or the blue button).

Title becomes **Configure market research**. Form: **New market intelligence task**.

**Say:**

New research.

One required field: the business idea.

Optional: target location, so the market is a real geography, not “the internet”.

I am using an AI-powered specialty coffee subscription for remote workers, in Bengaluru.

Web search is on — DuckDuckGo — so the research agents have something to ground against.

In this recording I am on offline fixture mode, so the pipeline is deterministic and I am not pasting keys on camera.

**[pause — type the idea]**

Business idea: AI-powered specialty coffee subscription for remote workers.

**[pause — type the city]**

Target location: Bengaluru.

**If it stalls:** If you already typed it in rehearsal, just hover the fields and keep talking.

---

### [2:00] On screen: Click **Launch agent pipeline**.

The form should collapse into live telemetry. Do not wait for a full-page spinner — there isn’t one.

**Say:**

Launch agent pipeline.

Notice: no blocking spinner over the whole page.

The task queues, and we jump straight into live telemetry.

**If it stalls:** Count to two. If you are still on the form, say “Queuing now” and click once more only if the button is enabled.

---

### [2:10] On screen: **Pipeline telemetry**.

Point at the four stage cards: **Coordinate → Research → Synthesise → Audit**.

Then the scrubber. Then **Execution stream**.

Glance at the constellation — orbs should pulse as stages run.

**Say:**

This is the control room.

Four backend stages: Coordinate, Research, Synthesise, Audit.

Each card shows duration, tokens, and estimated cost.

I will not invent numbers — you can read the live figures as they land.

While Research is active, four light agents are working in parallel.

That is why this stage is the wide one: market, competitors, pricing, trends, at once.

The log under here is the execution stream.

It tails live. You can search it, filter by severity, and copy it.

The constellation is not decoration. Glow and pulse follow this same run state.

**[pause — let Research complete if you can; talk until Synthesise starts]**

Writer is compiling the four drafts into one executive narrative.

Then Fact Checker audits it.

**If it stalls:** “Fixture mode adds a short delay per call so you can actually see mid-run state. In production this is the same UI over a real model.”

**If the stream banner appears:** Click **Reconnect**. Say: “If the live stream drops, the UI tells you and you reconnect. Reloading mid-run also restores the task.”

---

### [4:00] On screen: When status is success, open the report.

If the app already switched to the report view, stay there. Otherwise open the completed run from the dashboard list.

Title of the report. Badge **verified**. Tabs visible.

**Say:**

Run is complete. This is the deliverable.

Not a chat transcript. A structured intelligence report.

Five tabs.

Starting with Executive Summary and strategic recommendations.

**[pause — let people read the heading, not the whole essay]**

I will not read this aloud. You would not, in a real review either.

What matters is the shape: summary a founder can skim, then evidence.

**If it stalls:** If you see **Report unavailable**, click **Try again** once. If still empty, open the run from Dashboard.

---

### [4:40] On screen: Click **Market & Competitors**.

**Say:**

Market and competitors.

Overview and trends first, then the competitive landscape.

This is the output of the light research agents, rewritten by the Writer.

---

### [5:00] On screen: Click **SWOT Analysis**.

**Say:**

SWOT.

This is usually what a stakeholder scrolls to first: strengths, weaknesses, opportunities, threats, in one place.

---

### [5:20] On screen: Click **Critique & Refinements**.

**Say:**

Critique and refinements.

The Fact Checker is not a silent formatter.

It leaves notes on gaps and what it changed.

That is the difference between “the model wrote something” and “another agent audited it”.

I am skipping Raw JSON on camera. It is there for engineers who want the schema.

---

### [5:40] On screen: Click **Read**.

Reading mode overlay. Do not scroll forever. Esc or close after ~8 seconds.

**Say:**

Reading mode.

Canvas dims. This is the print- and PDF-friendly view.

Escape closes it.

**[close reading mode]**

Copy section, shareable deep link, Markdown export, JSON export — all here.

I will export Markdown so you see it is a real file, not a screenshot workflow.

**[click Markdown, wait for the toast `Exported as markdown`]**

**If it stalls:** Skip the download. Click **Share link** instead and mention the toast.

---

### [6:20] On screen: Left rail → **Compare**.

Pick **Run A** and **Run B** (two finished topics). Wait for the side-by-side.

If you only have one run: skip to the Command Palette beat.

**Say:**

Compare.

Two completed runs, section by section.

Same product, different prompt or location — you see what changed, plus duration, tokens, and cost for each.

This is how you iterate on a brief without rereading two PDFs.

**If it stalls / only one run:** “Comparison needs two finished runs. I will show the command palette instead.” Then press **Ctrl+K**.

---

### [6:50] On screen: Click **Commands** or press **Ctrl+K**.

Palette open. Arrow through a couple of items. Esc.

**Say:**

Control-K.

New research, jump to a past run, switch theme, open settings — without the mouse.

I built the keyboard path because a control room you cannot drive from the keyboard is just a poster.

**[Esc]**

---

### [7:10] On screen: Do **not** open Settings on camera. Hover **Settings** in the rail.

**Say:**

Quick trust pass, because this is the part demos usually skip.

Settings is where you pick providers for the light tier and the heavy tier.

Ollama locally, or OpenAI, Anthropic, Gemini, DeepSeek, Qwen, Bedrock.

Keys live in this browser. The UI shows them masked. The API never echoes them back.

Session logs are written in IST, on a background thread, with secrets scrubbed.

There is a full pytest contract suite and Playwright journeys — including accessibility and a 360-pixel layout.

And the 3D scene is progressive enhancement.

No WebGL, a small phone, or reduced motion: you still get the same workflow on a static surface.

**If it stalls:** Do not open the key field “just to show masking”. Stay on this speech.

---

### [7:40] On screen: Click **Dashboard**. Let the constellation sit. Stop talking, then CTA.

**Say:**

That is the product.

One idea. A routed multi-agent pipeline. Live cost and state. A report you can export.

If you want to run it locally — including offline, with no API keys — comment **demo**.

I will drop the repo and the exact start commands.

Thanks for watching.

**[hold 2s on the dashboard, then stop recording]**

---

## 5. Click-by-click path

1. Confirm **Backend connected**, **LinkedIn demo** badge, Dark theme, **3D canvas** on.
2. Tour is already skipped on `?demo=1`.
3. **New research** — fields are prefilled. Re-type them on camera if you want the typing beat.
4. **Business idea:** `AI-powered specialty coffee subscription for remote workers`
5. **Target location:** `Bengaluru`
6. Leave **Enable web search (DuckDuckGo)** checked.
7. Do not enable API-key override.
8. **Launch agent pipeline**.
9. Watch **Coordinate → Research → Synthesise → Audit**.
10. Point at duration / tokens / cost. Point at **Execution stream**. Point at orbs.
11. Open the completed report.
12. Tabs: **Executive Summary** → **Market & Competitors** → **SWOT Analysis** → **Critique & Refinements**.
13. **Read** → close.
14. **Markdown** (or **Share link**).
15. **Compare** → Run A / Run B — or skip.
16. **Ctrl+K** → Esc.
17. Hover **Settings**. Do not paste keys.
18. **Dashboard**. End.

---

## 6. LinkedIn packaging

### Caption (paste under the video)

I built a multi-agent market-research product, not a chatbot skin.

Type a business idea and a city. Seven agents take over:

Coordinator plans the run.
Research, Competitor, Pricing, and Trends work in parallel on a light model.
Writer and Fact Checker — heavy models — synthesise and audit.

The UI is an observatory. Each agent is a live orb. You see stage time, tokens, and cost as the pipeline moves.

When it finishes you get a real report: executive summary, market and competitors, SWOT, critique notes, plus Markdown / JSON export.

I care about the unglamorous parts too. API keys are masked. Logs scrub secrets. The 3D canvas is progressive enhancement. The whole pipeline runs offline in fixture mode, and it is covered by pytest plus Playwright.

If you want to run it locally, comment **demo**.

#MultiAgent #AIEngineering #FastAPI #NextJS #BuildInPublic #MarketResearch #LLM #OpenToWork

### First line before “see more”

I built a multi-agent market-research product, not a chatbot skin.

### Thumbnail text (≤ 6 words)

Seven agents. One market report.

### Comment seeds (post these under your own video)

1. **Want the local commands?** Comment `demo` — backend on `:8000`, `MOCK_LLM=1`, no keys required.
2. **Stack:** FastAPI + LiteLLM + Next.js App Router + React Three Fiber. Light/heavy model routing is in the orchestrator, not in the prompt box.
3. **Hiring managers:** happy to walk through architecture, test gauntlet, or a live Ollama run.

### 60-second cut

| Seconds | Do | Say |
| --- | --- | --- |
| 0–10 | Dashboard | “One business idea in. A C-suite report out. Seven agents.” |
| 10–25 | New research → fill → Launch | “Idea, city, launch. No full-page spinner.” |
| 25–45 | Telemetry + orbs | “Light agents research in parallel. Heavy agents write and audit. Live tokens and cost.” |
| 45–55 | Executive Summary | “This is the deliverable — summary, SWOT, critique — not a chat log.” |
| 55–60 | Dashboard | “Comment demo for the repo.” |

---

## 7. Likely questions

**Why not one GPT call?**
A single completion hides failure and cost. This system splits cheap parallel research from expensive synthesis and audit. If Research is slow or SWOT is thin, you can see which stage did it.

**Is the 3D scene required?**
No. It is progressive enhancement. No WebGL, a narrow viewport, reduced motion, or “3D canvas” off all fall back to a static surface. The DOM UI is complete without the canvas.

**Do I need paid API keys?**
No. Run `MOCK_LLM=1` for a deterministic offline pipeline. Or use Ollama locally. Cloud providers are optional in Settings. Keys stay in the browser and are masked in logs and API responses.

**How do I run it?**
From the repo: build the frontend, then `MOCK_LLM=1 MOCK_LLM_DELAY_MS=600 py -m uvicorn backend.main:app --port 8000`. Open `http://localhost:8000`. Full steps are in `project_documentation.md`.

**Is this production-shaped or a demo toy?**
The API is contracted in pytest. Playwright covers the journey, resilience, accessibility, performance, and 360px layout. Session restore, cancel, compare, and export are real endpoints, not mocks in the client.

---

## Rehearsal notes (for you, not the camera)

- Speak slightly slower than feels natural. Clicks need air.
- Never read report paragraphs. Point, pause, tab on.
- If you forget a line, look at the stage names and say those four words: Coordinate, Research, Synthesise, Audit.
- Smile on the last sentence, then stop. Do not add “um, yeah, that’s it.”

To regenerate a shorter or audience-specific version in Copilot Chat, run `/linkedin-demo` (see `.github/prompts/linkedin-demo.prompt.md`).

To run the implemented presenter instead of only reading this file:

```bash
./start-linkedin-demo.sh
```
