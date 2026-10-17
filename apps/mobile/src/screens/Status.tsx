import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { get, nowMinute } from "../api";

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
      <View style={{ padding: 16 }}>
        <Text>No night is running. Make a plan and run pre-flight to start one.</Text>
      </View>
    );

  const slots = contract?.group.watch ?? [];
  const current = slots.find((s) => s.from <= now && now < s.to);
  const next = slots.find((s) => s.from > now);
  const home = contract?.milestones.find(
    (m) => m.kind === "home" && (!m.who || m.who.includes(me)),
  );
  return (
    <View style={{ padding: 16, gap: 10 }}>
      <Text style={{ fontSize: 20 }}>BathroomBestie is watching your night.</Text>
      {current && (
        <Text>
          Watching now: {current.who} (until {clock(current.to)})
        </Text>
      )}
      {next && (
        <Text>
          Next: {next.who} (from {clock(next.from)})
        </Text>
      )}
      {contract && <Text>Night ends around {clock(contract.window.end)}</Text>}
      {home && <Text>Home by {clock(home.by)}</Text>}
      <Text style={{ fontSize: 18, marginTop: 12 }}>Messages for you</Text>
      {alerts.length === 0 && <Text>None. Nothing to do.</Text>}
      {alerts.slice(0, 3).map((a) => (
        <Text key={a.id}>
          {a.message} ({Math.max(0, now - a.t)} min ago)
        </Text>
      ))}
      <Text style={{ color: "#555", marginTop: 12 }}>
        Opening the app sends a fresh update, which clears any nudge.
      </Text>
    </View>
  );
}
