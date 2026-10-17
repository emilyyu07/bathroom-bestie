import type { Alert, AlertKind } from "@bathroombestie/schema";
import { confidenceOfNormal } from "./confidence";
import { separatedFor } from "./cohesion";
import type { Ctx, EmitOptions } from "./ctx";
import { classifySilence, silentMinutes } from "./signals";
import type { Incident } from "./state";
import { FACTOR_TEMPLATES, REASON_TEXT, TEMPLATES, fill } from "./templates";
import { overdue } from "./milestones";
import { nextAfter, watcherFor } from "./watchers";

/** Top plain-language reasons, observable behavior only (invariant 6). Caller keeps the first three. */
export function factorsFor(ctx: Ctx, id: string): string[] {
  const { contract, state, now } = ctx;
  const p = state.people[id]!;
  const apartMin = separatedFor(contract, state, id, now);
  const c = confidenceOfNormal(contract, p, now, apartMin);
  const out: string[] = [];
  if (p.exitAloneSince !== null)
    out.push(fill(FACTOR_TEMPLATES.leftAlone, { minutes: now - p.exitAloneSince }));
  const late = overdue(contract, p, id, now)[0];
  if (late) out.push(fill(FACTOR_TEMPLATES.pastDeadline, { minutes: now - late.by }));
  const silent = silentMinutes(contract, state, id, now);
  const cls = classifySilence(contract, state, id, now);
  if (silent >= contract.thresholds.silence_min / 2)
    out.push(fill(FACTOR_TEMPLATES.noUpdate, { minutes: silent }));
  if (p.lastBattery !== null && cls === "unexplained")
    out.push(fill(FACTOR_TEMPLATES.battery, { battery: Math.round(p.lastBattery) }));
  if (apartMin >= contract.thresholds.separation_min)
    out.push(fill(FACTOR_TEMPLATES.apartFor, { minutes: apartMin }));
  const corridor = c.penalties.find((x) => x.stream === "corridor")!;
  if (corridor.penalty > 0)
    out.push(fill(FACTOR_TEMPLATES.outsideArea, { minutes: corridor.minutes }));
  const move = c.penalties.find((x) => x.stream === "movement")!;
  if (move.penalty > 0) out.push(fill(FACTOR_TEMPLATES.noMovement, { minutes: move.minutes }));
  out.push(fill(FACTOR_TEMPLATES.score, { score: c.n.toFixed(2) }));
  return out;
}

const script911 = (ctx: Ctx, inc: Incident): string | undefined => {
  const { contract, state, now } = ctx;
  if (!contract.wishes.offer_911_script) return undefined;
  const p = state.people[inc.personId]!;
  return fill(TEMPLATES.script911, {
    name: inc.personId,
    lastT: p.lastReportAt ?? contract.window.start,
    minutes: silentMinutes(contract, state, inc.personId, now),
  });
};

/**
 * The one place an incident's current step becomes alert text and recipients. All wording is a
 * fixed template (invariant 3); friend text names the friend and their chosen reason only (8).
 */
export function renderAlert(ctx: Ctx, inc: Incident, seq: number, opts: EmitOptions = {}): Alert {
  const { contract, state, now } = ctx;
  const id = inc.personId;
  const p = state.people[id]!;
  const minutes = silentMinutes(contract, state, id, now);
  const watcher = watcherFor(contract, id, now);
  const others = contract.group.members.filter((m) => m !== id);
  let kind: AlertKind = inc.kind;
  let message: string;
  let to: string[];
  let script: string | undefined;

  switch (inc.step) {
    case "self": {
      const late = overdue(contract, p, id, now)[0];
      let tpl: string = TEMPLATES.nudge;
      let m = minutes; // default: time without an update
      if (inc.kind === "evidence_lost") tpl = TEMPLATES.evidenceLost;
      else if (inc.kind === "separation") {
        tpl = TEMPLATES.separation;
        m = separatedFor(contract, state, id, now); // time apart
      } else if (inc.kind === "missed_milestone" && late) {
        tpl = late.kind === "home" ? TEMPLATES.milestoneHome : TEMPLATES.milestoneArea;
        m = now - late.by; // time past the deadline
      } else if (inc.kind === "exit_alone") {
        tpl = TEMPLATES.exitAlone;
        m = now - (p.exitAloneSince ?? now); // time since she left the group
      }
      message = fill(tpl, { name: id, minutes: m });
      to = [id];
      break;
    }
    case "watcher": {
      const late = overdue(contract, p, id, now)[0];
      if (inc.kind === "exit_alone") {
        message = fill(TEMPLATES.exitAloneLate, {
          name: id,
          minutes: now - (p.exitAloneSince ?? now),
        });
      } else if (inc.kind === "missed_milestone" && late) {
        message = fill(TEMPLATES.milestoneLate, {
          name: id,
          minutes: now - late.by,
          silent: minutes,
        });
      } else {
        const tpl = inc.kind === "unexplained_stop" ? TEMPLATES.unexplained : TEMPLATES.watcher;
        message = fill(tpl, { name: id, minutes });
      }
      to = watcher ? [watcher] : others;
      break;
    }
    case "next": {
      const next = nextAfter(contract, id, watcher);
      kind = "escalation";
      message = fill(inc.kind === "exit_alone" ? TEMPLATES.exitAloneNext : TEMPLATES.next, {
        name: id,
        minutes: inc.kind === "exit_alone" ? now - (p.exitAloneSince ?? now) : minutes,
        watcher: watcher ?? "the first watcher",
      });
      to = next ? [next] : others;
      break;
    }
    case "group":
      kind = "escalation";
      message =
        inc.kind === "exit_alone"
          ? fill(TEMPLATES.exitAloneGroup, { name: id, minutes: now - (p.exitAloneSince ?? now) })
          : fill(TEMPLATES.group, { name: id, minutes });
      to = others;
      break;
    case "friend":
      kind = "friend_worry";
      message = fill(TEMPLATES.takeover, { name: id });
      to = [inc.raisedBy!];
      script = script911(ctx, inc);
      break;
  }

  if (opts.attributed && inc.step !== "friend") {
    const reasonText = inc.reason
      ? fill(REASON_TEXT[inc.reason as keyof typeof REASON_TEXT], { name: id })
      : "";
    message = reasonText
      ? fill(TEMPLATES.worry, { friend: inc.raisedBy!, reasonText })
      : fill(TEMPLATES.worryNoReason, { friend: inc.raisedBy!, name: id });
  }

  return {
    id: `${inc.id}:r${inc.rung}:${now}:${seq}`,
    contractId: contract.id,
    incidentId: inc.id,
    rung: inc.rung,
    kind,
    personId: id,
    t: now,
    to,
    factors: factorsFor(ctx, id).slice(0, 3),
    lastKnown:
      p.lastArea && p.lastReportAt !== null ? { area: p.lastArea, t: p.lastReportAt } : null,
    raisedBy: inc.raisedBy,
    message,
    ...(script === undefined ? {} : { script911: script }),
  };
}
