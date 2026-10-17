import type { Concern } from "./concerns";
import { COOLDOWN_MIN, type Incident } from "./state";
import type { Ctx } from "./ctx";

export const openFor = ({ state }: Ctx, id: string): Incident | undefined =>
  state.incidents.find((i) => i.personId === id && i.status === "open");

export function openIncident(
  { state, now }: Ctx,
  id: string,
  concern: Concern,
  rung: 1 | 2 | 3 | 4,
  step: Incident["step"],
  extra: Partial<Incident> = {},
): Incident {
  const inc: Incident = {
    id: `${id}@${now}`,
    personId: id,
    kind: concern.kind,
    severity: concern.severity,
    rung,
    step,
    openedAt: now,
    rungSince: now,
    status: "open",
    ...extra,
  };
  state.incidents.push(inc);
  return inc;
}

export function resolveIncident(
  { state, now }: Ctx,
  inc: Incident,
  how: NonNullable<Incident["resolution"]>,
  by?: string,
): void {
  inc.status = "resolved";
  inc.resolvedAt = now;
  inc.resolution = how;
  if (by) inc.confirmedBy = by;
  // Rejoining closes a nudge to her only; it must not blind the engine to a second wander-off.
  if (how !== "rejoined") state.people[inc.personId]!.cooldownUntil = now + COOLDOWN_MIN;
}
