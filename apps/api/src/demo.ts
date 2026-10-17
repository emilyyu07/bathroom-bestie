import type { Alert, ReadinessSnapshot } from "@bathroombestie/schema";
import { FakeClock } from "./clock";
import { MockCompiler } from "./compile";
import { tick } from "./runner";
import { buildServer } from "./server";
import { MemoryStore } from "./store";

/**
 * A scripted night against the real API (every call goes through the routes), on the in-memory
 * store and a fake clock, so a whole night runs in a second. It is a development tool and a
 * fallback if the phone path breaks; the real demo drives the app on the emulator.
 */

export interface DemoEvent {
  /** Minutes since the night started. */
  t: number;
  kind: "setup" | "scene" | "alert" | "poll" | "action" | "end";
  text: string;
  alert?: Alert;
}
export type Say = (e: DemoEvent) => void;

const A = { lat: 43.65, lon: -79.38 }; // the bar
const AWAY = { lat: 43.66, lon: -79.38 }; // ~1.1 km away
const START = 1_000_000;
const SENTENCE = "Out with Bea and Cy for 5 hours, home by 4 hours";

const snapshot = (homeGeofenceSet: boolean): ReadinessSnapshot => ({
  permissions: { backgroundLocation: true, notifications: true },
  battery: { level: 90, restricted: false, lowPowerMode: false },
  connectivityRttMs: 200,
  firstEvidenceAfterS: 8,
  watchers: [
    { id: "bea", accepted: true, reachable: true },
    { id: "cy", accepted: true, reachable: true },
  ],
  homeGeofenceSet,
  contractConfirmed: true,
});

const clock = (t: number) =>
  `t+${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
export const format = (e: DemoEvent) => `${clock(e.t).padEnd(8)} ${e.text}`;

/** Sets a night up through the real routes and returns helpers to run it minute by minute. */
async function startNight(say: Say) {
  const store = new MemoryStore();
  const fake = new FakeClock(START);
  const app = buildServer({ store, clock: fake, compiler: new MockCompiler() });
  const t = () => fake.nowMinute() - START;
  const post = async (url: string, payload?: unknown) =>
    app.inject({ method: "POST", url, payload: payload as never });
  const get = async (url: string) => (await app.inject({ method: "GET", url })).json();

  say({ t: 0, kind: "setup", text: `She says: "${SENTENCE}"` });
  const compiled = (await post("/contracts/compile", { sentence: SENTENCE, me: "ana" })).json();
  const contract = compiled.contract;
  const cadence: number = contract.thresholds.report_every_min;
  say({ t: 0, kind: "setup", text: `Read-back: ${compiled.readBack}` });
  for (const term of compiled.terms as string[]) say({ t: 0, kind: "setup", text: `  - ${term}` });

  const blocked = await post("/preflight", { contractId: contract.id, snapshot: snapshot(false) });
  const first = await post(`/contracts/${contract.id}/activate`);
  say({
    t: 0,
    kind: "setup",
    text: `Pre-flight without a home geofence: ${blocked.json().state}; activate returns ${first.statusCode}`,
  });
  const ready = await post("/preflight", { contractId: contract.id, snapshot: snapshot(true) });
  const activated = await post(`/contracts/${contract.id}/activate`);
  say({
    t: 0,
    kind: "setup",
    text: `Pre-flight with it set: ${ready.json().state}; activate returns ${activated.statusCode}`,
  });
  await tick(store, fake);

  let seen = 0;
  const report = (personId: string, area: { lat: number; lon: number }) =>
    post("/evidence", {
      personId,
      contractId: contract.id,
      t: fake.nowMinute(),
      area,
      motion: "walking",
      batteryPct: 72,
      charging: false,
      permissionOk: true,
    });
  /** Her arrival is an event, not a place: no area (invariant 5). */
  const arrive = () =>
    post("/evidence", {
      personId: "ana",
      contractId: contract.id,
      t: fake.nowMinute(),
      motion: "still",
      batteryPct: 70,
      charging: false,
      permissionOk: true,
      homeArrived: true,
    });

  /** Advance one minute: run the engine and narrate any new alerts. */
  const step = async () => {
    fake.t += 1;
    await tick(store, fake);
    const all = await store.listAlerts(contract.id);
    for (const a of all.slice(seen)) {
      say({
        t: t(),
        kind: "alert",
        alert: a,
        text: `rung ${a.rung} -> ${a.to.join(", ")}: ${a.message}`,
      });
    }
    seen = all.length;
  };
  const poll = async (who: string) => {
    const r = await get(`/incidents?contractId=${contract.id}&to=${who}`);
    say({
      t: t(),
      kind: "poll",
      text: `${who}'s phone asks for alerts addressed to ${who}: ${r.alerts.length} (${
        r.alerts.map((a: Alert) => `rung ${a.rung}`).join(", ") || "none"
      })`,
    });
    return r.alerts as Alert[];
  };
  const confirm = async (by: string, target: string) => {
    await post("/actions", {
      contractId: contract.id,
      type: "confirm",
      by,
      targetPersonId: target,
    });
    // Delivered by the next minute's tick, like a real tap between two ticks.
    say({ t: t(), kind: "action", text: `${by} taps "I'm with her" for ${target}` });
  };
  const state = async () => (await store.getEngine(contract.id))!.state;

  return { contract, cadence, store, fake, t, step, report, arrive, poll, confirm, state, say };
}

type Night = Awaited<ReturnType<typeof startNight>>;
const everyone = async (n: Night, ana: "with" | "away" | "none") => {
  await n.report("bea", A);
  await n.report("cy", A);
  if (ana !== "none") await n.report("ana", ana === "away" ? AWAY : A);
};

/**
 * MAIN RUN. She leaves the group alone, keeps reporting, and never gets home. Only the exit-alone
 * clock catches it: nudge, then a friend, then a friend confirms she is fine.
 */
export async function runExitAloneNight(say: Say = () => {}): Promise<DemoEvent[]> {
  // Ends well before the restarted clock could fire again (see the end-of-run line).
  const END = 175;
  const events: DemoEvent[] = [];
  const out: Say = (e) => (events.push(e), say(e));
  const n = await startNight(out);
  const LEAVES = 99;
  const home = n.contract.milestones.find((m: { kind: string }) => m.kind === "home");
  out({ t: 0, kind: "setup", text: `Phones report every ${n.cadence} minutes (contract data)` });
  out({
    t: 0,
    kind: "scene",
    text: `Home deadline: minute ${home.by - 1_000_000}. Group is at the bar.`,
  });

  let confirmed = false;
  for (let m = 1; m <= END; m++) {
    if (m % n.cadence === 0) await everyone(n, m >= LEAVES ? "away" : "with");
    if (m === LEAVES)
      out({ t: m, kind: "scene", text: "Ana leaves the group alone, on foot, still reporting." });
    await n.step();
    const rung2 = events.find((e) => e.alert && e.alert.rung >= 2 && e.alert.kind === "exit_alone");
    if (rung2 && !confirmed && m === rung2.t + 2) {
      const friend = rung2.alert!.to[0]!;
      await n.poll(friend);
      await n.confirm(friend, "ana");
      confirmed = true;
    }
  }
  await n.poll("bea");
  await n.poll("ana");
  const s = await n.state();
  const inc = s.incidents.find((i) => i.personId === "ana");
  // The confirm restarted her exit-alone clock: the next alert is exit_alone_min after it.
  const restartedAt = (s.people.ana!.exitAloneSince ?? 0) - 1_000_000;
  const nextAlert = restartedAt + n.contract.thresholds.exit_alone_min;
  out({
    t: END,
    kind: "end",
    text: `Incident: ${inc?.kind}, ${inc?.status} (${inc?.resolution}). The confirm restarted her exit-alone clock: if she is still not home, it alerts again after ${clock(nextAlert)}.`,
  });
  return events;
}

/** SHORT RUN. The same walk home, but she arrives: an arrival report with no location, and nothing alarming. */
export async function runArrivalNight(say: Say = () => {}): Promise<DemoEvent[]> {
  const events: DemoEvent[] = [];
  const out: Say = (e) => (events.push(e), say(e));
  const n = await startNight(out);
  const LEAVES = 99;
  for (let m = 1; m <= 200; m++) {
    if (m % n.cadence === 0 && m < 120) await everyone(n, m >= LEAVES ? "away" : "with");
    if (m === LEAVES) out({ t: m, kind: "scene", text: "Ana leaves the group alone, on foot." });
    if (m === 120) {
      await n.arrive();
      out({ t: m, kind: "scene", text: "Ana is home: an arrival report, with no location in it." });
    }
    if (m % n.cadence === 0 && m > 120) {
      await n.report("bea", A);
      await n.report("cy", A);
    }
    await n.step();
  }
  const s = await n.state();
  out({
    t: 200,
    kind: "end",
    text: `She is home (${s.people.ana!.home}); alerts to friends: ${events.filter((e) => e.alert && e.alert.to.some((x) => x !== "ana")).length}`,
  });
  return events;
}
