import { useState } from 'react';

/**
 * Hook for TTS playback with in-memory caching.
 *
 * TODO: Implement using services/openai.ts textToSpeech
 * - Cache audio per question ID in a Map
 * - Return { speak, isPlaying }
 */
export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);

  const speak = async (_text: string, _questionId?: string) => {
    // TODO: Check cache, call textToSpeech if miss, play via Audio element
    setIsPlaying(true);
    console.warn('useTTS.speak not implemented');
    setIsPlaying(false);
  };

  return { speak, isPlaying };
}
