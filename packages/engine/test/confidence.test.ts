import { describe, expect, it } from "vitest";
import { makeContract } from "@bathroombestie/schema";
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

describe("separation stream", () => {
  const c = makeContract();
  const p = initialState(c).people.ana!;
  const at = 10; // other streams still within tau

  it("costs nothing until apart longer than tau (60 min)", () => {
    expect(confidenceOfNormal(c, p, at, 0).n).toBe(1);
    expect(confidenceOfNormal(c, p, at, 60).n).toBe(1);
  });
  it("lowers confidence the longer she is apart", () => {
    const a = confidenceOfNormal(c, p, at, 90).n;
    const b = confidenceOfNormal(c, p, at, 120).n;
    expect(a).toBeLessThan(1);
    expect(b).toBeLessThan(a);
  });
  it("is capped so separation alone never drops below the highest preset floor (0.6)", () => {
    expect(confidenceOfNormal(c, p, at, 100_000).n).toBeGreaterThan(0.6);
  });
  it("is data: weight 0 switches it off", () => {
    const off = makeContract({
      confidence: { ...c.confidence, separation: { w: 0, tau_min: 60 } },
    });
    expect(confidenceOfNormal(off, p, at, 500).n).toBe(1);
  });
});
