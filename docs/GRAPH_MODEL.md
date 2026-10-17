# Graph model

```
(:Service {id,name,tier,team,description})-[:DEPENDS_ON]->(:Service)
(:Engineer {id,name,team})-[:OWNS {valid_from: date, valid_to?: date}]->(:Service)     // temporal; absent valid_to = current
(:Deploy {id,version,deployed_at,notes})-[:TO]->(:Service) ; (:Deploy)-[:AUTHORED_BY]->(:Engineer)
(:Incident {id,title,severity,symptom,status,summary,started_at,resolved_at?})
   -[:ORIGINATED_IN]->(:Service)      // root cause (hypothesised on open incidents)
   -[:IMPACTED]->(:Service)           // where it hurt
   -[:FOLLOWED]->(:Deploy)            // suspected change
   -[:HAD_ATTEMPT]->(:Attempt {id,status:'SUCCESS'|'FAILED',ts,notes})-[:USED]->(:Fix {id,name,description,category})
                                                        (:Attempt)-[:BY]->(:Engineer)
(:Incident)-[:SIMILAR_TO {score}]->(:Incident)          // precomputed (same origin + symptom); vector similarity = optional P2
(:Session {id})-[:DISCUSSED]->(:Incident)               // optional: chat → graph link
```
`Service.id == Service.name`. Constraints/indexes: `data/schema.cypher` (the loader also applies them).
Load: `python -m scripts.load_seed [--wipe]` → check: `python -m scripts.verify_seed` (compares against `data/expected_insights.json`).

## Reference Cypher (starting points — NOT yet run against a live DB; `tests/test_parity_neo4j.py` is the judge)
Variable-length bounds can't be parameters: validate the int and interpolate it into the string.

```cypher
// risk (see scripts/verify_seed.py for the full query)
MATCH (s:Service) OPTIONAL MATCH (d:Service)-[:DEPENDS_ON*1..]->(s)
WITH s, count(DISTINCT d) AS fan_in
OPTIONAL MATCH (i:Incident)-[:ORIGINATED_IN]->(s) WHERE i.started_at >= datetime($since)
WITH s, fan_in, count(DISTINCT i) AS inc RETURN s.name, fan_in, inc, fan_in + 3*inc AS risk ORDER BY risk DESC, s.name

// blast radius with hop count (depth interpolated)
MATCH (s:Service {name:$service}) MATCH (d:Service) WHERE d <> s
MATCH p = shortestPath((d)-[:DEPENDS_ON*1..3]->(s)) RETURN d.name AS service, length(p) AS hops ORDER BY hops, service

// owner on a date
MATCH (e:Engineer)-[o:OWNS]->(:Service {name:$svc})
WHERE o.valid_from <= date($on) AND (o.valid_to IS NULL OR date($on) <= o.valid_to) RETURN e.name

// reassign (supersede, never overwrite) — run in ONE transaction
MATCH (:Engineer)-[cur:OWNS]->(s:Service {name:$svc}) WHERE cur.valid_to IS NULL
SET cur.valid_to = date($eff) - duration('P1D')
WITH DISTINCT s MATCH (e:Engineer {id:$eng}) CREATE (e)-[:OWNS {valid_from: date($eff)}]->(s)

// fix stats for incidents originating in a service (+ optional symptom filter)
MATCH (i:Incident)-[:ORIGINATED_IN]->(:Service {name:$svc})
WHERE $symptom IS NULL OR i.symptom = $symptom
MATCH (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(f:Fix)
RETURN f.id AS fix, count(a) AS attempts, sum(CASE a.status WHEN 'SUCCESS' THEN 1 ELSE 0 END) AS successes

// suspects: upstream candidates + recent deploys (then score in Python per API_CONTRACT.md)
MATCH (s:Service {name:$svc})
OPTIONAL MATCH p = shortestPath((s)-[:DEPENDS_ON*1..3]->(c:Service))
OPTIONAL MATCH (d:Deploy)-[:TO]->(c) WHERE d.deployed_at >= datetime($now) - duration('PT168H') AND d.deployed_at <= datetime($now)
RETURN c.name, length(p) AS hops, collect(d.id) AS deploys
```
Write path for `/alert`: create `Incident` (+`ORIGINATED_IN` likely origin, `IMPACTED` service, `FOLLOWED` latest recent deploy) in one transaction. `/outcome`: create `Attempt` + `HAD_ATTEMPT`/`USED`/`BY`; on SUCCESS set `status='resolved'`, `resolved_at`.
