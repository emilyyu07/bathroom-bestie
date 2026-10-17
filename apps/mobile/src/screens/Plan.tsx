import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { post } from "../api";
import { consequence } from "../sweep";

const PRESETS = ["relaxed", "standard", "cautious"] as const;
type Preset = (typeof PRESETS)[number];
type Compiled = { contract: { id: string; preset: Preset }; terms: string[] };

export function Plan({ onCompiled }: { onCompiled: (c: { id: string }) => void }) {
  const [sentence, setSentence] = useState("");
  const [readBack, setReadBack] = useState<string | null>(null);
  const [preset, setPreset] = useState<Preset>("standard");
  const [terms, setTerms] = useState<string[]>([]);
  const [id, setId] = useState<string | null>(null);
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
      <Text>Describe your night in a sentence.</Text>
      <TextInput
        value={sentence}
        onChangeText={setSentence}
        placeholder="Out with Bea and Cy until 2am"
        style={{ borderWidth: 1, padding: 8 }}
      />
      <Button
        title="Make my plan"
        onPress={async () => {
          try {
            const r = await post<Compiled & { readBack: string }>("/contracts/compile", {
              sentence,
              localTime: new Date().toTimeString().slice(0, 5), // lets "until 2am" become hours
            });
            setReadBack(r.readBack);
            setId(r.contract.id);
            setPreset(r.contract.preset);
            setTerms(r.terms);
            setError(null);
          } catch {
            // e.g. 503 compiler_unavailable when the model is overloaded; her sentence is kept.
            setError("Couldn't make your plan right now. Try again in a moment.");
          }
        }}
      />
      {readBack && <Text>{readBack}</Text>}
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
      {id && <Button title="Continue to pre-flight" onPress={() => onCompiled({ id })} />}
    </View>
  );
}
