#!/bin/sh
# Nightly backup of the Saldo SQLite database to an S3-compatible bucket.
#
# Takes a *consistent* snapshot via `sqlite3 .backup` (safe while the app is
# running), gzips it with a timestamp, and uploads it. Works with AWS S3,
# Backblaze B2, MinIO, or any S3-compatible endpoint.
#
# Configure via environment:
#   SALDO_DB_PATH    path to saldo.db          (default: ./data/saldo.db)
#   S3_DEST          destination, e.g. s3://my-bucket/saldo   (required)
#   AWS_ENDPOINT_URL override for non-AWS S3   (optional, e.g. Backblaze B2)
#   plus the usual AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY / AWS_DEFAULT_REGION
#
# Requires: sqlite3 and the aws CLI on PATH.
#
# Example cron entry (nightly at 03:30):
#   30 3 * * * S3_DEST=s3://my-bucket/saldo /path/to/Saldo/ops/backup.sh >> /var/log/saldo-backup.log 2>&1

set -eu

DB_PATH="${SALDO_DB_PATH:-./data/saldo.db}"
: "${S3_DEST:?Set S3_DEST, e.g. s3://my-bucket/saldo}"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found at $DB_PATH" >&2
  exit 1
fi

STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

SNAPSHOT="$WORKDIR/saldo-$STAMP.db"
ARCHIVE="$SNAPSHOT.gz"

echo "Snapshotting $DB_PATH -> $SNAPSHOT"
sqlite3 "$DB_PATH" ".backup '$SNAPSHOT'"

echo "Compressing"
gzip "$SNAPSHOT"

echo "Uploading to $S3_DEST/"
if [ -n "${AWS_ENDPOINT_URL:-}" ]; then
  aws --endpoint-url "$AWS_ENDPOINT_URL" s3 cp "$ARCHIVE" "$S3_DEST/"
else
  aws s3 cp "$ARCHIVE" "$S3_DEST/"
fi

echo "Backup complete: $(basename "$ARCHIVE")"
