import { useEffect, useState } from "react";
import { View } from "react-native";
import { get, post } from "../api";
import { font, space } from "../theme";
import { Body, Button, Card, Chip, Divider, ErrorText, Heading, Screen, Small } from "../ui";
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
  const [sent, setSent] = useState<string | null>(null);
  const send = async (type: "confirm" | "worry") => {
    try {
      await post("/actions", {
        contractId,
        type,
        by: me,
        targetPersonId: target,
        ...(type === "worry" && reason ? { reason } : {}),
      });
      setSent(
        type === "confirm"
          ? `Sent: you're with ${target}. 💗`
          : "Sent. BathroomBestie will let the right friend know.",
      );
    } catch {
      setSent("Couldn't send. Try again.");
    }
  };
  if (!watching)
    return (
      <Screen>
        <Card tint>
          <Heading>{target} wants you on her team tonight 💗</Heading>
          <Body>
            You'll only hear from BathroomBestie if something seems off. Any time, you can say
            you're with her, or that you're worried.
          </Body>
        </Card>
        <Button
          big
          title="I've got her back"
          onPress={async () => {
            await post(`/contracts/${contractId}/watchers/${me}/accept`, {});
            setWatching(true);
          }}
        />
      </Screen>
    );
  return (
    <Screen>
      <Card>
        <View style={{ gap: space.xs }}>
          <Heading>How's {target}?</Heading>
          <Small>Let us know any time. Nothing is sent unless you tap.</Small>
        </View>
        <Button big tone="withHer" title="I'm with her" onPress={() => void send("confirm")} />
        <Button big tone="worry" title="I'm worried" onPress={() => void send("worry")} />
        <Divider />
        {/* A picked reason goes with the next "I'm worried", so pick it before tapping. */}
        <View style={{ gap: space.xs }}>
          <Body style={font.semibold}>Something feels off?</Body>
          <Small>Pick a reason before you tap "I'm worried" (optional).</Small>
        </View>
        <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
          {REASONS.map(([id, label]) => (
            <Chip
              key={id}
              label={label}
              selected={reason === id}
              onPress={() => setReason(reason === id ? undefined : id)}
            />
          ))}
        </View>
        {sent &&
          (sent.startsWith("Couldn't") ? <ErrorText>{sent}</ErrorText> : <Small>{sent}</Small>)}
      </Card>
      <FriendAlerts contractId={contractId} me={me} reason={reason} />
    </Screen>
  );
}
