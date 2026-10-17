import { useEffect, useState } from "react";
import { View } from "react-native";
import { get, nowMinute } from "../api";
import { color, space } from "../theme";
import { Body, Card, Heading, Pill, Screen, Title } from "../ui";

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
        <Card>
          <Heading>No night yet</Heading>
          <Body muted>Make a plan and check you're ready, then start your night here.</Body>
        </Card>
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
      <Title>We're looking out for you tonight 💗</Title>
      <Card>
        {current && (
          <Body>
            <Body style={{ color: color.primary }}>Watching now: </Body>
            {current.who} (until {clock(current.to)})
          </Body>
        )}
        {next && (
          <Body>
            <Body style={{ color: color.primary }}>Next: </Body>
            {next.who} (from {clock(next.from)})
          </Body>
        )}
        {contract && <Body muted>Night ends around {clock(contract.window.end)}</Body>}
        {home && <Body muted>Home by {clock(home.by)} 🏠</Body>}
      </Card>
      <Heading>Messages for you</Heading>
      {alerts.length === 0 && (
        <Card>
          <Body>Nothing to do. Have fun! ✨</Body>
        </Card>
      )}
      {alerts.slice(0, 3).map((a) => (
        <Card key={a.id} style={{ backgroundColor: color.blush, borderColor: color.blushBorder }}>
          <View style={{ flexDirection: "row" }}>
            <Pill>{Math.max(0, now - a.t)} min ago</Pill>
          </View>
          {/* Fixed engine template text: shown exactly as written. */}
          <Body>{a.message}</Body>
        </Card>
      ))}
      <Body muted style={{ fontSize: 14, marginTop: space.sm }}>
        Got a nudge? Just open the app. That sends a fresh update and clears it.
      </Body>
    </Screen>
  );
}
