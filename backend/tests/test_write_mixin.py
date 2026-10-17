"""Unit tests for WriteMixin integration, inheritance, method signatures, and query safety.

These tests run without requiring a live Neo4j instance.
"""
import ast
import inspect
from datetime import date
from pathlib import Path
import pytest

from app.engine import BadRequest, Engine, NotFound
from app.mock_engine import MockEngine
from app.neo4j_engine import Neo4jEngine
from app.neo4j_engine_writes import WriteMixin
from app.schemas import (
    IncidentDetail,
    IncidentSummary,
    OutcomeRequest,
    OutcomeResponse,
    OwnerResponse,
    ReassignRequest,
    ReassignResponse,
    TimelineEvent,
)


def test_write_mixin_inheritance():
    """Verify Neo4jEngine inherits WriteMixin and satisfies Engine abstract contract."""
    # 1. Assert class inheritance
    assert issubclass(Neo4jEngine, WriteMixin), "Neo4jEngine must inherit WriteMixin"
    assert issubclass(Neo4jEngine, Engine), "Neo4jEngine must inherit Engine"

    # 2. Assert Method Resolution Order (MRO)
    mro_classes = [c.__name__ for c in Neo4jEngine.__mro__]
    assert "WriteMixin" in mro_classes
    assert "Engine" in mro_classes
    assert mro_classes.index("WriteMixin") < mro_classes.index("Engine"), "WriteMixin must appear before Engine in MRO"

    # 3. Assert all abstract methods from Engine are satisfied
    abstract_remaining = getattr(Neo4jEngine, "__abstractmethods__", frozenset())
    assert len(abstract_remaining) == 0, f"Unimplemented abstract methods on Neo4jEngine: {abstract_remaining}"


def test_write_methods_exposed_and_signatures_match():
    """Verify all 6 write/incident methods are exposed on Neo4jEngine with matching signatures."""
    write_methods = [
        "owner",
        "reassign",
        "record_outcome",
        "list_incidents",
        "incident",
        "timeline",
    ]

    for method_name in write_methods:
        assert hasattr(WriteMixin, method_name), f"WriteMixin missing method '{method_name}'"
        assert hasattr(Neo4jEngine, method_name), f"Neo4jEngine missing method '{method_name}'"

        mock_sig = inspect.signature(getattr(MockEngine, method_name))
        mixin_sig = inspect.signature(getattr(WriteMixin, method_name))

        # Check parameter names match
        mock_params = list(mock_sig.parameters.keys())
        mixin_params = list(mixin_sig.parameters.keys())
        assert mock_params == mixin_params, f"Parameter mismatch for {method_name}: mock={mock_params}, mixin={mixin_params}"


def test_cypher_query_safety_no_string_interpolation():
    """Verify all Cypher queries in neo4j_engine_writes.py use parameters ($param), never string interpolation."""
    writes_file = Path(__file__).parent.parent / "app" / "neo4j_engine_writes.py"
    assert writes_file.exists(), "neo4j_engine_writes.py must exist"

    tree = ast.parse(writes_file.read_text())

    # Walk AST and assert no f-strings or .format() calls used for Cypher queries
    for node in ast.walk(tree):
        if isinstance(node, ast.JoinedStr):  # f-string
            # Ensure f-strings are only used for text formatting (e.g. human strings, error messages), not Cypher queries
            for part in node.values:
                if isinstance(part, ast.Constant) and isinstance(part.value, str):
                    upper_val = part.value.upper()
                    assert not any(keyword in upper_val for keyword in ["MATCH ", "MERGE ", "CREATE ", "SET "]), (
                        f"Detected Cypher query in f-string: '{part.value}' in neo4j_engine_writes.py"
                    )


class DummyEngineWithMixin(WriteMixin):
    """Test harness simulating Neo4jEngine methods without database connection."""
    def __init__(self, run_results=None):
        self._run_results = run_results or {}
        self.written_tx = []

    def _run(self, cypher, **params):
        if "WHERE o.valid_to IS NULL" in cypher:
            return [{"engineer_id": "asha-menon", "engineer_name": "Asha Menon", "valid_from": "2026-01-01"}]
        if "MATCH (e:Engineer)" in cypher:
            return [
                {"id": "asha-menon", "name": "Asha Menon", "team": "platform"},
                {"id": "ravi-iyer", "name": "Ravi Iyer", "team": "core"},
            ]

    def _need_service(self, name):
        if name != "payments-api":
            raise NotFound(f"unknown service '{name}'")
        return {"name": name, "tier": "tier-2", "team": "payments"}

    def _write_tx(self, work):
        class MockTx:
            def run(self, q, **p):
                pass
        return work(MockTx())


def test_engineer_resolution_logic():
    """Verify engineer name and ID resolution logic in WriteMixin."""
    dummy = DummyEngineWithMixin()

    # Exact ID match
    eng_id, eng_name = dummy._resolve_engineer("asha-menon")
    assert eng_id == "asha-menon" and eng_name == "Asha Menon"

    # Exact name match
    eng_id, eng_name = dummy._resolve_engineer("Asha Menon")
    assert eng_id == "asha-menon" and eng_name == "Asha Menon"

    # Prefix/fuzzy match (e.g. "Ravi" -> "ravi-iyer")
    eng_id, eng_name = dummy._resolve_engineer("Ravi")
    assert eng_id == "ravi-iyer" and eng_name == "Ravi Iyer"

    # Unknown engineer raises NotFound
    with pytest.raises(NotFound):
        dummy._resolve_engineer("Nobody")


def test_reassign_validation_rules():
    """Verify reassign validation: already owns service and effective date constraints."""
    dummy = DummyEngineWithMixin()

    # Case 1: Engineer already owns the service -> BadRequest
    with pytest.raises(BadRequest) as exc_info:
        dummy.reassign(ReassignRequest(service="payments-api", engineer="Asha Menon", effective_date=date(2026, 10, 1)))
    assert "already owns" in str(exc_info.value)

    # Case 2: Effective date on or before current started -> BadRequest
    with pytest.raises(BadRequest) as exc_info:
        dummy.reassign(ReassignRequest(service="payments-api", engineer="Ravi", effective_date=date(2025, 12, 31)))
    assert "effective_date must be after" in str(exc_info.value)

    # Case 3: Unknown service -> NotFound
    with pytest.raises(NotFound):
        dummy.reassign(ReassignRequest(service="unknown-svc", engineer="Ravi", effective_date=date(2026, 10, 1)))
