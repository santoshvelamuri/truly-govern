/**
 * Database Migration Runner
 *
 * Applies numbered SQL migration files from .github/schema/ to Supabase.
 *
 * Usage:
 *   npx ts-node scripts/migrate.ts              # Apply all pending migrations
 *   npx ts-node scripts/migrate.ts --dry-run    # Preview without applying
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local
 */

import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(__dirname, "../schema");
const MIGRATION_ORDER = [
  "001_core.sql",
  "002_governance.sql",
  "003_technology_domains.sql",
  "004_arb_boards.sql",
  "005_pattern_library.sql",
  "006_notifications.sql",
  "007_governance_deviations.sql",
  "008_waiver_enrichment.sql",
  "009_condition_verification.sql",
];

const dryRun = process.argv.includes("--dry-run");

async function main() {
  // Load env from .env.local if available
  const envPath = path.resolve(__dirname, "../.env.local");
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, "utf-8");
    for (const line of envContent.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const value = trimmed.slice(eqIdx + 1).trim();
      if (!process.env[key]) process.env[key] = value;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Error: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
    console.error("Set them in .env.local or as environment variables.");
    process.exit(1);
  }

  const { createClient } = await import("@supabase/supabase-js");
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Create migration history table
  await supabase.rpc("exec_sql", {
    sql: `CREATE TABLE IF NOT EXISTS _migration_history (
      id SERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );`,
  }).then(() => {}).catch(() => {
    // rpc may not exist; try direct query
    console.log("Note: Could not create migration history table via RPC. Apply migrations manually if needed.");
  });

  console.log(dryRun ? "\n=== DRY RUN — No changes will be made ===" : "\n=== Applying Migrations ===");
  console.log(`Source: ${MIGRATIONS_DIR}\n`);

  let applied = 0;
  let skipped = 0;

  for (const filename of MIGRATION_ORDER) {
    const filepath = path.join(MIGRATIONS_DIR, filename);

    if (!fs.existsSync(filepath)) {
      console.log(`  SKIP: ${filename} (file not found)`);
      skipped++;
      continue;
    }

    // Check if already applied
    const { data: existing } = await supabase
      .from("_migration_history")
      .select("id")
      .eq("filename", filename)
      .single();

    if (existing) {
      console.log(`  SKIP: ${filename} (already applied)`);
      skipped++;
      continue;
    }

    const sql = fs.readFileSync(filepath, "utf-8");
    const sizeKb = (sql.length / 1024).toFixed(1);

    if (dryRun) {
      console.log(`  WOULD APPLY: ${filename} (${sizeKb} KB)`);
      applied++;
      continue;
    }

    console.log(`  APPLYING: ${filename} (${sizeKb} KB)...`);

    // Apply via Supabase REST — execute the SQL
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ sql }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      console.error(`  ERROR: ${filename} — ${errorText}`);
      console.error("  Migration aborted. Fix the error and re-run.");
      process.exit(1);
    }

    // Record in migration history
    await supabase.from("_migration_history").insert({ filename });
    console.log(`  DONE: ${filename}`);
    applied++;
  }

  console.log(`\n=== ${dryRun ? "Dry run" : "Migration"} complete: ${applied} applied, ${skipped} skipped ===\n`);
}

main().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
