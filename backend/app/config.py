import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
try:
    from dotenv import load_dotenv
    load_dotenv(ROOT / ".env")
except Exception:  # dotenv optional
    pass

SEED_PATH = Path(os.getenv("DEJA_SEED_PATH", ROOT / "data" / "seed.json"))
MODE = os.getenv("MODE", "mock").lower()  # "mock" (in-memory reference engine) | "live" (Neo4j)

NEO4J_URI = os.getenv("NEO4J_URI", "")
NEO4J_USERNAME = os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "")
NEO4J_DATABASE = os.getenv("NEO4J_DATABASE") or None

# LLM keys are used only by app/chat.py once the LLM agent is implemented.
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
