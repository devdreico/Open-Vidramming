import { ApiError, CancelledError, parseRetryAfterMs, truncateMessage } from './errors';

export const FETCH_TIMEOUT_MS = 120_000;
export const BODY_TIMEOUT_MS = 60_000;

/**
 * `fetch` con timeout y soporte de cancelación externa (`init.signal`).
 * - Timeout → `ApiError` 408 (transitorio → reintento con backoff).
 * - `AbortSignal` externo → `CancelledError` (cancelación del usuario, no reintenta).
 * - Sin red / proxy caído → `ApiError` 0 (también reintenable).
 */
export async function withTimeout(input: string, init: RequestInit = {}): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new ApiError('Entorno sin `window` (¿SSR?).', 0, '');
  }
  const external = init.signal ?? null;
  if (external?.aborted) throw new CancelledError();
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  external?.addEventListener('abort', onAbort, { once: true });
  const timer = window.setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (external?.aborted) throw new CancelledError();
    if (e instanceof Error && e.name === 'AbortError') {
      throw new ApiError(`Tiempo de espera agotado (timeout ${FETCH_TIMEOUT_MS / 1000}s).`, 408, '');
    }
    const msg = e instanceof Error ? e.message : String(e);
    if (/Failed to fetch|NetworkError|load failed/i.test(msg)) {
      throw new ApiError(
        `No se pudo conectar al proxy de la API. ¿Está corriendo \`npm run dev\`? (${msg})`,
        0,
        '',
      );
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
    external?.removeEventListener('abort', onAbort);
  }
}

/**
 * Lee el cuerpo con timeout propio: `Response.text()` no acepta `AbortSignal`,
 * así que una respuesta que llega a medias ya no deja la promesa colgada.
 */
export async function readBody(res: Response, providerLabel: string): Promise<string> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(
        new ApiError(
          `${providerLabel}: la respuesta tardó demasiado en leerse (timeout ${BODY_TIMEOUT_MS / 1000}s).`,
          408,
          providerLabel,
        ),
      );
    }, BODY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([res.text(), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

export async function readErrorMessage(res: Response, providerLabel: string): Promise<ApiError> {
  const text = await readBody(res, providerLabel).catch(() => '');
  let message = text || `HTTP ${res.status}`;
  try {
    const j = JSON.parse(text) as {
      error?: { message?: string } | string;
      message?: string;
      type?: string;
    };
    if (typeof j.error === 'string') message = j.error;
    else if (j.error && typeof j.error === 'object' && j.error.message) message = j.error.message;
    else if (j.message) message = j.message;
  } catch {
    if (text.startsWith('<')) {
      message = `Respuesta no válida del servidor (HTTP ${res.status}). ¿El proxy está configurado?`;
    }
  }

  if (res.status === 401 || res.status === 403) {
    message = `API key inválida o sin permisos. ${message}`;
  } else if (res.status === 429) {
    message = `Límite de rate alcanzado. Inténtalo en unos segundos. ${message}`;
  } else if (res.status === 404) {
    message = `Ruta o modelo no encontrado (404). ${message}`;
  }

  return new ApiError(
    truncateMessage(`${providerLabel}: ${message}`),
    res.status,
    providerLabel,
    parseRetryAfterMs(res.headers.get('retry-after')),
  );
}

/** Respuesta esperada en JSON: mantiene visibles el HTML del proxy y los cuerpos no-JSON. */
export async function readJson(res: Response, providerLabel: string): Promise<unknown> {
  if (!res.ok) throw await readErrorMessage(res, providerLabel);
  const text = await readBody(res, providerLabel);
  if (text.startsWith('<')) {
    throw new ApiError(
      `${providerLabel}: el proxy /api/llm devolvió HTML. ¿Está corriendo \`npm run dev\`?`,
      0,
      providerLabel,
    );
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ApiError(
      truncateMessage(`${providerLabel}: la respuesta no es JSON válido: ${text.slice(0, 200)}`),
      200,
      providerLabel,
    );
  }
}

/** GET que retorna JSON parseado, con error explícito si el proxy devuelve HTML. */
export async function getJson(
  url: string,
  headers: Record<string, string>,
  label: string,
): Promise<unknown> {
  const res = await withTimeout(url, {
    method: 'GET',
    headers: { Accept: 'application/json', ...headers },
  });
  return readJson(res, label);
}
