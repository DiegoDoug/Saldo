# Deploying Saldo

Saldo is designed to run on a Raspberry Pi (or any amd64/arm64 host) with a
single `docker compose up`. This guide covers a local run, exposing it to the
internet with Cloudflare Tunnel, and using the prebuilt images.

## Prerequisites

- Docker and Docker Compose (v2). On a Pi: `curl -fsSL https://get.docker.com | sh`.

## 1. Configure

```bash
git clone https://github.com/DiegoDoug/Saldo.git
cd Saldo
cp .env.example .env
```

Edit `.env` and set a strong JWT secret (this is required before exposing the
app):

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
# paste the output as SALDO_JWT_SECRET in .env
```

## 2. Run

```bash
docker compose up --build
```

- Frontend: <http://localhost:8080>
- Backend API + interactive docs: <http://localhost:8000/docs>

The backend container runs `alembic upgrade head` on startup, so the schema is
created/updated automatically. The SQLite file lives in the named volume
`saldo-data`, so it survives `docker compose down` and image rebuilds.

The `cloudflared` service idles harmlessly until you give it a tunnel token — so
local development needs no tunnel.

## 3. Expose it with Cloudflare Tunnel

Cloudflare Tunnel gives you a public HTTPS URL with no port forwarding and no
exposed home IP.

1. In the [Cloudflare Zero Trust dashboard](https://one.dash.cloudflare.com/) →
   **Networks → Tunnels → Create a tunnel** (type: *Cloudflared*).
2. Name it (e.g. `saldo`) and copy the **tunnel token**.
3. Put the token in `.env`:
   ```
   CLOUDFLARE_TUNNEL_TOKEN=eyJ...   # the long token string
   ```
4. Add a **Public Hostname** to the tunnel:
   - **Subdomain/domain**: e.g. `saldo.example.com`
   - **Service**: `http://frontend:80`

   Route to the `frontend` service — nginx serves the app and proxies `/api` to
   the backend, so one hostname covers everything.
5. Restart the stack:
   ```bash
   docker compose up -d
   ```

Your instance is now reachable at `https://saldo.example.com` from anywhere,
including mobile data. TLS is handled by Cloudflare.

## 4. Raspberry Pi / arm64

The images build natively on arm64. On a fresh Pi, `docker compose up --build`
is the entire install. First build takes a few minutes; subsequent starts are
instant.

## 5. Use the prebuilt images (optional)

Instead of building from source, pull the multi-arch images published to GHCR by
CI. Create a `docker-compose.override.yml`:

```yaml
services:
  backend:
    image: ghcr.io/diegodoug/saldo-backend:main
    build: null
  frontend:
    image: ghcr.io/diegodoug/saldo-frontend:main
    build: null
```

Then `docker compose pull && docker compose up -d`.

## 6. Back up the database

The SQLite file is your only durable state. See
[`ops/backup.sh`](../ops/backup.sh) for a scripted nightly backup to any
S3-compatible bucket, and `TECH_STACK.md` for why this matters on an SD card.

## Updating

```bash
git pull
docker compose up -d --build   # migrations run automatically on backend start
```
