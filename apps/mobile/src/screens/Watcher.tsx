import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { post } from "../api";

const REASONS = [
  ["cant_find", "Can't find her"],
  ["not_answering", "Not answering"],
  ["feels_off", "Feels off"],
] as const;

/** Friend's screen: two big buttons, three reason chips. Reports are human, attributed, rate limited server-side. */
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
    <View style={{ padding: 16, gap: 16 }}>
      <Pressable
        onPress={() => void send("confirm")}
        style={{ ...big, backgroundColor: "#16a34a" }}
      >
        <Text style={{ fontSize: 24, color: "white" }}>I'm with her</Text>
      </Pressable>
      <Pressable onPress={() => void send("worry")} style={{ ...big, backgroundColor: "#d97706" }}>
        <Text style={{ fontSize: 24, color: "white" }}>I'm worried</Text>
      </Pressable>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        {REASONS.map(([id, label]) => (
          <Pressable
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
      {/* TODO: at rung 4, show last-known area + the pre-filled script. Never auto-dial anyone. */}
    </View>
  );
}
