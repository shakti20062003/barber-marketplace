/**
 * Reads an image picked from the device, downscales it so the longest side
 * is at most `maxSide` px, and re-encodes it as JPEG — turning a 4-8 MB
 * phone photo into a ~100-300 KB data URL the API accepts (cap ~1.5 MB).
 * There's no object storage yet, so the data URL itself is what's saved.
 */
export async function fileToResizedDataUrl(file: File, maxSide = 1280, quality = 0.8): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Please choose an image file');

  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Could not read that image'));
      el.src = objectUrl;
    });

    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not process that image');
    ctx.fillStyle = '#fff'; // flatten transparent PNGs instead of going black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', quality);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Local (device-timezone) YYYY-MM-DD — `toISOString()` would give the UTC date. */
export function localDateIso(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Phone-friendly "9:30 AM" in the salon's timezone. */
export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: 'Asia/Kolkata',
  });
}

/** "09:00" → "9:00 AM" */
export function formatHhmm(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const suffix = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function directionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`;
}
