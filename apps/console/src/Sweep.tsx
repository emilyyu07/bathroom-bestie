import { useState } from "react";
import { useJson } from "./useJson";

interface PresetSweep { falseAlertsPerNormalNight: number; medianTimeToAlertMin: number | null; worstTimeToAlertMin: number | null; knownMisses: string[] }
type SweepFile = { presets: Record<string, PresetSweep> };

/** False alerts (x) against median time-to-alert (y), one point per preset. Numbers come only from sweep.json. */
export function Sweep() {
  const { data, error } = useJson<SweepFile>("/sweep.json");
  const [selected, setSelected] = useState("standard");
  if (error) return <p>Run <code>pnpm sim sweep</code> first. ({error})</p>;
  if (!data) return <p>Loading…</p>;
  const pts = Object.entries(data.presets).filter(([, s]) => s.medianTimeToAlertMin !== null);
  const W = 520, H = 320, pad = 50;
  const maxX = Math.max(1, ...pts.map(([, s]) => s.falseAlertsPerNormalNight)) * 1.2;
  const maxY = Math.max(1, ...pts.map(([, s]) => s.medianTimeToAlertMin!)) * 1.2;
  const px = (v: number) => pad + (v / maxX) * (W - pad - 20);
  const py = (v: number) => H - pad - (v / maxY) * (H - pad - 20);
  return (
    <section>
      <label>Selected preset{" "}
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          {Object.keys(data.presets).map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <svg width={W} height={H} role="img" aria-label="False alerts versus median time to alert">
        <line x1={pad} x2={W - 10} y1={H - pad} y2={H - pad} stroke="#999" />
        <line x1={pad} x2={pad} y1={10} y2={H - pad} stroke="#999" />
        <text x={W / 2} y={H - 10} textAnchor="middle">False alerts per normal night</text>
        <text x={14} y={H / 2} transform={`rotate(-90 14 ${H / 2})`} textAnchor="middle">Median minutes to alert</text>
        {pts.map(([name, s]) => (
          <g key={name}>
            <circle cx={px(s.falseAlertsPerNormalNight)} cy={py(s.medianTimeToAlertMin!)} r={name === selected ? 9 : 5} fill={name === selected ? "#dc2626" : "#64748b"} />
            <text x={px(s.falseAlertsPerNormalNight) + 12} y={py(s.medianTimeToAlertMin!) + 4}>{name}</text>
          </g>
        ))}
      </svg>
      <table>
        <thead><tr><th>preset</th><th>false alerts / normal night</th><th>median</th><th>worst</th><th>misses</th></tr></thead>
        <tbody>{Object.entries(data.presets).map(([n, s]) => (
          <tr key={n} style={{ fontWeight: n === selected ? 700 : 400 }}>
            <td>{n}</td><td>{s.falseAlertsPerNormalNight}</td><td>{s.medianTimeToAlertMin ?? "-"}</td><td>{s.worstTimeToAlertMin ?? "-"}</td><td>{s.knownMisses.join(", ") || "none"}</td>
          </tr>))}</tbody>
      </table>
    </section>
  );
}
