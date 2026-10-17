# AGENTS.md — rules for AI coding agents (Antigravity etc.) working on Déjà

**What this is:** Déjà, an on-call incident copilot with institutional memory, built on Neo4j for the Neo4j × hackFront Graph Builder Build Sprint (Bengaluru, 17 Oct 2026, **submission closes 4:30 PM IST**). Judges score: problem solving, technical implementation, *effective use of Neo4j*, innovation, practical applicability. They want graph-derived insight, not "an app with a database attached".

**Pitch:** teams keep re-learning what the organisation already knew. Déjà turns incidents, deploys, services, owners and fixes into a graph that surfaces hidden risk and recalls what worked, what failed, and what was true at any date.

## Already DONE — do not redo or change
- `backend/app/schemas.py` = the **frozen API contract**. `contract/openapi.json`, `frontend/src/api/{types,client}.ts` derive from it. **Never edit schemas/endpoints to suit your implementation.** If you believe the contract is wrong, stop and say so.
- `data/seed.json` + `scripts/generate_seed.py` + `data/expected_insights.json`: seed data with a *planted story* (payments-api is the hidden #1 risk; restart-pods fails, rollback works; ownership time travel). Don't regenerate with different numbers; `tests/test_seed_story.py` guards it.
- `backend/app/mock_engine.py`: in-memory **reference implementation** of every endpoint. It defines correct behaviour and scoring (see `docs/API_CONTRACT.md` → Scoring rules).
- `scripts/load_seed.py` (Neo4j loader), `scripts/verify_seed.py`, `data/schema.cypher`.

## Still TO DO (see `docs/TASKS.md` for ready prompts)
T1 `Neo4jEngine` · T2 LLM chat agent · T3 frontend · T4 demo polish + submission.

## Commands (run from `backend/`)
```
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000          # MODE=mock by default; MODE=live uses Neo4j
python -m pytest -q                                 # must stay green; parity tests auto-enable when NEO4J_URI is set
python -m scripts.load_seed --wipe                  # load seed into Neo4j
python -m scripts.verify_seed                       # check the planted story inside Neo4j
python -m scripts.export_contract                   # only if the contract changed on purpose
```
Rehearsal clock: `DEJA_FIXED_NOW=2026-10-17T07:00:00Z` (the "recent deploy" window is 168h; v2.3.1 was deployed 2026-10-14).

## Rules
1. Keep `MODE=mock` working at all times — it is the fallback if Aura or wifi dies during the demo.
2. Neo4j must do the real work: traversal, aggregation, temporal queries run in Cypher, not in Python loops over fetched rows. Parametrised Cypher only; never f-string user input into queries (interpolate only validated ints for variable-length bounds).
3. Chat/LLM agent must answer from tool results (Engine methods), never invent incidents, fixes or owners. If the LLM is unavailable, fall back to the rule-based `handle_chat`.
4. Any behaviour change must keep `tests/` green. Add tests, never loosen them.
5. Time-box: P0 first (risk map, alert flow, outcome memory, wipe-and-recall), then P1 (time travel), then P2 (vector similarity, multilingual input). Cut P2 without guilt.
6. Don't commit secrets. `.env` is git-ignored.

## The demo (what every decision should serve)
1. Risk map highlights the hidden single point of failure (payments-api: tier-2, #6 by fan-in, #1 by incidents → #1 by risk).
2. "checkout latency is spiking" → upstream path lights up → payments-api + deploy v2.3.1 by Asha → past similar incidents → "rollback worked 4/4, restart failed 4/4 — avoid".
3. "I restarted, still failing" → FAILED attempt stored → next best fix.
4. Wipe session → "it's back" → agent recalls the open incident from the graph.
5. "payments-api is now owned by Ravi" → "who owned it in July?" → Asha (temporal supersede).
