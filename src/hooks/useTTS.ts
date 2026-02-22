import { useState, useRef, useCallback } from 'react';
import { textToSpeech } from '../services/openai';
import { createLogger } from '../utils/logger';

const log = createLogger('TTS');

const PLAYBACK_TIMEOUT_MS = 8000;
const MAX_RETRIES = 2;
const RETRY_BACKOFF_MS = 500;

export function useTTS() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [analyserNode, setAnalyserNode] = useState<AnalyserNode | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const objectUrlRef = useRef<string | null>(null);
  const pendingRejectRef = useRef<((reason: Error) => void) | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  const ensureAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const ctx = new AudioContext();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.connect(ctx.destination);
      audioCtxRef.current = ctx;
      analyserRef.current = analyser;
      setAnalyserNode(analyser);
    }
    if (audioCtxRef.current.state === 'suspended') {
      void audioCtxRef.current.resume();
    }
    return { ctx: audioCtxRef.current, analyser: analyserRef.current! };
  }, []);

  const cleanupAudio = useCallback(() => {
    if (sourceNodeRef.current) {
      try { sourceNodeRef.current.disconnect(); } catch { /* already disconnected */ }
      sourceNodeRef.current = null;
    }
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
    // Reject any pending playBlob promise so speak() doesn't hang forever
    if (pendingRejectRef.current) {
      pendingRejectRef.current(new Error('Playback interrupted'));
      pendingRejectRef.current = null;
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

  const playBlob = useCallback((blob: Blob, onStart?: () => void): Promise<void> => {
    return new Promise<void>((resolve, reject) => {
      cleanupAudio();
      pendingRejectRef.current = reject;

      const { analyser } = ensureAudioContext();

      const objectUrl = URL.createObjectURL(blob);
      objectUrlRef.current = objectUrl;
      const audio = new Audio();
      audioRef.current = audio;
      audio.preload = 'auto';

      // Route through Web Audio API for frequency analysis
      try {
        const source = audioCtxRef.current!.createMediaElementSource(audio);
        source.connect(analyser);
        sourceNodeRef.current = source;
      } catch (err) {
        log.warn('Failed to create media element source', { error: String(err) });
      }

      // Timeout: if audio doesn't start playing within threshold, reject
      const playbackTimeout = setTimeout(() => {
        pendingRejectRef.current = null;
        log.warn('Playback timeout — audio did not start in time');
        reject(new Error('Playback timeout'));
      }, PLAYBACK_TIMEOUT_MS);

      audio.oncanplaythrough = () => {
        clearTimeout(playbackTimeout);
        audio.play().then(() => {
          onStart?.();
        }).catch((err) => {
          pendingRejectRef.current = null;
          reject(err);
        });
      };

      audio.onended = () => {
        pendingRejectRef.current = null;
        log.info('Playback ended');
        resolve();
      };

      audio.onerror = () => {
        pendingRejectRef.current = null;
        clearTimeout(playbackTimeout);
        reject(new Error('HTMLAudio playback error'));
      };

      audio.src = objectUrl;
    });
  }, [cleanupAudio, ensureAudioContext]);

  const speak = useCallback(async (text: string, voiceOrOpts?: string | { voice?: string; speed?: number; onStart?: () => void }, speed?: number) => {
    const opts = typeof voiceOrOpts === 'object' ? voiceOrOpts : { voice: voiceOrOpts, speed };
    cleanupAudio();
    window.speechSynthesis?.cancel();

    setIsPlaying(true);
    const stopSpeak = log.time('speak');
    try {
      log.info('Fetching audio...');
      const stopFetch = log.time('tts-fetch');
      const blob = await fetchWithRetry(text, opts.voice, opts.speed);
      stopFetch();
      log.info('Got blob', { size: blob.size, type: blob.type });

      log.info('Playing...');
      await playBlob(blob, opts.onStart);
    } catch (error) {
      // If playback was externally interrupted (e.g. component unmount / HMR), don't fall back
      if (error instanceof Error && error.message === 'Playback interrupted') {
        log.info('Playback interrupted, skipping fallback');
        throw error;
      }
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

  return { speak, isPlaying, stopPlayback, analyserNode };
}
