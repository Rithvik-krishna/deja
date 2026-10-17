# Task board + ready-to-paste Antigravity prompts

Start every Antigravity session with: *"Read AGENTS.md, docs/API_CONTRACT.md and docs/GRAPH_MODEL.md first. The contract is frozen."*
Suggested owners: **T1 Backend A**, **T2 Backend B**, **T3 Frontend**. T1 and T3 are independent from minute zero (frontend uses `MODE=mock`).

| # | Task | Priority | Done when |
|---|---|---|---|
| T0 | Aura instance up, `.env` filled, `load_seed --wipe` + `verify_seed` all PASS | P0, first 20 min | verify prints ALL GOOD |
| T1 | `Neo4jEngine` (all methods) | P0 | `pytest` with `NEO4J_URI` set: parity tests pass; `MODE=live` passes the demo script |
| T2 | LLM tool-calling chat agent | P0 | demo script via `/chat` works in live mode with LLM; falls back to rule-based |
| T3 | Frontend (risk map, alert+chat, graph panel, timeline, time travel, demo controls) | P0 | demo script runs with mouse only against mock AND live |
| T4 | Demo polish, README, rubric slide, 2-min backup video, submit by 4:10 PM | P0 | submitted |
| P2 | Vector similarity, multilingual input (Sarvam), MCP exposure | only if ahead | — |

## T1 prompt — Neo4jEngine
> Implement every `TODO` method of `backend/app/neo4j_engine.py` so it returns exactly what `backend/app/mock_engine.py` returns (same Pydantic models from `schemas.py`, same scoring formulas from docs/API_CONTRACT.md, same ordering and rounding). Use parametrised Cypher run through `self._run`; do traversal/aggregation/temporal logic in Cypher (reference queries in docs/GRAPH_MODEL.md — they are untested, fix them as needed). Build `GraphPayload`s with the same node/edge ids and `highlight` semantics as the mock. Write paths (`create_alert`, `record_outcome`, `reassign`) must be single transactions. Use `now()` from `app/clock.py` for time. Do not modify `schemas.py`, `mock_engine.py`, the seed, or existing tests. Prove it: `python -m scripts.load_seed --wipe && python -m scripts.verify_seed && NEO4J_URI=... python -m pytest -q` must pass, and `MODE=live` + the demo script in AGENTS.md must work through the API.

## T2 prompt — LLM chat agent
> Replace the body of `handle_chat` in `backend/app/chat.py` with an LLM tool-calling agent (Anthropic API, model from env; fallback to the existing rule-based logic if no key or the call fails/times out in 8s). Tools = thin wrappers over `Engine` methods: create_alert, record_outcome, list_open_incidents, get_incident, similar_incidents, fix_stats, owner, reassign, blast. The system prompt must: answer only from tool results, never invent incidents/fixes/owners, warn when a fix is `avoid`, and on a vague message like "it's back" call list_open_incidents first (graph memory, not chat history). Keep `ChatRequest/ChatResponse` unchanged: fill `tool_calls`, `recalled` (facts recovered from the graph), `incident_id`, and `graph` (the graph from the most relevant tool result). Session short-term state stays in `SESSIONS` so `/sessions/wipe` still clears it. Add tests that run with the LLM stubbed.

## T3 prompt — Frontend
> Create a Vite + React + TypeScript app in `frontend/` (keep `src/api/types.ts` and `client.ts` untouched; import `api` from `./api/client`). Layout: left = chat (with a visible 'tool calls' strip and a 'recalled from graph memory' chip list), centre = interactive graph (use `@neo4j-nvl/react` or `react-force-graph-2d`) rendering any `GraphPayload`: colour by `label`, size Service nodes by `score`, thicker/glowing when `highlight`, edge `ATTEMPTED` coloured green/red by `props.status`. Right = tabs: **Risk** (table from `api.risk()`, click a row → `api.blast(service)` shown on the graph), **Incident** (selected incident detail + `api.timeline`), **Owners** (service dropdown + date picker → `api.owner`, 'reassign' form, history list). Top bar: 'Wipe session' (calls `api.wipeSession` and clears local chat), 'Reset demo' (`api.resetDemo`), and a 'Run scripted demo' button that sends the 5 demo messages from AGENTS.md with 2s pauses. Dark, clean, projector-friendly (large type). It must work against `MODE=mock` first; nothing may depend on Neo4j directly.

## T4 checklist
README with architecture diagram + the graph model; slide mapping the demo to the 5 judging criteria; record a 2-min screen capture as a safety net; submit by 4:10 PM IST.
