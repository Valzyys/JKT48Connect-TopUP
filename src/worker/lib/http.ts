/**
 * Provider HTTP plumbing. Every outbound call goes through `providerFetch`, so
 * timeouts and network failures surface as typed errors the state machine can
 * treat as "outcome unknown" rather than "failed".
 */

export type ProviderErrorKind = "timeout" | "network";

export class ProviderCallError extends Error {
  constructor(
    readonly kind: ProviderErrorKind,
    readonly provider: string,
    message: string,
  ) {
    super(message);
    this.name = "ProviderCallError";
  }
}

export interface ProviderResponse {
  status: number;
  ok: boolean;
  text: string;
}

const MAX_BODY_BYTES = 2_000_000;

export async function providerFetch(
  provider: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<ProviderResponse> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text: text.length > MAX_BODY_BYTES ? text.slice(0, MAX_BODY_BYTES) : text };
  } catch (err) {
    if (timedOut) throw new ProviderCallError("timeout", provider, `${provider} did not respond within ${timeoutMs}ms`);
    // Never include the URL: some provider URLs carry configuration identifiers.
    const detail = err instanceof Error ? err.name : "unknown";
    throw new ProviderCallError("network", provider, `${provider} request failed (${detail})`);
  } finally {
    clearTimeout(timer);
  }
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
