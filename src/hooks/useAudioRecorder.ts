import { useState, useRef, useCallback, useEffect } from 'react';
import { MicVAD, type RealTimeVADOptions } from '@ricky0123/vad-web';
import { createAudioRecorder } from '../services/audioRecorder';
import type { AudioRecorder } from '../services/audioRecorder';
import { createLogger } from '../utils/logger';

const log = createLogger('AudioRecorder');
const vadLog = log.child('VAD');
const volumeLog = log.child('Volume');

const SILENCE_THRESHOLD = 0.07;
const SILENCE_DURATION_MS = 3000;
const VOLUME_CHECK_INTERVAL_MS = 100;

export interface UseAudioRecorderOptions {
  onSpeechStart: () => void;
  onSpeechEnd: (audio: Float32Array) => void;
  onSilenceStart?: () => void;
  onSilenceEnd?: () => void;
  onMicDisconnect?: () => void;
}

export function useAudioRecorder(options: UseAudioRecorderOptions) {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [vadReady, setVadReady] = useState(false);
  const [volumeLevel, setVolumeLevel] = useState(0);

  const vadRef = useRef<MicVAD | null>(null);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const normalizationCtxRef = useRef<AudioContext | null>(null);
  const volumeCtxRef = useRef<AudioContext | null>(null);
  const volumeIntervalRef = useRef<number | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const isSilentRef = useRef(false);

  // Keep callback refs in sync so VAD always calls latest versions
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  }, [options]);

  const stopVolumeMonitor = useCallback(() => {
    if (volumeIntervalRef.current !== null) {
      clearInterval(volumeIntervalRef.current);
      volumeIntervalRef.current = null;
    }
    if (volumeCtxRef.current) {
      void volumeCtxRef.current.close();
      volumeCtxRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
    isSilentRef.current = false;
  }, []);

  /**
   * Start RMS-based volume monitoring for silence detection.
   * Uses its OWN AudioContext — separate from the VAD's context — so the
   * VAD's internal audio processing chain doesn't interfere with the
   * AnalyserNode readings.
   */
  const startVolumeMonitor = useCallback((stream: MediaStream) => {
    try {
      // Dedicated AudioContext for volume monitoring (separate from VAD)
      const audioCtx = new AudioContext();
      volumeCtxRef.current = audioCtx;

      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Float32Array(analyser.fftSize);

      // Ensure context is running (Chrome may auto-suspend contexts
      // created outside a user-gesture call stack)
      if (audioCtx.state === 'suspended') {
        void audioCtx.resume();
      }

      volumeIntervalRef.current = window.setInterval(() => {
        if (!analyserRef.current) return;
        analyserRef.current.getFloatTimeDomainData(dataArray);

        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        setVolumeLevel(rms);

        if (rms < SILENCE_THRESHOLD) {
          if (!silenceStartRef.current) {
            silenceStartRef.current = Date.now();
          } else if (
            Date.now() - silenceStartRef.current >= SILENCE_DURATION_MS
          ) {
            volumeLog.info('Silence detected (4s of low volume)');
            optionsRef.current.onSilenceStart?.();
            // Reset timer so it fires again after another 3.5s of continued silence
            silenceStartRef.current = Date.now();
          }
        } else {
          if (isSilentRef.current) {
            volumeLog.info('Sound resumed');
            optionsRef.current.onSilenceEnd?.();
          }
          silenceStartRef.current = null;
          isSilentRef.current = false;
        }
      }, VOLUME_CHECK_INTERVAL_MS);

      volumeLog.info('RMS volume monitor started (dedicated AudioContext)');
    } catch (err) {
      volumeLog.warn('Volume monitor setup failed', { error: String(err) });
    }
  }, []);

  const start = useCallback(async (existingStream?: MediaStream, audioContext?: AudioContext) => {
    // Clean up any previous session
    if (vadRef.current) {
      await vadRef.current.destroy();
      vadRef.current = null;
    }
    if (recorderRef.current) {
      await recorderRef.current.stop();
      recorderRef.current = null;
    }
    stopVolumeMonitor();

    setAudioBlob(null);
    setUserSpeaking(false);
    setVadReady(false);

    // Capture the stream ref for the getStream closure
    let stream: MediaStream | null = existingStream ?? null;

    // Initialize VAD — it will call getStream() to get the mic
    const vadOptions: Partial<RealTimeVADOptions> = {
      // Pass caller-provided AudioContext so it's created in a user gesture context
      // (Chrome suspends AudioContexts created outside gesture call stacks)
      ...(audioContext ? { audioContext } : {}),
      getStream: async () => {
        if (stream) {
          const s = stream;
          // Only use the pre-acquired stream on first call
          stream = null;
          micStreamRef.current = s;
          return s;
        }
        const s = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
        });
        micStreamRef.current = s;
        return s;
      },
      positiveSpeechThreshold: 0.6,
      negativeSpeechThreshold: 0.3,
      redemptionMs: 600,
      preSpeechPadMs: 400,
      minSpeechMs: 500,
      submitUserSpeechOnPause: false,
      baseAssetPath: '/vad/',
      onnxWASMBasePath: 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.24.2/dist/',
      ortConfig: (ort) => {
        ort.env.wasm.numThreads = 1;
      },
      onSpeechStart: () => {
        vadLog.info('Speech started');
        setUserSpeaking(true);
        optionsRef.current.onSpeechStart();
      },
      onSpeechEnd: (audio: Float32Array) => {
        vadLog.info('Speech ended', { audioLength: audio.length });
        setUserSpeaking(false);
        optionsRef.current.onSpeechEnd(audio);
      },
    };

    try {
      const vad = await MicVAD.new(vadOptions);
      vadRef.current = vad;
      await vad.start();

      // Start MediaRecorder with audio normalization via DynamicsCompressorNode.
      // The VAD keeps using the raw mic stream; the recorder gets a normalized
      // stream so quiet speakers are boosted and loud speakers are compressed.
      if (micStreamRef.current) {
        let recorderStream: MediaStream = micStreamRef.current;

        try {
          const normCtx = new AudioContext();
          normalizationCtxRef.current = normCtx;

          const source = normCtx.createMediaStreamSource(micStreamRef.current);

          // DynamicsCompressor automatically boosts quiet audio and tames loud peaks
          const compressor = normCtx.createDynamicsCompressor();
          compressor.threshold.setValueAtTime(-24, normCtx.currentTime);
          compressor.knee.setValueAtTime(30, normCtx.currentTime);
          compressor.ratio.setValueAtTime(12, normCtx.currentTime);
          compressor.attack.setValueAtTime(0.003, normCtx.currentTime);
          compressor.release.setValueAtTime(0.25, normCtx.currentTime);

          const makeupGain = normCtx.createGain();
          makeupGain.gain.setValueAtTime(1.5, normCtx.currentTime);

          const destination = normCtx.createMediaStreamDestination();
          source.connect(compressor).connect(makeupGain).connect(destination);

          recorderStream = destination.stream;
          log.info('Audio normalization chain active');
        } catch (normErr) {
          log.warn('Audio normalization failed, using raw stream', { error: String(normErr) });
          normalizationCtxRef.current = null;
        }

        const recorder = createAudioRecorder({
          onMicDisconnect: () => {
            log.warn('Mic disconnected');
            optionsRef.current.onMicDisconnect?.();
          },
          onError: (err) => {
            log.error('Recorder error', { error: String(err) });
          },
        });
        recorder.start(recorderStream);
        recorderRef.current = recorder;

        // Start RMS volume monitor for silence detection ("are you done?" flow).
        // Uses its own AudioContext, separate from the VAD's.
        if (micStreamRef.current) {
          startVolumeMonitor(micStreamRef.current);
        }
      }

      setVadReady(true);
      setIsRecording(true);
      log.info('VAD + MediaRecorder + volume monitor started');
      return micStreamRef.current;
    } catch (err) {
      log.error('VAD initialization failed', { error: String(err) });
      setIsRecording(false);
      throw err;
    }
  }, [stopVolumeMonitor, startVolumeMonitor]);

  const stop = useCallback(async () => {
    log.info('Stopping recording');
    stopVolumeMonitor();

    // Stop VAD
    if (vadRef.current) {
      await vadRef.current.destroy();
      vadRef.current = null;
    }

    // Stop MediaRecorder and get blob
    let blob: Blob | null = null;
    if (recorderRef.current) {
      blob = await recorderRef.current.stop();
      recorderRef.current = null;
    }

    // Close normalization AudioContext
    if (normalizationCtxRef.current) {
      void normalizationCtxRef.current.close();
      normalizationCtxRef.current = null;
    }

    // Stop mic tracks
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }

    setIsRecording(false);
    setUserSpeaking(false);
    setVadReady(false);

    if (blob) setAudioBlob(blob);
    return blob;
  }, [stopVolumeMonitor]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopVolumeMonitor();
      void vadRef.current?.destroy();
      void recorderRef.current?.stop();
      if (normalizationCtxRef.current) {
        void normalizationCtxRef.current.close();
        normalizationCtxRef.current = null;
      }
      if (volumeCtxRef.current) {
        void volumeCtxRef.current.close();
        volumeCtxRef.current = null;
      }
      micStreamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [stopVolumeMonitor]);

  return { start, stop, isRecording, audioBlob, userSpeaking, vadReady, volumeLevel };
}
