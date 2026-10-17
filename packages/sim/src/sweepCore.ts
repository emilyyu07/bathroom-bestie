import { PRESET_ORDER, type PresetName, type ScenarioFile } from "@tether/schema";
import { runScenario } from "./runner";

export interface ScenarioSweep {
  name: string;
  truth: ScenarioFile["truth"];
  /** Alerts that reach someone other than the person herself (rung >= 2). */
  alertsToOthers: number;
  /** Minutes from onset to the first rung >= 2 alert, concerning nights only. */
  timeToAlert: number | null;
}

export interface PresetSweep {
  falseAlertsPerNormalNight: number;
  medianTimeToAlertMin: number | null;
  worstTimeToAlertMin: number | null;
  /** Concerning nights where nobody was alerted. Reported, never hidden. */
  knownMisses: string[];
  scenarios: ScenarioSweep[];
}

export interface SweepResult {
  presets: Record<PresetName, PresetSweep>;
}

const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function sweepScenarios(scenarios: ScenarioFile[]): SweepResult {
  const presets = {} as Record<PresetName, PresetSweep>;
  for (const preset of PRESET_ORDER) {
    const rows: ScenarioSweep[] = scenarios
      .filter((sc) => sc.truth !== "excluded")
      .map((sc) => {
        const r = runScenario(sc, preset);
        const first = r.alerts.find((a) => a.rung >= 2);
        const onset = sc.label.expect === "alert" ? sc.label.onset : 0;
        return {
          name: sc.name,
          truth: sc.truth,
          alertsToOthers: r.alerts.filter((a) => a.rung >= 2).length,
          timeToAlert: sc.truth === "concerning" && first ? first.t - sc.contract.window.start - onset : null,
        };
      });
    const normal = rows.filter((r) => r.truth === "normal");
    const concerning = rows.filter((r) => r.truth === "concerning");
    const times = concerning.flatMap((r) => (r.timeToAlert === null ? [] : [r.timeToAlert]));
    presets[preset] = {
      falseAlertsPerNormalNight: normal.length ? Math.round((normal.reduce((a, r) => a + r.alertsToOthers, 0) / normal.length) * 1000) / 1000 : 0,
      medianTimeToAlertMin: median(times),
      worstTimeToAlertMin: times.length ? Math.max(...times) : null,
      knownMisses: concerning.filter((r) => r.timeToAlert === null).map((r) => r.name),
      scenarios: rows,
    };
  }
  return { presets };
}

export const toCsv = (r: SweepResult): string =>
  [
    "preset,false_alerts_per_normal_night,median_time_to_alert_min,worst_time_to_alert_min,known_misses",
    ...PRESET_ORDER.map((p) => {
      const s = r.presets[p];
      return [p, s.falseAlertsPerNormalNight, s.medianTimeToAlertMin ?? "", s.worstTimeToAlertMin ?? "", s.knownMisses.join(";")].join(",");
    }),
  ].join("\n") + "\n";
