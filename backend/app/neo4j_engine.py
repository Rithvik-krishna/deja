"""LIVE engine (Neo4j). TODO for Backend A - implement every method below so it returns EXACTLY what MockEngine returns
(same models, same scoring formulas, same ordering). tests/test_parity_neo4j.py checks it against data/expected_insights.json.
Reference Cypher for the hard parts lives in docs/GRAPH_MODEL.md. health() and reset() are already done."""
from datetime import date
from typing import Optional

from . import config
from .engine import Engine
from .schemas import *  # noqa: F401,F403


def _todo(name):
    raise NotImplementedError(f"Neo4jEngine.{name} - see docs/TASKS.md (T1) and docs/GRAPH_MODEL.md")


class Neo4jEngine(Engine):
    def __init__(self):
        from neo4j import GraphDatabase
        if not config.NEO4J_URI:
            raise RuntimeError("NEO4J_URI not set (copy .env.example to .env)")
        self.driver = GraphDatabase.driver(config.NEO4J_URI, auth=(config.NEO4J_USERNAME, config.NEO4J_PASSWORD))
        self.db = config.NEO4J_DATABASE

    def _run(self, cypher, **params):
        with self.driver.session(database=self.db) as s:
            return [r.data() for r in s.run(cypher, **params)]

    # ---- done ----
    def health(self):
        try:
            self._run("RETURN 1 AS ok")
            return Health(status="ok", mode="live", neo4j=True)
        except Exception:
            return Health(status="degraded", mode="live", neo4j=False)

    def reset(self):
        from scripts.load_seed import load
        return DemoResetResponse(ok=True, counts=load(self.driver, wipe=True, database=self.db))

    # ---- TODO (T1) ----
    def catalog(self): _todo("catalog")
    def risk(self, window_days=180, limit=10, as_of=None): _todo("risk")
    def blast(self, service, depth=3): _todo("blast")
    def similar_incidents(self, service, symptom=None, limit=5, origin=None, exclude=None): _todo("similar_incidents")
    def fix_stats(self, service=None, symptom=None): _todo("fix_stats")
    def owner(self, service, on=None): _todo("owner")
    def reassign(self, req): _todo("reassign")
    def create_alert(self, req): _todo("create_alert")
    def record_outcome(self, req): _todo("record_outcome")
    def list_incidents(self, status=None, limit=50): _todo("list_incidents")
    def incident(self, incident_id): _todo("incident")
    def timeline(self, incident_id): _todo("timeline")
