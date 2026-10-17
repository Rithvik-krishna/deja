"""Engine interface. MockEngine (in-memory reference) and Neo4jEngine both implement this.
The API and the chat agent only ever talk to an Engine, so swapping mock -> live is one env var (MODE)."""
from abc import ABC, abstractmethod
from datetime import date
from typing import Optional

from .schemas import *  # noqa: F401,F403


class NotFound(Exception):
    pass


class BadRequest(Exception):
    pass


def svc_id(n): return f"svc:{n}"
def eng_id(n): return f"eng:{n}"
def dep_id(n): return f"dep:{n}"
def inc_id(n): return f"inc:{n}"
def fix_id(n): return f"fix:{n}"
def edge_id(s, t, tgt): return f"{s}|{t}|{tgt}"


SYMPTOM_PHRASE = {
    "latency": "latency spiking",
    "timeout": "requests timing out",
    "5xx": "5xx error spike",
    "oom": "pods OOMKilled",
}


class Engine(ABC):
    @abstractmethod
    def health(self) -> Health: ...
    @abstractmethod
    def reset(self) -> DemoResetResponse: ...
    @abstractmethod
    def catalog(self) -> Catalog: ...
    @abstractmethod
    def risk(self, window_days: int = 180, limit: int = 10, as_of: Optional[date] = None) -> RiskResponse: ...
    @abstractmethod
    def blast(self, service: str, depth: int = 3) -> BlastResponse: ...
    @abstractmethod
    def similar_incidents(self, service: str, symptom: Optional[str] = None, limit: int = 5,
                          origin: Optional[str] = None, exclude: Optional[str] = None) -> list[SimilarIncident]: ...
    @abstractmethod
    def fix_stats(self, service: Optional[str] = None, symptom: Optional[str] = None) -> list[FixStat]: ...
    @abstractmethod
    def owner(self, service: str, on: Optional[date] = None) -> OwnerResponse: ...
    @abstractmethod
    def reassign(self, req: ReassignRequest) -> ReassignResponse: ...
    @abstractmethod
    def create_alert(self, req: AlertRequest) -> AlertResponse: ...
    @abstractmethod
    def record_outcome(self, req: OutcomeRequest) -> OutcomeResponse: ...
    @abstractmethod
    def list_incidents(self, status: Optional[str] = None, limit: int = 50) -> list[IncidentSummary]: ...
    @abstractmethod
    def incident(self, incident_id: str) -> IncidentDetail: ...
    @abstractmethod
    def timeline(self, incident_id: str) -> list[TimelineEvent]: ...
