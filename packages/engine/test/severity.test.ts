import { describe, expect, it } from "vitest";
import { makeContract } from "@bathroombestie/schema";
import { initialState, type Incident } from "../src";
import type { Concern } from "../src/concerns";
import type { Ctx } from "../src/ctx";
import { openIncident } from "../src/incidents";
import { stepIncident } from "../src/ladder";
import { darkAna, ev, run } from "./helpers";

describe("incidents carry their severity", () => {
  it("separation is advisory; an unexplained stop is hard; the upgrade rewrites both kind and severity", () => {
    const { state, alerts } = run({ to: 120, evidence: darkAna(60, 61, 0) });
    const inc = state.incidents[0]!;
    expect(alerts[0]).toMatchObject({ kind: "separation" }); // opened advisory at rung 1
    expect(inc).toMatchObject({ kind: "unexplained_stop", severity: "hard" });
  });

  it("a revoked permission is a notice, and a friend's worry is hard", () => {
    const lost = run({
      to: 100,
      evidence: (t) => [
        ...darkAna(10_000)(t).filter((e) => e.personId !== "ana"),
        ...(t < 60 && t % 5 === 0 ? [ev("ana", t)] : []),
        ...(t === 60 ? [ev("ana", t, { permissionOk: false })] : []),
      ],
    });
    expect(lost.state.incidents[0]).toMatchObject({ kind: "evidence_lost", severity: "notice" });

    const worry = run({
      to: 40,
      evidence: darkAna(10_000),
      actions: [{ type: "worry", by: "cy", targetPersonId: "ana", t: 30 }],
    });
    expect(worry.state.incidents[0]).toMatchObject({ kind: "friend_worry", severity: "hard" });
  });
});

/** stepIncident driven directly, so rules the scenarios cannot reach yet are still pinned down. */
describe("stepIncident severity rules", () => {
  const setup = (open: Partial<Incident> & Pick<Incident, "kind" | "severity">, now: number) => {
    const contract = makeContract();
    const state = initialState(contract);
    const ctx: Ctx = { contract, state, now };
    const inc = openIncident(ctx, "ana", { kind: open.kind, severity: open.severity }, 1, "self");
    Object.assign(inc, open, { rungSince: 0 });
    const emitted: Incident[] = [];
    const emit = (i: Incident) => {
      emitted.push({ ...i });
      return {} as never;
    };
    return { ctx, inc, emitted, emit };
  };
  const c = (kind: Concern["kind"], severity: Concern["severity"]): Concern => ({ kind, severity });

  it("a harder concern of the SAME kind upgrades an advisory incident in place", () => {
    const { ctx, inc, emit } = setup({ kind: "separation", severity: "advisory" }, 40);
    stepIncident(ctx, inc, c("separation", "hard"), emit);
    expect(inc).toMatchObject({ kind: "separation", severity: "hard", rungSince: 40, rung: 1 });
  });

  it("the ack timeout counts from the upgrade, not from when the nudge opened", () => {
    const { ctx, inc, emit, emitted } = setup({ kind: "separation", severity: "advisory" }, 40);
    stepIncident(ctx, inc, c("unexplained_stop", "hard"), emit);
    ctx.now = 44; // 4 min after the upgrade (ack_timeout_min is 5 at standard)
    stepIncident(ctx, inc, c("unexplained_stop", "hard"), emit);
    expect(emitted).toHaveLength(0);
    ctx.now = 45;
    stepIncident(ctx, inc, c("unexplained_stop", "hard"), emit);
    expect(emitted.map((i) => i.rung)).toEqual([2]);
  });

  it("two advisory kinds never swap places (no flip-flop)", () => {
    const { ctx, inc, emit } = setup({ kind: "separation", severity: "advisory" }, 40);
    stepIncident(
      ctx,
      inc,
      c("missed_milestone" as never /* a second advisory kind; real next commit */, "advisory"),
      emit,
    );
    expect(inc).toMatchObject({
      kind: "separation",
      severity: "advisory",
      status: "open",
      rungSince: 0,
    });
  });

  it("an advisory concern never escalates by itself, however long it has been open", () => {
    const { ctx, inc, emit, emitted } = setup({ kind: "separation", severity: "advisory" }, 500);
    stepIncident(ctx, inc, c("separation", "advisory"), emit);
    expect(emitted).toHaveLength(0);
    expect(inc.rung).toBe(1);
  });

  it("when only an advisory concern is left, a stronger open incident is closed (no cooldown dodge for rejoined)", () => {
    const { ctx, inc, emit } = setup({ kind: "unexplained_stop", severity: "hard" }, 90);
    stepIncident(ctx, inc, c("separation", "advisory"), emit);
    expect(inc).toMatchObject({ status: "resolved", resolution: "evidence_returned" });
  });

  it("a notice incident neither escalates nor upgrades into a hard one by itself", () => {
    const { ctx, inc, emit, emitted } = setup({ kind: "evidence_lost", severity: "notice" }, 500);
    stepIncident(ctx, inc, c("evidence_lost", "notice"), emit);
    expect(emitted).toHaveLength(0);
    expect(inc.severity).toBe("notice");
  });
});
