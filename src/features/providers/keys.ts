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

export function saveKeys(keys: KeyMap): void {
  const cleaned: KeyMap = {};
  for (const [k, v] of Object.entries(keys)) {
    const t = (v ?? '').trim();
    if (t) cleaned[k] = t;
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(cleaned));
}

export function getKey(providerId: string): string {
  return loadKeys()[providerId]?.trim() ?? '';
}

export function hasKey(providerId: string): boolean {
  return getKey(providerId).length > 0;
}

/** Persist immediately (every keystroke / paste). */
export function setKey(providerId: string, key: string): void {
  const keys = loadKeys();
  const trimmed = key.trim();
  if (trimmed) keys[providerId] = trimmed;
  else delete keys[providerId];
  saveKeys(keys);
}
