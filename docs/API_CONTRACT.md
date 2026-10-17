# Déjà API contract (FROZEN)

Source of truth = `backend/app/schemas.py` → exported to `contract/openapi.json` → TS types in `frontend/src/api/types.ts`.
Real example responses for every endpoint: `contract/examples/*.json`. `tests/test_contract.py` fails if the exported OpenAPI drifts from the code.

**Changing the contract** = edit `schemas.py` → `python -m scripts.export_contract` → regenerate TS types → tell the other two people. Don't do it casually.

## Conventions
- Timestamps `2026-10-14T04:50:00Z` (UTC, `Z`). Dates `YYYY-MM-DD`. Services by `name` (`payments-api`), incidents `INC-044`, fixes `rollback-deploy`.
- Graph payload (`GraphPayload`) is what the frontend renders: nodes `{id,label,name,props,highlight,score}`, edges `{id,source,target,type,props,highlight}`.
  Node ids: `svc:` `eng:` `dep:` `inc:` `fix:` + native id. Edge id `source|TYPE|target`. `highlight=true` ⇒ draw emphasised (the reasoning path).
  `ATTEMPTED` is a *collapsed display edge* (Incident→Fix, `props.status`); in Neo4j it is Incident-[:HAD_ATTEMPT]->Attempt-[:USED]->Fix.
- Errors: `404 {detail}` unknown service/incident/fix/engineer · `400` bad request · `422` validation · `501` not implemented yet.
- Both engines (`MODE=mock|live`) must return identical shapes, numbers and ordering.

## Endpoints
| Method | Path | Purpose | Returns |
|---|---|---|---|
| GET | `/health` | liveness, mode, neo4j up | `Health` |
| GET | `/catalog` | dropdown data: services(+current owner), fixes, engineers, symptoms | `Catalog` |
| POST | `/demo/reset` | reload seed, clear chat sessions | `DemoResetResponse` |
| GET | `/graph/risk?window_days=180&limit=10&as_of=` | **hidden single points of failure** + whole service graph (scores on nodes) | `RiskResponse` |
| GET | `/graph/blast/{service}?depth=3` | everything that depends on `service` (reverse closure) + its recent deploys | `BlastResponse` |
| GET | `/insights/similar-incidents?service=&symptom=&origin=&limit=` | past incidents like this one, with why + attempts | `SimilarIncident[]` |
| GET | `/insights/fix-stats?service=&symptom=` | per-fix attempts/successes for incidents *originating* in `service` | `FixStat[]` |
| GET | `/owner?service=&date=` | **time travel**: who owned it on `date` (default today) + history | `OwnerResponse` |
| POST | `/owner` | reassign; supersedes (never overwrites) the open ownership | `ReassignResponse` |
| POST | `/alert` | open an incident, trace upstream suspects, recommend fixes | `AlertResponse` |
| POST | `/outcome` | record a fix attempt SUCCESS/FAILED (SUCCESS resolves the incident) | `OutcomeResponse` |
| GET | `/incidents?status=open\|resolved` | list, newest first | `IncidentSummary[]` |
| GET | `/incidents/{id}` | detail + attempts + graph | `IncidentDetail` |
| GET | `/incidents/{id}/timeline` | deploy → opened → attempts → resolved | `TimelineEvent[]` |
| POST | `/chat` | one chat turn; `recalled[]` = facts recovered from graph memory | `ChatResponse` |
| POST | `/sessions/wipe` | clears short-term chat state only (graph stays) | `WipeResponse` |

## Scoring rules (part of the contract — both engines must implement exactly this)
- **Transitive dependents** of S = distinct services that can reach S via `DEPENDS_ON*1..`. `direct_dependents` = hops 1.
- **risk_score** = `transitive_dependents + 3 × incidents_originated(window)`; window = incidents with `started_at >= as_of − window_days`. Sort by score desc, then name. `fan_in_rank` / `incident_rank` are ordinal ranks by each component alone (tie → name).
- **Suspects** (for an alert on service S, symptom X; "now" = server clock): candidates = S (hops 0) ∪ upstream deps within 3 hops.
  `score = 3·(has deploy in last 168h) + same_symptom_incidents + 1/(hops+1)` where `same_symptom_incidents` = past incidents with `origin = candidate`, `symptom = X`, and (candidate = S or S ∈ impacted). Top 5, score desc then name. `likely_origin` = first.
- **Similar incidents** score: `+0.35` same symptom · `+0.45` origin = service (else `+0.30` if service ∈ impacted) · `+0.30` origin = `origin` param (≠ service). Cap 1.0, round 2dp, keep ≥ 0.5, sort score desc then newest first.
- **FixStat**: `success_rate = successes/attempts` (3dp), `smoothed_score = (s+1)/(a+2)` (3dp), `avoid = attempts>=3 and successes==0`.
- **Recommendations** (alert/outcome): stats for (origin, symptom); fallback (origin) then (symptom). Sort: not-already-failed-here, not-avoid, smoothed desc, name. Max 6.
- **Alert side-effects**: creates `Incident{status:open, origin=likely_origin, impacted=[S]}`, links `FOLLOWED` to the most recent deploy of the likely origin in the window. **Outcome**: adds an Attempt; `SUCCESS` ⇒ incident `resolved`.
- **Reassign**: set `valid_to = effective_date − 1 day` on the open `OWNS`, create a new `OWNS{valid_from=effective_date}`. History is append-only.
