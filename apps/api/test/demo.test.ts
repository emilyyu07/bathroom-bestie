import { describe, expect, it } from "vitest";
import { format, runArrivalNight, runExitAloneNight } from "../src/demo";

const alertsOf = (events: Awaited<ReturnType<typeof runExitAloneNight>>) =>
  events.filter((e) => e.alert).map((e) => e.alert!);

describe("scripted demo (a fallback and a development tool)", () => {
  it("main run: leaves alone, never gets home, a friend is alerted and confirms", async () => {
    const events = await runExitAloneNight();
    const text = events.map((e) => e.text).join("\n");

    // set-up goes through the real routes, including the home-geofence gate
    expect(text).toContain("Pre-flight without a home geofence: not_ready; activate returns 409");
    expect(text).toContain("Pre-flight with it set: ready; activate returns 200");
    expect(text).toContain("Phones report every 3 minutes");

    const alerts = alertsOf(events);
    // exactly: a quiet separation nudge to her, then the exit-alone alert to the watcher; the friend's
    // confirm ends it before rung 3
    expect(alerts.map((a) => `${a.rung}:${a.kind}:${a.to.join("+")}`)).toEqual([
      "1:separation:ana",
      "2:exit_alone:cy",
    ]);
    expect(alerts[1]!.message).toBe("ana left the group 51 min ago and hasn't arrived home.");

    // a friend polls only their own alerts: cy has one, bea none
    expect(events.find((e) => e.kind === "poll" && e.text.startsWith("cy's"))!.text).toContain(
      ": 1 (rung 2)",
    );
    expect(events.find((e) => e.kind === "poll" && e.text.startsWith("bea's"))!.text).toContain(
      ": 0 (none)",
    );

    const end = events.at(-1)!;
    expect(end.kind).toBe("end");
    expect(end.text).toContain("exit_alone, resolved (confirmed)");
    expect(end.text).toContain("it alerts again"); // honest about what the cooldown means
  });

  it("short run: she arrives, with no location in the arrival, and nothing alarming happens", async () => {
    const events = await runArrivalNight();
    expect(events.map((e) => e.text).join("\n")).toContain(
      "an arrival report, with no location in it",
    );
    expect(events.at(-1)!.text).toBe("She is home (true); alerts to friends: 0");
    expect(alertsOf(events).filter((a) => a.to.some((x) => x !== "ana"))).toEqual([]);
  });

  it("is deterministic: the same night prints the same lines", async () => {
    const lines = async () => (await runExitAloneNight()).map(format);
    expect(await lines()).toEqual(await lines());
  });
});
