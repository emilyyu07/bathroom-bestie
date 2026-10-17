import type { Contract } from "@bathroombestie/schema";

const fallbackOrder = (contract: Contract, target: string): string[] => {
  const seen = new Set<string>();
  return [...contract.wishes.alert_order, ...contract.group.members].filter((m) => {
    if (m === target || seen.has(m) || !contract.group.members.includes(m)) return false;
    seen.add(m);
    return true;
  });
};

/** Who is watching `target` at `now`: current slot, else first alert_order member that isn't them. */
export const watcherFor = (contract: Contract, target: string, now: number): string | null => {
  const slot = contract.group.watch.find((w) => w.from <= now && now < w.to && w.who !== target);
  if (slot) return slot.who;
  return fallbackOrder(contract, target)[0] ?? null;
};

/** The person after `watcher` in the failover order (rung 3). */
export const nextAfter = (
  contract: Contract,
  target: string,
  watcher: string | null,
): string | null => {
  const order = fallbackOrder(contract, target);
  const rest = order.filter((m) => m !== watcher);
  const idx = watcher ? order.indexOf(watcher) : -1;
  return order[idx + 1] ?? rest[0] ?? null;
};
