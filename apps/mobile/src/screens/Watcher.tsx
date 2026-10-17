import { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { get, post } from "../api";
import { FriendAlerts } from "./FriendAlerts";

const REASONS = [
  ["cant_find", "Can't find her"],
  ["not_answering", "Not answering"],
  ["feels_off", "Feels off"],
] as const;

/**
 * Friend's screen: accept, then two big buttons, three reason chips and the alerts addressed to
 * them. Reports are human, attributed, rate limited server-side.
 */
export function Watcher({
  contractId,
  me,
  target,
}: {
  contractId: string;
  me: string;
  target: string;
}) {
  const [reason, setReason] = useState<string | undefined>();
  const [watching, setWatching] = useState(false);
  // Acceptance lives on the server; ask it, so reopening this screen doesn't ask her to accept again.
  useEffect(() => {
    if (!contractId) return;
    void get<{ watchers: { id: string; accepted: boolean }[] }>(
      `/contracts/${encodeURIComponent(contractId)}/watchers`,
    )
      .then((r) => setWatching(r.watchers.some((w) => w.id === me && w.accepted)))
      .catch(() => undefined);
  }, [contractId, me]);
  const send = (type: "confirm" | "worry") =>
    post("/actions", {
      contractId,
      type,
      by: me,
      targetPersonId: target,
      ...(type === "worry" && reason ? { reason } : {}),
    });
  const big = { padding: 32, borderRadius: 12, alignItems: "center" as const };
  if (!watching)
    return (
      <View style={{ padding: 16, gap: 16 }}>
        <Text style={{ fontSize: 18 }}>{target} asked you to watch her night.</Text>
        <Pressable
          accessibilityRole="button"
          onPress={async () => {
            await post(`/contracts/${contractId}/watchers/${me}/accept`, {});
            setWatching(true);
          }}
          style={{ ...big, backgroundColor: "#2563eb" }}
        >
          <Text style={{ fontSize: 24, color: "white" }}>Watch tonight</Text>
        </Pressable>
      </View>
    );
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 16 }}>
      <Pressable
        accessibilityRole="button"
        onPress={() => void send("confirm")}
        style={{ ...big, backgroundColor: "#16a34a" }}
      >
        <Text style={{ fontSize: 24, color: "white" }}>I'm with her</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={() => void send("worry")}
        style={{ ...big, backgroundColor: "#d97706" }}
      >
        <Text style={{ fontSize: 24, color: "white" }}>I'm worried</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {REASONS.map(([id, label]) => (
          <Pressable
            accessibilityRole="button"
            key={id}
            onPress={() => setReason(id)}
            style={{
              padding: 10,
              borderWidth: 1,
              borderRadius: 20,
              backgroundColor: reason === id ? "#fde68a" : "white",
            }}
          >
            <Text>{label}</Text>
          </Pressable>
        ))}
      </View>
      <FriendAlerts contractId={contractId} me={me} reason={reason} />
    </ScrollView>
  );
}
