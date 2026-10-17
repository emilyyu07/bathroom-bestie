import { useEffect, useState } from "react";
import { Button, Linking, Platform, ScrollView, Share, Text, View } from "react-native";
import { get, post } from "../api";
import { clearHome, homeIsSet, setHomeHere } from "../home";
import { collectSnapshot, requestPermissions } from "../readiness";

interface Report {
  state: "ready" | "ready_with_warnings" | "not_ready";
  checks: {
    id: string;
    label: string;
    status: "pass" | "fail";
    severity: string;
    detail: string;
  }[];
}
const TITLE = {
  ready: "Ready",
  ready_with_warnings: "Ready with warnings",
  not_ready: "Not ready",
} as const;

export function Preflight({
  contractId,
  me,
  confirmed,
  onActive,
}: {
  contractId: string;
  me: string;
  /** She reviewed the read-back and terms and chose to continue. */
  confirmed: boolean;
  onActive: () => void;
}) {
  const [report, setReport] = useState<Report | null>(null);
  const [running, setRunning] = useState(false);
  const [home, setHome] = useState<"unset" | "set" | "saving">("unset");
  // Friends join on their own phones with the night code; show who has so far.
  const [joined, setJoined] = useState<string[]>([]);
  useEffect(() => {
    if (!contractId) return;
    const load = () =>
      get<{ watchers: { id: string; accepted: boolean }[] }>(
        `/contracts/${encodeURIComponent(contractId)}/watchers`,
      )
        .then((r) => setJoined(r.watchers.filter((w) => w.accepted).map((w) => w.id)))
        .catch(() => undefined);
    void load();
    const h = setInterval(() => void load(), 10_000);
    return () => clearInterval(h);
  }, [contractId]);
  const [homeError, setHomeError] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS === "android") void homeIsSet().then((s) => setHome(s ? "set" : "unset"));
  }, []);
  const run = async () => {
    setRunning(true);
    try {
      const snapshot = await collectSnapshot({ contractId, me, contractConfirmed: confirmed });
      setReport(await post<Report>("/preflight", { contractId, snapshot }));
    } finally {
      setRunning(false);
    }
  };
  const needsPermissions = report?.checks.some(
    (c) => c.status === "fail" && (c.id === "background_location" || c.id === "notifications"),
  );
  const batteryRestricted =
    Platform.OS === "android" &&
    report?.checks.some((c) => c.id === "battery_settings" && c.status === "fail");
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 8 }}>
      {contractId !== "" && (
        <View style={{ gap: 4 }}>
          <Text>Night code for your friends:</Text>
          <Text selectable style={{ fontSize: 20, fontWeight: "600" }}>
            {contractId}
          </Text>
          <Button
            title="Share the code"
            onPress={() =>
              void Share.share({
                message: `Join my night on BathroomBestie with this code: ${contractId}`,
              }).catch(() => undefined)
            }
          />
          <Text style={{ color: "#555" }}>
            Friends who joined: {joined.length ? joined.join(", ") : "nobody yet"}
          </Text>
        </View>
      )}
      <Button
        title={running ? "Checking…" : "Run pre-flight"}
        disabled={running || !contractId}
        onPress={() => void run()}
      />
      {needsPermissions && (
        <Button
          title="Allow location and notifications"
          onPress={async () => {
            await requestPermissions();
            await run();
          }}
        />
      )}
      {batteryRestricted && (
        // She exempts the app herself; we don't request REQUEST_IGNORE_BATTERY_OPTIMIZATIONS
        // (restricted by Play policy). Re-run pre-flight after to see the change.
        <Button
          title="Open battery settings"
          onPress={() =>
            void Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(
              () => Linking.openSettings(),
            )
          }
        />
      )}
      {Platform.OS === "android" && (
        <View style={{ gap: 4 }}>
          <Text style={{ color: "#555" }}>
            {home === "set"
              ? "Home is set on this phone. Your friends only learn when you've arrived."
              : "Set your home so BathroomBestie knows when you arrive. It stays on this phone."}
          </Text>
          <Button
            title={
              home === "saving"
                ? "Saving…"
                : home === "set"
                  ? "Clear home"
                  : "Set home to where I am now"
            }
            disabled={home === "saving"}
            onPress={async () => {
              setHomeError(null);
              const was = home;
              setHome("saving");
              try {
                if (was === "set") await clearHome();
                else await setHomeHere();
                setHome(was === "set" ? "unset" : "set");
              } catch (e) {
                setHome(was);
                setHomeError((e as Error).message);
              }
            }}
          />
          {homeError && <Text style={{ color: "#b91c1c" }}>{homeError}</Text>}
        </View>
      )}
      {report && <Text style={{ fontSize: 20 }}>{TITLE[report.state]}</Text>}
      {report?.checks.map((c) => (
        <Text key={c.id}>
          {c.status === "pass" ? "✓" : c.severity === "blocking" ? "✗" : "!"} {c.label} — {c.detail}
        </Text>
      ))}
      {report && report.state !== "not_ready" && (
        <Button
          title="Start the night"
          onPress={async () => {
            await post(`/contracts/${contractId}/activate`, {});
            onActive();
          }}
        />
      )}
    </ScrollView>
  );
}
