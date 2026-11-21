/**
 * Style Finder face analysis — runs 100% in the customer's browser. The
 * photo is never uploaded; only the resulting face-shape estimate is used.
 *
 * How it works:
 * 1. Google MediaPipe Face Landmarker (loaded from a CDN on first use, ~4 MB)
 *    finds 478 points on the face.
 * 2. We measure three proportions, in pixels:
 *      length / cheekbone width, jaw width / cheekbone width,
 *      forehead width / cheekbone width
 * 3. We compare them with typical proportions of the six classic face
 *    shapes and turn the distances into probabilities.
 * 4. A hairstyle's match % = Σ P(shape) × that style's suitability score for
 *    the shape (scores come from the catalogue, see database seed).
 *
 * This is styling guidance, not a guarantee — the UI says so.
 */

export type FaceShape = 'oval' | 'round' | 'square' | 'heart' | 'oblong' | 'diamond';

export const FACE_SHAPES: Record<FaceShape, { label: string; tip: string }> = {
  oval: { label: 'Oval', tip: 'Balanced proportions — most cuts suit you, so pick by lifestyle.' },
  round: { label: 'Round', tip: 'Height on top and shorter sides add length and definition.' },
  square: { label: 'Square', tip: 'A strong jaw — textured or slightly longer styles soften the angles.' },
  heart: { label: 'Heart', tip: 'Wider forehead, narrow chin — fringes and volume at the jaw balance it.' },
  oblong: { label: 'Oblong', tip: 'A longer face — fringes and width at the sides look best; avoid extra height.' },
  diamond: { label: 'Diamond', tip: 'Wide cheekbones — fringes and fuller sides at forehead/chin balance them.' },
};

// Typical [length/cheek, jaw/cheek, forehead/cheek] for each shape, as
// measured on MediaPipe's mesh (its top point sits below the hairline, so
// lengths read shorter than a tape measure would), and how much each
// proportion naturally varies.
const PROTOTYPES: Record<FaceShape, [number, number, number]> = {
  oval: [1.28, 0.8, 0.84],
  round: [1.12, 0.84, 0.84],
  square: [1.16, 0.92, 0.88],
  heart: [1.26, 0.72, 0.92],
  oblong: [1.42, 0.82, 0.84],
  diamond: [1.28, 0.74, 0.76],
};
const SPREAD: [number, number, number] = [0.08, 0.06, 0.06];

// MediaPipe face-mesh landmark indices.
const LM = {
  top: 10, // top of forehead (mesh edge)
  chin: 152,
  cheekL: 234,
  cheekR: 454,
  jawL: 172,
  jawR: 397,
  foreheadL: 54,
  foreheadR: 284,
  nose: 1,
};

const VISION_VERSION = '0.10.14';
const VISION_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/vision_bundle.mjs`;
const WASM_URL = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VISION_VERSION}/wasm`;
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export interface FaceAnalysis {
  shape: FaceShape;
  confidence: number; // 0–1, probability of the top shape
  probabilities: Record<FaceShape, number>;
}

/** What the scanner actually looked at — shown when a scan fails, for support. */
export interface ScanDiagnostics {
  preview: string | null; // small JPEG data URL of the image given to the detector
  details: string; // one line: device/browser, file, decoder, sizes, tries
}

export class FaceScanError extends Error {
  constructor(
    message: string,
    public diagnostics?: ScanDiagnostics,
  ) {
    super(message);
  }
}

function browserLabel(): string {
  const ua = navigator.userAgent;
  const device = /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : 'Other';
  const browser = /CriOS|Chrome\//.test(ua) && !/Edg\//.test(ua)
    ? 'Chrome'
    : /Edg\//.test(ua)
      ? 'Edge'
      : /FxiOS|Firefox\//.test(ua)
        ? 'Firefox'
        : /SamsungBrowser/.test(ua)
          ? 'Samsung'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Browser';
  const v = ua.match(/(?:Version|Chrome|CriOS|Firefox|FxiOS|SamsungBrowser)\/(\d+)/)?.[1];
  return `${device} ${browser}${v ? ' ' + v : ''}`;
}

/** Small preview of a canvas for the failure panel. */
function thumb(c: HTMLCanvasElement): string | null {
  try {
    const t = document.createElement('canvas');
    const k = 160 / Math.max(c.width, c.height);
    t.width = Math.max(1, Math.round(c.width * k));
    t.height = Math.max(1, Math.round(c.height * k));
    t.getContext('2d')!.drawImage(c, 0, 0, t.width, t.height);
    return t.toDataURL('image/jpeg', 0.7);
  } catch {
    return null;
  }
}

/** True when the decoded picture is (nearly) one flat colour — i.e. the browser failed to decode it. */
function looksBlank(c: HTMLCanvasElement): boolean {
  const t = document.createElement('canvas');
  t.width = 32;
  t.height = 32;
  const ctx = t.getContext('2d')!;
  ctx.drawImage(c, 0, 0, 32, 32);
  const d = ctx.getImageData(0, 0, 32, 32).data;
  let min = 255;
  let max = 0;
  for (let i = 0; i < d.length; i += 4) {
    const v = (d[i] + d[i + 1] + d[i + 2]) / 3;
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  return max - min < 8;
}

type Landmark = { x: number; y: number };
type Landmarker = { detect: (img: HTMLCanvasElement) => { faceLandmarks: Landmark[][] } };

let landmarkerPromise: Promise<Landmarker> | null = null;

function loadLandmarker(): Promise<Landmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      // Loaded at runtime from the CDN (not bundled): keeps the app bundle
      // small and avoids a native/WASM npm dependency in the lockfile.
      const vision = await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ VISION_URL);
      const fileset = await vision.FilesetResolver.forVisionTasks(WASM_URL);
      return vision.FaceLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL_URL, delegate: 'CPU' },
        runningMode: 'IMAGE',
        numFaces: 2,
        // Defaults are 0.5; real phone selfies (close, uneven light) were
        // being rejected as "no face".
        minFaceDetectionConfidence: 0.3,
        minFacePresenceConfidence: 0.3,
      });
    })().catch((err) => {
      landmarkerPromise = null; // allow retry
      throw err;
    });
  }
  return landmarkerPromise;
}

/** Start downloading the model early (e.g. when the Style Finder opens). */
export function preloadFaceModel() {
  loadLandmarker().catch(() => {});
}

/** Longest side we analyse at — plenty for landmarks, and fast on phones. */
const MAX_SIDE = 1024;

/**
 * Decodes the photo *upright*. Phones usually store portrait photos sideways
 * plus an EXIF "rotate me" flag; the <img> preview honours it, but pixels
 * handed straight to the detector did not, so the face was sideways and
 * "not found". createImageBitmap(..., { imageOrientation: 'from-image' })
 * applies the flag; also downscales big (12 MP+) photos.
 */
type Decoder = 'bitmap' | 'img';

async function decode(file: File, decoder: Decoder): Promise<ImageBitmap | HTMLImageElement> {
  if (decoder === 'bitmap') return createImageBitmap(file, { imageOrientation: 'from-image' });
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img decode failed'));
    img.src = URL.createObjectURL(file);
  });
}

/**
 * Decodes the photo *upright* and scales it so the longest side is
 * `maxSide`. Phones store portraits sideways plus an EXIF "rotate me" flag;
 * both decoders here apply it in current browsers ('bitmap' via
 * imageOrientation: 'from-image', 'img' via the browser's default
 * image-orientation). Two decoders because mobile browsers differ.
 */
async function loadUprightCanvas(
  file: File,
  decoder: Decoder,
  maxSide = MAX_SIDE,
): Promise<{ canvas: HTMLCanvasElement; srcW: number; srcH: number }> {
  const source = await decode(file, decoder);
  const w = 'naturalWidth' in source ? source.naturalWidth : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight : source.height;
  if (!w || !h) throw new Error('empty image');
  const scale = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * scale);
  canvas.height = Math.round(h * scale);
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return { canvas, srcW: w, srcH: h };
}

/** Same picture with a plain border — helps when a close-up face touches the edges. */
function padded(src: HTMLCanvasElement, fraction = 0.25): HTMLCanvasElement {
  const pad = Math.round(Math.max(src.width, src.height) * fraction);
  const c = document.createElement('canvas');
  c.width = src.width + pad * 2;
  c.height = src.height + pad * 2;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(src, pad, pad);
  return c;
}

/** Rotated copy (90 / 180 / 270°) — fallback when a photo's orientation flag is missing or wrong. */
function rotated(src: HTMLCanvasElement, degrees: 90 | 180 | 270): HTMLCanvasElement {
  const c = document.createElement('canvas');
  const quarter = degrees !== 180;
  c.width = quarter ? src.height : src.width;
  c.height = quarter ? src.width : src.height;
  const ctx = c.getContext('2d')!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  return c;
}

/** Pure maths, exported for testing: proportions → shape probabilities. */
export function classifyProportions(ratios: [number, number, number]): FaceAnalysis {
  const scores = {} as Record<FaceShape, number>;
  let total = 0;
  for (const shape of Object.keys(PROTOTYPES) as FaceShape[]) {
    const proto = PROTOTYPES[shape];
    const d2 = ratios.reduce((sum, r, i) => sum + ((r - proto[i]) / SPREAD[i]) ** 2, 0);
    scores[shape] = Math.exp(-0.5 * d2);
    total += scores[shape];
  }
  const probabilities = {} as Record<FaceShape, number>;
  for (const shape of Object.keys(scores) as FaceShape[]) {
    // If the face is far from every prototype, fall back to an even spread.
    probabilities[shape] = total > 1e-12 ? scores[shape] / total : 1 / 6;
  }
  const shape = (Object.keys(probabilities) as FaceShape[]).reduce((a, b) => (probabilities[b] > probabilities[a] ? b : a));
  return { shape, confidence: probabilities[shape], probabilities };
}

export async function analyzeFace(
  file: File,
): Promise<{ analysis: FaceAnalysis; imageUrl: string; tip: string | null }> {
  const landmarker = await loadLandmarker().catch(() => {
    throw new FaceScanError('Could not load the face scanner. Check your internet connection and try again.');
  });

  // Decode once per decoder; fall back to the other decoder if one fails.
  let decoded: { canvas: HTMLCanvasElement; srcW: number; srcH: number; decoder: Decoder } | null = null;
  const decodeErrors: string[] = [];
  for (const decoder of ['bitmap', 'img'] as const) {
    try {
      const d = await loadUprightCanvas(file, decoder);
      if (looksBlank(d.canvas)) {
        decodeErrors.push(`${decoder}:blank`);
        continue;
      }
      decoded = { ...d, decoder };
      break;
    } catch (err) {
      decodeErrors.push(`${decoder}:${err instanceof Error ? err.message : 'error'}`);
    }
  }
  const fileInfo = `${file.type || 'unknown type'} ${Math.round(file.size / 1024)} KB`;
  if (!decoded) {
    throw new FaceScanError(
      "Your phone's browser couldn't open this photo. Try “Take a selfie” instead, or a different photo.",
      { preview: null, details: `${browserLabel()} · ${fileInfo} · ${decodeErrors.join(', ')}` },
    );
  }

  const upright = decoded.canvas;
  const base = Math.min(upright.width, upright.height);
  const small = await loadUprightCanvas(file, decoded.decoder, 512).then((d) => d.canvas).catch(() => upright);

  // Try the photo as-is first, then progressively more forgiving variants:
  // a border (close-ups touching the edges), a smaller scale, and rotations
  // (missing/wrong orientation flag). `base` = size the face is judged against.
  const attempts: { label: string; canvas: () => HTMLCanvasElement; base: number }[] = [
    { label: 'as-is', canvas: () => upright, base },
    { label: 'pad25', canvas: () => padded(upright, 0.25), base },
    { label: 'pad60', canvas: () => padded(upright, 0.6), base },
    { label: 'small-pad25', canvas: () => padded(small, 0.25), base: Math.min(small.width, small.height) },
    ...([90, 270, 180] as const).map((deg) => ({
      label: `rot${deg}`,
      canvas: () => padded(rotated(upright, deg), 0.25),
      base,
    })),
  ];

  let found: { faces: Landmark[][]; canvas: HTMLCanvasElement; base: number; index: number } | null = null;
  let tries = 0;
  for (const [index, attempt] of attempts.entries()) {
    const canvas = attempt.canvas();
    tries++;
    const faces = landmarker.detect(canvas).faceLandmarks;
    if (faces.length > 0) {
      found = { faces, canvas, base: attempt.base, index };
      break;
    }
  }

  const diagnostics: ScanDiagnostics = {
    preview: thumb(upright),
    details: `${browserLabel()} · ${fileInfo} · ${decoded.srcW}×${decoded.srcH} → ${upright.width}×${upright.height} via ${decoded.decoder}${decodeErrors.length ? ' (' + decodeErrors.join(', ') + ')' : ''} · ${tries} tries`,
  };

  if (!found) {
    throw new FaceScanError(
      "We couldn't find a face. Hold the phone at arm's length so your whole face (forehead to chin) is in the photo, facing the camera, in good light.",
      diagnostics,
    );
  }
  if (found.faces.length > 1) throw new FaceScanError('Please use a photo with just you in it.', diagnostics);

  const w = found.canvas.width;
  const h = found.canvas.height;
  const face = found.faces[0];
  const p = (i: number) => ({ x: face[i].x * w, y: face[i].y * h });
  const dist = (a: number, b: number) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);

  const cheek = dist(LM.cheekL, LM.cheekR);
  if (cheek < found.base * 0.15) {
    throw new FaceScanError('Your face is too small in the photo — move closer so it fills most of the frame.', diagnostics);
  }
  // Turned head: the nose sits far closer to one cheek than the other.
  const left = Math.hypot(p(LM.nose).x - p(LM.cheekL).x, p(LM.nose).y - p(LM.cheekL).y);
  const right = Math.hypot(p(LM.cheekR).x - p(LM.nose).x, p(LM.cheekR).y - p(LM.nose).y);
  if (Math.min(left, right) / Math.max(left, right) < 0.55) {
    throw new FaceScanError('Please look straight at the camera, not to the side.', diagnostics);
  }

  const analysis = classifyProportions([
    dist(LM.top, LM.chin) / cheek,
    dist(LM.jawL, LM.jawR) / cheek,
    dist(LM.foreheadL, LM.foreheadR) / cheek,
  ]);
  // Needing the padded retry means the face ran up to the photo's edges —
  // usually a cut-off forehead or chin, which skews the shape (reads rounder).
  // Same when, on the unaltered photo, the top of the forehead or the chin
  // sits at (or past) the photo's edge.
  const atEdge =
    found.index === 0 &&
    [LM.top, LM.chin, LM.cheekL, LM.cheekR].some((i) => face[i].y < 0.03 || face[i].y > 0.97 || face[i].x < 0.02 || face[i].x > 0.98);
  const tip =
    (found.index >= 1 && found.index <= 3) || atEdge
      ? 'Tip: for the most accurate result, keep your whole face — forehead to chin — inside the frame.'
      : null;
  // Preview: the browser shows the original file upright on its own.
  return { analysis, imageUrl: URL.createObjectURL(file), tip };
}

/** 0–100 match of a style for this face, from the style's per-shape scores. */
export function matchPercent(fit: Record<FaceShape, number>, analysis: FaceAnalysis): number {
  let sum = 0;
  for (const shape of Object.keys(analysis.probabilities) as FaceShape[]) {
    sum += analysis.probabilities[shape] * (fit[shape] ?? 70);
  }
  return Math.round(sum);
}

export function matchReason(fit: Record<FaceShape, number>, analysis: FaceAnalysis): string {
  const label = FACE_SHAPES[analysis.shape].label.toLowerCase();
  const s = fit[analysis.shape] ?? 70;
  if (s >= 88) return `Works really well with a ${label} face.`;
  if (s >= 78) return `A good option for a ${label} face.`;
  if (s >= 65) return `Can work for a ${label} face with the right styling — ask your stylist.`;
  return `Usually less flattering on a ${label} face. ${FACE_SHAPES[analysis.shape].tip}`;
}
