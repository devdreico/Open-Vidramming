import { useEffect, useRef, useState } from 'react';
import type { useAppController } from '../state/useAppController';
import { fileToAsset } from '../features/assets/assetsStore';
import { Button } from '../shared/ui/Button';
import { Field } from '../shared/ui/Field';
import { Modal } from '../shared/ui/Modal';
import { ErrorBox } from '../shared/ui/ErrorBox';
import { setKey, loadKeys } from '../features/providers/keys';
import { modelsForProvider, refreshModelCatalog } from '../features/providers/modelCatalog';
import { ASPECT_RATIOS } from '../shared/types';

type Ctrl = ReturnType<typeof useAppController>;

const DURATIONS = [2, 3, 5, 8, 10, 15, 20];

export function Sidebar({ ctrl }: { ctrl: Ctrl }) {
  const {
    prefs,
    setPrefs,
    setAspect,
    provider,
    providers,
    phase,
    error,
    status,
    vidramming,
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
    refreshModels,
  } = ctrl;

  const [showKeys, setShowKeys] = useState(false);
  const [assetError, setAssetError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const busy = phase === 'generating';
  const { models, source } = modelsForProvider(provider);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  useEffect(() => {
    if (!models.some((m) => m.id === prefs.model)) {
      setPrefs({ model: provider.defaultModel });
    }
    void refreshModelCatalog(prefs.providerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.providerId, source]);

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

  return (
    <aside className="glass-panel flex h-full w-full flex-col gap-4 overflow-y-auto rounded-none border-y-0 border-l-0 p-4 lg:w-[360px] lg:rounded-r-none">
      <div>
        <Field label="Prompt de seguimiento">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={5}
            placeholder='Ej: Título "Open VG" con rebote, fondo degradado azul profundo y partículas sutiles…'
            className="input resize-y"
            disabled={busy}
          />
        </Field>
      </div>

      <div className="grid grid-cols-1 gap-3">
        <Field label="Proporción (se aplica antes de Vidramming)">
          <select
            value={prefs.aspect}
            onChange={(e) => setAspect(e.target.value as typeof prefs.aspect)}
            className="input"
            disabled={busy}
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
            disabled={busy}
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
              const p = providers.find((x) => x.id === e.target.value);
              setPrefs({ providerId: e.target.value, model: p?.defaultModel ?? prefs.model });
            }}
            className="input"
            disabled={busy}
          >
            {providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label={`Modelo${source === 'api' ? ' · catálogo automático' : ''}`}>
          <div className="flex gap-2">
            <select
              value={prefs.model}
              onChange={(e) => setPrefs({ model: e.target.value })}
              className="input flex-1"
              disabled={busy}
            >
              {models.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Button
              variant="glass"
              size="sm"
              onClick={() => void refreshModels()}
              title="Actualizar modelos desde la API"
              disabled={busy}
            >
              ↻
            </Button>
          </div>
        </Field>
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
        <Button variant="glass" onClick={() => setShowKeys(true)}>
          Configurar API keys…
        </Button>
        <Button variant="primary" onClick={() => void vidramming()} disabled={busy}>
          {busy ? 'VIDRAMMING…' : 'VIDRAMMING'}
        </Button>
      </div>

      {status && !error && (
        <p className="text-xs text-ink-500" aria-live="polite">
          {status}
        </p>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}

      <HistorySection history={history} onLoad={loadRecord} onRemove={removeRecord} onRefresh={refreshHistory} />

      {showKeys && <KeysModal onClose={() => setShowKeys(false)} />}
    </aside>
  );
}

function HistorySection({
  history,
  onLoad,
  onRemove,
  onRefresh,
}: {
  history: Ctrl['history'];
  onLoad: Ctrl['loadRecord'];
  onRemove: (id: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  return (
    <div className="mt-1 border-t border-ink-950/8 pt-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="field-label mb-0">Historial</h3>
        <button type="button" onClick={() => void onRefresh()} className="btn-ghost text-xs text-vg-600">
          Actualizar
        </button>
      </div>
      {history.length === 0 ? (
        <p className="text-xs text-ink-400">Aún no hay generaciones guardadas.</p>
      ) : (
        <ul className="max-h-56 space-y-2 overflow-y-auto pr-1">
          {history.slice(0, 20).map((rec) => (
            <li key={rec.id} className="rounded-2xl border border-white/60 bg-white/60 p-2.5 shadow-glass">
              <button type="button" onClick={() => onLoad(rec)} className="block w-full text-left text-xs text-ink-800 hover:text-vg-700">
                <span className="line-clamp-2">{rec.prompt || '(sin prompt)'}</span>
                <span className="mt-1 block text-[11px] text-ink-400">
                  {rec.aspect} · {rec.durationSec}s · 60fps · {new Date(rec.createdAt).toLocaleString('es')}
                  {rec.assetNames?.length ? ` · ${rec.assetNames.length} archivos` : ''}
                </span>
              </button>
              <button
                type="button"
                onClick={() => void onRemove(rec.id)}
                className="btn-ghost mt-0.5 text-[11px] text-red-500"
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

function KeysModal({ onClose }: { onClose: () => void }) {
  const [keys, setKeys] = useState(() => loadKeys());
  const providers = [
    { id: 'openai', label: 'OpenAI' },
    { id: 'anthropic', label: 'Anthropic (Claude)' },
    { id: 'gemini', label: 'Google Gemini' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'xai', label: 'xAI (Grok)' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'cohere', label: 'Cohere' },
    { id: 'groq', label: 'Groq' },
    { id: 'together', label: 'Together AI' },
    { id: 'fireworks', label: 'Fireworks AI' },
    { id: 'perplexity', label: 'Perplexity' },
    { id: 'openrouter', label: 'OpenRouter' },
  ];

  return (
    <Modal title="API keys" onClose={onClose}>
      <p className="mb-4 text-xs text-ink-500">
        Se guardan solo en este navegador (localStorage). Las llamadas pasan por el proxy local de Vite.
      </p>
      <div className="space-y-3">
        {providers.map((p) => (
          <label key={p.id} className="block">
            <span className="field-label">{p.label}</span>
            <input
              type="password"
              value={keys[p.id] ?? ''}
              onChange={(e) => {
                const next = { ...keys, [p.id]: e.target.value };
                setKeys(next);
              }}
              onBlur={(e) => setKey(p.id, e.target.value)}
              placeholder="API key"
              className="input font-mono"
              autoComplete="off"
            />
          </label>
        ))}
      </div>
      <div className="mt-5 flex justify-end">
        <Button variant="primary" onClick={onClose}>
          Guardar y cerrar
        </Button>
      </div>
    </Modal>
  );
}
