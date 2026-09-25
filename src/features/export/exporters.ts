import { toBlob } from 'html-to-image';
import type { PlayerRef } from '@remotion/player';
import type { CompositionMeta, ExportProgress, ImageExportType } from '../../shared/types';
import { CancelledError, isCancelled, toErrorMessage } from '../../shared/lib/errors';
import coreJsUrl from '@ffmpeg/core?url';
import coreWasmUrl from '@ffmpeg/core/wasm?url';

export type ProgressFn = (p: ExportProgress) => void;

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new CancelledError('Exportación cancelada.');
}

/**
 * Lleva el player al `frame` esperando a que el DOM se pinte de verdad.
 * - No depende solo de doble `requestAnimationFrame` (se congela con la pestaña
 *   en background): hay sondeo sobre `getCurrentFrame()` + watchdog de 2 s.
 * - Cancelable: un `abort` rechaza y no deja el bucle de export colgado.
 */
function seekTo(player: PlayerRef, frame: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new CancelledError('Exportación cancelada.'));
      return;
    }
    let done = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      player.removeEventListener('frameupdate', onFrame);
      if (pollTimer !== undefined) clearTimeout(pollTimer);
      if (settleTimer !== undefined) clearTimeout(settleTimer);
      signal?.removeEventListener('abort', onAbort);
    };
    const finish = () => {
      if (done) return;
      done = true;
      cleanup();
      resolve();
    };
    const fail = (err: unknown) => {
      if (done) return;
      done = true;
      cleanup();
      reject(err);
    };
    const onAbort = () => fail(new CancelledError('Exportación cancelada.'));
    const scheduleFinish = () => {
      if (done || settleTimer !== undefined) return;
      // Un frame de margen para que React/Remotion repinte antes de capturar.
      settleTimer = setTimeout(finish, 50);
    };
    const onFrame = (e: { detail: { frame: number } }) => {
      if (e.detail.frame === frame) scheduleFinish();
    };
    const deadline = performance.now() + 2_000;
    const poll = () => {
      if (done) return;
      if (player.getCurrentFrame() === frame) {
        scheduleFinish();
        return;
      }
      if (performance.now() > deadline) {
        finish();
        return;
      }
      pollTimer = setTimeout(poll, 16);
    };

    player.addEventListener('frameupdate', onFrame);
    signal?.addEventListener('abort', onAbort, { once: true });
    player.seekTo(frame);
    pollTimer = setTimeout(poll, 16);
  });
}

/** Captura el área pura de la composición (sin controles del player) como Blob. */
async function captureFrame(
  player: PlayerRef,
  surface: HTMLElement,
  frame: number,
  meta: CompositionMeta,
  signal?: AbortSignal,
): Promise<Blob> {
  await seekTo(player, frame, signal);
  throwIfAborted(signal);
  const blob = await toBlob(surface, {
    width: meta.width,
    height: meta.height,
    pixelRatio: 1,
    cacheBust: false,
  });
  if (!blob) throw new Error('No se pudo capturar el frame (toBlob devolvió null).');
  return blob;
}

export async function exportStillImage(
  player: PlayerRef,
  surface: HTMLElement,
  meta: CompositionMeta,
  mime: ImageExportType,
  onProgress?: ProgressFn,
  frame?: number,
  signal?: AbortSignal,
): Promise<Blob> {
  const targetFrame = frame ?? Math.max(0, player.getCurrentFrame());
  const fmt = mime === 'image/png' ? 'image-png' : mime === 'image/jpeg' ? 'image-jpeg' : 'image-webp';
  onProgress?.({
    format: fmt,
    phase: 'captura',
    current: 1,
    total: 1,
    message: `Capturando frame ${targetFrame}…`,
  });
  const wasPlaying = player.isPlaying();
  player.pause();
  try {
    const blob = await captureFrame(player, surface, targetFrame, meta, signal);
    const typed = await convertBlob(blob, mime);
    onProgress?.({ format: fmt, phase: 'listo', current: 1, total: 1 });
    return typed;
  } finally {
    if (wasPlaying) player.play();
  }
}

async function convertBlob(blob: Blob, mime: ImageExportType): Promise<Blob> {
  if (blob.type === mime) return blob;
  const bmp = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('No se pudo crear canvas.');
  if (mime === 'image/jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(bmp, 0, 0);
  bmp.close();
  const quality = mime === 'image/png' ? undefined : 0.92;
  return await new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob falló'))), mime, quality);
  });
}

/** ffmpeg.wasm primero: si no hay núcleo no tiene sentido capturar cientos de frames. */
async function loadFFmpeg() {
  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  const sources = [
    { coreURL: coreJsUrl, wasmURL: coreWasmUrl },
    {
      coreURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.js',
      wasmURL: 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm/ffmpeg-core.wasm',
    },
  ];
  let lastError: unknown;
  for (const src of sources) {
    try {
      await ffmpeg.load({
        coreURL: await toBlobURL(src.coreURL, 'text/javascript'),
        wasmURL: await toBlobURL(src.wasmURL, 'application/wasm'),
      });
      return ffmpeg;
    } catch (e) {
      lastError = e;
    }
  }
  try {
    ffmpeg.terminate();
  } catch {
    /* el load ni siquiera arrancó */
  }
  throw new Error(
    `No se pudo cargar ffmpeg.wasm (ni local ni por CDN): ${toErrorMessage(lastError)}`,
  );
}

export async function exportMp4(
  player: PlayerRef,
  surface: HTMLElement,
  meta: CompositionMeta,
  onProgress?: ProgressFn,
  signal?: AbortSignal,
): Promise<Blob> {
  throwIfAborted(signal);
  player.pause();

  if (document.visibilityState === 'hidden') {
    onProgress?.({
      format: 'mp4',
      phase: 'captura',
      current: 0,
      total: meta.durationInFrames * 2,
      message:
        'La pestaña está en segundo plano: manténla visible para que los frames se rendericen.',
    });
  }

  onProgress?.({
    format: 'mp4',
    phase: 'codificando',
    current: 0,
    total: meta.durationInFrames * 2,
    message: 'Cargando ffmpeg.wasm…',
  });
  const ffmpeg = await loadFFmpeg();

  try {
    ffmpeg.on('progress', ({ progress }: { progress: number }) => {
      const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
      const done = meta.durationInFrames + Math.round((pct / 100) * meta.durationInFrames);
      onProgress?.({
        format: 'mp4',
        phase: 'codificando',
        current: done,
        total: meta.durationInFrames * 2,
        message: `Codificando MP4 60fps… ${pct}%`,
      });
    });

    const total = meta.durationInFrames;
    const pad = Math.max(5, String(total).length);
    const nameOf = (i: number) => `frame_${String(i).padStart(pad, '0')}.png`;

    // Captura → FS de ffmpeg frame a frame: nunca acumulamos cientos de data-URLs en RAM.
    for (let frame = 0; frame < total; frame++) {
      throwIfAborted(signal);
      onProgress?.({
        format: 'mp4',
        phase: 'captura',
        current: frame + 1,
        total: total * 2,
        message: `Capturando frame ${frame + 1}/${total}`,
      });
      const blob = await captureFrame(player, surface, frame, meta, signal);
      await ffmpeg.writeFile(nameOf(frame), new Uint8Array(await blob.arrayBuffer()));
      if (frame % 15 === 0) {
        onProgress?.({
          format: 'mp4',
          phase: 'captura',
          current: frame + 1,
          total: total * 2,
          message: `Capturando frame ${frame + 1}/${total}`,
        });
        await new Promise((r) => setTimeout(r, 0));
      }
    }

    throwIfAborted(signal);
    onProgress?.({
      format: 'mp4',
      phase: 'codificando',
      current: total,
      total: total * 2,
      message: 'Codificando MP4 60fps…',
    });

    const code = await ffmpeg.exec([
      '-y',
      '-framerate',
      String(meta.fps),
      '-i',
      `frame_%0${pad}d.png`,
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '18',
      '-pix_fmt',
      'yuv420p',
      'out.mp4',
    ]);
    if (code !== 0) throw new Error(`ffmpeg falló con código ${code}.`);

    const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
    const copy = new Uint8Array(data.byteLength);
    copy.set(data);

    onProgress?.({
      format: 'mp4',
      phase: 'listo',
      current: total * 2,
      total: total * 2,
      message: 'MP4 listo',
    });
    return new Blob([copy], { type: 'video/mp4' });
  } catch (e) {
    if (isCancelled(e)) throw e instanceof CancelledError ? e : new CancelledError('Exportación cancelada.');
    throw e;
  } finally {
    // Libera el worker + la memoria WASM (FS incluida) en todos los caminos.
    try {
      ffmpeg.terminate();
    } catch {
      /* ya estaba terminado */
    }
  }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
