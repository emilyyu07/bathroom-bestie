import cors from "@fastify/cors";
import { randomUUID } from "node:crypto";
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
import { initialState, preflight } from "@bathroombestie/engine";
import type { Clock } from "./clock";
import { buildContract, safeReadBack, termsOf, type Compiler } from "./compile";
import { backstageOf } from "./backstage";
import { EmergencyContact, emergencyNotice } from "./emergency";
import { idPrefixOfCode, joinCodeOf } from "./join";
import type { Store } from "./store";

export interface Deps {
  store: Store;
  clock: Clock;
  compiler: Compiler;
  /** Compile demo nights (DEMO_THRESHOLDS). Set by DEMO_MODE=1 in main.ts. */
  demo?: boolean;
}

const CompileBody = z.object({
  sentence: z.string().min(3).max(500),
  area: z.object({ lat: z.number(), lon: z.number() }).default({ lat: 43.65, lon: -79.38 }),
  // Her first name, used as her id so alerts read "ana left the group…" (B6). Lower-cased later.
  me: z
    .string()
    .trim()
    .min(1)
    .max(30)
    .regex(/^\p{L}[\p{L}\p{M}' -]*$/u)
    .default("me"),
  localTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/)
    .optional(),
});
const IncidentsQuery = z.object({ contractId: z.string().optional(), to: z.string().optional() });
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

export function buildServer({ store, clock, compiler, demo = false }: Deps) {
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
    const contract = buildContract(draft, ctx, body.sentence, body.me, demo, randomUUID());
    await store.saveContract(contract);
    return {
      contract,
      readBack: safeReadBack(draft.read_back, contract),
      terms: termsOf(contract),
      joinCode: joinCodeOf(contract.id),
    };
  });

  // The preset picked in the app. Only before the night starts; readiness must be re-run after.
  app.post<{ Params: { id: string } }>("/contracts/:id/preset", async (req, reply) => {
    const { preset } = PresetBody.parse(req.body);
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const prev = stored.contract;
    // A demo night keeps its shortened timers; the preset is only the label then.
    const contract = {
      ...prev,
      preset,
      thresholds: prev.demo ? prev.thresholds : thresholdsFor(preset, prev.thresholds),
    };
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

  // The presenter's view of a night: who is reporting or quiet, open incidents and their rung, and
  // who was told what. State only: it carries no location, so it is not live position sharing.
  app.get<{ Params: { id: string } }>("/contracts/:id/backstage", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const { contract } = stored;
    const state = (await store.getEngine(contract.id))?.state ?? initialState(contract);
    const alerts = await store.listAlerts(contract.id);
    const contact = await store.getEmergencyContact(contract.id);
    const actions = (await store.actionsAfter(contract.id, 0)).map((r) => r.a);
    const now = clock.nowMinute();
    return backstageOf(
      contract,
      stored.status,
      state,
      alerts,
      await store.acceptedWatchers(contract.id),
      now,
      // The backstage copy leaves out the map link: that view carries no location.
      { contact, notice: emergencyNotice(contract, contact, alerts, actions, now, false) },
    );
  });

  // A friend typed the code she read out. Returns just enough to pick who they are and accept.
  app.get<{ Params: { code: string } }>("/join/:code", async (req, reply) => {
    const prefix = idPrefixOfCode(req.params.code);
    if (!prefix) return reply.code(400).send({ error: "invalid_code" });
    const found = await store.findByIdPrefix(prefix);
    if (found.length === 0) return reply.code(404).send({ error: "unknown_code" });
    if (found.length > 1) return reply.code(409).send({ error: "ambiguous_code" });
    const { contract, status } = found[0]!;
    const accepted = new Set(await store.acceptedWatchers(contract.id));
    const [owner, ...friends] = contract.group.members;
    return {
      contractId: contract.id,
      owner,
      status,
      expires: contract.expires,
      friends: friends.map((id) => ({ id, accepted: accepted.has(id) })),
    };
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

  // The planner's emergency contact. Friends read it all night (Call / Text on their own phones);
  // `notice` is the message BathroomBestie would send them if no friend responds to a top-rung
  // alert. Demo only: nothing is ever sent.
  app.put<{ Params: { id: string } }>("/contracts/:id/emergency-contact", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const parsed = EmergencyContact.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "bad_contact" });
    await store.setEmergencyContact(stored.contract.id, parsed.data);
    return { contact: parsed.data };
  });
  app.delete<{ Params: { id: string } }>("/contracts/:id/emergency-contact", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    await store.setEmergencyContact(stored.contract.id, null);
    return { contact: null };
  });
  app.get<{ Params: { id: string } }>("/contracts/:id/emergency-contact", async (req, reply) => {
    const stored = await store.getContract(req.params.id);
    if (!stored) return reply.code(404).send({ error: "unknown_contract" });
    const id = stored.contract.id;
    const contact = await store.getEmergencyContact(id);
    const notice = emergencyNotice(
      stored.contract,
      contact,
      await store.listAlerts(id),
      (await store.actionsAfter(id, 0)).map((r) => r.a),
      clock.nowMinute(),
    );
    return { contact, notice };
  });

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
    // An arrival is an event, not a place: drop any location a client sent with it (invariant 5).
    const report = { ...e, t: Math.min(e.t, clock.nowMinute()) };
    if (report.homeArrived) delete report.area;
    await store.addEvidence(report);
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

  // `to=<personId>`: only alerts addressed to that person (the friend's view polls this).
  app.get("/incidents", async (req) => {
    const q = IncidentsQuery.parse(req.query);
    return { alerts: await store.listAlerts(q.contractId, q.to) };
  });

  return app;
}
