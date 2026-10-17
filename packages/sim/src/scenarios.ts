import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ScenarioFile } from "@bathroombestie/schema";

export const SCENARIO_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "scenarios");

export const loadScenarios = (dir = SCENARIO_DIR): ScenarioFile[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((f) => ScenarioFile.parse(JSON.parse(readFileSync(join(dir, f), "utf8"))));
