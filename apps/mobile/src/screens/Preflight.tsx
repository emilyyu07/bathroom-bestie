import { useState } from "react";
import { Button, Text, View } from "react-native";
import { post } from "../api";

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

export function Preflight({ contractId, onActive }: { contractId: string; onActive: () => void }) {
  const [report, setReport] = useState<Report | null>(null);
  return (
    <View style={{ padding: 16, gap: 8 }}>
      <Button
        title="Run pre-flight"
        onPress={async () => {
          // TODO: build the snapshot from real device state (permissions, battery settings, RTT,
          // first evidence, accepted watchers, geofence). Placeholder values below.
          const snapshot = {
            permissions: { backgroundLocation: false, notifications: false },
            battery: { level: 100, restricted: false, lowPowerMode: false },
            connectivityRttMs: null,
            firstEvidenceAfterS: null,
            watchers: [],
            homeGeofenceSet: false,
            contractConfirmed: true,
          };
          setReport(await post<Report>("/preflight", { contractId, snapshot }));
        }}
      />
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
