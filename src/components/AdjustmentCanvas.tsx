import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  CardBounds,
  Point2D,
  OptometricCalculations,
  ISO_CARD_DEFAULT_WIDTH_MM,
  DEFAULT_SHOOTING_DISTANCE_CM,
} from '../types/optometry';
import { computeOptometricPD } from '../utils/optometry';
import {
  ZoomIn,
  Move,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  RotateCcw,
  Check,
  Camera,
  AlertTriangle,
  Ruler,
  Sparkles,
  Crosshair,
  Pin,
} from 'lucide-react';

interface Props {
  imageUrl: string;
  initialCardBounds: CardBounds;
  initialRightPupil: Point2D;
  initialLeftPupil: Point2D;
  initialNoseBridge: Point2D;
  initialShootingDistanceCm?: number;
  aiConfidence?: number;
  aiNotes?: string;
  onConfirm: (
    calculations: OptometricCalculations,
    points: {
      rightPupil: Point2D;
      leftPupil: Point2D;
      noseBridge: Point2D;
      cardBounds: CardBounds;
    }
  ) => void;
  onRetake: () => void;
}

type ActiveHandle =
  | 'right_pupil'
  | 'left_pupil'
  | 'nose_bridge'
  | 'card_left'
  | 'card_right'
  | 'card_top'
  | 'card_bottom'
  | null;

export const AdjustmentCanvas: React.FC<Props> = ({
  imageUrl,
  initialCardBounds,
  initialRightPupil,
  initialLeftPupil,
  initialNoseBridge,
  initialShootingDistanceCm = DEFAULT_SHOOTING_DISTANCE_CM,
  aiConfidence,
  aiNotes,
  onConfirm,
  onRetake,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const magnifierCanvasRef = useRef<HTMLCanvasElement>(null);

  // Editable points in normalized [0, 1] space
  const [rightPupil, setRightPupil] = useState<Point2D>(initialRightPupil);
  const [leftPupil, setLeftPupil] = useState<Point2D>(initialLeftPupil);
  const [noseBridge, setNoseBridge] = useState<Point2D>(initialNoseBridge);
  const [cardBounds, setCardBounds] = useState<CardBounds>(initialCardBounds);

  // Card reference width (default standard ID-1: 85.60 mm)
  const [cardWidthMm, setCardWidthMm] = useState<number>(ISO_CARD_DEFAULT_WIDTH_MM);

  // Shooting distance in cm (compensates for convergence)
  const [shootingDistanceCm, setShootingDistanceCm] = useState<number>(initialShootingDistanceCm);

  // Active handle being dragged or adjusted with D-pad
  const [activeHandle, setActiveHandle] = useState<ActiveHandle>('right_pupil');
  const [isDragging, setIsDragging] = useState<boolean>(false);

  // Natural image dimensions
  const [imgNaturalSize, setImgNaturalSize] = useState<{ width: number; height: number }>({
    width: 1280,
    height: 720,
  });

  // Magnifier state: position mode can be 'follow' (floats near target) or 'corner'
  const [loupeMode, setLoupeMode] = useState<'follow' | 'corner'>('follow');
  const [showMagnifier, setShowMagnifier] = useState<boolean>(true);
  const [magnifierPos, setMagnifierPos] = useState<Point2D>(initialRightPupil);
  const [zoomFactor, setZoomFactor] = useState<number>(3.5);

  // Real-time calculated metrics
  const [calculations, setCalculations] = useState<OptometricCalculations>(() =>
    computeOptometricPD({
      rightPupil: initialRightPupil,
      leftPupil: initialLeftPupil,
      noseBridge: initialNoseBridge,
      cardBounds: initialCardBounds,
      imageWidth: 1280,
      imageHeight: 720,
      cardWidthMm: ISO_CARD_DEFAULT_WIDTH_MM,
      shootingDistanceCm: initialShootingDistanceCm,
    })
  );

  // Update calculations whenever points, card dimensions, or shooting distance change
  useEffect(() => {
    const calc = computeOptometricPD({
      rightPupil,
      leftPupil,
      noseBridge,
      cardBounds,
      imageWidth: imgNaturalSize.width,
      imageHeight: imgNaturalSize.height,
      cardWidthMm,
      shootingDistanceCm,
    });
    setCalculations(calc);
  }, [rightPupil, leftPupil, noseBridge, cardBounds, imgNaturalSize, cardWidthMm, shootingDistanceCm]);

  /**
   * High-Precision Magnifier Renderer:
   * Mathematically guarantees that (normalizedX, normalizedY) is mapped
   * strictly to the center (size/2, size/2) of the magnifier lens without
   * aspect ratio distortion or letterboxing offset.
   */
  const updateMagnifier = useCallback(
    (normalizedX: number, normalizedY: number) => {
      const canvas = magnifierCanvasRef.current;
      const img = imageRef.current;
      const container = containerRef.current;
      if (!canvas || !img || !img.complete || !container) return;

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const lensSize = 170; // Diameter of magnifier canvas in CSS pixels
      canvas.width = lensSize;
      canvas.height = lensSize;

      // Rendered display width of the image wrapper
      const renderedWidth = container.clientWidth || 1;
      const pxRatio = img.naturalWidth / renderedWidth;

      // Target position in natural image pixels
      const targetNatX = normalizedX * img.naturalWidth;
      const targetNatY = normalizedY * img.naturalHeight;

      // Desired visible area in natural image pixels for the given zoom factor:
      const cropSizeNat = (lensSize / zoomFactor) * pxRatio;

      // Source rectangle in natural image coordinates
      const sx = targetNatX - cropSizeNat / 2;
      const sy = targetNatY - cropSizeNat / 2;

      // Clear with dark optometric backdrop
      ctx.clearRect(0, 0, lensSize, lensSize);
      ctx.fillStyle = '#020617';
      ctx.fillRect(0, 0, lensSize, lensSize);

      // Draw magnified natural image segment
      ctx.drawImage(
        img,
        sx,
        sy,
        cropSizeNat,
        cropSizeNat,
        0,
        0,
        lensSize,
        lensSize
      );

      const mid = lensSize / 2;

      // 1. Concentric alignment rings
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(mid, mid, 16, 0, Math.PI * 2);
      ctx.arc(mid, mid, 34, 0, Math.PI * 2);
      ctx.stroke();

      // 2. Neon Red Crosshairs (#FF1744) with open center
      ctx.strokeStyle = '#FF1744';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      // Horizontal
      ctx.moveTo(0, mid);
      ctx.lineTo(mid - 5, mid);
      ctx.moveTo(mid + 5, mid);
      ctx.lineTo(lensSize, mid);
      // Vertical
      ctx.moveTo(mid, 0);
      ctx.lineTo(mid, mid - 5);
      ctx.moveTo(mid, mid + 5);
      ctx.lineTo(lensSize, mid);
      ctx.stroke();

      // 3. Ultra-crisp center cyan dot (#00E5FF)
      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(mid, mid, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Outer lens border
      ctx.strokeStyle = 'rgba(0, 229, 255, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, lensSize, lensSize);
    },
    [zoomFactor]
  );

  // Helper to get active handle coordinates
  const getActiveHandlePos = useCallback((): Point2D => {
    if (activeHandle === 'right_pupil') return rightPupil;
    if (activeHandle === 'left_pupil') return leftPupil;
    if (activeHandle === 'nose_bridge') return noseBridge;
    if (activeHandle === 'card_left') {
      return { x: cardBounds.left, y: (cardBounds.top + cardBounds.bottom) / 2 };
    }
    if (activeHandle === 'card_right') {
      return { x: cardBounds.right, y: (cardBounds.top + cardBounds.bottom) / 2 };
    }
    return { x: 0.5, y: 0.5 };
  }, [activeHandle, rightPupil, leftPupil, noseBridge, cardBounds]);

  // Sync magnifier whenever active handle or points change
  useEffect(() => {
    const pos = getActiveHandlePos();
    setMagnifierPos(pos);
    updateMagnifier(pos.x, pos.y);
  }, [getActiveHandlePos, updateMagnifier]);

  // Handle pointer down on a marker
  const handlePointerDown = (handle: ActiveHandle, e: React.PointerEvent) => {
    e.stopPropagation();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setActiveHandle(handle);
    setIsDragging(true);

    let pos: Point2D = { x: 0.5, y: 0.5 };
    if (handle === 'right_pupil') pos = rightPupil;
    else if (handle === 'left_pupil') pos = leftPupil;
    else if (handle === 'nose_bridge') pos = noseBridge;
    else if (handle === 'card_left') pos = { x: cardBounds.left, y: (cardBounds.top + cardBounds.bottom) / 2 };
    else if (handle === 'card_right') pos = { x: cardBounds.right, y: (cardBounds.top + cardBounds.bottom) / 2 };

    setMagnifierPos(pos);
    updateMagnifier(pos.x, pos.y);
  };

  // Convert client pointer position strictly to [0, 1] on the image element
  const getNormalizedCoords = (e: React.PointerEvent): Point2D | null => {
    if (!containerRef.current) return null;
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  // Handle pointer drag
  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !activeHandle) return;
    const coords = getNormalizedCoords(e);
    if (!coords) return;

    let targetPoint = coords;

    if (activeHandle === 'right_pupil') {
      setRightPupil(coords);
      targetPoint = coords;
    } else if (activeHandle === 'left_pupil') {
      setLeftPupil(coords);
      targetPoint = coords;
    } else if (activeHandle === 'nose_bridge') {
      setNoseBridge(coords);
      targetPoint = coords;
    } else if (activeHandle === 'card_left') {
      const newLeft = Math.min(coords.x, cardBounds.right - 0.05);
      setCardBounds((prev) => ({ ...prev, left: newLeft }));
      targetPoint = { x: newLeft, y: (cardBounds.top + cardBounds.bottom) / 2 };
    } else if (activeHandle === 'card_right') {
      const newRight = Math.max(coords.x, cardBounds.left + 0.05);
      setCardBounds((prev) => ({ ...prev, right: newRight }));
      targetPoint = { x: newRight, y: (cardBounds.top + cardBounds.bottom) / 2 };
    }

    setMagnifierPos(targetPoint);
    updateMagnifier(targetPoint.x, targetPoint.y);
  };

  const handlePointerUp = () => {
    setIsDragging(false);
  };

  // Micro-adjustment D-pad (step = 0.001 in normalized space ~ 1 pixel)
  const nudgeActiveHandle = (dx: number, dy: number) => {
    const step = 0.0015;
    const deltaX = dx * step;
    const deltaY = dy * step;
    let targetPoint: Point2D = { x: 0.5, y: 0.5 };

    if (activeHandle === 'right_pupil') {
      const newP = {
        x: Math.max(0, Math.min(1, rightPupil.x + deltaX)),
        y: Math.max(0, Math.min(1, rightPupil.y + deltaY)),
      };
      setRightPupil(newP);
      targetPoint = newP;
    } else if (activeHandle === 'left_pupil') {
      const newP = {
        x: Math.max(0, Math.min(1, leftPupil.x + deltaX)),
        y: Math.max(0, Math.min(1, leftPupil.y + deltaY)),
      };
      setLeftPupil(newP);
      targetPoint = newP;
    } else if (activeHandle === 'nose_bridge') {
      const newP = {
        x: Math.max(0, Math.min(1, noseBridge.x + deltaX)),
        y: Math.max(0, Math.min(1, noseBridge.y + deltaY)),
      };
      setNoseBridge(newP);
      targetPoint = newP;
    } else if (activeHandle === 'card_left') {
      const newLeft = Math.max(0, Math.min(cardBounds.right - 0.05, cardBounds.left + deltaX));
      setCardBounds((b) => ({ ...b, left: newLeft }));
      targetPoint = { x: newLeft, y: (cardBounds.top + cardBounds.bottom) / 2 };
    } else if (activeHandle === 'card_right') {
      const newRight = Math.min(1, Math.max(cardBounds.left + 0.05, cardBounds.right + deltaX));
      setCardBounds((b) => ({ ...b, right: newRight }));
      targetPoint = { x: newRight, y: (cardBounds.top + cardBounds.bottom) / 2 };
    }

    setMagnifierPos(targetPoint);
    updateMagnifier(targetPoint.x, targetPoint.y);
  };

  // Reset to initial AI coordinates
  const handleResetToAI = () => {
    setRightPupil(initialRightPupil);
    setLeftPupil(initialLeftPupil);
    setNoseBridge(initialNoseBridge);
    setCardBounds(initialCardBounds);
  };

  // Compute position of the Loupe on screen
  // If follow mode: floats right above the target (clamped within [10%, 90%])
  // If corner mode: sits in top-right or top-left (opposite of target)
  const getLoupeStyle = (): React.CSSProperties => {
    if (loupeMode === 'corner') {
      // If target is on the right side of the face (x > 0.5), put loupe on the top-left
      // If target is on the left side of the face (x <= 0.5), put loupe on the top-right
      return magnifierPos.x > 0.5
        ? { top: '12px', left: '12px' }
        : { top: '12px', right: '12px' };
    }

    // Follow mode: placed above or below the active target
    const targetPercentX = magnifierPos.x * 100;
    const targetPercentY = magnifierPos.y * 100;

    const clampedX = Math.max(16, Math.min(84, targetPercentX));
    // If target is high up on the forehead, place loupe below target to avoid clipping
    const clampedY =
      targetPercentY < 35
        ? Math.min(80, targetPercentY + 22)
        : Math.max(18, targetPercentY - 24);

    return {
      left: `${clampedX}%`,
      top: `${clampedY}%`,
      transform: 'translate(-50%, -50%)',
    };
  };

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 pb-8 animate-in fade-in duration-300">
      {/* Top Banner with AI feedback */}
      <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl flex flex-wrap items-center justify-between gap-3 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-white">Étalonnage & Ajustement Manuel</h3>
              {aiConfidence && (
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-mono">
                  Confiance IA: {Math.round(aiConfidence * 100)}%
                </span>
              )}
            </div>
            <p className="text-xs text-slate-400">
              Déplacez les repères ou utilisez la loupe et les micro-flèches pour un centrage chirurgical.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleResetToAI}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Réinitialiser repères IA</span>
          </button>
          <button
            onClick={onRetake}
            className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-semibold flex items-center gap-1.5 transition"
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Reprendre photo</span>
          </button>
        </div>
      </div>

      {/* Interactive Shooting Distance Controller & Convergence Compensation */}
      <div className="bg-slate-900/90 border border-slate-800 p-3.5 rounded-2xl shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Ruler className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Distance de la photo :</span>
              <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-500/10 px-2 py-0.5 rounded border border-cyan-500/20">
                {shootingDistanceCm >= 200 ? '200+ cm (Infini)' : `${shootingDistanceCm} cm`}
              </span>
              {calculations.convergenceCorrectionMm > 0 && (
                <span className="text-[10px] text-emerald-400 font-mono font-medium">
                  (+{calculations.convergenceCorrectionMm} mm corrigés vers VL)
                </span>
              )}
            </div>
            {calculations.estimatedDistanceCm && (
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                <span>Estimation d'après la carte : ~{calculations.estimatedDistanceCm} cm</span>
                {Math.abs(calculations.estimatedDistanceCm - shootingDistanceCm) > 5 && (
                  <button
                    onClick={() => setShootingDistanceCm(calculations.estimatedDistanceCm!)}
                    className="text-cyan-400 hover:underline font-semibold"
                  >
                    (Appliquer)
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Distance Presets */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { cm: 40, label: '40 cm' },
            { cm: 50, label: '50 cm' },
            { cm: 60, label: '60 cm (Bras tendu)' },
            { cm: 100, label: '1 m' },
            { cm: 200, label: '2 m+ (Infini)' },
          ].map((preset) => (
            <button
              key={preset.cm}
              onClick={() => setShootingDistanceCm(preset.cm)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                shootingDistanceCm === preset.cm
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950/50'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <div className="flex items-center gap-1.5 ml-1">
            <input
              type="range"
              min={30}
              max={200}
              step={5}
              value={shootingDistanceCm}
              onChange={(e) => setShootingDistanceCm(parseInt(e.target.value, 10))}
              className="w-20 sm:w-24 accent-cyan-400 cursor-pointer h-1.5 bg-slate-800 rounded-lg"
              title="Ajuster la distance exacte"
            />
            <span className="font-mono text-xs text-slate-400">{shootingDistanceCm}cm</span>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Photo Container & SVG Overlay (8 cols) */}
        <div className="lg:col-span-8 flex flex-col gap-3">
          {/* Outer Frame with exact centered image matching */}
          <div className="relative w-full flex items-center justify-center bg-slate-950 rounded-2xl border border-slate-700/80 shadow-2xl p-1.5 overflow-hidden">
            {/* The Image Wrapper has EXACT ASPECT RATIO of natural image to eliminate letterbox shift */}
            <div
              ref={containerRef}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              style={{
                aspectRatio: `${imgNaturalSize.width} / ${imgNaturalSize.height}`,
                maxHeight: '66vh',
              }}
              className="relative w-full select-none touch-none rounded-xl overflow-hidden shadow-lg bg-black"
            >
              {/* Cliché Image */}
              <img
                ref={imageRef}
                src={imageUrl}
                alt="Cliché pour mesure pupillaire"
                className="w-full h-full object-fill block pointer-events-none"
                onLoad={(e) => {
                  const img = e.currentTarget;
                  const nw = img.naturalWidth || 1280;
                  const nh = img.naturalHeight || 720;
                  setImgNaturalSize({ width: nw, height: nh });
                  setTimeout(() => {
                    const pos = getActiveHandlePos();
                    updateMagnifier(pos.x, pos.y);
                  }, 60);
                }}
              />

              {/* SVG Overlay for measurement lines and calipers */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none">
                {/* 1. Credit Card Bounding Box & Calipers */}
                <rect
                  x={`${Math.min(cardBounds.left, cardBounds.right) * 100}%`}
                  y={`${cardBounds.top * 100}%`}
                  width={`${Math.abs(cardBounds.right - cardBounds.left) * 100}%`}
                  height={`${Math.abs(cardBounds.bottom - cardBounds.top) * 100}%`}
                  fill="rgba(244, 63, 94, 0.08)"
                  stroke="#FF1744"
                  strokeWidth="1.5"
                  strokeDasharray="4 2"
                />

                {/* Card dimension tag */}
                <text
                  x={`${((cardBounds.left + cardBounds.right) / 2) * 100}%`}
                  y={`${Math.max(0.04, cardBounds.top - 0.015) * 100}%`}
                  textAnchor="middle"
                  fill="#FF1744"
                  fontSize="11"
                  fontFamily="monospace"
                  fontWeight="bold"
                >
                  Carte ID-1: {cardWidthMm.toFixed(2)} mm ({Math.round(calculations.cardWidthPixels)} px)
                </text>

                {/* 2. Pupil Interocular Connecting Line */}
                <line
                  x1={`${rightPupil.x * 100}%`}
                  y1={`${rightPupil.y * 100}%`}
                  x2={`${leftPupil.x * 100}%`}
                  y2={`${leftPupil.y * 100}%`}
                  stroke="#00E5FF"
                  strokeWidth="2"
                  strokeDasharray="6 3"
                />

                {/* Total PD label on interocular line */}
                <text
                  x={`${((rightPupil.x + leftPupil.x) / 2) * 100}%`}
                  y={`${Math.max(0.06, (rightPupil.y + leftPupil.y) / 2 - 0.025) * 100}%`}
                  textAnchor="middle"
                  fill="#00E5FF"
                  fontSize="13"
                  fontFamily="monospace"
                  fontWeight="bold"
                  className="drop-shadow-md"
                >
                  VL Réelle (∞): {calculations.totalPdDistance} mm
                </text>

                {/* 3. Nose Bridge Vertical Symmetry Axis */}
                <line
                  x1={`${noseBridge.x * 100}%`}
                  y1={`${(noseBridge.y - 0.08) * 100}%`}
                  x2={`${noseBridge.x * 100}%`}
                  y2={`${(noseBridge.y + 0.08) * 100}%`}
                  stroke="#F59E0B"
                  strokeWidth="1.5"
                  strokeDasharray="3 3"
                />

                {/* Monocular Half-PD Segments */}
                <line
                  x1={`${rightPupil.x * 100}%`}
                  y1={`${rightPupil.y * 100}%`}
                  x2={`${noseBridge.x * 100}%`}
                  y2={`${rightPupil.y * 100}%`}
                  stroke="rgba(244, 63, 94, 0.7)"
                  strokeWidth="1"
                />
                <line
                  x1={`${leftPupil.x * 100}%`}
                  y1={`${leftPupil.y * 100}%`}
                  x2={`${noseBridge.x * 100}%`}
                  y2={`${leftPupil.y * 100}%`}
                  stroke="rgba(16, 185, 129, 0.7)"
                  strokeWidth="1"
                />
              </svg>

              {/* DRAGGABLE TARGET HANDLES */}

              {/* Handle: Card Left Edge */}
              <div
                onPointerDown={(e) => handlePointerDown('card_left', e)}
                style={{
                  left: `${cardBounds.left * 100}%`,
                  top: `${((cardBounds.top + cardBounds.bottom) / 2) * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-20 group ${
                  activeHandle === 'card_left' ? 'scale-125' : ''
                }`}
              >
                <div className="w-5 h-8 rounded bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-white/80" />
                </div>
              </div>

              {/* Handle: Card Right Edge */}
              <div
                onPointerDown={(e) => handlePointerDown('card_right', e)}
                style={{
                  left: `${cardBounds.right * 100}%`,
                  top: `${((cardBounds.top + cardBounds.bottom) / 2) * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-ew-resize z-20 group ${
                  activeHandle === 'card_right' ? 'scale-125' : ''
                }`}
              >
                <div className="w-5 h-8 rounded bg-rose-600 border-2 border-white shadow-lg flex items-center justify-center">
                  <div className="w-0.5 h-4 bg-white/80" />
                </div>
              </div>

              {/* Handle: Right Pupil (OD - Patient's Right Eye / Viewer's Left) */}
              <div
                onPointerDown={(e) => handlePointerDown('right_pupil', e)}
                style={{
                  left: `${rightPupil.x * 100}%`,
                  top: `${rightPupil.y * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move z-30 transition-transform ${
                  activeHandle === 'right_pupil' ? 'scale-125 ring-4 ring-rose-500/60' : 'hover:scale-110'
                }`}
              >
                <div className="relative w-8 h-8 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/25 flex items-center justify-center shadow-[0_0_15px_#FF1744]">
                  <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                  <div className="absolute w-10 h-[1.5px] bg-[#FF1744]" />
                  <div className="absolute h-10 w-[1.5px] bg-[#FF1744]" />
                </div>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-rose-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-rose-500/30 whitespace-nowrap shadow-md">
                  OD: {calculations.rightMonocularPd}mm
                </span>
              </div>

              {/* Handle: Left Pupil (OG - Patient's Left Eye / Viewer's Right) */}
              <div
                onPointerDown={(e) => handlePointerDown('left_pupil', e)}
                style={{
                  left: `${leftPupil.x * 100}%`,
                  top: `${leftPupil.y * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move z-30 transition-transform ${
                  activeHandle === 'left_pupil' ? 'scale-125 ring-4 ring-cyan-500/60' : 'hover:scale-110'
                }`}
              >
                <div className="relative w-8 h-8 rounded-full border-2 border-[#00E5FF] bg-[#00E5FF]/25 flex items-center justify-center shadow-[0_0_15px_#00E5FF]">
                  <div className="w-2.5 h-2.5 rounded-full bg-white shadow-[0_0_8px_white]" />
                  <div className="absolute w-10 h-[1.5px] bg-[#00E5FF]" />
                  <div className="absolute h-10 w-[1.5px] bg-[#00E5FF]" />
                </div>
                <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono font-bold text-cyan-300 bg-slate-950/90 px-1.5 py-0.5 rounded border border-cyan-500/30 whitespace-nowrap shadow-md">
                  OG: {calculations.leftMonocularPd}mm
                </span>
              </div>

              {/* Handle: Nose Bridge */}
              <div
                onPointerDown={(e) => handlePointerDown('nose_bridge', e)}
                style={{
                  left: `${noseBridge.x * 100}%`,
                  top: `${noseBridge.y * 100}%`,
                }}
                className={`absolute -translate-x-1/2 -translate-y-1/2 cursor-move z-25 transition-transform ${
                  activeHandle === 'nose_bridge' ? 'scale-125 ring-4 ring-amber-500/60' : 'hover:scale-110'
                }`}
              >
                <div className="w-6 h-6 rounded-full border-2 border-amber-400 bg-amber-500/25 flex items-center justify-center shadow-lg">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                </div>
                <span className="absolute -bottom-4 left-1/2 -translate-x-1/2 text-[9px] font-mono font-bold text-amber-300 bg-slate-950/90 px-1 rounded whitespace-nowrap">
                  Nez
                </span>
              </div>

              {/* LIVE ZOOM LOUPE MAGNIFIER */}
              {showMagnifier && (
                <div
                  style={getLoupeStyle()}
                  className="absolute z-40 bg-slate-950/95 p-2 rounded-2xl border-2 border-cyan-500/80 shadow-2xl backdrop-blur-md flex flex-col items-center gap-1.5 pointer-events-auto transition-all duration-150"
                >
                  {/* Loupe Header */}
                  <div className="flex items-center justify-between w-full px-1 text-[10px] text-slate-300 font-medium">
                    <span className="flex items-center gap-1 text-cyan-300 font-bold">
                      <ZoomIn className="w-3.5 h-3.5" /> Loupe x{zoomFactor}
                    </span>
                    <div className="flex items-center gap-1">
                      {/* Toggle placement mode */}
                      <button
                        onClick={() => setLoupeMode((m) => (m === 'follow' ? 'corner' : 'follow'))}
                        title={loupeMode === 'follow' ? 'Loupe fixée au coin' : 'Loupe qui suit la cible'}
                        className="px-1.5 py-0.5 rounded text-[9px] bg-slate-800 hover:bg-slate-700 text-slate-300 font-mono transition"
                      >
                        {loupeMode === 'follow' ? 'Flottante' : 'Coin'}
                      </button>
                    </div>
                  </div>

                  {/* Canvas Viewport (100% matched to active target center) */}
                  <div className="w-40 h-40 rounded-xl overflow-hidden border border-slate-700 bg-black relative shadow-inner">
                    <canvas ref={magnifierCanvasRef} className="w-full h-full object-cover" />
                  </div>

                  {/* Loupe Footer */}
                  <div className="flex items-center justify-between w-full text-[9px] text-slate-400 px-0.5">
                    <span className="font-mono text-cyan-200 uppercase font-semibold">
                      {activeHandle?.replace('_', ' ')}
                    </span>
                    <div className="flex gap-1">
                      {[2.5, 3.5, 5].map((z) => (
                        <button
                          key={z}
                          onClick={() => setZoomFactor(z)}
                          className={`px-1.5 py-0.5 rounded text-[9px] font-mono transition ${
                            zoomFactor === z
                              ? 'bg-cyan-500 text-black font-bold'
                              : 'bg-slate-800 text-slate-300 hover:text-white'
                          }`}
                        >
                          {z}x
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Quick Selection Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-400 text-xs font-semibold">Cible active :</span>
              {[
                { id: 'right_pupil', label: 'Pupille Droite (OD)', color: 'text-rose-400 border-rose-500/40 bg-rose-500/10' },
                { id: 'left_pupil', label: 'Pupille Gauche (OG)', color: 'text-cyan-400 border-cyan-500/40 bg-cyan-500/10' },
                { id: 'nose_bridge', label: 'Pont Nasal (Nez)', color: 'text-amber-400 border-amber-500/40 bg-amber-500/10' },
                { id: 'card_left', label: 'Bord Carte Gauche', color: 'text-slate-300 border-slate-700 bg-slate-800' },
                { id: 'card_right', label: 'Bord Carte Droit', color: 'text-slate-300 border-slate-700 bg-slate-800' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveHandle(item.id as ActiveHandle)}
                  className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition ${
                    activeHandle === item.id
                      ? `${item.color} ring-2 ring-white/30`
                      : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>

            {/* Loupe toggle */}
            <button
              onClick={() => setShowMagnifier((prev) => !prev)}
              className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold flex items-center gap-1"
            >
              <Crosshair className="w-3.5 h-3.5" />
              <span>{showMagnifier ? 'Masquer la loupe' : 'Afficher la loupe'}</span>
            </button>
          </div>
        </div>

        {/* Sidebar Controls & Real-time Metrics (4 cols) */}
        <div className="lg:col-span-4 flex flex-col gap-4">
          {/* Micro-Step D-Pad for Precision Adjustment */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-white flex items-center gap-2">
                <Move className="w-4 h-4 text-cyan-400" />
                Micro-Réglage au Pixel
              </span>
              <span className="text-[10px] font-mono text-cyan-400 uppercase font-bold">
                {activeHandle ? activeHandle.replace('_', ' ') : 'Sélectionnez un point'}
              </span>
            </div>

            {/* D-Pad Buttons */}
            <div className="flex flex-col items-center gap-1.5 py-1">
              <button
                onClick={() => nudgeActiveHandle(0, -1)}
                className="w-11 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 text-white flex items-center justify-center transition shadow"
                aria-label="Monter"
              >
                <ArrowUp className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => nudgeActiveHandle(-1, 0)}
                  className="w-11 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 text-white flex items-center justify-center transition shadow"
                  aria-label="Gauche"
                >
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <div className="w-11 h-10 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-center text-[10px] font-mono text-slate-500 font-bold">
                  1px
                </div>
                <button
                  onClick={() => nudgeActiveHandle(1, 0)}
                  className="w-11 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 text-white flex items-center justify-center transition shadow"
                  aria-label="Droite"
                >
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
              <button
                onClick={() => nudgeActiveHandle(0, 1)}
                className="w-11 h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 active:scale-95 text-white flex items-center justify-center transition shadow"
                aria-label="Descendre"
              >
                <ArrowDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-[11px] text-slate-400 text-center">
              Déplace le point actif au millimètre près en synchronisation directe avec la loupe.
            </p>
          </div>

          {/* Real-time Optometric Readouts Card */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl space-y-4">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wider block">
              Mesures avec Correction de Convergence
            </span>

            {/* Total PD in Far Vision */}
            <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-300 block">VL Réelle (Infini)</span>
                <span className="text-[10px] text-slate-500">
                  Mesuré à {shootingDistanceCm}cm : {calculations.measuredPdAtShootingDistance}mm
                </span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-black font-mono text-rose-400">
                  {calculations.totalPdDistance}
                </span>
                <span className="text-xs text-rose-300 ml-1 font-semibold">mm</span>
              </div>
            </div>

            {/* Monoculars OD / OG */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-rose-300 uppercase block">Œil Droit (OD)</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-lg font-bold font-mono text-white">
                    {calculations.rightMonocularPd}
                  </span>
                  <span className="text-[10px] text-slate-400">mm</span>
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-slate-800">
                <span className="text-[10px] font-bold text-cyan-300 uppercase block">Œil Gauche (OG)</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-lg font-bold font-mono text-white">
                    {calculations.leftMonocularPd}
                  </span>
                  <span className="text-[10px] text-slate-400">mm</span>
                </div>
              </div>
            </div>

            {/* Near Vision & Intermediate PD */}
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-slate-950 p-2.5 rounded-xl border border-indigo-900/40">
                <span className="text-[10px] font-bold text-indigo-300 uppercase block">Vision Près (40cm)</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-bold font-mono text-indigo-400">
                    {calculations.nearVisionPd}
                  </span>
                  <span className="text-[10px] text-slate-400">mm</span>
                </div>
              </div>
              <div className="bg-slate-950 p-2.5 rounded-xl border border-teal-900/40">
                <span className="text-[10px] font-bold text-teal-300 uppercase block">Écran (65cm)</span>
                <div className="flex items-baseline justify-between mt-1">
                  <span className="text-base font-bold font-mono text-teal-400">
                    {calculations.intermediateVisionPd}
                  </span>
                  <span className="text-[10px] text-slate-400">mm</span>
                </div>
              </div>
            </div>

            {/* Physiological warning if outside 54-74mm */}
            {calculations.physiologicalWarning && (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex items-start gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>{calculations.physiologicalWarning}</span>
              </div>
            )}

            {/* Confirm & Validate button */}
            <button
              onClick={() =>
                onConfirm(calculations, {
                  rightPupil,
                  leftPupil,
                  noseBridge,
                  cardBounds,
                })
              }
              className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-950/50 flex items-center justify-center gap-2 active:scale-98 transition"
            >
              <Check className="w-5 h-5" />
              <span>Valider & Générer le Rapport</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
