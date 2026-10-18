import { useCallback, useEffect, useState } from "react";
import { Keyboard, Pressable, SafeAreaView, Text, View } from "react-native";
import { get } from "./src/api";
import { clearIdentity, loadIdentity, saveIdentity, type Identity } from "./src/identity";
import { endNight, runningNight, useNightReporting } from "./src/night";
import { Join } from "./src/screens/Join";
import { Plan } from "./src/screens/Plan";
import { Preflight } from "./src/screens/Preflight";
import { Status } from "./src/screens/Status";
import { Watcher } from "./src/screens/Watcher";
import { Welcome } from "./src/screens/Welcome";
import { color, font, radius, space, type } from "./src/theme";
import { Body, Small, TextButton } from "./src/ui";

/** The planner's three steps, as tabs. */
const TABS = [
  ["plan", "Plan"],
  ["preflight", "Get ready"],
  ["status", "Tonight"],
] as const;

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
  // She tapped "The plan looks right" for this contract (the planner identity is saved on that tap).
  const [confirmed, setConfirmed] = useState(false);
  const nightEnded = useCallback(() => setActive(false), []);
  // The pinned "Leave this night" button rides up on the keyboard and covers what she's typing
  // into (e.g. "Make my plan"), so it hides while the keyboard is open.
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", () => setTyping(true));
    const hide = Keyboard.addListener("keyboardDidHide", () => setTyping(false));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
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
      setConfirmed(id.role === "planner"); // saved only when she confirmed the plan
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
    setConfirmed(false);
    setScreen("welcome");
  };

  return (
    <SafeAreaView
      style={{
        flex: 1,
        paddingTop: space.sm, // the window already starts below the status bar
        backgroundColor: color.bg,
      }}
    >
      {role === "planner" && TABS.some(([t]) => t === screen) && (
        <View
          accessibilityRole="tablist"
          style={{
            flexDirection: "row",
            marginHorizontal: space.lg + 4,
            marginTop: space.sm,
            marginBottom: space.xs,
            padding: space.xs,
            borderRadius: radius.button,
            backgroundColor: color.blush,
          }}
        >
          {TABS.map(([s, label]) => {
            const on = screen === s;
            return (
              <Pressable
                key={s}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                onPress={() => setScreen(s)}
                style={{
                  flex: 1,
                  alignItems: "center",
                  paddingVertical: 9,
                  borderRadius: radius.button,
                  backgroundColor: on ? color.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    ...font.extrabold,
                    ...type.small,
                    color: on ? color.white : color.primary,
                  }}
                >
                  {label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
      {screen === "loading" && (
        <Body muted style={{ padding: space.lg, textAlign: "center" }}>
          Loading…
        </Body>
      )}
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
            setConfirmed(true);
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
          confirmed={confirmed}
          onActive={() => {
            setActive(true);
            setScreen("status");
          }}
        />
      )}
      {screen === "status" && <Status contractId={contractId} me={me} active={active} />}
      {screen === "watcher" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: space.sm,
            marginHorizontal: space.lg + 4,
            marginTop: space.sm,
            paddingVertical: space.md,
            paddingHorizontal: space.lg,
            borderRadius: radius.card,
            backgroundColor: active ? color.primary : color.blush,
          }}
        >
          <View
            style={{
              width: 8,
              height: 8,
              borderRadius: 4,
              backgroundColor: active ? color.white : color.muted,
            }}
          />
          <Small style={{ flex: 1, ...font.bold, color: active ? color.white : color.text }}>
            {active
              ? "The night is on. Your phone sends your rough area until it ends."
              : `Waiting for ${planner || "your friend"} to start the night…`}
          </Small>
        </View>
      )}
      {screen === "watcher" && (
        <Watcher contractId={contractId} me={me} target={planner || "your friend"} />
      )}
      {role !== null && screen !== "welcome" && screen !== "join" && !typing && (
        <View style={{ paddingBottom: space.sm }}>
          <TextButton title="Leave this night" onPress={() => void leave()} />
        </View>
      )}
    </SafeAreaView>
  );
}
