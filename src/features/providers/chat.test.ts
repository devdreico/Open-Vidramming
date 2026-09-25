import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { chatCompletion } from './chat';
import { setKey } from './keys';
import { ApiError, CancelledError, isTransientApiError } from '../../shared/lib/errors';

const USER = [{ role: 'user', content: 'x' }] as const;

function respond(body: unknown, init: ResponseInit = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(JSON.stringify(body), { status: 200, ...init })),
  );
}

beforeEach(() => {
  localStorage.clear();
  setKey('openai', 'sk-test');
  setKey('anthropic', 'ant-test');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('chatCompletion', () => {
  it('devuelve el texto de la respuesta completa', async () => {
    respond({ choices: [{ finish_reason: 'stop', message: { content: 'hola' } }] });
    await expect(chatCompletion('openai', 'gpt-4o', [...USER])).resolves.toBe('hola');
  });

  it('finish_reason=length → truncado transitorio (reintentable)', async () => {
    respond({ choices: [{ finish_reason: 'length', message: { content: 'parcial' } }] });
    const err = await chatCompletion('openai', 'gpt-4o', [...USER]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(499);
    expect((err as ApiError).message).toMatch(/límite de tokens/);
    expect(isTransientApiError(err)).toBe(true);
  });

  it('anthropic stop_reason=max_tokens → truncado transitorio', async () => {
    respond({ stop_reason: 'max_tokens', content: [{ type: 'text', text: 'parcial' }] });
    const err = await chatCompletion('anthropic', 'claude-sonnet-4', [...USER]).catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).message).toMatch(/límite de tokens/);
    expect(isTransientApiError(err)).toBe(true);
  });

  it('el 429 sube Retry-After a la ApiError', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: 'slow down' } }), {
            status: 429,
            headers: { 'retry-after': '4' },
          }),
      ),
    );
    const err = await chatCompletion('openai', 'gpt-4o', [...USER]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).retryAfterMs).toBe(4000);
    expect(isTransientApiError(err)).toBe(true);
  });

  it('401 → fatal (no reintenta)', async () => {
    respond({ error: { message: 'Invalid API key' } }, { status: 401 });
    const err = await chatCompletion('openai', 'gpt-4o', [...USER]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(isTransientApiError(err)).toBe(false);
  });

  it('sin key guardada → error claro', async () => {
    setKey('openai', '');
    await expect(chatCompletion('openai', 'gpt-4o', [...USER])).rejects.toThrow(
      /Falta la API key/,
    );
  });

  it('AbortSignal externo → CancelledError', async () => {
    vi.stubGlobal(
      'fetch',
      (_i: unknown, init?: RequestInit) =>
        new Promise<Response>((_res, reject) => {
          init?.signal?.addEventListener('abort', () => {
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
    );
    const ctrl = new AbortController();
    const p = chatCompletion('openai', 'gpt-4o', [...USER], ctrl.signal);
    ctrl.abort();
    await expect(p).rejects.toBeInstanceOf(CancelledError);
  });
});
