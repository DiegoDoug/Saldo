"""Stage 0 placeholder API.

A minimal FastAPI app so `docker compose up` has a running backend from the very
first commit. Stage 1 replaces this with a proper app factory under
`app/core/` and real modules under `app/modules/`.
"""

from fastapi import FastAPI

app = FastAPI(title="Saldo API (placeholder)")


@app.get("/")
def root() -> dict[str, str]:
    return {"app": "saldo", "status": "placeholder", "stage": "0"}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
