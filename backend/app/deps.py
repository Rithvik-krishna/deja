from . import config
from .engine import Engine

_engine = None


def build_engine() -> Engine:
    if config.MODE == "live":
        from .neo4j_engine import Neo4jEngine
        return Neo4jEngine()
    from .mock_engine import MockEngine
    return MockEngine()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        _engine = build_engine()
    return _engine


def set_engine(e):  # tests / scripts
    global _engine
    _engine = e
