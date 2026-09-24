const STORAGE_KEY = 'openvg.llm.keys.v1';

export type KeyMap = Record<string, string>;

export function loadKeys(): KeyMap {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as KeyMap;
  } catch {
    return {};
  }
}

export function saveKeys(keys: KeyMap): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
}

export function getKey(providerId: string): string {
  return loadKeys()[providerId]?.trim() ?? '';
}

export function setKey(providerId: string, key: string): void {
  const keys = loadKeys();
  const trimmed = key.trim();
  if (trimmed) keys[providerId] = trimmed;
  else delete keys[providerId];
  saveKeys(keys);
}
