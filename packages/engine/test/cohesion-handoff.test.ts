import { describe, it } from "vitest";

// Skipped on purpose: stubs. See src/cohesion.ts and src/handoff.ts.
describe.skip("group cohesion (TODO)", () => {
  it.todo("separated = farther than separation_m from every other member for separation_min");
  it.todo("a member who rejoins the group within separation_min is never flagged");
  it.todo("separation alone raises rung 1 only; separation + silence counts toward escalation");
  it.todo("a lone member of a one-person group is never 'separated'");
});

describe.skip("handoff benchmarks (TODO)", () => {
  it.todo("home deadline: no homeArrived by the milestone deadline opens an incident (build first)");
  it.todo("exit-alone timer: leaving the group alone starts a timer that expects an arrival");
  it.todo("pickup timer (later)");
  it.todo("stall timer (later)");
});
