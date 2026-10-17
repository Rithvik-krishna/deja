"""Shared graph utilities ported from MockEngine._G.
Provides GraphPayload builder and ISO-8601 formatting for Neo4j temporal types.
"""
from datetime import date, datetime, timezone
from typing import Any, Optional

from .engine import edge_id
from .schemas import GraphEdge, GraphNode, GraphPayload


def to_iso(v: Any) -> Optional[str]:
    """Convert a Neo4j or Python date/datetime to ISO string.
    - datetimes normalized to UTC: 'YYYY-MM-DDTHH:MM:SSZ'
    - dates: 'YYYY-MM-DD'
    - None: None
    """
    if v is None:
        return None
    if isinstance(v, str):
        return v
    if hasattr(v, "to_native"):
        v = v.to_native()
    if isinstance(v, datetime):
        if v.tzinfo is None:
            v = v.replace(tzinfo=timezone.utc)
        else:
            v = v.astimezone(timezone.utc)
        return v.strftime("%Y-%m-%dT%H:%M:%SZ")
    if isinstance(v, date):
        return v.isoformat()
    return str(v)


class G:
    """GraphPayload builder matching MockEngine._G."""
    def __init__(self):
        self.nodes: dict[str, GraphNode] = {}
        self.edges: dict[str, GraphEdge] = {}

    def node(
        self,
        id: str,
        label: str,
        name: str,
        highlight: bool = False,
        score: Optional[float] = None,
        **props: Any,
    ):
        n = self.nodes.get(id)
        if n:
            n.highlight = n.highlight or highlight
            if score is not None:
                n.score = score
            n.props.update(props)
            return
        self.nodes[id] = GraphNode(
            id=id,
            label=label,
            name=name,
            props=props,
            highlight=highlight,
            score=score,
        )

    def edge(
        self,
        s: str,
        t: str,
        type: str,
        highlight: bool = False,
        **props: Any,
    ):
        eid = edge_id(s, type, t)
        if eid in self.edges:
            self.edges[eid].highlight = self.edges[eid].highlight or highlight
            self.edges[eid].props.update(props)
        else:
            self.edges[eid] = GraphEdge(
                id=eid,
                source=s,
                target=t,
                type=type,
                props=props,
                highlight=highlight,
            )

    def payload(self) -> GraphPayload:
        return GraphPayload(
            nodes=list(self.nodes.values()),
            edges=list(self.edges.values()),
        )
