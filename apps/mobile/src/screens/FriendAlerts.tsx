import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { get, nowMinute, post } from "../api";

/** Mirrors Alert in packages/schema (the mobile app is outside the workspace). */
interface Alert {
  id: string;
  rung: 1 | 2 | 3 | 4;
  personId: string;
  t: number;
  factors: string[];
  lastKnown: { area: { lat: number; lon: number }; t: number } | null;
  raisedBy?: string;
  message: string;
  script911?: string;
}

const POLL_MS = 20_000; // no push delivery in scope: the friend's phone polls
const RUNG: Record<Alert["rung"], string> = {
  1: "Nudge to her",
  2: "You're her watcher",
  3: "Passed on to you",
  4: "You're taking over",
};

const clock = (minute: number) =>
  new Date(minute * 60_000).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

/** A map pin at the rounded last-known area. Opening a map is fine; nothing is ever dialled. */
const openMap = ({ lat, lon }: { lat: number; lon: number }) =>
  Linking.openURL(
    Platform.OS === "android"
      ? `geo:${lat},${lon}?q=${lat},${lon}`
      : `https://maps.google.com/?q=${lat},${lon}`,
  );

/**
 * The friend's alerts: everything addressed to them, newest first. Alert text comes from the
 * engine's fixed templates; this screen adds labels only.
 */
export function FriendAlerts({
  contractId,
  me,
  reason,
}: {
  contractId: string;
  me: string;
  /** The reason chip currently picked on the Watcher screen, sent with "I'm worried". */
  reason?: string;
}) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [checkedAt, setCheckedAt] = useState<number | null>(null);
  const [error, setError] = useState(false);
  const [sent, setSent] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const r = await get<{ alerts: Alert[] }>(
        `/incidents?contractId=${encodeURIComponent(contractId)}&to=${encodeURIComponent(me)}`,
      );
      setAlerts([...r.alerts].sort((a, b) => b.t - a.t));
      setCheckedAt(nowMinute());
      setError(false);
    } catch {
      setError(true);
    }
  }, [contractId, me]);

  useEffect(() => {
    void load();
    const h = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(h);
  }, [load]);

  const act = async (a: Alert, type: "confirm" | "worry") => {
    try {
      await post("/actions", {
        contractId,
        type,
        by: me,
        targetPersonId: a.personId,
        ...(type === "worry" && reason ? { reason } : {}),
      });
      setSent((s) => ({ ...s, [a.id]: type === "confirm" ? "Sent: you're with her." : "Sent." }));
    } catch {
      setSent((s) => ({ ...s, [a.id]: "Couldn't send. Try again." }));
    }
  };

  const now = nowMinute();
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ fontSize: 18 }}>Alerts for you</Text>
      {error && <Text style={{ color: "#b91c1c" }}>Can't reach BathroomBestie. Retrying.</Text>}
      {!error && alerts.length === 0 && <Text>None. Nothing to do.</Text>}
      {alerts.slice(0, 10).map((a) => (
        <View
          key={a.id}
          style={{
            borderWidth: 1,
            borderColor: a.rung === 4 ? "#b91c1c" : "#d97706",
            borderRadius: 10,
            padding: 12,
            gap: 6,
          }}
        >
          <Text style={{ fontWeight: "600" }}>
            {RUNG[a.rung]} · about {a.personId} · {Math.max(0, now - a.t)} min ago
          </Text>
          <Text style={{ fontSize: 16 }}>{a.message}</Text>
          {a.factors.map((f) => (
            <Text key={f} style={{ color: "#555" }}>
              • {f}
            </Text>
          ))}
          {a.raisedBy && <Text style={{ color: "#555" }}>Raised by {a.raisedBy}</Text>}
          {a.lastKnown ? (
            <Pressable accessibilityRole="button" onPress={() => void openMap(a.lastKnown!.area)}>
              <Text style={{ color: "#2563eb" }}>
                Last known area at {clock(a.lastKnown.t)} (about 100 m): open in Maps
              </Text>
            </Pressable>
          ) : (
            <Text style={{ color: "#555" }}>No location reported yet.</Text>
          )}
          {a.script911 && (
            // Invariant 4: text only. BathroomBestie never calls anyone; she decides.
            <View style={{ backgroundColor: "#fef2f2", padding: 10, borderRadius: 8, gap: 4 }}>
              <Text style={{ fontWeight: "600" }}>
                If you decide to call emergency services, you can read this:
              </Text>
              <Text selectable>{a.script911}</Text>
              <Text style={{ color: "#555" }}>BathroomBestie never calls anyone.</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 4 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => void act(a, "confirm")}
              style={{ backgroundColor: "#16a34a", padding: 10, borderRadius: 8 }}
            >
              <Text style={{ color: "white" }}>I'm with her</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => void act(a, "worry")}
              style={{ backgroundColor: "#d97706", padding: 10, borderRadius: 8 }}
            >
              <Text style={{ color: "white" }}>I'm worried</Text>
            </Pressable>
          </View>
          {sent[a.id] && <Text style={{ color: "#555" }}>{sent[a.id]}</Text>}
        </View>
      ))}
      {checkedAt !== null && (
        <Text style={{ color: "#888" }}>Checked at {clock(checkedAt)}. Updates every 20 s.</Text>
      )}
    </View>
  );
}
