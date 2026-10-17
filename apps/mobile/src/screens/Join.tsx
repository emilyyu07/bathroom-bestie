import * as Location from "expo-location";
import { useState } from "react";
import { Platform, View } from "react-native";
import { get, post } from "../api";
import { saveIdentity, type Identity } from "../identity";
import { requestPermissions } from "../readiness";
import { color, space } from "../theme";
import { Body, Button, Card, ErrorText, Field, Heading, Screen, Title } from "../ui";

interface Night {
  contract: { id: string; group: { members: string[] } };
  status: "draft" | "active";
}

/**
 * A friend joins with the night code she shared (the contract id), picks which friend they are,
 * and agrees to watch. That acceptance is what her pre-flight's watcher check sees.
 */
export function Join({
  onJoined,
  onBack,
}: {
  onJoined: (i: Identity) => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [night, setNight] = useState<Night | null>(null);
  const [error, setError] = useState<string | null>(null);

  const find = async () => {
    setError(null);
    try {
      // Either the short code she reads out (6 hex digits) or the full night code she shares.
      const typed = code.trim();
      const id = /^[0-9a-f]{6}$/i.test(typed)
        ? (await get<{ contractId: string }>(`/join/${typed}`)).contractId
        : typed;
      setNight(await get<Night>(`/contracts/${encodeURIComponent(id)}`));
    } catch (e) {
      setNight(null);
      setError(
        String(e).includes(": 404")
          ? "No night with that code. Check it with her."
          : "Can't reach BathroomBestie.",
      );
    }
  };

  const join = async (personId: string) => {
    if (!night) return;
    try {
      // Her friends' phones report too (the group checks compare her with them), so ask now.
      // Android also asks for background location and notifications; on iOS a friend's phone reports
      // while the app is open, so "while using" is enough.
      if (Platform.OS === "android") await requestPermissions();
      else await Location.requestForegroundPermissionsAsync().catch(() => undefined);
      await post(
        `/contracts/${encodeURIComponent(night.contract.id)}/watchers/${encodeURIComponent(personId)}/accept`,
        {},
      );
      const id: Identity = { role: "friend", contractId: night.contract.id, personId };
      await saveIdentity(id);
      onJoined(id);
    } catch {
      setError("Couldn't join. Try again.");
    }
  };

  const [planner, ...friends] = night?.contract.group.members ?? [];
  return (
    <Screen>
      <Title>Join a friend's night 💌</Title>
      <Field
        label="Join code"
        value={code}
        onChangeText={setCode}
        placeholder="9F3A1B"
        autoCapitalize="none"
        autoCorrect={false}
      />
      <Body muted style={{ fontSize: 14 }}>
        The 6 characters she gives you (or the full night code).
      </Body>
      <Button big title="Find the night" disabled={!code.trim()} onPress={() => void find()} />
      {error && <ErrorText>{error}</ErrorText>}
      {night && (
        <View style={{ gap: space.md }}>
          <Heading>{planner}'s night. Which one are you?</Heading>
          {friends.map((f) => (
            <Button key={f} title={`I'm ${f}`} onPress={() => void join(f)} />
          ))}
          <Card style={{ backgroundColor: color.blush, borderColor: color.blushBorder }}>
            <Body>
              Joining means you'll watch out for {planner} tonight: BathroomBestie may send you
              alerts about her, and you can say you're with her or that you're worried.
            </Body>
            <Body muted>
              Once the night starts, your phone also sends your rough area (about 100 m), so
              BathroomBestie can tell whether the group is together. Nobody sees anyone's location;
              only an alert about someone shows their last-known area. You'll be asked to allow
              location (all the time) and notifications.
            </Body>
          </Card>
        </View>
      )}
      <Button tone="quiet" title="Back" onPress={onBack} />
    </Screen>
  );
}
