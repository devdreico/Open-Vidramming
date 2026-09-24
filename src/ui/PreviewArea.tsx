import { useCallback, useEffect, useRef, useState } from 'react';
import { Player, type PlayerRef } from '@remotion/player';
import type { useAppController } from '../state/useAppController';
import type { ImageExportType } from '../shared/types';
import { IMAGE_EXPORT_TYPES, ASPECT_RATIOS } from '../shared/types';
import { useExport } from '../features/export/useExport';
import { Button } from '../shared/ui/Button';
import { Spinner } from '../shared/ui/Spinner';
import { EmptyState } from '../shared/ui/EmptyState';
import { ErrorBox } from '../shared/ui/ErrorBox';
import { ProgressBar } from '../shared/ui/ProgressBar';
import { AgentBadge } from '../shared/ui/AgentBadge';

type Ctrl = ReturnType<typeof useAppController>;

export function PreviewArea({ ctrl }: { ctrl: Ctrl }) {
  const {
    Scene,
    meta,
    phase,
    status,
    error,
    prefs,
    code,
    agentStatus,
    setPlayerRef,
    setPreviewSurface,
    setAspect,
  } = ctrl;

  const playerHostRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const localPlayer = useRef<PlayerRef | null>(null);
  const { exporting, progress, runExport } = useExport();
  const [imageType, setImageType] = useState<ImageExportType>('image/png');

  useEffect(() => {
    setPreviewSurface(surfaceRef.current);
  }, [Scene, setPreviewSurface]);

  useEffect(() => {
    if (localPlayer.current) setPlayerRef(localPlayer.current);
  }, [Scene, setPlayerRef]);

  const doExport = useCallback(
    async (format: 'mp4' | ImageExportType) => {
      await runExport(format, localPlayer.current, surfaceRef.current, meta);
    },
    [meta, runExport],
  );

  return (
    <main className="flex min-w-0 flex-1 flex-col bg-white">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-950/8 px-5 py-3">
        <div className="flex flex-wrap items-center gap-3">
          <img
            src="/openvg-logo.jpeg"
            alt="Open VG"
            className="h-9 w-9 rounded-xl object-cover shadow-glass ring-1 ring-ink-950/10"
            width={36}
            height={36}
          />
          <span className="rounded-full bg-ink-950 px-2.5 py-1 text-[10px] font-bold uppercase tracking-widest text-white">
            Open VG
          </span>
          <h1 className="text-sm font-medium text-ink-800">Open Vidramming</h1>
          <AgentBadge status={agentStatus} />
          {meta && (
            <span className="text-xs text-ink-400">
              {meta.width}×{meta.height} · {meta.fps} fps · {meta.durationInFrames} frames
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="field-label mb-0 mr-1">Proporción</label>
          <select
            value={prefs.aspect}
            onChange={(e) => setAspect(e.target.value as typeof prefs.aspect)}
            className="input w-auto rounded-full py-1.5 pl-3 pr-8 text-xs"
            aria-label="Proporción de visualización previa"
          >
            {ASPECT_RATIOS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.id}
              </option>
            ))}
          </select>

          <div className="mx-1 h-6 w-px bg-ink-950/10" />

          <Button
            variant="primary"
            size="sm"
            disabled={!meta || exporting}
            onClick={() => void doExport('mp4')}
            title="Exportar video MP4 a 60 fps"
          >
            MP4 ↓ 60fps
          </Button>

          <select
            value={imageType}
            onChange={(e) => setImageType(e.target.value as ImageExportType)}
            className="input w-auto rounded-full py-1.5 pl-3 pr-8 text-xs"
            aria-label="Formato de imagen"
            disabled={!meta || exporting}
          >
            {IMAGE_EXPORT_TYPES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>

          <Button
            variant="glass"
            size="sm"
            disabled={!meta || exporting}
            onClick={() => void doExport(imageType)}
            title="Exportar frame actual como imagen"
          >
            Imagen ↓
          </Button>
        </div>
      </header>

      <div className="flex flex-1 items-center justify-center overflow-auto p-6">
        {phase === 'generating' && (
          <div className="max-w-md text-center">
            <Spinner label={status || 'Generando…'} />
            <p className="mt-3 text-xs text-ink-500">
              OPENVG-AGENT escribe una composición Remotion y la compila en el navegador.
            </p>
          </div>
        )}

        {phase === 'idle' && !Scene && (
          <EmptyState icon="🎬">
            Elige proporción, escribe el prompt e indexa archivos; pulsa{' '}
            <strong className="text-ink-900">VIDRAMMING</strong>.
          </EmptyState>
        )}

        {error && (phase === 'error' || (phase === 'ready' && !Scene)) && <ErrorBox>{error}</ErrorBox>}

        {Scene && meta && phase !== 'generating' && (
          <div
            ref={playerHostRef}
            className="overflow-hidden rounded-3xl shadow-glass-lg ring-1 ring-ink-950/10"
            style={{
              width: 'min(100%, 900px)',
              aspectRatio: `${meta.width} / ${meta.height}`,
            }}
          >
            {/* Pure composition surface for export — controls sit outside via Player props */}
            <div ref={surfaceRef} className="h-full w-full overflow-hidden bg-black">
              <Player
                ref={(r: PlayerRef | null) => {
                  localPlayer.current = r;
                  if (r) setPlayerRef(r);
                }}
                component={Scene}
                durationInFrames={meta.durationInFrames}
                compositionWidth={meta.width}
                compositionHeight={meta.height}
                fps={meta.fps}
                controls
                loop
                acknowledgeRemotionLicense
                style={{ width: '100%', height: '100%' }}
                inputProps={{}}
              />
            </div>
          </div>
        )}
      </div>

      {(exporting || progress) && (
        <div className="border-t border-ink-950/8 px-5 py-3">
          <ProgressBar
            value={
              progress && progress.total > 0
                ? Math.round((progress.current / progress.total) * 100)
                : exporting
                  ? 5
                  : 100
            }
            label={
              progress?.phase === 'error'
                ? progress.message
                : `${progress?.message ?? ''}${exporting ? ' — no cierres la pestaña.' : ''}`
            }
          />
        </div>
      )}

      {code && phase === 'ready' && (
        <details className="border-t border-ink-950/8 px-5 py-2">
          <summary className="cursor-pointer text-xs text-ink-500 hover:text-ink-800">
            Ver código generado (TSX)
          </summary>
          <pre className="mt-2 max-h-48 overflow-auto rounded-2xl bg-ink-950 p-3 font-mono text-[11px] leading-relaxed text-emerald-200/90">
            {code}
          </pre>
        </details>
      )}

      <footer className="border-t border-ink-950/8 px-5 py-2 text-[11px] text-ink-400">
        {prefs.aspect} · {prefs.durationSec}s · 60 fps · {prefs.providerId}/{prefs.model}
        {' · '}
        export MP4 60fps + PNG/JPEG/WebP
      </footer>
    </main>
  );
}
