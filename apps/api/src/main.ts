import pg from "pg";
import { systemClock } from "./clock";
import { makeCompiler } from "./compile";
import { PgStore } from "./pgStore";
import { startRunner } from "./runner";
import { buildServer } from "./server";

const pool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ??
    "postgres://bathroombestie:bathroombestie@localhost:5432/bathroombestie",
});
const store = new PgStore(pool);
const app = buildServer({ store, clock: systemClock, compiler: makeCompiler() });
startRunner(store, systemClock);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
console.log(process.env.GEMINI_API_KEY ? "compiler: gemini" : "compiler: offline mock");
