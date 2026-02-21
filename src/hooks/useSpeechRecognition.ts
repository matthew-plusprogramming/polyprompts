import { useState, useRef, useCallback } from 'react';

export function useSpeechRecognition() {
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const start = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      console.error('SpeechRecognition not supported in this browser');
      return;
    }

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
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      console.error('Speech recognition error:', event.error);
      if (event.error === 'no-speech' || event.error === 'aborted') {
        try { recognition.start(); } catch { /* already running */ }
      }
    };

    recognition.onend = () => {
      // Auto-restart if we're still supposed to be listening
      if (recognitionRef.current === recognition) {
        try { recognition.start(); } catch { /* already running */ }
      }
    };

    recognitionRef.current = recognition;
    setFinalTranscript('');
    setInterimTranscript('');
    setIsListening(true);
    recognition.start();
  }, []);

  const stop = useCallback(() => {
    if (recognitionRef.current) {
      const ref = recognitionRef.current;
      recognitionRef.current = null; // prevent auto-restart in onend
      ref.stop();
    }
    setIsListening(false);
  }, []);

  const getFullTranscript = useCallback(() => {
    return (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
  }, [finalTranscript, interimTranscript]);

  return {
    start,
    stop,
    transcript: finalTranscript + (interimTranscript ? ' ' + interimTranscript : ''),
    finalTranscript,
    interimTranscript,
    isListening,
    getFullTranscript,
  };
}
