import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { post } from "../api";
import { consequence } from "../sweep";
import { color, font, space, type } from "../theme";
import {
  Body,
  Button,
  Card,
  Chip,
  Divider,
  ErrorText,
  Field,
  Heading,
  InfoRow,
  Screen,
  Small,
  Title,
} from "../ui";

const PRESETS = ["relaxed", "standard", "cautious"] as const;
/** What she sees; the contract keeps the preset names. */
const PRESET_LABEL = { relaxed: "Relaxed", standard: "Standard", cautious: "Careful" } as const;
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
  const [making, setMaking] = useState(false);

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

  const make = async () => {
    setMaking(true);
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
    } finally {
      setMaking(false);
    }
  };

  return (
    <Screen>
      <Title subtitle="One sentence is enough. We'll read it back so you can check it.">
        Plan your night
      </Title>
      <Field
        label="Your first name"
        hint="Your friends see your first name in any alert."
        value={name}
        onChangeText={setName}
        placeholder="Your name…"
        autoCapitalize="words"
        maxLength={30}
      />
      <Field
        label="What's the plan?"
        value={sentence}
        onChangeText={setSentence}
        placeholder="Your plans… (e.g. drinks with Ana and Addy)"
        multiline
      />
      <Button
        big
        title={making ? "Making your plan…" : "Make my plan"}
        disabled={making || !name.trim() || !sentence.trim()}
        onPress={() => void make()}
      />
      {error && <ErrorText>{error}</ErrorText>}
      {readBack && (
        <Card tint>
          <Heading>Here's your plan</Heading>
          <Body>{readBack}</Body>
          <View style={{ gap: space.sm }}>
            {terms.map((t) => (
              <View key={t} style={{ flexDirection: "row", gap: space.sm }}>
                <Text style={{ ...font.extrabold, ...type.body, color: color.primary }}>✓</Text>
                <Body style={{ flex: 1 }}>{t}</Body>
              </View>
            ))}
          </View>
          {joinCode && (
            <>
              <Divider />
              <InfoRow label="Friends join with" value={joinCode} />
            </>
          )}
        </Card>
      )}
      {id && (
        <Card>
          <Heading>How careful should we be?</Heading>
          <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
            {PRESETS.map((p) => (
              <Chip
                key={p}
                label={PRESET_LABEL[p]}
                selected={p === preset}
                onPress={() => void pick(p)}
              />
            ))}
          </View>
          <Small>{consequence(preset)}</Small>
        </Card>
      )}
      {id && me && (
        // Pre-flight's "Night plan confirmed" check means this tap: she read the plan back.
        <View style={{ gap: space.md }}>
          <Button big title="The plan looks right" onPress={() => onCompiled({ id, me })} />
          <Small style={{ textAlign: "center" }}>
            Anything off? Change the sentence and make it again.
          </Small>
        </View>
      )}
    </Screen>
  );
}
