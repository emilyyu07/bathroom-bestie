import type { FriendReason } from "@bathroombestie/schema";

/**
 * Invariant 3 + 6: every word of alert text lives here. Observable behavior or an
 * attributed human report only. No Gemini, no inference. A test scans these strings.
 */
export const TEMPLATES = {
  nudge:
    "BathroomBestie hasn't had a normal update from you for {minutes} min. Open the app so your friends know you're fine.",
  watcher: "{name} hasn't sent a normal update for {minutes} min. Can you reach {name}?",
  next: "Still no update from {name} after {minutes} min, and {watcher} hasn't responded. You're next.",
  group: "Nobody has responded about {name}, who hasn't sent an update for {minutes} min.",
  unexplained:
    "{name}'s phone stopped sending updates {minutes} min ago while apart from the group.",
  separation: "You've been apart from your group for {minutes} min. Let them know you're okay.",
  evidenceLost:
    "BathroomBestie can't see updates from {name}'s phone because a permission was turned off.",
  worry: "{friend} reports: {reasonText}.",
  worryNoReason: "{friend} reports being worried about {name}.",
  takeover: "You're taking over for {name}. The last known area is shown below.",
  script911:
    "{name} was last seen in the area shown at minute {lastT}. No update has arrived for {minutes} min.",
  softBatteryDown:
    "{name}'s phone stopped updating at {battery}% battery and falling. No alert raised.",
} as const;

export const REASON_TEXT: Record<FriendReason, string> = {
  cant_find: "can't find {name}",
  not_answering: "{name} isn't answering",
  feels_off: "something feels off about {name}'s night",
};

export const FACTOR_TEMPLATES = {
  noUpdate: "No update for {minutes} min",
  outsideArea: "Not seen in the planned area for {minutes} min",
  noMovement: "No movement for {minutes} min",
  battery: "Phone was at {battery}% battery at its last update",
  apartFor: "Apart from the group for {minutes} min",
  score: "Confidence of normal is {score}",
} as const;

export const fill = (tpl: string, vars: Record<string, string | number>): string =>
  tpl.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? ""));
