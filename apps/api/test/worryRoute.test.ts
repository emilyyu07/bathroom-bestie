import { initialState, type EngineState } from "@bathroombestie/engine";
import type { Contract, FriendAction } from "@bathroombestie/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";
import { worryRoute } from "../src/worryRoute";

const START = 1_000_000;
let app: ReturnType<typeof buildServer>, c: Contract;
beforeEach(async () => {
  app = buildServer({
    store: new MemoryStore(),
    clock: new FakeClock(START),
    compiler: new MockCompiler(),
  });
  c = (
    await app.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea and Cy for 5 hours", me: "Ana" },
    })
  ).json().contract;
});
const worry = (by: string, t: number, target = "ana"): FriendAction => ({
  type: "worry",
  by,
  targetPersonId: target,
  t,
});
/** Engine state with one open incident about ana at `rung`. */
const withOpen = (rung: number): EngineState => {
  const s = initialState(c);
  s.incidents.push({ personId: "ana", status: "open", rung } as never);
  return s;
};

describe("worryRoute", () => {
  it("the friend watching her now takes over; anyone else's goes to that watcher", () => {
    const watcher = c.group.watch.find((w) => w.from <= START && START < w.to)!.who;
    const other = c.group.members.slice(1).find((m) => m !== watcher)!;
    expect(worryRoute(c, null, [], worry(watcher, START))).toMatchObject({
      outcome: "taking_over",
      watcher,
    });
    expect(worryRoute(c, null, [], worry(other, START))).toMatchObject({
      outcome: "to_watcher",
      watcher,
    });
  });

  it("nothing new goes out when an alert about her is already at rung 2 or higher", () => {
    const watcher = c.group.watch.find((w) => w.from <= START && START < w.to)!.who;
    const other = c.group.members.slice(1).find((m) => m !== watcher)!;
    expect(worryRoute(c, withOpen(1), [], worry(other, START)).outcome).toBe("to_watcher");
    expect(worryRoute(c, withOpen(2), [], worry(other, START)).outcome).toBe("already_out");
    expect(worryRoute(c, withOpen(3), [], worry(other, START)).outcome).toBe("already_out");
    // The watcher still takes over (the engine lifts it to rung 4 for them).
    expect(worryRoute(c, withOpen(3), [], worry(watcher, START)).outcome).toBe("taking_over");
  });

  it("one counted worry per friend per person per 15 min, replayed like the engine", () => {
    const r = (prior: FriendAction[], t: number) => worryRoute(c, null, prior, worry("cy", t));
    expect(r([worry("cy", START)], START + 14)).toMatchObject({
      outcome: "rate_limited",
      limitMin: 15,
    });
    expect(r([worry("cy", START)], START + 15).outcome).not.toBe("rate_limited");
    // 0 counted, 10 not, 20 counted: so 30 is within 15 of the last counted one.
    const prior = [worry("cy", START), worry("cy", START + 10), worry("cy", START + 20)];
    expect(r(prior, START + 30).outcome).toBe("rate_limited");
    // Someone else's worries, or worries about someone else, don't count against cy.
    expect(r([worry("bea", START), worry("cy", START, "bea")], START + 1).outcome).not.toBe(
      "rate_limited",
    );
  });

  it("ignored for non-members and for herself", () => {
    expect(worryRoute(c, null, [], worry("zoe", START)).outcome).toBe("ignored");
    expect(worryRoute(c, null, [], worry("ana", START)).outcome).toBe("ignored");
  });
});

describe("POST /actions", () => {
  it("a worry's reply says who hears about it; a confirm's doesn't need to", async () => {
    const post = (payload: object) =>
      app.inject({ method: "POST", url: "/actions", payload: { contractId: c.id, ...payload } });
    const w = await post({ type: "worry", by: "cy", targetPersonId: "ana" });
    expect(w.statusCode).toBe(202);
    expect(w.json().route).toMatchObject({ limitMin: 15 });
    expect(["to_watcher", "taking_over"]).toContain(w.json().route.outcome);
    // Right away again: not counted.
    expect(
      (await post({ type: "worry", by: "cy", targetPersonId: "ana" })).json().route.outcome,
    ).toBe("rate_limited");
    expect((await post({ type: "confirm", by: "cy", targetPersonId: "ana" })).json()).toEqual({
      ok: true,
    });
  });
});
