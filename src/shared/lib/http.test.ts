import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, CancelledError } from './errors';
import { BODY_TIMEOUT_MS, readErrorMessage, readJson, withTimeout } from './http';

function jsonRes(body: unknown, init: ResponseInit = {}): Response {
  return new Response(typeof body === 'string' ? body : JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('withTimeout', () => {
  it('un AbortSignal externo produce CancelledError (no timeout)', async () => {
    vi.stubGlobal(
      'fetch',
      (_input: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const ctrl = new AbortController();
    const p = withTimeout('/api/llm/x', { signal: ctrl.signal });
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
  });

  it('una señal ya abortada no llega a hacer fetch', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(withTimeout('/x', { signal: ctrl.signal })).rejects.toBeInstanceOf(CancelledError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('sin red → ApiError 0 con pista del proxy', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new TypeError('Failed to fetch')));
    await expect(withTimeout('/x')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: expect.stringContaining('proxy'),
    });
  });
});

describe('cuerpo de respuesta', () => {
  it('un cuerpo que nunca llega no deja la promesa colgada', async () => {
    vi.useFakeTimers();
    const hang = { ok: true, status: 200, text: () => new Promise<string>(() => {}) } as unknown as Response;
    const p = readJson(hang, 'OpenAI');
    const assertion = expect(p).rejects.toMatchObject({ name: 'ApiError', status: 408 });
    await vi.advanceTimersByTimeAsync(BODY_TIMEOUT_MS + 10);
    await assertion;
  });

  it('lee Retry-After del 429 y lo sube a ApiError.retryAfterMs', async () => {
    const res = jsonRes({ error: { message: 'slow down' } }, {
      status: 429,
      headers: { 'retry-after': '3' },
    });
    const err = await readErrorMessage(res, 'OpenAI');
    expect(err.status).toBe(429);
    expect(err.retryAfterMs).toBe(3000);
    expect(err.message).toContain('Límite de rate');
    expect(err.message).toContain('slow down');
  });

  it('HTML del proxy → error claro con status 0', async () => {
    const res = new Response('<!doctype html><html></html>', { status: 200 });
    await expect(readJson(res, 'OpenAI')).rejects.toMatchObject({
      name: 'ApiError',
      status: 0,
      message: expect.stringContaining('HTML'),
    });
  });

  it('cuerpo no JSON → error con un extracto, no el body entero', async () => {
    const res = new Response('no-json '.repeat(500), { status: 200 });
    const err = await readJson(res, 'OpenAI').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as Error).message.length).toBeLessThan(700);
  });
});
