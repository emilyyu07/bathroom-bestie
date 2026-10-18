import { useCallback, useEffect, useState } from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { color, font, radius, space, type } from "../theme";
import { Body, Button, Card, ErrorText, Label, Pill, Small } from "../ui";
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
  1: "A nudge to her",
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
    <View style={{ gap: space.lg }}>
      <Label>Alerts for you</Label>
      {error && <ErrorText>Can't reach BathroomBestie. Retrying…</ErrorText>}
      {!error && alerts.length === 0 && (
        <Card>
          <Body muted>All quiet. Nothing to do right now ✨</Body>
        </Card>
      )}
      {alerts.slice(0, 10).map((a) => (
        <Card
          key={a.id}
          style={a.rung === 4 ? { borderColor: color.berry, borderWidth: 2.5 } : undefined}
        >
          <View style={{ gap: space.sm }}>
            <Pill strong={a.rung === 4}>{RUNG[a.rung]}</Pill>
            <Small>
              About {a.personId} · {Math.max(0, now - a.t)} min ago
            </Small>
          </View>
          {/* Fixed engine template text: shown exactly as written. */}
          <Body style={{ ...font.bold, fontSize: 17, lineHeight: 24 }}>{a.message}</Body>
          {(a.factors.length > 0 || a.raisedBy) && (
            <View style={{ gap: space.xs }}>
              {a.factors.map((f) => (
                <Small key={f}>• {f}</Small>
              ))}
              {a.raisedBy && <Small>Raised by {a.raisedBy}</Small>}
            </View>
          )}
          {a.lastKnown ? (
            <Pressable accessibilityRole="link" onPress={() => void openMap(a.lastKnown!.area)}>
              <Text style={{ ...font.bold, ...type.small, color: color.primary }}>
                📍 Last known area at {clock(a.lastKnown.t)} (about 100 m) · Open in Maps
              </Text>
            </Pressable>
          ) : (
            <Small>No location reported yet.</Small>
          )}
          {a.script911 && (
            // Invariant 4: text only. BathroomBestie never calls anyone; she decides.
            <View
              style={{
                backgroundColor: color.blush,
                padding: space.lg,
                borderRadius: radius.inset,
                gap: space.sm,
              }}
            >
              <Body style={font.bold}>
                If you decide to call emergency services, you can read this:
              </Body>
              <Body selectable>{a.script911}</Body>
              <Small>BathroomBestie never calls anyone.</Small>
            </View>
          )}
          <View style={{ flexDirection: "row", gap: space.sm }}>
            <View style={{ flex: 1 }}>
              <Button tone="withHer" title="I'm with her" onPress={() => void act(a, "confirm")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button tone="worry" title="I'm worried" onPress={() => void act(a, "worry")} />
            </View>
          </View>
          {sent[a.id] &&
            (sent[a.id]!.startsWith("Couldn't") ? (
              <ErrorText>{sent[a.id]}</ErrorText>
            ) : (
              <Small>{sent[a.id]}</Small>
            ))}
        </Card>
      ))}
      {checkedAt !== null && (
        <Small style={{ textAlign: "center" }}>
          Checked at {clock(checkedAt)} · updates every 20 s
        </Small>
      )}
    </View>
  );
}
