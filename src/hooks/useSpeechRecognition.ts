import { useState } from 'react';

/**
 * Hook wrapping Web Speech API for live transcript.
 *
 * TODO: Implement using services/speechRecognition.ts
 * - Return { start, stop, transcript, isListening }
 */
export function useSpeechRecognition() {
  const [transcript, setTranscript] = useState('');
  const [isListening, setIsListening] = useState(false);

  const start = () => {
    // TODO: Call createSpeechRecognition, wire onResult to setTranscript
    setTranscript('');
    setIsListening(true);
  };

  const stop = () => {
    // TODO: Stop recognition
    setIsListening(false);
  };

  return { start, stop, transcript, isListening };
}
