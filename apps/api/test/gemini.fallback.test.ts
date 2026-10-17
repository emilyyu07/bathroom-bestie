import { ApiError } from "@google/genai";
import { describe, expect, it } from "vitest";
import { makeContract } from "@bathroombestie/schema";
import {
  DEFAULT_MODELS,
  GeminiCompiler,
  modelChain,
  safeReadBack,
  type Generate,
} from "../src/compile";

const plan = JSON.stringify({
  friends: ["Bea"],
  hours: 4,
  radius_m: 2000,
  preset: "standard",
  watch_order: ["Bea"],
  offer_911_script: true,
  read_back: "You are going out with Bea.",
});
const err = (status: number) => new ApiError({ message: `status ${status}`, status });

/** A fake model API: each model answers with what the script says, and every call is recorded. */
const fake = (script: Record<string, (() => string | Error)[]>) => {
  const calls: string[] = [];
  const generate: Generate = async (model) => {
    calls.push(model);
    const next = script[model]?.shift();
    if (!next) throw new Error(`unexpected call to ${model}`);
    const r = next();
    if (r instanceof Error) throw r;
    return { text: r };
  };
  return { generate, calls };
};
const draft = (models: string[], generate: Generate) =>
  new GeminiCompiler("key", models, [0], generate).draft("Night out with Bea", {
    now: 0,
    area: { lat: 43.65, lon: -79.38 },
  });

describe("Gemini model failover", () => {
  it("uses the first model when it works, and never calls the others", async () => {
    const { generate, calls } = fake({ a: [() => plan] });
    expect((await draft(["a", "b"], generate)).friends).toEqual(["Bea"]);
    expect(calls).toEqual(["a"]);
  });

  it("moves on at once when a model's quota is used up (no retry: it would fail again)", async () => {
    const { generate, calls } = fake({ a: [() => err(429)], b: [() => plan] });
    await draft(["a", "b"], generate);
    expect(calls).toEqual(["a", "b"]);
  });

  it("retries an overloaded model once, then moves on", async () => {
    const { generate, calls } = fake({ a: [() => err(503), () => err(503)], b: [() => plan] });
    await draft(["a", "b"], generate);
    expect(calls).toEqual(["a", "a", "b"]);
  });

  it("stays on a model that recovers after one overload", async () => {
    const { generate, calls } = fake({ a: [() => err(503), () => plan] });
    await draft(["a", "b"], generate);
    expect(calls).toEqual(["a", "a"]);
  });

  it("moves on from a retired model (404)", async () => {
    const { generate, calls } = fake({ a: [() => err(404)], b: [() => plan] });
    await draft(["a", "b"], generate);
    expect(calls).toEqual(["a", "b"]);
  });

  it("moves on when a model answers with something that is not a valid plan", async () => {
    const { generate, calls } = fake({
      a: [() => "not json"],
      b: [() => JSON.stringify({ friends: [] })],
      c: [() => plan],
    });
    await draft(["a", "b", "c"], generate);
    expect(calls).toEqual(["a", "b", "c"]);
  });

  it("does not try other models for a bad key or bad request (they would fail the same way)", async () => {
    for (const status of [400, 401, 403]) {
      const { generate, calls } = fake({ a: [() => err(status)], b: [() => plan] });
      await expect(draft(["a", "b"], generate)).rejects.toThrow(`status ${status}`);
      expect(calls).toEqual(["a"]);
    }
  });

  it("throws the last error when every model fails", async () => {
    const { generate, calls } = fake({ a: [() => err(429)], b: [() => err(503), () => err(503)] });
    await expect(draft(["a", "b"], generate)).rejects.toThrow("status 503");
    expect(calls).toEqual(["a", "b", "b"]);
  });

  it("moves on from a model that is too slow, without waiting for it", async () => {
    const calls: string[] = [];
    const generate: Generate = (model) => {
      calls.push(model);
      return model === "slow" ? new Promise(() => {}) : Promise.resolve({ text: plan });
    };
    const t0 = Date.now();
    await new GeminiCompiler("key", ["slow", "fast"], [0], generate, 30).draft("x", {
      now: 0,
      area: { lat: 43.65, lon: -79.38 },
    });
    expect(calls).toEqual(["slow", "fast"]);
    expect(Date.now() - t0).toBeLessThan(500);
  });

  it("needs at least one model", () => {
    expect(() => new GeminiCompiler("key", [])).toThrow();
  });
});

describe("model chain", () => {
  it("is the defaults when nothing is configured", () => {
    expect(modelChain(undefined)).toEqual(DEFAULT_MODELS);
    expect(modelChain("")).toEqual(DEFAULT_MODELS);
  });
  it("puts a configured model first and keeps the defaults as fallbacks, without repeats", () => {
    const chain = modelChain("gemini-3.8-flash");
    expect(chain[0]).toBe("gemini-3.8-flash");
    expect(chain).toEqual(expect.arrayContaining(DEFAULT_MODELS));
    expect(new Set(chain).size).toBe(chain.length);
  });
  it("accepts a comma-separated list", () => {
    expect(modelChain("x, y").slice(0, 2)).toEqual(["x", "y"]);
  });
});

describe("read-back never suggests contacting anyone but her friends", () => {
  const c = makeContract();
  for (const bad of [
    "An emergency 911 script is ready for you if needed.",
    "We will call the police if you go quiet.",
    "Emergency services are on standby.",
    "An ambulance can be sent.",
    "We will alert the authorities.",
  ])
    it(`replaces: ${bad}`, () => {
      const out = safeReadBack(bad, c);
      expect(out).not.toMatch(/911|emergency|police|ambulance|authorit/i);
      expect(out).toContain("Watching:");
    });
  it("keeps an ordinary read-back", () => {
    const ok = "You are going out with Bea until 2am. Bea watches first.";
    expect(safeReadBack(ok, c)).toBe(ok);
  });
});
