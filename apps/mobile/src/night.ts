import { useEffect } from "react";
import { AppState } from "react-native";
import { sendEvidenceOnce, startEvidenceReporter } from "./evidenceReporter";

/**
 * While a night is active: report on a timer, and once more whenever the app comes back to the
 * foreground. That fresh report is what clears a nudge ("Open the app so your friends know
 * you're fine"); there is deliberately no check-in button.
 */
export function useNightReporting(contractId: string, me: string, active: boolean) {
  useEffect(() => {
    if (!active || !contractId) return;
    const stop = startEvidenceReporter({ personId: me, contractId });
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void sendEvidenceOnce(me, contractId).catch(() => undefined);
    });
    return () => {
      stop();
      sub.remove();
    };
  }, [contractId, me, active]);
}
