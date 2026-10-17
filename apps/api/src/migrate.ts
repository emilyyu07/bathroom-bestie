import pg from "pg";
import { runMigrations } from "./migrations";

const client = new pg.Client({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://bathroombestie:bathroombestie@localhost:5432/bathroombestie",
});
await client.connect();
try {
  for (const f of await runMigrations(client)) console.log("applied", f);
} finally {
  await client.end();
}
