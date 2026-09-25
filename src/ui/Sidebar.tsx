import { useMemo, useRef, useState } from 'react';
import type { useAppController } from '../state/useAppController';
import { fileToAsset } from '../features/assets/assetsStore';
import { Button } from '../shared/ui/Button';
import { Field } from '../shared/ui/Field';
import { ErrorBox } from '../shared/ui/ErrorBox';
import { hasKey } from '../features/providers/keys';
import { testConnection } from '../features/providers/chat';
import { SOURCE_LABEL } from '../features/providers/modelCatalog';
import { useModelCatalog } from '../features/providers/useModelCatalog';
import { ASPECT_RATIOS } from '../shared/types';
import { ConnectModal } from './ConnectModal';

type Ctrl = ReturnType<typeof useAppController>;

const DURATIONS = [2, 3, 5, 8, 10, 15, 20];

export function Sidebar({ ctrl }: { ctrl: Ctrl }) {
  const {
    prefs,
    setPrefs,
    setAspect,
    providers,
    phase,
    error,
    status,
    vidramming,
    cancelVidramming,
    prompt,
    setPrompt,
    assets,
    addAssets,
    removeAsset,
    clearAssets,
    history,
    refreshHistory,
    loadRecord,
    removeRecord,
    exporting,
  } = ctrl;

  const [showConnect, setShowConnect] = useState(false);
  const [assetError, setAssetError] = useState('');
  const [connState, setConnState] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [keyToken, setKeyToken] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = phase === 'generating';
  /** Nada que cambie composición/dimensión puede moverse mientras se genera o exporta. */
  const locked = busy || exporting;
  const catalog = useModelCatalog(prefs.providerId, keyToken);
  const keyReady = hasKey(prefs.providerId);

  /** El modelo elegido se conserva aunque no esté en el catálogo (p.ej. cache vencida). */
  const modelOptions = useMemo(() => {
    if (prefs.model && !catalog.models.some((m) => m.id === prefs.model)) {
      return [...catalog.models, { id: prefs.model, label: `${prefs.model} (elegido)` }];
    }
    return catalog.models;
  }, [catalog.models, prefs.model]);

  const catalogLine =
    catalog.status === 'loading'
      ? '⟳ Actualizando catálogo…'
      : catalog.error
        ? `⚠ ${catalog.error}`
        : catalog.source === 'api'
          ? `✓ ${catalog.models.length} modelos · ${SOURCE_LABEL.api}`
          : catalog.source === 'registry'
            ? `◇ ${catalog.models.length} modelos · ${SOURCE_LABEL.registry} (sin key o /models no disponible)`
            : `○ ${catalog.models.length} modelos · ${SOURCE_LABEL.default}`;

  const onFiles = async (fileList: FileList | null) => {
    if (!fileList?.length) return;
    setAssetError('');
    for (const file of Array.from(fileList)) {
      try {
        const asset = await fileToAsset(file);
        addAssets([asset]);
      } catch (e) {
        setAssetError(e instanceof Error ? e.message : String(e));
      }
    }
    if (fileInput.current) fileInput.current.value = '';
  };

  const onTest = async () => {
    setTesting(true);
    setConnState(null);
    try {
      const result = await testConnection(prefs.providerId);
      setConnState(result);
      if (result.ok) setKeyToken((v) => v + 1);
    } finally {
      setTesting(false);
    }
  };

  return (
    <aside className="glass-panel flex h-full w-full flex-col gap-4 overflow-y-auto rounded-none border-y-0 border-l-0 p-4 lg:w-[360px] lg:rounded-r-none">
      <div className="flex items-center gap-3 rounded-2xl border border-white/60 bg-white/60 p-2.5 shadow-glass backdrop-blur-md">
        <img
          src="/openvg-logo-triangular.jpeg"
          alt="Open VG"
          className="h-10 w-10 rounded-xl object-cover shadow-glass"
          width={40}
          height={40}
        />
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-ink-950">Open VG</div>
          <div className="truncate text-[11px] text-ink-500">Open Vidramming</div>
        </div>
      </div>

      <div>
        <Field label="Prompt de seguimiento">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder='Ej: Título "Open VG" con rebote, fondo degradado azul profundo y partículas sutiles…'
            className="input resize-y"
            disabled={locked}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Field label="Proporción (se aplica antes de Vidramming)">
          <select
            value={prefs.aspect}
            onChange={(e) => setAspect(e.target.value as typeof prefs.aspect)}
            className="input"
            disabled={locked}
          >
            {ASPECT_RATIOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label} ({a.width}×{a.height})
              </option>
            ))}
          </select>
        </Field>

        <Field label="Duración (s)">
          <select
            value={prefs.durationSec}
            onChange={(e) => setPrefs({ durationSec: Number(e.target.value) })}
            className="input"
            disabled={locked}
          >
            {DURATIONS.map((d) => (
              <option key={d} value={d}>
                {d}s
              </option>
            ))}
          </select>
        </Field>

        <p className="rounded-2xl border border-ink-950/10 bg-ink-950/[0.03] px-3 py-2 text-[11px] text-ink-500 backdrop-blur-md">
          Video export: <strong className="text-ink-800">MP4 · 60 fps fijo</strong>
        </p>

        <Field label="Proveedor LLM">
          <select
            value={prefs.providerId}
            onChange={(e) => {
              setConnState(null);
              const p = providers.find((x) => x.id === e.target.value);
              setPrefs({ providerId: e.target.value, model: p?.defaultModel ?? prefs.model });
            }}
            className="input"
            disabled={locked}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
                {hasKey(p.id) ? ' ✓' : ''}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Modelo · ${SOURCE_LABEL[catalog.source]}`}>
          <div className="flex gap-2">
            <select
              value={prefs.model}
              onChange={(e) => setPrefs({ model: e.target.value })}
              className="input flex-1"
              disabled={locked}
            >
              {modelOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button
              variant="glass"
              size="sm"
              onClick={() => void catalog.refresh()}
              title="Actualizar modelos desde la API"
              disabled={locked || catalog.loading}
            >
              {catalog.loading ? '…' : '↻'}
            </Button>
          </div>
          <p
            className={`mt-1.5 text-[11px] leading-snug ${
              catalog.error ? 'text-amber-700' : 'text-ink-400'
            }`}
            aria-live="polite"
          >
            {catalogLine}
            {catalog.error && (
              <button
                type="button"
                className="btn-ghost ml-1 px-1 py-0 text-[11px] text-vg-600 underline"
                onClick={() => void catalog.refresh()}
              >
                Reintentar
              </button>
            )}
          </p>
        </Field>

        <div className="flex items-center gap-2">
          <Button
            variant="glass"
            size="sm"
            onClick={() => void onTest()}
            disabled={locked || testing}
            className="flex-1"
          >
            {testing ? 'Probando…' : 'Probar conexión API'}
          </Button>
          <span
            className={`rounded-full px-2 py-1 text-[10px] font-semibold ${
              keyReady ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
            }`}
            title={keyReady ? 'API key guardada en este navegador' : 'Sin API key para el proveedor activo'}
          >
            {keyReady ? 'key ✓' : 'sin key'}
          </span>
        </div>

        {connState && (
          <p
            className={`rounded-2xl px-3 py-2 text-xs backdrop-blur-md ${
              connState.ok
                ? 'border border-emerald-200/80 bg-emerald-50/70 text-emerald-800'
                : 'border border-red-200/80 bg-red-50/70 text-red-700'
            }`}
            role="status"
          >
            {connState.message}
          </p>
        )}
      </div>

      {/* Assets */}
      <div className="rounded-2xl border border-white/60 bg-white/50 p-3 shadow-glass backdrop-blur-md">
        <div className="mb-2 flex items-center justify-between">
          <span className="field-label mb-0">Archivos indexados</span>
          {assets.length > 0 && (
            <button type="button" className="btn-ghost text-xs" onClick={clearAssets}>
              Limpiar
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          multiple
          className="hidden"
          accept="image/png,image/jpeg,image/webp,text/*,.md,.txt,.json,.ts,.tsx,.js,.css,.html,.svg,.csv"
          onChange={(e) => void onFiles(e.target.files)}
        />
        <Button variant="glass" size="sm" onClick={() => fileInput.current?.click()} className="w-full">
          + Añadir imágenes o texto
        </Button>
        <p className="mt-1.5 text-[11px] leading-snug text-ink-400">
          PNG · JPEG · WebP (visión) y docs/código para el LLM.
        </p>
        {assetError && <p className="mt-2 text-xs text-red-600">{assetError}</p>}
        {assets.length > 0 && (
          <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto">
            {assets.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-2 rounded-xl bg-white/70 px-2 py-1 text-xs text-ink-700"
              >
                <span className="truncate">
                  {a.kind === 'image' ? '🖼' : '📄'} {a.name}
                </span>
                <button
                  type="button"
                  className="btn-ghost px-1.5 py-0.5 text-xs text-red-500"
                  onClick={() => removeAsset(a.id)}
                  aria-label={`Quitar ${a.name}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <Button variant="glass" onClick={() => setShowConnect(true)}>
          Conectar proveedor…
        </Button>
        {busy ? (
          <Button variant="glass" onClick={cancelVidramming}>
            CANCELAR GENERACIÓN
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void vidramming()} disabled={locked}>
            VIDRAMMING
          </Button>
        )}
      </div>

      {status && !error && (
        <p className="text-xs text-ink-500" aria-live="polite">
          {status}
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}

      <HistorySection
        history={history}
        onLoad={loadRecord}
        onRemove={removeRecord}
        onRefresh={refreshHistory}
        disabled={locked}
      />

      {showConnect && (
        <ConnectModal
          prefs={prefs}
          setPrefs={setPrefs}
          onClose={() => setShowConnect(false)}
          onKeysChanged={() => setKeyToken((v) => v + 1)}
        />
      )}
    </aside>
  );
}

function HistorySection({
  history,
  onLoad,
  onRemove,
  onRefresh,
  disabled,
}: {
  history: Ctrl['history'];
  onLoad: Ctrl['loadRecord'];
  onRemove: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
  /** true mientras se genera o se exporta: cargar/borrar pisaría el estado activo. */
  disabled: boolean;
}) {
  return (
    <div className="mt-1 border-t border-ink-950/8 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="field-label mb-0">Historial</h3>
        <button
          type="button"
          onClick={() => void onRefresh()}
          className="btn-ghost text-xs text-vg-600"
          disabled={disabled}
        >
          Actualizar
        </button>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-ink-400">Aún no hay generaciones guardadas.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {history.slice(0, 20).map((rec) => (
            <li key={rec.id} className="rounded-2xl border border-white/60 bg-white/60 p-2.5 shadow-glass">
              <button
                type="button"
                onClick={() => onLoad(rec)}
                disabled={disabled}
                className="block w-full text-left text-xs text-ink-800 hover:text-vg-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="line-clamp-2">{rec.prompt || '(sin prompt)'}</span>
                <span className="mt-1 block text-[11px] text-ink-400">
                  {rec.aspect} · {rec.durationSec}s · 60fps · {new Date(rec.createdAt).toLocaleString('es')}
                  {rec.assetNames?.length ? ` · ${rec.assetNames.length} archivos` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onRemove(rec.id)}
                disabled={disabled}
                className="btn-ghost mt-0.5 text-[11px] text-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Eliminar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

