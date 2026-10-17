import { z } from "zod";
import { Contract } from "./contract";
import { EvidenceReport, FriendAction } from "./evidence";
import { Minute, PersonId } from "./common";
import { ReadinessSnapshot } from "./readiness";

/** Evidence as authored in a scenario: personId/contractId/t are filled in by the runner. */
export const ScenarioEvidence = EvidenceReport.omit({ personId: true, contractId: true, t: true });

export const ScenarioLabel = z.discriminatedUnion("expect", [
  z.object({ expect: z.literal("no_alert") }),
  z.object({
    expect: z.literal("alert"),
    rung: z.number().int().min(1).max(4),
    /** Window in minutes from scenario start in which the first alert at >= rung must occur. */
    from: Minute,
    to: Minute,
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
  label: ScenarioLabel,
});
export type ScenarioFile = z.infer<typeof ScenarioFile>;
