import * as Location from "expo-location";
import { useState } from "react";
import { Button, Platform, Pressable, Text, TextInput, View } from "react-native";
import { get, post } from "../api";
import { saveIdentity, type Identity } from "../identity";
import { requestPermissions } from "../readiness";

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
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Enter the join code she gave you (6 characters), or the full night code.</Text>
      <TextInput
        value={code}
        onChangeText={setCode}
        placeholder="9F3A1B"
        autoCapitalize="none"
        autoCorrect={false}
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button title="Find the night" disabled={!code.trim()} onPress={() => void find()} />
      {error && <Text style={{ color: "#b91c1c" }}>{error}</Text>}
      {night && (
        <View style={{ gap: 10 }}>
          <Text style={{ fontSize: 18 }}>{planner}'s night. Which one are you?</Text>
          {friends.map((f) => (
            <Pressable
              accessibilityRole="button"
              key={f}
              onPress={() => void join(f)}
              style={{ backgroundColor: "#16a34a", padding: 16, borderRadius: 10 }}
            >
              <Text style={{ color: "white", fontSize: 18 }}>I'm {f}</Text>
            </Pressable>
          ))}
          <Text style={{ color: "#555" }}>
            Joining means you agree to watch {planner}'s night: BathroomBestie may send you alerts
            about her, and you can say you're with her or that you're worried.
          </Text>
          <Text style={{ color: "#555" }}>
            Once the night starts, your phone also sends your rough area (about 100 m) all night, so
            BathroomBestie can tell whether the group is together. Nobody sees anyone's location;
            only an alert about someone shows their last-known area. You'll be asked to allow
            location (all the time) and notifications.
          </Text>
        </View>
      )}
      <Button title="Back" onPress={onBack} />
    </View>
  );
}
