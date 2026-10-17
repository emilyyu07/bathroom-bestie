import { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { get } from "./api";
import { readNight, startBackgroundReporting, stopBackgroundReporting } from "./background";
import { sendEvidenceOnce, startEvidenceReporter } from "./evidenceReporter";

/**
 * While a night is active: report right away, keep reporting (an Android foreground service that
 * survives the app being closed; a timer on web), and report once more whenever the app comes back
 * to the foreground. That fresh report is what clears a nudge ("Open the app so your friends know
 * you're fine"); there is deliberately no check-in button.
 */
export function useNightReporting(
  contractId: string,
  me: string,
  active: boolean,
  /** The background night ended while the app was away (she arrived home, or it expired). */
  onEnded: () => void,
) {
  useEffect(() => {
    if (!active || !contractId) return;
    let stop = () => {};
    let cancelled = false;
    const contract = get<{
      contract: { expires: number; thresholds: { report_every_min?: number } };
    }>(`/contracts/${contractId}`).then(({ contract: c }) => ({
      until: c.expires,
      everyMin: c.thresholds.report_every_min ?? 3, // older contracts: the schema default
    }));
    if (Platform.OS === "android") {
      void sendEvidenceOnce(me, contractId).catch(() => undefined);
      void contract
        .then((c) => startBackgroundReporting({ contractId, personId: me, ...c }))
        .catch((e) => console.warn("background reporting did not start", e));
      // No stop here: this cleanup also runs when she swipes the app away, which is exactly when
      // the service must keep going. It ends at the contract's expiry, or via endNight().
    } else {
      void contract
        .catch(() => ({ everyMin: 3 }))
        .then(({ everyMin }) => {
          if (!cancelled)
            stop = startEvidenceReporter({ personId: me, contractId, everyMs: everyMin * 60_000 });
        });
    }
    const sub = AppState.addEventListener("change", (s) => {
      if (s !== "active") return;
      void (async () => {
        // Arrived home (or expired) while away: the night is over, so send nothing from home.
        if (Platform.OS === "android" && !(await readNight().catch(() => null))) return onEnded();
        await sendEvidenceOnce(me, contractId);
      })().catch(() => undefined);
    });
    return () => {
      cancelled = true;
      stop();
      sub.remove();
    };
  }, [contractId, me, active, onEnded]);
}

/** Ends the current night's reporting (a new plan replaces it). */
export const endNight = () =>
  Platform.OS === "android" ? stopBackgroundReporting().catch(() => undefined) : Promise.resolve();

/** A night still being reported from the background (e.g. after the app was closed), if any. */
export const runningNight = () =>
  Platform.OS === "android" ? readNight().catch(() => null) : Promise.resolve(null);
