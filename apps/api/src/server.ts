import Fastify from "fastify";
import { z } from "zod";
import {
  EvidenceReport,
  FriendAction,
  FriendReason,
  ReadinessSnapshot,
  roundCoord,
} from "@bathroombestie/schema";
import { preflight } from "@bathroombestie/engine";
import type { Clock } from "./clock";
import { buildContract, safeReadBack, termsOf, type Compiler } from "./compile";
import type { Store } from "./store";

export interface Deps {
  store: Store;
  clock: Clock;
  compiler: Compiler;
}

const CompileBody = z.object({
  sentence: z.string().min(3).max(500),
  area: z.object({ lat: z.number(), lon: z.number() }).default({ lat: 43.65, lon: -79.38 }),
  me: z.string().default("me"),
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
});
const PreflightBody = z.object({ contractId: z.string(), snapshot: ReadinessSnapshot });
const ActionBody = z.object({
  contractId: z.string(),
  type: z.enum(["confirm", "worry"]),
  by: z.string(),
  targetPersonId: z.string(),
  t: z.number().int().optional(),
  reason: FriendReason.optional(),
});

export function buildServer({ store, clock, compiler }: Deps) {
  const app = Fastify();

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof z.ZodError)
      return reply.code(400).send({ error: "invalid_request", issues: err.issues });
    return reply.send(err);
  });

  app.post("/contracts/compile", async (req, reply) => {
    const body = CompileBody.parse(req.body);
    const ctx = {
      now: clock.nowMinute(),
      area: { lat: roundCoord(body.area.lat), lon: roundCoord(body.area.lon) },
      localTime: body.localTime,
    };
    let draft;
    try {
      draft = await compiler.draft(body.sentence, ctx);
    } catch (e) {
      // Model down, rate-limited, or returned an invalid plan: not her input's fault; she can retry.
      req.log.warn({ err: e }, "compile failed");
      return reply.code(503).send({ error: "compiler_unavailable" });
    }
    const contract = buildContract(draft, ctx, body.sentence, body.me);
    await store.saveContract(contract);
    return {
      contract,
      readBack: safeReadBack(draft.read_back, contract),
      terms: termsOf(contract),
    };
  });

  app.post("/preflight", async (req, reply) => {
    const body = PreflightBody.parse(req.body);
    const stored = await store.getContract(body.contractId);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const report = preflight(body.snapshot, stored.contract);
    await store.setReadiness(body.contractId, report);
    return report;
  });

  app.post<{ Params: { id: string } }>("/contracts/:id/activate", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const r = stored.readiness;
    if (!r || r.state === "not_ready") {
      return reply.code(409).send({ error: "not_ready", readiness: r ?? null });
    }
    await store.activate(stored.contract.id);
    return { status: "active", readiness: r };
  });

  app.post("/evidence", async (req, reply) => {
    const e = EvidenceReport.parse(req.body); // parse rounds the area (invariant 5)
    const stored = await store.getContract(e.contractId);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    if (!stored.contract.group.members.includes(e.personId))
      return reply.code(403).send({ error: "not_a_member" });
    await store.addEvidence({ ...e, t: Math.min(e.t, clock.nowMinute()) });
    return reply.code(202).send({ ok: true });
  });

  app.post("/actions", async (req, reply) => {
    const { contractId, ...rest } = ActionBody.parse(req.body);
    const stored = await store.getContract(contractId);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const a = FriendAction.parse({
      ...rest,
      t: Math.min(rest.t ?? clock.nowMinute(), clock.nowMinute()),
    });
    await store.addAction(contractId, a);
    return reply.code(202).send({ ok: true });
  });

  app.get<{ Querystring: { contractId?: string } }>("/incidents", async (req) => ({
    alerts: await store.listAlerts(req.query.contractId),
  }));

  return app;
}
