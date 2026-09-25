import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Backoff instantáneo: los tests no deben esperar los 1-2 s reales de retry.
vi.mock('../../shared/lib/errors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../shared/lib/errors')>();
  return { ...actual, retryDelayMs: () => 5 };
});

import { runVidramming } from './runVidramming';
import { setKey } from '../providers/keys';
import { CancelledError } from '../../shared/lib/errors';

const VALID_CODE = `
import React from 'react';
export const meta = { width: 1920, height: 1080, fps: 60, durationInFrames: 300 };
export default function Scene() {
  return <div>ok</div>;
}
`;

const BROKEN_CODE = `
export default function Scene() {
  return <div>{"esto no compila" + +}</div>;
}
`;

function okResponse(code: string): Response {
  return new Response(
    JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: code } }] }),
    { status: 200 },
  );
}

const REQ = {
  prompt: 'una intro con partícululas',
  aspect: '16:9',
  durationSec: 5,
  providerId: 'openai',
  model: 'gpt-4o',
} as const;

let bodies: Array<{ role: string }[]>;

/** Programa una secuencia de respuestas del "proveedor". */
function queue(handler: (call: number) => Response | Promise<Response>): void {
  let call = 0;
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: unknown, init?: RequestInit) => {
      if (init?.body) bodies.push(JSON.parse(String(init.body)).messages);
      return handler(call++);
    }),
  );
}

beforeEach(() => {
  localStorage.clear();
  setKey('openai', 'sk-test');
  bodies = [];
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('runVidramming', () => {
  it('genera a la primera y respeta el meta pedido por el usuario', async () => {
    queue(() => okResponse(VALID_CODE));
    const out = await runVidramming({ ...REQ }, []);
    expect(out.attempts).toBe(1);
    expect(out.meta).toEqual({ width: 1920, height: 1080, fps: 60, durationInFrames: 300 });
    expect(bodies).toHaveLength(1);
  });

  it('reintenta cuando la composición no compila', async () => {
    queue((call) => (call === 0 ? okResponse(BROKEN_CODE) : okResponse(VALID_CODE)));
    const out = await runVidramming({ ...REQ }, []);
    expect(out.attempts).toBe(2);
  });

  it('nunca envía dos mensajes user consecutivos (rompe Anthropic/Gemini)', async () => {
    // 1: TSX roto (falla al compilar) → 2: 500 transitorio → 3: válido.
    queue((call) => {
      if (call === 0) return okResponse(BROKEN_CODE);
      if (call === 1) return new Response('boom', { status: 500 });
      return okResponse(VALID_CODE);
    });
    const out = await runVidramming({ ...REQ }, []);
    expect(out.attempts).toBe(3);
    expect(bodies).toHaveLength(3);
    for (const messages of bodies) {
      for (let i = 1; i < messages.length; i++) {
        expect(
          messages[i - 1].role === 'user' && messages[i].role === 'user',
          `roles: ${messages.map((m) => m.role).join(' → ')}`,
        ).toBe(false);
      }
    }
    // La nota de error se fusionó en el user existente (no se perdió).
    const lastUser = bodies[2].filter((m) => m.role === 'user').pop();
    expect(JSON.stringify(lastUser)).toContain('La composición no compiló');
  });

  it('401 es fatal: falla al primer intento sin reintentar', async () => {
    queue(() => new Response(JSON.stringify({ error: { message: 'bad key' } }), { status: 401 }));
    await expect(runVidramming({ ...REQ }, [])).rejects.toThrow(/OpenAI/);
    expect(bodies).toHaveLength(1);
  });

  it('un 5xx se reintenta con backoff y termina bien', async () => {
    queue((call) => (call === 0 ? new Response('x', { status: 503 }) : okResponse(VALID_CODE)));
    const out = await runVidramming({ ...REQ }, []);
    expect(out.attempts).toBe(2);
  });

  it('si se agotan los intentos lanza con el último error', async () => {
    queue(() => new Response('x', { status: 503 }));
    await expect(runVidramming({ ...REQ }, [])).rejects.toThrow(
      /No se pudo generar una composición válida/,
    );
    expect(bodies).toHaveLength(3);
  });

  it('señal abortada desde el inicio → CancelledError sin llamar a la red', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(runVidramming({ ...REQ }, [], undefined, ctrl.signal)).rejects.toBeInstanceOf(
      CancelledError,
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
