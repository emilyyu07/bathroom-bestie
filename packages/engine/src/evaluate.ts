import {
  distanceM,
  type Alert,
  type AlertKind,
  type Contract,
  type EvidenceReport,
  type FriendAction,
} from "@bathroombestie/schema";
import { confidenceOfNormal } from "./confidence";
import { classifySilence, isApart, silentMinutes } from "./signals";
import {
  COOLDOWN_MIN,
  WORRY_RATE_LIMIT_MIN,
  type EngineState,
  type Incident,
  type IncidentKind,
} from "./state";
import { FACTOR_TEMPLATES, REASON_TEXT, TEMPLATES, fill } from "./templates";

export interface EvaluateInput {
  contract: Contract;
  state: EngineState;
  /** New evidence since the last evaluation (append-only log slice). Items after `now` are ignored. */
  evidence: EvidenceReport[];
  /** New friend actions since the last evaluation. */
  actions: FriendAction[];
  /** Injected clock, integer minutes. Call once per minute for exact timings. */
  now: number;
}

export interface EvaluateResult {
  state: EngineState;
  alerts: Alert[];
}

/** Who is watching `target` at `now`: current slot, else first alert_order member that isn't them. */
export const watcherFor = (contract: Contract, target: string, now: number): string | null => {
  const slot = contract.group.watch.find((w) => w.from <= now && now < w.to && w.who !== target);
  if (slot) return slot.who;
  return fallbackOrder(contract, target)[0] ?? null;
};

const fallbackOrder = (contract: Contract, target: string): string[] => {
  const seen = new Set<string>();
  return [...contract.wishes.alert_order, ...contract.group.members].filter((m) => {
    if (m === target || seen.has(m) || !contract.group.members.includes(m)) return false;
    seen.add(m);
    return true;
  });
};

const nextAfter = (contract: Contract, target: string, watcher: string | null): string | null => {
  const order = fallbackOrder(contract, target);
  const rest = order.filter((m) => m !== watcher);
  const idx = watcher ? order.indexOf(watcher) : -1;
  return order[idx + 1] ?? rest[0] ?? null;
};

export function evaluate(input: EvaluateInput): EvaluateResult {
  const { contract, now } = input;
  const state: EngineState = structuredClone(input.state);
  const alerts: Alert[] = [];
  const members = new Set(contract.group.members);

  // 1. Ingest evidence in time order (stable on ties).
  const ev = input.evidence
    .map((e, i) => ({ e, i }))
    .filter(({ e }) => e.t <= now && e.contractId === contract.id && members.has(e.personId))
    .sort((a, b) => a.e.t - b.e.t || a.i - b.i)
    .map(({ e }) => e);
  for (const e of ev) ingest(contract, state, e);

  const emit = (
    inc: Incident,
    kind: AlertKind,
    tpl: string,
    to: string[],
    factors: string[],
    extra: Partial<Alert> = {},
  ) => {
    const p = state.people[inc.personId]!;
    const seq = alerts.length + state.incidents.length * 100;
    alerts.push({
      id: `${inc.id}:r${inc.rung}:${now}:${seq}`,
      contractId: contract.id,
      incidentId: inc.id,
      rung: inc.rung,
      kind,
      personId: inc.personId,
      t: now,
      to,
      factors: factors.slice(0, 3),
      lastKnown:
        p.lastArea && p.lastReportAt !== null ? { area: p.lastArea, t: p.lastReportAt } : null,
      raisedBy: inc.raisedBy,
      message: tpl,
      ...extra,
    });
  };

  const sinceMin = (id: string) => silentMinutes(contract, state, id, now);

  const factorsFor = (id: string): string[] => {
    const p = state.people[id]!;
    const c = confidenceOfNormal(contract, p, now);
    const out: string[] = [];
    const silent = sinceMin(id);
    const cls = classifySilence(contract, state, id, now);
    if (silent >= contract.thresholds.silence_min / 2)
      out.push(fill(FACTOR_TEMPLATES.noUpdate, { minutes: silent }));
    if (p.lastBattery !== null && cls === "unexplained")
      out.push(fill(FACTOR_TEMPLATES.battery, { battery: Math.round(p.lastBattery) }));
    if (isApart(contract, state, id) && contract.group.members.length > 1)
      out.push(FACTOR_TEMPLATES.apart);
    const corridor = c.penalties.find((x) => x.stream === "corridor")!;
    if (corridor.penalty > 0)
      out.push(fill(FACTOR_TEMPLATES.outsideArea, { minutes: corridor.minutes }));
    const move = c.penalties.find((x) => x.stream === "movement")!;
    if (move.penalty > 0) out.push(fill(FACTOR_TEMPLATES.noMovement, { minutes: move.minutes }));
    out.push(fill(FACTOR_TEMPLATES.score, { score: c.n.toFixed(2) }));
    return out;
  };

  const script = (inc: Incident): string | undefined => {
    if (!contract.wishes.offer_911_script) return undefined;
    const p = state.people[inc.personId]!;
    return fill(TEMPLATES.script911, {
      name: inc.personId,
      lastT: p.lastReportAt ?? contract.window.start,
      minutes: sinceMin(inc.personId),
    });
  };

  const emitRung = (inc: Incident) => {
    const id = inc.personId;
    const minutes = sinceMin(id);
    const watcher = watcherFor(contract, id, now);
    const f = factorsFor(id);
    const others = contract.group.members.filter((m) => m !== id);
    if (inc.step === "self") {
      const tpl = inc.kind === "evidence_lost" ? TEMPLATES.evidenceLost : TEMPLATES.nudge;
      emit(
        inc,
        inc.kind === "evidence_lost" ? "evidence_lost" : inc.kind,
        fill(tpl, { name: id, minutes }),
        [id],
        f,
      );
    } else if (inc.step === "watcher") {
      const tpl = inc.kind === "unexplained_stop" ? TEMPLATES.unexplained : TEMPLATES.watcher;
      emit(inc, inc.kind, fill(tpl, { name: id, minutes }), watcher ? [watcher] : others, f);
    } else if (inc.step === "next") {
      const next = nextAfter(contract, id, watcher);
      emit(
        inc,
        "escalation",
        fill(TEMPLATES.next, { name: id, minutes, watcher: watcher ?? "the first watcher" }),
        next ? [next] : others,
        f,
      );
    } else if (inc.step === "group") {
      emit(inc, "escalation", fill(TEMPLATES.group, { name: id, minutes }), others, f);
    } else {
      const friend = inc.raisedBy!;
      emit(inc, "friend_worry", fill(TEMPLATES.takeover, { name: id }), [friend], f, {
        script911: script(inc),
      });
    }
  };

  const openIncident = (
    id: string,
    kind: IncidentKind,
    rung: 1 | 2 | 3 | 4,
    step: Incident["step"],
    extra: Partial<Incident> = {},
  ) => {
    const inc: Incident = {
      id: `${id}@${now}`,
      personId: id,
      kind,
      rung,
      step,
      openedAt: now,
      rungSince: now,
      status: "open",
      ...extra,
    };
    state.incidents.push(inc);
    return inc;
  };

  const openFor = (id: string) =>
    state.incidents.find((i) => i.personId === id && i.status === "open");

  const resolve = (inc: Incident, how: NonNullable<Incident["resolution"]>, by?: string) => {
    inc.status = "resolved";
    inc.resolvedAt = now;
    inc.resolution = how;
    if (by) inc.confirmedBy = by;
    state.people[inc.personId]!.cooldownUntil = now + COOLDOWN_MIN;
  };

  // 2. Friend actions (human reports) in time order.
  const acts = input.actions
    .map((a, i) => ({ a, i }))
    .filter(({ a }) => a.t <= now)
    .sort((x, y) => x.a.t - y.a.t || x.i - y.i)
    .map(({ a }) => a);
  for (const a of acts) {
    const log = (outcome: "applied" | "rate_limited" | "ignored") =>
      state.actionLog.push({
        t: a.t,
        type: a.type,
        by: a.by,
        targetPersonId: a.targetPersonId,
        reason: a.reason,
        outcome,
      });
    const target = state.people[a.targetPersonId];
    if (!target || !members.has(a.by) || a.by === a.targetPersonId) {
      log("ignored");
      continue;
    }
    const open = openFor(a.targetPersonId);
    if (a.type === "confirm") {
      if (open) {
        resolve(open, "confirmed", a.by);
        log("applied");
      } else log("ignored");
      continue;
    }
    // worry
    const last = target.worryAt[a.by];
    if (last !== undefined && a.t - last < WORRY_RATE_LIMIT_MIN) {
      log("rate_limited");
      continue;
    }
    target.worryAt[a.by] = a.t;
    log("applied");
    const byWatcher = watcherFor(contract, a.targetPersonId, a.t) === a.by;
    const reasonText = a.reason ? fill(REASON_TEXT[a.reason], { name: a.targetPersonId }) : "";
    const reason = a.reason;
    if (open) {
      const rung = byWatcher ? 4 : (Math.max(open.rung, 2) as 2 | 3 | 4);
      if (rung > open.rung || byWatcher) {
        open.rung = rung;
        open.step = byWatcher ? "friend" : open.rung >= 3 ? open.step : "watcher";
        open.rungSince = now;
        open.raisedBy = a.by;
        open.reason = reason;
        emitRung(open);
        if (!byWatcher) {
          // Name the friend's attributed report, not just the ladder step.
          const last = alerts[alerts.length - 1]!;
          last.message = reasonText
            ? fill(TEMPLATES.worry, { friend: a.by, reasonText })
            : fill(TEMPLATES.worryNoReason, { friend: a.by, name: a.targetPersonId });
        }
      }
      continue;
    }
    const inc = openIncident(
      a.targetPersonId,
      "friend_worry",
      byWatcher ? 4 : 2,
      byWatcher ? "friend" : "watcher",
      { raisedBy: a.by, reason },
    );
    emitRung(inc);
    if (!byWatcher) {
      const al = alerts[alerts.length - 1]!;
      al.message = reasonText
        ? fill(TEMPLATES.worry, { friend: a.by, reasonText })
        : fill(TEMPLATES.worryNoReason, { friend: a.by, name: a.targetPersonId });
    }
  }

  // 3. Per-person ladder driven by evidence.
  const active = now >= contract.window.start && now <= contract.expires;
  for (const id of contract.group.members) {
    const p = state.people[id]!;
    const open = openFor(id);
    if (p.home) {
      if (open) resolve(open, "home");
      continue;
    }
    if (!active) continue;

    const cls = classifySilence(contract, state, id, now);
    const { n } = confidenceOfNormal(contract, p, now);
    const th = contract.thresholds;
    if (n < th.score_floor) p.lowSince ??= now;
    else p.lowSince = null;

    if (
      cls === "battery_death" &&
      !state.notes.some((x) => x.personId === id && x.text.includes("falling"))
    ) {
      state.notes.push({
        t: now,
        personId: id,
        text: fill(TEMPLATES.softBatteryDown, {
          name: id,
          battery: Math.round(p.lastBattery ?? 0),
        }),
      });
    }

    let concern: IncidentKind | null = null;
    if (cls === "evidence_lost") concern = "evidence_lost";
    else if (cls === "battery_death") concern = null;
    else if (cls === "unexplained") concern = "unexplained_stop";
    else if (p.lowSince !== null && now - p.lowSince >= th.score_floor_min)
      concern = "low_confidence";

    if (!open) {
      if (concern && (p.cooldownUntil === null || now >= p.cooldownUntil)) {
        emitRung(openIncident(id, concern, 1, "self"));
      }
      continue;
    }

    if (open.kind === "friend_worry") {
      // Human reports end by human action or arriving home; normal evidence does not close them.
    } else if (!concern) {
      resolve(open, "evidence_returned");
      continue;
    }
    if (open.kind === "evidence_lost") continue; // notify, not alarm: never escalates

    // Escalate on ack timeout. "Ack" = a friend confirm/worry, handled above.
    if (now - open.rungSince >= th.ack_timeout_min && open.rung < 4) {
      if (open.step === "self") Object.assign(open, { rung: 2, step: "watcher" });
      else if (open.step === "watcher") Object.assign(open, { rung: 3, step: "next" });
      else if (open.step === "next") Object.assign(open, { rung: 3, step: "group" });
      else continue; // group: top of the automatic ladder; only a human reaches rung 4
      open.rungSince = now;
      emitRung(open);
    }
  }

  state.lastEvalAt = now;
  return { state, alerts };
}

function ingest(contract: Contract, state: EngineState, e: EvidenceReport) {
  const p = state.people[e.personId]!;
  p.lastReportAt = Math.max(p.lastReportAt ?? e.t, e.t);
  p.prevBattery = p.lastBattery;
  p.lastBattery = e.batteryPct;
  p.lastCharging = e.charging;
  if (!e.permissionOk) {
    p.permissionLost = true;
    return; // location/motion are not trustworthy without permission
  }
  p.permissionLost = false;
  const moved =
    e.motion !== "still" ||
    (p.lastArea !== null && (p.lastArea.lat !== e.area.lat || p.lastArea.lon !== e.area.lon));
  p.lastArea = e.area;
  if (distanceM(e.area, contract.corridor.center) <= contract.corridor.radius_m)
    p.lastCorridorAt = e.t;
  if (moved) p.lastMoveAt = e.t;
  if (e.homeArrived) p.home = true;
}
