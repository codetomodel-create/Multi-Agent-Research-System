# Product walkthrough video

`walkthrough.mp4` is a narrated, self-explanatory introduction to MarketAgent
Observatory. It is produced automatically from the real application running in
fixture mode, so it always reflects the current UI.

| File | Purpose |
| --- | --- |
| `walkthrough.mp4` | Full video: 1440×900, H.264 + AAC narration, ~11 min |
| `walkthrough.vtt` | WebVTT captions (load as a subtitle track, or for accessibility) |
| `WALKTHROUGH_SCRIPT.md` | Timestamped narration script, usable as a written guide |

## Chapters

1. **Welcome** — what the product does, key objectives, who uses it
2. **First visit** — the guided tour and the seven agents
3. **Dashboard** — left rail, workspace stats, research history and its actions
4. **Settings** — light vs heavy model tiers, providers, API keys, Test connection
5. **New research** — the form, a real-world example, web search and key override
6. **Telemetry** — the four pipeline stages, live cost, execution stream, Cancel run
7. **Report** — every tab, what each one is for, export / share / reading mode
8. **Telemetry replay** — reviewing a finished run with the scrubber
9. **Compare** — diffing two studies side by side
10. **Power features** — command palette (Ctrl K), themes, 3D canvas toggle
11. **Tips & best practices**, then a **summary** of the complete process

## Regenerating

From `frontend/` (Windows; Node 18+, Python with backend deps, Playwright
browsers installed via `npx playwright install chromium`):

```bash
npm run video:walkthrough
```

Narration uses the built-in Windows speech engine (`Microsoft Zira Desktop` by
default). Audio muxing needs a full ffmpeg build with `libx264` and `aac`; set
`FFMPEG=<path>` or `npm i -D ffmpeg-static`. Without one, a silent `.webm` plus
captions is produced.

Useful environment variables:

| Variable | Effect |
| --- | --- |
| `WALKTHROUGH_FAST=1` | No narration holds — quick smoke run to validate the journey |
| `WALKTHROUGH_REUSE_AUDIO=1` | Skip TTS and reuse the previous WAVs |
| `WALKTHROUGH_VOICE` / `WALKTHROUGH_RATE` | Pick another installed voice / speaking rate (−10…10) |
| `MOCK_LLM_DELAY_MS` | Per-stage delay of the fixture pipeline (default 15000) |

To change what is said or shown, edit `frontend/scripts/walkthrough/narration.mjs`
(script and callouts) and `record.mjs` (UI actions per segment).
