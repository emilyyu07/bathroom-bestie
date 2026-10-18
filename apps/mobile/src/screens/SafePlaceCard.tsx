import { useEffect, useState } from "react";
import { View } from "react-native";
import { clearHome, safePlace, setHomeAtAddress, setHomeHere, type SafePlace } from "../home";
import { space } from "../theme";
import { Body, Button, Card, ErrorText, Field, Heading, Small } from "../ui";

/**
 * Where she's ending up tonight (home, or a friend's place). Arriving there tells her friends she
 * got there, never where it is: the address and the point stay on this phone (invariant 5).
 */
export function SafePlaceCard() {
  const [place, setPlace] = useState<SafePlace | null>(null);
  const [label, setLabel] = useState("Home");
  const [address, setAddress] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void safePlace().then(setPlace);
  }, []);

  const save = async (how: () => Promise<void>) => {
    setError(null);
    setSaving(true);
    try {
      await how();
      setPlace(await safePlace());
      setAddress("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const name = label.trim() || "Home";

  if (place)
    return (
      <Card>
        <Heading>Safe place: {place.label}</Heading>
        <Body muted>
          When you get there, your friends learn that you arrived, never where. It stays on this
          phone.
        </Body>
        <Button
          tone="quiet"
          title={saving ? "Clearing…" : "Change safe place"}
          disabled={saving}
          onPress={() => void save(clearHome)}
        />
        {error && <ErrorText>{error}</ErrorText>}
      </Card>
    );
  return (
    <Card>
      <View style={{ gap: space.xs }}>
        <Heading>Where are you ending up?</Heading>
        <Small>Home, or a friend's place. It stays on this phone, never sent to us.</Small>
      </View>
      <Field
        label="Call it"
        value={label}
        onChangeText={setLabel}
        placeholder="Home, Em's place…"
        maxLength={30}
      />
      <Field
        label="Address"
        value={address}
        onChangeText={setAddress}
        placeholder="Street and city…"
        autoCorrect={false}
      />
      <Button
        tone="secondary"
        title={saving ? "Saving…" : "Save this address"}
        disabled={saving || !address.trim()}
        onPress={() => void save(() => setHomeAtAddress(address, name))}
      />
      <Button
        tone="quiet"
        title="I'm there now, use this spot"
        disabled={saving}
        onPress={() => void save(() => setHomeHere(name))}
      />
      {error && <ErrorText>{error}</ErrorText>}
    </Card>
  );
}
