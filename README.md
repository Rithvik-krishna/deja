# Déjà — On-Call Incident Copilot with Institutional Memory

> *"Teams keep re-learning what the organisation already knew."*
> Déjà turns incidents, deploys, services, owners and fixes into a graph that surfaces hidden risk and recalls what worked, what failed, and what was true at any date.

Built for the **Neo4j × hackFront Graph Builder Sprint** — Bengaluru, 17 Oct 2026.

---

## What Déjà does

| Signal | What Déjà surfaces |
|---|---|
| A new alert fires | Traces the upstream blast radius, finds the likely guilty deploy, recalls past similar incidents and their fix outcomes |
| "checkout latency is spiking" | Lights up `payments-api` as the hidden single point of failure (#6 by fan-in, #1 by risk score) |
| You try a fix | Stores the attempt in the graph; warns you if the fix has a 0% success rate on this service |
| "I restarted, still failing" | Records the FAILED attempt, recommends the next-best fix (rollback, historically 4/4 successes) |
| Session wiped — "it's back" | Agent recalls the open incident from the graph, not from chat history |
| "who owned payments-api in July?" | Time-travel ownership: `Asha` (before `Ravi` took over) |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend (Vite + React + TS)          │
│  Chat panel │ Interactive graph (NVL / force-graph)          │
│  Risk table │ Incident detail │ Owners + time travel         │
└──────────────────────────┬──────────────────────────────────┘
                           │ REST  (OpenAPI contract frozen)
┌──────────────────────────▼──────────────────────────────────┐
│                   Backend  (FastAPI / Python)                 │
│                                                              │
│   api.py  →  Engine interface  →  MockEngine  (always works) │
│                              ↘  Neo4jEngine  (MODE=live)     │
│                                                              │
│   chat.py  →  LLM tool-calling agent (Anthropic)            │
│              ↘  rule-based fallback (no key / timeout)       │
└──────────────────────────┬──────────────────────────────────┘
                           │ Bolt / Cypher
┌──────────────────────────▼──────────────────────────────────┐
│              Neo4j Aura  (graph database)                     │
│                                                              │
│  Service ──DEPENDS_ON──▶ Service                             │
│  Engineer ──OWNS(temporal)──▶ Service                        │
│  Deploy ──TO──▶ Service ; ──AUTHORED_BY──▶ Engineer          │
│  Incident ──ORIGINATED_IN / IMPACTED / FOLLOWED──▶ ...       │
│  Incident ──HAD_ATTEMPT──▶ Attempt ──USED──▶ Fix             │
└─────────────────────────────────────────────────────────────┘
```

---

## Graph model

```cypher
(:Service {id, name, tier, team, description})-[:DEPENDS_ON]->(:Service)
(:Engineer {id, name, team})-[:OWNS {valid_from, valid_to?}]->(:Service)
(:Deploy {id, version, deployed_at, notes})-[:TO]->(:Service)
(:Deploy)-[:AUTHORED_BY]->(:Engineer)
(:Incident {id, title, severity, symptom, status, started_at, resolved_at?})
   -[:ORIGINATED_IN]->(:Service)
   -[:IMPACTED]->(:Service)
   -[:FOLLOWED]->(:Deploy)
   -[:HAD_ATTEMPT]->(:Attempt {id, status, ts, notes})
      -[:USED]->(:Fix {id, name, description, category})
      -[:BY]->(:Engineer)
(:Incident)-[:SIMILAR_TO {score}]->(:Incident)
```

Key design choices:
- **`Service.id == Service.name`** — services are addressed by name throughout.
- **Ownership is temporal** — `OWNS` has `valid_from`/`valid_to`; reassigns append a new edge, never overwrite.
- **Attempts are first-class nodes** — every fix trial is stored with its outcome, enabling the success/failure memory.
- **`SIMILAR_TO` is precomputed** — same origin + symptom; vector similarity is an optional P2 extension.

---

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Liveness, mode, Neo4j status |
| GET | `/catalog` | Services (+ current owner), fixes, engineers, symptoms |
| POST | `/demo/reset` | Reload seed data, clear chat sessions |
| GET | `/graph/risk` | Risk-ranked service graph (hidden SPOFs) |
| GET | `/graph/blast/{service}` | Blast radius + recent deploys |
| GET | `/insights/similar-incidents` | Past incidents like this one + fix attempts |
| GET | `/insights/fix-stats` | Per-fix success rates for a service/symptom |
| GET | `/owner` | Time-travel: who owned a service on a given date |
| POST | `/owner` | Reassign ownership (temporal supersede) |
| POST | `/alert` | Open incident, trace suspects, recommend fixes |
| POST | `/outcome` | Record fix attempt SUCCESS/FAILED |
| GET | `/incidents` | List open/resolved incidents |
| GET | `/incidents/{id}` | Incident detail + attempts + graph |
| GET | `/incidents/{id}/timeline` | Deploy → opened → attempts → resolved |
| POST | `/chat` | One chat turn; `recalled[]` = facts from graph memory |
| POST | `/sessions/wipe` | Clear short-term chat state (graph is permanent) |

Full spec: [`contract/openapi.json`](contract/openapi.json) · Example responses: [`contract/examples/`](contract/examples/)

---

## Risk scoring

```
risk_score = transitive_dependents + 3 × incidents_in_window
```

`fan_in_rank` and `incident_rank` are independent ordinal ranks.
The graph traversal (`DEPENDS_ON*1..`) and aggregation run entirely in Cypher — not Python loops.

---

## Quickstart

### Prerequisites
- Python 3.11+
- Node 20+ (for frontend)
- A Neo4j Aura instance (free tier works) — or run in `MODE=mock` without one

### 1. Clone & install

```bash
git clone https://github.com/Rithvik-krishna/deja.git
cd deja/backend
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in NEO4J_URI, NEO4J_USER, NEO4J_PASSWORD, ANTHROPIC_API_KEY
```

### 3. Load seed data into Neo4j

```bash
python -m scripts.load_seed --wipe   # loads the planted story
python -m scripts.verify_seed        # must print ALL GOOD
```

### 4. Run the backend

```bash
# Mock mode (no Neo4j needed — always works)
uvicorn app.main:app --reload --port 8000

# Live mode (requires Neo4j + .env)
MODE=live uvicorn app.main:app --reload --port 8000
```

### 5. Run the frontend

```bash
cd ../frontend
npm install
npm run dev
```

### 6. Run tests

```bash
cd backend
python -m pytest -q                          # mock-mode tests (always)
NEO4J_URI=bolt://... python -m pytest -q     # + Neo4j parity tests
```

---

## Demo script (the 5-step story)

| Step | Input | What the graph reveals |
|---|---|---|
| 1 | Open risk map | `payments-api`: tier-2, #6 fan-in, #1 risk score — hidden SPOF |
| 2 | "checkout latency is spiking" | Upstream path → `payments-api` → deploy `v2.3.1` by Asha → similar incidents |
| 3 | Agent recommends rollback | Fix stats: rollback ✅ 4/4, restart ❌ 0/4 — avoid restart |
| 4 | "I restarted, still failing" | FAILED attempt stored → next-best fix surfaced from graph |
| 5 | Wipe session → "it's back" | Agent recalls the open incident from the graph, not chat history |
| Bonus | "who owned payments-api in July?" | Time travel → Asha (before Ravi's reassignment) |

---

## Project structure

```
deja/
├── backend/
│   ├── app/
│   │   ├── api.py            # FastAPI routes
│   │   ├── chat.py           # LLM tool-calling agent + rule-based fallback
│   │   ├── clock.py          # Controlled clock (DEJA_FIXED_NOW for demo)
│   │   ├── config.py         # Settings (MODE, env vars)
│   │   ├── deps.py           # Dependency injection
│   │   ├── engine.py         # Abstract Engine interface
│   │   ├── mock_engine.py    # In-memory reference implementation (frozen)
│   │   ├── neo4j_engine.py   # Neo4j implementation (T1)
│   │   └── schemas.py        # Pydantic models — frozen API contract
│   ├── scripts/
│   │   ├── load_seed.py      # Loads data/seed.json into Neo4j
│   │   ├── verify_seed.py    # Validates the planted story
│   │   ├── generate_seed.py  # (Do not re-run — seed is frozen)
│   │   └── export_contract.py
│   ├── tests/
│   │   ├── test_contract.py       # OpenAPI drift detection
│   │   ├── test_seed_story.py     # Guards the planted story
│   │   └── test_parity_neo4j.py  # Mock vs. live parity (auto-enables with NEO4J_URI)
│   └── requirements.txt
├── contract/
│   ├── openapi.json          # Exported API spec (frozen)
│   └── examples/             # Real example responses for every endpoint
├── data/
│   ├── seed.json             # The planted incident story (frozen)
│   ├── schema.cypher         # Neo4j constraints + indexes
│   └── expected_insights.json
├── docs/
│   ├── API_CONTRACT.md       # Scoring rules + endpoint spec
│   ├── GRAPH_MODEL.md        # Cypher model + reference queries
│   └── TASKS.md              # Task board + agent prompts
├── frontend/
│   └── src/api/
│       ├── client.ts         # Typed API client (frozen)
│       └── types.ts          # Generated TS types (frozen)
├── AGENTS.md                 # Rules for AI coding agents
└── .env.example
```

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `MODE` | `mock` | `mock` (in-memory) or `live` (Neo4j) |
| `NEO4J_URI` | — | `bolt://` or `neo4j+s://` URI |
| `NEO4J_USER` | `neo4j` | Database username |
| `NEO4J_PASSWORD` | — | Database password |
| `ANTHROPIC_API_KEY` | — | For the LLM chat agent (optional; falls back to rule-based) |
| `DEJA_FIXED_NOW` | system time | Pin the clock for demos: `2026-10-17T07:00:00Z` |

---

## Judging criteria mapping

| Criterion | How Déjà addresses it |
|---|---|
| **Problem solving** | Addresses the real pain of institutional amnesia in on-call rotations |
| **Technical implementation** | FastAPI + Neo4j + LLM tool-calling; typed contract enforced by tests |
| **Effective use of Neo4j** | All traversal/aggregation/temporal logic runs in Cypher; Python only builds response objects |
| **Innovation** | Temporal ownership graph + fix outcome memory + time-travel queries |
| **Practical applicability** | Works with `MODE=mock` offline; drop-in for any team's incident workflow |

---

## Contributing / Agent rules

See [`AGENTS.md`](AGENTS.md) for the full rules governing AI agents working on this repo.
The API contract (`schemas.py` → `contract/openapi.json`) is **frozen** — do not edit it without explicit approval.

---

*Déjà — because your org has seen this before.*
