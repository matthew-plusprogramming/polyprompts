import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { useTTS } from '../hooks/useTTS';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { analyzePause, scoreAnswer, transcribeAudio, textToSpeech } from '../services/openai';
import { seededQuestions } from '../data/questions';
import { countFillers } from '../hooks/useFillerDetection';
import WaveformVisualizer from '../components/WaveformVisualizer';
import SilenceNudge from '../components/SilenceNudge';
import cameraOnIcon from '../Icons/CameraOn.png';
import cameraOffIcon from '../Icons/cameraOff.png';
import starlyIcon from '../Icons/StarlyLogo.png';

// ─── Phase state machine ───
type ScreenPhase =
  | 'ready'
  | 'speaking-question'
  | 'thinking'
  | 'recording'
  | 'silence-detected'
  | 'asking-done'
  | 'mic-error'
  | 'finished';

export default function InterviewScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const { speak, stopPlayback } = useTTS();
  const speech = useSpeechRecognition();

  // ─── Main's camera state ───
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
  const [cameraError, setCameraError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // ─── Matthew's orchestration state ───
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [phase, setPhase] = useState<ScreenPhase>('ready');
  // Status text is set by orchestration callbacks for potential future UI display
  const [, setStatusText] = useState('Click "Start Interview" to begin.');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [shortAnswerWarning, setShortAnswerWarning] = useState<string | null>(null);
  const [silenceMessage, setSilenceMessage] = useState<string | undefined>(undefined);

  // ─── Matthew's refs ───
  const waitCountRef = useRef(0);
  const analyzingRef = useRef(false);
  const finishingRef = useRef(false);
  const handleDoneRef = useRef<() => Promise<void>>(async () => {});
  const activeRef = useRef(false);
  const recordingStartRef = useRef<number>(0);
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const stateRef = useRef(state);
  stateRef.current = state;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ─── Main's camera logic ───
  const requestCamera = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraStatus('unsupported');
      return;
    }
    if (streamRef.current) {
      setCameraStatus('ready');
      return;
    }

    setCameraStatus('loading');
    setCameraError('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      streamRef.current = stream;
      stream.getVideoTracks().forEach((track) => {
        track.enabled = true;
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setCameraStatus('ready');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unable to access camera.';
      setCameraError(message);
      setCameraStatus('error');
    }
  }, []);

  useEffect(() => {
    void requestCamera();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    };
  }, [requestCamera]);

  useEffect(() => {
    if (!streamRef.current) return;
    streamRef.current.getVideoTracks().forEach((track) => {
      track.enabled = cameraEnabled;
    });
  }, [cameraEnabled]);

  // ─── Matthew's offline detection ───
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // ─── Matthew's VAD + pause detection callbacks ───
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const handleSpeechEnd = useCallback((_audio: Float32Array) => {
    if (!activeRef.current) return;
  }, []);

  const handleSpeechStart = useCallback(() => {
    clearSilenceTimer();
    if (!analyzingRef.current && activeRef.current) {
      setSilenceMessage(undefined);
      setStatusText('Listening...');
      setPhase('recording');
    }
  }, [clearSilenceTimer]);

  const handleSilenceStart = useCallback(async () => {
    if (!activeRef.current || analyzingRef.current) return;
    analyzingRef.current = true;

    const transcript = speech.getFullTranscript();

    if (!transcript || transcript.trim().length < 10) {
      analyzingRef.current = false;
      return;
    }

    setPhase('silence-detected');
    setStatusText('Pause detected, analyzing...');

    try {
      const decision = await analyzePause(transcript);

      if (decision === 'definitely_done') {
        analyzingRef.current = false;
        await handleDoneRef.current();
        return;
      }

      if (decision === 'definitely_still_talking') {
        setStatusText('Listening...');
        setPhase('recording');
        analyzingRef.current = false;
        return;
      }

      // Default: verbally ask the user if they're finished
      setPhase('silence-detected');
      setStatusText('Waiting for you...');
      setSilenceMessage("Are you finished with your answer? Press Space when you're done.");
      try {
        await speakRef.current("It sounds like you might be wrapping up. Are you finished with your answer, or would you like to continue?", stateRef.current.ttsVoice, stateRef.current.ttsSpeed);
      } catch (e) {
        console.warn('[Interview] TTS nudge failed:', e);
      }
    } catch (err) {
      console.error('analyzePause failed:', err);
      setStatusText('Listening...');
      setPhase('recording');
    }

    analyzingRef.current = false;
  }, [speech]);

  const handleSilenceEnd = useCallback(() => {
    if (!analyzingRef.current && activeRef.current) {
      setSilenceMessage(undefined);
      setStatusText('Listening...');
      setPhase('recording');
    }
  }, []);

  const handleMicDisconnect = useCallback(() => {
    activeRef.current = false;
    clearSilenceTimer();
    speech.stop();
    setPhase('mic-error');
    setStatusText('Microphone disconnected. Please reconnect and try again.');
  }, [clearSilenceTimer, speech]);

  // ─── Matthew's audio recorder hook ───
  const {
    start: startRecording,
    stop: stopRecording,
    isRecording,
    userSpeaking,
  } = useAudioRecorder({
    onSpeechStart: handleSpeechStart,
    onSpeechEnd: handleSpeechEnd,
    onSilenceStart: handleSilenceStart,
    onSilenceEnd: handleSilenceEnd,
    onMicDisconnect: handleMicDisconnect,
  });

  // ─── Matthew's handleStart flow ───
  const handleStart = async () => {
    if (!state.currentQuestion || activeRef.current) return;

    const audioCtx = new AudioContext();

    // Step 1: Prime mic permission inside user gesture, then release.
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      console.error('[Interview] Mic access failed:', e);
      setStatusText('Microphone access denied. Please allow mic access and try again.');
      void audioCtx.close();
      return;
    }

    // Step 2: Speak the question via TTS
    setPhase('speaking-question');
    setStatusText('Reading question aloud...');
    try {
      await speak(state.currentQuestion.text, state.ttsVoice, state.ttsSpeed);
    } catch (e) {
      console.error('[Interview] TTS error — continuing without audio:', e);
    }

    // Step 2.5: Brief "thinking" pause
    setPhase('thinking');
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Step 3: Start VAD + recorder
    setPhase('recording');
    setStatusText('Listening...');
    setShortAnswerWarning(null);
    setSilenceMessage(undefined);
    activeRef.current = true;
    waitCountRef.current = 0;
    dispatch({ type: 'START_RECORDING' });

    try {
      await startRecording(undefined, audioCtx);
      recordingStartRef.current = Date.now();
    } catch (e) {
      console.error('[Interview] Recording failed:', e);
      setStatusText('Microphone setup failed. Please retry.');
      activeRef.current = false;
      dispatch({ type: 'STOP_RECORDING', payload: new Blob() });
      setPhase('ready');
      void audioCtx.close();
      return;
    }

    try {
      speech.start();
    } catch (e) {
      console.error('[Interview] Speech recognition failed:', e);
    }
  };

  // ─── Matthew's handleDone flow ───
  const handleDone = useCallback(async () => {
    if (finishingRef.current) return;

    const earlyTranscript = speech.getFullTranscript();
    const wordCount = earlyTranscript.trim().split(/\s+/).filter(Boolean).length;
    if (wordCount < 10) {
      setShortAnswerWarning(
        `Your answer was very short (${wordCount} word${wordCount === 1 ? '' : 's'}). Try to speak for at least 30 seconds for meaningful feedback.`
      );
      return;
    }

    finishingRef.current = true;
    activeRef.current = false;
    clearSilenceTimer();
    stopPlayback();
    speech.stop();
    setPhase('finished');

    const totalDuration = Math.floor((Date.now() - recordingStartRef.current) / 1000);
    dispatch({ type: 'SET_TOTAL_DURATION', payload: totalDuration });

    try {
      const blob = await stopRecording();
      if (blob) {
        dispatch({ type: 'STOP_RECORDING', payload: blob });
      }

      let transcript = speech.getFullTranscript();

      // Try Whisper for authoritative transcript
      if (blob && blob.size > 0) {
        try {
          const whisperTranscript = await transcribeAudio(blob);
          if (whisperTranscript && whisperTranscript.trim().length > 0) {
            transcript = whisperTranscript;
          }
        } catch (err) {
          console.warn('[Interview] Whisper transcription failed, using Web Speech API transcript:', err);
        }
      }

      if (transcript) {
        dispatch({ type: 'UPDATE_TRANSCRIPT', payload: transcript });
      }

      if (transcript && state.currentQuestion) {
        dispatch({ type: 'START_SCORING' });

        // Pre-fetch next question TTS in background
        const nextQuestions = seededQuestions.filter(q =>
          q.role === state.role && q.difficulty === state.difficulty && q.id !== state.currentQuestion!.id
        );
        if (nextQuestions.length > 0) {
          const nextQ = nextQuestions[Math.floor(Math.random() * nextQuestions.length)];
          textToSpeech(nextQ.text).catch(() => {});
        }
        try {
          const result = await scoreAnswer(
            transcript,
            state.currentQuestion.text,
            state.resumeData ?? undefined,
          );
          dispatch({ type: 'SET_RESULT', payload: result });
          dispatch({
            type: 'SAVE_SESSION',
            payload: {
              id: crypto.randomUUID(),
              questionId: state.currentQuestion.id,
              attemptNumber: state.previousAttempts.length + 1,
              transcript,
              scores: result,
              durationSeconds: state.speakingDurationSeconds,
              createdAt: new Date().toISOString(),
            },
          });
        } catch (err) {
          console.error('[Interview] Scoring failed:', err);
        }
      }

      navigate('/feedback');
    } finally {
      finishingRef.current = false;
    }
  }, [clearSilenceTimer, dispatch, navigate, speech, state.currentQuestion, state.previousAttempts.length, state.resumeData, state.role, state.difficulty, state.speakingDurationSeconds, stopPlayback, stopRecording]);

  useEffect(() => {
    handleDoneRef.current = handleDone;
  }, [handleDone]);

  // ─── Matthew's effects ───

  // Recording timer
  useEffect(() => {
    if (!state.isRecording) {
      setElapsedSeconds(0);
      return;
    }
    const id = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - recordingStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [state.isRecording]);

  // Escape key: go back during ready phase
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phase === 'ready' || phase === 'mic-error') {
        navigate('/');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, navigate]);

  // Guard: redirect to home if no question loaded
  useEffect(() => {
    if (!state.currentQuestion) {
      navigate('/');
    }
  }, [state.currentQuestion, navigate]);


  // Keep context transcript in sync
  useEffect(() => {
    if (phase === 'recording' && speech.transcript) {
      dispatch({ type: 'UPDATE_TRANSCRIPT', payload: speech.transcript });
    }
  }, [speech.transcript, phase, dispatch]);

  // Compute and dispatch WPM + filler metrics
  useEffect(() => {
    if (!state.isRecording || !state.liveTranscript) return;
    const words = state.liveTranscript.trim().split(/\s+/).filter(Boolean).length;
    const elapsed = (Date.now() - recordingStartRef.current) / 1000;
    const wpm = elapsed > 5 ? Math.round(words / (elapsed / 60)) : 0;
    const fillerCount = countFillers(state.liveTranscript);
    dispatch({
      type: 'UPDATE_METRICS',
      payload: {
        fillerCount,
        wordsPerMinute: wpm,
        speakingDurationSeconds: Math.round(elapsed),
      },
    });
  }, [state.liveTranscript, state.isRecording, dispatch]);

  // Cleanup on unmount
  const speechStop = speech.stop;
  useEffect(() => {
    return () => {
      activeRef.current = false;
      clearSilenceTimer();
      stopPlayback();
      speechStop();
      void stopRecording();
    };
  }, [clearSilenceTimer, stopPlayback, stopRecording, speechStop]);

  // Auto-scroll transcript
  useEffect(() => {
    if (!transcriptBodyRef.current) return;
    transcriptBodyRef.current.scrollTop = transcriptBodyRef.current.scrollHeight;
  }, [state.liveTranscript, speech.transcript]);

  // ─── Derived values ───
  const answerTimeLabel = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // Derive micEnabled for WaveformVisualizer from phase
  const micEnabled = phase === 'recording' || phase === 'silence-detected' || phase === 'asking-done';

  const showTranscript = phase === 'recording' || phase === 'silence-detected' || phase === 'asking-done';

  // ─── Phase badge config ───
  const phaseLabel: Record<ScreenPhase, string> = {
    ready: 'Ready',
    'speaking-question': 'Interviewer is asking\u2026',
    thinking: 'Collect your thoughts\u2026',
    recording: 'Listening\u2026',
    'silence-detected': 'Analyzing pause\u2026',
    'asking-done': 'Are you done?',
    'mic-error': 'Microphone error',
    finished: 'Processing\u2026',
  };

  const phaseBadgeColor: Record<ScreenPhase, string> = {
    ready: '#6366f1',
    'speaking-question': '#a78bfa',
    thinking: '#818cf8',
    recording: '#22d3ee',
    'silence-detected': '#f59e0b',
    'asking-done': '#34d399',
    'mic-error': '#f87171',
    finished: '#6b7280',
  };

  const badgeColor = phaseBadgeColor[phase];

  // ─── RENDER: Main's visual layout + Matthew's phase-driven overlays ───
  return (
    <div
      style={{
        height: '100vh',
        padding: '0.7rem 0.45rem',
        boxSizing: 'border-box',
        width: '100vw',
        maxWidth: 'none',
        margin: 0,
        position: 'relative',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: '26px',
        border: '1px solid rgba(255, 255, 255, 0.14)',
        color: '#eef8ff',
        backgroundColor: '#050a14',
        background:
          'radial-gradient(circle at 12% -5%, rgba(255, 255, 255, 0.14), transparent 34%), radial-gradient(circle at 88% 8%, rgba(220, 220, 220, 0.12), transparent 32%), linear-gradient(145deg, rgba(8, 12, 18, 0.98), rgba(10, 10, 10, 0.96) 48%, rgba(14, 16, 20, 0.98)), repeating-linear-gradient(135deg, rgba(148, 163, 184, 0.04) 0px, rgba(148, 163, 184, 0.04) 1px, transparent 1px, transparent 15px)',
        boxShadow: '0 20px 80px rgba(2, 8, 22, 0.7), inset 0 0 45px rgba(255, 255, 255, 0.05)',
        fontFamily: "'Space Grotesk', 'Segoe UI', sans-serif",
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Unbounded:wght@500;700&display=swap');
          .transcript-scroll {
            scrollbar-width: thin;
            scrollbar-color: rgba(230, 230, 230, 0.9) rgba(20, 28, 40, 0.55);
          }
          .transcript-scroll::-webkit-scrollbar {
            width: 11px;
          }
          .transcript-scroll::-webkit-scrollbar-track {
            background: rgba(17, 24, 39, 0.75);
            border-radius: 999px;
          }
          .transcript-scroll::-webkit-scrollbar-thumb {
            background: linear-gradient(180deg, rgba(250, 250, 250, 0.95), rgba(214, 214, 214, 0.86) 55%, rgba(165, 165, 165, 0.82));
            border-radius: 999px;
            border: 2px solid rgba(10, 15, 26, 0.8);
          }
          .transcript-scroll::-webkit-scrollbar-thumb:hover {
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(228, 228, 228, 0.9) 50%, rgba(182, 182, 182, 0.9));
          }
          @keyframes floatBlobA {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(-14px) rotate(8deg); }
          }
          @keyframes floatBlobB {
            0%, 100% { transform: translateY(0px) rotate(0deg); }
            50% { transform: translateY(12px) rotate(-10deg); }
          }
          @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
          @keyframes pulse-ring {
            0%   { transform: scale(1); opacity: 0.7; }
            100% { transform: scale(1.7); opacity: 0; }
          }
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(12px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          @keyframes breathing {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50%       { opacity: 1;   transform: scale(1.04); }
          }
          .start-interview-btn {
            position: relative;
            overflow: hidden;
            transition: all 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
          }
          .start-interview-btn:not(:disabled):hover {
            transform: translateY(-2px) scale(1.015);
            filter: brightness(1.08);
          }
          .start-interview-btn:not(:disabled):active {
            transform: scale(0.98);
          }
          .start-interview-btn:disabled {
            opacity: 0.35;
            cursor: not-allowed;
          }
          .btn-shimmer {
            position: absolute;
            top: 0;
            left: -100%;
            width: 55%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent);
            animation: btn-shimmer-anim 2.8s ease-in-out infinite;
          }
          @keyframes btn-shimmer-anim { 0% { left: -100%; } 60%, 100% { left: 150%; } }
        `}
      </style>

      {/* ── Floating blob decorations (main's design) ── */}
      <div
        style={{
          position: 'absolute',
          top: '-80px',
          right: '-90px',
          width: '280px',
          height: '280px',
          borderRadius: '34% 66% 61% 39% / 37% 43% 57% 63%',
          background: 'radial-gradient(circle, rgba(255, 255, 255, 0.16), rgba(255, 255, 255, 0))',
          pointerEvents: 'none',
          filter: 'blur(1px)',
          animation: 'floatBlobA 7s ease-in-out infinite',
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-100px',
          left: '-80px',
          width: '300px',
          height: '300px',
          borderRadius: '56% 44% 30% 70% / 41% 52% 48% 59%',
          background: 'radial-gradient(circle, rgba(210, 210, 210, 0.2), rgba(210, 210, 210, 0))',
          pointerEvents: 'none',
          animation: 'floatBlobB 8s ease-in-out infinite',
        }}
      />

      {/* ── Header: Starly logo, timer, Settings + End/Start ── */}
      <header
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr auto 1fr',
          alignItems: 'center',
          marginBottom: '0.9rem',
          gap: '0.75rem',
        }}
      >
        <div style={{ justifySelf: 'start', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <img
            src={starlyIcon}
            alt="Starly"
            style={{
              height: '60px',
              width: 'auto',
              objectFit: 'contain',
              marginLeft: '0.25rem',
            }}
          />
          {/* Phase badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '5px 14px',
              background: `${badgeColor}14`,
              border: `1px solid ${badgeColor}35`,
              borderRadius: '999px',
            }}
          >
            <div style={{ position: 'relative', width: '8px', height: '8px', flexShrink: 0 }}>
              {(phase === 'recording' || phase === 'speaking-question') && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    borderRadius: '50%',
                    background: badgeColor,
                    animation: 'pulse-ring 1.6s ease-out infinite',
                  }}
                />
              )}
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  borderRadius: '50%',
                  background: badgeColor,
                }}
              />
            </div>
            <span
              style={{
                fontFamily: "'DM Mono', monospace",
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.08em',
                color: badgeColor,
                textTransform: 'uppercase',
              }}
            >
              {phaseLabel[phase]}
            </span>
          </div>
        </div>

        <div
          style={{
            justifySelf: 'center',
            fontSize: '1.08rem',
            fontWeight: 700,
            color: '#041018',
            fontFamily: "'Unbounded', 'Space Grotesk', sans-serif",
            background: 'linear-gradient(135deg, #f3f3f3 5%, #dcdcdc 52%, #b8b8b8 100%)',
            border: '1px solid rgba(255, 255, 255, 0.45)',
            borderRadius: '14px',
            padding: '0.52rem 1rem',
            boxShadow: '0 0 24px rgba(255, 255, 255, 0.25), inset 0 -6px 14px rgba(0, 0, 0, 0.18)',
            letterSpacing: '0.08em',
          }}
        >
          {answerTimeLabel}
        </div>

        <div style={{ justifySelf: 'end', display: 'flex', gap: '0.6rem' }}>
          <button
            type="button"
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '12px',
              border: '1px solid rgba(255, 255, 255, 0.28)',
              background: 'linear-gradient(145deg, rgba(8, 18, 34, 0.92), rgba(9, 20, 37, 0.8))',
              color: '#f1f1f1',
              fontSize: '0.9rem',
              letterSpacing: '0.06em',
              cursor: 'pointer',
            }}
          >
            Settings
          </button>
          {phase === 'ready' ? (
            <button
              type="button"
              className="start-interview-btn"
              onClick={handleStart}
              disabled={!state.currentQuestion}
              style={{
                padding: '0.55rem 1.2rem',
                borderRadius: '12px',
                border: 'none',
                background: state.currentQuestion
                  ? 'linear-gradient(135deg, #4338ca, #6366f1 50%, #22d3ee)'
                  : '#111120',
                color: '#fff',
                fontSize: '0.9rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                boxShadow: state.currentQuestion
                  ? '0 6px 28px rgba(99,102,241,0.42), 0 0 0 1px rgba(99,102,241,0.2)'
                  : 'none',
                cursor: state.currentQuestion ? 'pointer' : 'not-allowed',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <div className="btn-shimmer" />
              Start &rarr;
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void handleDone()}
              disabled={phase === 'finished' || phase === 'speaking-question' || phase === 'thinking'}
              style={{
                padding: '0.55rem 0.95rem',
                borderRadius: '12px',
                border: '1px solid rgba(255, 255, 255, 0.45)',
                background: 'linear-gradient(130deg, #ffffff, #dcdcdc 45%, #bdbdbd)',
                color: '#111111',
                fontSize: '0.9rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                boxShadow: '0 0 18px rgba(255, 255, 255, 0.22)',
                cursor: phase === 'finished' ? 'not-allowed' : 'pointer',
                opacity: phase === 'finished' || phase === 'speaking-question' || phase === 'thinking' ? 0.5 : 1,
              }}
            >
              End
            </button>
          )}
        </div>
      </header>

      {/* ── Offline banner ── */}
      {isOffline && (
        <div style={{
          position: 'relative',
          zIndex: 1,
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.3)',
          borderRadius: '8px',
          padding: '8px 16px',
          color: '#fca5a5',
          fontSize: '13px',
          textAlign: 'center',
          marginBottom: '0.5rem',
        }}>
          You appear to be offline. Recording will continue but scoring requires an internet connection.
        </div>
      )}

      {/* ── Two-column body: Video feed + Waveform ── */}
      <div
        style={{
          position: 'relative',
          zIndex: 1,
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)',
          gridTemplateRows: 'minmax(0, 1fr)',
          alignItems: 'stretch',
          gap: '0.75rem',
          marginBottom: '0.75rem',
          flex: '1 1 auto',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Left: Video feed (main's design) */}
        <section
          style={{
            minHeight: 0,
            height: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '22px 10px 22px 10px',
            overflow: 'hidden',
            background: 'linear-gradient(165deg, rgba(10, 20, 37, 0.88), rgba(6, 12, 23, 0.95))',
            color: '#f7f7f7',
            position: 'relative',
            boxShadow: 'inset 0 0 26px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
          }}
        >
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            controls={false}
            disablePictureInPicture
            disableRemotePlayback
            onContextMenu={(e) => e.preventDefault()}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)',
              display: cameraStatus === 'ready' && cameraEnabled ? 'block' : 'none',
              pointerEvents: 'none',
            }}
          />

          {(cameraStatus !== 'ready' || !cameraEnabled) && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                padding: '1rem',
              }}
            >
              <div>
                <strong>Your Video</strong>
                <p style={{ marginTop: '0.5rem', color: '#d0d0d0' }}>
                  {!cameraEnabled && 'Camera is off.'}
                  {cameraStatus === 'loading' && cameraEnabled && 'Requesting camera access...'}
                  {cameraStatus === 'unsupported' && cameraEnabled && 'Camera is not supported in this browser.'}
                  {cameraStatus === 'error' && cameraEnabled && `Camera unavailable: ${cameraError}`}
                </p>
                {(cameraStatus === 'error' || cameraStatus === 'unsupported') && cameraEnabled && (
                  <button
                    type="button"
                    onClick={() => void requestCamera()}
                    style={{
                      marginTop: '0.65rem',
                      padding: '0.4rem 0.7rem',
                      borderRadius: '8px',
                      border: '1px solid rgba(255, 255, 255, 0.22)',
                      background: 'rgba(255, 255, 255, 0.06)',
                      color: '#f2f2f2',
                      cursor: 'pointer',
                    }}
                  >
                    Retry Camera
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Mic / Camera toggle buttons */}
          <div
            style={{
              position: 'absolute',
              left: '12px',
              bottom: '12px',
              display: 'flex',
              gap: '8px',
              zIndex: 2,
            }}
          >
            <button
              type="button"
              onClick={() => setCameraEnabled((prev) => {
                const next = !prev;
                if (next && !streamRef.current) {
                  void requestCamera();
                }
                return next;
              })}
              style={{
                width: '42px',
                height: '42px',
                borderRadius: '999px',
                border: cameraEnabled ? '1px solid rgba(255, 255, 255, 0.28)' : '1px solid rgba(190, 190, 190, 0.35)',
                background: cameraEnabled ? 'rgba(18, 18, 18, 0.9)' : 'rgba(42, 42, 42, 0.9)',
                color: '#fff',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              aria-label={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
              title={cameraEnabled ? 'Turn camera off' : 'Turn camera on'}
            >
              <img
                src={cameraEnabled ? cameraOnIcon : cameraOffIcon}
                alt={cameraEnabled ? 'Camera on' : 'Camera off'}
                style={{ width: '20px', height: '20px', objectFit: 'contain' }}
              />
            </button>
          </div>

          {/* VAD speaking indicator overlay */}
          {isRecording && (
            <div
              style={{
                position: 'absolute',
                top: '12px',
                left: '12px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                background: userSpeaking ? 'rgba(34,197,94,0.15)' : 'rgba(148,163,184,0.08)',
                border: `1px solid ${userSpeaking ? 'rgba(34,197,94,0.35)' : 'rgba(148,163,184,0.18)'}`,
                borderRadius: '999px',
                transition: 'background 0.2s ease, border-color 0.2s ease',
                zIndex: 2,
              }}
            >
              <div
                style={{
                  width: '7px',
                  height: '7px',
                  borderRadius: '50%',
                  background: userSpeaking ? '#22c55e' : '#64748b',
                  boxShadow: userSpeaking ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
                  transition: 'all 0.15s ease',
                }}
              />
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  fontWeight: '600',
                  letterSpacing: '0.06em',
                  color: userSpeaking ? '#4ade80' : '#64748b',
                  transition: 'color 0.15s ease',
                }}
              >
                {userSpeaking ? 'SPEAKING' : 'LISTENING'}
              </span>
            </div>
          )}
        </section>

        {/* Right: Waveform Visualizer (main's component) */}
        <section
          style={{
            minHeight: 0,
            height: '100%',
            boxSizing: 'border-box',
            border: '1px solid rgba(255, 255, 255, 0.14)',
            borderRadius: '10px 22px 10px 22px',
            background: 'linear-gradient(160deg, rgba(12, 22, 34, 0.95), rgba(8, 16, 27, 0.98))',
            color: '#f0f0f0',
            padding: '1.15rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.95rem',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            boxShadow: 'inset 0 0 26px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
          }}
        >
          <div style={{ width: 'calc(100% + 2.3rem)', marginLeft: '-1.15rem', marginRight: '-1.15rem' }}>
            <WaveformVisualizer height={285} micEnabled={micEnabled} />
          </div>
        </section>
      </div>

      {/* ── Phase-specific overlays (matthew's logic) ── */}

      {/* Speaking-question overlay */}
      {phase === 'speaking-question' && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 24px',
            marginBottom: '0.5rem',
            background: 'rgba(167,139,250,0.07)',
            border: '1px solid rgba(167,139,250,0.18)',
            borderRadius: '14px',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#a78bfa',
              flexShrink: 0,
              animation: 'pulse-ring 1.2s ease-out infinite',
            }}
          />
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              fontWeight: '600',
              color: '#c4b5fd',
              letterSpacing: '0.01em',
            }}
          >
            Interviewer is asking your question aloud&hellip;
          </span>
        </div>
      )}

      {/* Thinking pause overlay */}
      {phase === 'thinking' && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            padding: '12px 24px',
            marginBottom: '0.5rem',
            background: 'rgba(129,140,248,0.07)',
            border: '1px solid rgba(129,140,248,0.18)',
            borderRadius: '14px',
            animation: 'breathing 2s ease-in-out infinite',
          }}
        >
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#818cf8',
              flexShrink: 0,
              opacity: 0.8,
            }}
          />
          <span
            style={{
              fontFamily: "'Space Grotesk', sans-serif",
              fontSize: '14px',
              fontWeight: '600',
              color: '#a5b4fc',
              letterSpacing: '0.01em',
            }}
          >
            Take a moment to collect your thoughts&hellip;
          </span>
        </div>
      )}

      {/* Mic error panel */}
      {phase === 'mic-error' && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            padding: '20px 24px',
            marginBottom: '0.5rem',
            background: 'rgba(248,113,113,0.07)',
            border: '1px solid rgba(248,113,113,0.22)',
            borderRadius: '14px',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            alignItems: 'center',
            textAlign: 'center',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '700', color: '#f87171' }}>
            Microphone Disconnected
          </h3>
          <p style={{ margin: 0, fontSize: '14px', color: '#fca5a5' }}>
            Your microphone was disconnected during recording.
          </p>
          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', marginTop: '8px' }}>
            <button
              onClick={handleStart}
              disabled={!state.currentQuestion}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: '1px solid rgba(99,102,241,0.4)',
                background: 'rgba(99,102,241,0.15)',
                color: '#a5b4fc',
                fontSize: '14px',
                fontWeight: '700',
                cursor: state.currentQuestion ? 'pointer' : 'not-allowed',
              }}
            >
              Retry with Mic
            </button>
            <button
              onClick={() => {
                const transcript = speech.getFullTranscript().trim();
                if (transcript.length > 10) {
                  void handleDone();
                } else {
                  navigate('/');
                }
              }}
              style={{
                padding: '10px 24px',
                borderRadius: '10px',
                border: '1px solid rgba(248,113,113,0.3)',
                background: 'rgba(248,113,113,0.1)',
                color: '#f87171',
                fontSize: '14px',
                fontWeight: '700',
                cursor: 'pointer',
              }}
            >
              {speech.getFullTranscript().trim().length > 10 ? 'Score Current Answer' : 'Back to Setup'}
            </button>
          </div>
        </div>
      )}

      {/* Processing overlay (finished phase) */}
      {phase === 'finished' && (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '14px',
            padding: '30px',
            animation: 'fadeIn 0.3s ease',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              border: '3px solid rgba(99,102,241,0.2)',
              borderTopColor: '#6366f1',
              borderRadius: '50%',
              animation: 'spin 0.75s linear infinite',
            }}
          />
          <p style={{ color: '#94a3b8', fontSize: '14px', margin: 0, textAlign: 'center' }}>
            {state.isScoring ? 'Analyzing your answer...' : 'Transcribing your response...'}
          </p>
        </div>
      )}

      {/* ── Bottom section: Transcript + controls ── */}
      <section
        style={{
          position: 'relative',
          zIndex: 1,
          flex: '0 0 240px',
          minHeight: 0,
          padding: '0.65rem 1.1rem 1.1rem',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '22px',
          background: 'linear-gradient(165deg, rgba(10, 19, 31, 0.94), rgba(6, 13, 23, 0.98))',
          color: '#ecfffb',
          boxShadow: 'inset 0 0 22px rgba(255, 255, 255, 0.05), 0 10px 24px rgba(0, 0, 0, 0.35)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.18rem 0.7rem 0.35rem',
            marginBottom: '0.7rem',
          }}
        >
          <strong
            style={{
              fontFamily: "'Unbounded', 'Space Grotesk', sans-serif",
              fontSize: '0.85rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#ececec',
            }}
          >
            Live Transcript
          </strong>

          {/* Question display (compact) */}
          {state.currentQuestion && phase === 'ready' && (
            <span style={{ fontSize: '0.75rem', color: '#94a3b8', maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {state.currentQuestion.text}
            </span>
          )}
        </div>

        <div
          ref={transcriptBodyRef}
          className="transcript-scroll"
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: 'scroll',
            paddingRight: '0.2rem',
          }}
        >
          <p style={{ marginTop: 0, lineHeight: 1.54, color: '#d7d7d7' }}>
            {state.liveTranscript || speech.transcript || (
              phase === 'ready'
                ? 'Click "Start" to begin the interview. Your transcript will appear here as you speak.'
                : phase === 'speaking-question' || phase === 'thinking'
                  ? 'Preparing to listen...'
                  : 'Waiting for you to speak...'
            )}
          </p>
        </div>

        {/* Silence nudge */}
        <SilenceNudge visible={phase === 'silence-detected'} message={silenceMessage} />

        {/* Short answer warning */}
        {shortAnswerWarning && (
          <div
            style={{
              marginTop: '0.5rem',
              padding: '10px 14px',
              background: 'rgba(245,158,11,0.07)',
              border: '1px solid rgba(245,158,11,0.25)',
              borderRadius: '10px',
              fontSize: '13px',
              color: '#fbbf24',
              lineHeight: 1.5,
            }}
          >
            {shortAnswerWarning}
          </div>
        )}

      </section>
    </div>
  );
}
