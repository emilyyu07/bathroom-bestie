/** Mirrors WorryRoute in apps/api/src/worryRoute.ts (the mobile app is outside the workspace). */
export interface WorryRoute {
  outcome: "taking_over" | "to_watcher" | "already_out" | "rate_limited" | "ignored";
  watcher: string | null;
  limitMin: number;
}

/** What the friend's tap actually did, in words: who hears about it, or why nothing new went out. */
export function sentMessage(
  type: "confirm" | "worry",
  her: string,
  route: WorryRoute | undefined,
): string {
  if (type === "confirm") return `Sent: you're with ${her}. Any open alert about her is closed. 💗`;
  switch (route?.outcome) {
    case "taking_over":
      return `You're watching ${her} right now, so you're taking over. Your alert, with what to do next, is below.`;
    case "to_watcher":
      return `Sent to ${route.watcher}, who's watching ${her} right now. If they don't respond, it goes to the next friend, then the whole group.`;
    case "already_out":
      return `An alert about ${her} is already out to the group. Your report is added to it.`;
    case "rate_limited":
      return `You already reported in the last ${route.limitMin} min, so this one wasn't counted.`;
    case "ignored":
      return "That couldn't be sent for this night.";
    default:
      return "Sent.";
  }
}
