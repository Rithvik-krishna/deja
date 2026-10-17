"""Generates data/seed.json (deterministic) with a PLANTED STORY, then data/expected_insights.json.

Run from backend/:  python -m scripts.generate_seed

The story (asserted in tests/test_seed_story.py):
  * payments-api is tier-2 and not the biggest fan-in (kafka-bus / redis-cache are), and checkout has the most
    incidents of its own, but combining graph + incident memory makes payments-api the #1 risk.
  * restart-pods FAILED 5/5 on payments-api incidents; rollback-deploy worked 5/5 -> the agent must say "avoid restart".
  * A fresh 'checkout latency' alert traces upstream to payments-api (recent deploy v2.3.1 by Asha) - not to the
    decoy (inventory also deployed recently, but has far fewer matching incidents).
  * Ownership time travel: search (Kiran -> Meera on 2026-07-01), refunds (Sana -> Dev on 2026-05-01).
    payments-api stays with Asha so the LIVE demo can reassign it to Ravi and then ask "who owned it in July?".
"""
import json
import random
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "data"
AS_OF = "2026-10-16"
rng = random.Random(20261017)

ENGINEERS = [  # id, name, team
    ("asha-menon", "Asha Menon", "payments-platform"),
    ("dev-patel", "Dev Patel", "payments-platform"),
    ("ravi-iyer", "Ravi Iyer", "platform"),
    ("kiran-rao", "Kiran Rao", "supply"),
    ("meera-nair", "Meera Nair", "discovery"),
    ("sana-khan", "Sana Khan", "commerce"),
    ("arjun-reddy", "Arjun Reddy", "commerce"),
    ("lakshmi-pillai", "Lakshmi Pillai", "identity"),
    ("vikram-singh", "Vikram Singh", "infra"),
    ("tara-bose", "Tara Bose", "growth"),
]
ENG_TEAM = {e[0]: e[2] for e in ENGINEERS}

SERVICES = [  # name, tier, description
    ("web-frontend", "tier-1", "Customer web app"),
    ("mobile-bff", "tier-1", "Backend-for-frontend for mobile apps"),
    ("checkout", "tier-1", "Checkout orchestration"),
    ("cart", "tier-1", "Shopping cart"),
    ("order-service", "tier-1", "Order lifecycle"),
    ("auth-service", "tier-1", "Authentication and tokens"),
    ("search", "tier-2", "Product search"),
    ("recommendations", "tier-2", "Personalised recommendations"),
    ("inventory", "tier-2", "Stock levels and reservations"),
    ("payments-api", "tier-2", "Payment authorisation and capture"),
    ("fraud-check", "tier-2", "Real-time fraud scoring"),
    ("user-profile", "tier-2", "User profile store"),
    ("refunds", "tier-2", "Refund processing"),
    ("subscriptions", "tier-2", "Recurring billing"),
    ("redis-cache", "tier-2", "Shared Redis cache"),
    ("kafka-bus", "tier-2", "Event bus"),
    ("notifications", "tier-3", "Email/SMS/push"),
    ("shipping-quotes", "tier-3", "Carrier rate quotes"),
    ("invoicing", "tier-3", "Invoice generation"),
    ("loyalty", "tier-3", "Loyalty points"),
    ("feature-flags", "tier-3", "Feature flag service"),
    ("admin-portal", "tier-3", "Internal admin UI"),
]

DEPS = {  # A DEPENDS_ON each of B
    "web-frontend": ["checkout", "cart", "search", "auth-service", "recommendations"],
    "mobile-bff": ["checkout", "cart", "search", "auth-service", "user-profile"],
    "admin-portal": ["refunds", "auth-service", "order-service"],
    "checkout": ["payments-api", "cart", "inventory", "order-service", "shipping-quotes", "feature-flags"],
    "cart": ["inventory", "redis-cache", "feature-flags"],
    "order-service": ["payments-api", "inventory", "kafka-bus"],
    "refunds": ["payments-api", "order-service"],
    "subscriptions": ["payments-api", "user-profile", "kafka-bus"],
    "invoicing": ["payments-api", "order-service"],
    "loyalty": ["order-service", "user-profile"],
    "payments-api": ["fraud-check", "redis-cache"],
    "fraud-check": ["user-profile", "kafka-bus"],
    "notifications": ["kafka-bus", "user-profile"],
    "search": ["redis-cache"],
    "recommendations": ["user-profile", "redis-cache"],
    "inventory": ["kafka-bus", "redis-cache"],
}

OWNERSHIP = [  # service, engineer, valid_from, valid_to
    ("web-frontend", "arjun-reddy", "2025-11-01", None),
    ("mobile-bff", "sana-khan", "2025-11-01", None),
    ("checkout", "sana-khan", "2025-11-01", None),
    ("cart", "arjun-reddy", "2025-11-01", None),
    ("order-service", "sana-khan", "2025-11-01", None),
    ("auth-service", "lakshmi-pillai", "2025-11-01", None),
    ("search", "kiran-rao", "2025-11-01", "2026-06-30"),
    ("search", "meera-nair", "2026-07-01", None),
    ("recommendations", "meera-nair", "2025-11-01", None),
    ("inventory", "kiran-rao", "2025-11-01", None),
    ("payments-api", "asha-menon", "2025-11-01", None),
    ("fraud-check", "ravi-iyer", "2025-11-01", None),
    ("user-profile", "lakshmi-pillai", "2025-11-01", None),
    ("refunds", "sana-khan", "2025-11-01", "2026-04-30"),
    ("refunds", "dev-patel", "2026-05-01", None),
    ("subscriptions", "tara-bose", "2025-11-01", None),
    ("redis-cache", "vikram-singh", "2025-11-01", None),
    ("kafka-bus", "vikram-singh", "2025-11-01", None),
    ("notifications", "tara-bose", "2025-11-01", None),
    ("shipping-quotes", "arjun-reddy", "2025-11-01", None),
    ("invoicing", "dev-patel", "2025-11-01", None),
    ("loyalty", "tara-bose", "2025-11-01", None),
    ("feature-flags", "ravi-iyer", "2025-11-01", None),
    ("admin-portal", "ravi-iyer", "2025-11-01", None),
]

FIXES = [
    ("restart-pods", "Restart affected pods/instances", "restart"),
    ("rollback-deploy", "Roll back to the previous release", "rollback"),
    ("scale-up-replicas", "Scale up replicas / capacity", "scale"),
    ("increase-conn-pool", "Increase DB / connection pool limits", "config"),
    ("flush-cache", "Flush and rebuild the cache", "cache"),
    ("toggle-feature-flag", "Disable the feature flag tied to the change", "config"),
    ("failover-db-replica", "Fail over to the replica", "failover"),
    ("rotate-credentials", "Rotate expired credentials/tokens", "security"),
]

PHRASE = {"latency": "latency spiking", "timeout": "requests timing out", "5xx": "5xx error spike", "oom": "pods OOMKilled"}
NOTES = {
    ("restart-pods", "FAILED"): "Pods restarted; symptom unchanged",
    ("restart-pods", "SUCCESS"): "Restart cleared the symptom",
    ("rollback-deploy", "SUCCESS"): "Rolled back; metrics recovered",
    ("rollback-deploy", "FAILED"): "Rollback did not help",
}

FIX_BY_SYMPTOM = {  # fix, success probability (filler incidents only)
    "latency": [("restart-pods", .5), ("scale-up-replicas", .6), ("flush-cache", .5), ("rollback-deploy", .7)],
    "timeout": [("increase-conn-pool", .7), ("restart-pods", .4), ("scale-up-replicas", .5)],
    "5xx": [("rollback-deploy", .7), ("toggle-feature-flag", .6), ("restart-pods", .4)],
    "oom": [("scale-up-replicas", .7), ("restart-pods", .6)],
}


def dt(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


def iso(d):
    return d.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


# ---------- helpers over the static graph ----------
rev = {s[0]: set() for s in SERVICES}
for a, bs in DEPS.items():
    for b in bs:
        rev[b].add(a)


def dependents_within(service, depth):
    seen, frontier = {service: 0}, [service]
    while frontier:
        nxt = []
        for cur in frontier:
            if seen[cur] >= depth:
                continue
            for d in sorted(rev[cur]):
                if d not in seen:
                    seen[d] = seen[cur] + 1
                    nxt.append(d)
        frontier = nxt
    seen.pop(service)
    return sorted(seen)


def owner_on(service, day):  # day = 'YYYY-MM-DD'
    for s, e, vf, vt in OWNERSHIP:
        if s == service and vf <= day and (vt is None or day <= vt):
            return e
    return "ravi-iyer"


# ---------- deploys & incidents (built with temp keys, ids assigned chronologically at the end) ----------
deploys = []   # dict(key, service, version, deployed_at(datetime), author, notes)
incidents = []  # dict(origin, symptom, severity, started(datetime), impacted, deploy_key, attempts[(fix,status)])
ver_used = set()


def add_deploy(key, service, version, when, author, notes=""):
    ver_used.add((service, version))
    deploys.append(dict(key=key, service=service, version=version, deployed_at=when, author=author, notes=notes))


def gen_version(service):
    major = 1 + sum(map(ord, service)) % 4
    while True:
        v = f"v{major}.{rng.randint(1, 14)}.{rng.randint(0, 6)}"
        if (service, v) not in ver_used:
            return v


# --- planted: payments-api deploys
for key, ver, when, author in [
    ("pay-204", "v2.0.4", "2026-05-06T04:10:00Z", "asha-menon"),
    ("pay-210", "v2.1.0", "2026-06-19T03:40:00Z", "asha-menon"),
    ("pay-212", "v2.1.2", "2026-07-14T05:05:00Z", "dev-patel"),
    ("pay-220", "v2.2.0", "2026-08-09T04:30:00Z", "asha-menon"),
    ("pay-230", "v2.3.0", "2026-09-25T03:55:00Z", "dev-patel"),
    ("pay-231", "v2.3.1", "2026-10-14T04:50:00Z", "asha-menon"),
]:
    add_deploy(key, "payments-api", ver, dt(when), author, "Release " + ver)
# --- planted decoy: inventory also deployed recently
add_deploy("inv-480", "inventory", "v4.8.0", dt("2026-10-13T05:30:00Z"), "kiran-rao", "Release v4.8.0")

# --- planted payments-api incidents: (start, symptom, severity, impacted, deploy_key, attempts)
PAY = [
    ("2026-05-06T06:15:00Z", "latency", "SEV2", ["checkout", "order-service"], "pay-204",
     [("restart-pods", "FAILED"), ("rollback-deploy", "SUCCESS")]),
    ("2026-05-28T09:20:00Z", "timeout", "SEV2", ["checkout", "refunds"], None,
     [("increase-conn-pool", "SUCCESS")]),
    ("2026-06-19T05:45:00Z", "latency", "SEV1", ["checkout", "order-service", "subscriptions"], "pay-210",
     [("restart-pods", "FAILED"), ("scale-up-replicas", "FAILED"), ("rollback-deploy", "SUCCESS")]),
    ("2026-07-14T07:00:00Z", "5xx", "SEV1", ["checkout", "invoicing"], "pay-212",
     [("rollback-deploy", "SUCCESS")]),
    ("2026-08-09T06:20:00Z", "latency", "SEV2", ["checkout", "refunds"], "pay-220",
     [("restart-pods", "FAILED"), ("rollback-deploy", "SUCCESS")]),
    ("2026-09-02T11:10:00Z", "timeout", "SEV2", ["checkout", "order-service"], None,
     [("flush-cache", "FAILED"), ("increase-conn-pool", "SUCCESS")]),
    ("2026-09-25T05:50:00Z", "latency", "SEV2", ["checkout", "subscriptions"], "pay-230",
     [("restart-pods", "FAILED"), ("rollback-deploy", "SUCCESS")]),
    ("2026-10-08T08:30:00Z", "5xx", "SEV2", ["checkout"], None,
     [("restart-pods", "FAILED"), ("toggle-feature-flag", "SUCCESS")]),
]
for start, sym, sev, imp, dk, att in PAY:
    incidents.append(dict(origin="payments-api", symptom=sym, severity=sev, started=dt(start),
                          impacted=imp, deploy_key=dk, attempts=att))
# --- planted decoy incident on inventory (recent, latency, impacts checkout+cart)
incidents.append(dict(origin="inventory", symptom="latency", severity="SEV3", started=dt("2026-10-12T09:15:00Z"),
                      impacted=["checkout", "cart"], deploy_key="inv-480", attempts=[("restart-pods", "SUCCESS")]))

# --- filler incidents
FILLER = [
    ("auth-service", ["5xx"]), ("redis-cache", ["latency", "oom"]), ("kafka-bus", ["latency", "timeout"]),
    ("checkout", ["5xx", "latency", "timeout", "5xx"]), ("inventory", ["timeout", "5xx", "oom"]),
    ("cart", ["latency", "5xx"]), ("search", ["latency", "timeout", "oom"]), ("recommendations", ["latency", "timeout"]),
    ("notifications", ["timeout", "oom"]), ("order-service", ["5xx", "latency"]), ("fraud-check", ["timeout", "latency"]),
    ("user-profile", ["5xx"]), ("shipping-quotes", ["timeout", "5xx"]), ("subscriptions", ["5xx"]),
    ("refunds", ["5xx"]), ("invoicing", ["timeout"]), ("loyalty", ["oom"]), ("feature-flags", ["5xx"]),
    ("web-frontend", ["latency"]), ("mobile-bff", ["5xx"]),
]
F_START, F_END = datetime(2026, 3, 2, 6, tzinfo=timezone.utc), datetime(2026, 10, 5, 6, tzinfo=timezone.utc)


def rand_date():
    while True:
        d = F_START + timedelta(minutes=rng.randint(0, int((F_END - F_START).total_seconds() // 60)))
        if not (datetime(2026, 4, 15, tzinfo=timezone.utc) <= d <= datetime(2026, 4, 25, tzinfo=timezone.utc)):
            return d.replace(second=0)


for origin, symptoms in FILLER:
    for sym in symptoms:
        started = rand_date()
        pool = dependents_within(origin, 2)
        impacted = sorted(rng.sample(pool, min(len(pool), rng.randint(1, 3)))) if pool else []
        att, tried = [], set()
        options = FIX_BY_SYMPTOM[sym]
        for _ in range(3):
            fix, p = rng.choice([o for o in options if o[0] not in tried] or options)
            tried.add(fix)
            if rng.random() < p or len(att) == 2:
                att.append((fix, "SUCCESS"))
                break
            att.append((fix, "FAILED"))
        dkey = None
        if rng.random() < 0.4:
            dkey = f"f-{origin}-{started:%m%d%H}"
            add_deploy(dkey, origin, gen_version(origin), started - timedelta(hours=rng.randint(1, 3)),
                       owner_on(origin, f"{started:%Y-%m-%d}"), "")
        incidents.append(dict(origin=origin, symptom=sym, severity=rng.choice(["SEV2", "SEV3", "SEV3"]),
                              started=started, impacted=impacted, deploy_key=dkey, attempts=att))

# --- background deploy noise (none inside the 'recent' window)
for name, _, _ in SERVICES:
    if name in ("payments-api",):
        continue
    when = F_START + timedelta(days=rng.randint(3, 200), hours=rng.randint(0, 8))
    add_deploy(f"n-{name}", name, gen_version(name), when, owner_on(name, f"{when:%Y-%m-%d}"), "")

# ---------- assign ids chronologically ----------
deploys.sort(key=lambda d: d["deployed_at"])
dep_id_of = {}
for i, d in enumerate(deploys, 1):
    d["id"] = f"DEP-{i:03d}"
    dep_id_of[d["key"]] = d["id"]

incidents.sort(key=lambda i: i["started"])
out_incidents, similar, att_n = [], [], 0
for n, inc in enumerate(incidents, 1):
    iid = f"INC-{n:03d}"
    t = inc["started"]
    atts = []
    for fix, status in inc["attempts"]:
        t = t + timedelta(minutes=rng.randint(18, 40))
        att_n += 1
        atts.append(dict(id=f"ATT-{att_n:03d}", fix=fix, status=status, ts=iso(t),
                         engineer=owner_on(inc["origin"], f"{t:%Y-%m-%d}"),
                         notes=NOTES.get((fix, status), "")))
    resolved = iso(t + timedelta(minutes=8))
    lead = inc["impacted"][0] if inc["impacted"] else inc["origin"]
    out_incidents.append(dict(
        id=iid, title=f"{lead} {PHRASE[inc['symptom']]}", severity=inc["severity"], symptom=inc["symptom"],
        status="resolved", started_at=iso(inc["started"]), resolved_at=resolved,
        summary=f"Root cause in {inc['origin']} ({inc['symptom']}). Resolved via {atts[-1]['fix']}.",
        origin=inc["origin"], impacted=inc["impacted"],
        followed_deploy=dep_id_of.get(inc["deploy_key"]) if inc["deploy_key"] else None, attempts=atts))

for i, a in enumerate(out_incidents):
    for b in out_incidents[:i]:
        if a["origin"] == b["origin"] and a["symptom"] == b["symptom"]:
            similar.append(dict(**{"from": a["id"], "to": b["id"]}, score=0.9))

seed = dict(
    meta=dict(as_of=AS_OF, generated_by="scripts/generate_seed.py"),
    services=[dict(id=n, name=n, tier=t, team=ENG_TEAM[owner_on(n, AS_OF)], description=d) for n, t, d in SERVICES],
    engineers=[dict(id=i, name=n, team=t) for i, n, t in ENGINEERS],
    fixes=[dict(id=i, name=i, description=d, category=c) for i, d, c in FIXES],
    dependencies=[{"from": a, "to": b} for a, bs in DEPS.items() for b in bs],
    ownership=[dict(service=s, engineer=e, valid_from=vf, valid_to=vt) for s, e, vf, vt in OWNERSHIP],
    deploys=[dict(id=d["id"], service=d["service"], version=d["version"], deployed_at=iso(d["deployed_at"]),
                  author=d["author"], notes=d["notes"]) for d in deploys],
    incidents=out_incidents,
    similar=similar,
)
seed["meta"]["counts"] = {k: len(seed[k]) for k in
                          ["services", "engineers", "fixes", "dependencies", "ownership", "deploys", "incidents", "similar"]}
seed["meta"]["counts"]["attempts"] = att_n

OUT.mkdir(exist_ok=True)
(OUT / "seed.json").write_text(json.dumps(seed, indent=1))
print("seed.json written:", seed["meta"]["counts"])


def write_expected():
    """Ground truth computed by the reference engine at a frozen clock. Both engines must match this."""
    import os
    os.environ["DEJA_FIXED_NOW"] = "2026-10-17T07:00:00Z"
    from datetime import date
    from app.mock_engine import MockEngine
    from app.schemas import AlertRequest
    e = MockEngine(OUT / "seed.json")
    risk = e.risk(180, 10, date(2026, 10, 17))
    stats = {s.fix: s for s in e.fix_stats("payments-api", None)}
    lat = e.fix_stats("payments-api", "latency")
    alert = e.create_alert(AlertRequest(service="checkout", symptom="latency"))
    exp = dict(
        frozen_now="2026-10-17T07:00:00Z", as_of="2026-10-17", window_days=180,
        risk_top=[dict(service=r.service, transitive_dependents=r.transitive_dependents,
                       incidents_originated=r.incidents_originated, risk_score=r.risk_score) for r in risk.services[:5]],
        incidents_in_window=risk.incidents_in_window,
        payments_api=dict(transitive_dependents=next(r.transitive_dependents for r in risk.services if r.service == "payments-api"),
                          fan_in_rank=next(r.fan_in_rank for r in risk.services if r.service == "payments-api"),
                          incident_rank=next(r.incident_rank for r in risk.services if r.service == "payments-api")),
        fix_stats_payments_api={k: dict(attempts=v.attempts, successes=v.successes) for k, v in stats.items()},
        fix_stats_payments_api_latency={s.fix: dict(attempts=s.attempts, successes=s.successes, avoid=s.avoid) for s in lat},
        alert_checkout_latency=dict(
            likely_origin=alert.likely_origin,
            suspect_order=[s.service for s in alert.suspects],
            top_recommendation=alert.recommendations[0].fix,
            avoid=[r.fix for r in alert.recommendations if r.avoid],
            similar_incident_count=len(alert.similar_incidents)),
        owner_checks=[
            dict(service="payments-api", on="2026-07-15", owner="Asha Menon"),
            dict(service="search", on="2026-05-01", owner="Kiran Rao"),
            dict(service="search", on="2026-08-01", owner="Meera Nair"),
            dict(service="refunds", on="2026-04-30", owner="Sana Khan"),
            dict(service="refunds", on="2026-05-01", owner="Dev Patel"),
        ],
    )
    (OUT / "expected_insights.json").write_text(json.dumps(exp, indent=1))
    print("expected_insights.json written")
    print(json.dumps(exp, indent=1)[:2500])


if __name__ == "__main__":
    write_expected()
