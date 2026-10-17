import pg from "pg";
import { systemClock } from "./clock";
import { makeCompiler } from "./compile";
import { PgStore } from "./pgStore";
import { startRunner } from "./runner";
import { buildServer } from "./server";
import { MemoryStore, type Store } from "./store";

// STORE=memory: no database (a laptop demo without Docker). Everything is lost on restart.
const memory = process.env.STORE === "memory";
const store: Store = memory
  ? new MemoryStore()
  : new PgStore(
      new pg.Pool({
        connectionString:
          process.env.DATABASE_URL ??
          "postgres://bathroombestie:bathroombestie@localhost:5432/bathroombestie",
      }),
    );
// DEMO_MODE=1: new nights get minutes-long timers (DEMO_THRESHOLDS) and say so on the plan screen.
const demo = process.env.DEMO_MODE === "1";
const app = buildServer({ store, clock: systemClock, compiler: makeCompiler(), demo });
startRunner(store, systemClock);
await app.listen({ port: Number(process.env.PORT ?? 3000), host: "0.0.0.0" });
console.log(process.env.GEMINI_API_KEY ? "compiler: gemini" : "compiler: offline mock");
console.log(
  `store: ${memory ? "memory (nothing is saved)" : "postgres"}${demo ? " | DEMO MODE" : ""}`,
);
