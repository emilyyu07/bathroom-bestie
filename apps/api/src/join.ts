/**
 * A night's join code: the first 6 hex digits of its contract id, upper-case ("c_9f3a1b2c4d" ->
 * "9F3A1B"). She reads it to her friends; they type it in. It is a convenience, not a secret:
 * there is no auth yet (out of scope), so anyone with the code can see who is in the night.
 */
export const JOIN_CODE_LENGTH = 6;

export const joinCodeOf = (contractId: string): string =>
  contractId.replace(/^c_/, "").slice(0, JOIN_CODE_LENGTH).toUpperCase();

/** The id prefix a typed code stands for, or null if it cannot be a code (spaces/case are ignored). */
export const idPrefixOfCode = (raw: string): string | null => {
  const code = raw.replace(/\s+/g, "").toLowerCase();
  return new RegExp(`^[0-9a-f]{${JOIN_CODE_LENGTH}}$`).test(code) ? `c_${code}` : null;
};
