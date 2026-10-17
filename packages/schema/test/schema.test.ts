import { describe, expect, it } from "vitest";
import { EvidenceReport, contractJsonSchema, roundCoord } from "../src";

describe("schema", () => {
  it("rounds evidence location on parse", () => {
    const e = EvidenceReport.parse({
      personId: "a",
      contractId: "c",
      t: 1,
      area: { lat: 43.65321, lon: -79.38329 },
      motion: "still",
      batteryPct: 50,
      charging: false,
      permissionOk: true,
    });
    expect(e.area).toEqual({ lat: 43.653, lon: -79.383 });
    expect(roundCoord(43.6565)).toBe(43.657);
  });
  it("exports a JSON schema for the contract", () => {
    expect(contractJsonSchema()).toHaveProperty("properties.thresholds");
  });
});
