import { ApiError, GoogleGenAI } from "@google/genai";
import {
  DraftPlan,
  DEFAULT_CONFIDENCE,
  draftJsonSchema,
  thresholdsFor,
  type Contract,
} from "@bathroombestie/schema";
import { createHash } from "node:crypto";

export interface CompileContext {
  /** Epoch minutes. From the injected clock. */
  now: number;
  /** User's coarse area (already ~100 m). The corridor is centred here. */
  area: { lat: number; lon: number };
  /** Her local wall-clock time ("HH:MM"), so "until 2am" can be turned into hours. */
  localTime?: string;
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
    const homeBy = /\b(?:home|back)\s+(?:by|in|within)\s+(\d{1,2})\s*(?:h|hr|hrs|hours)\b/.exec(s);
    return {
      friends: list,
      hours: Math.min(14, Math.max(1, hours)),
      radius_m: 2000,
      preset,
      watch_order: list,
      ...(homeBy ? { home_by_hours: Math.min(24, Math.max(1, Number(homeBy[1]))) } : {}),
      offer_911_script: true,
      read_back: `You're going out with ${list.join(" and ")} for about ${hours} hours. ${list[0]} watches first. Alerts use the ${preset} setting.`,
    };
  }
}

/** Retries `fn` after each delay while `retryable(err)`; rethrows the last error. */
export async function withRetry<T>(
  fn: () => Promise<T>,
  delaysMs: number[],
  retryable: (e: unknown) => boolean,
): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      if (i >= delaysMs.length || !retryable(e)) throw e;
      await new Promise((r) => setTimeout(r, delaysMs[i]));
    }
  }
}

/** Rate limits and overload are temporary; anything else (bad key, bad request) is not. */
const transient = (e: unknown) => e instanceof ApiError && [429, 500, 503].includes(e.status);

export class GeminiCompiler implements Compiler {
  private ai: GoogleGenAI;
  constructor(
    apiKey: string,
    private model = "gemini-3.8-flash",
    private retryDelaysMs = [1000, 3000],
  ) {
    this.ai = new GoogleGenAI({ apiKey });
  }
  async draft(sentence: string, ctx?: CompileContext): Promise<DraftPlan> {
    const call = () =>
      this.ai.models.generateContent({
        model: this.model,
        contents:
          "Turn this description of a night out into a plan. Only use what she said; do not add concerns about health. " +
          "Use preset standard unless she asks to be more careful (cautious) or more relaxed (relaxed). " +
          "Set offer_911_script to true unless she explicitly says not to offer it. " +
          "Set home_by_hours only if she says when she will be home or back, as hours from now; otherwise omit it. " +
          (ctx?.localTime ? `Her local time now is ${ctx.localTime}. ` : "") +
          `Description: ${JSON.stringify(sentence)}`,
        config: { responseMimeType: "application/json", responseJsonSchema: draftJsonSchema() },
      });
    const res = await withRetry(call, this.retryDelaysMs, transient);
    return DraftPlan.parse(JSON.parse(res.text ?? "{}")); // never trust the model: re-validate
  }
}

export const makeCompiler = (): Compiler =>
  process.env.GEMINI_API_KEY
    ? new GeminiCompiler(process.env.GEMINI_API_KEY, process.env.GEMINI_MODEL || undefined)
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
  // Person ids are lower-case everywhere (evidence, actions), whatever case the model used.
  const id_ = (f: string) => f.trim().toLowerCase();
  const friends = [...new Set(d.friends.map(id_))].filter((f) => f !== me);
  const watchOrder = d.watch_order.map(id_);
  const order = [
    ...[...new Set(watchOrder)].filter((f) => friends.includes(f)),
    ...friends.filter((f) => !watchOrder.includes(f)),
  ];
  const start = ctx.now;
  const end = start + Math.round(d.hours * 60);
  const slot = Math.max(1, Math.ceil((end - start) / Math.max(1, order.length)));
  // Only a time she stated becomes a home milestone; it binds her, not her friends.
  const homeBy = d.home_by_hours === undefined ? null : start + Math.round(d.home_by_hours * 60);
  return {
    id,
    corridor: { center: ctx.area, radius_m: d.radius_m },
    window: { start, end },
    milestones: homeBy === null ? [] : [{ id: "home", kind: "home", by: homeBy, who: [me] }],
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
    // Keep the contract alive past her home time so a missed home milestone can still be noticed.
    expires: Math.max(end, homeBy ?? end) + 120,
  };
}

/** Deterministic facts shown beside the model's read-back so she can check it. */
export const termsOf = (c: Contract): string[] => {
  const home = c.milestones.find((m) => m.kind === "home");
  const hours = (to: number) => Math.round(((to - c.window.start) / 60) * 10) / 10;
  return [
    `Watching: ${c.group.watch.map((w) => w.who).join(", ")}`,
    `Setting: ${c.preset}. A friend is alerted when your phone goes quiet after you'd been apart from the group` +
      (home ? ", or when you're well past a time you planned to be home" : "") +
      ".",
    `Window: ${hours(c.window.end)} h`,
    ...(home ? [`Home by: about ${hours(home.by)} h from now`] : []),
  ];
};

/** Invariant 6 words. The model's read-back is shown to her, so it is held to the same rule. */
const BANNED = ["drug", "spiked", "intoxicated", "drunk", "sick", "medical", "unwell"];

/** The model's read-back, or a deterministic one built from the terms if it strays. */
export const safeReadBack = (readBack: string, c: Contract): string =>
  BANNED.some((w) => readBack.toLowerCase().includes(w)) ? termsOf(c).join(". ") + "." : readBack;
