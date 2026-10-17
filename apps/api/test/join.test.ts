import { beforeEach, describe, expect, it } from "vitest";
import { FakeClock } from "../src/clock";
import { MockCompiler } from "../src/compile";
import { idPrefixOfCode, joinCodeOf } from "../src/join";
import { buildServer } from "../src/server";
import { MemoryStore } from "../src/store";

let store: MemoryStore, app: ReturnType<typeof buildServer>;
beforeEach(() => {
  store = new MemoryStore();
  app = buildServer({ store, clock: new FakeClock(1_000_000), compiler: new MockCompiler() });
});

const compile = async (sentence = "Out with Bea and Cy for 5 hours") =>
  (
    await app.inject({
      method: "POST",
      url: "/contracts/compile",
      payload: { sentence, me: "Ana" },
    })
  ).json();

describe("join code", () => {
  it("is the first 6 hex digits of the id, upper-case, and round-trips to the id prefix", () => {
    expect(joinCodeOf("c_9f3a1b2c4d")).toBe("9F3A1B");
    expect(idPrefixOfCode("9F3A1B")).toBe("c_9f3a1b");
    expect(idPrefixOfCode(" 9f3 a1b ")).toBe("c_9f3a1b"); // typed with spaces or lower case
  });
  it("rejects anything that is not 6 hex digits (so no LIKE wildcards reach the database)", () => {
    for (const bad of ["", "9F3A1", "9F3A1B2", "9F3A1G", "9F3%1B", "9F_A1B"])
      expect(idPrefixOfCode(bad)).toBeNull();
  });
});

describe("GET /join/:code", () => {
  it("compile returns the code; the code finds the night, its owner and who can still join", async () => {
    const c = await compile();
    expect(c.joinCode).toBe(joinCodeOf(c.contract.id));
    const r = await app.inject({ url: `/join/${c.joinCode.toLowerCase()}` });
    expect(r.statusCode).toBe(200);
    expect(r.json()).toEqual({
      contractId: c.contract.id,
      owner: "ana",
      status: "draft",
      expires: c.contract.expires,
      friends: [
        { id: "bea", accepted: false },
        { id: "cy", accepted: false },
      ],
    });
  });
  it("shows who has already joined, once they accept", async () => {
    const c = await compile();
    await app.inject({
      method: "POST",
      url: `/contracts/${c.contract.id}/watchers/bea/accept`,
      payload: {},
    });
    const r = (await app.inject({ url: `/join/${c.joinCode}` })).json();
    expect(r.friends).toEqual([
      { id: "bea", accepted: true },
      { id: "cy", accepted: false },
    ]);
  });
  it("404 for a code nobody has, 400 for something that cannot be a code", async () => {
    await compile();
    expect((await app.inject({ url: "/join/000000" })).statusCode).toBe(404);
    expect((await app.inject({ url: "/join/nope" })).statusCode).toBe(400);
  });
  it("409 when two nights share a prefix, rather than guessing", async () => {
    const c = await compile();
    // Force a collision: a second contract whose id starts with the same 6 digits.
    const twin = { ...c.contract, id: c.contract.id.slice(0, 8) + "ffff" };
    await store.saveContract(twin);
    expect((await app.inject({ url: `/join/${c.joinCode}` })).statusCode).toBe(409);
  });
  it("only a listed friend can accept; the owner cannot watch their own night", async () => {
    const c = await compile();
    const accept = (who: string) =>
      app.inject({
        method: "POST",
        url: `/contracts/${c.contract.id}/watchers/${who}/accept`,
        payload: {},
      });
    expect((await accept("zed")).statusCode).toBe(403);
    expect((await accept("ana")).statusCode).toBe(403);
    expect((await accept("cy")).statusCode).toBe(202);
  });
});
