export type MediaType = 'image/jpeg' | 'image/png' | 'image/webp';

const MAX_ORIGINAL_BYTES = 10 * 1024 * 1024;
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.8;
const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

export function isAcceptedImageType(type: string): boolean {
  return ACCEPTED_TYPES.has(type.toLowerCase());
}

export function rejectIfTooLarge(file: File): string | null {
  if (file.size > MAX_ORIGINAL_BYTES) {
    return 'That image is larger than 10 MB. Please choose a smaller image.';
  }
  return null;
}

type JpegPayload = { image: string; media_type: 'image/jpeg' };

function encodeCanvas(canvas: HTMLCanvasElement): JpegPayload {
  const image = canvas.toDataURL('image/jpeg', JPEG_QUALITY);
  if (!image.startsWith('data:image/jpeg')) {
    throw new Error('The image could not be encoded as JPEG.');
  }
  return { image, media_type: 'image/jpeg' };
}

function drawScaled(source: CanvasImageSource, width: number, height: number): HTMLCanvasElement {
  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('The image could not be processed in this browser.');
  }
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas;
}

export function resizeImageFromSource(
  source: CanvasImageSource,
  width: number,
  height: number,
): JpegPayload {
  return encodeCanvas(drawScaled(source, width, height));
}

export function resizeImage(file: File): Promise<{ image: string; media_type: MediaType }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The image could not be read.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('That file is not a usable image.'));
      image.onload = () => {
        try {
          resolve(resizeImageFromSource(image, image.naturalWidth, image.naturalHeight));
        } catch (error) {
          reject(error instanceof Error ? error : new Error('The image could not be prepared.'));
        }
      };
      image.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
