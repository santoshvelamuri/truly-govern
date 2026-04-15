#!/bin/bash
set -e

echo "=== Archigent Database Initialization ==="

# Enable pgvector extension
psql -U postgres -d truly_govern -c "CREATE EXTENSION IF NOT EXISTS vector;"

# Apply migrations in order
SCHEMA_DIR="/schema"

# Track applied migrations
psql -U postgres -d truly_govern -c "
CREATE TABLE IF NOT EXISTS _migration_history (
  id SERIAL PRIMARY KEY,
  filename TEXT NOT NULL UNIQUE,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
"

# Define migration order
MIGRATIONS=(
  "001_core.sql"
  "002_governance.sql"
  "003_technology_domains.sql"
  "004_arb_boards.sql"
  "005_pattern_library.sql"
  "006_notifications.sql"
  "007_governance_deviations.sql"
  "008_waiver_enrichment.sql"
  "009_condition_verification.sql"
)

for migration in "${MIGRATIONS[@]}"; do
  filepath="$SCHEMA_DIR/$migration"
  if [ ! -f "$filepath" ]; then
    echo "  SKIP: $migration (file not found)"
    continue
  fi

  # Check if already applied
  applied=$(psql -U postgres -d truly_govern -tAc "SELECT COUNT(*) FROM _migration_history WHERE filename = '$migration';")
  if [ "$applied" -gt 0 ]; then
    echo "  SKIP: $migration (already applied)"
    continue
  fi

  echo "  APPLY: $migration"
  psql -U postgres -d truly_govern -f "$filepath"
  psql -U postgres -d truly_govern -c "INSERT INTO _migration_history (filename) VALUES ('$migration');"
done

echo "=== Database initialization complete ==="
