import { z } from "zod";
import { Contract } from "./contract";

/** JSON Schema for Gemini structured output (input side; transforms ignored). */
export const contractJsonSchema = () => z.toJSONSchema(Contract, { io: "input", unrepresentable: "any" });
