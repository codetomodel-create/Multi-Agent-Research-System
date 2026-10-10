# CHANGELOG.md — Agent knowledge base

History of changes to `.github/CLAUDE.md` and `.github/agent/*`. One line per edit, newest first.
Format: `YYYY-MM-DD — <file> — <what changed and why>`.

This tracks **documentation state**, not product releases. Product history lives in git.

---

## 2026-08-01

- `.github/CLAUDE.md` — Created. Repository identity, verified technology stack, structure and entry points, development workflow with commands verified on this workstation, mandatory 12-step agent workflow, knowledge-base usage table, and repository-specific coding standards (naming, module boundaries, error handling, logging, config/secrets, async/threading, frontend, testing, documentation).
- `.github/agent/MEMORY.md` — Created. Invariants, runtime behaviour, gotchas, security debt and the local environment snapshot, each with a source file.
- `.github/agent/ARCHITECTURE.md` — Created. Layer responsibilities, full HTTP surface, request-flow and pipeline diagrams, configuration resolution, concurrency/blocking model, observability, frontend architecture, build/deployment, and known architectural gaps.
- `.github/agent/ENTITIES.md` — Created. Pydantic request models, `BusinessReport` contract with its change protocol, on-disk artefacts, configuration keys, agent roster, enumerations, browser storage keys, in-memory registries.
- `.github/agent/KNOWLEDGE_GRAPH.md` — Created. Node inventory, typed edges (imports/defines/reads/writes/calls/validates), mermaid graph, and an impact-analysis table for blast-radius lookups.
- `.github/agent/ERROR_LOG.md` — Created. Entry template, the Windows `python`-not-on-PATH finding, and thirteen latent defects verified by inspection (L1–L13), including the unvalidated `task_id` filesystem path issue, the undeclared `httpx`/`boto3` dependencies, and the dead `*_api_api_key` credential lookups.
- `.github/agent/DECISIONS.md` — Created. ADR-001…ADR-012 covering single-container deployment, mock mode, report coercion/fallback, error-channel split, cooperative cancellation, SSE-with-polling-fallback, filesystem persistence, packed Bedrock credentials, LiteLLM abstraction, light/heavy tiering, YAML-hosted prompts, and this knowledge system.
- `.github/agent/TASK_STATE.md` — Created. Idle marker, copy-ready task template, and maintenance rules.
- `.github/agent/VALIDATION.md` — Created. Sixteen verified commands (Windows + POSIX), change-type → validation matrix, manual UI checklist, and result-reporting rules.
- `.github/agent/CHANGELOG.md` — Created (this file).

Scope note: no application code, configuration or dependency was modified in this change. Pre-existing `frontend/AGENTS.md` and `frontend/CLAUDE.md` were left untouched and are referenced as authoritative for Next.js 16 specifics.
