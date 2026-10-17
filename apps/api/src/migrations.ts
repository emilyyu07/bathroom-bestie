import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");

/** Applies pending migrations in filename order, each in its own transaction. Returns those applied. */
export async function runMigrations(client: pg.ClientBase): Promise<string[]> {
  await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)");
  const applied: string[] = [];
  for (const f of readdirSync(dir)
    .filter((x) => x.endsWith(".sql"))
    .sort()) {
    const done = await client.query("SELECT 1 FROM schema_migrations WHERE name = $1", [f]);
    if (done.rowCount) continue;
    await client.query("BEGIN");
    try {
      await client.query(readFileSync(join(dir, f), "utf8"));
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      applied.push(f);
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    }
  }
  return applied;
}
