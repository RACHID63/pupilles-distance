import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { CameraCapture } from './components/CameraCapture';
import { AdjustmentCanvas } from './components/AdjustmentCanvas';
import { ResultsReport } from './components/ResultsReport';
import { OptometryGuideModal } from './components/OptometryGuideModal';
import { MeasurementHistory } from './components/MeasurementHistory';
import {
  CardBounds,
  DetectionResult,
  OptometricCalculations,
  Point2D,
  SavedMeasurement,
  DEFAULT_SHOOTING_DISTANCE_CM,
} from './types/optometry';
import { playSuccessChime, speakFrench } from './utils/audio';
import { Eye } from 'lucide-react';

export default function App() {
  // Navigation step: 'capture' | 'detecting' | 'adjust' | 'results'
  const [step, setStep] = useState<'capture' | 'detecting' | 'adjust' | 'results'>('capture');

  // Captured Photo Base64
  const [capturedImage, setCapturedImage] = useState<string | null>(null);

  // Shooting distance in cm (default 60 cm - bras tendu)
  const [shootingDistanceCm, setShootingDistanceCm] = useState<number>(DEFAULT_SHOOTING_DISTANCE_CM);

  // Detection Coordinates from AI or Fallback
  const [cardBounds, setCardBounds] = useState<CardBounds>({
    left: 0.35,
    right: 0.65,
    top: 0.18,
    bottom: 0.36,
  });
  const [rightPupil, setRightPupil] = useState<Point2D>({ x: 0.42, y: 0.52 });
  const [leftPupil, setLeftPupil] = useState<Point2D>({ x: 0.58, y: 0.52 });
  const [noseBridge, setNoseBridge] = useState<Point2D>({ x: 0.5, y: 0.52 });
  const [aiConfidence, setAiConfidence] = useState<number | undefined>(undefined);
  const [aiNotes, setAiNotes] = useState<string | undefined>(undefined);

  // Final Calculations for Results
  const [finalCalculations, setFinalCalculations] = useState<OptometricCalculations | null>(null);
  const [finalPoints, setFinalPoints] = useState<{
    rightPupil: Point2D;
    leftPupil: Point2D;
    noseBridge: Point2D;
    cardBounds: CardBounds;
  } | null>(null);

  // Modals & UI States
  const [isGuideOpen, setIsGuideOpen] = useState<boolean>(false);
  const [isHistoryOpen, setIsHistoryOpen] = useState<boolean>(false);
  const [voiceGuidanceEnabled, setVoiceGuidanceEnabled] = useState<boolean>(true);

  // Detection progress message
  const [detectProgressText, setDetectProgressText] = useState<string>(
    'Analyse biométrique par Vision IA...'
  );

  // Saved measurements from localStorage
  const [savedHistory, setSavedHistory] = useState<SavedMeasurement[]>(() => {
    try {
      const stored = localStorage.getItem('optipd_measurements_v1');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  // Sync history to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('optipd_measurements_v1', JSON.stringify(savedHistory));
    } catch (e) {}
  }, [savedHistory]);

  // Handle Photo Taken from Camera or Upload
  const handlePhotoCaptured = async (imageBase64: string, distanceCm: number) => {
    setCapturedImage(imageBase64);
    setShootingDistanceCm(distanceCm);
    setStep('detecting');

    // Sequence of optometric progress feedback
    setDetectProgressText('1/3 Détection de la carte de référence ID-1...');
    speakFrench('Photo capturée. Analyse de la carte bancaire et des pupilles en cours.', voiceGuidanceEnabled);

    const progressTimer = setTimeout(() => {
      setDetectProgressText('2/3 Localisation des centres pupillaires et du pont nasal...');
    }, 1200);

    try {
      const response = await fetch('/api/detect-pd', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64,
          mimeType: 'image/jpeg',
        }),
      });

      clearTimeout(progressTimer);

      if (!response.ok) {
        throw new Error(`Erreur serveur (${response.status})`);
      }

      const result = await response.json();
      if (result.success && result.data) {
        const data: DetectionResult = result.data;
        setDetectProgressText('3/3 Calibrage optométrique et compensation de convergence...');

        setCardBounds({
          left: Math.min(data.card_left, data.card_right),
          right: Math.max(data.card_left, data.card_right),
          top: Math.min(data.card_top, data.card_bottom),
          bottom: Math.max(data.card_top, data.card_bottom),
        });

        // Ensure right pupil is patient's right (viewer's left: smaller X)
        let rPupil = data.right_pupil;
        let lPupil = data.left_pupil;
        if (rPupil.x > lPupil.x) {
          const temp = rPupil;
          rPupil = lPupil;
          lPupil = temp;
        }

        setRightPupil(rPupil);
        setLeftPupil(lPupil);
        setNoseBridge(data.nose_bridge);
        setAiConfidence(data.confidence ?? 0.95);
        setAiNotes(data.notes);

        playSuccessChime();
        speakFrench('Détection terminée. Vous pouvez vérifier la distance et ajuster les repères.', voiceGuidanceEnabled);
      } else {
        throw new Error('Réponse invalide');
      }
    } catch (error) {
      console.warn('AI detection fallback used:', error);
      // Fallback: reasonable initial positions centered on the face
      setCardBounds({
        left: 0.36,
        right: 0.64,
        top: 0.18,
        bottom: 0.35,
      });
      setRightPupil({ x: 0.42, y: 0.52 });
      setLeftPupil({ x: 0.58, y: 0.52 });
      setNoseBridge({ x: 0.5, y: 0.52 });
      setAiConfidence(0.7);
      setAiNotes('Calibrage manuel requis : ajustez les repères sur votre cliché.');
    } finally {
      setTimeout(() => {
        setStep('adjust');
      }, 400);
    }
  };

  // Handle confirmation from Adjustment Canvas
  const handleConfirmAdjustment = (
    calc: OptometricCalculations,
    points: {
      rightPupil: Point2D;
      leftPupil: Point2D;
      noseBridge: Point2D;
      cardBounds: CardBounds;
    }
  ) => {
    setFinalCalculations(calc);
    setFinalPoints(points);
    setShootingDistanceCm(calc.shootingDistanceCm);
    setStep('results');
    playSuccessChime();
    speakFrench(
      `Votre écart pupillaire en vision de loin est de ${calc.totalPdDistance} millimètres. Demi-écart droit : ${calc.rightMonocularPd} millimètres. Demi-écart gauche : ${calc.leftMonocularPd} millimètres.`,
      voiceGuidanceEnabled
    );
  };

  // Save measurement to history
  const handleSaveToHistory = (measurement: SavedMeasurement) => {
    setSavedHistory((prev) => [measurement, ...prev]);
  };

  // Select item from history to view in Results
  const handleSelectHistoryItem = (item: SavedMeasurement) => {
    setCapturedImage(item.imageUrl);
    setFinalCalculations(item.calculations);
    setFinalPoints(item.points);
    setCardBounds(item.points.cardBounds);
    setRightPupil(item.points.rightPupil);
    setLeftPupil(item.points.leftPupil);
    setNoseBridge(item.points.noseBridge);
    setShootingDistanceCm(item.calculations.shootingDistanceCm || DEFAULT_SHOOTING_DISTANCE_CM);
    setStep('results');
  };

  const handleDeleteHistoryItem = (id: string) => {
    setSavedHistory((prev) => prev.filter((item) => item.id !== id));
  };

  const handleClearHistory = () => {
    if (confirm('Voulez-vous vraiment effacer tout votre historique de mesures ?')) {
      setSavedHistory([]);
    }
  };

  const handleResetToCapture = () => {
    setCapturedImage(null);
    setFinalCalculations(null);
    setFinalPoints(null);
    setStep('capture');
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-rose-500/30 selection:text-rose-200">
      {/* Top Header */}
      <Header
        voiceEnabled={voiceGuidanceEnabled}
        onToggleVoice={() => setVoiceGuidanceEnabled((prev) => !prev)}
        onOpenGuide={() => setIsGuideOpen(true)}
        onOpenHistory={() => setIsHistoryOpen(true)}
        historyCount={savedHistory.length}
        currentStep={step === 'detecting' ? 'capture' : step}
        onReset={handleResetToCapture}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6 flex flex-col items-center">
        {/* STEP 1: CAMERA & VOICE CAPTURE WITH DISTANCE SELECTOR */}
        {step === 'capture' && (
          <CameraCapture
            onPhotoCaptured={handlePhotoCaptured}
            voiceGuidanceEnabled={voiceGuidanceEnabled}
            initialDistanceCm={shootingDistanceCm}
          />
        )}

        {/* LOADING STATE: AI BIOMETRIC ANALYSIS */}
        {step === 'detecting' && (
          <div className="w-full max-w-md py-16 flex flex-col items-center justify-center text-center space-y-6 animate-in fade-in">
            <div className="relative w-24 h-24 rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl flex items-center justify-center">
              <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                <Eye className="w-8 h-8 animate-pulse text-[#FF1744]" />
              </div>
              <div className="absolute inset-0 rounded-3xl border-2 border-rose-500 border-t-transparent animate-spin" />
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-black text-white">Analyse Biométrique en Cours</h3>
              <p className="text-xs font-mono text-rose-300 font-semibold tracking-wide">
                {detectProgressText}
              </p>
              <p className="text-xs text-slate-400 max-w-xs pt-1">
                Détection de la carte de référence ID-1 et compensation de convergence à {shootingDistanceCm} cm.
              </p>
            </div>
          </div>
        )}

        {/* STEP 2: CALIBRATION & ADJUSTMENT CANVAS WITH DISTANCE CONTROLLER */}
        {step === 'adjust' && capturedImage && (
          <AdjustmentCanvas
            imageUrl={capturedImage}
            initialCardBounds={cardBounds}
            initialRightPupil={rightPupil}
            initialLeftPupil={leftPupil}
            initialNoseBridge={noseBridge}
            initialShootingDistanceCm={shootingDistanceCm}
            aiConfidence={aiConfidence}
            aiNotes={aiNotes}
            onConfirm={handleConfirmAdjustment}
            onRetake={handleResetToCapture}
          />
        )}

        {/* STEP 3: OPTOMETRIC RESULTS & PRESCRIPTION WITH CONVERGENCE REPORT */}
        {step === 'results' && capturedImage && finalCalculations && finalPoints && (
          <ResultsReport
            imageUrl={capturedImage}
            calculations={finalCalculations}
            points={finalPoints}
            onSaveToHistory={handleSaveToHistory}
            onModifyAdjustment={() => setStep('adjust')}
            onNewMeasurement={handleResetToCapture}
          />
        )}
      </main>

      {/* Guide Optométrique Modal */}
      <OptometryGuideModal isOpen={isGuideOpen} onClose={() => setIsGuideOpen(false)} />

      {/* Historique Modal */}
      <MeasurementHistory
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        history={savedHistory}
        onDelete={handleDeleteHistoryItem}
        onClearAll={handleClearHistory}
        onSelect={handleSelectHistoryItem}
      />

      {/* Footer */}
      <footer className="w-full py-4 px-6 border-t border-slate-900 bg-slate-950/80 text-center text-xs text-slate-500 flex flex-wrap items-center justify-center gap-3">
        <span>OptiPD • Mesure Écart Pupillaire (PD)</span>
        <span>•</span>
        <span>Norme ISO/IEC 7810 ID-1 (85.60 × 53.98 mm)</span>
        <span>•</span>
        <span>Compensation de Convergence Géométrique</span>
      </footer>
    </div>
  );
}
