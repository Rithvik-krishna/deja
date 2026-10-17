"""THE CONTRACT. Frozen. Frontend, both engines (mock + Neo4j) and the chat agent all speak these models.

Conventions
- Timestamps: ISO-8601 UTC strings with 'Z' (e.g. 2026-10-14T04:50:00Z). Dates: 'YYYY-MM-DD'.
- Services are addressed by `name` (slug, e.g. 'payments-api'). Incidents by id ('INC-012'),
  fixes by id ('rollback-deploy'), engineers by display name or id ('asha-menon').
- Graph payload node ids are prefixed: svc:<name>, eng:<id>, dep:<id>, inc:<id>, fix:<id>.
  Edge ids are '<source>|<TYPE>|<target>'.
"""
from datetime import date
from typing import Any, Literal, Optional

from pydantic import BaseModel, Field

Symptom = Literal["latency", "timeout", "5xx", "oom"]
Severity = Literal["SEV1", "SEV2", "SEV3"]
AttemptStatus = Literal["SUCCESS", "FAILED"]
IncidentStatus = Literal["open", "resolved"]
SYMPTOMS = ["latency", "timeout", "5xx", "oom"]


# ---------- graph payload (what the frontend renders) ----------
class GraphNode(BaseModel):
    id: str
    label: str = Field(description="Service | Engineer | Deploy | Incident | Fix")
    name: str
    props: dict[str, Any] = {}
    highlight: bool = False
    score: Optional[float] = None


class GraphEdge(BaseModel):
    id: str
    source: str
    target: str
    type: str = Field(description="DEPENDS_ON | OWNS | TO | AUTHORED_BY | ORIGINATED_IN | IMPACTED | FOLLOWED | ATTEMPTED(collapsed, props.status)")
    props: dict[str, Any] = {}
    highlight: bool = False


class GraphPayload(BaseModel):
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []


# ---------- shared summaries ----------
class DeploySummary(BaseModel):
    id: str
    service: str
    version: str
    deployed_at: str
    author: str


class AttemptSummary(BaseModel):
    id: str
    fix: str
    status: AttemptStatus
    ts: str
    engineer: str
    notes: str = ""


class IncidentSummary(BaseModel):
    id: str
    title: str
    severity: Severity
    symptom: Symptom
    status: IncidentStatus
    started_at: str
    origin: str = Field(description="Service where the root cause sits (hypothesised for open incidents)")
    impacted: list[str] = []


class IncidentDetail(IncidentSummary):
    resolved_at: Optional[str] = None
    summary: str = ""
    followed_deploy: Optional[DeploySummary] = None
    attempts: list[AttemptSummary] = []
    graph: GraphPayload = GraphPayload()


class TimelineEvent(BaseModel):
    ts: str
    type: Literal["deploy", "incident_opened", "attempt", "resolved"]
    text: str
    node_ids: list[str] = []


# ---------- insights ----------
class RiskItem(BaseModel):
    service: str
    tier: str
    team: str
    owner: Optional[str] = None
    direct_dependents: int
    transitive_dependents: int
    incidents_originated: int
    risk_score: float = Field(description="transitive_dependents + 3 * incidents_originated(window)")
    rank: int
    fan_in_rank: int
    incident_rank: int
    insight: str


class RiskResponse(BaseModel):
    as_of: str
    window_days: int
    incidents_in_window: int
    services: list[RiskItem]
    graph: GraphPayload


class BlastItem(BaseModel):
    service: str
    tier: str
    hops: int
    owner: Optional[str] = None


class BlastResponse(BaseModel):
    service: str
    depth: int
    total: int
    impacted: list[BlastItem]
    recent_deploys: list[DeploySummary]
    graph: GraphPayload


class SimilarIncident(BaseModel):
    incident: IncidentSummary
    score: float
    why: str
    attempts: list[AttemptSummary] = []


class FixStat(BaseModel):
    fix: str
    attempts: int
    successes: int
    failures: int
    success_rate: float
    smoothed_score: float = Field(description="(successes+1)/(attempts+2)")
    avoid: bool = Field(description="attempts>=3 and successes==0")


class Recommendation(BaseModel):
    fix: str
    score: float
    attempts: int
    successes: int
    rationale: str
    avoid: bool = False
    already_failed_here: bool = False


class Suspect(BaseModel):
    service: str
    hops: int
    score: float = Field(description="3*has_recent_deploy + same_symptom_incidents + 1/(hops+1)")
    recent_deploys: list[DeploySummary] = []
    same_symptom_incidents: int = 0
    owner: Optional[str] = None


# ---------- alert flow ----------
class AlertRequest(BaseModel):
    service: str = Field(description="Service where the symptom is observed")
    symptom: Symptom
    title: Optional[str] = None
    severity: Severity = "SEV2"


class AlertResponse(BaseModel):
    incident: IncidentSummary
    likely_origin: str
    suspects: list[Suspect]
    similar_incidents: list[SimilarIncident]
    recommendations: list[Recommendation]
    graph: GraphPayload


class OutcomeRequest(BaseModel):
    incident_id: str
    fix: str
    status: AttemptStatus
    notes: str = ""
    engineer: Optional[str] = None


class OutcomeResponse(BaseModel):
    attempt: AttemptSummary
    incident: IncidentSummary
    recommendations: list[Recommendation]
    fix_stats: list[FixStat]
    graph: GraphPayload


# ---------- ownership / time travel ----------
class OwnershipRecord(BaseModel):
    engineer: str
    valid_from: str
    valid_to: Optional[str] = None


class OwnerResponse(BaseModel):
    service: str
    date: str
    owner: Optional[str] = None
    valid_from: Optional[str] = None
    valid_to: Optional[str] = None
    history: list[OwnershipRecord]


class ReassignRequest(BaseModel):
    service: str
    engineer: str
    effective_date: Optional[date] = Field(None, description="defaults to today")


class ReassignResponse(OwnerResponse):
    superseded: Optional[OwnershipRecord] = None


# ---------- chat ----------
class ToolCall(BaseModel):
    name: str
    args: dict[str, Any] = {}
    summary: str = ""


class ChatRequest(BaseModel):
    session_id: str
    message: str


class ChatResponse(BaseModel):
    session_id: str
    reply: str
    intent: str = ""
    incident_id: Optional[str] = None
    tool_calls: list[ToolCall] = []
    recalled: list[str] = Field([], description="Facts recovered from graph memory (not from chat history)")
    graph: Optional[GraphPayload] = None


class WipeRequest(BaseModel):
    session_id: str


class WipeResponse(BaseModel):
    session_id: str
    wiped: bool


# ---------- misc ----------
class CatalogService(BaseModel):
    name: str
    tier: str
    team: str
    owner: Optional[str] = None


class CatalogFix(BaseModel):
    id: str
    name: str
    description: str


class CatalogEngineer(BaseModel):
    id: str
    name: str
    team: str


class Catalog(BaseModel):
    services: list[CatalogService]
    fixes: list[CatalogFix]
    engineers: list[CatalogEngineer]
    symptoms: list[str]


class Health(BaseModel):
    status: str
    mode: str
    neo4j: bool


class DemoResetResponse(BaseModel):
    ok: bool
    counts: dict[str, int]
