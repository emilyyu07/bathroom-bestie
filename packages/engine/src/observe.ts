import { separatedFor } from "./cohesion";
import { confidenceOfNormal } from "./confidence";
import type { Signals } from "./concerns";
import type { Ctx } from "./ctx";
import { classifySilence, silentMinutes } from "./signals";
import { TEMPLATES, fill } from "./templates";

/**
 * The only step that updates per-tick tracking state (the score dip timer, soft notes) before
 * detectors read it. Detectors themselves are read-only.
 */
export function observe(ctx: Ctx, id: string): Signals {
  const { contract, state, now } = ctx;
  const p = state.people[id]!;
  const th = contract.thresholds;
  const cls = classifySilence(contract, state, id, now);
  const apartMin = separatedFor(contract, state, id, now);
  const { n } = confidenceOfNormal(contract, p, now, apartMin);
  if (n < th.score_floor) p.lowSince ??= now;
  else p.lowSince = null;

  if (
    cls === "battery_death" &&
    !state.notes.some((x) => x.personId === id && x.text.includes("falling"))
  ) {
    state.notes.push({
      t: now,
      personId: id,
      text: fill(TEMPLATES.softBatteryDown, { name: id, battery: Math.round(p.lastBattery ?? 0) }),
    });
  }
  return { cls, n, silentMin: silentMinutes(contract, state, id, now), apartMin };
}
