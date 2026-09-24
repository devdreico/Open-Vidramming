import type { AssetFile } from '../../shared/types';

const TEXT_MIME_PREFIX = ['text/', 'application/json', 'application/javascript'];
const TEXT_EXT = [
  'md','txt','json','ts','tsx','js','jsx','css','html','svg','csv','yml','yaml','xml','graphql','py','rs','go','sh','env',
];

const IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp']);
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'webp'];
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TEXT_BYTES = 512 * 1024;

export function classifyFile(name: string, mime: string): AssetFile['kind'] | null {
  const lower = name.toLowerCase();
  const ext = lower.includes('.') ? lower.split('.').pop()! : '';
  if (IMAGE_MIME.has(mime) || IMAGE_EXT.includes(ext)) return 'image';
  if (TEXT_MIME_PREFIX.some((p) => mime.startsWith(p)) || TEXT_EXT.includes(ext)) return 'text';
  if (!mime || mime === 'application/octet-stream') {
    if (TEXT_EXT.includes(ext)) return 'text';
    if (IMAGE_EXT.includes(ext)) return 'image';
  }
  return null;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error('No se pudo leer el archivo'));
    r.readAsDataURL(file);
  });
}

function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export async function fileToAsset(file: File): Promise<AssetFile> {
  const kind = classifyFile(file.name, file.type);
  if (!kind) {
    throw new Error(
      `Formato no soportado: ${file.name}. Acepta imágenes PNG/JPEG/WebP o archivos de texto/código.`,
    );
  }
  if (kind === 'image' && file.size > MAX_IMAGE_BYTES) {
    throw new Error(`${file.name}: imagen demasiado grande (máx 8 MB).`);
  }
  if (kind === 'text' && file.size > MAX_TEXT_BYTES) {
    throw new Error(`${file.name}: archivo de texto demasiado grande (máx 512 KB).`);
  }

  if (kind === 'image') {
    const data = await readFileAsDataUrl(file);
    return {
      id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
      name: file.name,
      mime: file.type || 'image/png',
      kind,
      size: file.size,
      data,
    };
  }

  const text = await readFileAsText(file);
  return {
    id: `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: file.name,
    mime: file.type || 'text/plain',
    kind,
    size: file.size,
    data: text,
  };
}

export function splitDataUri(dataUri: string): { mediaType: string; dataBase64: string } {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUri);
  if (!m) throw new Error('data URI inválida');
  return { mediaType: m[1], dataBase64: m[2] };
}
