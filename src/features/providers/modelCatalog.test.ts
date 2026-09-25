import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearProviderCatalog,
  extractIds,
  getProviderCatalog,
  getModelVision,
  modelsForProvider,
  refreshModelCatalog,
} from './modelCatalog';
import { ensureRegistry, getRegistryModels } from './modelsDev';
import { providerById } from './definitions';

const KEY_STORAGE = 'openvg.llm.keys.v1';

const MODELS_DEV_FIXTURE = {
  openai: {
    models: {
      'gpt-4o': {
        id: 'gpt-4o',
        name: 'GPT-4o',
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
      'gpt-4o-audio-preview': {
        id: 'gpt-4o-audio-preview',
        modalities: { input: ['text', 'audio'], output: ['text'] },
      },
      'gpt-image-1': { id: 'gpt-image-1', modalities: { input: ['text'], output: ['image'] } },
      'whisper-1': { id: 'whisper-1', modalities: { input: ['audio'], output: ['text'] } },
    },
  },
  google: {
    models: {
      'gemini-2.0-flash': {
        id: 'gemini-2.0-flash',
        name: 'Gemini 2.0 Flash',
        modalities: { input: ['text', 'image'], output: ['text'] },
      },
    },
  },
  togetherai: {
    models: {
      'meta-llama/Llama-3.3-70B-Instruct-Turbo': {
        id: 'meta-llama/Llama-3.3-70B-Instruct-Turbo',
        modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
  'fireworks-ai': {
    models: {
      'accounts/fireworks/models/llama-v3p3-70b-instruct': {
        id: 'accounts/fireworks/models/llama-v3p3-70b-instruct',
        modalities: { input: ['text'], output: ['text'] },
      },
    },
  },
};

type FetchMode = 'modelsdev' | 'ok' | 'unauthorized' | 'html';
let fetchMode: FetchMode = 'modelsdev';

function stubFetch(): void {
  vi.stubGlobal('fetch', async (input: string) => {
    const url = String(input);
    if (url.includes('models.dev')) {
      return new Response(JSON.stringify(MODELS_DEV_FIXTURE), { status: 200 });
    }
    switch (fetchMode) {
      case 'ok':
        return new Response(
          JSON.stringify({
            data: [
              { id: 'gpt-4o' },
              { id: 'gpt-4o-mini' },
              { id: 'whisper-1' },
              { id: 'text-embedding-3-small' },
            ],
          }),
          { status: 200 },
        );
      case 'unauthorized':
        return new Response(JSON.stringify({ error: { message: 'Invalid API key' } }), {
          status: 401,
        });
      default:
        return new Response('<!doctype html><html></html>', { status: 200 });
    }
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMode = 'modelsdev';
  stubFetch();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('extractIds por protocolo', () => {
  it('anthropic lee display_name', () => {
    const out = extractIds(
      { data: [{ id: 'claude-sonnet-4-20250514', display_name: 'Claude Sonnet 4' }] },
      providerById('anthropic'),
    );
    expect(out.labels['claude-sonnet-4-20250514']).toBe('Claude Sonnet 4');
  });

  it('cohere usa `name` como id', () => {
    const out = extractIds({ models: [{ name: 'command-r-plus' }] }, providerById('cohere'));
    expect(out.ids).toContain('command-r-plus');
  });

  it('gemini quita el prefijo models/ y filtra no-chat', () => {
    const out = extractIds(
      {
        models: [
          { name: 'models/gemini-2.0-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/text-embedding-004', supportedGenerationMethods: ['embedContent'] },
        ],
      },
      providerById('gemini'),
    );
    expect(out.ids).toEqual(['gemini-2.0-flash']);
  });

  it('openai filtra whisper y embeddings', () => {
    const out = extractIds(
      { data: [{ id: 'gpt-4o' }, { id: 'whisper-1' }, { id: 'text-embedding-3-small' }] },
      providerById('openai'),
    );
    expect(out.ids).toEqual(['gpt-4o']);
  });
});

describe('refreshModelCatalog', () => {
  it('sin key → ok:false sin error (no es fallo)', async () => {
    const out = await refreshModelCatalog('openai');
    expect(out.ok).toBe(false);
    expect(out.error).toBeUndefined();
  });

  it('con key → catálogo de la API y fuente "api"', async () => {
    localStorage.setItem(KEY_STORAGE, JSON.stringify({ openai: 'sk-test' }));
    fetchMode = 'ok';
    const out = await refreshModelCatalog('openai');
    expect(out.ok).toBe(true);
    expect(getProviderCatalog('openai')?.ids).toEqual(['gpt-4o', 'gpt-4o-mini']);
    expect(modelsForProvider(providerById('openai')).source).toBe('api');
  });

  it('401 → error visible y conserva los ids anteriores', async () => {
    localStorage.setItem(KEY_STORAGE, JSON.stringify({ openai: 'sk-test' }));
    fetchMode = 'ok';
    await refreshModelCatalog('openai');
    fetchMode = 'unauthorized';
    const out = await refreshModelCatalog('openai');
    expect(out.ok).toBe(false);
    expect(out.error).toMatch(/401|Invalid API key/);
    expect(getProviderCatalog('openai')?.ids).toEqual(['gpt-4o', 'gpt-4o-mini']);
  });

  it('HTML del proxy → error legible', async () => {
    localStorage.setItem(KEY_STORAGE, JSON.stringify({ anthropic: 'ant-test' }));
    fetchMode = 'html';
    const out = await refreshModelCatalog('anthropic');
    expect(out.error).toMatch(/HTML|proxy/);
  });

  it('clearProviderCatalog borra el cache del proveedor', async () => {
    localStorage.setItem(KEY_STORAGE, JSON.stringify({ openai: 'sk-test' }));
    fetchMode = 'ok';
    await refreshModelCatalog('openai');
    clearProviderCatalog('openai');
    expect(getProviderCatalog('openai')).toBeNull();
  });
});

describe('registro models.dev (fallback sin key)', () => {
  it('carga el subconjunto y mapea los ids de proveedor', async () => {
    await expect(ensureRegistry()).resolves.toBe(true);
    expect(getRegistryModels('gemini')?.length).toBe(1);
    expect(getRegistryModels('together')?.length).toBe(1);
    expect(getRegistryModels('fireworks')?.length).toBe(1);
  });

  it('filtra modelos de solo imagen/audio y marca visión', async () => {
    await ensureRegistry();
    const openai = getRegistryModels('openai') ?? [];
    expect(openai.map((m) => m.id)).not.toContain('gpt-image-1');
    expect(openai.map((m) => m.id)).not.toContain('whisper-1');
    expect(openai.map((m) => m.id)).not.toContain('gpt-4o-audio-preview');
    expect(openai.find((m) => m.id === 'gpt-4o')?.vision).toBe(true);
  });

  it('modelsForProvider usa el registro cuando no hay API', async () => {
    await ensureRegistry();
    const snap = modelsForProvider(providerById('gemini'));
    expect(snap.source).toBe('registry');
    expect(snap.models[0].id).toBe(providerById('gemini').defaultModel);
  });

  it('getModelVision resuelve por modelo, no por proveedor', async () => {
    await ensureRegistry();
    expect(getModelVision('openai', 'gpt-4o')).toBe(true);
    expect(getModelVision('together', 'meta-llama/Llama-3.3-70B-Instruct-Turbo')).toBe(false);
    expect(getModelVision('openai', 'modelo-que-no-existe')).toBeUndefined();
  });
});
