/** Patient IDs this browser recently opened or created, per wallet. Convenience only. */

const KEY = "medichain.recent";
const LIMIT = 6;

function read(): Record<string, string[]> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, string[]>;
  } catch {
    return {};
  }
}

export function recentRecords(address: string): string[] {
  return read()[address.toLowerCase()] ?? [];
}

export function rememberRecord(address: string, patientId: string): string[] {
  const all = read();
  const key = address.toLowerCase();
  const next = [patientId, ...(all[key] ?? []).filter((id) => id !== patientId)].slice(0, LIMIT);
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...all, [key]: next }));
  } catch {
    // Storage unavailable: the list simply isn't remembered.
  }
  return next;
}
