import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://bathroombestie:bathroombestie@localhost:5432/bathroombestie",
});
await client.connect();
await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY)");
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
    console.log("applied", f);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  }
}
await client.end();
