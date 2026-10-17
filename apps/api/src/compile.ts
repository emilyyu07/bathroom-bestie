import { ApiError, GoogleGenAI } from "@google/genai";
import {
  DraftPlan,
  DEFAULT_CONFIDENCE,
  DEMO_THRESHOLDS,
  draftJsonSchema,
  thresholdsFor,
  type Contract,
} from "@bathroombestie/schema";
import { createHash } from "node:crypto";
import { ZodError } from "zod";

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

/** Overload and server errors are worth one short retry on the same model; a bad key or request is not. */
const overloaded = (e: unknown) => e instanceof ApiError && [500, 503].includes(e.status);

/**
 * A different model may succeed where this one did not: quota used up (429), overloaded (500/503),
 * retired (404), or an answer that is not a valid plan. A bad key or a bad request (400/401/403)
 * would fail the same way everywhere, so those are thrown straight away.
 */
const tryNextModel = (e: unknown) =>
  (e instanceof ApiError && [404, 429, 500, 503].includes(e.status)) ||
  e instanceof SyntaxError ||
  e instanceof ZodError ||
  e instanceof ModelTimeout;

/** A model that takes too long is as good as one that is down: someone is waiting on this plan. */
class ModelTimeout extends Error {
  constructor(model: string, ms: number) {
    super(`${model} did not answer within ${ms} ms`);
  }
}

const withTimeout = <T>(p: Promise<T>, model: string, ms: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new ModelTimeout(model, ms)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/**
 * Fast first (a demo should not wait on the model), then the strongest, then another. Each model has
 * its own quota, so one running out (a free key allows ~20 requests a day per model) or being
 * overloaded does not stop a plan from being made.
 */
export const DEFAULT_MODELS = ["gemini-3.1-flash-lite", "gemini-3.8-flash", "gemini-3.7-flash"];

/** GEMINI_MODEL (comma-separated) is the preferred model(s); the defaults follow as fallbacks. */
export const modelChain = (env?: string): string[] => [
  ...new Set([
    ...(env ?? "")
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean),
    ...DEFAULT_MODELS,
  ]),
];

/** One model call: contents in, text out. Injectable so failover can be tested without the network. */
export type Generate = (model: string, contents: string) => Promise<{ text?: string }>;

export class GeminiCompiler implements Compiler {
  private generate: Generate;
  constructor(
    apiKey: string,
    private models: string[] = DEFAULT_MODELS,
    private retryDelaysMs = [1000],
    generate?: Generate,
    /** Per model call. A typical answer takes 1-6 s. */
    private timeoutMs = 8_000,
  ) {
    if (models.length === 0) throw new Error("GeminiCompiler needs at least one model");
    const ai = new GoogleGenAI({ apiKey });
    this.generate =
      generate ??
      ((model, contents) =>
        ai.models.generateContent({
          model,
          contents,
          config: { responseMimeType: "application/json", responseJsonSchema: draftJsonSchema() },
        }));
  }
  async draft(sentence: string, ctx?: CompileContext): Promise<DraftPlan> {
    const contents =
      "Turn this description of a night out into a plan. Only use what she said; do not add concerns about health. " +
      "Use preset standard unless she asks to be more careful (cautious) or more relaxed (relaxed). " +
      "Set offer_911_script to true unless she explicitly says not to offer it. " +
      "In read_back never mention 911, emergency services, police or calling anyone: the app only ever tells her friends. " +
      "Call her friends watchers; never say check in, check-in or check-in contacts (there are no check-ins). " +
      "Set home_by_hours only if she says when she will be home or back, as hours from now; otherwise omit it. " +
      (ctx?.localTime ? `Her local time now is ${ctx.localTime}. ` : "") +
      `Description: ${JSON.stringify(sentence)}`;
    let last: unknown;
    for (const model of this.models) {
      try {
        const res = await withRetry(
          () => withTimeout(this.generate(model, contents), model, this.timeoutMs),
          this.retryDelaysMs,
          overloaded,
        );
        return DraftPlan.parse(JSON.parse(res.text ?? "{}")); // never trust the model: re-validate
      } catch (e) {
        last = e;
        if (!tryNextModel(e)) throw e;
      }
    }
    throw last;
  }
}

export const makeCompiler = (): Compiler =>
  process.env.GEMINI_API_KEY
    ? new GeminiCompiler(process.env.GEMINI_API_KEY, modelChain(process.env.GEMINI_MODEL))
    : new MockCompiler();

/** Deterministic: the model only drafts; thresholds, ids and times are computed here. */
export function buildContract(
  d: DraftPlan,
  ctx: CompileContext,
  sentence: string,
  me = "me",
  demo = false,
  /** Makes the id unique when the same sentence is compiled in the same minute. */
  nonce = "",
): Contract {
  const id =
    "c_" +
    createHash("sha256").update(`${sentence}|${ctx.now}|${nonce}`).digest("hex").slice(0, 10);
  // Person ids are lower-case everywhere (evidence, actions), whatever case the model used.
  const id_ = (f: string) => f.trim().toLowerCase();
  me = id_(me); // her name is her id (B6): same form as her friends' ids
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
    thresholds: demo ? DEMO_THRESHOLDS : thresholdsFor(d.preset),
    confidence: DEFAULT_CONFIDENCE,
    preset: d.preset,
    wishes: { alert_order: order, offer_911_script: d.offer_911_script },
    // Keep the contract alive past her home time so a missed home milestone can still be noticed.
    expires: Math.max(end, homeBy ?? end) + 120,
    ...(demo ? { demo: true } : {}),
  };
}

/** Deterministic facts shown beside the model's read-back so she can check it. */
export const termsOf = (c: Contract): string[] => {
  const home = c.milestones.find((m) => m.kind === "home");
  const hours = (to: number) => Math.round(((to - c.window.start) / 60) * 10) / 10;
  return [
    ...(c.demo
      ? ["DEMO NIGHT: timers are shortened to minutes, so alerts come far sooner than real ones."]
      : []),
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

/** The product has no check-ins (CLAUDE.md), so the read-back must not promise one. */
const CHECK_IN = /check[\s-]?ins?\b/i;

/** Nothing here ever contacts anyone but her friends (invariant 4), so the read-back must not suggest it. */
const EMERGENCY = /\b(911|emergency|police|ambulance|authorit(?:y|ies))\b/i;

/** The model's read-back, or a deterministic one built from the terms if it strays. */
export const safeReadBack = (readBack: string, c: Contract): string =>
  BANNED.some((w) => readBack.toLowerCase().includes(w)) ||
  CHECK_IN.test(readBack) ||
  EMERGENCY.test(readBack)
    ? termsOf(c).join(". ") + "."
    : readBack;
