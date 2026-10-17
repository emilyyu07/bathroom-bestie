import { useState } from "react";
import { Button, SafeAreaView, View } from "react-native";
import { Plan } from "./src/screens/Plan";
import { Preflight } from "./src/screens/Preflight";
import { Status } from "./src/screens/Status";
import { Watcher } from "./src/screens/Watcher";

// TODO: real identity/auth is out of scope; ids are placeholders.
export default function App() {
  const [screen, setScreen] = useState<"plan" | "preflight" | "status" | "watcher">("plan");
  const [contractId, setContractId] = useState("");
  return (
    <SafeAreaView style={{ flex: 1, paddingTop: 40 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
        {(["plan", "preflight", "status", "watcher"] as const).map((s) => (
          <Button key={s} title={s} onPress={() => setScreen(s)} />
        ))}
      </View>
      {screen === "plan" && (
        <Plan
          onCompiled={(c) => {
            setContractId(c.id);
            setScreen("preflight");
          }}
        />
      )}
      {screen === "preflight" && (
        <Preflight
          contractId={contractId}
          me="me"
          confirmed={contractId !== ""}
          onActive={() => setScreen("status")}
        />
      )}
      {screen === "status" && <Status />}
      {screen === "watcher" && <Watcher contractId={contractId} me="bea" target="me" />}
    </SafeAreaView>
  );
}
