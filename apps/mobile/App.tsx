import { useCallback, useEffect, useState } from "react";
import { Button, SafeAreaView, View } from "react-native";
import { Plan } from "./src/screens/Plan";
import { Preflight } from "./src/screens/Preflight";
import { Status } from "./src/screens/Status";
import { Watcher } from "./src/screens/Watcher";
import { endNight, runningNight, useNightReporting } from "./src/night";

// TODO: real identity/auth is out of scope; ids are placeholders.
export default function App() {
  const [screen, setScreen] = useState<"plan" | "preflight" | "status" | "watcher">("plan");
  const [contractId, setContractId] = useState("");
  const [active, setActive] = useState(false);
  const nightEnded = useCallback(() => setActive(false), []);
  useNightReporting(contractId, "me", active, nightEnded);
  // Reopened while a night is still being reported in the background: show that night.
  useEffect(() => {
    void runningNight().then((n) => {
      if (!n) return;
      setContractId(n.contractId);
      setActive(true);
      setScreen("status");
    });
  }, []);
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
            void endNight();
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
