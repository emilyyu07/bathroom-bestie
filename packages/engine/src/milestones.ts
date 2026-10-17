import type { Contract, Milestone } from "@bathroombestie/schema";
import type { PersonState } from "./state";

/** Milestones that apply to this person (`who` omitted = every member). */
export const applicable = (contract: Contract, id: string): Milestone[] =>
  contract.milestones.filter((m) => !m.who || m.who.includes(id));

/** Home is met by the device's geofence event; an area milestone by a report inside its circle. */
export const isMet = (p: PersonState, m: Milestone): boolean =>
  m.kind === "home" ? p.home : p.milestoneMet[m.id] !== undefined;

/**
 * Unmet milestones whose deadline plus grace has passed, most overdue first. Pure.
 * Home tracking is armed per person simply by a home milestone applying to them.
 */
export const overdue = (contract: Contract, p: PersonState, id: string, now: number): Milestone[] =>
  applicable(contract, id)
    .filter((m) => !isMet(p, m) && now > m.by + contract.thresholds.milestone_grace_min)
    .sort((a, b) => a.by - b.by || a.id.localeCompare(b.id));

/** Home tracking (exit-alone, the home deadline) is armed per person by a home milestone that applies to her. */
export const tracksHome = (contract: Contract, id: string): boolean =>
  applicable(contract, id).some((m) => m.kind === "home");
