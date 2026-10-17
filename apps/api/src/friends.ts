/**
 * Plays her friends' phones for a demo or rehearsal: it joins the night as each friend and
 * reports from the bar on their cadence, and can press "I'm with her" for one of them. Everything
 * goes through the same routes the app uses, so the engine cannot tell it from real phones.
 */
export type Call = (
  method: "GET" | "POST",
  path: string,
  body?: unknown,
) => Promise<{ status: number; json: unknown }>;

export interface Found {
  contractId: string;
  owner: string;
  friends: { id: string; accepted: boolean }[];
}

/** A 6-character join code, or a contract id, to the night and who is in it. */
export async function findNight(call: Call, codeOrId: string): Promise<Found> {
  if (codeOrId.startsWith("c_")) {
    const r = await call("GET", `/contracts/${codeOrId}`);
    if (r.status !== 200) throw new Error(`unknown contract ${codeOrId}`);
    const [owner, ...friends] = (r.json as { contract: { group: { members: string[] } } }).contract
      .group.members;
    return {
      contractId: codeOrId,
      owner: owner!,
      friends: friends.map((id) => ({ id, accepted: false })),
    };
  }
  const r = await call("GET", `/join/${encodeURIComponent(codeOrId)}`);
  if (r.status !== 200) throw new Error(`no night for code ${codeOrId} (${r.status})`);
  return r.json as Found;
}

export interface FriendsOptions {
  call: Call;
  /** Epoch minutes now (the real clock in the script). */
  now: () => number;
  found: Found;
  /** Where the bar is: the friends stay here all night. */
  at: { lat: number; lon: number };
  log?: (line: string) => void;
}

export function playFriends({ call, now, found, at, log = () => {} }: FriendsOptions) {
  const ids = found.friends.map((f) => f.id);
  return {
    ids,
    /** Each friend agrees to watch, as they would on their own phone. */
    async join() {
      for (const id of ids) {
        await call("POST", `/contracts/${found.contractId}/watchers/${id}/accept`, {});
        log(`${id} joined`);
      }
    },
    /** One report from each friend's phone. */
    async report() {
      for (const id of ids)
        await call("POST", "/evidence", {
          personId: id,
          contractId: found.contractId,
          t: now(),
          area: at,
          motion: "walking",
          batteryPct: 80,
          charging: false,
          permissionOk: true,
        });
      log(`${ids.join(" and ")} reported from the bar`);
    },
    /** A friend taps "I'm with her". */
    async confirm(id: string) {
      const r = await call("POST", "/actions", {
        contractId: found.contractId,
        type: "confirm",
        by: id,
        targetPersonId: found.owner,
      });
      log(`${id} tapped "I'm with ${found.owner}" (${r.status})`);
    },
  };
}
