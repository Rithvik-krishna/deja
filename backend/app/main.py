from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .api import router
from .api_shock import router as shock_router
from .engine import BadRequest, NotFound

app = FastAPI(title="Deja API", version="1.1.0",
              description="Incident copilot with institutional memory (Neo4j). Contract is frozen: see docs/API_CONTRACT.md")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.include_router(shock_router)


@app.exception_handler(NotFound)
async def _nf(_: Request, e: NotFound):
    return JSONResponse({"detail": str(e)}, status_code=404)


@app.exception_handler(BadRequest)
async def _br(_: Request, e: BadRequest):
    return JSONResponse({"detail": str(e)}, status_code=400)


@app.exception_handler(NotImplementedError)
async def _ni(_: Request, e: NotImplementedError):
    return JSONResponse({"detail": f"Not implemented yet: {e}"}, status_code=501)
