import { z } from "zod";
import { Contract } from "./contract";
import { EvidenceReport, FriendAction } from "./evidence";
import { Minute, PersonId } from "./common";
import { ReadinessSnapshot } from "./readiness";

/** Evidence as authored in a scenario: personId/contractId/t are filled in by the runner. */
export const ScenarioEvidence = EvidenceReport.omit({ personId: true, contractId: true, t: true });
export type ScenarioEvidence = z.infer<typeof ScenarioEvidence>;

export const ScenarioLabel = z.discriminatedUnion("expect", [
  z.object({ expect: z.literal("no_alert") }),
  z.object({
    expect: z.literal("alert"),
    /** Minimum rung of the first alert that counts. */
    rung: z.number().int().min(1).max(4),
    /** Window (minutes from start) in which that first alert must occur, at the scenario's preset. */
    from: Minute,
    to: Minute,
    /** When the concerning behavior begins; time-to-alert is measured from here. */
    onset: Minute,
    maxRung: z.number().int().min(1).max(4).optional(),
    resolvedBy: z.enum(["confirmed", "evidence_returned"]).optional(),
  }),
  z.object({ expect: z.literal("activation_blocked") }),
]);
export type ScenarioLabel = z.infer<typeof ScenarioLabel>;

export const ScenarioFile = z.object({
  name: z.string(),
  description: z.string(),
  contract: Contract,
  /** Minute offsets from contract.window.start. */
  timelines: z.record(PersonId, z.array(z.object({ at: Minute, evidence: ScenarioEvidence }))),
  actions: z.array(FriendAction.omit({ t: true }).extend({ at: Minute })).default([]),
  readiness: ReadinessSnapshot.optional(),
  /** Minutes from start to simulate. */
  durationMin: z.number().int().positive(),
  /** Ground truth for the sweep: is this a normal night, a concerning one, or excluded from sweep stats? */
  truth: z.enum(["normal", "concerning", "excluded"]),
  label: ScenarioLabel,
});
export type ScenarioFile = z.infer<typeof ScenarioFile>;
