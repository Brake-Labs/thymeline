#!/usr/bin/env bash
# Run pending Supabase migrations against the linked remote project.
#
# Requires:
#   SUPABASE_DB_URL  — direct Postgres connection string (for psql)
#
# Usage:
#   ./scripts/run-migrations.sh           # apply pending migrations
#   ./scripts/run-migrations.sh --dry-run # show what would run without applying
#
set -euo pipefail

MIGRATIONS_DIR="$(cd "$(dirname "$0")/../supabase/migrations" && pwd)"
DRY_RUN=false
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=true

# ── Validate environment ─────────────────────────────────────────────────────

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "ERROR: SUPABASE_DB_URL is required (direct Postgres connection string)"
  echo "  Find it: Supabase Dashboard → Settings → Database → Connection string (URI)"
  exit 1
fi

# ── Ensure tracking table exists ─────────────────────────────────────────────

psql "$SUPABASE_DB_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS public._migration_history (
  filename TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
SQL

# ── Determine which migrations are pending ───────────────────────────────────

APPLIED=$(psql "$SUPABASE_DB_URL" -t -A -c "SELECT filename FROM public._migration_history ORDER BY filename;")

PENDING=()
for f in "$MIGRATIONS_DIR"/*.sql; do
  name="$(basename "$f")"
  if ! echo "$APPLIED" | grep -qxF "$name"; then
    PENDING+=("$f")
  fi
done

if [[ ${#PENDING[@]} -eq 0 ]]; then
  echo "✅ All migrations are up to date"
  exit 0
fi

echo "📋 ${#PENDING[@]} pending migration(s):"
for f in "${PENDING[@]}"; do
  echo "  - $(basename "$f")"
done

if $DRY_RUN; then
  echo ""
  echo "(dry run — no changes applied)"
  exit 0
fi

# ── Apply each migration in order ────────────────────────────────────────────

FAILED=0
for f in "${PENDING[@]}"; do
  name="$(basename "$f")"
  echo ""
  echo "▶ Applying $name ..."

  if psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; then
    # Record successful application (use dollar-quoting to prevent SQL injection)
    psql "$SUPABASE_DB_URL" -q -c "INSERT INTO public._migration_history (filename) VALUES (\$\$${name}\$\$) ON CONFLICT DO NOTHING;"
    echo "  ✅ $name applied"
  else
    echo "  ❌ $name FAILED — stopping"
    FAILED=1
    break
  fi
done

echo ""
if [[ $FAILED -eq 0 ]]; then
  echo "✅ All migrations applied successfully"
else
  echo "❌ Migration failed — fix the issue and re-run"
  exit 1
fi
