import { describe, expect, it } from "vitest";
import { FACTOR_TEMPLATES, REASON_TEXT, TEMPLATES } from "../src";

const BANNED = ["drug", "spiked", "intoxicated", "drunk", "sick", "medical", "unwell"];

describe("invariant 6: banned words", () => {
  const all = [
    ...Object.values(TEMPLATES),
    ...Object.values(FACTOR_TEMPLATES),
    ...Object.values(REASON_TEXT),
  ];
  it("has templates to scan", () => expect(all.length).toBeGreaterThan(10));
  for (const w of BANNED) {
    it(`no template contains "${w}"`, () => {
      expect(all.filter((s) => s.toLowerCase().includes(w))).toEqual([]);
    });
  }
});

describe("nudges are informational (no check-ins)", () => {
  it("the separation nudge states a fact and gives no instruction", () => {
    expect(TEMPLATES.separation).not.toMatch(/let (them|your friends) know|check in|tap|press/i);
  });
});
