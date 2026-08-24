import { env } from '../config/env';
import { log } from '../logging';

/** AbortSignal.timeout runs on a 32-bit signed timer; larger values fire immediately. */
const MAX_TIMER_MS = 2_147_483_647;

/** Used when HTTP_ROUTE_TIMEOUT_MS is unset. Matches the chart's route annotation. */
export const FALLBACK_ROUTE_TIMEOUT_MS = 60_000;

/** The API Route's inactivity timeout. Set HTTP_ROUTE_TIMEOUT_MS to match the chart annotation. */
export const routeTimeoutMs = (): number =>
  clamp(
    env.getHttpRouteTimeoutMs() ?? FALLBACK_ROUTE_TIMEOUT_MS,
    'HTTP_ROUTE_TIMEOUT_MS',
    MAX_TIMER_MS,
  );

/** Budget for one operation. The token leg, the request, the body and a retry all share it. */
export const defaultTimeoutMs = (): number =>
  env.getHttpOutboundTimeoutMs() ?? Math.floor(routeTimeoutMs() / 2);

function clamp(value: number, label: string, max: number): number {
  if (!Number.isInteger(value) || value <= 0 || value > max) {
    throw new Error(
      `${label} must be a positive integer of milliseconds no greater than ${max}, got ${value}`,
    );
  }
  return value;
}

/** Per-plugin value wins, then HTTP_OUTBOUND_TIMEOUT_MS, then half the route timeout. */
export function resolveTimeoutMs(value: number | undefined, label: string): number {
  // A call must not outlive the route.
  const max = Math.min(routeTimeoutMs(), MAX_TIMER_MS);
  return value === undefined
    ? clamp(defaultTimeoutMs(), 'HTTP_OUTBOUND_TIMEOUT_MS', max)
    : clamp(value, label, max);
}

export interface HttpClientOptions {
  baseUrl: string;
  /**
   * Called before each request; returns a bearer token, or null for an unauthenticated call.
   * Receives the milliseconds left in the operation's budget so the token leg shares it.
   */
  getToken?: (timeoutMs: number) => Promise<string | null>;
  defaultHeaders?: Record<string, string>;
  /** Total budget for one operation. Unset falls back to HTTP_OUTBOUND_TIMEOUT_MS. */
  timeoutMs?: number;
}

/** Carrier for a non-2xx response. `body` is the raw text; callers map it to a domain error. */
export class HttpClientError extends Error {
  readonly status: number;
  readonly statusText: string;
  readonly body: string;
  readonly url: string;

  constructor(status: number, statusText: string, body: string, url: string) {
    super(`HTTP ${status} ${statusText}`);
    this.name = 'HttpClientError';
    this.status = status;
    this.statusText = statusText;
    this.body = body;
    this.url = url;
  }
}

/** AbortSignal.timeout's DOMException. Matched by name; it crosses realms, so instanceof can fail. */
export const isTimeoutAbort = (err: unknown): boolean =>
  typeof err === 'object' && err !== null && (err as { name?: unknown }).name === 'TimeoutError';

/** Carrier for an outbound request that blew its deadline. */
export class HttpClientTimeoutError extends Error {
  readonly timeoutMs: number;
  readonly budgetMs: number;
  readonly url: string;

  /**
   * `timeoutMs` is what this leg had, `budgetMs` the whole operation's. The URL stays off the
   * message; that reaches the client in the 503 body.
   */
  constructor(url: string, timeoutMs: number, budgetMs: number) {
    super(
      timeoutMs === budgetMs
        ? `Request timed out after ${timeoutMs}ms`
        : `Request timed out after ${timeoutMs}ms of a ${budgetMs}ms budget`,
    );
    this.name = 'HttpClientTimeoutError';
    this.timeoutMs = timeoutMs;
    this.budgetMs = budgetMs;
    this.url = url;
  }
}

export interface BinaryResponse {
  data: Buffer;
  contentType?: string;
}

function stripTrailingSlashes(value: string): string {
  let end = value.length;
  while (end > 0 && value[end - 1] === '/') end--;
  return value.slice(0, end);
}

/** Join a base URL and a path segment with exactly one slash, tolerating stray slashes on either side. */
export function joinUrl(base: string, segment: string): string {
  return `${stripTrailingSlashes(base)}/${segment.replace(/^\/+/, '')}`;
}

/**
 * Minimal fetch wrapper for outbound service calls: joins the base URL, injects a bearer
 * token when a provider is supplied, and turns non-2xx responses into HttpClientError.
 * Response decoding is left to the caller-facing methods.
 */
export class HttpClient {
  private readonly baseUrl: string;
  private readonly getToken?: (timeoutMs: number) => Promise<string | null>;
  private readonly defaultHeaders: Record<string, string>;
  private readonly timeoutMs: number;

  constructor(options: HttpClientOptions) {
    this.baseUrl = stripTrailingSlashes(options.baseUrl);
    this.getToken = options.getToken;
    this.defaultHeaders = options.defaultHeaders ?? {};
    this.timeoutMs = resolveTimeoutMs(options.timeoutMs, 'HttpClient timeoutMs');
  }

  /**
   * When an operation started now must be finished. Pass it to several calls (an attempt and its
   * retry) to hold them to one budget instead of one each.
   */
  deadline(): number {
    return Date.now() + this.timeoutMs;
  }

  /** POST a JSON body and return the raw response bytes (e.g. a rendered document). */
  async postJsonForBinary(
    path: string,
    body: unknown,
    deadline: number = this.deadline(),
  ): Promise<BinaryResponse> {
    const res = await this.send(
      path,
      {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json' },
      },
      deadline,
    );
    // The fetch signal expires at the same deadline, so a stalled body aborts with it.
    const data = await this.withTimeout(
      this.buildUrl(path),
      Math.max(0, deadline - Date.now()),
      () => res.arrayBuffer(),
    );
    return {
      data: Buffer.from(data),
      contentType: res.headers.get('content-type') ?? undefined,
    };
  }

  /** GET a path, resolving on 2xx and throwing HttpClientError on non-2xx (e.g. health/liveness). */
  async get(path: string, deadline: number = this.deadline()): Promise<void> {
    await this.send(path, { method: 'GET' }, deadline);
  }

  private buildUrl(path: string): string {
    return joinUrl(this.baseUrl, path);
  }

  /** Milliseconds left in the budget; throws once it is spent so a later leg fails fast. */
  private remainingMs(deadline: number, url: string): number {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new HttpClientTimeoutError(url, 0, this.timeoutMs);
    return remaining;
  }

  private async buildHeaders(
    deadline: number,
    extra?: Record<string, string>,
  ): Promise<Record<string, string>> {
    const headers: Record<string, string> = { ...this.defaultHeaders, ...extra };
    if (this.getToken) {
      const token = await this.getToken(this.remainingMs(deadline, this.baseUrl));
      if (token) headers.Authorization = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Turn a deadline abort into a typed error; anything else passes through. `armedMs` is what this
   * leg actually had, which on a retry is the remainder rather than the full budget.
   */
  private async withTimeout<T>(url: string, armedMs: number, op: () => Promise<T>): Promise<T> {
    try {
      return await op();
    } catch (err) {
      if (isTimeoutAbort(err)) {
        log.warn({ url, armedMs, budgetMs: this.timeoutMs }, 'outbound http request timed out');
        throw new HttpClientTimeoutError(url, armedMs, this.timeoutMs);
      }
      throw err;
    }
  }

  private async send(path: string, init: RequestInit, deadline: number): Promise<Response> {
    const url = this.buildUrl(path);
    const headers = await this.buildHeaders(
      deadline,
      init.headers as Record<string, string> | undefined,
    );
    log.debug({ method: init.method, url, timeoutMs: this.timeoutMs }, 'outbound http request');

    const armedMs = this.remainingMs(deadline, url);
    const res = await this.withTimeout(url, armedMs, () =>
      fetch(url, { ...init, headers, signal: AbortSignal.timeout(armedMs) }),
    );
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpClientError(res.status, res.statusText, text, url);
    }
    return res;
  }
}
