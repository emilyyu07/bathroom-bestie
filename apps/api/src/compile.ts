import { GoogleGenAI } from "@google/genai";
import {
  DraftPlan,
  DEFAULT_CONFIDENCE,
  PRESETS,
  draftJsonSchema,
  thresholdsFor,
  type Contract,
} from "@tether/schema";
import { createHash } from "node:crypto";

export interface CompileContext {
  /** Epoch minutes. From the injected clock. */
  now: number;
  /** User's coarse area (already ~100 m). The corridor is centred here. */
  area: { lat: number; lon: number };
}
export interface Compiler {
  draft(sentence: string, ctx: CompileContext): Promise<DraftPlan>;
}

/** Deterministic offline stand-in: keyword parsing, no network. */
export class MockCompiler implements Compiler {
  async draft(sentence: string): Promise<DraftPlan> {
    const s = sentence.toLowerCase();
    const withIdx = s.search(/\bwith\b/);
    const tail = withIdx >= 0 ? sentence.slice(withIdx + 4) : "";
    const friends = (tail.split(/\buntil\b|\bfor\b|\./i)[0] ?? "")
      .split(/,|\band\b/i)
      .map((x) => x.trim())
      .filter((x) => /^[A-Za-z][\w'-]*$/.test(x))
      .map((x) => x.toLowerCase());
    const hours = Number(/(\d{1,2})\s*(?:h|hr|hrs|hours)\b/.exec(s)?.[1] ?? 6);
    const preset = /cautious|careful/.test(s)
      ? "cautious"
      : /relaxed|chill/.test(s)
        ? "relaxed"
        : "standard";
    const list = friends.length ? friends : ["friend"];
    return {
      friends: list,
      hours: Math.min(14, Math.max(1, hours)),
      radius_m: 2000,
      preset,
      watch_order: list,
      offer_911_script: true,
      read_back: `You're going out with ${list.join(" and ")} for about ${hours} hours. ${list[0]} watches first. Alerts use the ${preset} setting.`,
    };
  }
}

export class GeminiCompiler implements Compiler {
  private ai: GoogleGenAI;
  constructor(
    apiKey: string,
    private model = "gemini-2.5-flash",
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }
  async draft(sentence: string): Promise<DraftPlan> {
    const res = await this.ai.models.generateContent({
      model: this.model,
      contents:
        "Turn this description of a night out into a plan. Only use what she said; do not add concerns about health. " +
        `Description: ${JSON.stringify(sentence)}`,
      config: { responseMimeType: "application/json", responseJsonSchema: draftJsonSchema() },
    });
    return DraftPlan.parse(JSON.parse(res.text ?? "{}")); // never trust the model: re-validate
  }
}

export const makeCompiler = (): Compiler =>
  process.env.GEMINI_API_KEY
    ? new GeminiCompiler(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL)
    : new MockCompiler();

/** Deterministic: the model only drafts; thresholds, ids and times are computed here. */
export function buildContract(
  d: DraftPlan,
  ctx: CompileContext,
  sentence: string,
  me = "me",
): Contract {
  const id =
    "c_" + createHash("sha256").update(`${sentence}|${ctx.now}`).digest("hex").slice(0, 10);
  const friends = d.friends.filter((f) => f !== me);
  const order = [
    ...d.watch_order.filter((f) => friends.includes(f)),
    ...friends.filter((f) => !d.watch_order.includes(f)),
  ];
  const start = ctx.now;
  const end = start + Math.round(d.hours * 60);
  const slot = Math.max(1, Math.ceil((end - start) / Math.max(1, order.length)));
  return {
    id,
    corridor: { center: ctx.area, radius_m: d.radius_m },
    window: { start, end },
    milestones: [],
    group: {
      members: [me, ...friends],
      watch: order.map((who, i) => ({
        who,
        from: start + i * slot,
        to: Math.min(end, start + (i + 1) * slot),
      })),
    },
    thresholds: thresholdsFor(d.preset),
    confidence: DEFAULT_CONFIDENCE,
    preset: d.preset,
    wishes: { alert_order: order, offer_911_script: d.offer_911_script },
    expires: end + 120,
  };
}

/** Deterministic facts shown beside the model's read-back so she can check it. */
export const termsOf = (c: Contract): string[] => {
  const p = PRESETS[c.preset];
  return [
    `Watching: ${c.group.watch.map((w) => w.who).join(", ")}`,
    `Setting: ${c.preset} (alerts a friend after about ${p.silence_min} min of unexplained silence)`,
    `Window: ${Math.round((c.window.end - c.window.start) / 60)} h`,
  ];
};
