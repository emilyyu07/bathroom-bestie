import { useState } from "react";
import { useJson } from "./useJson";

interface ReplayAlert { t: number; rung: number; personId: string; message: string; factors: string[]; to: string[]; raisedBy?: string }
interface ReplayRun {
  name: string;
  description: string;
  members: string[];
  verdict: { expected: string; actual: string; pass: boolean };
  alerts: ReplayAlert[];
  trace: { t: number; n: Record<string, number> }[];
}

const COLORS = ["#2563eb", "#16a34a", "#d97706", "#9333ea"];

/** STUB: score curves + alert list. TODO: group map (areas, separation), incident timeline, step/scrub. */
export function Replay() {
  const { data, error } = useJson<ReplayRun[]>("/replay.json");
  const [i, setI] = useState(0);
  if (error) return <p>Run <code>pnpm sim replay</code> first. ({error})</p>;
  if (!data) return <p>Loading…</p>;
  const run = data[i]!;
  const W = 880, H = 220, maxT = run.trace.at(-1)?.t ?? 1;
  const x = (t: number) => 30 + (t / maxT) * (W - 40);
  const y = (n: number) => 10 + (1 - n) * (H - 30);
  return (
    <section>
      <select value={i} onChange={(e) => setI(Number(e.target.value))}>
        {data.map((r, k) => <option key={r.name} value={k}>{r.name}</option>)}
      </select>
      <p>{run.description} — <b>{run.verdict.pass ? "PASS" : "FAIL"}</b> (expected {run.verdict.expected}; got {run.verdict.actual})</p>
      <svg width={W} height={H} role="img" aria-label="Confidence of normal over time">
        <line x1={30} x2={W - 10} y1={y(0)} y2={y(0)} stroke="#999" />
        {run.members.map((m, k) => (
          <polyline key={m} fill="none" stroke={COLORS[k % COLORS.length]} strokeWidth={2}
            points={run.trace.map((p) => `${x(p.t)},${y(p.n[m] ?? 0)}`).join(" ")} />
        ))}
        {run.alerts.map((a) => <line key={a.t + a.message} x1={x(a.t)} x2={x(a.t)} y1={10} y2={H - 20} stroke="#dc2626" strokeDasharray="3 3" />)}
      </svg>
      <div>{run.members.map((m, k) => <span key={m} style={{ color: COLORS[k % COLORS.length], marginRight: 12 }}>■ {m}</span>)}</div>
      <h3>Alerts</h3>
      {run.alerts.length === 0 ? <p>None.</p> : (
        <ul>{run.alerts.map((a) => <li key={a.t + a.message}>t+{a.t} · rung {a.rung} → {a.to.join(", ")}: {a.message} <i>({a.factors.join("; ")})</i></li>)}</ul>
      )}
    </section>
  );
}
