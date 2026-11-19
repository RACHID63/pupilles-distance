import React, { useEffect, useRef, useState } from 'react';
import { AiProvider } from '../types/optometry';
import {
  analyzeVideoFrameForTelemeter,
  calibrateFocalFromTwoSteps,
  getSavedFocalConstant,
  resetFocalConstant,
  saveFocalConstant,
} from '../utils/distanceEstimator';
import { playCountdownBeep, speakFrench } from '../utils/audio';
import {
  Radar,
  Sparkles,
  Crosshair,
  RotateCcw,
  Check,
  Loader2,
  SlidersHorizontal,
  ArrowLeftRight,
} from 'lucide-react';

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  facingMode: 'user' | 'environment';
  aiProvider: AiProvider;
  voiceGuidanceEnabled: boolean;
  currentDistanceCm: number;
  onDistanceDetected: (distanceCm: number) => void;
}

type TelemeterPhase = 'idle' | 'waiting_contact' | 'zero_contact' | 'receding' | 'locked';

export const LiveDistanceTelemeter: React.FC<Props> = ({
  videoRef,
  facingMode,
  aiProvider,
  voiceGuidanceEnabled,
  currentDistanceCm,
  onDistanceDetected,
}) => {
  const scratchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [phase, setPhase] = useState<TelemeterPhase>('idle');
  const [liveDistanceCm, setLiveDistanceCm] = useState<number>(0);
  const [luminance, setLuminance] = useState<number>(0);
  const [cardFraction, setCardFraction] = useState<number | null>(null);
  const [focalK, setFocalK] = useState<number>(() => getSavedFocalConstant());

  // AI instant verification state
  const [isAiEstimating, setIsAiEstimating] = useState<boolean>(false);
  const [aiResultNote, setAiResultNote] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  // 2-step focal calibration state (Astuce ΔD = 8.56 cm)
  const [showCalibrator, setShowCalibrator] = useState<boolean>(false);
  const [calStep1Fraction, setCalStep1Fraction] = useState<number | null>(null);
  const [calStatus, setCalStatus] = useState<string | null>(null);

  // Refs for smooth EMA & motion tracking
  const smoothedCmRef = useRef<number>(0);
  const phaseRef = useRef<TelemeterPhase>('idle');
  const zeroTimestampRef = useRef<number>(0);
  const inertialDisplacementCmRef = useRef<number>(0);
  const inertialVelocityRef = useRef<number>(0);
  const lastMotionTsRef = useRef<number>(0);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Capture current video frame as JPEG base64 for AI distance check
  const captureFrameBase64 = (): string | null => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.min(960, video.videoWidth);
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.85);
  };

  // Optional DeviceMotion Z-axis pullback integration during the 0 -> 12 cm liftoff
  useEffect(() => {
    if (phase !== 'zero_contact' && phase !== 'receding') return;

    const handleMotion = (event: DeviceMotionEvent) => {
      const accZ = event.acceleration?.z;
      if (typeof accZ !== 'number' || !Number.isFinite(accZ)) return;
      const now = performance.now();
      if (!lastMotionTsRef.current) {
        lastMotionTsRef.current = now;
        return;
      }
      const dt = Math.min(0.1, (now - lastMotionTsRef.current) / 1000);
      lastMotionTsRef.current = now;

      // Deadzone filter to prevent sensor drift
      const filteredAcc = Math.abs(accZ) > 0.35 ? accZ : 0;
      inertialVelocityRef.current = inertialVelocityRef.current * 0.9 + filteredAcc * dt;
      // Convert m -> cm
      const deltaCm = Math.abs(inertialVelocityRef.current) * dt * 100;
      inertialDisplacementCmRef.current = Math.min(
        35,
        inertialDisplacementCmRef.current + deltaCm
      );
    };

    window.addEventListener('devicemotion', handleMotion);
    return () => window.removeEventListener('devicemotion', handleMotion);
  }, [phase]);

  // Real-time optical loop (~8 fps) when telemeter is active
  useEffect(() => {
    if (phase === 'idle' || phase === 'locked') return;

    if (!scratchCanvasRef.current) {
      scratchCanvasRef.current = document.createElement('canvas');
    }

    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = scratchCanvasRef.current;
      if (!video || !canvas) return;

      const sample = analyzeVideoFrameForTelemeter(video, canvas);
      if (!sample) return;

      setLuminance(Math.round(sample.meanLuminance));

      // 1. Waiting for user to press camera against forehead/card (0 cm contact)
      if (phaseRef.current === 'waiting_contact') {
        if (sample.isContactZero) {
          setPhase('zero_contact');
          setLiveDistanceCm(0);
          smoothedCmRef.current = 0;
          zeroTimestampRef.current = performance.now();
          inertialDisplacementCmRef.current = 0;
          inertialVelocityRef.current = 0;
          playCountdownBeep(false);
        }
        return;
      }

      // 2. At 0 cm contact: wait for liftoff (luminance rises or sharpness returns)
      if (phaseRef.current === 'zero_contact') {
        if (!sample.isContactZero && performance.now() - zeroTimestampRef.current > 350) {
          setPhase('receding');
        } else {
          setLiveDistanceCm(0);
          return;
        }
      }

      // 3. Receding phase: combine initial liftoff ramp/inertial delta with optical card width
      if (phaseRef.current === 'receding') {
        // If re-occluded completely, snap back to 0 cm
        if (sample.isContactZero) {
          setPhase('zero_contact');
          setLiveDistanceCm(0);
          smoothedCmRef.current = 0;
          return;
        }

        if (sample.estimatedCardFraction && sample.opticalConfidence > 0.25) {
          setCardFraction(sample.estimatedCardFraction);
          const rawOpticalCm = Math.max(
            7,
            Math.min(180, focalK / sample.estimatedCardFraction)
          );
          smoothedCmRef.current =
            smoothedCmRef.current < 4
              ? rawOpticalCm
              : smoothedCmRef.current * 0.72 + rawOpticalCm * 0.28;

          const rounded = Math.round(smoothedCmRef.current);
          setLiveDistanceCm(rounded);
          if (rounded >= 15) {
            onDistanceDetected(Math.max(20, Math.min(200, rounded)));
          }
        } else {
          // Near-field liftoff estimate (0 -> 14 cm) from luminance recovery + optional inertial Z
          const elapsedSec = (performance.now() - zeroTimestampRef.current) / 1000;
          const lumRampCm = Math.min(12, Math.max(1, (sample.meanLuminance / 110) * 9 + elapsedSec * 2));
          const liftoffCm = Math.max(lumRampCm, inertialDisplacementCmRef.current);
          smoothedCmRef.current = smoothedCmRef.current * 0.7 + liftoffCm * 0.3;
          setLiveDistanceCm(Math.round(smoothedCmRef.current));
        }
      }
    }, 125);

    return () => clearInterval(interval);
  }, [phase, focalK, videoRef, onDistanceDetected]);

  const handleStartZeroSequence = () => {
    setAiError(null);
    setAiResultNote(null);
    setCardFraction(null);
    setLiveDistanceCm(0);
    smoothedCmRef.current = 0;
    setPhase('waiting_contact');
    speakFrench(
      "Collez doucement l'objectif contre votre front pour calibrer le zéro, puis reculez.",
      voiceGuidanceEnabled
    );
  };

  const handleForceZeroNow = () => {
    setAiError(null);
    setLiveDistanceCm(0);
    smoothedCmRef.current = 0;
    zeroTimestampRef.current = performance.now();
    inertialDisplacementCmRef.current = 0;
    inertialVelocityRef.current = 0;
    setPhase('zero_contact');
    playCountdownBeep(false);
    speakFrench('Zéro calibré. Éloignez maintenant l’appareil doucement.', voiceGuidanceEnabled);
  };

  const handleLockCurrentDistance = () => {
    const finalCm = Math.max(20, Math.min(200, liveDistanceCm || currentDistanceCm));
    setPhase('locked');
    onDistanceDetected(finalCm);
    playCountdownBeep(true);
  };

  // Call server AI endpoint to evaluate exact distance from card + iris + perspective
  const handleEstimateWithAi = async () => {
    const imageBase64 = captureFrameBase64();
    if (!imageBase64) {
      setAiError('Flux vidéo non disponible.');
      return;
    }

    setIsAiEstimating(true);
    setAiError(null);
    try {
      const res = await fetch('/api/estimate-distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          provider: aiProvider,
          focalConstant: focalK,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json?.error || `Erreur serveur (${res.status})`);
      }

      const d = json.data;
      const estCm = Math.max(15, Math.min(250, Math.round(d.estimated_distance_cm)));
      setLiveDistanceCm(estCm);
      if (typeof d.card_width_fraction === 'number' && d.card_width_fraction > 0) {
        setCardFraction(d.card_width_fraction);
      }
      setPhase('locked');
      onDistanceDetected(Math.max(20, Math.min(200, estCm)));
      setAiResultNote(
        `IA (${json.provider === 'deepseek' ? 'DeepSeek' : 'Gemini'}) : ~${estCm} cm — ${d.explanation || ''}`
      );
      playCountdownBeep(true);
      speakFrench(`Distance estimée par l'intelligence artificielle : ${estCm} centimètres.`, voiceGuidanceEnabled);
    } catch (err: any) {
      setAiError(err?.message || "Impossible d'estimer la distance par IA.");
    } finally {
      setIsAiEstimating(false);
    }
  };

  // 2-step focal calibration (captures card_width_fraction via AI at step 1, then after +8.56cm pullback)
  const handleCalibrateStep = async (step: 1 | 2) => {
    const imageBase64 = captureFrameBase64();
    if (!imageBase64) return;
    setIsAiEstimating(true);
    setCalStatus(step === 1 ? 'Analyse position 1...' : 'Calcul de votre focale réelle...');
    setAiError(null);
    try {
      const res = await fetch('/api/estimate-distance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
          provider: aiProvider,
          focalConstant: focalK,
        }),
      });
      const json = await res.json();
      const frac = json?.data?.card_width_fraction;
      if (!res.ok || typeof frac !== 'number' || frac < 0.05) {
        throw new Error('Carte bancaire non détectée clairement à cette étape.');
      }

      if (step === 1) {
        setCalStep1Fraction(frac);
        setCalStatus('Étape 1 OK ! Reculez maintenant d’exactement 1 largeur de carte (8.56 cm) et cliquez Étape 2.');
      } else {
        if (!calStep1Fraction) return;
        const result = calibrateFocalFromTwoSteps(calStep1Fraction, frac, 8.56);
        if (!result) {
          throw new Error('Recul insuffisant entre les deux captures. Réessayez en reculant davantage.');
        }
        const saved = saveFocalConstant(result.focalConstant);
        setFocalK(saved);
        setLiveDistanceCm(result.d2Cm);
        onDistanceDetected(Math.max(20, Math.min(200, result.d2Cm)));
        setCalStep1Fraction(null);
        setCalStatus(`Focale calibrée (K=${saved}) ! Distance mesurée : ${result.d2Cm} cm.`);
        playCountdownBeep(true);
      }
    } catch (err: any) {
      setCalStatus(null);
      setAiError(err?.message || 'Erreur lors de la calibration.');
    } finally {
      setIsAiEstimating(false);
    }
  };

  return (
    <div className="w-full mt-2.5 p-4 bg-slate-900/95 border border-cyan-500/30 rounded-2xl shadow-xl space-y-3 animate-in fade-in duration-200">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Radar className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">
                Télémètre Optique (Départ 0 cm → Recul) & IA
              </h4>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400">
                K={focalK}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Collez l'objectif à 0 cm puis reculez pour incrémenter la distance, ou mesurez directement par IA.
            </p>
          </div>
        </div>

        {/* Live Big Readout */}
        <div className="flex items-center gap-3 bg-slate-950 px-3.5 py-2 rounded-xl border border-slate-800">
          <div className="text-right">
            <span className="text-[10px] font-mono uppercase block text-slate-400">
              {phase === 'waiting_contact'
                ? 'Approchez à 0 cm...'
                : phase === 'zero_contact'
                  ? 'CONTACT ZÉRO'
                  : phase === 'receding'
                    ? 'RECUL EN COURS'
                    : phase === 'locked'
                      ? 'DISTANCE VERROUILLÉE'
                      : 'PRÊT'}
            </span>
            <span className="text-2xl font-black font-mono text-cyan-400 leading-none">
              {phase === 'idle' ? currentDistanceCm : liveDistanceCm}
              <span className="text-xs text-cyan-300 ml-1">cm</span>
            </span>
          </div>
          <div
            className={`w-3 h-3 rounded-full ${
              phase === 'zero_contact'
                ? 'bg-emerald-400 animate-ping'
                : phase === 'receding'
                  ? 'bg-cyan-400 animate-pulse'
                  : phase === 'waiting_contact'
                    ? 'bg-amber-400 animate-pulse'
                    : 'bg-slate-600'
            }`}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={handleStartZeroSequence}
          className="px-3 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-bold flex items-center gap-1.5 transition"
        >
          <Crosshair className="w-4 h-4" />
          <span>1. Armer Contact 0 cm (Auto)</span>
        </button>

        <button
          onClick={handleForceZeroNow}
          className="px-3 py-2 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition"
          title="Utilisez ce bouton si l'objectif est déjà collé au visage dans une pièce très lumineuse"
        >
          <span>Posé à 0 cm (Forcer Zéro)</span>
        </button>

        {phase === 'receding' && (
          <button
            onClick={handleLockCurrentDistance}
            className="px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 shadow transition"
          >
            <Check className="w-4 h-4" />
            <span>Figer à {liveDistanceCm} cm</span>
          </button>
        )}

        <button
          onClick={handleEstimateWithAi}
          disabled={isAiEstimating}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold flex items-center gap-1.5 shadow-md shadow-rose-950/40 transition disabled:opacity-50"
        >
          {isAiEstimating ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Sparkles className="w-4 h-4" />
          )}
          <span>Estimer Distance par IA</span>
        </button>

        <button
          onClick={() => setShowCalibrator((prev) => !prev)}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition ml-auto ${
            showCalibrator
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
              : 'bg-slate-950 text-slate-400 border-slate-800 hover:text-slate-200'
          }`}
        >
          <SlidersHorizontal className="w-3.5 h-3.5" />
          <span>Calibrer Caméra</span>
        </button>
      </div>

      {/* Live guidance / telemetry strip */}
      {phase !== 'idle' && (
        <div className="px-3 py-2 rounded-xl bg-slate-950/80 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
          <span>
            {phase === 'waiting_contact' &&
              "Approchez et collez l'objectif contre la carte/le front jusqu'au passage automatique à 0 cm (ou cliquez « Posé à 0 cm »)."}
            {phase === 'zero_contact' &&
              '0 cm détecté ! Éloignez lentement l’appareil face à votre visage pour démarrer le compteur.'}
            {phase === 'receding' &&
              (cardFraction
                ? `Carte détectée optiquement (${Math.round(cardFraction * 100)}% de la largeur) → ${liveDistanceCm} cm.`
                : 'Recul initial détecté... Placez la carte bien en face dans le cadre pointillé.')}
            {phase === 'locked' &&
              `Distance réglée à ${liveDistanceCm} cm pour la compensation de convergence.`}
          </span>
          <span className="font-mono text-[10px] text-slate-500">Lum: {luminance}/255</span>
        </div>
      )}

      {/* AI Result or Error */}
      {aiResultNote && (
        <div className="p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-xs text-emerald-200">
          {aiResultNote}
        </div>
      )}
      {aiError && (
        <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-xs text-rose-200">
          {aiError}
        </div>
      )}

      {/* 2-Step Card Shift Focal Calibrator (Astuce ΔD = 8.56 cm) */}
      {showCalibrator && (
        <div className="p-3 rounded-xl bg-slate-950 border border-amber-500/30 space-y-2.5 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-300 flex items-center gap-1.5">
              <ArrowLeftRight className="w-4 h-4" />
              Astuce de Calibration Focale (Recul de 1 carte = 8.56 cm)
            </span>
            <button
              onClick={() => {
                const def = resetFocalConstant();
                setFocalK(def);
                setCalStep1Fraction(null);
                setCalStatus('Focale réinitialisée aux valeurs standard (66° HFOV).');
              }}
              className="text-[11px] text-slate-400 hover:text-white flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Réinitialiser</span>
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-relaxed">
            Pour connaître la focale exacte de votre objectif sans règle graduée : placez la carte sur le front, cliquez <strong className="text-white">Étape 1</strong>, reculez l'appareil d'exactement <strong className="text-white">1 largeur de carte (8.56 cm)</strong>, puis cliquez <strong className="text-white">Étape 2</strong>.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => handleCalibrateStep(1)}
              disabled={isAiEstimating}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-semibold disabled:opacity-50"
            >
              Étape 1 : Capturer Position Proche
            </button>
            <button
              onClick={() => handleCalibrateStep(2)}
              disabled={isAiEstimating || !calStep1Fraction}
              className="px-3 py-1.5 rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-semibold disabled:opacity-40"
            >
              Étape 2 : Reculé de +8.56 cm
            </button>
          </div>
          {calStatus && <p className="text-[11px] text-cyan-300 font-medium">{calStatus}</p>}
        </div>
      )}
    </div>
  );
};
