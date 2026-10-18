import type { Alert, FriendAction } from "@bathroombestie/schema";
import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { contactMessage, emergencyNotice } from "../src/emergency";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";

const START = 1_000_000;
const MOM = { name: "Mom", phone: "+1 416 555 0100" };

let store: MemoryStore, clock: FakeClock, app: ReturnType<typeof buildServer>;
beforeEach(() => {
  store = new MemoryStore();
  clock = new FakeClock(START);
  app = buildServer({ store, clock, compiler: new MockCompiler() });
});
const compile = async () =>
  (
    await app.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence: "Out with Bea and Cy for 5 hours", me: "Ana" },
    })
  ).json().contract;

/** A top-rung alert about `ana`, raised by bea's "I'm worried" at minute `t`. */
const topAlert = (contractId: string, t: number): Alert => ({
  id: `a_${t}`,
  contractId,
  incidentId: "i_1",
  rung: 4,
  kind: "friend_worry",
  personId: "ana",
  t,
  to: ["bea", "cy"],
  factors: [],
  lastKnown: { area: { lat: 43.65, lon: -79.38 }, t: t - 5 },
  raisedBy: "bea",
  message: "You're taking over for ana.",
});
const act = (by: string, type: "confirm" | "worry", t: number): FriendAction => ({
  by,
  type,
  targetPersonId: "ana",
  t,
});

describe("emergencyNotice (pure)", () => {
  it("nothing without a contact, or without a top-rung alert about her", async () => {
    const c = await compile();
    expect(emergencyNotice(c, null, [topAlert(c.id, START)], [], START + 60)).toBeNull();
    const lower = { ...topAlert(c.id, START), rung: 3 as const };
    expect(emergencyNotice(c, MOM, [lower], [], START + 60)).toBeNull();
    const aboutBea = { ...topAlert(c.id, START), personId: "bea" };
    expect(emergencyNotice(c, MOM, [aboutBea], [], START + 60)).toBeNull();
  });

  it("is pending for ack_timeout_min, then due, if no friend responds", async () => {
    const c = await compile();
    const wait = c.thresholds.ack_timeout_min;
    const alerts = [topAlert(c.id, START)];
    // The "I'm worried" that raised the alert is not a response to it.
    const raised = [act("bea", "worry", START)];
    const pending = emergencyNotice(c, MOM, alerts, raised, START + wait - 1);
    expect(pending).toMatchObject({ due: false, at: START + wait, about: "ana" });
    const due = emergencyNotice(c, MOM, alerts, raised, START + wait);
    expect(due).toMatchObject({ due: true, at: START + wait });
    expect(due!.message).toContain("Hi Mom");
    expect(due!.message).toContain("https://maps.google.com/?q=43.65,-79.38");
  });

  it("any friend's response after the alert means no message", async () => {
    const c = await compile();
    const alerts = [topAlert(c.id, START)];
    for (const a of [
      act("cy", "confirm", START + 1),
      act("cy", "worry", START),
      act("bea", "confirm", START),
    ])
      expect(emergencyNotice(c, MOM, alerts, [a], START + 60)).toBeNull();
    // A response from before the alert doesn't count.
    expect(
      emergencyNotice(c, MOM, alerts, [act("cy", "confirm", START - 1)], START + 60),
    ).not.toBeNull();
  });

  it("only the newest top-rung alert counts", async () => {
    const c = await compile();
    const alerts = [topAlert(c.id, START), topAlert(c.id, START + 30)];
    const n = emergencyNotice(c, MOM, alerts, [act("cy", "confirm", START + 1)], START + 60);
    expect(n).toMatchObject({ alertId: `a_${START + 30}` });
  });

  it("can leave the map link out (backstage)", async () => {
    const c = await compile();
    const n = emergencyNotice(c, MOM, [topAlert(c.id, START)], [], START + 60, false);
    expect(n!.message).not.toMatch(/maps|43\.6|-79\.3/);
  });

  it("the template uses no banned words (invariant 6)", () => {
    const BANNED = ["drug", "spiked", "intoxicated", "drunk", "sick", "medical", "unwell"];
    const lastKnown = { area: { lat: 43.65, lon: -79.38 }, t: 0 };
    for (const m of [contactMessage(MOM, "ana", 3, lastKnown), contactMessage(MOM, "ana", 3, null)])
      for (const w of BANNED) expect(m.toLowerCase()).not.toContain(w);
  });
});

describe("/contracts/:id/emergency-contact", () => {
  const put = (id: string, body: unknown) =>
    app.inject({
      method: "PUT",
      url: `/contracts/${id}/emergency-contact`,
      payload: body as never,
    });
  const get = async (id: string) =>
    (await app.inject({ url: `/contracts/${id}/emergency-contact` })).json();

  it("404 for an unknown night; 400 for a bad contact", async () => {
    expect((await put("c_nope", MOM)).statusCode).toBe(404);
    expect((await app.inject({ url: "/contracts/c_nope/emergency-contact" })).statusCode).toBe(404);
    const c = await compile();
    for (const bad of [{ name: "", phone: "4165550100" }, { name: "Mom", phone: "call me" }, {}])
      expect((await put(c.id, bad)).statusCode).toBe(400);
  });

  it("set, read, replace and clear", async () => {
    const c = await compile();
    expect(await get(c.id)).toEqual({ contact: null, notice: null });
    expect((await put(c.id, MOM)).statusCode).toBe(200);
    expect((await get(c.id)).contact).toEqual(MOM);
    await put(c.id, { name: "Dad", phone: "416-555-0199" });
    expect((await get(c.id)).contact).toEqual({ name: "Dad", phone: "416-555-0199" });
    await app.inject({ method: "DELETE", url: `/contracts/${c.id}/emergency-contact` });
    expect((await get(c.id)).contact).toBeNull();
  });

  it("the notice appears once a top-rung alert goes unanswered, and clears on a response", async () => {
    const c = await compile();
    await put(c.id, MOM);
    await store.addAlerts([topAlert(c.id, START)]);
    clock.t = START + c.thresholds.ack_timeout_min;
    expect((await get(c.id)).notice).toMatchObject({ due: true, about: "ana" });
    await app.inject({
      method: "POST",
      url: "/actions",
      payload: { contractId: c.id, type: "confirm", by: "cy", targetPersonId: "ana" },
    });
    expect((await get(c.id)).notice).toBeNull();
  });

  it("backstage shows the contact and notice, but still no location", async () => {
    const c = await compile();
    await put(c.id, MOM);
    await store.addAlerts([topAlert(c.id, START)]);
    clock.t = START + c.thresholds.ack_timeout_min;
    const b = (await app.inject({ url: `/contracts/${c.id}/backstage` })).json();
    expect(b.emergency.contact).toEqual(MOM);
    expect(b.emergency.notice).toMatchObject({ due: true });
    expect(JSON.stringify(b.emergency)).not.toMatch(/maps|43\.6\d|-79\.3\d/);
  });
});
