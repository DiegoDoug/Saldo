#!/bin/sh
# Container entrypoint: bring the database schema up to date, then serve.
# Running migrations here means a fresh volume (or an upgraded image) is
# self-healing — `docker compose up` on a new Pi just works.
set -e

echo "Applying database migrations…"
alembic upgrade head

echo "Starting Saldo API…"
exec uvicorn app.main:app --host 0.0.0.0 --port 8000
