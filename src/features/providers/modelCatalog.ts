import type { ProviderDef, ProviderModel } from './definitions';
import { providerById } from './definitions';
import { getKey } from './keys';

const CACHE_KEY = 'openvg.modelCatalog.v2';
const TTL_MS = 60 * 60 * 1000;

interface CacheEntry {
  fetchedAt: number;
  byProvider: Record<string, string[]>;
}

function authHeaders(p: ProviderDef, key: string): Record<string, string> {
  if (p.protocol === 'anthropic') {
    return { 'x-api-key': key, 'anthropic-version': '2023-06-01' };
  }
  if (p.protocol === 'gemini') {
    return { 'x-goog-api-key': key };
  }
  if (p.id === 'openrouter') {
    return {
      Authorization: `Bearer ${key}`,
      'HTTP-Referer': window.location.origin,
      'X-Title': 'Open VG',
    };
  }
  return { Authorization: `Bearer ${key}` };
}

async function fetchModels(p: ProviderDef): Promise<unknown> {
  const key = getKey(p.id);
  if (!key) return null;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), 20_000);
  try {
    const res = await fetch(`/api/llm/${p.id}${p.modelsPath}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json', ...authHeaders(p, key) },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

function extractIds(data: unknown, protocol: ProviderDef['protocol']): string[] {
  if (!data) return [];
  if (protocol === 'gemini') {
    const j = data as { models?: { name?: string; supportedGenerationMethods?: string[] }[] };
    return (j.models ?? [])
      .filter(
        (m) =>
          !m.supportedGenerationMethods ||
          m.supportedGenerationMethods.includes('generateContent'),
      )
      .map((m) => (m.name ?? '').replace(/^models\//, ''))
      .filter((x) => x && /gemini|flash|pro/i.test(x))
      .slice(0, 50);
  }
  if (protocol === 'anthropic') {
    const j = data as { data?: { id?: string }[] };
    return (j.data ?? []).map((m) => m.id ?? '').filter(Boolean).slice(0, 40);
  }
  if (protocol === 'cohere') {
    const j = data as { models?: { id?: string }[] };
    return (j.models ?? []).map((m) => m.id ?? '').filter(Boolean).slice(0, 40);
  }
  const j = data as {
    data?: { id?: string }[];
    models?: Array<{ id?: string; name?: string } | string>;
  };
  const list = (j.data ?? j.models ?? []) as Array<{ id?: string; name?: string } | string>;
  return list
    .map((m) => (typeof m === 'string' ? m : (m.id ?? m.name ?? '')))
    .filter((id) => id && !/whisper|tts|dall-e|embedding|moderation|audio|realtime/i.test(id))
    .slice(0, 60);
}

function readCache(): CacheEntry {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { fetchedAt: 0, byProvider: {} };
    return JSON.parse(raw) as CacheEntry;
  } catch {
    return { fetchedAt: 0, byProvider: {} };
  }
}

function writeCache(entry: CacheEntry): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(entry));
  } catch {
    /* quota */
  }
}

export async function refreshModelCatalog(providerId: string): Promise<string[] | null> {
  const p = providerById(providerId);
  if (!p.supportsModelList || !getKey(providerId)) return null;

  const data = await fetchModels(p);
  const ids = extractIds(data, p.protocol);
  if (!ids.length) return null;

  const cache = readCache();
  cache.byProvider[providerId] = ids;
  cache.fetchedAt = Date.now();
  writeCache(cache);
  return ids;
}

export function getCachedModels(providerId: string): string[] | null {
  const cache = readCache();
  if (Date.now() - cache.fetchedAt > TTL_MS) return null;
  return cache.byProvider[providerId] ?? null;
}

export function modelsForProvider(p: ProviderDef): {
  models: ProviderModel[];
  source: 'api' | 'default';
} {
  const remote = getCachedModels(p.id);
  if (remote && remote.length) {
    const known = new Map(p.models.map((m) => [m.id, m.label]));
    const merged: ProviderModel[] = remote.map((id) => ({
      id,
      label: known.get(id) ?? id,
    }));
    for (const d of p.models) {
      const idx = merged.findIndex((m) => m.id === d.id);
      if (idx === -1) merged.unshift(d);
      else {
        const [item] = merged.splice(idx, 1);
        merged.unshift(item);
      }
    }
    return { models: merged, source: 'api' };
  }
  return { models: p.models, source: 'default' };
}
