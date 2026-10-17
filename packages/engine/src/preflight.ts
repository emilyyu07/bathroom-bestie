import type { CheckResult, Contract, ReadinessReport, ReadinessSnapshot } from "@tether/schema";

export const PREFLIGHT_LIMITS = { rttMs: 5000, firstEvidenceS: 60, minStartBattery: 40 } as const;

/** Pure and deterministic (invariant 9). Blocking fails => not_ready; warning fails => ready_with_warnings. */
export function preflight(snapshot: ReadinessSnapshot, contract: Contract): ReadinessReport {
  const members = new Set(contract.group.members);
  const usable = snapshot.watchers.filter((w) => w.accepted && w.reachable && members.has(w.id));
  const check = (
    id: string,
    label: string,
    severity: CheckResult["severity"],
    ok: boolean,
    pass: string,
    fail: string,
  ): CheckResult => ({ id, label, severity, status: ok ? "pass" : "fail", detail: ok ? pass : fail });

  const checks: CheckResult[] = [
    check("background_location", "Background location allowed", "blocking", snapshot.permissions.backgroundLocation, "Allowed all the time.", "Allow location all the time so updates continue with the screen off."),
    check("notifications", "Notifications allowed", "blocking", snapshot.permissions.notifications, "Allowed.", "Allow notifications so Tether can reach you."),
    check(
      "connectivity",
      "Connection to Tether",
      "blocking",
      snapshot.connectivityRttMs !== null && snapshot.connectivityRttMs < PREFLIGHT_LIMITS.rttMs,
      "Round trip is fast enough.",
      "Could not reach Tether in under 5 seconds.",
    ),
    check(
      "first_evidence",
      "First live update received",
      "blocking",
      snapshot.firstEvidenceAfterS !== null && snapshot.firstEvidenceAfterS <= PREFLIGHT_LIMITS.firstEvidenceS,
      "A live update arrived within 60 seconds.",
      "No live update arrived within 60 seconds.",
    ),
    check("watcher", "A watcher can be reached", "blocking", usable.length >= 1, "At least one watcher accepted and is reachable.", "No watcher has accepted and is reachable."),
    check("contract_confirmed", "Night plan confirmed", "blocking", snapshot.contractConfirmed, "Confirmed.", "Confirm your night plan first."),
    check(
      "battery_settings",
      "No battery restrictions",
      "warning",
      !snapshot.battery.restricted && !snapshot.battery.lowPowerMode,
      "No restrictions found.",
      "Battery restrictions or low-power mode may pause updates.",
    ),
    check("starting_battery", "Battery at least 40%", "warning", snapshot.battery.level >= PREFLIGHT_LIMITS.minStartBattery, "Battery is fine to start.", "Starting under 40% battery."),
    check("watcher_count", "More than one watcher", "warning", usable.length >= 2, "Backup watcher available.", "Only one watcher; add a backup."),
    check("home_geofence", "Home geofence set", "warning", snapshot.homeGeofenceSet, "Set on this device.", "Set a home spot so Tether knows when you arrive."),
  ];

  const blocked = checks.some((c) => c.severity === "blocking" && c.status === "fail");
  const warned = checks.some((c) => c.severity === "warning" && c.status === "fail");
  return { state: blocked ? "not_ready" : warned ? "ready_with_warnings" : "ready", checks };
}
