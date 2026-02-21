import { useState, useRef, useCallback, useEffect } from 'react';

const MAX_RESTARTS = 10;
const RESTART_COOLDOWN_MS = 250;

export function useSpeechRecognition() {
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isAvailable, setIsAvailable] = useState(true);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const restartCountRef = useRef(0);
  const lastRestartRef = useRef(0);
  const stoppedRef = useRef(false);

  const tryRestart = useCallback((
    recognition: SpeechRecognition,
    reason: string,
    { immediate = false, countAgainstLimit = true } = {}
  ) => {
    // Don't restart if explicitly stopped
    if (stoppedRef.current || recognitionRef.current !== recognition) return;

    // Max restart limit (only checked when this restart counts against it)
    if (countAgainstLimit && restartCountRef.current >= MAX_RESTARTS) {
      console.warn('[SpeechRecog] Max restarts reached, giving up');
      setIsAvailable(false);
      setIsListening(false);
      return;
    }

    // Immediate restarts skip the cooldown entirely
    const delay = immediate
      ? 0
      : Math.max(0, RESTART_COOLDOWN_MS - (Date.now() - lastRestartRef.current));

    setTimeout(() => {
      if (stoppedRef.current || recognitionRef.current !== recognition) return;
      if (countAgainstLimit) {
        restartCountRef.current += 1;
      }
      lastRestartRef.current = Date.now();
      console.log(
        `[SpeechRecog] Restarting — reason: "${reason}", count: ${restartCountRef.current}/${MAX_RESTARTS}, immediate: ${immediate}`
      );
      try {
        recognition.start();
      } catch {
        // Already running or can't start — give up
        console.warn('[SpeechRecog] Restart failed');
      }
    }, delay);
  }, []);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.error('[SpeechRecog] Not supported in this browser');
      setIsAvailable(false);
      return;
    }

    // Reset state
    stoppedRef.current = false;
    restartCountRef.current = 0;
    lastRestartRef.current = 0;
    setIsAvailable(true);

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';
      let final = '';

      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }

      setFinalTranscript(final);
      setInterimTranscript(interim);

      // Reset restart counter on successful result — connection is healthy
      restartCountRef.current = 0;
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('[SpeechRecog] Error:', event.error);

      switch (event.error) {
        case 'no-speech':
          // Normal during pauses in an interview — restart immediately, don't penalise the counter
          tryRestart(recognition, 'no-speech', { immediate: true, countAgainstLimit: false });
          break;
        case 'aborted':
          // Chrome aborted the session — restart with cooldown
          tryRestart(recognition, 'aborted');
          break;
        case 'network':
          // Chrome speech servers unreachable — restart with cooldown
          console.warn('[SpeechRecog] Network error — Chrome speech servers unreachable');
          tryRestart(recognition, 'network');
          break;
        case 'audio-capture':
          // Microphone became unavailable — don't retry, it will keep failing
          console.error('[SpeechRecog] Audio capture failed, stopping permanently');
          setIsAvailable(false);
          setIsListening(false);
          break;
        case 'not-allowed':
        case 'service-not-allowed':
          // Permanent — mic permission denied or service blocked
          console.error('[SpeechRecog] Permission denied, stopping');
          setIsAvailable(false);
          setIsListening(false);
          break;
        default:
          tryRestart(recognition, event.error);
          break;
      }
    };

    recognition.onend = () => {
      // Chrome auto-stops after ~60s of continuous mode — restart immediately without
      // counting against the limit, since this is expected browser behaviour.
      if (!stoppedRef.current && recognitionRef.current === recognition) {
        tryRestart(recognition, 'auto-ended', { immediate: true, countAgainstLimit: false });
      }
    };

    recognitionRef.current = recognition;
    setFinalTranscript('');
    setInterimTranscript('');
    setIsListening(true);
    recognition.start();
  }, [tryRestart]);

  const stop = useCallback(() => {
    stoppedRef.current = true;
    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      recognitionRef.current = null;
      try { ref.stop(); } catch { /* already stopped */ }
    }
    setIsListening(false);
  }, []);

  const getFullTranscript = useCallback(() => {
    return (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
  }, [finalTranscript, interimTranscript]);

  // Cleanup on unmount — stop recognition so event handlers don't fire on a dead component
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch { /* already stopped */ }
        recognitionRef.current = null;
      }
    };
  }, []);

  return {
    start,
    stop,
    transcript: finalTranscript + (interimTranscript ? ' ' + interimTranscript : ''),
    finalTranscript,
    interimTranscript,
    isListening,
    isAvailable,
    getFullTranscript,
  };
}
