import { useEffect, useState } from "react";
import { Linking, Platform, Share, Text, View } from "react-native";
import { get, post } from "../api";
import { clearHome, homeIsSet, setHomeHere } from "../home";
import { collectSnapshot, requestPermissions } from "../readiness";
import { color, font, space } from "../theme";
import { Body, Button, Card, ErrorText, Heading, Screen } from "../ui";

/** Same rule as the API's joinCodeOf (apps/api/src/join.ts): the id's first 6 hex digits. */
const joinCodeOf = (contractId: string) => contractId.replace(/^c_/, "").slice(0, 6).toUpperCase();

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
  ready: "You're all set ✨",
  ready_with_warnings: "Good to go, with a few tips",
  not_ready: "Almost there",
} as const;
/** A mark per check: done, a tip, or something to fix before the night can start. */
const MARK = {
  pass: { glyph: "✓", color: color.primary },
  warning: { glyph: "!", color: color.honey },
  blocking: { glyph: "✗", color: color.error },
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
    <Screen>
      {contractId !== "" && (
        <Card style={{ backgroundColor: color.blush, borderColor: color.blushBorder }}>
          <Heading>Invite your friends 💌</Heading>
          <Body muted>They join with this code:</Body>
          <Text
            selectable
            style={{ ...font.extrabold, fontSize: 32, color: color.primary, letterSpacing: 4 }}
          >
            {joinCodeOf(contractId)}
          </Text>
          <Body muted style={{ fontSize: 13 }}>
            (or the full night code {contractId})
          </Body>
          <Button
            tone="quiet"
            title="Share the code"
            onPress={() =>
              void Share.share({
                message: `Join my night on BathroomBestie with the code ${joinCodeOf(contractId)}`,
              }).catch(() => undefined)
            }
          />
          <Body muted>
            {joined.length ? `Joined: ${joined.join(", ")} 💗` : "Nobody has joined yet."}
          </Body>
        </Card>
      )}
      <Button
        big
        title={running ? "Checking…" : report ? "Check again" : "Check I'm ready"}
        disabled={running || !contractId}
        onPress={() => void run()}
      />
      {needsPermissions && (
        <Button
          tone="secondary"
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
          tone="secondary"
          title="Open battery settings"
          onPress={() =>
            void Linking.sendIntent("android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS").catch(
              () => Linking.openSettings(),
            )
          }
        />
      )}
      {Platform.OS === "android" && (
        <Card>
          <Heading>Home 🏠</Heading>
          <Body muted>
            {home === "set"
              ? "Home is saved on this phone. Your friends only learn that you got home, never where."
              : "Save your home so BathroomBestie knows when you're back. It never leaves this phone."}
          </Body>
          <Button
            tone={home === "set" ? "quiet" : "secondary"}
            title={
              home === "saving"
                ? "Saving…"
                : home === "set"
                  ? "Clear home"
                  : "I'm home now, save it"
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
          {homeError && <ErrorText>{homeError}</ErrorText>}
        </Card>
      )}
      {report && (
        <Card>
          <Heading>{TITLE[report.state]}</Heading>
          {report.checks.map((c) => {
            const m =
              MARK[
                c.status === "pass" ? "pass" : c.severity === "blocking" ? "blocking" : "warning"
              ];
            return (
              <View key={c.id} style={{ flexDirection: "row", gap: space.sm }}>
                <Text style={{ ...font.extrabold, fontSize: 17, color: m.color, width: 18 }}>
                  {m.glyph}
                </Text>
                <Body style={{ flex: 1 }}>
                  <Text style={{ ...font.bold }}>{c.label}</Text>
                  {"  "}
                  <Text style={{ color: color.muted }}>{c.detail}</Text>
                </Body>
              </View>
            );
          })}
        </Card>
      )}
      {report && report.state !== "not_ready" && (
        <Button
          big
          title="Start the night"
          onPress={async () => {
            await post(`/contracts/${contractId}/activate`, {});
            onActive();
          }}
        />
      )}
    </Screen>
  );
}
