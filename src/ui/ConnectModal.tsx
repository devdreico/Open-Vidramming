import { useMemo, useState } from 'react';
import { Modal } from '../shared/ui/Modal';
import { Button } from '../shared/ui/Button';
import { Field } from '../shared/ui/Field';
import { cn } from '../shared/lib/cn';
import { PROVIDERS, providerById, type ProviderDef } from '../features/providers/definitions';
import { hasKey, loadKeys, setKey } from '../features/providers/keys';
import { testConnection } from '../features/providers/chat';
import { modelsForProviderId, SOURCE_LABEL, clearProviderCatalog } from '../features/providers/modelCatalog';
import { useModelCatalog } from '../features/providers/useModelCatalog';
import type { Prefs } from '../platform/prefs';

type Step = 'providers' | 'key' | 'models';

const STEPS: Step[] = ['providers', 'key', 'models'];
const STEP_LABELS: Record<Step, string> = {
  providers: '1 · Proveedor',
  key: '2 · API key',
  models: '3 · Modelo',
};

function safeProvider(id: string): ProviderDef {
  try {
    return providerById(id);
  } catch {
    return PROVIDERS[0];
  }
}

function hostname(url?: string): string {
  if (!url) return '';
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function ConnectModal({
  prefs,
  setPrefs,
  onClose,
  onKeysChanged,
}: {
  prefs: Prefs;
  setPrefs: (patch: Partial<Prefs>) => void;
  onClose: () => void;
  /** Cambió el mapa de keys: el catálogo del sidebar debe refrescarse. */
  onKeysChanged: () => void;
}) {
  const [step, setStep] = useState<Step>('providers');
  const [selectedId, setSelectedId] = useState(prefs.providerId);
  const [providerQuery, setProviderQuery] = useState('');
  const [localKey, setLocalKey] = useState(() => loadKeys()[prefs.providerId] ?? '');
  const [showKey, setShowKey] = useState(false);
  const [conn, setConn] = useState<{ ok: boolean; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [keyToken, setKeyToken] = useState(0);
  const [modelQuery, setModelQuery] = useState('');

  const provider = safeProvider(selectedId);
  const keySaved = hasKey(selectedId);
  const canContinue = localKey.trim().length > 0 || keySaved;
  const catalog = useModelCatalog(selectedId, keyToken);

  const filteredProviders = useMemo(() => {
    const q = providerQuery.trim().toLowerCase();
    return PROVIDERS.filter(
      (p) => !q || p.label.toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [providerQuery]);

  const filteredModels = useMemo(() => {
    const q = modelQuery.trim().toLowerCase();
    if (!q) return catalog.models;
    return catalog.models.filter(
      (m) => m.id.toLowerCase().includes(q) || m.label.toLowerCase().includes(q),
    );
  }, [catalog.models, modelQuery]);

  const stepIndex = STEPS.indexOf(step);

  const openProvider = (p: ProviderDef) => {
    setSelectedId(p.id);
    setLocalKey(loadKeys()[p.id] ?? '');
    setShowKey(false);
    setConn(null);
    setStep('key');
  };

  /** `false` si el navegador no dejó escribir en localStorage (cuota/modo privado). */
  const saveKey = (): boolean => {
    const saved = setKey(selectedId, localKey.trim());
    if (!saved) {
      setConn({
        ok: false,
        message: 'No se pudo guardar la key: localStorage está lleno o bloqueado por el navegador.',
      });
      return false;
    }
    setKeyToken((t) => t + 1);
    onKeysChanged();
    return true;
  };

  const onContinue = () => {
    if (localKey.trim() && !saveKey()) return;
    setStep('models');
  };

  const onTest = async () => {
    setTesting(true);
    setConn(null);
    const changed = !!localKey.trim() && localKey.trim() !== (loadKeys()[selectedId] ?? '');
    if (changed && !saveKey()) {
      setTesting(false);
      return;
    }
    try {
      const result = await testConnection(selectedId);
      setConn(result);
      if (result.ok && !changed) {
        setKeyToken((t) => t + 1);
        onKeysChanged();
      }
    } finally {
      setTesting(false);
    }
  };

  const pickModel = (modelId: string) => {
    setPrefs({ providerId: selectedId, model: modelId });
    onClose();
  };

  return (
    <Modal title="Conectar proveedor" size="lg" onClose={onClose}>
      <div className="mb-4 flex gap-1.5">
        {STEPS.map((s) => (
          <div key={s} className="flex-1">
            <div
              className={cn(
                'h-1 rounded-full',
                STEPS.indexOf(s) <= stepIndex ? 'bg-ink-950/70' : 'bg-ink-950/10',
              )}
            />
            <span
              className={cn(
                'mt-1 block text-[10px] font-semibold uppercase tracking-wide',
                s === step ? 'text-ink-800' : 'text-ink-400',
              )}
            >
              {STEP_LABELS[s]}
            </span>
          </div>
        ))}
      </div>

      {step === 'providers' && (
        <div>
          <Field label="Buscar proveedor">
            <input
              autoFocus
              value={providerQuery}
              onChange={(e) => setProviderQuery(e.target.value)}
              placeholder="openai, gemini, groq…"
              className="input"
              spellCheck={false}
            />
          </Field>
          <ul className="mt-3 max-h-[46vh] space-y-1.5 overflow-y-auto pr-1">
            {filteredProviders.map((p) => {
              const connected = hasKey(p.id);
              const snap = modelsForProviderId(p.id);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => openProvider(p)}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl border border-white/60 bg-white/60 px-3 py-2.5 text-left shadow-glass backdrop-blur-md transition hover:border-ink-950/15 hover:bg-white"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink-900">
                        {p.label}
                      </span>
                      <span className="block truncate text-[11px] text-ink-400">
                        {snap.models.length} modelos · {SOURCE_LABEL[snap.source]}
                      </span>
                    </span>
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                        connected
                          ? 'bg-emerald-50 text-emerald-700'
                          : 'bg-ink-950/5 text-ink-400',
                      )}
                    >
                      {connected ? 'Conectado ✓' : 'Sin key'}
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredProviders.length === 0 && (
              <li className="rounded-2xl border border-dashed border-ink-950/15 px-3 py-4 text-center text-xs text-ink-400">
                Ningún proveedor coincide con «{providerQuery}».
              </li>
            )}
          </ul>
          <p className="mt-3 text-[11px] leading-snug text-ink-400">
            Las keys se guardan en este navegador (localStorage) y las llamadas salen por el proxy
            local <code>/api/llm/:provider</code>.
          </p>
        </div>
      )}

      {step === 'key' && (
        <div>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink-950">{provider.label}</div>
              <div className="truncate text-[11px] text-ink-400">{provider.keyHint}</div>
            </div>
            <span
              className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                keySaved ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700',
              )}
            >
              {keySaved ? 'key guardada ✓' : 'sin key'}
            </span>
          </div>

          {(provider.keyUrl ?? provider.website) && (
            <a
              href={provider.keyUrl ?? provider.website}
              target="_blank"
              rel="noreferrer noopener"
              className="mb-3 inline-block text-[11px] text-vg-600 underline-offset-2 hover:underline"
            >
              Crear API key en {hostname(provider.keyUrl ?? provider.website)} ↗
            </a>
          )}

          <Field label="API key">
            <div className="flex gap-2">
              <input
                autoFocus
                type={showKey ? 'text' : 'password'}
                value={localKey}
                onChange={(e) => setLocalKey(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void onTest();
                }}
                placeholder="Pega tu API key"
                className="input font-mono"
                autoComplete="off"
                spellCheck={false}
              />
              <Button variant="glass" size="sm" onClick={() => setShowKey((v) => !v)}>
                {showKey ? 'Ocultar' : 'Ver'}
              </Button>
            </div>
          </Field>

          {conn && (
            <p
              role="status"
              className={cn(
                'mt-3 rounded-2xl px-3 py-2 text-xs backdrop-blur-md',
                conn.ok
                  ? 'border border-emerald-200/80 bg-emerald-50/70 text-emerald-800'
                  : 'border border-red-200/80 bg-red-50/70 text-red-700',
              )}
            >
              {conn.message}
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Button variant="glass" size="sm" onClick={() => void onTest()} disabled={testing}>
              {testing ? 'Probando…' : 'Probar conexión'}
            </Button>
            <Button variant="primary" size="sm" onClick={onContinue} disabled={!canContinue}>
              {localKey.trim() ? 'Guardar y continuar' : 'Continuar'}
            </Button>
            <Button variant="ghost" size="sm" onClick={onContinue}>
              Ver modelos
            </Button>
            {keySaved && (
              <button
                type="button"
                className="btn-ghost ml-auto text-[11px] text-red-500"
                onClick={() => {
                  setKey(selectedId, '');
                  clearProviderCatalog(selectedId);
                  setLocalKey('');
                  setKeyToken((t) => t + 1);
                  onKeysChanged();
                  setConn(null);
                }}
              >
                Quitar key
              </button>
            )}
          </div>

          <button
            type="button"
            className="btn-ghost mt-3 text-xs text-ink-500"
            onClick={() => setStep('providers')}
          >
            ← Cambiar de proveedor
          </button>
        </div>
      )}

      {step === 'models' && (
        <div>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-ink-950">{provider.label}</div>
              <div className="text-[11px] text-ink-400">
                {catalog.status === 'loading'
                  ? '⟳ Actualizando catálogo…'
                  : `${catalog.models.length} modelos · ${SOURCE_LABEL[catalog.source]}`}
              </div>
            </div>
            <Button
              variant="glass"
              size="sm"
              onClick={() => void catalog.refresh()}
              disabled={catalog.loading}
              title="Actualizar catálogo desde la API"
            >
              ↻
            </Button>
          </div>

          {catalog.error && (
            <p className="mb-3 rounded-2xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[11px] leading-snug text-amber-800">
              {catalog.error}
            </p>
          )}

          <Field label="Buscar modelo">
            <input
              value={modelQuery}
              onChange={(e) => setModelQuery(e.target.value)}
              placeholder="gpt-4o, claude, gemini…"
              className="input"
              spellCheck={false}
            />
          </Field>

          <ul className="mt-3 max-h-[40vh] space-y-1 overflow-y-auto pr-1">
            {filteredModels.map((m) => {
              const active =
                prefs.providerId === selectedId ? prefs.model === m.id : provider.defaultModel === m.id;
              return (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => pickModel(m.id)}
                    className={cn(
                      'flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-xs transition',
                      active
                        ? 'bg-ink-950 text-white'
                        : 'bg-white/70 text-ink-800 hover:bg-white',
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{m.label}</span>
                      <span
                        className={cn(
                          'block truncate font-mono text-[10px]',
                          active ? 'text-white/60' : 'text-ink-400',
                        )}
                      >
                        {m.id}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {m.vision && (
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide',
                            active ? 'bg-white/15 text-white/80' : 'bg-ink-950/5 text-ink-400',
                          )}
                        >
                          visión
                        </span>
                      )}
                      {active && <span className="text-[10px]">✓</span>}
                    </span>
                  </button>
                </li>
              );
            })}
            {filteredModels.length === 0 && (
              <li className="rounded-xl border border-dashed border-ink-950/15 px-3 py-4 text-center text-xs text-ink-400">
                Sin resultados para «{modelQuery}».
              </li>
            )}
          </ul>

          <div className="mt-4 flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" onClick={() => setStep('key')}>
              ← Volver
            </Button>
            <span className="text-[11px] text-ink-400">
              Pulsa un modelo para usarlo en el sidebar
            </span>
          </div>
        </div>
      )}
    </Modal>
  );
}
