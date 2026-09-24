export type AspectRatioId = '1:1' | '16:9' | '9:16' | '4:5';

export interface AspectRatioOption {
  id: AspectRatioId;
  label: string;
  width: number;
  height: number;
}

export const FPS_FIXED = 60 as const;

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { id: '16:9', label: '16:9 — Horizontal', width: 1920, height: 1080 },
  { id: '9:16', label: '9:16 — Vertical', width: 1080, height: 1920 },
  { id: '1:1', label: '1:1 — Cuadrado', width: 1080, height: 1080 },
  { id: '4:5', label: '4:5 — Retrato', width: 1080, height: 1350 },
];

export const IMAGE_EXPORT_TYPES = [
  { id: 'image/png', label: 'PNG', ext: 'png' },
  { id: 'image/jpeg', label: 'JPEG', ext: 'jpg' },
  { id: 'image/webp', label: 'WebP', ext: 'webp' },
] as const;

export type ImageExportType = (typeof IMAGE_EXPORT_TYPES)[number]['id'];

export interface CompositionMeta {
  fps: number;
  durationInFrames: number;
  width: number;
  height: number;
}

export interface GenerateRequest {
  prompt: string;
  aspect: AspectRatioId;
  durationSec: number;
  providerId: string;
  model: string;
}

export interface GenerationRecord {
  id: string;
  createdAt: number;
  prompt: string;
  aspect: AspectRatioId;
  durationSec: number;
  providerId: string;
  model: string;
  code: string;
  meta: CompositionMeta;
  assetNames?: string[];
}

export type ExportFormat = 'mp4' | 'image';

export interface ExportProgress {
  format: ExportFormat | 'image-png' | 'image-jpeg' | 'image-webp';
  phase: 'captura' | 'codificando' | 'listo' | 'error';
  current: number;
  total: number;
  message?: string;
}

export type LlmRole = 'system' | 'user' | 'assistant';

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; mediaType: string; dataBase64: string };

export interface LlmMessage {
  role: LlmRole;
  content: string | LlmContentPart[];
}

export type AssetKind = 'image' | 'text';

export interface AssetFile {
  id: string;
  name: string;
  mime: string;
  kind: AssetKind;
  size: number;
  /** data URI for images; plain text for text assets */
  data: string;
}
