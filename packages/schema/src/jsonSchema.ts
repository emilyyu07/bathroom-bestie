import { z } from "zod";
import { Contract } from "./contract";
import { DraftPlan } from "./draft";

/** JSON Schema (input side; transforms ignored). */
export const contractJsonSchema = () =>
  z.toJSONSchema(Contract, { io: "input", unrepresentable: "any" });
/** What Gemini is asked to produce at setup. */
export const draftJsonSchema = () => z.toJSONSchema(DraftPlan, { io: "input" });
