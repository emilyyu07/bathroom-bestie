import { describe, expect, it } from "vitest";
import { makeContract } from "@tether/schema";
import { confidenceOfNormal, initialState } from "../src";

describe("confidence of normal", () => {
  const c = makeContract();
  it("is 1 while every stream is within tau", () => {
    const s = initialState(c);
    expect(confidenceOfNormal(c, s.people.ana!, 5).n).toBe(1);
  });
  it("decays once a stream exceeds tau and never increases without evidence", () => {
    const p = initialState(c).people.ana!;
    let prev = 1;
    for (let t = 0; t < 200; t += 5) {
      const n = confidenceOfNormal(c, p, t).n;
      expect(n).toBeLessThanOrEqual(prev);
      prev = n;
    }
    expect(prev).toBeLessThan(0.5);
  });
});
