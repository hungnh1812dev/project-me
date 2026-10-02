/**
 * Safe `localStorage` access. Every call is wrapped in try/catch, because storage can be
 * blocked (privacy mode, sandboxed frames) or full. A failed write is kept in memory for the
 * rest of the session, so the UI still remembers the choice until the page reloads.
 */
const memory = new Map<string, string>();

/** The stored value, the in-memory fallback after a failed write, or `null`. */
export function readStorage(key: string): string | null {
  const kept = memory.get(key);
  if (kept !== undefined) return kept;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Writes to `localStorage`, or keeps the value in memory when that throws. Never throws. */
export function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
    memory.delete(key);
  } catch {
    memory.set(key, value);
  }
}
