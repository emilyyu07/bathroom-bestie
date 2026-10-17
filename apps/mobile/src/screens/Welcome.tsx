import { Image, View } from "react-native";
import { color, space } from "../theme";
import { Body, Button, Card, Heading, Screen, Title } from "../ui";

/** First launch on this phone: plan your own night, or join a friend's. */
export function Welcome({ onPlan, onJoin }: { onPlan: () => void; onJoin: () => void }) {
  return (
    <Screen>
      <View style={{ alignItems: "center", gap: space.sm, marginTop: space.lg }}>
        <Image
          source={require("../../assets/logo.png")}
          style={{ width: 120, height: 120 }}
          accessibilityIgnoresInvertColors
          accessible={false}
        />
        <Title>BathroomBestie</Title>
        <Body muted style={{ textAlign: "center" }}>
          Not watching you. Watching out for you. 💗
        </Body>
      </View>
      <Card style={{ backgroundColor: color.blush, borderColor: color.blush }}>
        <Heading>Going out tonight?</Heading>
        <Body>
          Tell us the plan in one sentence. Your friends hear from BathroomBestie only if something
          seems off, and if you get a little nudge, just open the app.
        </Body>
      </Card>
      <Button big title="Plan my night" onPress={onPlan} />
      <Button big tone="secondary" title="Join a friend's night" onPress={onJoin} />
    </Screen>
  );
}
