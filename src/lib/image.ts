const SIZE = 256;
const MAX_FILE = 15 * 1024 * 1024;
const MAX_CHARS = 100_000; // the server accepts up to 150k characters of base64

/**
 * A picked photo becomes a small centred square JPEG data URL. Re-drawing it on a canvas also drops
 * anything else the file carried (location and other metadata).
 */
export async function avatarFromFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Hãy chọn một file ảnh');
  if (file.size > MAX_FILE) throw new Error('Ảnh quá lớn, hãy chọn ảnh nhỏ hơn 15 MB');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Không đọc được ảnh này, hãy thử ảnh JPG hoặc PNG');
  }
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Trình duyệt không xử lý được ảnh');
  ctx.fillStyle = '#fff'; // transparent PNGs would turn black in a JPEG
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();
  for (const q of [0.88, 0.75, 0.6, 0.45]) {
    const url = canvas.toDataURL('image/jpeg', q);
    if (url.length <= MAX_CHARS) return url;
  }
  throw new Error('Ảnh quá nặng, hãy chọn ảnh khác');
}
