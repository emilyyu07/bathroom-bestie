import { Contract } from "./contract";
import { thresholdsFor } from "./defaults";
import { PresetName } from "./preset";

/**
 * Parse a contract read back from storage. Contracts saved before a threshold existed are
 * missing it; fill the gaps from the contract's *own* preset (explicit stored values win) rather
 * than a single static default, so a relaxed or cautious contract does not silently turn standard.
 * Pure. Throws if the result is still not a valid Contract.
 */
export function normalizeContract(raw: unknown): Contract {
  const r = raw as { preset?: unknown; thresholds?: Record<string, unknown> } | null;
  const preset = PresetName.safeParse(r?.preset);
  if (r && preset.success && r.thresholds && typeof r.thresholds === "object") {
    return Contract.parse({ ...r, thresholds: { ...thresholdsFor(preset.data), ...r.thresholds } });
  }
  return Contract.parse(raw);
}
