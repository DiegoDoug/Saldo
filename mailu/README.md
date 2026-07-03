# Mailu — email server for Saldo

Saldo sends exactly one kind of email: the **password-reset link**. It does so
only when `SALDO_SMTP_HOST` is configured; with that variable blank, the app
logs the email instead of sending it, so local dev, tests, and the default
`docker compose up` need no mail infrastructure at all.

This directory is the **reference way to run your own SMTP endpoint** on a
self-hosted deploy (a Raspberry Pi, a VPS) using [Mailu](https://mailu.io),
without renting a third-party email service. It is an **optional, separate
compose stack** — deliberately kept out of the repo-root `docker-compose.yml`
so the core app stays light (Mailu is ~7 containers with persistent storage).

## Quick start

```bash
cd mailu
cp mailu.env.example mailu.env      # then edit DOMAIN, HOSTNAMES, secrets…
docker compose up -d
```

Then open `https://<HOSTNAMES>/admin`, log in with the `INITIAL_ADMIN_*`
credentials, and:

1. Create the sender mailbox, e.g. `noreply@your-domain`.
2. Generate an **app password** for it (Settings → Auth tokens). Use that, not
   the login password, in the backend config.

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
for development and CI.

## DNS you must add (for mail to be delivered, not spam-foldered)

In your domain's DNS, create:

- **MX** → `mail.your-domain` (priority 10).
- **A/AAAA** for `mail.your-domain` → this server's public IP.
- **SPF** (TXT on the root): `v=spf1 mx ~all`.
- **DKIM**: the Mailu admin UI generates the key under *Domains → your-domain →
  DNS settings* — copy the TXT record it shows.
- **DMARC** (TXT on `_dmarc`): `v=DMARC1; p=quarantine; rua=mailto:admin@your-domain`.
- **PTR / reverse DNS** for the server IP → `mail.your-domain` (set at your
  hosting provider; many mail receivers reject senders without it).

## TLS

`TLS_FLAVOR` in `mailu.env` controls certificates:

- `letsencrypt` (recommended) — automatic certs; ports 80 and 443 must be
  reachable from the internet and DNS must already resolve.
- `cert` — drop your own `cert.pem`/`key.pem` in `./data/certs`.
- `notls` — **local development only**, never expose this to the internet.

## Notes

- Data (mail, certs, DKIM keys, config) lives under `./data`, which is
  gitignored. Back it up.
- The image tag is pinned (`2024.06`). To regenerate a stack for a newer
  release or with different features (webmail, antivirus, OIDC), use the
  official wizard at <https://setup.mailu.io> and replace `docker-compose.yml`.
- Saldo only ever acts as an SMTP *client*; it does not read mailboxes. IMAP
  ports are exposed only so you can inspect the sender account if needed.
