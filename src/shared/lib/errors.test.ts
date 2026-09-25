import { describe, expect, it } from 'vitest';
import {
  ApiError,
  CancelledError,
  isCancelled,
  isFatalApiError,
  isTransientApiError,
  parseRetryAfterMs,
  retryDelayMs,
  toErrorMessage,
  truncateMessage,
} from './errors';

describe('clasificación de errores', () => {
  it('los 4xx de credenciales/ruta son fatales (no reintentar)', () => {
    for (const status of [400, 401, 403, 404]) {
      const err = new ApiError('x', status, 'OpenAI');
      expect(isFatalApiError(err), `status ${status}`).toBe(true);
      expect(isTransientApiError(err), `status ${status}`).toBe(false);
    }
  });

  it('red, timeout, rate-limit y 5xx son transitorios (reintentar)', () => {
    for (const status of [0, 408, 429, 499, 500, 502, 503, 200]) {
      const err = new ApiError('x', status, 'OpenAI');
      expect(isTransientApiError(err), `status ${status}`).toBe(true);
      expect(isFatalApiError(err), `status ${status}`).toBe(false);
    }
  });

  it('la cancelación del usuario es fatal y no transitoria', () => {
    expect(isCancelled(new CancelledError())).toBe(true);
    expect(isFatalApiError(new CancelledError())).toBe(true);
    expect(isTransientApiError(new CancelledError())).toBe(false);
  });

  it('falta de key → fatal aunque no sea ApiError', () => {
    expect(isFatalApiError(new Error('Falta la API key de OpenAI.'))).toBe(true);
  });
});

describe('Retry-After y backoff', () => {
  it('parsea segundos y fechas HTTP', () => {
    expect(parseRetryAfterMs('2')).toBe(2000);
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs(null)).toBeUndefined();
    expect(parseRetryAfterMs('garbage')).toBeUndefined();
    const future = new Date(Date.now() + 5_000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).toBeGreaterThan(3_000);
    expect(ms).toBeLessThanOrEqual(5_100);
  });

  it('respeta Retry-After por encima del backoff y lo limita a 30 s', () => {
    expect(retryDelayMs(new ApiError('x', 429, 'OpenAI', 7_000), 1)).toBe(7_000);
    expect(retryDelayMs(new ApiError('x', 429, 'OpenAI', 120_000), 1)).toBe(30_000);
  });

  it('el backoff exponencial crece y está acotado', () => {
    const d1 = retryDelayMs(new ApiError('x', 500, 'OpenAI'), 1);
    const d3 = retryDelayMs(new ApiError('x', 500, 'OpenAI'), 3);
    expect(d1).toBeGreaterThanOrEqual(1000);
    expect(d1).toBeLessThanOrEqual(1250);
    expect(d3).toBeGreaterThan(d1);
    expect(retryDelayMs(new ApiError('x', 500, 'OpenAI'), 10)).toBeLessThanOrEqual(10_000);
  });
});

describe('mensajes', () => {
  it('trunca los mensajes largos', () => {
    const long = 'x'.repeat(5_000);
    const out = truncateMessage(long, 100);
    expect(out.length).toBeLessThan(200);
    expect(out).toContain('truncado');
    expect(toErrorMessage(new Error(long)).length).toBeLessThan(700);
  });
});
