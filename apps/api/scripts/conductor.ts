import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Plays phones for the demo by driving the REAL apps (Maestro taps and types on the simulators and
 * emulators) and watching the server for what to do next. The two sides share nothing but the API:
 *
 *   ios      Cynthia and Dee (iOS Simulators): wait for Ana's plan, join by its code, wait for the night to
 *            start, wait for Cynthia's alert, then tap "I'm worried" (and optionally "Text").
 *   android  Ana and Bea (Android emulators): plan the night, join Bea, save the safe place and the
 *            emergency contact, run pre-flight, start the night, walk Ana away, and walk her to the safe place.
 *
 * pnpm demo:conductor ios     [--api URL] [--cynthia NAME|UDID] [--dee NAME|UDID] [--record DIR] [--no-text] [--existing]
 * pnpm demo:conductor android [--api URL] --ana SERIAL --bea SERIAL [--sentence "..."]
 *
 * Needs the API running with DEMO_MODE=1 (it serves GET /demo/latest), Maestro, and JAVA_HOME for Java 17.
 */

// ---- args ----------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const role = argv[0];
const opt = (name: string, fallback?: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1]!.startsWith("--") ? argv[i + 1] : fallback;
};
const flag = (name: string) => argv.includes(`--${name}`);
if (role !== "ios" && role !== "android") {
  console.error(
    "usage: pnpm demo:conductor <ios|android> [options]  (see the header of scripts/conductor.ts)",
  );
  process.exit(1);
}
const API = opt("api", "http://localhost:3000")!;
const FLOWS = resolve(dirname(fileURLToPath(import.meta.url)), "../../../demo/flows");

// ---- places (all inside the 2 km corridor around 43.65, -79.38) ----------------------------------
const BAR = { lat: 43.65, lon: -79.38 };
const SAFE = { lat: 43.665, lon: -79.38 }; // ~1.7 km from the bar
const WALK = [43.652, 43.654, 43.656, 43.658, 43.66]; // away from the bar, ~220 m per step

// ---- helpers -------------------------------------------------------------------------------------
/** How long a conductor waits on the other side (a person re-running, a slow emulator) before giving up. */
const MAX_WAIT_S = Number(opt("max-wait", "120")) * 60;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stamp = () => new Date().toLocaleTimeString("en-GB");
const log = (m: string) => console.log(`${stamp()} [${role}] ${m}`);

async function api<T>(path: string): Promise<{ status: number; json: T | null }> {
  try {
    const r = await fetch(API + path);
    const t = await r.text();
    return { status: r.status, json: t ? (JSON.parse(t) as T) : null };
  } catch {
    return { status: 0, json: null };
  }
}
/** Polls until `ready` returns a value (not undefined), logging every 20 s; throws after `timeoutS`. */
async function until<T>(
  what: string,
  ready: () => Promise<T | undefined>,
  timeoutS: number,
): Promise<T> {
  const t0 = Date.now();
  let last = 0;
  for (;;) {
    const v = await ready();
    if (v !== undefined) return v;
    if (Date.now() - t0 > timeoutS * 1000)
      throw new Error(`timed out after ${timeoutS}s waiting for ${what}`);
    if (Date.now() - last > 20_000) {
      log(`waiting for ${what}...`);
      last = Date.now();
    }
    await sleep(2000);
  }
}

interface Latest {
  contractId: string;
  joinCode: string;
  owner: string;
  members: string[];
  status: "draft" | "active";
}
interface Alert {
  id: string;
  rung: number;
  kind: string;
  personId: string;
  to: string[];
  t: number;
}
interface Backstage {
  owner: string;
  members: { id: string; view: string }[];
  incidents: { personId: string; kind: string; status: string; resolution: string | null }[];
}
/** She is home when the server's view of her says so (an open incident then closes as "home"). */
const arrived = (b: Backstage | null) =>
  !!b?.members.some((m) => m.id === b.owner && m.view === "home");
const latest = async () => (await api<Latest>("/demo/latest")).json ?? undefined;

// Maestro needs Java 17; Homebrew's openjdk@17 is keg-only, so point at it when it is there.
const javaHome = process.env.JAVA_HOME ?? "/opt/homebrew/opt/openjdk@17";
const env = {
  ...process.env,
  ...(existsSync(javaHome)
    ? { JAVA_HOME: javaHome, PATH: `${javaHome}/bin:${process.env.PATH}` }
    : {}),
};
function maestro(device: string, flow: string, vars: Record<string, string> = {}): void {
  const args = [
    "--device",
    device,
    "test",
    ...Object.entries(vars).flatMap(([k, v]) => ["-e", `${k}=${v}`]),
    join(FLOWS, flow),
  ];
  log(`maestro ${flow} on ${device}`);
  const r = spawnSync("maestro", args, {
    env,
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
    // A lagging emulator can leave Maestro waiting forever; a flow that is not done by now has failed.
    timeout: Number(opt("flow-timeout", "240")) * 1000,
    killSignal: "SIGKILL",
  });
  if (r.error && (r.error as NodeJS.ErrnoException).code === "ETIMEDOUT")
    throw new Error(`maestro flow ${flow} on ${device} did not finish in time (emulator lagging?)`);
  if (r.status !== 0) {
    console.error((r.stdout ?? "") + (r.stderr ?? ""));
    throw new Error(`maestro flow ${flow} failed on ${device}`);
  }
}

/**
 * Runs a flow; if it fails or times out, says exactly what to do by hand and carries on, so one stuck tap
 * (a lagging emulator, a label that differs) does not end the night. Returns whether the flow ran.
 */
function flowOrHandOff(
  device: string,
  flow: string,
  vars: Record<string, string>,
  yourTurn: string,
): boolean {
  try {
    maestro(device, flow, vars);
    return true;
  } catch (e) {
    log(`FLOW FAILED: ${(e as Error).message.split("\n")[0]}`);
    log(`YOUR TURN (on ${device}): ${yourTurn}`);
    return false;
  }
}

// ---- iOS: Cynthia and Dee -------------------------------------------------------------------------
function udidOf(nameOrUdid: string): string {
  if (/^[0-9A-F-]{36}$/i.test(nameOrUdid)) return nameOrUdid;
  const j = JSON.parse(
    spawnSync("xcrun", ["simctl", "list", "devices", "-j"], { encoding: "utf8" }).stdout,
  ) as {
    devices: Record<string, { name: string; udid: string; state: string }[]>;
  };
  const hit = Object.values(j.devices)
    .flat()
    .find((d) => d.name === nameOrUdid && d.state === "Booted");
  if (!hit) throw new Error(`no booted simulator named "${nameOrUdid}"`);
  return hit.udid;
}

async function runIos() {
  const cynthia = udidOf(opt("cynthia", "Cynthia")!);
  const dee = udidOf(opt("dee", "Dee")!);
  const recordings: ChildProcess[] = [];

  for (const d of [cynthia, dee])
    spawnSync("xcrun", ["simctl", "location", d, "set", `${BAR.lat},${BAR.lon}`]);
  log("Cynthia and Dee placed at the bar");

  const dir = opt("record");
  if (dir) {
    mkdirSync(dir, { recursive: true });
    for (const [name, d] of [
      ["cynthia", cynthia],
      ["dee", dee],
    ] as const)
      recordings.push(
        spawn(
          "xcrun",
          ["simctl", "io", d, "recordVideo", "--codec=h264", "--force", join(dir, `${name}.mp4`)],
          { stdio: "ignore" },
        ),
      );
    log(`recording both phones to ${dir}`);
  }
  const stopRecording = async () => {
    for (const r of recordings) r.kill("SIGINT"); // SIGINT finishes the file properly
    if (recordings.length) await sleep(3000);
  };
  // Ctrl-C or a kill must still close the recordings, or the Simulator is left "already recording".
  for (const sig of ["SIGINT", "SIGTERM"] as const)
    process.once(sig, () => void stopRecording().then(() => process.exit(130)));

  try {
    if ((await api("/health")).status !== 200)
      throw new Error(`the API is not reachable at ${API}`);
    // By default wait for a NEW plan; --existing joins the newest one if it is still waiting for friends.
    const current = await latest();
    const before =
      flag("existing") && current?.status === "draft" ? undefined : current?.contractId;
    log(
      before
        ? "waiting for Ana to plan a NEW night (ignoring the existing one)..."
        : "waiting for Ana's plan...",
    );
    let night = await until(
      "Ana's plan",
      async () => {
        const l = await latest();
        return l && l.contractId !== before ? l : undefined;
      },
      Number(opt("wait", "30")) * 60,
    );

    // Join the two iOS friends by typing the code in the real app. Ana may re-plan before she starts
    // (a retry, a fixed tap): then the friends leave the old night and join the newest one.
    for (;;) {
      log(`CODE ${night.joinCode}  members ${night.members.join(", ")}`);
      for (const [name, d] of [
        ["cynthia", cynthia],
        ["dee", dee],
      ] as const) {
        if (!night.members.includes(name)) {
          log(`skipping ${name}: not in this night (${night.members.join(", ")})`);
          continue;
        }
        maestro(d, "ios-join.yaml", { CODE: night.joinCode, NAME: name });
        log(`JOINED ${name}`);
      }
      const outcome = await until(
        "the night to start (Ana taps Start), or a newer plan",
        async () => {
          const l = await latest();
          if (!l) return undefined;
          if (l.contractId !== night.contractId) return { replanned: l };
          return l.status === "active" ? { replanned: null } : undefined;
        },
        MAX_WAIT_S,
      );
      if (!outcome.replanned) break;
      log("Ana planned a NEW night: moving the friends to it");
      night = outcome.replanned;
    }
    log("T0: the night is active");

    // Cynthia is the first named friend, so she is the first watcher: her alert is the first rung-2 one.
    const alert = await until(
      "an alert for Cynthia",
      async () => {
        const r = await api<{ alerts: Alert[] }>(
          `/incidents?contractId=${night.contractId}&to=cynthia`,
        );
        return r.json?.alerts.find((a) => a.rung >= 2) ?? undefined;
      },
      MAX_WAIT_S,
    );
    log(
      `ALERT for Cynthia (rung ${alert.rung}, ${alert.kind}); letting it show for ${opt("worry-delay", "12")}s`,
    );
    await sleep(Number(opt("worry-delay", "12")) * 1000);
    maestro(cynthia, "ios-worry.yaml", { TEXT_CONTACT: flag("no-text") ? "0" : "1" });
    log("WORRIED: Cynthia tapped I'm worried");

    await until(
      "Ana to reach her safe place",
      async () => {
        const b = (await api<Backstage>(`/contracts/${night.contractId}/backstage`)).json;
        return arrived(b) ? true : undefined;
      },
      10 * 60,
    );
    log(`ARRIVED: holding ${opt("tail", "15")}s on the result`);
    await sleep(Number(opt("tail", "15")) * 1000);
    log("done");
  } finally {
    await stopRecording();
  }
}

// ---- Android: Ana and Bea (written from the screens' labels; not run on an emulator by its author) --
const adb = (serial: string, ...args: string[]) =>
  spawnSync("adb", ["-s", serial, ...args], { encoding: "utf8" });
/** adb takes longitude first. */
const place = (serial: string, p: { lat: number; lon: number }) =>
  adb(serial, "emu", "geo", "fix", String(p.lon), String(p.lat));

async function runAndroid() {
  const ana = opt("ana");
  const bea = opt("bea");
  if (!ana || !bea)
    throw new Error(
      "android role needs --ana <adb serial> and --bea <adb serial> (see `adb devices`)",
    );
  const sentence = opt(
    "sentence",
    "Out with Cynthia, Bea and Dee until 2am, home by 4 hours. Be careful please.",
  )!;
  const name = opt("name", "Ana")!;

  if ((await api("/health")).status !== 200) throw new Error(`the API is not reachable at ${API}`);
  place(ana, BAR);
  place(bea, BAR);
  log("Ana and Bea placed at the bar");

  const before = (await latest())?.contractId;
  const planned = flowOrHandOff(
    ana,
    "android-ana-plan.yaml",
    { NAME: name, SENTENCE: sentence },
    `plan the night by hand: name "${name}", the plan "${sentence}", Make my plan, then "The plan looks right"`,
  );
  const night = await until(
    "the plan to reach the API",
    async () => {
      const l = await latest();
      return l && l.contractId !== before ? l : undefined;
    },
    planned ? 120 : 10 * 60,
  );
  log(`PLANNED. CODE ${night.joinCode}  members ${night.members.join(", ")}`);

  if (
    flowOrHandOff(
      bea,
      "android-bea-join.yaml",
      { CODE: night.joinCode, NAME: "bea" },
      `join by hand: Join a friend's night, code ${night.joinCode}, Find the night, I'm bea`,
    )
  )
    log("JOINED bea");

  // Ana goes on only once every friend has accepted (Cynthia and Dee are joined by the iOS side).
  const friends = night.members.slice(1);
  await until(
    `all friends to join (${friends.join(", ")})`,
    async () => {
      const r = await api<{ watchers: { id: string; accepted: boolean }[] }>(
        `/contracts/${night.contractId}/watchers`,
      );
      return r.json && friends.every((f) => r.json!.watchers.some((w) => w.id === f && w.accepted))
        ? true
        : undefined;
    },
    10 * 60,
  );
  log("everyone has joined");

  // "I'm there now, use this spot" saves where she is right now, so stand her at the safe place first.
  place(ana, SAFE);
  await sleep(4000);
  if (
    !flowOrHandOff(
      ana,
      "android-ana-safeplace.yaml",
      {},
      `tap "I'm there now, use this spot" (Ana is standing at the safe place); I wait ${opt("hand-wait", "60")}s`,
    )
  )
    await sleep(Number(opt("hand-wait", "60")) * 1000);
  place(ana, BAR);
  await sleep(4000);
  flowOrHandOff(
    ana,
    "android-ana-ready.yaml",
    {
      CONTACT_NAME: opt("contact-name", "Mom")!,
      CONTACT_PHONE: opt("contact-phone", "+1 555 010 0123")!,
    },
    "save the emergency contact, tap Check I'm ready (allow permissions), then Start the night",
  );

  // Either the flow started the night or a person is finishing it by hand: wait for the server to say so.
  await until(
    "the night to start (Start the night on Ana's phone)",
    async () => ((await latest())?.status === "active" ? true : undefined),
    10 * 60,
  );
  log("T0: the night is active");

  const walkDelay = Number(opt("walk-delay", "180"));
  log(
    `holding at the bar for ${walkDelay}s so the friends' phones report first (never under 150 s)`,
  );
  await sleep(walkDelay * 1000);
  log("WALK: Ana leaves the group");
  for (const lat of WALK) {
    place(ana, { lat, lon: BAR.lon });
    await sleep(15_000);
  }

  // The iOS side taps "I'm worried" when Cynthia's alert lands; give that time, then bring Ana safely there.
  await until(
    "Cynthia's report",
    async () => {
      const r = await api<{ alerts: Alert[] }>(`/incidents?contractId=${night.contractId}`);
      return r.json?.alerts.some((a) => a.kind === "friend_worry") ? true : undefined;
    },
    Number(opt("worry-wait", "10")) * 60,
  ).catch(() => log("no friend report seen; arriving anyway"));
  await sleep(Number(opt("arrive-delay", "45")) * 1000);
  log("ARRIVING: Ana reaches her safe place");
  place(ana, SAFE);
  await until(
    "the arrival to register",
    async () => {
      const b = (await api<Backstage>(`/contracts/${night.contractId}/backstage`)).json;
      return arrived(b) ? true : undefined;
    },
    3 * 60,
  ).catch(() => log("arrival not seen on the server yet (the geofence can take a minute)"));
  log("done");
}

try {
  await (role === "ios" ? runIos() : runAndroid());
} catch (e) {
  console.error(`${stamp()} [${role}] FAILED: ${(e as Error).message}`);
  process.exit(1);
}
