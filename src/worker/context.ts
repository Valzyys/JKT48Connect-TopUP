import type { Config } from "./env";

/** Everything a service needs, injected so tests can control time and deferred work. */
export interface AppContext {
  db: D1Database;
  config: Config;
  now: () => number;
  /** Work that may outlive the response (ctx.waitUntil in Workers). */
  defer: (work: Promise<unknown>) => void;
}

export class AppError extends Error {
  constructor(
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 429 | 503,
    readonly code: string,
    message: string,
    readonly fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Retry schedule (seconds) for provider status checks, indexed by attempts so far. */
export function backoffSeconds(attempts: number, schedule: readonly number[] = [30, 60, 120, 300, 600, 900, 1800]): number {
  return schedule[Math.min(attempts, schedule.length - 1)]!;
}
