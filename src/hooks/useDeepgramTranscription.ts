import { useState, useRef, useCallback, useEffect } from 'react';

/**
 * Real-time transcription via Deepgram WebSocket streaming.
 *
 * Exposes the same interface shape as the old `useSpeechRecognition` hook so
 * InterviewScreen can swap with minimal changes:
 *   start(stream)  — begin streaming mic audio to Deepgram
 *   stop()         — tear down WebSocket + AudioContext
 *   transcript     — combined final + interim text (for live display)
 *   getFullTranscript() — snapshot of accumulated text
 */

const DEEPGRAM_WS_URL =
  'wss://api.deepgram.com/v1/listen?' +
  'model=nova-2&language=en-US&smart_format=true&filler_words=true' +
  '&interim_results=true&utterance_end_ms=1000' +
  '&encoding=linear16&sample_rate=16000&channels=1';

const BUFFER_SIZE = 4096;

export function useDeepgramTranscription() {
  const [finalTranscript, setFinalTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');

  const wsRef = useRef<WebSocket | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const stoppedRef = useRef(false);

  // ─── start ────────────────────────────────────────────────────────────
  const start = useCallback(async (stream: MediaStream) => {
    stoppedRef.current = false;
    setFinalTranscript('');
    setInterimTranscript('');

    // 1. Fetch a short-lived Deepgram key from our serverless endpoint
    let dgKey: string;
    try {
      const res = await fetch('/api/key', { method: 'POST' });
      const data = await res.json();
      dgKey = data.key;
      if (!dgKey) throw new Error('Empty key from /api/key');
    } catch (err) {
      console.error('[Deepgram] Failed to fetch key:', err);
      return;
    }

    // 2. Open WebSocket to Deepgram
    const ws = new WebSocket(DEEPGRAM_WS_URL, ['token', dgKey]);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[Deepgram] WebSocket connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        const alt = msg?.channel?.alternatives?.[0];
        if (!alt) return;

        const text: string = alt.transcript ?? '';
        if (!text) return;

        if (msg.is_final) {
          setFinalTranscript((prev) => (prev ? prev + ' ' + text : text));
          setInterimTranscript('');
        } else {
          setInterimTranscript(text);
        }
      } catch {
        // non-JSON keep-alive or metadata — ignore
      }
    };

    ws.onerror = (err) => {
      console.error('[Deepgram] WebSocket error:', err);
    };

    ws.onclose = (ev) => {
      console.log('[Deepgram] WebSocket closed', ev.code, ev.reason);
    };

    // 3. Set up AudioContext at 16 kHz to produce Int16 PCM for Deepgram
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioCtxRef.current = audioCtx;

    const source = audioCtx.createMediaStreamSource(stream);
    sourceRef.current = source;

    const processor = audioCtx.createScriptProcessor(BUFFER_SIZE, 1, 1);
    processorRef.current = processor;

    processor.onaudioprocess = (e) => {
      if (stoppedRef.current || ws.readyState !== WebSocket.OPEN) return;
      const float32 = e.inputBuffer.getChannelData(0);
      // Convert Float32 [-1,1] to Int16 PCM
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
      }
      ws.send(int16.buffer);
    };

    source.connect(processor);
    processor.connect(audioCtx.destination);

    console.log('[Deepgram] Audio pipeline started (16 kHz Int16 PCM)');
  }, []);

  // ─── stop ─────────────────────────────────────────────────────────────
  const stop = useCallback(() => {
    stoppedRef.current = true;

    // Disconnect audio nodes
    if (processorRef.current) {
      try { processorRef.current.disconnect(); } catch { /* already disconnected */ }
      processorRef.current = null;
    }
    if (sourceRef.current) {
      try { sourceRef.current.disconnect(); } catch { /* already disconnected */ }
      sourceRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }

    // Close WebSocket gracefully
    if (wsRef.current) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        // Send empty byte to signal end-of-stream, then close
        wsRef.current.send(new Uint8Array(0));
      }
      wsRef.current.close();
      wsRef.current = null;
    }

    console.log('[Deepgram] Stopped');
  }, []);

  // ─── getFullTranscript ────────────────────────────────────────────────
  const getFullTranscript = useCallback(() => {
    return (finalTranscript + (interimTranscript ? ' ' + interimTranscript : '')).trim();
  }, [finalTranscript, interimTranscript]);

  // ─── Cleanup on unmount ───────────────────────────────────────────────
  useEffect(() => {
    return () => {
      stoppedRef.current = true;
      try { processorRef.current?.disconnect(); } catch { /* */ }
      try { sourceRef.current?.disconnect(); } catch { /* */ }
      if (audioCtxRef.current) void audioCtxRef.current.close();
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  return {
    start,
    stop,
    transcript: finalTranscript + (interimTranscript ? ' ' + interimTranscript : ''),
    finalTranscript,
    interimTranscript,
    getFullTranscript,
  };
}
