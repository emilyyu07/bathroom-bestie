import cors from "@fastify/cors";
import Fastify from "fastify";
import { z } from "zod";
import {
  EvidenceReport,
  FriendAction,
  FriendReason,
  PresetName,
  ReadinessSnapshot,
  roundCoord,
  thresholdsFor,
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
const PresetBody = z.object({ preset: PresetName });
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
  // Browser clients in development (mobile via expo --web, the console) run on localhost ports.
  // The native app sends no Origin, so this does not affect it.
  void app.register(cors, { origin: /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/ });

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

  // The preset picked in the app. Only before the night starts; readiness must be re-run after.
  app.post<{ Params: { id: string } }>("/contracts/:id/preset", async (req, reply) => {
    const { preset } = PresetBody.parse(req.body);
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const prev = stored.contract;
    const contract = { ...prev, preset, thresholds: thresholdsFor(preset, prev.thresholds) };
    if (!(await store.updateDraft(contract)))
      return reply.code(409).send({ error: "already_active" });
    return { contract, terms: termsOf(contract) };
  });

  app.get("/health", async () => ({ ok: true })); // pre-flight times this round trip

  // The phone's view of a night (status screen): the contract and whether it is running.
  app.get<{ Params: { id: string } }>("/contracts/:id", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    return { contract: stored.contract, status: stored.status };
  });

  // A friend agrees to watch. The owner (first member) can't watch her own night.
  app.post<{ Params: { id: string; who: string } }>(
    "/contracts/:id/watchers/:who/accept",
    async (req, reply) => {
      const stored = await store.getContract(req.params.id);
      if (!stored) return reply.code(404).send({ error: "unknown_contract" });
      const [owner, ...friends] = stored.contract.group.members;
      if (req.params.who === owner || !friends.includes(req.params.who))
        return reply.code(403).send({ error: "not_a_watcher" });
      await store.acceptWatcher(stored.contract.id, req.params.who, clock.nowMinute());
      return reply.code(202).send({ ok: true });
    },
  );

  // Pre-flight's watcher list. "Reachable" is "accepted" until push delivery exists.
  app.get<{ Params: { id: string } }>("/contracts/:id/watchers", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const accepted = new Set(await store.acceptedWatchers(stored.contract.id));
    return {
      watchers: stored.contract.group.members
        .slice(1)
        .map((id) => ({ id, accepted: accepted.has(id), reachable: accepted.has(id) })),
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
