import type { Alert, Contract } from "@bathroombestie/schema";
import type { EngineState, Incident } from "./state";

/** What every engine step needs. `state` is the evaluation's private clone; steps mutate it. */
export interface Ctx {
  contract: Contract;
  state: EngineState;
  /** Injected clock, integer minutes (invariant 1). */
  now: number;
}

export interface EmitOptions {
  /** The alert reports a friend's attributed human report instead of the ladder step's text. */
  attributed?: boolean;
}
/** Renders the incident's current step into an alert and records it. */
export type Emit = (inc: Incident, opts?: EmitOptions) => Alert;
