import { useEffect, useState } from "react";
import { get, nowMinute } from "../api";
import { Body, Card, InfoRow, Label, Pill, Screen, Small, Title } from "../ui";

interface Contract {
  window: { start: number; end: number };
  group: { watch: { who: string; from: number; to: number }[] };
  milestones: { kind: string; by: number; who?: string[] }[];
}
interface Alert {
  id: string;
  t: number;
  to: string[];
  message: string;
}

const clock = (minute: number) =>
  new Date(minute * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** Her screen during the night: who is watching, what's planned, and any messages to her. */
export function Status({
  contractId,
  me,
  active,
}: {
  contractId: string;
  me: string;
  active: boolean;
}) {
  const [contract, setContract] = useState<Contract | null>(null);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [now, setNow] = useState(nowMinute());

  useEffect(() => {
    if (!active) return;
    const load = async () => {
      setNow(nowMinute());
      const [c, a] = await Promise.all([
        get<{ contract: Contract }>(`/contracts/${contractId}`),
        get<{ alerts: Alert[] }>(
          `/incidents?contractId=${encodeURIComponent(contractId)}&to=${encodeURIComponent(me)}`,
        ),
      ]);
      setContract(c.contract);
      setAlerts([...a.alerts].sort((x, y) => y.t - x.t)); // the server filters by `to`
    };
    void load().catch(() => undefined);
    const h = setInterval(() => void load().catch(() => undefined), 30_000);
    return () => clearInterval(h);
  }, [contractId, me, active]);

  if (!active)
    return (
      <Screen>
        <Title subtitle="Make a plan and check you're ready, then start your night.">Tonight</Title>
      </Screen>
    );

  const slots = contract?.group.watch ?? [];
  const current = slots.find((s) => s.from <= now && now < s.to);
  const next = slots.find((s) => s.from > now);
  const home = contract?.milestones.find(
    (m) => m.kind === "home" && (!m.who || m.who.includes(me)),
  );
  return (
    <Screen>
      <Title subtitle="We're looking out for you. Have fun 💗">Tonight</Title>
      <Card>
        {current && (
          <InfoRow label="Watching now" value={`${current.who} until ${clock(current.to)}`} />
        )}
        {next && <InfoRow label="Next" value={`${next.who} from ${clock(next.from)}`} />}
        {home && <InfoRow label="Home by" value={clock(home.by)} />}
        {contract && <InfoRow label="Night ends" value={`around ${clock(contract.window.end)}`} />}
      </Card>
      <Label>Messages for you</Label>
      {alerts.length === 0 && (
        <Card>
          <Body muted>Nothing to do. Enjoy your night ✨</Body>
        </Card>
      )}
      {alerts.slice(0, 3).map((a) => (
        <Card key={a.id} tint>
          <Pill>{Math.max(0, now - a.t)} min ago</Pill>
          {/* Fixed engine template text: shown exactly as written. */}
          <Body>{a.message}</Body>
        </Card>
      ))}
      <Small style={{ textAlign: "center" }}>
        Got a nudge? Just open the app. That sends a fresh update and clears it.
      </Small>
    </Screen>
  );
}
