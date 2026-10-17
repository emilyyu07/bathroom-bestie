import { describe, it } from "vitest";

// Skipped on purpose: stubs. See src/handoff.ts.
describe.skip("handoff benchmarks (TODO)", () => {
  it.todo(
    "home deadline: no homeArrived by the milestone deadline opens an incident (build first)",
  );
  it.todo("exit-alone timer: leaving the group alone starts a timer that expects an arrival");
  it.todo("pickup timer (later)");
  it.todo("stall timer (later)");
});
