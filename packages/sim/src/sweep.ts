import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { loadScenarios } from "./scenarios";
import { sweepScenarios, toCsv } from "./sweepCore";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const repo = join(root, "..", "..");

export function sweepCommand(): number {
  const result = sweepScenarios(loadScenarios());
  const json = JSON.stringify(result, null, 2) + "\n";
  const out = join(root, "out");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out, "sweep.json"), json);
  writeFileSync(join(out, "sweep.csv"), toCsv(result));
  // Bundled copies for the apps (they must not invent numbers).
  for (const dir of ["apps/mobile/assets", "apps/console/public"]) {
    if (existsSync(join(repo, dir))) writeFileSync(join(repo, dir, "sweep.json"), json);
  }
  console.log(toCsv(result));
  for (const [p, s] of Object.entries(result.presets)) {
    if (s.knownMisses.length) console.log(`known misses at ${p}: ${s.knownMisses.join(", ")}`);
  }
  console.log("wrote packages/sim/out/sweep.json and sweep.csv");
  return 0;
}
