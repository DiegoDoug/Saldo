# Saldo backend — uvicorn + FastAPI.
# Slim base keeps the image small enough to build comfortably on a Raspberry Pi.
FROM python:3.11-slim

# Don't buffer stdout/stderr (so logs show up in `docker compose logs` live),
# and don't write .pyc files into the image.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source.
COPY . .

# The SQLite volume mounts here (see docker-compose.yml).
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
