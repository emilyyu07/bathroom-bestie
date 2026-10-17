// Generates scenarios/*.json. Run: pnpm --filter @bathroombestie/sim generate
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeContract, ScenarioFile, type ScenarioEvidence } from "@bathroombestie/schema";
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
        area: mid(t), // stays with the group: this scenario is about the battery, not separation
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
    description:
      "Ana wanders off at 60, loses signal at 100 for 50 minutes; Bea confirms she is with her.",
    contract: makeContract(),
    timelines: {
      ana: [
        ...every(0, 100, (t) => ({
          area: t >= 60 ? FAR : mid(t), // apart long enough (40 min) before going dark
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

// 7. Brief separation then rejoin.
sc(
  {
    name: "07-brief-separation",
    description:
      "Ana steps away for 20 minutes then rejoins: under separation_min at relaxed and standard.",
    contract: makeContract(),
    timelines: {
      ana: every(0, 250, (t) => ({
        area: t >= 100 && t < 120 ? FAR : mid(t),
        motion: "walking",
        batteryPct: 70,
      })),
      ...together(250),
    },
    durationMin: 250,
    truth: "normal",
    label: { expect: "no_alert" },
  },
  "07-brief-separation.json",
);

// 8. Separated only: still reporting, a rung-1 nudge, then she rejoins.
sc(
  {
    name: "08-separated-only",
    description:
      "Ana is away from the group for 100 minutes but keeps reporting. Nudge to her only; closes on rejoin.",
    contract: makeContract(),
    timelines: {
      ana: every(0, 250, (t) => ({
        area: t >= 100 && t < 205 ? FAR : mid(t),
        motion: "walking",
        batteryPct: 70,
      })),
      ...together(250),
    },
    durationMin: 250,
    truth: "normal",
    label: {
      expect: "alert",
      rung: 1,
      from: 125,
      to: 125,
      onset: 100,
      maxRung: 1,
      resolvedBy: "rejoined",
    },
  },
  "08-separated-only.json",
);

// Home-deadline scenarios. Ana's home milestone applies only to her; expires covers it.
const homeBy240 = () =>
  makeContract({
    milestones: [{ id: "home", kind: "home", by: 240, who: ["ana"] }],
    expires: 480,
  });

// 9. Home on time: leaves the group late in the night and the geofence fires before the deadline.
sc(
  {
    name: "09-home-on-time",
    description:
      "Ana leaves the group at 215 and arrives home at 230, before her 240 deadline. No alert.",
    contract: homeBy240(),
    timelines: {
      ana: [
        ...every(0, 210, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 70 })),
        ...every(215, 225, () => ({ area: FAR, motion: "vehicle", batteryPct: 60 })),
        {
          at: 230,
          evidence: { ...base, area: FAR, motion: "vehicle", batteryPct: 60, homeArrived: true },
        },
      ],
      ...together(300),
    },
    durationMin: 300,
    truth: "normal",
    label: { expect: "no_alert" },
  },
  "09-home-on-time.json",
);

// 10. Late but still reporting: a quiet nudge to her only, closed by arriving home.
sc(
  {
    name: "10-home-late-reporting",
    description:
      "Ana stays out with the group past her 240 home deadline and keeps reporting. Nudge to her only; arrives at 300.",
    contract: homeBy240(),
    timelines: {
      ana: [
        ...every(0, 295, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 70 })),
        {
          at: 300,
          evidence: { ...base, area: FAR, motion: "vehicle", batteryPct: 55, homeArrived: true },
        },
      ],
      ...together(300),
    },
    durationMin: 310,
    truth: "normal",
    label: {
      expect: "alert",
      rung: 1,
      from: 251,
      to: 251,
      onset: 240,
      maxRung: 1,
      resolvedBy: "home",
    },
  },
  "10-home-late-reporting.json",
);

// 11. Late AND quiet while last seen with the group: 'unexplained stop' does not apply, the milestone does.
sc(
  {
    name: "11-home-missed-and-quiet",
    description:
      "Ana is last seen with the group at 235, then her phone goes quiet and she misses her 240 deadline.",
    contract: homeBy240(),
    timelines: {
      ana: every(0, 235, (t) => ({ area: mid(t), motion: groupMotion(t), batteryPct: 70 })),
      ...together(300),
    },
    durationMin: 300,
    truth: "concerning",
    label: { expect: "alert", rung: 2, from: 258, to: 262, onset: 240 },
  },
  "11-home-missed-and-quiet.json",
);
