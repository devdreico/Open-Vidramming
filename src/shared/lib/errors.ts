export class ApiError extends Error {
  readonly status: number;
  readonly providerLabel: string;
  /** `Retry-After` en ms, si el proveedor lo envía (429/503). */
  readonly retryAfterMs?: number;

  constructor(
    message: string,
    status: number,
    providerLabel: string,
    retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.providerLabel = providerLabel;
    if (retryAfterMs && retryAfterMs > 0) this.retryAfterMs = retryAfterMs;
  }
}

/** El usuario canceló la operación (AbortSignal); no es un fallo. */
export class CancelledError extends Error {
  constructor(message = 'Operación cancelada.') {
    super(message);
    this.name = 'CancelledError';
  }
}

export function isCancelled(err: unknown): boolean {
  if (err instanceof CancelledError) return true;
  return err instanceof Error && err.name === 'AbortError';
}

/**
 * Fatales: reintentar no ayuda (credenciales, ruta/modelo inexistente, cancelación).
 * Todo lo demás (0 = red/proxy, 408 timeout, 429 rate-limit, 5xx, respuestas vacías)
 * se considera transitorio y se reintenta con backoff.
 */
export function isFatalApiError(err: unknown): boolean {
  if (isCancelled(err)) return true;
  if (err instanceof ApiError) {
    return (
      err.status === 400 ||
      err.status === 401 ||
      err.status === 403 ||
      err.status === 404
    );
  }
  const msg = err instanceof Error ? err.message : String(err);
  return /Falta la API key/i.test(msg);
}

export function isTransientApiError(err: unknown): boolean {
  return !isFatalApiError(err);
}

/** `Retry-After` (segundos o fecha HTTP) → ms. */
export function parseRetryAfterMs(value: string | null | undefined): number | undefined {
  if (!value) return undefined;
  const secs = Number(value);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const date = Date.parse(value);
  if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  return undefined;
}

const MAX_MESSAGE = 600;

export function truncateMessage(msg: string, max = MAX_MESSAGE): string {
  if (msg.length <= max) return msg;
  return `${msg.slice(0, max)}… (mensaje truncado, ${msg.length} caracteres)`;
}

export function toErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return truncateMessage(msg);
}

/**
 * Espera con backoff exponencial + jitter; respeta `Retry-After` si existe.
 * `attempt` es 1-based (el intento que acaba de fallar).
 */
export function retryDelayMs(err: unknown, attempt: number): number {
  if (err instanceof ApiError && err.retryAfterMs) {
    return Math.min(err.retryAfterMs, 30_000);
  }
  const base = Math.min(1000 * 2 ** (attempt - 1), 8_000);
  const jitter = Math.round(base * 0.25 * Math.random());
  return base + jitter;
}
