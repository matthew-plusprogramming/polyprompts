import { useState, useRef, useCallback } from 'react';
import { textToSpeech } from '../services/openai';
import { createLogger } from '../utils/logger';

const log = createLogger('TTS');

const PLAYBACK_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  const cleanupAudio = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.oncanplaythrough = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current = null;
    }
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
  }, []);

  const speakWithNativeFallback = useCallback((text: string) => {
    return new Promise<void>((resolve, reject) => {
      if (!('speechSynthesis' in window)) {
        reject(new Error('speechSynthesis not supported'));
        return;
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'en-US';
      utterance.onend = () => resolve();
      utterance.onerror = (event) => reject(new Error(`SpeechSynthesis error: ${event.error}`));
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const fetchWithRetry = useCallback(async (text: string, voice?: string, speed?: number): Promise<Blob> => {
    let lastError: Error | null = null;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        return await textToSpeech(text, voice, speed);
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        log.warn(`Fetch attempt ${attempt + 1} failed`, { error: lastError.message });
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_BACKOFF_MS * (attempt + 1)));
        }
      }
    }
    throw lastError;
  }, []);

  const playBlob = useCallback((blob: Blob): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      cleanupAudio();

      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio();
      audioRef.current = audio;
      audio.preload = 'auto';

      // Timeout: if audio doesn't start playing within threshold, reject
      const playbackTimeout = setTimeout(() => {
        log.warn('Playback timeout — audio did not start in time');
        reject(new Error('Playback timeout'));
      }, PLAYBACK_TIMEOUT_MS);

      audio.oncanplaythrough = () => {
        clearTimeout(playbackTimeout);
        audio.play().catch(reject);
      };

      audio.onended = () => {
        log.info('Playback ended');
        resolve();
      };

      audio.onerror = () => {
        clearTimeout(playbackTimeout);
        reject(new Error('HTMLAudio playback error'));
      };

      audio.src = objectUrl;
    });
  }, [cleanupAudio]);

  const speak = useCallback(async (text: string, voice?: string, speed?: number) => {
    cleanupAudio();
    window.speechSynthesis?.cancel();

    setIsPlaying(true);
    const stopSpeak = log.time('speak');
    try {
      log.info('Fetching audio...');
      const stopFetch = log.time('tts-fetch');
      const blob = await fetchWithRetry(text, voice, speed);
      stopFetch();
      log.info('Got blob', { size: blob.size, type: blob.type });

      log.info('Playing...');
      await playBlob(blob);
    } catch (error) {
      log.error('OpenAI TTS failed, falling back to speechSynthesis', { error: String(error) });
      try {
        await speakWithNativeFallback(text);
      } catch (fallbackError) {
        log.error('Native fallback also failed', { error: String(fallbackError) });
        throw fallbackError;
      }
    } finally {
      stopSpeak();
      setIsPlaying(false);
      cleanupAudio();
    }
  }, [cleanupAudio, fetchWithRetry, playBlob, speakWithNativeFallback]);

  const stopPlayback = useCallback(() => {
    cleanupAudio();
    window.speechSynthesis?.cancel();
    setIsPlaying(false);
  }, [cleanupAudio]);

  return { speak, isPlaying, stopPlayback };
}
