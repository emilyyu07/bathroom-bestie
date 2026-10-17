import sweep from "../assets/sweep.json";

type Preset = {
  falseAlertsPerNormalNight: number;
  medianTimeToAlertMin: number | null;
  worstTimeToAlertMin: number | null;
};
const presets = (sweep as { presets: Record<string, Preset> }).presets;

/** One-line consequence for a preset, built only from the bundled sweep.json (no invented numbers). */
export function consequence(name: string): string {
  const p = presets[name];
  if (!p || p.medianTimeToAlertMin === null)
    return "No simulation data bundled yet (run `pnpm sim sweep`).";
  return `In simulated nights: a friend is alerted about ${p.medianTimeToAlertMin} min after trouble begins, with ${p.falseAlertsPerNormalNight} unneeded alerts per normal night.`;
}
