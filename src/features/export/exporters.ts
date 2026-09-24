import { toPng } from 'html-to-image';
import type { PlayerRef } from '@remotion/player';
import type { CompositionMeta, ExportProgress, ImageExportType } from '../../shared/types';

export type ProgressFn = (p: ExportProgress) => void;

function seekTo(player: PlayerRef, frame: number): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      player.removeEventListener('frameupdate', onFrame);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    };
    const onFrame = (e: { detail: { frame: number } }) => {
      if (e.detail.frame === frame) finish();
    };
    player.addEventListener('frameupdate', onFrame);
    player.seekTo(frame);
    setTimeout(finish, 200);
  });
}

/** Capture the pure composition area (no player controls) into a data URL at export resolution. */
async function captureFrame(
  player: PlayerRef,
  surface: HTMLElement,
  frame: number,
  meta: CompositionMeta,
): Promise<string> {
  await seekTo(player, frame);
  return toPng(surface, {
    width: meta.width,
    height: meta.height,
    pixelRatio: 1,
    cacheBust: false,
  });
}

export async function exportStillImage(
  player: PlayerRef,
  surface: HTMLElement,
  meta: CompositionMeta,
  mime: ImageExportType,
  onProgress?: ProgressFn,
  frame?: number,
): Promise<Blob> {
  const targetFrame = frame ?? Math.max(0, player.getCurrentFrame());
  onProgress?.({
    format: mime === 'image/png' ? 'image-png' : mime === 'image/jpeg' ? 'image-jpeg' : 'image-webp',
    phase: 'captura',
    current: 1,
    total: 1,
    message: `Capturando frame ${targetFrame}…`,
  });
  const wasPlaying = false;
  player.pause();
  const dataUrl = await captureFrame(player, surface, targetFrame, meta);
  if (wasPlaying) player.play();
  const blob = await (await fetch(dataUrl)).blob();
  const typed = await convertBlob(blob, mime);
  onProgress?.({
    format: mime === 'image/png' ? 'image-png' : mime === 'image/jpeg' ? 'image-jpeg' : 'image-webp',
    phase: 'listo',
    current: 1,
    total: 1,
  });
  return typed;
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

export async function exportMp4(
  player: PlayerRef,
  surface: HTMLElement,
  meta: CompositionMeta,
  onProgress?: ProgressFn,
): Promise<Blob> {
  player.pause();
  const urls: string[] = [];
  const total = meta.durationInFrames;

  for (let frame = 0; frame < total; frame++) {
    onProgress?.({
      format: 'mp4',
      phase: 'captura',
      current: frame + 1,
      total,
      message: `Capturando frame ${frame + 1}/${total}`,
    });
    urls.push(await captureFrame(player, surface, frame, meta));
  }

  onProgress?.({
    format: 'mp4',
    phase: 'codificando',
    current: 0,
    total: 100,
    message: 'Cargando ffmpeg.wasm…',
  });

  const { FFmpeg } = await import('@ffmpeg/ffmpeg');
  const { fetchFile, toBlobURL } = await import('@ffmpeg/util');
  const ffmpeg = new FFmpeg();
  const base = 'https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/esm';
  await ffmpeg.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });

  ffmpeg.on('progress', ({ progress }: { progress: number }) => {
    const pct = Math.min(100, Math.max(0, Math.round(progress * 100)));
    onProgress?.({
      format: 'mp4',
      phase: 'codificando',
      current: pct,
      total: 100,
      message: `Codificando MP4 60fps… ${pct}%`,
    });
  });

  const pad = Math.max(5, String(total).length);
  for (let i = 0; i < urls.length; i++) {
    const name = `frame_${String(i).padStart(pad, '0')}.png`;
    await ffmpeg.writeFile(name, await fetchFile(urls[i]));
    if (i % 15 === 0 || i === urls.length - 1) {
      onProgress?.({
        format: 'mp4',
        phase: 'codificando',
        current: Math.round((i / Math.max(1, urls.length)) * 50),
        total: 100,
        message: `Preparando frames ${i + 1}/${urls.length}`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
  }

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

  if (code !== 0) {
    throw new Error(`ffmpeg falló con código ${code}.`);
  }

  const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
  for (let i = 0; i < urls.length; i++) {
    await ffmpeg.deleteFile(`frame_${String(i).padStart(pad, '0')}.png`).catch(() => undefined);
  }
  await ffmpeg.deleteFile('out.mp4').catch(() => undefined);

  onProgress?.({ format: 'mp4', phase: 'listo', current: 100, total: 100, message: 'MP4 listo' });
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  return new Blob([copy], { type: 'video/mp4' });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
