"""Load data/seed.json into Neo4j (idempotent MERGE). Run from backend/:

    python -m scripts.load_seed            # load / refresh
    python -m scripts.load_seed --wipe     # delete Deja labels first (Service, Engineer, ...), then load
    python -m scripts.load_seed --print-schema > ../data/schema.cypher

Only touches the labels listed in LABELS, so it is safe on a shared Aura instance."""
import argparse
import json

from app import config

LABELS = ["Service", "Engineer", "Deploy", "Incident", "Fix", "Attempt", "Session"]

CONSTRAINTS = [f"CREATE CONSTRAINT {l.lower()}_id IF NOT EXISTS FOR (n:{l}) REQUIRE n.id IS UNIQUE" for l in LABELS]
INDEXES = [
    "CREATE INDEX service_name IF NOT EXISTS FOR (s:Service) ON (s.name)",
    "CREATE INDEX incident_symptom IF NOT EXISTS FOR (i:Incident) ON (i.symptom)",
    "CREATE INDEX incident_started IF NOT EXISTS FOR (i:Incident) ON (i.started_at)",
    "CREATE INDEX incident_status IF NOT EXISTS FOR (i:Incident) ON (i.status)",
]

Q = {
    "services": """UNWIND $rows AS r MERGE (s:Service {id:r.id})
        SET s.name=r.name, s.tier=r.tier, s.team=r.team, s.description=r.description""",
    "engineers": "UNWIND $rows AS r MERGE (e:Engineer {id:r.id}) SET e.name=r.name, e.team=r.team",
    "fixes": "UNWIND $rows AS r MERGE (f:Fix {id:r.id}) SET f.name=r.name, f.description=r.description, f.category=r.category",
    "dependencies": """UNWIND $rows AS r MATCH (a:Service {id:r.src}) MATCH (b:Service {id:r.dst})
        MERGE (a)-[:DEPENDS_ON]->(b)""",
    "ownership": """UNWIND $rows AS r MATCH (e:Engineer {id:r.engineer}) MATCH (s:Service {id:r.service})
        MERGE (e)-[o:OWNS {valid_from: date(r.valid_from)}]->(s)
        SET o.valid_to = CASE WHEN r.valid_to IS NULL THEN null ELSE date(r.valid_to) END""",
    "deploys": """UNWIND $rows AS r MERGE (d:Deploy {id:r.id})
        SET d.version=r.version, d.deployed_at=datetime(r.deployed_at), d.notes=r.notes
        WITH d, r MATCH (s:Service {id:r.service}) MATCH (e:Engineer {id:r.author})
        MERGE (d)-[:TO]->(s) MERGE (d)-[:AUTHORED_BY]->(e)""",
    "incidents": """UNWIND $rows AS r MERGE (i:Incident {id:r.id})
        SET i.title=r.title, i.severity=r.severity, i.symptom=r.symptom, i.status=r.status, i.summary=r.summary,
            i.started_at=datetime(r.started_at),
            i.resolved_at=CASE WHEN r.resolved_at IS NULL THEN null ELSE datetime(r.resolved_at) END
        WITH i, r MATCH (s:Service {id:r.origin}) MERGE (i)-[:ORIGINATED_IN]->(s)""",
    "impacted": """UNWIND $rows AS r MATCH (i:Incident {id:r.incident}) MATCH (s:Service {id:r.service})
        MERGE (i)-[:IMPACTED]->(s)""",
    "followed": """UNWIND $rows AS r MATCH (i:Incident {id:r.incident}) MATCH (d:Deploy {id:r.deploy})
        MERGE (i)-[:FOLLOWED]->(d)""",
    "attempts": """UNWIND $rows AS r MERGE (a:Attempt {id:r.id})
        SET a.status=r.status, a.ts=datetime(r.ts), a.notes=r.notes
        WITH a, r MATCH (i:Incident {id:r.incident}) MATCH (f:Fix {id:r.fix}) MATCH (e:Engineer {id:r.engineer})
        MERGE (i)-[:HAD_ATTEMPT]->(a) MERGE (a)-[:USED]->(f) MERGE (a)-[:BY]->(e)""",
    "similar": """UNWIND $rows AS r MATCH (a:Incident {id:r.src}) MATCH (b:Incident {id:r.dst})
        MERGE (a)-[x:SIMILAR_TO]->(b) SET x.score=r.score""",
}


def build_batches(seed):
    inc = seed["incidents"]
    return [
        (Q["services"], seed["services"]),
        (Q["engineers"], seed["engineers"]),
        (Q["fixes"], seed["fixes"]),
        (Q["dependencies"], [dict(src=d["from"], dst=d["to"]) for d in seed["dependencies"]]),
        (Q["ownership"], seed["ownership"]),
        (Q["deploys"], seed["deploys"]),
        (Q["incidents"], inc),
        (Q["impacted"], [dict(incident=i["id"], service=s) for i in inc for s in i["impacted"]]),
        (Q["followed"], [dict(incident=i["id"], deploy=i["followed_deploy"]) for i in inc if i["followed_deploy"]]),
        (Q["attempts"], [dict(a, incident=i["id"]) for i in inc for a in i["attempts"]]),
        (Q["similar"], [dict(src=x["from"], dst=x["to"], score=x["score"]) for x in seed["similar"]]),
    ]


def load(driver, seed=None, wipe=False, database=None):
    seed = seed or json.loads(open(config.SEED_PATH).read())
    with driver.session(database=database) as s:
        if wipe:
            s.run("MATCH (n) WHERE any(l IN labels(n) WHERE l IN $labels) DETACH DELETE n", labels=LABELS).consume()
        for q in CONSTRAINTS + INDEXES:
            s.run(q).consume()
        for cypher, rows in build_batches(seed):
            s.run(cypher, rows=rows).consume()
    counts = dict(seed["meta"]["counts"])
    return counts


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--wipe", action="store_true")
    ap.add_argument("--print-schema", action="store_true")
    a = ap.parse_args()
    if a.print_schema:
        print("// Deja schema: run once in Neo4j Browser / Aura query tab (loader also runs it)\n")
        print(";\n".join(CONSTRAINTS + INDEXES) + ";")
        raise SystemExit(0)
    from neo4j import GraphDatabase
    drv = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD))
    drv.verify_connectivity()
    print("loaded:", load(drv, wipe=a.wipe, database=config.NEO4J_DATABASE))
    drv.close()
