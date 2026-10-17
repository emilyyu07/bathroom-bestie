import { useState } from "react";
import { Button, Text, TextInput, View } from "react-native";
import { post } from "../api";
import { consequence } from "../sweep";

const PRESETS = ["relaxed", "standard", "cautious"] as const;

export function Plan({ onCompiled }: { onCompiled: (c: { id: string }) => void }) {
  const [sentence, setSentence] = useState("");
  const [readBack, setReadBack] = useState<string | null>(null);
  const [preset, setPreset] = useState<(typeof PRESETS)[number]>("standard");
  const [id, setId] = useState<string | null>(null);

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
          const r = await post<{ contract: { id: string }; readBack: string }>(
            "/contracts/compile",
            { sentence },
          );
          setReadBack(r.readBack);
          setId(r.contract.id);
        }}
      />
      {readBack && <Text>{readBack}</Text>}
      {/* TODO: send the chosen preset back to the API (recompile or PATCH) so thresholds follow it. */}
      {PRESETS.map((p) => (
        <View key={p}>
          <Button title={`${p}${p === preset ? " ✓" : ""}`} onPress={() => setPreset(p)} />
          {p === preset && <Text>{consequence(p)}</Text>}
        </View>
      ))}
      {id && <Button title="Continue to pre-flight" onPress={() => onCompiled({ id })} />}
    </View>
  );
}
