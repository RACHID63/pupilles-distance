export interface Point2D {
  x: number; // Normalized [0, 1]
  y: number; // Normalized [0, 1]
}

export interface CardBounds {
  left: number; // Normalized [0, 1]
  right: number; // Normalized [0, 1]
  top: number; // Normalized [0, 1]
  bottom: number; // Normalized [0, 1]
}

export interface DetectionResult {
  card_left: number;
  card_right: number;
  card_top: number;
  card_bottom: number;
  right_pupil: Point2D; // Patient's right eye (OD) - on viewer's left
  left_pupil: Point2D;  // Patient's left eye (OG) - on viewer's right
  nose_bridge: Point2D;
  confidence?: number;
  card_detected?: boolean;
  notes?: string;
  estimated_distance_cm?: number;
}

export interface OptometricCalculations {
  scaleMmPerPixel: number;
  cardWidthPixels: number;
  cardWidthMm: number;
  shootingDistanceCm: number; // Shooting distance from camera to card (in cm, e.g. 50cm, 60cm)
  measuredPdAtShootingDistance: number; // Raw measured PD at the shooting distance (mm)
  totalPdDistance: number; // True Far Vision PD (VL) extrapolated to infinity (mm)
  rightMonocularPd: number; // True Far Vision OD in mm
  leftMonocularPd: number;  // True Far Vision OG in mm
  intermediateVisionPd: number; // Intermediate vision PD (VI at 65 cm / computer screen) in mm
  nearVisionPd: number;     // Near vision PD (VP at 40 cm / reading) in mm
  convergenceCorrectionMm: number; // Amount of convergence compensated (mm)
  isPhysiologicallyNormal: boolean;
  physiologicalWarning?: string;
  symmetryDifferenceMm: number;
  estimatedDistanceCm?: number;
}

export interface SavedMeasurement {
  id: string;
  timestamp: number;
  name: string;
  imageUrl: string;
  calculations: OptometricCalculations;
  points: {
    rightPupil: Point2D;
    leftPupil: Point2D;
    noseBridge: Point2D;
    cardBounds: CardBounds;
  };
}

export const ISO_CARD_DEFAULT_WIDTH_MM = 85.60;
export const ISO_CARD_DEFAULT_HEIGHT_MM = 53.98;
export const DEFAULT_SHOOTING_DISTANCE_CM = 60; // Standard arm's length (bras tendu)
