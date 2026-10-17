import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { post } from "../api";
import { consequence } from "../sweep";

const PRESETS = ["relaxed", "standard", "cautious"] as const;
type Preset = (typeof PRESETS)[number];
type Compiled = {
  contract: { id: string; preset: Preset; group: { members: string[] } };
  terms: string[];
  joinCode: string;
};

/** Her first name is her id (B6), so alerts read "ana left the group…". Remembered on this phone. */
const NAME_KEY = "bathroombestie.name";

export function Plan({ onCompiled }: { onCompiled: (c: { id: string; me: string }) => void }) {
  const [name, setName] = useState("");
  useEffect(() => {
    void AsyncStorage.getItem(NAME_KEY)
      .then((n) => n && setName(n))
      .catch(() => undefined);
  }, []);
  const [sentence, setSentence] = useState("");
  const [readBack, setReadBack] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("standard");
  const [terms, setTerms] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The server recomputes thresholds from the preset; show its terms, not a local guess.
  const pick = async (p: Preset) => {
    if (!id) return;
    try {
      const r = await post<Compiled>(`/contracts/${id}/preset`, { preset: p });
      setPreset(r.contract.preset);
      setTerms(r.terms);
      setError(null);
    } catch {
      setError("Couldn't save that setting. Try again.");
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Text>Your first name (your friends see it in alerts)</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Ana"
        autoCapitalize="words"
        maxLength={30}
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Text>Describe your night in a sentence.</Text>
      <TextInput
        value={sentence}
        onChangeText={setSentence}
        placeholder="Out with Bea and Cy until 2am"
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button
        title="Make my plan"
        disabled={!name.trim() || !sentence.trim()}
        onPress={async () => {
          try {
            const r = await post<Compiled & { readBack: string }>("/contracts/compile", {
              me: name.trim(),
              sentence,
              localTime: new Date().toTimeString().slice(0, 5), // lets "until 2am" become hours
            });
            void AsyncStorage.setItem(NAME_KEY, name.trim()).catch(() => undefined);
            setReadBack(r.readBack);
            setId(r.contract.id);
            setJoinCode(r.joinCode);
            setMe(r.contract.group.members[0]!); // the server's form of her name
            setPreset(r.contract.preset);
            setTerms(r.terms);
            setError(null);
          } catch (e) {
            // 400: a name the server won't accept; else e.g. 503 compiler_unavailable when the
            // model is overloaded. Her sentence is kept either way.
            setError(
              String(e).includes(": 400")
                ? "Use letters for your name (spaces, ' and - are fine)."
                : "Couldn't make your plan right now. Try again in a moment.",
            );
          }
        }}
      />
      {readBack && <Text>{readBack}</Text>}
      {joinCode && <Text>Friends join with the code {joinCode}</Text>}
      {terms.map((t) => (
        <Text key={t}>{t}</Text>
      ))}
      {id &&
        PRESETS.map((p) => (
          <View key={p}>
            <Button title={`${p}${p === preset ? " ✓" : ""}`} onPress={() => void pick(p)} />
            {p === preset && <Text>{consequence(p)}</Text>}
          </View>
        ))}
      {error && <Text style={{ color: "#b91c1c" }}>{error}</Text>}
      {id && me && <Button title="Continue to pre-flight" onPress={() => onCompiled({ id, me })} />}
    </View>
  );
}
