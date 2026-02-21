import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { useTTS } from '../hooks/useTTS';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { analyzePause, scoreAnswer, transcribeAudio, textToSpeech } from '../services/openai';
import { seededQuestions } from '../data/questions';
import { countFillers } from '../hooks/useFillerDetection';
import QuestionDisplay from '../components/QuestionDisplay';
import TranscriptPanel from '../components/TranscriptPanel';
import DoneButton from '../components/DoneButton';
import WaveformVisualizer from '../components/WaveformVisualizer';
import CoachingMetrics from '../components/CoachingMetrics';
import SilenceNudge from '../components/SilenceNudge';
import FlowProgress from '../components/FlowProgress';

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

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [phase, setPhase] = useState<ScreenPhase>('ready');
  const [statusText, setStatusText] = useState('Click "Start Interview" to begin.');
  const [startHov, setStartHov] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [shortAnswerWarning, setShortAnswerWarning] = useState<string | null>(null);
  const [silenceMessage, setSilenceMessage] = useState<string | undefined>(undefined);

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

  // Timer for detecting extended silence after speech ends
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // Offline detection
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

  // Called when VAD detects speech has ended (a segment of silence after talking)
  const handleSpeechEnd = useCallback((_audio: Float32Array) => {
    if (!activeRef.current) return;
    // VAD speech-end is used for userSpeaking state — silence detection is
    // handled by the RMS volume monitor (onSilenceStart below).
  }, []);

  const handleSpeechStart = useCallback(() => {
    // User started speaking — cancel any pending silence analysis and reset nudge
    clearSilenceTimer();
    if (!analyzingRef.current && activeRef.current) {
      setSilenceMessage(undefined);
      setStatusText('Listening...');
      setPhase('recording');
    }
  }, [clearSilenceTimer]);

  // Called by RMS volume monitor after 3.5s of sustained silence.
  // Fires repeatedly every 3.5s while silence continues.
  //   definitely_done           → auto-submit
  //   definitely_still_talking  → stay quiet, resume listening
  //   ask (default)             → gently ask "Are you finished?"
  const handleSilenceStart = useCallback(async () => {
    if (!activeRef.current || analyzingRef.current) return;
    analyzingRef.current = true;

    const transcript = speech.getFullTranscript();

    // Too short to analyze — just keep listening
    if (!transcript || transcript.trim().length < 10) {
      analyzingRef.current = false;
      return;
    }

    setPhase('silence-detected');
    setStatusText('Pause detected, analyzing...');

    try {
      const decision = await analyzePause(transcript);

      if (decision === 'definitely_done') {
        // Extremely confident the user is finished — auto-submit
        analyzingRef.current = false;
        await handleDoneRef.current();
        return;
      }

      if (decision === 'definitely_still_talking') {
        // Extremely confident the user is mid-thought — stay quiet
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

  // Called when sound resumes after a silence period
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

  // Start the full interview flow
  const handleStart = async () => {
    if (!state.currentQuestion || activeRef.current) return;

    // Create AudioContext NOW, in the synchronous click handler call stack.
    // Chrome suspends AudioContexts created outside a user gesture, and the
    // VAD creates its own context after multiple awaits (mic prime + TTS),
    // which means the gesture window has closed by then.
    const audioCtx = new AudioContext();

    // Step 1: Prime mic permission inside user gesture, then release.
    // An active mic during TTS can suppress speaker output on some devices.
    console.log('[Interview] Priming mic permission...');
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      permissionStream.getTracks().forEach((track) => track.stop());
      console.log('[Interview] Mic permission primed');
    } catch (e) {
      console.error('[Interview] Mic access failed:', e);
      setStatusText('Microphone access denied. Please allow mic access and try again.');
      void audioCtx.close();
      return;
    }

    // Step 2: Speak the question via TTS
    console.log('[Interview] Starting TTS...');
    setPhase('speaking-question');
    setStatusText('Reading question aloud...');
    try {
      await speak(state.currentQuestion.text, state.ttsVoice, state.ttsSpeed);
      console.log('[Interview] TTS completed');
    } catch (e) {
      console.error('[Interview] TTS error — continuing without audio:', e);
      // TTS failed; the question is still displayed as text so the interview can continue
    }

    // Step 2.5: Brief "thinking" pause before recording starts
    setPhase('thinking');
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Step 3: Start VAD + recorder (pass our user-gesture AudioContext)
    console.log('[Interview] Starting VAD + recorder...');
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
      console.log('[Interview] VAD + recorder started');
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
      console.log('[Interview] Speech recognition started');
    } catch (e) {
      console.error('[Interview] Speech recognition failed:', e);
    }
  };

  // Done button
  const handleDone = useCallback(async () => {
    if (finishingRef.current) return;

    // Guard against very short answers before tearing down the session
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

      // Score the answer before navigating
      if (transcript && state.currentQuestion) {
        dispatch({ type: 'START_SCORING' });

        // Pre-fetch next question TTS in background (fire and forget, populates cache)
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
          // Navigate to feedback anyway — the screen will show an error state
        }
      }

      navigate('/feedback');
    } finally {
      finishingRef.current = false;
    }
  }, [clearSilenceTimer, dispatch, navigate, speech, state.currentQuestion, state.resumeData, stopPlayback, stopRecording]);

  useEffect(() => {
    handleDoneRef.current = handleDone;
  }, [handleDone]);

  // Recording timer: count elapsed seconds while recording is active
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

  // Escape key: go back to home during 'ready' phase; ignore during recording
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (phase === 'ready' || phase === 'mic-error') {
        navigate('/');
      }
      // Intentionally no-op during recording to prevent accidental cancellation
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [phase, navigate]);

  // Guard: redirect to home if no question is loaded (e.g. direct navigation to /interview)
  useEffect(() => {
    if (!state.currentQuestion) {
      navigate('/');
    }
  }, [state.currentQuestion, navigate]);

  // Track viewport width for responsive layout
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // Keep context transcript in sync for coaching metrics
  useEffect(() => {
    if (phase === 'recording' && speech.transcript) {
      dispatch({ type: 'UPDATE_TRANSCRIPT', payload: speech.transcript });
    }
  }, [speech.transcript, phase, dispatch]);

  // Compute and dispatch WPM + filler metrics whenever the live transcript changes
  useEffect(() => {
    if (!state.isRecording || !state.liveTranscript) return;

    const words = state.liveTranscript.trim().split(/\s+/).filter(Boolean).length;
    const elapsedSeconds = (Date.now() - recordingStartRef.current) / 1000;
    const wpm = elapsedSeconds > 5 ? Math.round(words / (elapsedSeconds / 60)) : 0;
    const fillerCount = countFillers(state.liveTranscript);

    dispatch({
      type: 'UPDATE_METRICS',
      payload: {
        fillerCount,
        wordsPerMinute: wpm,
        speakingDurationSeconds: Math.round(elapsedSeconds),
      },
    });
  }, [state.liveTranscript, state.isRecording, dispatch]);

  // Extract stable function refs for cleanup (speech.stop is a useCallback with [] deps)
  const speechStop = speech.stop;

  // Cleanup on unmount (and HMR)
  useEffect(() => {
    return () => {
      console.log('[Interview] Cleanup: releasing all resources');
      activeRef.current = false;
      clearSilenceTimer();
      stopPlayback();
      speechStop();
      void stopRecording();
    };
  }, [clearSilenceTimer, stopPlayback, stopRecording, speechStop]);

  /* ─────────────────────────────────────────────
     Derived booleans for rendering
  ───────────────────────────────────────────── */
  const formatElapsed = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const isWaveformActive = phase === 'speaking-question' || phase === 'thinking' || isRecording;
  const waveformMode: 'speaking' | 'listening' | 'idle' =
    phase === 'speaking-question' ? 'speaking' : isRecording ? 'listening' : 'idle';
  const showTranscript =
    phase === 'recording' ||
    phase === 'silence-detected' ||
    phase === 'asking-done';
  const showDoneButton =
    phase === 'recording' ||
    phase === 'silence-detected' ||
    phase === 'asking-done';
  const showStartButton = phase === 'ready';

  /* ─────────────────────────────────────────────
     Sub-labels per phase
  ───────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────
     Phase badge color
  ───────────────────────────────────────────── */
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

  /* ─────────────────────────────────────────────
     Render
  ───────────────────────────────────────────── */
  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { background: #09090f; }

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
      `}</style>

      {/* ── Background ambient glows ── */}
      <div
        style={{
          position: 'fixed',
          top: '-10%',
          right: '-5%',
          width: '480px',
          height: '480px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(99,102,241,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />
      <div
        style={{
          position: 'fixed',
          bottom: '-8%',
          left: '-6%',
          width: '380px',
          height: '380px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(34,211,238,0.04) 0%, transparent 65%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* ── Main layout ── */}
      <div
        style={{
          minHeight: '100vh',
          background: '#09090f',
          position: 'relative',
          zIndex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: isMobile ? '20px 16px 32px' : '40px 20px 48px',
          fontFamily: "'DM Sans', sans-serif",
          overflowX: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: '900px',
            display: 'flex',
            flexDirection: 'column',
            gap: '24px',
            animation: 'fadeIn 0.45s ease forwards',
          }}
        >

          <FlowProgress currentStep="interview" />

          {/* ── Offline banner ── */}
          {isOffline && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              padding: '8px 16px',
              color: '#fca5a5',
              fontSize: '13px',
              fontFamily: "'DM Sans', sans-serif",
              textAlign: 'center',
            }}>
              You appear to be offline. Recording will continue but scoring requires an internet connection.
            </div>
          )}

          {/* ── Header: phase badge ── */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 16px',
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

            {/* Finished spinner */}
            {phase === 'finished' && (
              <div
                style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid rgba(255,255,255,0.1)',
                  borderTopColor: '#6366f1',
                  borderRadius: '50%',
                  animation: 'spin 0.65s linear infinite',
                }}
              />
            )}
          </div>

          {/* ── Question Display ── */}
          {state.currentQuestion ? (
            <QuestionDisplay question={state.currentQuestion} />
          ) : (
            <div
              style={{
                background: 'rgba(248,113,113,0.06)',
                border: '1px solid rgba(248,113,113,0.2)',
                borderRadius: '16px',
                padding: '24px 28px',
                fontFamily: "'Syne', sans-serif",
                fontSize: '15px',
                color: '#f87171',
              }}
            >
              No question loaded — go back to Setup.
            </div>
          )}

          {/* ── Waveform Visualizer ── */}
          <div
            style={{
              background: 'rgba(255,255,255,0.012)',
              border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: '16px',
              padding: isMobile ? '14px 16px' : '20px 24px',
              backdropFilter: 'blur(12px)',
              position: 'relative',
            }}
          >
            <WaveformVisualizer
              isActive={isWaveformActive}
              mode={waveformMode}
              height={isMobile ? 64 : 96}
            />
            {/* Mic level indicator */}
            {state.isRecording && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  left: '16px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '4px 10px',
                  background: userSpeaking ? 'rgba(34,197,94,0.10)' : 'rgba(148,163,184,0.07)',
                  border: `1px solid ${userSpeaking ? 'rgba(34,197,94,0.30)' : 'rgba(148,163,184,0.15)'}`,
                  borderRadius: '999px',
                  transition: 'background 0.2s ease, border-color 0.2s ease',
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    flexShrink: 0,
                    background: userSpeaking ? '#22c55e' : '#64748b',
                    boxShadow: userSpeaking ? '0 0 6px rgba(34,197,94,0.6)' : 'none',
                    transition: 'background 0.15s ease, box-shadow 0.15s ease',
                  }}
                />
                <span
                  style={{
                    fontFamily: "'DM Mono', monospace",
                    fontSize: '11px',
                    fontWeight: '600',
                    letterSpacing: '0.06em',
                    color: userSpeaking ? '#4ade80' : '#64748b',
                    transition: 'color 0.15s ease',
                  }}
                >
                  {userSpeaking ? 'MIC ACTIVE' : 'LISTENING...'}
                </span>
              </div>
            )}

            {/* Recording timer */}
            {state.isRecording && (
              <div
                style={{
                  position: 'absolute',
                  top: '12px',
                  right: '16px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: isMobile ? '14px' : '20px',
                  fontWeight: '500',
                  color: '#94a3b8',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              >
                {formatElapsed(elapsedSeconds)}
              </div>
            )}
          </div>

          {/* ── Speaking-question label ── */}
          {phase === 'speaking-question' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 24px',
                background: 'rgba(167,139,250,0.07)',
                border: '1px solid rgba(167,139,250,0.18)',
                borderRadius: '14px',
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
                  fontFamily: "'Syne', sans-serif",
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

          {/* ── Thinking pause label ── */}
          {phase === 'thinking' && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '10px',
                padding: '14px 24px',
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
                  fontFamily: "'Syne', sans-serif",
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

          {/* ── Mic error message ── */}
          {phase === 'mic-error' && (
            <div
              style={{
                padding: '24px 28px',
                background: 'rgba(248,113,113,0.07)',
                border: '1px solid rgba(248,113,113,0.22)',
                borderRadius: '14px',
                fontFamily: "'Syne', sans-serif",
                lineHeight: 1.6,
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                alignItems: 'center',
                textAlign: 'center',
              }}
            >
              <h3
                style={{
                  margin: 0,
                  fontSize: '16px',
                  fontWeight: '700',
                  color: '#f87171',
                  letterSpacing: '0.01em',
                }}
              >
                Microphone Disconnected
              </h3>
              <p style={{ margin: 0, fontSize: '14px', color: '#fca5a5' }}>
                Your microphone was disconnected during recording.
              </p>
              <p style={{ margin: 0, fontSize: '13px', color: '#94a3b8' }}>
                {speech.getFullTranscript().trim().length > 10
                  ? 'Your transcript so far has been saved.'
                  : 'Please reconnect your microphone and try again.'}
              </p>
              <div
                style={{
                  display: 'flex',
                  gap: '12px',
                  justifyContent: 'center',
                  marginTop: '8px',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  onClick={handleStart}
                  disabled={!state.currentQuestion}
                  style={{
                    padding: '10px 24px',
                    borderRadius: '10px',
                    border: '1px solid rgba(99,102,241,0.4)',
                    background: 'rgba(99,102,241,0.15)',
                    color: '#a5b4fc',
                    fontFamily: "'Syne', sans-serif",
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: state.currentQuestion ? 'pointer' : 'not-allowed',
                    transition: 'background 0.2s ease',
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
                    fontFamily: "'Syne', sans-serif",
                    fontSize: '14px',
                    fontWeight: '700',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                >
                  {speech.getFullTranscript().trim().length > 10
                    ? 'Score Current Answer'
                    : 'Back to Setup'}
                </button>
              </div>
            </div>
          )}

          {/* ── Processing overlay — shown while Whisper transcribes and scoring runs ── */}
          {phase === 'finished' && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '16px',
                padding: '40px',
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
              <p
                style={{
                  color: '#94a3b8',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: '14px',
                  margin: 0,
                  textAlign: 'center',
                }}
              >
                {state.isScoring ? 'Analyzing your answer...' : 'Transcribing your response...'}
              </p>
            </div>
          )}

          {/* ── Transcript Panel — visible during recording phases ── */}
          {showTranscript && (
            <TranscriptPanel
              transcript={speech.finalTranscript}
              interimText={speech.interimTranscript}
              isRecording={state.isRecording}
            />
          )}

          {/* ── Silence Nudge ── */}
          <SilenceNudge visible={phase === 'silence-detected'} message={silenceMessage} />

          {/* ── Bottom area: metrics + action button ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* Coaching metrics — only during active recording phases */}
            {showTranscript && (
              <CoachingMetrics
                fillerCount={state.fillerCount}
                wordsPerMinute={state.wordsPerMinute}
                speakingDurationSeconds={state.speakingDurationSeconds}
              />
            )}

            {/* Short answer warning */}
            {shortAnswerWarning && (
              <div
                style={{
                  padding: '12px 16px',
                  background: 'rgba(245,158,11,0.07)',
                  border: '1px solid rgba(245,158,11,0.25)',
                  borderRadius: '12px',
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '13px',
                  color: '#fbbf24',
                  lineHeight: 1.5,
                }}
              >
                {shortAnswerWarning}
              </div>
            )}

            {/* Done button */}
            {showDoneButton && (
              <div style={{ display: 'flex', justifyContent: 'center', paddingTop: '4px', width: '100%' }}>
                <DoneButton onDone={handleDone} disabled={phase !== 'recording'} isMobile={isMobile} />
              </div>
            )}

            {/* Start Interview / Retry button */}
            {showStartButton && (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  className="start-interview-btn"
                  onClick={handleStart}
                  disabled={!state.currentQuestion}
                  onMouseEnter={() => setStartHov(true)}
                  onMouseLeave={() => setStartHov(false)}
                  style={{
                    padding: '17px 56px',
                    minHeight: '52px',
                    width: isMobile ? '100%' : 'auto',
                    borderRadius: '14px',
                    border: 'none',
                    cursor: state.currentQuestion ? 'pointer' : 'not-allowed',
                    background: state.currentQuestion
                      ? 'linear-gradient(135deg, #4338ca, #6366f1 50%, #22d3ee)'
                      : '#111120',
                    color: '#fff',
                    fontFamily: "'Syne', sans-serif",
                    fontSize: '16px',
                    fontWeight: '800',
                    letterSpacing: '0.02em',
                    boxShadow: state.currentQuestion
                      ? '0 6px 28px rgba(99,102,241,0.42), 0 0 0 1px rgba(99,102,241,0.2)'
                      : 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '10px',
                  }}
                >
                  {state.currentQuestion && startHov && <div className="btn-shimmer" />}
                  <span>Start Interview</span>
                  {state.currentQuestion && (
                    <span style={{ fontSize: '18px' }}>&rarr;</span>
                  )}
                </button>
              </div>
            )}

          </div>

          {/* ── Speech recognition unavailable notice ── */}
          {!speech.isAvailable && phase !== 'ready' && (
            <div
              style={{
                padding: '12px 16px',
                background: 'rgba(245,158,11,0.07)',
                border: '1px solid rgba(245,158,11,0.2)',
                borderRadius: '12px',
                fontFamily: "'DM Mono', monospace",
                fontSize: '12px',
                color: '#d97706',
                lineHeight: 1.5,
              }}
            >
              Speech recognition is unavailable in this browser — transcript will be generated after recording ends.
            </div>
          )}

        </div>
      </div>
    </>
  );
}
