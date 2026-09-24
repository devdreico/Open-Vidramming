import { useCallback, useMemo, useState } from 'react';
import type { PlayerRef } from '@remotion/player';
import type {
  AspectRatioId,
  AssetFile,
  CompositionMeta,
  GenerateRequest,
  GenerationRecord,
} from '../shared/types';
import { runVidramming } from '../features/agent/runVidramming';
import { PROVIDERS, providerById } from '../features/providers/definitions';
import { compileComposition } from '../features/generator/sandbox';
import { deleteGeneration, listGenerations, newId, saveGeneration } from '../features/history/history';
import { loadPrefs, savePrefs, type Prefs } from '../platform/prefs';
import { refreshModelCatalog } from '../features/providers/modelCatalog';

export type AppPhase = 'idle' | 'generating' | 'ready' | 'error';

export function useAppController() {
  const [prefs, setPrefsState] = useState<Prefs>(() => loadPrefs());
  const [phase, setPhase] = useState<AppPhase>('idle');
  const [agentStatus, setAgentStatus] = useState('listo');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [prompt, setPrompt] = useState('');
  const [code, setCode] = useState('');
  const [meta, setMeta] = useState<CompositionMeta | null>(null);
  const [Scene, setScene] = useState<React.ComponentType | null>(null);
  const [history, setHistory] = useState<GenerationRecord[]>([]);
  const [assets, setAssets] = useState<AssetFile[]>([]);
  const [playerRef, setPlayerRef] = useState<PlayerRef | null>(null);
  const [previewSurface, setPreviewSurface] = useState<HTMLElement | null>(null);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev: Prefs) => {
      const next: Prefs = { ...prev, ...patch };
      savePrefs(next);
      return next;
    });
  }, []);

  const setAspect = useCallback(
    (aspect: AspectRatioId) => {
      setPrefs({ aspect });
      const a = { '1:1': [1080, 1080], '16:9': [1920, 1080], '9:16': [1080, 1920], '4:5': [1080, 1350] } as const;
      const [w, h] = a[aspect];
      setMeta((m) => (m ? { ...m, width: w, height: h } : m));
      setStatus('Proporción actualizada. Pulsa VIDRAMMING para regenerar con la nueva relación de aspecto.');
    },
    [setPrefs],
  );

  const refreshHistory = useCallback(async () => {
    setHistory(await listGenerations());
  }, []);

  const addAssets = useCallback((files: AssetFile[]) => {
    setAssets((prev) => {
      const ids = new Set(prev.map((a) => a.id));
      return [...prev, ...files.filter((f) => !ids.has(f.id))];
    });
  }, []);

  const removeAsset = useCallback((id: string) => {
    setAssets((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAssets = useCallback(() => setAssets([]), []);

  const provider = useMemo(() => {
    try {
      return providerById(prefs.providerId);
    } catch {
      return PROVIDERS[0];
    }
  }, [prefs.providerId]);

  const refreshModels = useCallback(async () => {
    await refreshModelCatalog(prefs.providerId);
  }, [prefs.providerId]);

  const vidramming = useCallback(async () => {
    setPhase('generating');
    setError('');
    setAgentStatus('preparando skills');
    setStatus('OPENVG-AGENT · indexando archivos y skills…');
    try {
      const req: GenerateRequest = {
        prompt,
        aspect: prefs.aspect,
        durationSec: prefs.durationSec,
        providerId: prefs.providerId,
        model: prefs.model,
      };
      setAgentStatus('generando');
      const result = await runVidramming(req, assets, setStatus);
      setCode(result.code);
      setMeta(result.meta);
      setScene(() => result.Scene);
      setPhase('ready');
      setAgentStatus('listo');
      setStatus(`Composición lista (${result.attempts} intento${result.attempts > 1 ? 's' : ''}).`);

      const rec: GenerationRecord = {
        id: newId(),
        createdAt: Date.now(),
        prompt: req.prompt,
        aspect: req.aspect,
        durationSec: req.durationSec,
        providerId: req.providerId,
        model: req.model,
        code: result.code,
        meta: result.meta,
        assetNames: result.assetNames,
      };
      await saveGeneration(rec);
      await refreshHistory();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('error');
      setAgentStatus('error');
      setStatus('');
    }
  }, [prompt, prefs, assets, refreshHistory]);

  const loadRecord = useCallback(
    (rec: GenerationRecord) => {
      setPrompt(rec.prompt);
      setCode(rec.code);
      setPhase('ready');
      setError('');
      setStatus('Composición cargada del historial.');
      try {
        const compiled = compileComposition(rec.code, rec.meta);
        setScene(() => compiled.Scene);
        setMeta({ ...compiled.meta, fps: 60 });
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setScene(null);
        setPhase('error');
      }
      setPrefs({
        aspect: rec.aspect,
        durationSec: rec.durationSec,
        providerId: rec.providerId,
        model: rec.model,
      });
    },
    [setPrefs],
  );

  const removeRecord = useCallback(
    async (id: string) => {
      await deleteGeneration(id);
      await refreshHistory();
    },
    [refreshHistory],
  );

  return {
    prefs,
    setPrefs,
    setAspect,
    provider,
    providers: PROVIDERS,
    phase,
    agentStatus,
    status,
    error,
    prompt,
    setPrompt,
    code,
    meta,
    Scene,
    vidramming,
    history,
    refreshHistory,
    loadRecord,
    removeRecord,
    assets,
    addAssets,
    removeAsset,
    clearAssets,
    playerRef,
    setPlayerRef,
    previewSurface,
    setPreviewSurface,
    refreshModels,
  };
}
