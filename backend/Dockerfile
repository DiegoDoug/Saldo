# Saldo backend — uvicorn + FastAPI.
# Slim base keeps the image small enough to build comfortably on a Raspberry Pi.
FROM python:3.11-slim

# Don't buffer stdout/stderr (so logs show up in `docker compose logs` live),
# and don't write .pyc files into the image.
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# Tesseract does the OCR step of the receipt-import pipeline (pytesseract is
# just a thin wrapper over this binary, not the OCR engine itself). Spanish +
# English language data cover this app's primary audience; add more
# `tesseract-ocr-<lang>` packages here if you fork for another locale.
RUN apt-get update \
    && apt-get install --no-install-recommends -y tesseract-ocr tesseract-ocr-spa \
    && rm -rf /var/lib/apt/lists/*

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy the application source.
COPY . .

# The SQLite volume mounts here (see docker-compose.yml).
# Strip any CRLF line endings a Windows checkout may have introduced, otherwise
# the `#!/bin/sh` shebang becomes `#!/bin/sh\r` and the container fails to start
# with "/bin/sh: no such file or directory".
RUN sed -i 's/\r$//' entrypoint.sh \
    && mkdir -p /app/data \
    && chmod +x entrypoint.sh

EXPOSE 8000

# Entrypoint runs `alembic upgrade head` then launches uvicorn.
CMD ["./entrypoint.sh"]
