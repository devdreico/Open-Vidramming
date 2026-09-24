export class ApiError extends Error {
  readonly status: number;
  readonly providerLabel: string;

  constructor(message: string, status: number, providerLabel: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.providerLabel = providerLabel;
  }
}

export function isFatalApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    if (err.status === 0) return true; // network/proxy failure — retry won't help immediately
    if (err.status === 401 || err.status === 403 || err.status === 404) return true;
    if (err.status === 400 && /api.?key|unauthorized|invalid.*key|permission|API_KEY/i.test(err.message)) {
      return true;
    }
    return false;
  }
  const msg = err instanceof Error ? err.message : String(err);
  return (
    /Falta la API key/i.test(msg) ||
    /Failed to fetch/i.test(msg) ||
    /NetworkError/i.test(msg) ||
    /AbortError|timeout/i.test(msg) ||
    /No se pudo conectar al proxy/i.test(msg)
  );
}

export function isTransientApiError(err: unknown): boolean {
  if (err instanceof ApiError) {
    return err.status === 408 || err.status === 429 || err.status >= 500;
  }
  return !isFatalApiError(err);
}

export function toErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
