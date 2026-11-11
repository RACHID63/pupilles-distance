import React, { useEffect, useRef, useState } from 'react';
import {
  Camera,
  RefreshCw,
  Upload,
  Sparkles,
  Clock,
  AlertCircle,
  CreditCard,
  Ruler,
  Info,
} from 'lucide-react';
import {
  createSpeechCommander,
  playCameraShutter,
  playCountdownBeep,
  speakFrench,
} from '../utils/audio';
import { DEFAULT_SHOOTING_DISTANCE_CM } from '../types/optometry';

interface Props {
  onPhotoCaptured: (imageBase64: string, shootingDistanceCm: number) => void;
  voiceGuidanceEnabled: boolean;
  initialDistanceCm?: number;
}

export const CameraCapture: React.FC<Props> = ({
  onPhotoCaptured,
  voiceGuidanceEnabled,
  initialDistanceCm = DEFAULT_SHOOTING_DISTANCE_CM,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  // Shooting distance state in cm (default 60 cm - bras tendu)
  const [shootingDistanceCm, setShootingDistanceCm] = useState<number>(initialDistanceCm);
  const [showDistanceCustom, setShowDistanceCustom] = useState<boolean>(false);

  // Timer: 0s, 3s, 5s, 10s
  const [timerSeconds, setTimerSeconds] = useState<number>(3);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);

  // Speech Recognition
  const [detectedVoiceWord, setDetectedVoiceWord] = useState<string | null>(null);
  const [speechSupported, setSpeechSupported] = useState<boolean>(true);
  const speechCommanderRef = useRef<any>(null);

  // Flash effect on photo shot
  const [flashActive, setFlashActive] = useState<boolean>(false);

  // Start Camera Stream
  const startCamera = async (mode = facingMode) => {
    try {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
      setPermissionError(null);

      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: mode,
          width: { ideal: 1920, min: 1280 },
          height: { ideal: 1080, min: 720 },
        },
        audio: false,
      };

      const newStream = await navigator.mediaDevices.getUserMedia(constraints);
      setStream(newStream);
      setHasPermission(true);

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (err: any) {
      console.error('Camera access error:', err);
      setHasPermission(false);
      setPermissionError(
        err.name === 'NotAllowedError'
          ? "L'accès à la caméra a été refusé. Veuillez autoriser la caméra dans votre navigateur ou importer une photo."
          : "Impossible d'accéder à la caméra. Vérifiez qu'elle n'est pas déjà utilisée par une autre application."
      );
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    };
  }, [facingMode]);

  // Voice Guidance on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      speakFrench(
        "Bienvenue. Placez votre carte bancaire bien à plat contre votre front. Fixez l'objectif sans cligner des yeux. Dites 'Photo' ou cliquez sur le déclencheur.",
        voiceGuidanceEnabled
      );
    }, 800);
    return () => clearTimeout(timer);
  }, [voiceGuidanceEnabled]);

  // Speech Recognition setup
  useEffect(() => {
    const commander = createSpeechCommander({
      onPhotoDetected: (word) => {
        if (isCapturing || countdown !== null) return;
        setDetectedVoiceWord(word);
        speakFrench('Prise de vue en cours !', voiceGuidanceEnabled);
        setTimeout(() => {
          setDetectedVoiceWord(null);
        }, 2500);
        triggerCaptureWithTimer();
      },
      onError: (err) => {
        console.warn('Voice command warning:', err);
      },
    });

    if (commander.isSupported) {
      setSpeechSupported(true);
      speechCommanderRef.current = commander;
      commander.start();
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (speechCommanderRef.current) {
        speechCommanderRef.current.stop();
      }
    };
  }, [voiceGuidanceEnabled, timerSeconds, shootingDistanceCm]);

  // Execute snapshot from video
  const takeSnapshot = () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Trigger visual flash and sound
    setFlashActive(true);
    playCameraShutter();
    setTimeout(() => setFlashActive(false), 220);

    // If front camera, un-mirror for proper anatomical positioning
    if (facingMode === 'user') {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const base64 = canvas.toDataURL('image/jpeg', 0.95);
    onPhotoCaptured(base64, shootingDistanceCm);
  };

  // Trigger capture sequence with countdown
  const triggerCaptureWithTimer = () => {
    if (isCapturing) return;

    if (timerSeconds === 0) {
      takeSnapshot();
      return;
    }

    setIsCapturing(true);
    let remaining = timerSeconds;
    setCountdown(remaining);
    playCountdownBeep(false);

    const interval = setInterval(() => {
      remaining -= 1;
      if (remaining > 0) {
        setCountdown(remaining);
        playCountdownBeep(false);
      } else {
        clearInterval(interval);
        setCountdown(null);
        playCountdownBeep(true);
        takeSnapshot();
        setIsCapturing(false);
      }
    }, 1000);
  };

  // File Upload handler
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const result = event.target?.result as string;
      if (result) {
        playCameraShutter();
        onPhotoCaptured(result, shootingDistanceCm);
      }
    };
    reader.readAsDataURL(file);
  };

  const toggleCamera = () => {
    setFacingMode((prev) => (prev === 'user' ? 'environment' : 'user'));
  };

  return (
    <div className="relative w-full max-w-4xl mx-auto flex flex-col items-center">
      {/* Voice Command Banner */}
      {detectedVoiceWord && (
        <div className="absolute top-4 z-40 px-6 py-2.5 rounded-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white font-bold text-sm shadow-xl shadow-emerald-900/50 flex items-center gap-2 animate-bounce">
          <Sparkles className="w-4 h-4" />
          <span>Commande vocale détectée : « {detectedVoiceWord} » ! 📸</span>
        </div>
      )}

      {/* Main Viewport Container */}
      <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] bg-slate-950 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl shadow-rose-950/20">
        {/* Flash overlay */}
        {flashActive && (
          <div className="absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-200" />
        )}

        {/* Camera Permission Error State */}
        {hasPermission === false && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-6 text-center bg-slate-950/95 space-y-4">
            <div className="w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-8 h-8" />
            </div>
            <div className="max-w-md space-y-2">
              <h4 className="text-lg font-bold text-white">Accès Caméra Requis</h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                {permissionError || "Veuillez autoriser l'accès à la caméra pour scanner votre visage en temps réel."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                onClick={() => startCamera()}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Réessayer la caméra</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-rose-900/40 transition"
              >
                <Upload className="w-4 h-4" />
                <span>Importer une photo du front</span>
              </button>
            </div>
          </div>
        )}

        {/* Live Video Feed */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`w-full h-full object-cover transition-transform duration-300 ${
            facingMode === 'user' ? 'scale-x-[-1]' : ''
          }`}
          onLoadedMetadata={() => setHasPermission(true)}
        />

        {/* OVERLAY 1: Animated Red Pupil Tracker & Credit Card Alignment Guide */}
        <div className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col items-center justify-center">
          {/* Top Instruction Pill */}
          <div className="absolute top-4 px-4 py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-xs text-slate-200 font-medium flex items-center gap-2 shadow-lg">
            <CreditCard className="w-4 h-4 text-rose-400" />
            <span>Posez la carte bancaire sur le front • Fixez l'objectif</span>
          </div>

          {/* Dotted Credit Card Outline Guide on Forehead (ISO ID-1 proportions: 85.60 x 53.98 = ratio ~1.586) */}
          <div className="relative w-48 sm:w-60 aspect-[85.6/53.98] border-2 border-dashed border-rose-400/80 bg-rose-500/10 rounded-xl mb-6 shadow-[0_0_20px_rgba(244,63,94,0.25)] flex flex-col items-center justify-between p-2.5">
            <div className="w-full flex items-center justify-between text-[10px] text-rose-300/90 font-mono">
              <span className="font-semibold tracking-wide">ID-1 85.60 mm</span>
              <div className="w-4 h-3 rounded-sm border border-rose-400/50 bg-rose-400/20" />
            </div>
            <div className="text-center">
              <span className="text-[11px] font-bold text-white tracking-wider uppercase block">
                CARTE BANCAIRE ICI
              </span>
              <span className="text-[9px] text-rose-200/80">Contre le front, bien droite</span>
            </div>
            <div className="w-full flex justify-between text-[9px] text-rose-300/70 font-mono">
              <span>H: 53.98 mm</span>
              <span>ISO/IEC 7810</span>
            </div>

            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-3 h-3 border-t-2 border-l-2 border-rose-400" />
            <div className="absolute -top-1 -right-1 w-3 h-3 border-t-2 border-r-2 border-rose-400" />
            <div className="absolute -bottom-1 -left-1 w-3 h-3 border-b-2 border-l-2 border-rose-400" />
            <div className="absolute -bottom-1 -right-1 w-3 h-3 border-b-2 border-r-2 border-rose-400" />
          </div>

          {/* Red Pupil Tracker : Two Neon Red (#FF1744) Circular Reticles */}
          <div className="relative w-56 sm:w-64 flex items-center justify-between px-2">
            {/* Eye Right (OD - Patient) */}
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/15 animate-pupil-glow flex items-center justify-center">
                <div className="absolute w-14 h-[1.5px] bg-[#FF1744]/70" />
                <div className="absolute h-14 w-[1.5px] bg-[#FF1744]/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF1744] shadow-[0_0_12px_#FF1744] border border-white" />
              </div>
              <span className="absolute -bottom-5 text-[9px] font-mono font-bold text-rose-300 tracking-wider">
                ŒIL DROIT
              </span>
            </div>

            {/* Nose Bridge alignment cross */}
            <div className="w-4 h-4 flex items-center justify-center text-amber-400/80">
              <div className="w-3 h-[1px] bg-amber-400/70" />
              <div className="h-3 w-[1px] bg-amber-400/70 absolute" />
            </div>

            {/* Eye Left (OG - Patient) */}
            <div className="relative flex items-center justify-center">
              <div className="w-12 h-12 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/15 animate-pupil-glow flex items-center justify-center">
                <div className="absolute w-14 h-[1.5px] bg-[#FF1744]/70" />
                <div className="absolute h-14 w-[1.5px] bg-[#FF1744]/70" />
                <div className="w-2.5 h-2.5 rounded-full bg-[#FF1744] shadow-[0_0_12px_#FF1744] border border-white" />
              </div>
              <span className="absolute -bottom-5 text-[9px] font-mono font-bold text-rose-300 tracking-wider">
                ŒIL GAUCHE
              </span>
            </div>
          </div>

          {/* Animated Horizontal Laser Scan Line */}
          <div className="absolute left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-[#FF1744] to-transparent shadow-[0_0_14px_#FF1744] animate-laser-scan pointer-events-none" />

          {/* Voice status indicator badge */}
          {speechSupported && (
            <div className="absolute bottom-4 px-3.5 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 flex items-center gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-0.5 h-4">
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-1" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-2" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-3" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-4" />
              </div>
              <span className="text-[11px] font-medium">
                Écoute vocale active : Dites <strong className="text-white">« Photo »</strong> ou <strong className="text-white">« Cheese »</strong>
              </span>
            </div>
          )}
        </div>

        {/* Big Countdown Overlay */}
        {countdown !== null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="flex flex-col items-center">
              <span className="text-8xl sm:text-9xl font-black text-white font-mono drop-shadow-[0_0_35px_rgba(255,23,68,0.8)] animate-pulse">
                {countdown}
              </span>
              <p className="text-rose-300 text-sm font-semibold tracking-wider uppercase mt-2">
                Ne clignez pas des yeux...
              </p>
            </div>
          </div>
        )}
      </div>

      {/* NEW: Shooting Distance Selector Bar */}
      <div className="w-full mt-3 p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <Ruler className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-white">Distance de la Prise de Vue</span>
              <span className="text-[10px] font-mono font-bold bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded border border-cyan-500/30">
                {shootingDistanceCm >= 200 ? '200+ cm (Infini)' : `${shootingDistanceCm} cm`}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Permet de compenser la convergence naturelle des yeux vers l'objectif
            </p>
          </div>
        </div>

        {/* Presets & Custom toggle */}
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { cm: 40, label: '40 cm' },
            { cm: 50, label: '50 cm' },
            { cm: 60, label: '60 cm (Bras tendu)', recommended: true },
            { cm: 100, label: '1 m (Tiers)' },
            { cm: 200, label: '2 m+ (Infini)' },
          ].map((preset) => (
            <button
              key={preset.cm}
              onClick={() => {
                setShootingDistanceCm(preset.cm);
                setShowDistanceCustom(false);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition ${
                shootingDistanceCm === preset.cm && !showDistanceCustom
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-950/50'
                  : 'bg-slate-950/80 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
          <button
            onClick={() => setShowDistanceCustom((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition ${
              showDistanceCustom
                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                : 'bg-slate-950/80 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
          >
            Personnalisé...
          </button>
        </div>
      </div>

      {/* Custom Slider Drawer if opened */}
      {showDistanceCustom && (
        <div className="w-full mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-4 text-xs">
          <span className="text-slate-400 whitespace-nowrap font-medium">Distance exacte :</span>
          <input
            type="range"
            min={30}
            max={200}
            step={5}
            value={shootingDistanceCm}
            onChange={(e) => setShootingDistanceCm(parseInt(e.target.value, 10))}
            className="flex-1 accent-cyan-400 cursor-pointer h-2 bg-slate-800 rounded-lg"
          />
          <span className="font-mono font-bold text-cyan-300 text-sm min-w-16 text-right">
            {shootingDistanceCm} cm
          </span>
        </div>
      )}

      {/* Camera Controls Bar */}
      <div className="w-full mt-3 p-4 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center justify-between gap-4 shadow-xl">
        {/* Timer presets */}
        <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <Clock className="w-3.5 h-3.5 text-slate-400 ml-1.5" />
          {[0, 3, 5, 10].map((sec) => (
            <button
              key={sec}
              onClick={() => setTimerSeconds(sec)}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${
                timerSeconds === sec
                  ? 'bg-rose-500 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {sec === 0 ? 'Instantané' : `${sec}s`}
            </button>
          ))}
        </div>

        {/* Big Shutter Trigger Button */}
        <div className="flex items-center gap-3">
          <button
            onClick={triggerCaptureWithTimer}
            disabled={isCapturing}
            className="group relative flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-tr from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 p-1 shadow-lg shadow-rose-900/40 active:scale-95 transition disabled:opacity-50"
            aria-label="Prendre la photo"
          >
            <div className="w-full h-full rounded-full border-2 border-white flex items-center justify-center">
              <div className="w-10 h-10 rounded-full bg-white group-hover:scale-90 transition-transform flex items-center justify-center">
                <Camera className="w-5 h-5 text-rose-600" />
              </div>
            </div>
          </button>
        </div>

        {/* Right Auxiliaries: Camera Switch & Upload */}
        <div className="flex items-center gap-2">
          {/* Flip camera */}
          <button
            onClick={toggleCamera}
            title="Basculer caméra avant / arrière"
            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
          >
            <RefreshCw className="w-4 h-4 text-cyan-400" />
            <span className="hidden sm:inline">Caméra</span>
          </button>

          {/* Import file */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            title="Importer une photo depuis l'appareil"
            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
          >
            <Upload className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">Importer</span>
          </button>
        </div>
      </div>

      {/* Helpful Guidelines Card */}
      <div className="w-full mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-400">
        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-bold shrink-0">
            1
          </div>
          <span>Tenez l'appareil à <strong className="text-white">~60 cm</strong> (bras tendu) face à vos yeux.</span>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-bold shrink-0">
            2
          </div>
          <span>Plaquez votre carte bancaire bien droite sur votre front.</span>
        </div>
        <div className="bg-slate-900/50 p-3 rounded-xl border border-slate-800/80 flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 font-bold shrink-0">
            3
          </div>
          <span>Dites <strong className="text-white">« Photo »</strong> pour déclencher sans bouger d'un millimètre !</span>
        </div>
      </div>
    </div>
  );
};
