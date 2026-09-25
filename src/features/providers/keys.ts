const STORAGE_KEY = 'openvg.llm.keys.v1';

export type KeyMap = Record<string, string>;

function safeParse(raw: string | null): KeyMap {
  if (!raw) return {};
  try {
    const j = JSON.parse(raw) as unknown;
    if (j && typeof j === 'object' && !Array.isArray(j)) {
      const out: KeyMap = {};
      for (const [k, v] of Object.entries(j as Record<string, unknown>)) {
        if (typeof v === 'string' && v.trim()) out[k] = v.trim();
      }
      return out;
    }
  } catch {
    /* ignore */
  }
  return {};
}

export function loadKeys(): KeyMap {
  try {
    return safeParse(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

/**
 * Persiste el mapa completo. Devuelve `false` si el navegador rechazó la
 * escritura (cuota superada, modo privado…); el caller decide cómo avisar.
 */
export function saveKeys(keys: KeyMap): boolean {
  const cleaned: KeyMap = {};
  for (const [k, v] of Object.entries(keys)) {
    const t = (v ?? '').trim();
    if (t) cleaned[k] = t;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
    return true;
  } catch {
    return false;
  }
}

export function getKey(providerId: string): string {
  return loadKeys()[providerId]?.trim() ?? '';
}

export function hasKey(providerId: string): boolean {
  return getKey(providerId).length > 0;
}

/** Persiste de inmediato (pegar/guardar una key). `false` = no se pudo guardar. */
export function setKey(providerId: string, key: string): boolean {
  const keys = loadKeys();
  const trimmed = key.trim();
  if (trimmed) keys[providerId] = trimmed;
  else delete keys[providerId];
  return saveKeys(keys);
}
