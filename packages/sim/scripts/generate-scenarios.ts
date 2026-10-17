// Generates scenarios/*.json. Run: pnpm --filter @tether/sim generate
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeContract, ScenarioFile, type ScenarioEvidence } from "@tether/schema";
import { SCENARIO_DIR } from "../src/scenarios";

type Ev = ScenarioEvidence;
type Timeline = { at: number; evidence: Ev }[];
const A = { lat: 43.65, lon: -79.38 }; // bar A
const B = { lat: 43.653, lon: -79.383 }; // bar B, ~330 m away
const FAR = { lat: 43.66, lon: -79.38 }; // ~1.1 km from A

const base: Ev = { area: A, motion: "still", batteryPct: 80, charging: false, permissionOk: true };

/** Report every 5 min from `from` to `to` (inclusive), computing the evidence from the minute. */
const every = (from: number, to: number, f: (t: number) => Partial<Ev>): Timeline => {
  const out: Timeline = [];
  for (let t = from; t <= to; t += 5) out.push({ at: t, evidence: { ...base, ...f(t) } });
  return out;
};
const mid = (t: number) => (t < 60 ? A : t < 85 ? A : B);
const groupMotion = (t: number): Ev["motion"] =>
  t >= 60 && t < 80 ? "still" : t >= 80 && t < 85 ? "walking" : t % 20 === 0 ? "walking" : "still";

const sc = (s: unknown, file: string) => {
  const parsed = ScenarioFile.parse(s);
  writeFileSync(join(SCENARIO_DIR, file), JSON.stringify(parsed, null, 2) + "\n");
};

const together = (to: number): Record<string, Timeline> => ({
  bea: every(0, to, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 90 - t / 10 })),
  cy: every(0, to, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 85 - t / 10 })),
});

// 1. Normal night: bar change, 20 min queue, Ana gets home alone and the geofence fires.
sc(
  {
    name: "01-normal-night",
    description: "Bar change and a 20-minute queue; Ana arrives home. No alert.",
    contract: makeContract(),
    timelines: {
      ana: [
        ...every(0, 255, (t) => ({
          area: mid(t),
          motion: groupMotion(t),
          batteryPct: Math.round(80 - t / 8),
        })),
        {
          at: 260,
          evidence: {
            ...base,
            area: { lat: 43.662, lon: -79.395 },
            motion: "vehicle",
            batteryPct: 48,
            homeArrived: true,
          },
        },
      ],
      ...together(300),
    },
    durationMin: 300,
    truth: "normal",
    label: { expect: "no_alert" },
  },
  "01-normal-night.json",
);

// 2. Battery dies gracefully at 3%.
sc(
  {
    name: "02-battery-dies",
    description: "Ana's battery drains to 3% and her phone goes dark. Soft note only.",
    contract: makeContract(),
    timelines: {
      ana: every(0, 150, (t) => ({
        area: t >= 90 ? FAR : A,
        motion: "walking",
        batteryPct: Math.max(3, Math.round(50 - t / 3.2)),
      })),
      ...together(300),
    },
    durationMin: 300,
    truth: "normal",
    label: { expect: "no_alert" },
  },
  "02-battery-dies.json",
);

// 3. Separated then silent at 61%.
sc(
  {
    name: "03-separated-then-silent",
    description: "Ana drifts away from the group, then her phone stops updating at 61% battery.",
    contract: makeContract(),
    timelines: {
      ana: every(0, 140, (t) => ({
        area: t >= 100 ? FAR : mid(t),
        motion: "walking",
        batteryPct: 61,
      })),
      ...together(260),
    },
    durationMin: 260,
    truth: "concerning",
    label: { expect: "alert", rung: 2, from: 162, to: 170, onset: 140 },
  },
  "03-separated-then-silent.json",
);

// 4. False alarm: Ana is in a dead zone, a friend confirms.
sc(
  {
    name: "04-false-alarm-confirmed",
    description: "Ana loses signal for 50 minutes while apart; Bea confirms she is with her.",
    contract: makeContract(),
    timelines: {
      ana: [
        ...every(0, 100, (t) => ({
          area: t >= 80 ? FAR : mid(t),
          motion: "walking",
          batteryPct: 61,
        })),
        ...every(150, 250, () => ({ area: FAR, motion: "walking", batteryPct: 58 })),
      ],
      ...together(260),
    },
    actions: [{ type: "confirm", by: "bea", targetPersonId: "ana", at: 128 }],
    durationMin: 260,
    truth: "normal",
    label: {
      expect: "alert",
      rung: 2,
      from: 123,
      to: 127,
      onset: 100,
      maxRung: 2,
      resolvedBy: "confirmed",
    },
  },
  "04-false-alarm-confirmed.json",
);

// 5. Worry press with perfectly normal evidence.
sc(
  {
    name: "05-worry-press",
    description: "Everything looks normal, but Cy presses \"I'm worried\" (can't find her).",
    contract: makeContract(),
    timelines: {
      ana: every(0, 200, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 80 })),
      ...together(200),
    },
    actions: [{ type: "worry", by: "cy", targetPersonId: "ana", at: 120, reason: "cant_find" }],
    durationMin: 200,
    truth: "excluded",
    label: { expect: "alert", rung: 2, from: 120, to: 120, onset: 120 },
  },
  "05-worry-press.json",
);

// 6. Degraded readiness blocks activation.
sc(
  {
    name: "06-readiness-blocked",
    description: "Background location denied and no watcher has accepted: activation is blocked.",
    contract: makeContract(),
    timelines: {},
    readiness: {
      permissions: { backgroundLocation: false, notifications: true },
      battery: { level: 85, restricted: false, lowPowerMode: false },
      connectivityRttMs: 400,
      firstEvidenceAfterS: 20,
      watchers: [{ id: "bea", accepted: false, reachable: true }],
      homeGeofenceSet: true,
      contractConfirmed: true,
    },
    durationMin: 1,
    truth: "excluded",
    label: { expect: "activation_blocked" },
  },
  "06-readiness-blocked.json",
);
