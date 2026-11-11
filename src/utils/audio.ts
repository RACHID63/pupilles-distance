/**
 * Audio synthesis and Speech Recognition utilities
 */

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    audioCtx = new AudioContextClass();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

/**
 * Play a synthesized beep for countdown.
 */
export function playCountdownBeep(isFinal = false): void {
  try {
    const ctx = getAudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = isFinal ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(isFinal ? 1200 : 800, ctx.currentTime);

    gain.gain.setValueAtTime(0.15, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (isFinal ? 0.35 : 0.15));

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + (isFinal ? 0.35 : 0.15));
  } catch (e) {
    // Audio context may not be allowed prior to user interaction
  }
}

/**
 * Play synthetic camera shutter mechanical click
 */
export function playCameraShutter(): void {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    // Click pulse 1
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.08);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.09);

    // Click pulse 2
    setTimeout(() => {
      try {
        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'triangle';
        osc2.frequency.setValueAtTime(300, ctx.currentTime);
        osc2.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.12);

        gain2.gain.setValueAtTime(0.25, ctx.currentTime);
        gain2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.12);

        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start();
        osc2.stop(ctx.currentTime + 0.13);
      } catch (err) {}
    }, 70);
  } catch (e) {}
}

/**
 * Play success chime
 */
export function playSuccessChime(): void {
  try {
    const ctx = getAudioContext();
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const startTime = ctx.currentTime + idx * 0.09;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.12, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(startTime);
      osc.stop(startTime + 0.45);
    });
  } catch (e) {}
}

/**
 * Text-to-Speech synthesis in French
 */
export function speakFrench(text: string, enabled = true): void {
  if (!enabled || typeof window === 'undefined' || !('speechSynthesis' in window)) {
    return;
  }
  try {
    window.speechSynthesis.cancel(); // Stop ongoing speech
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'fr-FR';
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Look for French voice
    const voices = window.speechSynthesis.getVoices();
    const frVoice = voices.find(v => v.lang.startsWith('fr') || v.lang.includes('FR'));
    if (frVoice) {
      utterance.voice = frVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech synthesis error:', e);
  }
}

/**
 * Speech Recognition Listener for voice commands
 */
export function createSpeechCommander({
  onPhotoDetected,
  onError,
}: {
  onPhotoDetected: (word: string) => void;
  onError?: (err: any) => void;
}) {
  const SpeechRecognitionClass =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

  if (!SpeechRecognitionClass) {
    return {
      isSupported: false,
      start: () => {},
      stop: () => {},
    };
  }

  let recognition: any = null;
  let isRunning = false;
  let restartTimeout: any = null;

  try {
    recognition = new SpeechRecognitionClass();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.maxAlternatives = 3;

    const triggerKeywords = [
      'photo',
      'photos',
      'cheese',
      'capture',
      'capturer',
      'cliché',
      'cliche',
      'prends',
      'shot',
      'shoot',
      'go',
      'ok',
    ];

    recognition.onresult = (event: any) => {
      const resultsLength = event.results.length;
      for (let i = event.resultIndex; i < resultsLength; i++) {
        const transcript = event.results[i][0].transcript.trim().toLowerCase();
        for (const keyword of triggerKeywords) {
          if (transcript.includes(keyword)) {
            onPhotoDetected(keyword);
            return;
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      if (event.error !== 'no-speech' && event.error !== 'aborted') {
        onError?.(event.error);
      }
    };

    recognition.onend = () => {
      if (isRunning) {
        clearTimeout(restartTimeout);
        restartTimeout = setTimeout(() => {
          if (isRunning) {
            try {
              recognition.start();
            } catch (e) {}
          }
        }, 300);
      }
    };
  } catch (e) {
    return {
      isSupported: false,
      start: () => {},
      stop: () => {},
    };
  }

  return {
    isSupported: true,
    start: () => {
      isRunning = true;
      try {
        recognition.start();
      } catch (e) {}
    },
    stop: () => {
      isRunning = false;
      clearTimeout(restartTimeout);
      try {
        recognition.stop();
      } catch (e) {}
    },
  };
}
