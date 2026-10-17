"""Every endpoint answers and validates against its response model; the whole 3-minute demo runs through the API."""
import json

from app import config


def test_all_get_endpoints(client):
    for url in ["/health", "/catalog", "/graph/risk", "/graph/blast/payments-api", "/insights/fix-stats?service=payments-api",
                "/insights/similar-incidents?service=checkout&symptom=latency", "/owner?service=search&date=2026-05-01",
                "/incidents", "/incidents/INC-001", "/incidents/INC-001/timeline"]:
        r = client.get(url)
        assert r.status_code == 200, (url, r.text)


def test_errors(client):
    assert client.get("/graph/blast/nope").status_code == 404
    assert client.get("/incidents/INC-999").status_code == 404
    assert client.post("/alert", json={"service": "checkout", "symptom": "nonsense"}).status_code == 422
    assert client.post("/owner", json={"service": "payments-api", "engineer": "Nobody"}).status_code == 404


def test_blast_numbers(client):
    r = client.get("/graph/blast/payments-api?depth=6").json()
    assert r["total"] == 9 and {i["hops"] for i in r["impacted"]} == {1, 2}


def test_full_demo_script(client):
    sid = "demo"
    # 1 risk map
    risk = client.get("/graph/risk").json()
    assert risk["services"][0]["service"] == "payments-api"
    # 2 alert via chat
    c = client.post("/chat", json={"session_id": sid, "message": "checkout latency is spiking"}).json()
    assert c["intent"] == "alert" and c["incident_id"] and "payments-api" in c["reply"] and "rollback-deploy" in c["reply"]
    assert "restart-pods" in c["reply"] and c["graph"]["nodes"]
    iid = c["incident_id"]
    # 3 outcome memory
    c = client.post("/chat", json={"session_id": sid, "message": "I restarted the pods but it's still failing"}).json()
    assert c["intent"] == "outcome" and "FAILED" in c["reply"] and "rollback-deploy" in c["reply"]
    # 4 amnesia: wipe chat state, graph must remember
    assert client.post("/sessions/wipe", json={"session_id": sid}).json()["wiped"] is True
    c = client.post("/chat", json={"session_id": "fresh-session", "message": "it's back"}).json()
    assert c["intent"] == "recall" and c["incident_id"] == iid and "restart-pods" in c["reply"]
    assert any("restart-pods -> FAILED" in x for x in c["recalled"])
    # 5 time travel
    c = client.post("/chat", json={"session_id": "s", "message": "payments-api is now owned by Ravi"}).json()
    assert c["intent"] == "reassign" and "Ravi Iyer" in c["reply"]
    assert client.get("/owner?service=payments-api&date=2026-07-15").json()["owner"] == "Asha Menon"
    assert client.get("/owner?service=payments-api").json()["owner"] == "Ravi Iyer"
    c = client.post("/chat", json={"session_id": "s", "message": "who owned payments-api in July?"}).json()
    assert c["intent"] == "owner" and "Asha Menon" in c["reply"]
    # 6 resolve + learning: rollback success is now part of stats
    before = {s["fix"]: s for s in client.get("/insights/fix-stats?service=payments-api").json()}
    client.post("/chat", json={"session_id": "s", "message": "rollback worked"})
    after = {s["fix"]: s for s in client.get("/insights/fix-stats?service=payments-api").json()}
    assert after["rollback-deploy"]["attempts"] == before["rollback-deploy"]["attempts"] + 1
    assert client.get(f"/incidents/{iid}").json()["status"] == "resolved"
    # 7 reset restores the seed
    assert client.post("/demo/reset").json()["ok"]
    assert client.get("/owner?service=payments-api").json()["owner"] == "Asha Menon"
    assert client.get("/incidents?status=open").json() == []


def test_openapi_file_is_current(client):
    f = config.ROOT / "contract" / "openapi.json"
    assert f.exists(), "run: python -m scripts.export_contract"
    assert json.loads(f.read_text()) == client.get("/openapi.json").json(), "contract drifted - re-export and tell the frontend"
