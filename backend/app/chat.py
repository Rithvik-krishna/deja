"""Chat layer. CURRENT: deterministic rule-based mock so the frontend + demo script work end-to-end.
TODO (Backend B): replace `handle_chat` body with an LLM tool-calling agent whose tools are the Engine methods.
Keep the ChatRequest/ChatResponse contract and the `recalled` field (graph memory, not chat history) unchanged."""
import re
from datetime import date

from .engine import BadRequest, Engine, NotFound
from .schemas import *  # noqa: F401,F403

SESSIONS: dict[str, dict] = {}  # session_id -> {"incident_id": str|None, "turns": int}  (short-term memory only)

FIX_WORDS = {
    "restart": "restart-pods", "rebooted": "restart-pods", "rollback": "rollback-deploy", "rolled back": "rollback-deploy",
    "scale": "scale-up-replicas", "scaled": "scale-up-replicas", "flush": "flush-cache", "pool": "increase-conn-pool",
    "flag": "toggle-feature-flag", "failover": "failover-db-replica", "rotate": "rotate-credentials",
}
SYMPTOM_WORDS = [("latency", "latency"), ("slow", "latency"), ("spiking", "latency"), ("timeout", "timeout"), ("timing out", "timeout"),
                 ("5xx", "5xx"), ("500", "5xx"), ("errors", "5xx"), ("oom", "oom"), ("memory", "oom")]
FAIL_RE = re.compile(r"still (fail|broken|down|slow|spik|happen)|didn'?t work|did not work|failed|no luck|not working|no change", re.I)
OK_RE = re.compile(r"\b(worked|fixed|resolved|recovered|back to normal|all clear)\b", re.I)
RECALL_RE = re.compile(r"\b(again|it'?s back|same issue|any update|status|what happened|where were we)\b", re.I)
MONTHS = {m: i for i, m in enumerate(["january", "february", "march", "april", "may", "june", "july", "august",
                                      "september", "october", "november", "december"], 1)}


def _service_in(text, engine):
    t = text.lower()
    names = sorted((s.name for s in engine.catalog().services), key=len, reverse=True)
    for n in names:
        if n in t or n.replace("-", " ") in t:
            return n
    return None


def _fix_in(text):
    t = text.lower()
    for w, f in FIX_WORDS.items():
        if w in t:
            return f
    return None


def _symptom_in(text):
    t = text.lower()
    for w, s in SYMPTOM_WORDS:
        if w in t:
            return s
    return None


def _open_incident(engine, sess):
    """Graph memory: prefer the session's incident, else the most recent OPEN incident stored in the graph."""
    if sess.get("incident_id"):
        return sess["incident_id"], False
    opens = engine.list_incidents(status="open", limit=1)
    return (opens[0].id, True) if opens else (None, False)


def handle_chat(engine: Engine, req: ChatRequest) -> ChatResponse:
    sess = SESSIONS.setdefault(req.session_id, {"incident_id": None, "turns": 0})
    sess["turns"] += 1
    msg, calls = req.message, []

    def resp(reply, intent, **kw):
        return ChatResponse(session_id=req.session_id, reply=reply, intent=intent, tool_calls=calls,
                            incident_id=sess.get("incident_id"), **kw)

    # 1) ownership change:  "payments-api is now owned by Ravi"
    m = re.search(r"([\w-]+)\s+(?:is\s+)?now\s+owned\s+by\s+([A-Za-z ]+)", msg, re.I)
    if m and m.group(1).lower() in {s.name for s in engine.catalog().services}:
        try:
            r = engine.reassign(ReassignRequest(service=m.group(1).lower(), engineer=m.group(2).strip()))
        except (NotFound, BadRequest) as e:
            return resp(str(e), "error")
        calls.append(ToolCall(name="reassign", args={"service": r.service, "engineer": r.owner}, summary=f"{r.owner} now owns {r.service}"))
        prev = f" (previously {r.superseded.engineer} until {r.superseded.valid_to})" if r.superseded else ""
        return resp(f"Done. {r.owner} now owns {r.service} from {r.valid_from}{prev}. History is preserved.", "reassign")

    # 2) ownership question: "who owns X" / "who owned X in July"
    m = re.search(r"who\s+(owns|owned)\s+([\w-]+)(?:\s+in\s+([A-Za-z]+))?", msg, re.I)
    if m and m.group(2).lower() in {s.name for s in engine.catalog().services}:
        svc, month = m.group(2).lower(), (m.group(3) or "").lower()
        on = date(2026, MONTHS[month], 15) if month in MONTHS else None
        r = engine.owner(svc, on)
        calls.append(ToolCall(name="owner", args={"service": svc, "date": r.date}, summary=f"{r.owner}"))
        when = f"in {month.title()}" if on else "now"
        return resp(f"{svc} was owned by {r.owner} {when} (valid {r.valid_from} to {r.valid_to or 'present'}).", "owner")

    fix = _fix_in(msg)
    # 3) outcome report: "restarted, still failing" / "rollback worked"
    if fix and (FAIL_RE.search(msg) or OK_RE.search(msg)):
        iid, recalled = _open_incident(engine, sess)
        if not iid:
            return resp("I don't have an open incident to attach that to. Tell me which service is alerting.", "no_incident")
        sess["incident_id"] = iid
        status = "FAILED" if FAIL_RE.search(msg) else "SUCCESS"
        r = engine.record_outcome(OutcomeRequest(incident_id=iid, fix=fix, status=status, notes=msg[:140]))
        calls.append(ToolCall(name="record_outcome", args={"incident_id": iid, "fix": fix, "status": status}, summary=f"{fix} -> {status}"))
        if status == "SUCCESS":
            return resp(f"Great - {iid} marked resolved via {fix}. Logged so the next incident learns from it.", "outcome", graph=r.graph)
        nxt = next((x for x in r.recommendations if not x.already_failed_here and not x.avoid), None)
        tip = f"Next best: {nxt.fix} ({nxt.rationale.lower()})." if nxt else "No safe options left - escalate."
        return resp(f"Logged: {fix} FAILED on {iid}. I won't suggest it again for this incident. {tip}", "outcome", graph=r.graph)

    # 4) new alert: "checkout latency is spiking"
    svc, sym = _service_in(msg, engine), _symptom_in(msg)
    if svc and sym:
        r = engine.create_alert(AlertRequest(service=svc, symptom=sym))
        sess["incident_id"] = r.incident.id
        calls.append(ToolCall(name="create_alert", args={"service": svc, "symptom": sym}, summary=f"{r.incident.id}; likely origin {r.likely_origin}"))
        top = r.suspects[0]
        dep = f" A deploy ({top.recent_deploys[0].version} by {top.recent_deploys[0].author}) landed recently." if top.recent_deploys else ""
        good = next((x for x in r.recommendations if not x.avoid and not x.already_failed_here), None)
        bad = [x.fix for x in r.recommendations if x.avoid]
        advice = f" Try {good.fix} first ({good.rationale.lower()})." if good else ""
        warn = f" Avoid {', '.join(bad)}." if bad else ""
        return resp(f"Opened {r.incident.id}. Tracing upstream from {svc}, the likely origin is {r.likely_origin} - "
                    f"{top.same_symptom_incidents} past {sym} incidents match.{dep}{advice}{warn}", "alert", graph=r.graph,
                    recalled=[f"{s.incident.id}: {s.why}" for s in r.similar_incidents[:3]])

    # 5) recall: "it's back" (new session, no chat history - memory comes from the graph)
    if RECALL_RE.search(msg):
        iid, recalled = _open_incident(engine, sess)
        if not iid:
            return resp("No open incidents in memory. Tell me which service is alerting.", "no_incident")
        sess["incident_id"] = iid
        d = engine.incident(iid)
        calls.append(ToolCall(name="incident", args={"incident_id": iid}, summary=f"{len(d.attempts)} attempts on record"))
        failed = [a.fix for a in d.attempts if a.status == "FAILED"]
        recs = engine.fix_stats(d.origin, d.symptom)
        nxt = next((r for r in recs if r.fix not in failed and not r.avoid), None)
        facts = [f"{iid}: {d.title} (origin {d.origin})"] + [f"{a.fix} -> {a.status}" for a in d.attempts]
        tail = f" Next best: {nxt.fix}." if nxt else ""
        return resp(f"Yes - this is {iid} ({d.title}). Already tried: {', '.join(failed) or 'nothing yet'}.{tail}",
                    "recall", recalled=facts, graph=d.graph)

    return resp("I can: open an incident (e.g. 'checkout latency is spiking'), log an outcome ('restarted, still failing'), "
                "recall an open incident ('it's back'), or answer ownership questions ('who owned payments-api in July?').", "help")


def wipe_session(session_id: str) -> bool:
    return SESSIONS.pop(session_id, None) is not None
