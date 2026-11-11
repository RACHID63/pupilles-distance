import {
  CardBounds,
  OptometricCalculations,
  Point2D,
  ISO_CARD_DEFAULT_WIDTH_MM,
  DEFAULT_SHOOTING_DISTANCE_CM,
} from '../types/optometry';

/**
 * Calculates Euclidean distance between two 2D points in pixel coordinates.
 */
export function euclideanDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Estimates shooting distance (in cm) based on detected card width fraction
 * assuming standard smartphone camera lens (FOV ~ 66°).
 */
export function estimateShootingDistanceCm(cardFractionOfWidth: number): number {
  if (cardFractionOfWidth <= 0.01) return DEFAULT_SHOOTING_DISTANCE_CM;
  // Constant derived from 85.6mm card width and standard 66° horizontal field of view
  // Distance = (Card_Width_mm / (2 * tan(HFOV/2) * fraction)) / 10
  const estimatedCm = Math.round(6.7 / cardFractionOfWidth);
  return Math.max(30, Math.min(250, estimatedCm));
}

/**
 * Computes all optometric parameters according to trigonometric convergence formulas
 * taking into account the shooting distance (distance de la prise de vue).
 * 
 * When a subject looks directly into a camera lens at distance D (in cm):
 * - Visual axes converge toward the lens.
 * - The apparent PD measured at distance D is smaller than the true Far Vision PD (infinity).
 * - Eye center of rotation is ~25 mm behind the spectacle/card plane.
 * - Thalès ratio: PD_photo / PD_infinity = D / (D + 25mm)
 * - True Far PD (infinity) = PD_photo * ((D + 25mm) / D)
 */
export function computeOptometricPD({
  rightPupil,
  leftPupil,
  noseBridge,
  cardBounds,
  imageWidth,
  imageHeight,
  cardWidthMm = ISO_CARD_DEFAULT_WIDTH_MM,
  shootingDistanceCm = DEFAULT_SHOOTING_DISTANCE_CM,
}: {
  rightPupil: Point2D;
  leftPupil: Point2D;
  noseBridge: Point2D;
  cardBounds: CardBounds;
  imageWidth: number;
  imageHeight: number;
  cardWidthMm?: number;
  shootingDistanceCm?: number;
}): OptometricCalculations {
  // Convert normalized coordinates to absolute pixels
  const rightPx = {
    x: rightPupil.x * imageWidth,
    y: rightPupil.y * imageHeight,
  };
  const leftPx = {
    x: leftPupil.x * imageWidth,
    y: leftPupil.y * imageHeight,
  };
  const nosePx = {
    x: noseBridge.x * imageWidth,
    y: noseBridge.y * imageHeight,
  };

  // Card width in pixels
  const cardLeftPx = Math.min(cardBounds.left, cardBounds.right) * imageWidth;
  const cardRightPx = Math.max(cardBounds.left, cardBounds.right) * imageWidth;
  const cardWidthPixels = Math.max(1, cardRightPx - cardLeftPx);
  const cardFraction = cardWidthPixels / imageWidth;
  const estimatedDistanceCm = estimateShootingDistanceCm(cardFraction);

  // Scale formula: mm per pixel = card_width_mm / card_width_pixels
  const scaleMmPerPixel = cardWidthMm / cardWidthPixels;

  // 1. Raw apparent pixel distance on the photo
  const rawPixelDistance = euclideanDistance(rightPx, leftPx);
  const measuredPdAtShootingDistance = rawPixelDistance * scaleMmPerPixel;

  // Raw monocular half-PDs at shooting distance
  const rawRightMonocular = Math.abs(rightPx.x - nosePx.x) * scaleMmPerPixel;
  const rawLeftMonocular = Math.abs(leftPx.x - nosePx.x) * scaleMmPerPixel;

  // 2. Optical Convergence Compensation according to shooting distance D
  // D in mm:
  const distanceMm = Math.max(250, shootingDistanceCm * 10);
  const CORNEA_TO_ROTATION_CENTER_MM = 25; // standard physiological constant (corneal/card plane to center of eye rotation)

  // Factor to extrapolate to infinity (Far Vision VL)
  // If shooting distance is 250 cm or more (or infinite), convergence is negligible (< 0.5%)
  const infinityFactor = shootingDistanceCm >= 250
    ? 1.0
    : (distanceMm + CORNEA_TO_ROTATION_CENTER_MM) / distanceMm;

  // True Far Vision PD at infinity
  const totalPdDistance = measuredPdAtShootingDistance * infinityFactor;
  const rightMonocularPd = rawRightMonocular * infinityFactor;
  const leftMonocularPd = rawLeftMonocular * infinityFactor;
  const convergenceCorrectionMm = totalPdDistance - measuredPdAtShootingDistance;

  // 3. Near Vision PD (VP at 40 cm reading distance)
  // Standard reading convergence: D_reading = 400 mm
  const READING_DISTANCE_MM = 400;
  const nearFactor = READING_DISTANCE_MM / (READING_DISTANCE_MM + CORNEA_TO_ROTATION_CENTER_MM);
  const nearVisionPd = totalPdDistance * nearFactor;

  // 4. Intermediate Vision PD (VI at 65 cm / computer screen distance)
  const INTERMEDIATE_DISTANCE_MM = 650;
  const intermediateFactor = INTERMEDIATE_DISTANCE_MM / (INTERMEDIATE_DISTANCE_MM + CORNEA_TO_ROTATION_CENTER_MM);
  const intermediateVisionPd = totalPdDistance * intermediateFactor;

  // Physiological verification (adult normal range: 54 mm to 74 mm, average 63.5 mm)
  const isPhysiologicallyNormal = totalPdDistance >= 54 && totalPdDistance <= 74;
  let physiologicalWarning: string | undefined = undefined;

  if (totalPdDistance < 50) {
    physiologicalWarning =
      "Valeur anormalement basse (< 50 mm). Attention au piège classique : vérifiez que les repères pointent bien le centre noir de l'iris/pupille et non les coins internes des yeux (canthus).";
  } else if (totalPdDistance < 54) {
    physiologicalWarning =
      "Écart inférieur à la moyenne adulte (54 mm). Fréquent chez les enfants ou visages très fins, mais vérifiez le calibrage des bords de la carte.";
  } else if (totalPdDistance > 75) {
    physiologicalWarning =
      "Valeur élevée (> 75 mm). Vérifiez que les repères de la carte bancaire encadrent bien toute sa largeur sans décalage.";
  }

  const symmetryDifferenceMm = Math.abs(rightMonocularPd - leftMonocularPd);

  return {
    scaleMmPerPixel,
    cardWidthPixels,
    cardWidthMm,
    shootingDistanceCm,
    measuredPdAtShootingDistance: Number(measuredPdAtShootingDistance.toFixed(2)),
    totalPdDistance: Number(totalPdDistance.toFixed(2)),
    rightMonocularPd: Number(rightMonocularPd.toFixed(2)),
    leftMonocularPd: Number(leftMonocularPd.toFixed(2)),
    intermediateVisionPd: Number(intermediateVisionPd.toFixed(2)),
    nearVisionPd: Number(nearVisionPd.toFixed(2)),
    convergenceCorrectionMm: Number(convergenceCorrectionMm.toFixed(2)),
    isPhysiologicallyNormal,
    physiologicalWarning,
    symmetryDifferenceMm: Number(symmetryDifferenceMm.toFixed(2)),
    estimatedDistanceCm,
  };
}
