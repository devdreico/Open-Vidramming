import type { ProviderDef, ProviderModel } from './definitions';
import { providerById, NON_CHAT_MODEL_RE } from './definitions';
import { getKey } from './keys';
import { getJson } from '../../shared/lib/http';
import { toErrorMessage } from '../../shared/lib/errors';
import { getRegistryModels } from './modelsDev';

const CACHE_KEY = 'openvg.modelCatalog.v3';
/** Refresco del /models del proveedor. Los datos vencidos se siguen sirviendo (SWR). */
const TTL_MS = 60 * 60 * 1000;
const MAX_IDS = 80;

export type CatalogSource = 'api' | 'registry' | 'default';

export const SOURCE_LABEL: Record<CatalogSource, string> = {
  api: 'vía API',
  registry: 'models.dev',
  default: 'lista local',
};

export interface ProviderCatalog {
  ids: string[];
  labels: Record<string, string>;
  /** Epoch ms del último /models exitoso; 0 = nunca. */
  fetchedAt: number;
  /** Último fallo del /models (no borra los ids anteriores). */
  error?: string;
}

interface CatalogCache {
  byProvider: Record<string, ProviderCatalog>;
}

export interface CatalogOutcome {
  ok: boolean;
  count: number;
  fetchedAt: number;
  /** undefined = sin key / proveedor sin /models (no es un error). */
  error?: string;
}

function readCache(): CatalogCache {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return { byProvider: {} };
    const j = JSON.parse(raw) as CatalogCache;
    if (!j || typeof j !== 'object' || !j.byProvider || typeof j.byProvider !== 'object') {
      return { byProvider: {} };
    }
    return j;
  } catch {
    return { byProvider: {} };
  }
}

function writeCache(cache: CatalogCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    /* quota */
  }
}

export function getProviderCatalog(providerId: string): ProviderCatalog | null {
  const entry = readCache().byProvider[providerId];
  return entry && Array.isArray(entry.ids) && entry.ids.length ? entry : null;
}

export function catalogIsFresh(catalog: ProviderCatalog | null): boolean {
  return !!catalog && Date.now() - catalog.fetchedAt <= TTL_MS;
}

/** Borra el /models cacheado (al quitar la key de un proveedor). */
export function clearProviderCatalog(providerId: string): void {
  const cache = readCache();
  if (!cache.byProvider[providerId]) return;
  delete cache.byProvider[providerId];
  writeCache(cache);
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

const NON_CHAT_MODEL = NON_CHAT_MODEL_RE;

interface RawEntry {
  id?: string;
  name?: string;
  display_name?: string;
}

export function extractIds(
  data: unknown,
  p: ProviderDef,
): { ids: string[]; labels: Record<string, string> } {
  const labels: Record<string, string> = {};
  const push = (id?: string, label?: string): void => {
    if (!id) return;
    if (label && label !== id) labels[id] = label;
  };

  if (p.protocol === 'gemini') {
    const j = data as {
      models?: { name?: string; displayName?: string; supportedGenerationMethods?: string[] }[];
    };
    const ids = (j.models ?? [])
      .filter(
        (m) =>
          !m.supportedGenerationMethods ||
          m.supportedGenerationMethods.includes('generateContent'),
      )
      .map((m) => ({ id: (m.name ?? '').replace(/^models\//, ''), label: m.displayName }))
      .filter(
        (x) =>
          x.id &&
          /gemini|flash|pro|learnlm/i.test(x.id) &&
          !/embedding|aqa|image|imagen|veo|tts|audio/i.test(x.id),
      )
      .slice(0, MAX_IDS);
    for (const x of ids) push(x.id, x.label);
    return { ids: ids.map((x) => x.id), labels };
  }

  let list: RawEntry[];
  if (p.protocol === 'anthropic') {
    list = ((data as { data?: RawEntry[] }).data ?? []) as RawEntry[];
  } else if (p.protocol === 'cohere') {
    list = ((data as { models?: RawEntry[] }).models ?? []) as RawEntry[];
  } else {
    const j = data as { data?: RawEntry[]; models?: Array<RawEntry | string> };
    const raw = j.data ?? j.models ?? [];
    list = raw.map((m) => (typeof m === 'string' ? { id: m } : m)) as RawEntry[];
  }

  const ids: string[] = [];
  for (const entry of list) {
    const id = entry.id ?? entry.name;
    if (!id || NON_CHAT_MODEL.test(id)) continue;
    ids.push(id);
    push(id, entry.display_name ?? entry.name);
    if (ids.length >= MAX_IDS) break;
  }
  return { ids, labels };
}

function saveError(providerId: string, error: string): void {
  const cache = readCache();
  const prev = cache.byProvider[providerId];
  cache.byProvider[providerId] = {
    ids: prev?.ids ?? [],
    labels: prev?.labels ?? {},
    fetchedAt: prev?.fetchedAt ?? 0,
    error,
  };
  writeCache(cache);
}

/** Evita dobles GET cuando dos hooks (sidebar + wizard) refrescan a la vez. */
const inFlight = new Map<string, Promise<CatalogOutcome>>();

/**
 * Intenta el /models del proveedor con la key guardada.
 * - Sin key o proveedor sin endpoint → `ok:false` sin `error` (no es un fallo).
 * - Con fallo → conserva los ids anteriores y deja `error` visible.
 */
export function refreshModelCatalog(providerId: string): Promise<CatalogOutcome> {
  const key = getKey(providerId);
  const dedupeKey = `${providerId}::${key ? 'key' : 'nokey'}`;
  const existing = inFlight.get(dedupeKey);
  if (existing) return existing;

  const run = doRefreshModelCatalog(providerId, key).finally(() => inFlight.delete(dedupeKey));
  inFlight.set(dedupeKey, run);
  return run;
}

async function doRefreshModelCatalog(providerId: string, key: string): Promise<CatalogOutcome> {
  const cached = getProviderCatalog(providerId);
  const base: CatalogOutcome = { ok: false, count: cached?.ids.length ?? 0, fetchedAt: cached?.fetchedAt ?? 0 };

  let p: ProviderDef;
  try {
    p = providerById(providerId);
  } catch (e) {
    const msg = toErrorMessage(e);
    saveError(providerId, msg);
    return { ...base, error: msg };
  }

  if (!p.supportsModelList) return base;
  if (!key) return base;

  try {
    const data = await getJson(
      `/api/llm/${p.id}${p.modelsPath}`,
      authHeaders(p, key),
      p.label,
    );
    const { ids, labels } = extractIds(data, p);
    if (!ids.length) throw new Error(`${p.label}: el catálogo de modelos vino vacío.`);
    const cache = readCache();
    cache.byProvider[providerId] = { ids, labels, fetchedAt: Date.now() };
    writeCache(cache);
    return { ok: true, count: ids.length, fetchedAt: Date.now() };
  } catch (e) {
    const msg = toErrorMessage(e);
    saveError(providerId, msg);
    return { ...base, error: msg };
  }
}

function mergeModels(
  defaults: ProviderModel[],
  remote: string[],
  labels: Record<string, string>,
): ProviderModel[] {
  const out: ProviderModel[] = defaults.map((m) => ({ ...m }));
  const seen = new Set(out.map((m) => m.id));
  for (const id of remote) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: labels[id] ?? id });
  }
  return out;
}

export interface CatalogSnapshot {
  models: ProviderModel[];
  source: CatalogSource;
  fetchedAt: number;
  /** Último error del /models (si lo hay), aunque haya datos cacheados. */
  error?: string;
}

/**
 * Combina, por prioridad: catálogo de la API → registro models.dev → defaults locales.
 * Los datos vencidos de la API se siguen usando (stale-while-revalidate).
 */
export function modelsForProvider(p: ProviderDef): CatalogSnapshot {
  const api = getProviderCatalog(p.id);
  if (api?.ids.length) {
    return {
      models: mergeModels(p.models, api.ids, api.labels),
      source: 'api',
      fetchedAt: api.fetchedAt,
      error: api.error,
    };
  }
  const registry = getRegistryModels(p.id);
  if (registry?.length) {
    const byId = new Map(registry.map((m) => [m.id, m]));
    const defaults = p.models.map((m) => ({ ...m, vision: byId.get(m.id)?.vision ?? m.vision }));
    const known = new Set(defaults.map((m) => m.id));
    const extra = registry
      .filter((r) => !known.has(r.id))
      .map((r) => ({ id: r.id, label: r.name ?? r.id, vision: r.vision }));
    return {
      models: [...defaults, ...extra],
      source: 'registry',
      fetchedAt: 0,
      error: undefined,
    };
  }
  return { models: p.models, source: 'default', fetchedAt: 0, error: undefined };
}

export function modelsForProviderId(providerId: string): CatalogSnapshot {
  try {
    return modelsForProvider(providerById(providerId));
  } catch {
    return { models: [], source: 'default', fetchedAt: 0 };
  }
}

/**
 * ¿Conocemos el soporte de visión de este modelo concreto?
 * `undefined` = fuera del catálogo (se decide por el proveedor).
 */
export function getModelVision(providerId: string, modelId: string): boolean | undefined {
  return modelsForProviderId(providerId).models.find((m) => m.id === modelId)?.vision;
}
