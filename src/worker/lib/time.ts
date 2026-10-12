export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

export function iso(ms: number): string {
  return new Date(ms).toISOString();
}

export function addSeconds(ms: number, seconds: number): string {
  return iso(ms + seconds * 1000);
}

/**
 * MYPG timestamps look like `2026-10-11 19:30:00` with no zone. The zone is not
 * documented, so it comes from configuration (MYPG_TIME_OFFSET, default +07:00)
 * and is only used for scheduling and display, never as payment evidence.
 */
export function parseProviderTimestamp(raw: string | null | undefined, offset: string): number | null {
  if (!raw) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const ms = Date.parse(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6] ?? "00"}${offset}`);
  return Number.isFinite(ms) ? ms : null;
}
