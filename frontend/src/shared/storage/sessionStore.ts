/**
 * sessionStorage access that tolerates private modes and blocked site data, where the accessor
 * itself throws. Per tab by design: this is where view state that should not outlive the tab lives.
 */

export function readSessionValue<T>(key: string): T | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw === null ? null : (JSON.parse(raw) as T);
  } catch {
    return null;
  }
}

export function writeSessionValue(key: string, value: unknown): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Nothing persisted; the caller keeps its own state for this tab.
  }
}

export function removeSessionValues(matches: (key: string) => boolean): void {
  try {
    Object.keys(sessionStorage)
      .filter(matches)
      .forEach((key) => sessionStorage.removeItem(key));
  } catch {
    // Nothing persisted to remove.
  }
}
