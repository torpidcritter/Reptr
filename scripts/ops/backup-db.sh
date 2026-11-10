#!/usr/bin/env bash
# Takes a logical backup of the Reptr database (schema + data, including auth.users),
# compressed and encrypted to a recipient key, so the file is safe to store off-site.
#
#   BACKUP_DATABASE_URL  direct connection string (port 5432, not the 6543 pooler)
#   BACKUP_AGE_RECIPIENT age public key (age1...) that can decrypt the backup
#   BACKUP_DIR           where to write it (default ./backups)
#
# Restore: see docs/ops/BACKUP_AND_RECOVERY.md. Never commit the output.
set -euo pipefail

: "${BACKUP_DATABASE_URL:?set BACKUP_DATABASE_URL (direct connection, port 5432)}"
: "${BACKUP_AGE_RECIPIENT:?set BACKUP_AGE_RECIPIENT (age public key)}"
dir="${BACKUP_DIR:-./backups}"
mkdir -p "$dir"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
out="$dir/reptr-db-$stamp.dump.age"

# Custom format restores selectively and in parallel. Supabase-managed schemas other
# than auth are left out; they're recreated by the platform.
pg_dump "$BACKUP_DATABASE_URL" \
  --format=custom --no-owner --no-privileges \
  --schema=public --schema=auth --schema=drizzle \
  | age --recipient "$BACKUP_AGE_RECIPIENT" --output "$out"

size="$(wc -c <"$out")"
if [ "$size" -lt 1024 ]; then
  echo "Backup looks empty ($size bytes): $out" >&2
  exit 1
fi
echo "Wrote $out ($size bytes)"
