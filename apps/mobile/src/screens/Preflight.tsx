import { useState } from "react";
import { Button, Linking, Platform, Text, View } from "react-native";
import { post } from "../api";
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
    <View style={{ padding: 16, gap: 8 }}>
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
    </View>
  );
}
