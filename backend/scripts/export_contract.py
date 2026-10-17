"""Exports contract/openapi.json and contract/examples/*.json (real responses from the mock engine at a frozen clock).
Run from backend/:  python -m scripts.export_contract"""
import json
import os

os.environ["DEJA_FIXED_NOW"] = "2026-10-17T07:00:00Z"
os.environ["MODE"] = "mock"
from fastapi.testclient import TestClient  # noqa: E402

from app import deps  # noqa: E402
from app.main import app  # noqa: E402
from app.mock_engine import MockEngine  # noqa: E402
from app import config  # noqa: E402

OUT = config.ROOT / "contract"
(OUT / "examples").mkdir(parents=True, exist_ok=True)
deps.set_engine(MockEngine())
c = TestClient(app)
(OUT / "openapi.json").write_text(json.dumps(c.get("/openapi.json").json(), indent=1))


def save(name, resp):
    assert resp.status_code == 200, (name, resp.text)
    (OUT / "examples" / f"{name}.json").write_text(json.dumps(resp.json(), indent=1))


save("health", c.get("/health"))
save("catalog", c.get("/catalog"))
save("graph_risk", c.get("/graph/risk"))
save("graph_blast_payments-api", c.get("/graph/blast/payments-api"))
save("similar_incidents", c.get("/insights/similar-incidents", params=dict(service="checkout", symptom="latency")))
save("fix_stats_payments-api", c.get("/insights/fix-stats", params=dict(service="payments-api", symptom="latency")))
save("owner_july", c.get("/owner", params=dict(service="payments-api", date="2026-07-15")))
save("incident_detail", c.get("/incidents/INC-037"))
save("incident_timeline", c.get("/incidents/INC-037/timeline"))
save("alert", c.post("/alert", json=dict(service="checkout", symptom="latency")))
iid = c.get("/incidents", params=dict(status="open")).json()[0]["id"]
save("outcome_failed", c.post("/outcome", json=dict(incident_id=iid, fix="restart-pods", status="FAILED", notes="still failing")))
save("reassign", c.post("/owner", json=dict(service="payments-api", engineer="Ravi")))
save("chat_alert", c.post("/chat", json=dict(session_id="x", message="checkout latency is spiking")))
save("chat_recall", c.post("/chat", json=dict(session_id="fresh", message="it's back")))
save("wipe", c.post("/sessions/wipe", json=dict(session_id="x")))
print("contract exported:", sorted(p.name for p in (OUT / "examples").iterdir()))
