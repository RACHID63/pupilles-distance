/**
 * Optical, Contact-Zero, Inertial & Calibration Distance Estimator
 *
 * Astuce physique combinée pour mesurer la distance caméra <-> sujet à partir de 0 cm :
 * 1. Contact Zéro (0 cm) : détection par occlusion lumineuse + absence de netteté lorsque
 *    l'objectif est collé contre la carte/le front (ou tarage manuel "Départ 0 cm").
 * 2. Phase de décollage (0 -> ~12 cm) : suivi de la libération lumineuse + intégration
 *    inertielle Z (si accéléromètre disponible) jusqu'à ce que la carte entre dans le champ.
 * 3. Télémétrie optique par loi de Thalès : D_cm = K_cam / largeur_normalisée_carte,
 *    où K_cam = (f_px / W_image) * 8.56 cm (étalon ISO/IEC 7810 ID-1).
 * 4. Calibration exacte de focale sans connaître le modèle d'appareil :
 *    Astuce des 2 mesures séparées d'une longueur de carte (ΔD = 8.56 cm) :
 *    K_cam = ΔD * (w1 * w2) / (w1 - w2).
 */

export const DEFAULT_FOCAL_CONSTANT_CM = 6.7; // Corresponds to ~66° HFOV with an 8.56 cm card
export const IRIS_DIAMETER_CM = 1.17; // Biological constant: adult iris diameter ~11.7 mm
const STORAGE_KEY_FOCAL = 'optipd_camera_focal_k_v1';

export function getSavedFocalConstant(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_FOCAL);
    if (raw) {
      const parsed = parseFloat(raw);
      if (Number.isFinite(parsed) && parsed >= 2.5 && parsed <= 20) {
        return parsed;
      }
    }
  } catch {}
  return DEFAULT_FOCAL_CONSTANT_CM;
}

export function saveFocalConstant(k: number): number {
  const clamped = Math.max(2.5, Math.min(20, Number(k.toFixed(2))));
  try {
    localStorage.setItem(STORAGE_KEY_FOCAL, String(clamped));
  } catch {}
  return clamped;
}

export function resetFocalConstant(): number {
  try {
    localStorage.removeItem(STORAGE_KEY_FOCAL);
  } catch {}
  return DEFAULT_FOCAL_CONSTANT_CM;
}

/**
 * Computes exact camera focal constant K_cam from two measurements separated by a known
 * pullback distance deltaCm (e.g. 8.56 cm = 1 credit card width).
 */
export function calibrateFocalFromTwoSteps(
  w1Fraction: number,
  w2Fraction: number,
  deltaCm = 8.56
): { focalConstant: number; d1Cm: number; d2Cm: number } | null {
  if (w1Fraction <= w2Fraction || w1Fraction <= 0.05 || w2Fraction <= 0.02 || deltaCm <= 0) {
    return null;
  }
  const focalConstant = (deltaCm * w1Fraction * w2Fraction) / (w1Fraction - w2Fraction);
  if (!Number.isFinite(focalConstant) || focalConstant < 2.5 || focalConstant > 20) {
    return null;
  }
  const d1Cm = focalConstant / w1Fraction;
  const d2Cm = focalConstant / w2Fraction;
  return {
    focalConstant: Number(focalConstant.toFixed(2)),
    d1Cm: Math.round(d1Cm),
    d2Cm: Math.round(d2Cm),
  };
}

/**
 * Single-step focal calibration when the user knows their exact distance (e.g. 40 cm).
 */
export function calibrateFocalFromKnownDistance(
  cardWidthFraction: number,
  knownDistanceCm: number
): number | null {
  if (cardWidthFraction <= 0.03 || knownDistanceCm < 10 || knownDistanceCm > 250) {
    return null;
  }
  const k = knownDistanceCm * cardWidthFraction;
  if (!Number.isFinite(k) || k < 2.5 || k > 20) return null;
  return Number(k.toFixed(2));
}

export interface LiveTelemeterSample {
  meanLuminance: number; // 0..255
  edgeSharpness: number; // 0..100
  isContactZero: boolean; // True when camera lens is pressed against forehead/card
  estimatedCardFraction: number | null; // Estimated width fraction [0.06..0.95] of card in forehead zone
  opticalConfidence: number; // 0..1
}

/**
 * Lightweight real-time computer vision pass on a 160x120 canvas extracted from <video>.
 * - Detects lens-to-surface occlusion ("0 cm contact") via luminance + gradient collapse.
 * - Detects horizontal edges of a rectangular card centered in the forehead target zone.
 */
export function analyzeVideoFrameForTelemeter(
  video: HTMLVideoElement,
  scratchCanvas: HTMLCanvasElement
): LiveTelemeterSample | null {
  if (!video.videoWidth || !video.videoHeight || video.readyState < 2) {
    return null;
  }

  const w = 160;
  const h = 120;
  if (scratchCanvas.width !== w) scratchCanvas.width = w;
  if (scratchCanvas.height !== h) scratchCanvas.height = h;

  const ctx = scratchCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h).data;

  // Convert to grayscale luminance buffer
  const gray = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const idx = i * 4;
    gray[i] = 0.299 * imgData[idx] + 0.587 * imgData[idx + 1] + 0.114 * imgData[idx + 2];
  }

  // 1. Central luminance & local gradient sharpness (to detect 0 cm contact occlusion)
  let lumSum = 0;
  let gradSum = 0;
  let sampleCount = 0;
  const xStart = Math.floor(w * 0.2);
  const xEnd = Math.floor(w * 0.8);
  const yStart = Math.floor(h * 0.2);
  const yEnd = Math.floor(h * 0.8);

  for (let y = yStart; y < yEnd - 1; y++) {
    for (let x = xStart; x < xEnd - 1; x++) {
      const p = y * w + x;
      const g = gray[p];
      lumSum += g;
      gradSum += Math.abs(g - gray[p + 1]) + Math.abs(g - gray[p + w]);
      sampleCount++;
    }
  }

  const meanLuminance = lumSum / Math.max(1, sampleCount);
  const edgeSharpness = gradSum / Math.max(1, sampleCount);

  // When pressed directly against skin or a card, light is blocked and micro-contrast vanishes
  const isContactZero = (meanLuminance < 42 && edgeSharpness < 8.5) || edgeSharpness < 3.2;

  // 2. Horizontal vertical-edge projection in the forehead card zone (y: 16%..46%)
  // Looking for symmetric left & right card borders around the center X (50%)
  const bandTop = Math.floor(h * 0.16);
  const bandBottom = Math.floor(h * 0.46);
  const colEdges = new Float32Array(w);

  for (let x = 2; x < w - 2; x++) {
    let colGrad = 0;
    for (let y = bandTop; y < bandBottom; y++) {
      const p = y * w + x;
      colGrad += Math.abs(gray[p + 1] - gray[p - 1]);
    }
    colEdges[x] = colGrad / Math.max(1, bandBottom - bandTop);
  }

  // Find strongest left edge (x in [5%..46%]) and symmetric right edge (x in [54%..95%])
  const centerX = w / 2;
  let bestScore = 0;
  let bestHalfWidth = 0;

  // Test candidate half-widths from 6% to 46% of frame width
  const minHalf = Math.floor(w * 0.05);
  const maxHalf = Math.floor(w * 0.46);
  for (let hw = minHalf; hw <= maxHalf; hw++) {
    const lx = Math.round(centerX - hw);
    const rx = Math.round(centerX + hw);
    if (lx < 2 || rx >= w - 2) continue;

    // Peak strength near left & right border (+/- 2 px tolerance for slight off-centering)
    let leftPeak = 0;
    let rightPeak = 0;
    for (let d = -2; d <= 2; d++) {
      leftPeak = Math.max(leftPeak, colEdges[lx + d]);
      rightPeak = Math.max(rightPeak, colEdges[rx + d]);
    }

    // Both edges must exist (geometric mean favors balanced rectangular card borders)
    const pairScore = Math.sqrt(leftPeak * rightPeak);
    if (pairScore > bestScore) {
      bestScore = pairScore;
      bestHalfWidth = hw;
    }
  }

  const avgColEdge =
    colEdges.reduce((acc, v) => acc + v, 0) / Math.max(1, colEdges.length);
  const prominence = avgColEdge > 0 ? bestScore / avgColEdge : 0;

  let estimatedCardFraction: number | null = null;
  let opticalConfidence = 0;

  if (!isContactZero && bestHalfWidth > 0 && bestScore > 11 && prominence > 1.55) {
    estimatedCardFraction = (bestHalfWidth * 2) / w;
    opticalConfidence = Math.min(1, (prominence - 1.4) / 2.2);
  }

  return {
    meanLuminance,
    edgeSharpness,
    isContactZero,
    estimatedCardFraction,
    opticalConfidence,
  };
}
