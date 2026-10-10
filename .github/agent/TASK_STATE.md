# TASK_STATE.md

Working state for the task currently in flight. Create/overwrite this file **before** editing code (step 5 of the workflow in `.github/CLAUDE.md`), keep it current at each milestone, and clear it back to the idle marker when the task is done.

---

## Current task

**Status:** IDLE — no task in progress.

_Last completed:_ 2026-08-01 — bootstrap of the `.github` agent knowledge system (see `CHANGELOG.md`).

---

## Template — copy the block below when starting a task

```markdown
## Current task

- **Status:** IN PROGRESS
- **Started:** YYYY-MM-DD
- **Goal:** one sentence, testable
- **Requested by:** user request / follow-up / error-log item Lx

### Blast radius (from KNOWLEDGE_GRAPH.md §4)
- Modules:
- Entities / schema:
- Endpoints:
- Prompts / config:
- UI:
- Docs to update:

### Plan
1. [ ] step
2. [ ] step
3. [ ] step

### Progress log
- YYYY-MM-DD HH:MM — what was done, what it proved

### Validation plan (from VALIDATION.md)
| Command | Why | Result |
| --- | --- | --- |
|  |  | not run |

### Blockers / open questions
- none

### Risks accepted
- none
```

---

## Rules

1. Fill the blast radius **before** writing code; if it is empty, the repository was not inspected.
2. One task in flight at a time. Nested sub-tasks go in the plan list, not in a second block.
3. Record a validation result as `pass` / `fail` / `not run` — never assume.
4. On failure, add an `ERROR_LOG.md` entry and link it here.
5. On completion: verify every plan item is checked, ensure `MEMORY.md` / `ENTITIES.md` / `ARCHITECTURE.md` / `KNOWLEDGE_GRAPH.md` / `CLAUDE.md` reflect any new knowledge, add a `CHANGELOG.md` line, then reset this file to the idle marker.
