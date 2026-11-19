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
  Radar,
} from 'lucide-react';
import {
  createSpeechCommander,
  playCameraShutter,
  playCountdownBeep,
  speakFrench,
} from '../utils/audio';
import { AiProvider, DEFAULT_SHOOTING_DISTANCE_CM } from '../types/optometry';
import { LiveDistanceTelemeter } from './LiveDistanceTelemeter';

interface Props {
  onPhotoCaptured: (imageBase64: string, shootingDistanceCm: number) => void;
  voiceGuidanceEnabled: boolean;
  initialDistanceCm?: number;
  aiProvider?: AiProvider;
}

export const CameraCapture: React.FC<Props> = ({
  onPhotoCaptured,
  voiceGuidanceEnabled,
  initialDistanceCm = DEFAULT_SHOOTING_DISTANCE_CM,
  aiProvider = 'auto',
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nativeCameraInputRef = useRef<HTMLInputElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');
  const [hasPermission, setHasPermission] = useState<boolean | null>(null);
  const [permissionError, setPermissionError] = useState<string | null>(null);
  const [needsPlayTap, setNeedsPlayTap] = useState<boolean>(false);

  // Shooting distance state in cm (default 60 cm - bras tendu)
  const [shootingDistanceCm, setShootingDistanceCm] = useState<number>(initialDistanceCm);
  const [showDistanceCustom, setShowDistanceCustom] = useState<boolean>(false);
  const [showTelemeter, setShowTelemeter] = useState<boolean>(false);

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

  // Stop active camera tracks safely via ref
  const stopCurrentStream = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => {
        try {
          t.stop();
        } catch {}
      });
      streamRef.current = null;
    }
  };

  // Start Camera Stream with mobile/HTTPS diagnostics & constraint fallbacks
  const startCamera = async (mode = facingMode) => {
    stopCurrentStream();
    setPermissionError(null);
    setNeedsPlayTap(false);

    // Mobile browsers block navigator.mediaDevices on non-HTTPS origins (except localhost)
    if (
      typeof window === 'undefined' ||
      !window.isSecureContext ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
      setHasPermission(false);
      setPermissionError(
        "La caméra en direct nécessite une connexion sécurisée HTTPS sur téléphone (ce serveur semble ouvert en HTTP ou dans un navigateur intégré). Utilisez le bouton « Appareil photo du téléphone » ci-dessous pour prendre votre photo directement !"
      );
      return;
    }

    const attempts: MediaStreamConstraints[] = [
      {
        video: {
          facingMode: { ideal: mode },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      },
      {
        video: { facingMode: mode },
        audio: false,
      },
      {
        video: true,
        audio: false,
      },
    ];

    let newStream: MediaStream | null = null;
    let lastError: any = null;

    for (const constraints of attempts) {
      try {
        newStream = await navigator.mediaDevices.getUserMedia(constraints);
        break;
      } catch (err: any) {
        lastError = err;
        // Stop retrying if user explicitly denied permission
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          break;
        }
      }
    }

    if (!newStream) {
      console.error('Camera access error:', lastError);
      setHasPermission(false);
      const errName = lastError?.name || '';
      if (errName === 'NotAllowedError' || errName === 'PermissionDeniedError') {
        setPermissionError(
          "L'accès à la caméra a été refusé. Autorisez la caméra dans les réglages du navigateur ou utilisez l'Appareil photo du téléphone ci-dessous."
        );
      } else if (errName === 'NotFoundError' || errName === 'DevicesNotFoundError') {
        setPermissionError(
          "Aucune caméra détectée par le navigateur. Utilisez l'Appareil photo du téléphone ou importez un cliché."
        );
      } else {
        setPermissionError(
          "Impossible de démarrer le flux vidéo en direct sur cet appareil. Utilisez « Appareil photo du téléphone » ou importez une photo."
        );
      }
      return;
    }

    streamRef.current = newStream;
    setHasPermission(true);

    if (videoRef.current) {
      videoRef.current.srcObject = newStream;
      try {
        await videoRef.current.play();
      } catch (playErr) {
        // iOS/Android WebView autoplay policy may require an explicit user tap
        console.warn('Video autoplay blocked until user interaction:', playErr);
        setNeedsPlayTap(true);
      }
    }
  };

  useEffect(() => {
    startCamera(facingMode);
    return () => {
      stopCurrentStream();
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

  // Speech Recognition setup — wait until camera permission succeeds so mic prompt never collides with camera prompt on mobile
  useEffect(() => {
    if (hasPermission !== true) {
      return;
    }

    let startTimer: ReturnType<typeof setTimeout> | null = null;
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
      startTimer = setTimeout(() => {
        commander.start();
      }, 650);
    } else {
      setSpeechSupported(false);
    }

    return () => {
      if (startTimer) clearTimeout(startTimer);
      if (speechCommanderRef.current) {
        speechCommanderRef.current.stop();
      }
    };
  }, [hasPermission, voiceGuidanceEnabled, timerSeconds, shootingDistanceCm]);

  // Execute snapshot from video
  const takeSnapshot = () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !video.videoHeight || hasPermission !== true) {
      // Fallback: open native mobile camera if live video stream isn't active
      nativeCameraInputRef.current?.click();
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
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

    // If live video isn't streaming yet, open native mobile camera directly instead of counting down to a black screen
    const video = videoRef.current;
    if (hasPermission !== true || !video || !video.videoWidth) {
      nativeCameraInputRef.current?.click();
      return;
    }

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

  // File Upload / Native Mobile Camera handler (with EXIF-safe downscale to max 1600px)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawDataUrl = event.target?.result as string;
      if (!rawDataUrl) return;

      const img = new Image();
      img.onload = () => {
        const maxDim = 1600;
        let targetW = img.naturalWidth || 1280;
        let targetH = img.naturalHeight || 720;
        if (targetW > maxDim || targetH > maxDim) {
          const ratio = Math.min(maxDim / targetW, maxDim / targetH);
          targetW = Math.round(targetW * ratio);
          targetH = Math.round(targetH * ratio);
        }

        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const optimized = canvas.toDataURL('image/jpeg', 0.92);
          playCameraShutter();
          onPhotoCaptured(optimized, shootingDistanceCm);
        } else {
          playCameraShutter();
          onPhotoCaptured(rawDataUrl, shootingDistanceCm);
        }
      };
      img.onerror = () => {
        playCameraShutter();
        onPhotoCaptured(rawDataUrl, shootingDistanceCm);
      };
      img.src = rawDataUrl;
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

      {/* Main Viewport Container (Portrait 3:4 on mobile, 4:3 on tablet, 16:10 on desktop, capped height for landscape) */}
      <div className="relative w-full aspect-[3/4] sm:aspect-[4/3] lg:aspect-[16/10] max-h-[68dvh] bg-slate-950 rounded-2xl sm:rounded-3xl overflow-hidden border border-slate-800 shadow-2xl shadow-rose-950/20">
        {/* Flash overlay */}
        {flashActive && (
          <div className="absolute inset-0 z-50 bg-white pointer-events-none transition-opacity duration-200" />
        )}

        {/* Camera Permission / HTTPS Error State */}
        {hasPermission === false && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center p-4 sm:p-6 text-center bg-slate-950/95 space-y-3 sm:space-y-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
              <AlertCircle className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div className="max-w-md space-y-1.5 sm:space-y-2">
              <h4 className="text-base sm:text-lg font-bold text-white">Caméra en direct indisponible</h4>
              <p className="text-xs text-slate-300 leading-relaxed">
                {permissionError || "Veuillez autoriser l'accès à la caméra ou utiliser l'appareil photo du téléphone."}
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 pt-1">
              <button
                onClick={() => nativeCameraInputRef.current?.click()}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 hover:from-rose-500 hover:to-rose-400 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-rose-900/40 transition"
              >
                <Camera className="w-4 h-4" />
                <span>Appareil photo du téléphone</span>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-2 transition"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                <span>Galerie</span>
              </button>
              <button
                onClick={() => startCamera()}
                className="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-slate-900 border border-slate-700 hover:bg-slate-800 text-slate-200 text-xs font-semibold flex items-center gap-2 transition"
              >
                <RefreshCw className="w-4 h-4 text-cyan-400" />
                <span>Réessayer</span>
              </button>
            </div>
          </div>
        )}

        {/* Mobile Autoplay Tap Overlay if video.play() was blocked */}
        {needsPlayTap && hasPermission === true && (
          <div className="absolute inset-0 z-25 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm">
            <button
              onClick={async () => {
                try {
                  await videoRef.current?.play();
                  setNeedsPlayTap(false);
                } catch {}
              }}
              className="px-5 py-3 rounded-2xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-sm shadow-xl flex items-center gap-2"
            >
              <Camera className="w-5 h-5" />
              <span>Toucher pour activer l'aperçu vidéo</span>
            </button>
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
          onLoadedMetadata={() => {
            setHasPermission(true);
            videoRef.current?.play().catch(() => setNeedsPlayTap(true));
          }}
        />

        {/* OVERLAY 1: Animated Red Pupil Tracker & Credit Card Alignment Guide */}
        <div className="absolute inset-0 pointer-events-none select-none z-10 flex flex-col items-center justify-center">
          {/* Top Instruction Pill */}
          <div className="absolute top-2.5 sm:top-4 max-w-[92%] px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-slate-950/80 backdrop-blur-md border border-slate-700/60 text-[10px] sm:text-xs text-slate-200 font-medium flex items-center gap-1.5 sm:gap-2 shadow-lg">
            <CreditCard className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-400 shrink-0" />
            <span className="truncate">Posez la carte sur le front • Fixez l'objectif</span>
          </div>

          {/* Dotted Credit Card Outline Guide on Forehead (ISO ID-1 proportions: 85.60 x 53.98 = ratio ~1.586) */}
          <div className="relative w-36 sm:w-52 md:w-60 aspect-[85.6/53.98] border-2 border-dashed border-rose-400/80 bg-rose-500/10 rounded-xl mb-4 sm:mb-6 shadow-[0_0_20px_rgba(244,63,94,0.25)] flex flex-col items-center justify-between p-1.5 sm:p-2.5">
            <div className="w-full flex items-center justify-between text-[8px] sm:text-[10px] text-rose-300/90 font-mono">
              <span className="font-semibold tracking-wide">ID-1 85.60 mm</span>
              <div className="w-3 h-2 sm:w-4 sm:h-3 rounded-sm border border-rose-400/50 bg-rose-400/20" />
            </div>
            <div className="text-center">
              <span className="text-[9px] sm:text-[11px] font-bold text-white tracking-wider uppercase block">
                CARTE BANCAIRE ICI
              </span>
              <span className="text-[8px] sm:text-[9px] text-rose-200/80 hidden sm:block">Contre le front, bien droite</span>
            </div>
            <div className="w-full flex justify-between text-[8px] sm:text-[9px] text-rose-300/70 font-mono">
              <span>H: 53.98 mm</span>
              <span>ISO 7810</span>
            </div>

            {/* Corner brackets */}
            <div className="absolute -top-1 -left-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-t-2 border-l-2 border-rose-400" />
            <div className="absolute -top-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-t-2 border-r-2 border-rose-400" />
            <div className="absolute -bottom-1 -left-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-b-2 border-l-2 border-rose-400" />
            <div className="absolute -bottom-1 -right-1 w-2.5 h-2.5 sm:w-3 sm:h-3 border-b-2 border-r-2 border-rose-400" />
          </div>

          {/* Red Pupil Tracker : Two Neon Red (#FF1744) Circular Reticles */}
          <div className="relative w-44 sm:w-56 md:w-64 flex items-center justify-between px-1 sm:px-2">
            {/* Eye Right (OD - Patient) */}
            <div className="relative flex items-center justify-center">
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/15 animate-pupil-glow flex items-center justify-center">
                <div className="absolute w-11 sm:w-14 h-[1.5px] bg-[#FF1744]/70" />
                <div className="absolute h-11 sm:h-14 w-[1.5px] bg-[#FF1744]/70" />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF1744] shadow-[0_0_12px_#FF1744] border border-white" />
              </div>
              <span className="absolute -bottom-4 sm:-bottom-5 text-[8px] sm:text-[9px] font-mono font-bold text-rose-300 tracking-wider">
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
              <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-full border-2 border-[#FF1744] bg-[#FF1744]/15 animate-pupil-glow flex items-center justify-center">
                <div className="absolute w-11 sm:w-14 h-[1.5px] bg-[#FF1744]/70" />
                <div className="absolute h-11 sm:h-14 w-[1.5px] bg-[#FF1744]/70" />
                <div className="w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-[#FF1744] shadow-[0_0_12px_#FF1744] border border-white" />
              </div>
              <span className="absolute -bottom-4 sm:-bottom-5 text-[8px] sm:text-[9px] font-mono font-bold text-rose-300 tracking-wider">
                ŒIL GAUCHE
              </span>
            </div>
          </div>

          {/* Animated Horizontal Laser Scan Line */}
          <div className="absolute left-6 right-6 h-[2px] bg-gradient-to-r from-transparent via-[#FF1744] to-transparent shadow-[0_0_14px_#FF1744] animate-laser-scan pointer-events-none" />

          {/* Voice status indicator badge */}
          {speechSupported && (
            <div className="absolute bottom-2.5 sm:bottom-4 max-w-[92%] px-3 py-1 rounded-full bg-slate-900/80 backdrop-blur-md border border-slate-700/60 flex items-center gap-2 text-xs text-slate-300">
              <div className="flex items-center gap-0.5 h-3.5 sm:h-4 shrink-0">
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-1" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-2" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-3" />
                <span className="w-1 bg-emerald-400 rounded-full animate-wave-4" />
              </div>
              <span className="text-[10px] sm:text-[11px] font-medium truncate">
                Voix active : Dites <strong className="text-white">« Photo »</strong> ou <strong className="text-white">« Cheese »</strong>
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
            { cm: 20, label: '20 cm' },
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
          <button
            onClick={() => setShowTelemeter((prev) => !prev)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border flex items-center gap-1.5 transition ${
              showTelemeter
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm'
                : 'bg-slate-950/80 border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10'
            }`}
          >
            <Radar className="w-3.5 h-3.5" />
            <span>Télémètre 0→Recul</span>
          </button>
        </div>
      </div>

      {/* Live Optical & AI Distance Telemeter Drawer */}
      {showTelemeter && (
        <LiveDistanceTelemeter
          videoRef={videoRef}
          facingMode={facingMode}
          aiProvider={aiProvider}
          voiceGuidanceEnabled={voiceGuidanceEnabled}
          currentDistanceCm={shootingDistanceCm}
          onDistanceDetected={(cm) => setShootingDistanceCm(cm)}
        />
      )}

      {/* Custom Slider Drawer if opened */}
      {showDistanceCustom && (
        <div className="w-full mt-2 p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-4 text-xs">
          <span className="text-slate-400 whitespace-nowrap font-medium">Distance exacte :</span>
          <input
            type="range"
            min={20}
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

        {/* Right Auxiliaries: Camera Switch, Native Camera & Upload */}
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

          {/* Native mobile camera fallback (works even without getUserMedia / on HTTP) */}
          <input
            ref={nativeCameraInputRef}
            type="file"
            accept="image/*"
            capture={facingMode}
            className="hidden"
            onChange={handleFileUpload}
          />
          <button
            onClick={() => nativeCameraInputRef.current?.click()}
            title="Ouvrir l'appareil photo natif du téléphone"
            className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-rose-500/40 text-slate-300 hover:text-white transition flex items-center gap-1.5 text-xs font-medium"
          >
            <Camera className="w-4 h-4 text-rose-400" />
            <span className="hidden md:inline">Appareil photo</span>
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
            title="Importer une photo depuis la galerie"
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
