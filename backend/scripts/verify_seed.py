"""Verify the planted story exists INSIDE Neo4j after loading. Run from backend/:  python -m scripts.verify_seed
Compares live Cypher results with data/expected_insights.json (produced by the reference engine)."""
import json
import sys
from datetime import datetime, time, timedelta, timezone

from neo4j import GraphDatabase

from app import config

EXP = json.loads((config.ROOT / "data" / "expected_insights.json").read_text())
RISK = """
MATCH (s:Service)
OPTIONAL MATCH (d:Service)-[:DEPENDS_ON*1..]->(s)
WITH s, count(DISTINCT d) AS fan_in
OPTIONAL MATCH (i:Incident)-[:ORIGINATED_IN]->(s) WHERE i.started_at >= datetime($since)
WITH s, fan_in, count(DISTINCT i) AS inc
RETURN s.name AS service, fan_in, inc, fan_in + 3*inc AS risk ORDER BY risk DESC, service LIMIT 5"""
FIXSTAT = """
MATCH (i:Incident)-[:ORIGINATED_IN]->(:Service {name:$svc}), (i)-[:HAD_ATTEMPT]->(a:Attempt)-[:USED]->(:Fix {id:$fix})
RETURN count(a) AS attempts, sum(CASE WHEN a.status='SUCCESS' THEN 1 ELSE 0 END) AS successes"""
OWNER = """
MATCH (e:Engineer)-[o:OWNS]->(:Service {name:$svc})
WHERE o.valid_from <= date($on) AND (o.valid_to IS NULL OR date($on) <= o.valid_to)
RETURN e.name AS owner"""


def main():
    drv = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD))
    ok = True

    def check(label, got, want):
        nonlocal ok
        good = got == want
        ok &= good
        print(("PASS " if good else "FAIL ") + label + ("" if good else f"  got={got} want={want}"))

    with drv.session(database=config.NEO4J_DATABASE) as s:
        as_of = datetime.fromisoformat(EXP["as_of"]).date()
        since = (datetime.combine(as_of, time.min, tzinfo=timezone.utc) - timedelta(days=EXP["window_days"])).isoformat()
        rows = s.run(RISK, since=since).data()
        check("top-5 risk services", [r["service"] for r in rows], [r["service"] for r in EXP["risk_top"]])
        check("top-5 risk scores", [r["risk"] for r in rows], [r["risk_score"] for r in EXP["risk_top"]])
        for fix, want in EXP["fix_stats_payments_api"].items():
            r = s.run(FIXSTAT, svc="payments-api", fix=fix).single()
            check(f"payments-api {fix} attempts/successes", (r["attempts"], r["successes"]), (want["attempts"], want["successes"]))
        for c in EXP["owner_checks"]:
            r = s.run(OWNER, svc=c["service"], on=c["on"]).single()
            check(f"owner {c['service']} on {c['on']}", r and r["owner"], c["owner"])
    drv.close()
    print("\nALL GOOD" if ok else "\nMISMATCHES FOUND")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
