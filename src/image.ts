// Client-side photo compression: fits the picture into a small JPEG data URL
// so localStorage (and any future backend) stores kilobytes, not megabytes.
const MAX_DIM = 1000;
const RETRY_DIM = 640;
const TARGET_BYTES = 300 * 1024;

function drawToDataUrl(img: HTMLImageElement, maxDim: number, quality: number): string {
  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', quality);
}

export function compressImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      try {
        let out = drawToDataUrl(img, MAX_DIM, 0.72);
        if (out.length > TARGET_BYTES) out = drawToDataUrl(img, RETRY_DIM, 0.6);
        resolve(out);
      } catch (e) {
        reject(e instanceof Error ? e : new Error('Could not process that image'));
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('That file does not look like an image'));
    };
    img.src = url;
  });
}
