import { ValidationError } from '@/services/errors';

const MAX_INPUT_BYTES = 15 * 1024 * 1024;

/** Réduit une photo (max 1280 px, JPEG) avant stockage — le prototype stockait l'original en base64. */
export async function compressImage(file: File, maxSize = 1280, quality = 0.72): Promise<string> {
  if (!file.type.startsWith('image/')) throw new ValidationError('Le fichier doit être une image.');
  if (file.size > MAX_INPUT_BYTES) throw new ValidationError('Image trop lourde (15 Mo maximum).');

  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new ValidationError('Image illisible.'));
      el.src = url;
    });
    const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new ValidationError('Traitement de l’image impossible sur cet appareil.');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(url);
  }
}
