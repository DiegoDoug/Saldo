# Stalwart — email server for Saldo

Saldo sends exactly one kind of email: the **password-reset link**. It does so
only when `SALDO_SMTP_HOST` is configured; with that variable blank, the app
logs the email instead of sending it, so local dev, tests, and the default
`docker compose up` need no mail infrastructure at all.

This directory is the **reference way to run your own SMTP endpoint** on a
self-hosted deploy (a Raspberry Pi, a VPS) using
[Stalwart](https://stalw.art) — a single Rust binary that speaks SMTP, IMAP,
JMAP and more. It is an **optional, separate compose stack**, deliberately kept
out of the repo-root `docker-compose.yml` so the core app stays light.

Why Stalwart here: it is **one container** (~120 MiB idle, ~0% CPU), runs
comfortably on a 512 MB Raspberry Pi, and ships a multi-arch image — a better
fit for this Pi-friendly, forkable app than a multi-service mail suite.

## Quick start

```bash
cd stalwart
docker compose up -d

# First boot generates config + a random admin password. Grab it:
docker compose logs stalwart | grep -i administrator
```

Then open `http://<host>:8080/login`, log in as `admin` with that password, and:

1. Set your domain and hostname (Settings → Server / Domains) to match your DNS.
2. Create the sender account, e.g. `noreply@your-domain`.
3. Give it an **app password** (or use its mailbox password) — that's what the
   backend authenticates with.

> The admin UI on `:8080` is unauthenticated-until-login HTTP. In production put
> it behind a reverse proxy with TLS, a VPN, or firewall it off — don't expose
> `8080` to the public internet.

## Point Saldo at it

Set these on the **backend** (in the repo-root `.env`), then restart the app:

```bash
SALDO_SMTP_HOST=mail.your-domain      # host running this stack
SALDO_SMTP_PORT=587                   # STARTTLS submission
SALDO_SMTP_USER=noreply@your-domain
SALDO_SMTP_PASSWORD=<app password>
SALDO_SMTP_FROM=noreply@your-domain
SALDO_SMTP_STARTTLS=true
SALDO_FRONTEND_BASE_URL=https://your-saldo-domain   # used to build the reset link
```

Leaving `SALDO_SMTP_HOST` blank disables sending (emails are logged) — handy
for development and CI. Nothing in the Saldo backend is Stalwart-specific: it is
a plain SMTP client, so any SMTP server (or provider) works with the same vars.

## DNS you must add (for mail to be delivered, not spam-foldered)

Running any mail server on the public internet requires this — it is not
specific to Stalwart. In your domain's DNS, create:

- **MX** → `mail.your-domain` (priority 10).
- **A/AAAA** for `mail.your-domain` → this server's public IP.
- **SPF** (TXT on the root): `v=spf1 mx ~all`.
- **DKIM**: Stalwart generates the key on first boot; copy the TXT record it
  shows under *Settings → DKIM* (or in the config/data dir) into your DNS.
- **DMARC** (TXT on `_dmarc`): `v=DMARC1; p=quarantine; rua=mailto:admin@your-domain`.
- **PTR / reverse DNS** for the server IP → `mail.your-domain` (set at your
  hosting provider; many mail receivers reject senders without it).

## TLS

Stalwart can obtain certificates automatically via ACME (Let's Encrypt) —
enable it under *Settings → TLS / ACME* and make sure ports 80/443 are reachable
and DNS resolves. Alternatively provide your own certificate. For **local-only**
testing you can use plaintext submission (port 587 without STARTTLS) — never do
that on an internet-exposed server.

## Notes

- Config, data, and DKIM keys live under `./data` (mounted at
  `/opt/stalwart`), which is gitignored. **Back it up.**
- The image tag is pinned (`v0.16.11`). Stalwart moves quickly and its config
  schema evolves between releases, so bump the tag deliberately and read that
  release's notes rather than tracking `latest`.
- Saldo only ever acts as an SMTP *client*; it does not read mailboxes. IMAP/
  JMAP ports are exposed only so you can inspect the sender account if needed.
