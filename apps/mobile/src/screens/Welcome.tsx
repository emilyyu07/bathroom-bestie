import { Pressable, Text, View } from "react-native";

/** First launch on this phone: plan your own night, or join a friend's. */
export function Welcome({ onPlan, onJoin }: { onPlan: () => void; onJoin: () => void }) {
  const big = { padding: 28, borderRadius: 12, alignItems: "center" as const };
  return (
    <View style={{ padding: 16, gap: 16 }}>
      <Text style={{ fontSize: 22 }}>BathroomBestie</Text>
      <Pressable
        accessibilityRole="button"
        onPress={onPlan}
        style={{ ...big, backgroundColor: "#2563eb" }}
      >
        <Text style={{ fontSize: 22, color: "white" }}>Plan a night</Text>
      </Pressable>
      <Pressable
        accessibilityRole="button"
        onPress={onJoin}
        style={{ ...big, backgroundColor: "#16a34a" }}
      >
        <Text style={{ fontSize: 22, color: "white" }}>Join a friend's night</Text>
      </Pressable>
    </View>
  );
}
