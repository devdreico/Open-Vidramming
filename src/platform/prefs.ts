import type { AspectRatioId } from '../shared/types';

const PREF_KEY = 'openvg.prefs.v1';

export interface Prefs {
  providerId: string;
  model: string;
  aspect: AspectRatioId;
  durationSec: number;
}

export const DEFAULT_PREFS: Prefs = {
  providerId: 'openai',
  model: 'gpt-4o-mini',
  aspect: '16:9',
  durationSec: 5,
};

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return { ...DEFAULT_PREFS };
    const parsed = { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<Prefs>) };
    const valid = ['1:1', '16:9', '9:16', '4:5'];
    if (!valid.includes(parsed.aspect)) parsed.aspect = DEFAULT_PREFS.aspect;
    return parsed;
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: Prefs): void {
  localStorage.setItem(PREF_KEY, JSON.stringify(p));
}
