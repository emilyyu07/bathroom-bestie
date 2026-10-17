import { useCallback, useEffect, useState } from "react";
import { Button, SafeAreaView, Text, View } from "react-native";
import { get } from "./src/api";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./src/identity";
import { endNight, runningNight, useNightReporting } from "./src/night";
import { Join } from "./src/screens/Join";
import { Plan } from "./src/screens/Plan";
import { Preflight } from "./src/screens/Preflight";
import { Status } from "./src/screens/Status";
import { Watcher } from "./src/screens/Watcher";
import { Welcome } from "./src/screens/Welcome";

type Screen = "loading" | "welcome" | "join" | "plan" | "preflight" | "status" | "watcher";

// Auth is out of scope: a phone is the planner or one friend of one night (see identity.ts).
export default function App() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [contractId, setContractId] = useState("");
  const [active, setActive] = useState(false);
  // This phone's person: her id as the planner (the server's form of her name), or the friend's.
  const [me, setMe] = useState("");
  const [role, setRole] = useState<Identity["role"] | null>(null);
  const [planner, setPlanner] = useState("");
  const nightEnded = useCallback(() => setActive(false), []);
  // Both roles report once the night is active: the group checks compare her with her friends.
  useNightReporting(contractId, me, active, nightEnded);

  // A friend's phone waits for her to start the night, then starts reporting.
  useEffect(() => {
    if (role !== "friend" || active || !contractId) return;
    const check = () =>
      get<{ status: string }>(`/contracts/${encodeURIComponent(contractId)}`)
        .then((c) => c.status === "active" && setActive(true))
        .catch(() => undefined);
    void check();
    const h = setInterval(() => void check(), 20_000);
    return () => clearInterval(h);
  }, [role, active, contractId]);

  useEffect(() => {
    void (async () => {
      // The saved identity says who this phone is; a night still reported in the background (it
      // outlives the app) says the night is on. Friends report too, so a running night alone
      // doesn't mean planner: it only stands in for a missing identity from older builds.
      const n = await runningNight();
      const saved = await loadIdentity();
      const id: Identity | null =
        saved ?? (n ? { role: "planner", contractId: n.contractId, personId: n.personId } : null);
      if (!id) return setScreen("welcome");
      setRole(id.role);
      setContractId(id.contractId);
      setMe(id.personId);
      setActive(!!n && n.contractId === id.contractId);
      if (id.role === "friend") {
        const c = await get<{ contract: { group: { members: string[] } } }>(
          `/contracts/${encodeURIComponent(id.contractId)}`,
        ).catch(() => null);
        setPlanner(c?.contract.group.members[0] ?? "");
        return setScreen("watcher");
      }
      setScreen(n ? "status" : "preflight");
    })();
  }, []);

  const leave = async () => {
    await endNight(); // stops this phone's reporting, whichever role
    await clearIdentity();
    setRole(null);
    setContractId("");
    setMe("");
    setActive(false);
    setScreen("welcome");
  };

  return (
    <SafeAreaView style={{ flex: 1, paddingTop: 40 }}>
      {role === "planner" && (
        <View style={{ flexDirection: "row", justifyContent: "space-around" }}>
          {(["plan", "preflight", "status"] as const).map((s) => (
            <Button key={s} title={s} onPress={() => setScreen(s)} />
          ))}
        </View>
      )}
      {screen === "loading" && <Text style={{ padding: 16 }}>Loading…</Text>}
      {screen === "welcome" && (
        <Welcome
          onPlan={() => {
            setRole("planner");
            setScreen("plan");
          }}
          onJoin={() => setScreen("join")}
        />
      )}
      {screen === "join" && (
        <Join
          onBack={() => setScreen("welcome")}
          onJoined={(id) => {
            setRole("friend");
            setContractId(id.contractId);
            setMe(id.personId);
            void get<{ contract: { group: { members: string[] } } }>(
              `/contracts/${encodeURIComponent(id.contractId)}`,
            ).then((c) => setPlanner(c.contract.group.members[0] ?? ""));
            setScreen("watcher");
          }}
        />
      )}
      {screen === "plan" && (
        <Plan
          onCompiled={(c) => {
            void endNight();
            void saveIdentity({ role: "planner", contractId: c.id, personId: c.me });
            setContractId(c.id);
            setMe(c.me);
            setActive(false);
            setScreen("preflight");
          }}
        />
      )}
      {screen === "preflight" && (
        <Preflight
          contractId={contractId}
          me={me}
          confirmed={contractId !== ""}
          onActive={() => {
            setActive(true);
            setScreen("status");
          }}
        />
      )}
      {screen === "status" && <Status contractId={contractId} me={me} active={active} />}
      {screen === "watcher" && (
        <Text style={{ paddingHorizontal: 16, paddingTop: 12, color: "#555" }}>
          {active
            ? "BathroomBestie is on: your phone is sending your rough area until the night ends."
            : `Waiting for ${planner || "your friend"} to start the night.`}
        </Text>
      )}
      {screen === "watcher" && (
        <Watcher contractId={contractId} me={me} target={planner || "your friend"} />
      )}
      {role !== null && screen !== "welcome" && screen !== "join" && (
        <View style={{ padding: 16 }}>
          <Button title="Leave this night" color="#6b7280" onPress={() => void leave()} />
        </View>
      )}
    </SafeAreaView>
  );
}
