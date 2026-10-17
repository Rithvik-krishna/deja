from datetime import date
from typing import Optional

from fastapi import APIRouter, Query

from . import chat as chat_mod
from .deps import get_engine
from .schemas import *  # noqa: F401,F403

router = APIRouter()


@router.get("/health", response_model=Health, tags=["meta"])
def health():
    return get_engine().health()


@router.get("/catalog", response_model=Catalog, tags=["meta"])
def catalog():
    return get_engine().catalog()


@router.post("/demo/reset", response_model=DemoResetResponse, tags=["meta"])
def demo_reset():
    chat_mod.SESSIONS.clear()
    return get_engine().reset()


@router.get("/graph/risk", response_model=RiskResponse, tags=["insights"])
def graph_risk(window_days: int = Query(180, ge=1, le=730), limit: int = Query(10, ge=1, le=50), as_of: Optional[date] = None):
    return get_engine().risk(window_days, limit, as_of)


@router.get("/graph/blast/{service}", response_model=BlastResponse, tags=["insights"])
def graph_blast(service: str, depth: int = Query(3, ge=1, le=6)):
    return get_engine().blast(service, depth)


@router.get("/insights/similar-incidents", response_model=list[SimilarIncident], tags=["insights"])
def similar_incidents(service: str, symptom: Optional[Symptom] = None, origin: Optional[str] = None, limit: int = Query(5, ge=1, le=20)):
    return get_engine().similar_incidents(service, symptom, limit, origin)


@router.get("/insights/fix-stats", response_model=list[FixStat], tags=["insights"])
def fix_stats(service: Optional[str] = None, symptom: Optional[Symptom] = None):
    return get_engine().fix_stats(service, symptom)


@router.get("/owner", response_model=OwnerResponse, tags=["ownership"])
def owner(service: str, date: Optional[date] = None):
    return get_engine().owner(service, date)


@router.post("/owner", response_model=ReassignResponse, tags=["ownership"])
def reassign(req: ReassignRequest):
    return get_engine().reassign(req)


@router.post("/alert", response_model=AlertResponse, tags=["incidents"])
def alert(req: AlertRequest):
    return get_engine().create_alert(req)


@router.post("/outcome", response_model=OutcomeResponse, tags=["incidents"])
def outcome(req: OutcomeRequest):
    return get_engine().record_outcome(req)


@router.get("/incidents", response_model=list[IncidentSummary], tags=["incidents"])
def incidents(status: Optional[IncidentStatus] = None, limit: int = Query(50, ge=1, le=200)):
    return get_engine().list_incidents(status, limit)


@router.get("/incidents/{incident_id}", response_model=IncidentDetail, tags=["incidents"])
def incident(incident_id: str):
    return get_engine().incident(incident_id)


@router.get("/incidents/{incident_id}/timeline", response_model=list[TimelineEvent], tags=["incidents"])
def timeline(incident_id: str):
    return get_engine().timeline(incident_id)


@router.post("/chat", response_model=ChatResponse, tags=["chat"])
def chat(req: ChatRequest):
    return chat_mod.handle_chat(get_engine(), req)


@router.post("/sessions/wipe", response_model=WipeResponse, tags=["chat"])
def sessions_wipe(req: WipeRequest):
    """Clears short-term chat state only. Graph memory is untouched - that is the point of the demo."""
    return WipeResponse(session_id=req.session_id, wiped=chat_mod.wipe_session(req.session_id))
