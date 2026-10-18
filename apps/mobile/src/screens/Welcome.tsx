import { Image, Text, View } from "react-native";
import { color, font, space, type } from "../theme";
import { Body, Button, Card, Screen, Small } from "../ui";

/** How it works, in three short lines. Each is something the app really does. */
const STEPS = [
  "Tell us your plan in one sentence",
  "Your friends join with a code",
  "If something seems off, they get a heads-up",
] as const;

/** First launch on this phone: plan your own night, or join a friend's. */
export function Welcome({ onPlan, onJoin }: { onPlan: () => void; onJoin: () => void }) {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: space.lg, marginTop: space.xl }}>
        <Image
          source={require("../../assets/logo.png")}
          style={{ width: 88, height: 88 }}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <View style={{ gap: space.sm }}>
          <Text
            accessibilityRole="header"
            style={{ ...font.extrabold, ...type.display, color: color.text, textAlign: "center" }}
          >
            Go out.{"\n"}
            <Text style={{ color: color.primary }}>We've got your back.</Text>
          </Text>
          <Body muted style={{ textAlign: "center" }}>
            Not watching you. Watching out for you.
          </Body>
        </View>
      </View>

      <Card style={{ marginTop: space.sm, gap: space.lg }}>
        {STEPS.map((s, i) => (
          <View key={s} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <View
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                backgroundColor: color.blush,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ ...font.extrabold, ...type.small, color: color.primary }}>
                {i + 1}
              </Text>
            </View>
            <Body style={{ flex: 1, ...font.semibold }}>{s}</Body>
          </View>
        ))}
      </Card>

      <View style={{ gap: space.md, marginTop: space.sm }}>
        <Button big title="Plan my night" onPress={onPlan} />
        <Button big tone="secondary" title="Join a friend's night" onPress={onJoin} />
      </View>

      <Small style={{ textAlign: "center" }}>
        No check-ins · No live location · Never calls anyone
      </Small>
    </Screen>
  );
}
