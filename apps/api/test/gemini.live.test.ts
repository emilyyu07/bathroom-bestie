import { describe, expect, it } from "vitest";
import { Contract } from "@bathroombestie/schema";
import { buildContract, GeminiCompiler, safeReadBack } from "../src/compile";

/**
 * Calls the real Gemini API (`pnpm test:gemini`, needs GEMINI_API_KEY in .env). Skipped otherwise.
 * Checks what code cannot guarantee by construction: the model's defaults and its read-back.
 */
const key = process.env.GEMINI_LIVE ? process.env.GEMINI_API_KEY : undefined;
const BANNED = /drug|spiked|intoxicated|drunk|sick|medical|unwell/i;

describe.skipIf(!key)("gemini compile (live)", () => {
  const g = new GeminiCompiler(key!, process.env.GEMINI_MODEL || undefined);
  const ctx = { now: 1_000_000, area: { lat: 43.65, lon: -79.38 }, localTime: "21:00" };
  const compile = async (s: string) => {
    const d = await g.draft(s, ctx);
    return { d, c: Contract.parse(buildContract(d, ctx, s)) };
  };

  it("an unremarkable sentence gets the standard preset and keeps the script", async () => {
    const { c } = await compile("out w/ Maya til late");
    expect(c.group.members).toEqual(["me", "maya"]);
    expect(c.preset).toBe("standard");
    expect(c.wishes.offer_911_script).toBe(true);
  }, 60_000);

  it("uses her local time for 'until 2am'", async () => {
    const { d } = await compile("Going out with Bea and Cy until 2am");
    expect(d.hours).toBe(5);
  }, 60_000);

  it("a stated home time becomes her home milestone; none otherwise", async () => {
    const { c } = await compile("Drinks with Bea until midnight, I'll be home by 1am");
    expect(c.milestones).toEqual([{ id: "home", kind: "home", by: ctx.now + 240, who: ["me"] }]);
    const { c: plain } = await compile("Drinks with Bea for a few hours");
    expect(plain.milestones).toEqual([]);
  }, 60_000);

  it("asks to be careful -> cautious; explicit opt-out of the script is respected", async () => {
    const { c } = await compile(
      "Bar with Kim for 3 hours, be careful, and don't offer any emergency call script",
    );
    expect(c.preset).toBe("cautious");
    expect(c.wishes.offer_911_script).toBe(false);
  }, 60_000);

  it("a worried sentence never yields banned words in what she is shown", async () => {
    const { d, c } = await compile(
      "I'm worried I might get drunk and sick tonight, going out with Kim for 4 hours",
    );
    expect(safeReadBack(d.read_back, c)).not.toMatch(BANNED);
  }, 60_000);
});
