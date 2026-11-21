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

export class FaceScanError extends Error {}

type Landmark = { x: number; y: number };
type Landmarker = { detect: (img: HTMLImageElement) => { faceLandmarks: Landmark[][] } };

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

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new FaceScanError('Could not read that photo. Try another one.'));
    img.src = URL.createObjectURL(file);
  });
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

export async function analyzeFace(file: File): Promise<{ analysis: FaceAnalysis; imageUrl: string }> {
  const [landmarker, img] = await Promise.all([
    loadLandmarker().catch(() => {
      throw new FaceScanError('Could not load the face scanner. Check your internet connection and try again.');
    }),
    loadImage(file),
  ]);

  const faces = landmarker.detect(img).faceLandmarks;
  if (faces.length === 0) {
    throw new FaceScanError("We couldn't find a face. Use a clear, front-facing photo in good light.");
  }
  if (faces.length > 1) throw new FaceScanError('Please use a photo with just you in it.');

  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const p = (i: number) => ({ x: faces[0][i].x * w, y: faces[0][i].y * h });
  const dist = (a: number, b: number) => Math.hypot(p(a).x - p(b).x, p(a).y - p(b).y);

  const cheek = dist(LM.cheekL, LM.cheekR);
  if (cheek < Math.min(w, h) * 0.18) {
    throw new FaceScanError('Your face is too small in the photo — move closer so it fills most of the frame.');
  }
  // Turned head: the nose sits far closer to one cheek than the other.
  const left = Math.abs(p(LM.nose).x - p(LM.cheekL).x);
  const right = Math.abs(p(LM.cheekR).x - p(LM.nose).x);
  if (Math.min(left, right) / Math.max(left, right) < 0.6) {
    throw new FaceScanError('Please look straight at the camera, not to the side.');
  }

  const analysis = classifyProportions([
    dist(LM.top, LM.chin) / cheek,
    dist(LM.jawL, LM.jawR) / cheek,
    dist(LM.foreheadL, LM.foreheadR) / cheek,
  ]);
  return { analysis, imageUrl: img.src };
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
