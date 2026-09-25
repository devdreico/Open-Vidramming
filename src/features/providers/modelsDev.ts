import { getJson } from '../../shared/lib/http';
import { PROVIDERS, NON_CHAT_MODEL_RE } from './definitions';

export interface RegistryModel {
  id: string;
  name?: string;
  /** El modelo acepta imágenes en entrada (modalities.input incluye "image"). */
  vision?: boolean;
}

interface RegistryCache {
  fetchedAt: number;
  byProvider: Record<string, RegistryModel[]>;
}

const REG_KEY = 'openvg.modelsDev.v1';
const REG_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const API_URL = 'https://models.dev/api.json';

/** Nuestro providerId → id del proveedor en models.dev (por defecto, el mismo). */
const DEV_IDS: Record<string, string> = {
  gemini: 'google',
  together: 'togetherai',
  fireworks: 'fireworks-ai',
};

interface DevModel {
  id?: string;
  name?: string;
  modalities?: { input?: string[]; output?: string[] };
}

interface DevProvider {
  models?: Record<string, DevModel>;
}

function readCache(): RegistryCache {
  try {
    const raw = localStorage.getItem(REG_KEY);
    if (!raw) return { fetchedAt: 0, byProvider: {} };
    const j = JSON.parse(raw) as RegistryCache;
    if (!j || typeof j !== 'object' || !j.byProvider || typeof j.byProvider !== 'object') {
      return { fetchedAt: 0, byProvider: {} };
    }
    return j;
  } catch {
    return { fetchedAt: 0, byProvider: {} };
  }
}

function writeCache(cache: RegistryCache): void {
  try {
    localStorage.setItem(REG_KEY, JSON.stringify(cache));
  } catch {
    /* quota — se queda en memoria de todas formas en esta sesión */
  }
}

/** Subconjunto persistido de models.dev; devuelve datos aunque estén vencidos. */
export function getRegistryModels(providerId: string): RegistryModel[] | null {
  const list = readCache().byProvider[providerId];
  return Array.isArray(list) && list.length ? list : null;
}

export function registryIsFresh(): boolean {
  const cache = readCache();
  return cache.fetchedAt > 0 && Date.now() - cache.fetchedAt <= REG_TTL_MS;
}

export function registryFetchedAt(): number {
  return readCache().fetchedAt;
}

function isTextModel(m: DevModel): boolean {
  const output = m.modalities?.output;
  if (!Array.isArray(output)) return true;
  return output.includes('text');
}

/** Para no duplicar la descarga cuando varios hooks la piden a la vez. */
let inFlight: Promise<boolean> | null = null;

/**
 * Descarga el registro público de modelos (una vez por TTL) y guarda SOLO
 * nuestros proveedores en localStorage (~subconjunto, no los ~5 MB completos).
 */
export async function ensureRegistry(force = false): Promise<boolean> {
  if (!force && registryIsFresh()) return true;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    try {
      const data = await getJson(API_URL, {}, 'models.dev');
      const providers = (data ?? {}) as Record<string, DevProvider>;
      const next: RegistryCache = { fetchedAt: Date.now(), byProvider: {} };
      let hits = 0;

      for (const p of PROVIDERS) {
        const devId = DEV_IDS[p.id] ?? p.id;
        const models = providers[devId]?.models;
        if (!models) continue;
        const list: RegistryModel[] = [];
        for (const m of Object.values(models)) {
        const id = m?.id;
        if (!id || !isTextModel(m) || NON_CHAT_MODEL_RE.test(id)) continue;
          const input = m.modalities?.input;
          list.push({
            id,
            name: m.name && m.name !== id ? m.name : undefined,
            vision: Array.isArray(input) ? input.includes('image') : undefined,
          });
        }
        if (list.length) {
          next.byProvider[p.id] = list;
          hits += 1;
        }
      }

      if (!hits) return false;
      writeCache(next);
      return true;
    } catch {
      return false;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
