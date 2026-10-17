import { emitKeypressEvents } from "node:readline";
import { findNight, playFriends, type Call } from "../src/friends";

// pnpm demo:friends <join code | contract id> [--api URL] [--at lat,lon]
const args = process.argv.slice(2);
const flag = (name: string, fallback: string) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? args[i + 1]! : fallback;
};
const code = args[0] && !args[0].startsWith("--") ? args[0] : undefined;
if (!code) {
  console.error("usage: pnpm demo:friends <join code | contract id> [--api URL] [--at lat,lon]");
  process.exit(1);
}
const api = flag("--api", "http://localhost:3000");
const [lat, lon] = flag("--at", "43.65,-79.38").split(",").map(Number) as [number, number];

const call: Call = async (method, path, body) => {
  const r = await fetch(api + path, {
    method,
    headers: { "content-type": "application/json" },
    body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await r.text();
  return { status: r.status, json: text ? JSON.parse(text) : null };
};
const stamp = () => new Date().toLocaleTimeString();
const log = (s: string) => console.log(`${stamp()}  ${s}`);

const found = await findNight(call, code);
const contract = (
  (await call("GET", `/contracts/${found.contractId}`)).json as {
    contract: { thresholds: { report_every_min: number }; expires: number; demo?: boolean };
  }
).contract;
const friends = playFriends({
  call,
  now: () => Math.floor(Date.now() / 60_000),
  found,
  at: { lat, lon },
  log,
});

console.log(`${found.owner}'s night ${found.contractId}${contract.demo ? " (DEMO timers)" : ""}`);
console.log(`Friends: ${friends.ids.join(", ")}, at the bar (${lat}, ${lon}).`);
console.log(`Put the emulator at the bar:  adb emu geo fix ${lon} ${lat}`);
console.log(`Then ${found.owner} leaves:    adb emu geo fix ${lon} ${lat + 0.01}`);
console.log(
  `Keys: ${friends.ids.map((id) => `${id[0]} = ${id} taps "I'm with her"`).join(", ")}, q = quit\n`,
);

await friends.join();
const everyMs = contract.thresholds.report_every_min * 60_000;
const tick = () => void friends.report().catch((e) => log(`report failed: ${e}`));
tick();
const timer = setInterval(tick, everyMs);
const done = () => {
  clearInterval(timer);
  process.exit(0);
};

if (process.stdin.isTTY) {
  emitKeypressEvents(process.stdin);
  process.stdin.setRawMode(true);
  process.stdin.on("keypress", (str: string, key: { ctrl?: boolean; name?: string }) => {
    if (str === "q" || (key.ctrl && key.name === "c")) return done();
    const who = friends.ids.find((id) => id.startsWith(str));
    if (who) void friends.confirm(who).catch((e) => log(`confirm failed: ${e}`));
  });
}
