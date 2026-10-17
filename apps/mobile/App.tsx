import { useState } from "react";
import { Button, SafeAreaView, View } from "react-native";
import { Plan } from "./src/screens/Plan";
import { Preflight } from "./src/screens/Preflight";
import { Status } from "./src/screens/Status";
import { Watcher } from "./src/screens/Watcher";
import { useNightReporting } from "./src/night";

// TODO: real identity/auth is out of scope; ids are placeholders.
export default function App() {
  const [screen, setScreen] = useState<"plan" | "preflight" | "status" | "watcher">("plan");
  const [contractId, setContractId] = useState("");
  const [active, setActive] = useState(false);
  useNightReporting(contractId, "me", active);
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
            setActive(false);
            setScreen("preflight");
          }}
        />
      )}
      {screen === "preflight" && (
        <Preflight
          contractId={contractId}
          me="me"
          confirmed={contractId !== ""}
          onActive={() => {
            setActive(true);
            setScreen("status");
          }}
        />
      )}
      {screen === "status" && <Status contractId={contractId} me="me" active={active} />}
      {screen === "watcher" && <Watcher contractId={contractId} me="bea" target="me" />}
    </SafeAreaView>
  );
}
