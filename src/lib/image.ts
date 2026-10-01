/** Shrinks a photo from the camera to a small JPEG (data URL) so it is cheap to store and to load. */
export async function shrinkImage(file: File, maxSide = 1024, maxBytes = 140_000): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no canvas');
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.8;
  let url = canvas.toDataURL('image/jpeg', quality);
  while (url.length * 0.75 > maxBytes && quality > 0.3) {
    quality -= 0.1;
    url = canvas.toDataURL('image/jpeg', quality);
  }
  return url;
}
