import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { isCancelled, toErrorMessage } from '../shared/lib/errors';
import { useExport } from '../features/export/useExport';
import { loadPrefs, savePrefs, type Prefs } from '../platform/prefs';

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

  // La exportación vive aquí (y no en PreviewArea) para poder bloquear el resto
  // de la UI: generar o cambiar la proporción a mitad de MP4 rompe los frames.
  const { exporting, progress, runExport, cancelExport } = useExport();

  const busyRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const exportingRef = useRef(exporting);
  const sceneRef = useRef(false);
  exportingRef.current = exporting;
  sceneRef.current = !!Scene;

  // Persistencia como efecto normal (nunca dentro de un updater de setState).
  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  const setPrefs = useCallback((patch: Partial<Prefs>) => {
    setPrefsState((prev: Prefs) => ({ ...prev, ...patch }));
  }, []);

  const setAspect = useCallback(
    (aspect: AspectRatioId) => {
      if (busyRef.current || exportingRef.current) return;
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

  const vidramming = useCallback(async () => {
    // Guarda de re-entrancia: un doble clic (o generar mientras exporta) no debe
    // disparar dos corridas compitiendo por code/meta/Scene.
    if (busyRef.current || exportingRef.current) return;
    busyRef.current = true;
    const controller = new AbortController();
    abortRef.current = controller;

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
      const result = await runVidramming(req, assets, setStatus, controller.signal);
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
      // Guardar en el historial NO debe convertir en error una generación válida:
      // si IndexedDB falla (modo privado/cuota) solo se avisa.
      try {
        await saveGeneration(rec);
        await refreshHistory();
      } catch (saveErr) {
        setStatus(
          (s) => `${s} Aviso: no se pudo guardar en el historial (${toErrorMessage(saveErr)}).`,
        );
      }
    } catch (e) {
      if (isCancelled(e)) {
        setPhase(sceneRef.current ? 'ready' : 'idle');
        setAgentStatus('listo');
        setStatus('Generación cancelada.');
      } else {
        setError(toErrorMessage(e));
        setPhase('error');
        setAgentStatus('error');
        setStatus('');
      }
    } finally {
      busyRef.current = false;
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, [prompt, prefs, assets, refreshHistory]);

  const cancelVidramming = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const loadRecord = useCallback(
    (rec: GenerationRecord) => {
      if (busyRef.current || exportingRef.current) return;
      setPrompt(rec.prompt);
      setCode(rec.code);
      setPhase('ready');
      setError('');
      setAgentStatus('listo');
      setStatus('Composición cargada del historial.');
      try {
        const compiled = compileComposition(rec.code, rec.meta);
        setScene(() => compiled.Scene);
        setMeta(rec.meta);
      } catch (e) {
        setError(toErrorMessage(e));
        setScene(null);
        setMeta(null);
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
      if (busyRef.current || exportingRef.current) return;
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
    cancelVidramming,
    history,
    refreshHistory,
    loadRecord,
    removeRecord,
    assets,
    addAssets,
    removeAsset,
    clearAssets,
    exporting,
    progress,
    runExport,
    cancelExport,
  };
}
