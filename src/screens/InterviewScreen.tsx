import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { useTTS } from '../hooks/useTTS';
import { useDeepgramTranscription } from '../hooks/useDeepgramTranscription';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { useFaceDetection } from '../hooks/useFaceDetection';
import { analyzePause, prefetchTTS, generateVoiceSummary } from '../services/openai';
import { getFeedback } from '../services/api';
import { countFillers } from '../hooks/useFillerDetection';
import type { QuestionResult, FeedbackResponse, OverallFeedback } from '../types';
import ParticleVisualizer from '../components/ParticleVisualizer';
import TypewriterQuestion from '../components/TypewriterQuestion';
import SilenceNudge from '../components/SilenceNudge';
import cameraOnIcon from '../Icons/CameraOn.png';
import cameraOffIcon from '../Icons/cameraOff.png';
import starlyIcon from '../Icons/StarlyLogo.png';
import starlyWordmark from '../Icons/STARLY.png';
import { createLogger, setSessionId } from '../utils/logger';

const log = createLogger('Interview');

const INTERVIEW_TTS_INSTRUCTIONS = 'Casual American female voice. Relaxed, steady pacing with natural micro-pauses between phrases. Slight upward inflection when asking questions. No vocal fry. Do not sound like a narrator or announcer — sound like a real person talking across a table.';
const FEEDBACK_TTS_INSTRUCTIONS = 'Calm, measured delivery. Speak like a thoughtful coach giving a one-on-one debrief — unhurried, direct, matter-of-fact. Pause briefly before key advice. No cheerfulness or hype.';

// ─── Phase state machine ───
type ScreenPhase =
  | 'ready'
  | 'speaking-question'
  | 'thinking'
  | 'recording'
  | 'silence-detected'
  | 'asking-done'
  | 'mic-error'
  | 'transitioning'
  | 'finished';

export default function InterviewScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const location = useLocation();
  const { speak, stopPlayback, isPlaying: ttsPlaying, analyserNode: ttsAnalyserNode } = useTTS();
  const deepgram = useDeepgramTranscription();

  // ─── Main's camera state ───
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const transcriptBodyRef = useRef<HTMLDivElement | null>(null);
  const [cameraStatus, setCameraStatus] = useState<'loading' | 'ready' | 'unsupported' | 'error'>('loading');
  const [cameraError, setCameraError] = useState('');
  const [cameraEnabled, setCameraEnabled] = useState(true);

  // ─── Face detection ───
  const faceDetection = useFaceDetection({ videoElement: videoRef, enabled: cameraEnabled });

  // ─── Matthew's orchestration state ───
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [phase, _setPhase] = useState<ScreenPhase>('ready');
  const setPhase = useCallback((next: ScreenPhase) => {
    _setPhase((prev) => {
      if (prev !== next) {
        log.info(`Phase: ${prev} -> ${next}`, { from: prev, to: next });
      }
      return next;
    });
  }, []);
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
  const beginNextQuestionRef = useRef<() => Promise<void>>(async () => {});
  const activeRef = useRef(false);
  const recordingStartRef = useRef<number>(0);
  const speakRef = useRef(speak);
  speakRef.current = speak;
  const stateRef = useRef(state);
  stateRef.current = state;
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Background scoring: fire off per-question feedback calls as each answer completes
  const backgroundScoringRef = useRef<Promise<FeedbackResponse>[]>([]);

  // ─── Video recording refs ───
  const videoRecorderRef = useRef<MediaRecorder | null>(null);
  const videoChunksRef = useRef<Blob[]>([]);
  const videoRecordingStartRef = useRef<number>(0);
  const videoAudioTrackRef = useRef<MediaStreamTrack | null>(null);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  // ─── Video recording helpers ───
  const startVideoRecording = useCallback((micStream: MediaStream) => {
    const videoTrack = streamRef.current?.getVideoTracks()[0];
    if (!videoTrack || !cameraEnabled) {
      log.warn('startVideoRecording: no video track or camera disabled — skipping');
      return;
    }

    const audioTrack = micStream.getAudioTracks()[0];
    if (!audioTrack) {
      log.warn('startVideoRecording: no audio track on micStream — skipping');
      return;
    }

    const clonedAudio = audioTrack.clone();
    videoAudioTrackRef.current = clonedAudio;

    const combinedStream = new MediaStream([videoTrack, clonedAudio]);

    // MIME type fallback chain
    const mimeTypes = [
      'video/webm;codecs=vp8,opus',
      'video/webm;codecs=vp8',
      'video/webm',
    ];
    const mimeType = mimeTypes.find(m => MediaRecorder.isTypeSupported(m)) ?? '';

    try {
      const recorder = new MediaRecorder(combinedStream, mimeType ? { mimeType } : undefined);
      videoChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) videoChunksRef.current.push(e.data);
      };
      recorder.start(100);
      videoRecorderRef.current = recorder;
      videoRecordingStartRef.current = Date.now();
      log.info('Video recording started', { mimeType: mimeType || 'browser default' });
    } catch (err) {
      log.error('Failed to start video recorder', { error: String(err) });
      clonedAudio.stop();
      videoAudioTrackRef.current = null;
    }
  }, [cameraEnabled]);

  const stopVideoRecording = useCallback((): Promise<{ blob: Blob; duration: number } | null> => {
    const recorder = videoRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      // Clean up cloned track if present
      if (videoAudioTrackRef.current) {
        videoAudioTrackRef.current.stop();
        videoAudioTrackRef.current = null;
      }
      return Promise.resolve(null);
    }

    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(videoChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        const duration = Math.floor((Date.now() - videoRecordingStartRef.current) / 1000);
        videoChunksRef.current = [];
        videoRecorderRef.current = null;

        if (videoAudioTrackRef.current) {
          videoAudioTrackRef.current.stop();
          videoAudioTrackRef.current = null;
        }

        log.info('Video recording stopped', { blobSize: blob.size, duration });
        resolve({ blob, duration });
      };
      recorder.stop();
    });
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
    if (!activeRef.current) return;
    // If the nudge TTS is playing (or analyzePause is in-flight), cut it off
    if (analyzingRef.current) {
      stopPlayback();
      analyzingRef.current = false;
    }
    setSilenceMessage(undefined);
    setStatusText('Listening...');
    setPhase('recording');
  }, [clearSilenceTimer, setPhase, stopPlayback]);

  const handleSilenceStart = useCallback(async () => {
    if (!activeRef.current || analyzingRef.current) return;
    analyzingRef.current = true;

    const transcript = deepgram.getFullTranscript();

    if (!transcript || transcript.trim().length < 10) {
      analyzingRef.current = false;
      return;
    }

    setPhase('silence-detected');
    setStatusText('Pause detected, analyzing...');

    try {
      const decision = await analyzePause(transcript);

      // User may have resumed speaking while analyzePause was in-flight
      if (!analyzingRef.current) return;

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
      setSilenceMessage("Are you finished? Press Space when you're done.");
      try {
        await speakRef.current("Are you finished, or would you like to keep going?", stateRef.current.ttsVoice, stateRef.current.ttsSpeed);
      } catch (e) {
        log.warn('TTS nudge failed', { error: String(e) });
      }
    } catch (err) {
      log.error('analyzePause failed', { error: String(err) });
      setStatusText('Listening...');
      setPhase('recording');
    }

    analyzingRef.current = false;
  }, [deepgram, setPhase]);

  const handleSilenceEnd = useCallback(() => {
    if (!analyzingRef.current && activeRef.current) {
      setSilenceMessage(undefined);
      setStatusText('Listening...');
      setPhase('recording');
    }
  }, [setPhase]);

  const handleMicDisconnect = useCallback(() => {
    activeRef.current = false;
    clearSilenceTimer();
    deepgram.stop();
    setPhase('mic-error');
    setStatusText('Microphone disconnected. Please reconnect and try again.');
  }, [clearSilenceTimer, deepgram, setPhase]);

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

  // ─── handleStart: begins TTS + recording for the current question ───
  const handleStart = async () => {
    if (!state.currentQuestion || activeRef.current) return;

    setSessionId();
    log.info('Interview starting', { questionId: state.currentQuestion.id, role: state.role, difficulty: state.difficulty });

    const audioCtx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = audioCtx;

    // Step 1: Prime mic permission inside user gesture, then release.
    try {
      const permissionStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
      });
      permissionStream.getTracks().forEach((track) => track.stop());
    } catch (e) {
      log.error('Mic access failed', { error: String(e) });
      setStatusText('Microphone access denied. Please allow mic access and try again.');
      return;
    }

    // Step 2: Speak the question via TTS
    setPhase('speaking-question');
    setStatusText('Reading question aloud...');
    try {
      await speak(state.currentQuestion.text, { voice: state.ttsVoice, speed: 1.0, instructions: INTERVIEW_TTS_INSTRUCTIONS });
    } catch (e) {
      log.error('TTS error — continuing without audio', { error: String(e) });
    }

    // Step 3: Start VAD + recorder
    setPhase('recording');
    setStatusText('Listening...');
    setShortAnswerWarning(null);
    setSilenceMessage(undefined);
    activeRef.current = true;
    waitCountRef.current = 0;
    dispatch({ type: 'START_RECORDING' });

    let micStream: MediaStream | null = null;
    try {
      micStream = await startRecording(undefined, audioCtx);
      recordingStartRef.current = Date.now();
    } catch (e) {
      log.error('Recording failed', { error: String(e) });
      setStatusText('Microphone setup failed. Please retry.');
      activeRef.current = false;
      dispatch({ type: 'STOP_RECORDING', payload: new Blob() });
      setPhase('ready');
      return;
    }

    if (micStream) {
      try {
        await deepgram.start(micStream);
      } catch (e) {
        log.error('Deepgram transcription failed', { error: String(e) });
      }
      startVideoRecording(micStream);
    }

    // Start face detection (non-blocking — errors won't break the interview)
    if (cameraEnabled) {
      void faceDetection.start();
    }
  };

  // ─── Auto-start after pre-interview script completes ───
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (
      (location.state as { autoStart?: boolean })?.autoStart &&
      !autoStartedRef.current &&
      phase === 'ready' &&
      state.currentQuestion
    ) {
      autoStartedRef.current = true;
      void handleStart();
    }
  }, [location.state, phase, state.currentQuestion]);

  // ─── beginNextQuestion: TTS transition + start recording for next question ───
  const beginNextQuestion = async () => {
    const nextIdx = state.currentQuestionIndex + 1;
    const nextQuestion = state.questions[nextIdx];
    if (!nextQuestion) {
      log.warn('beginNextQuestion: no next question', { nextIdx, totalQuestions: state.questions.length });
      return;
    }

    log.info('beginNextQuestion', { nextIdx, questionId: nextQuestion.id, totalQuestions: state.questions.length });

    const audioCtx = audioCtxRef.current ?? new AudioContext();
    audioCtxRef.current = audioCtx;

    // Advance state to next question
    dispatch({ type: 'ADVANCE_QUESTION' });

    // Brief transition phrase
    setPhase('transitioning');
    setStatusText('Moving to next question...');
    try {
      await speak("Great, let's move on to the next question.", { voice: state.ttsVoice, speed: 1.0, instructions: INTERVIEW_TTS_INSTRUCTIONS });
    } catch (e) {
      log.warn('Transition TTS failed', { error: String(e) });
    }

    // Speak the next question (use pre-computed nextQuestion, no stateRef race)
    setPhase('speaking-question');
    setStatusText('Reading question aloud...');
    try {
      await speak(nextQuestion.text, { voice: state.ttsVoice, speed: 1.0, instructions: INTERVIEW_TTS_INSTRUCTIONS });
    } catch (e) {
      log.error('TTS error — continuing without audio', { error: String(e) });
    }

    // Start recording for the next question
    setPhase('recording');
    setStatusText('Listening...');
    setShortAnswerWarning(null);
    setSilenceMessage(undefined);
    activeRef.current = true;
    waitCountRef.current = 0;
    dispatch({ type: 'START_RECORDING' });

    let micStream: MediaStream | null = null;
    try {
      micStream = await startRecording(undefined, audioCtx);
      recordingStartRef.current = Date.now();
    } catch (e) {
      log.error('Recording failed for next question', { error: String(e) });
      setStatusText('Microphone setup failed.');
      activeRef.current = false;
      dispatch({ type: 'STOP_RECORDING', payload: new Blob() });
      setPhase('ready');
      return;
    }

    if (micStream) {
      try {
        await deepgram.start(micStream);
      } catch (e) {
        log.error('Deepgram transcription failed for next question', { error: String(e) });
      }
      startVideoRecording(micStream);
    }

    // Reset + restart face detection for the new question
    if (cameraEnabled) {
      faceDetection.reset();
      void faceDetection.start();
    }
  };

  // ─── handleDone: handles end of answer for current question ───
  const handleDone = useCallback(async () => {
    if (finishingRef.current) return;
    log.info('handleDone called');

    const earlyTranscript = deepgram.getFullTranscript();
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
    deepgram.stop();
    faceDetection.stop();

    const currentState = stateRef.current;
    const currentIdx = currentState.currentQuestionIndex;
    const isLastQuestion = currentIdx >= currentState.questions.length - 1;

    log.info('handleDone decision', {
      currentIdx,
      totalQuestions: currentState.questions.length,
      isLastQuestion,
      questionIds: currentState.questions.map(q => q.id),
    });

    if (isLastQuestion) {
      setPhase('finished');
    }

    const totalDuration = Math.floor((Date.now() - recordingStartRef.current) / 1000);
    dispatch({ type: 'SET_TOTAL_DURATION', payload: totalDuration });

    try {
      const [blob, videoResult] = await Promise.all([stopRecording(), stopVideoRecording()]);
      if (blob) {
        dispatch({ type: 'STOP_RECORDING', payload: blob });
      }

      const transcript = deepgram.getFullTranscript();

      if (transcript) {
        dispatch({ type: 'UPDATE_TRANSCRIPT', payload: transcript });
      }

      const question = currentState.currentQuestion;
      if (!transcript || !question) {
        if (isLastQuestion) navigate('/feedback');
        return;
      }

      // Save question result (feedback is null until batch scoring at the end)
      const questionResult: QuestionResult = {
        question,
        transcript,
        audioBlob: blob ?? undefined,
        videoBlob: videoResult?.blob ?? undefined,
        feedback: null,
        wordTimestamps: deepgram.getWordTimestamps(),
        metrics: {
          fillerCount: countFillers(transcript),
          wordsPerMinute: currentState.wordsPerMinute,
          speakingDurationSeconds: Math.round(totalDuration),
          faceMetrics: cameraEnabled ? faceDetection.getSessionAverages() : undefined,
        },
      };
      dispatch({ type: 'SAVE_QUESTION_RESULT', payload: questionResult });

      if (isLastQuestion) {
        // Final question: score this question in background, then merge all results
        dispatch({ type: 'START_SCORING' });
        try {
          const feedbackOpts = {
            resumeText: currentState.resumeText ?? undefined,
            jobDescription: currentState.jobDescription ?? undefined,
          };

          // Fire off scoring for the last question
          const lastQuestionPromise = getFeedback([question.text], [transcript], feedbackOpts);
          backgroundScoringRef.current.push(lastQuestionPromise);

          // Wait for all per-question scoring to complete in parallel
          const perQuestionResults = await Promise.all(backgroundScoringRef.current);
          backgroundScoringRef.current = [];

          // Merge per-question feedback into a single response
          const allQuestionFeedback = perQuestionResults.flatMap(r => r.questions);
          const avgScore = allQuestionFeedback.reduce((sum, q) => sum + q.score, 0) / allQuestionFeedback.length;

          // Average category scores across all per-question overalls
          const categoryKeys = ['response_organization', 'technical_knowledge', 'problem_solving', 'position_application', 'timing', 'personability'] as const;
          const avgCategories = {} as Record<typeof categoryKeys[number], number>;
          for (const key of categoryKeys) {
            avgCategories[key] = Number((perQuestionResults.reduce((sum, r) => sum + (r.overall[key] ?? 0), 0) / perQuestionResults.length).toFixed(1));
          }

          const mergedOverall: OverallFeedback = {
            ...avgCategories,
            score: Number(avgScore.toFixed(1)),
            what_went_well: perQuestionResults.map(r => r.overall.what_went_well).join(' '),
            needs_improvement: perQuestionResults.map(r => r.overall.needs_improvement).join(' '),
            summary: perQuestionResults.map(r => r.overall.summary).join(' '),
          };

          const feedbackResponse: FeedbackResponse = {
            questions: allQuestionFeedback,
            overall: mergedOverall,
          };

          // Update each question result with its individual feedback
          feedbackResponse.questions.forEach((qFeedback, idx) => {
            dispatch({ type: 'UPDATE_QUESTION_FEEDBACK', payload: { index: idx, feedback: qFeedback } });
          });

          dispatch({ type: 'SET_FEEDBACK_RESPONSE', payload: feedbackResponse });
          dispatch({
            type: 'SAVE_SESSION',
            payload: {
              id: crypto.randomUUID(),
              questionId: question.id,
              attemptNumber: currentState.previousAttempts.length + 1,
              transcript,
              scores: feedbackResponse,
              durationSeconds: totalDuration,
              createdAt: new Date().toISOString(),
            },
          });

          // Fire voice summary generation + TTS prefetch in background (non-blocking)
          generateVoiceSummary(feedbackResponse)
            .then((summaryText) => {
              prefetchTTS([summaryText], currentState.ttsVoice, 1.0, FEEDBACK_TTS_INSTRUCTIONS);
              dispatch({ type: 'SET_VOICE_SUMMARY', payload: summaryText });
              log.info('Voice summary ready', { length: summaryText.length });
            })
            .catch((err) => {
              log.warn('Voice summary generation failed', { error: String(err) });
            });
        } catch (err) {
          log.error('Scoring failed', { error: String(err) });
          backgroundScoringRef.current = [];
        }

        log.info('Navigating to feedback');
        navigate('/feedback');
      } else {
        // Non-final question: fire off background scoring for this question while user moves on
        const feedbackOpts = {
          resumeText: currentState.resumeText ?? undefined,
          jobDescription: currentState.jobDescription ?? undefined,
        };
        log.info('Starting background scoring for question', { questionIndex: currentIdx });
        backgroundScoringRef.current.push(
          getFeedback([question.text], [transcript], feedbackOpts).catch(err => {
            log.error('Background scoring failed for question', { questionIndex: currentIdx, error: String(err) });
            throw err;
          })
        );

        finishingRef.current = false;
        await beginNextQuestionRef.current();
        return;
      }
    } finally {
      finishingRef.current = false;
    }
  }, [clearSilenceTimer, dispatch, navigate, deepgram, stopPlayback, stopRecording, stopVideoRecording, setPhase]);

  useEffect(() => {
    handleDoneRef.current = handleDone;
  }, [handleDone]);

  useEffect(() => {
    beginNextQuestionRef.current = beginNextQuestion;
  });

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

  // Guard: redirect to home if no questions loaded
  useEffect(() => {
    if (state.questions.length === 0 && !state.currentQuestion) {
      log.warn('No questions loaded, redirecting to home');
      navigate('/');
    } else {
      log.info('InterviewScreen mounted/updated', {
        questionsCount: state.questions.length,
        currentQuestionIndex: state.currentQuestionIndex,
        currentQuestionId: state.currentQuestion?.id,
      });
    }
  }, [state.questions.length, state.currentQuestion, navigate]);

  // Prefetch next question + transition/nudge TTS as early as possible (during question readout)
  useEffect(() => {
    if (phase !== 'speaking-question' && phase !== 'recording') return;
    const nextIdx = state.currentQuestionIndex + 1;
    const nextQuestion = state.questions[nextIdx];

    const texts = [
      "Great, let's move on to the next question.",
      "Are you finished, or would you like to keep going?",
    ];
    if (nextQuestion) texts.push(nextQuestion.text);
    prefetchTTS(texts, state.ttsVoice, 1.0, INTERVIEW_TTS_INSTRUCTIONS);
  }, [phase, state.currentQuestionIndex, state.questions, state.ttsVoice, state.ttsSpeed]);

  // Keep context transcript in sync
  useEffect(() => {
    if (phase === 'recording' && deepgram.transcript) {
      dispatch({ type: 'UPDATE_TRANSCRIPT', payload: deepgram.transcript });
    }
  }, [deepgram.transcript, phase, dispatch]);

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

  // Cleanup on unmount only — use a ref so the effect has no deps and
  // won't re-fire when callback references change (e.g. faceDetection.stop
  // depends on `status`, causing a new ref each render and tearing down
  // resources mid-interview).
  const cleanupRef = useRef(() => {});
  cleanupRef.current = () => {
    log.info('Unmount cleanup running');
    activeRef.current = false;
    clearSilenceTimer();
    stopPlayback();
    deepgram.stop();
    faceDetection.stop();
    void stopRecording();
    void stopVideoRecording();
  };
  useEffect(() => {
    return () => cleanupRef.current();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-scroll transcript
  useEffect(() => {
    if (!transcriptBodyRef.current) return;
    transcriptBodyRef.current.scrollTop = transcriptBodyRef.current.scrollHeight;
  }, [state.liveTranscript, deepgram.transcript]);

  // ─── Derived values ───
  const answerTimeLabel = useMemo(() => {
    const mins = Math.floor(elapsedSeconds / 60);
    const secs = elapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }, [elapsedSeconds]);

  // ─── Particle energy for wordmark overlay ───
  const [particleEnergy, setParticleEnergy] = useState(0);
  const lastEnergyUpdateRef = useRef(0);
  const normalizedEnergy = useMemo(() => Math.min(1, Math.max(0, particleEnergy * 2.4)), [particleEnergy]);

  // Visualizer reacts only to TTS audio (interviewer speaking) — stays quiet while the user answers
  const visualizerSpeaking = ttsPlaying;
  const activeEnergy = visualizerSpeaking ? normalizedEnergy : 0;

  const handleParticleEnergy = useCallback((energy: number) => {
    const now = performance.now();
    if (now - lastEnergyUpdateRef.current < 70) return;
    lastEnergyUpdateRef.current = now;
    setParticleEnergy(energy);
  }, []);

  // ─── Phase badge config ───
  // ─── Question progress indicator ───
  const questionLabel = state.questions.length > 1
    ? `Q${state.currentQuestionIndex + 1}/${state.questions.length}`
    : '';

  const phaseLabel: Record<ScreenPhase, string> = {
    ready: 'Ready',
    'speaking-question': 'Interviewer is asking\u2026',
    thinking: 'Collect your thoughts\u2026',
    recording: 'Listening\u2026',
    'silence-detected': 'Analyzing pause\u2026',
    'asking-done': 'Are you done?',
    'mic-error': 'Microphone error',
    transitioning: 'Next question\u2026',
    finished: 'Processing\u2026',
  };

  const phaseBadgeColor: Record<ScreenPhase, string> = {
    ready: '#9ca3af',
    'speaking-question': '#f5f5f5',
    thinking: '#d1d5db',
    recording: '#cbff70',
    'silence-detected': '#e5e7eb',
    'asking-done': '#cbff70',
    'mic-error': '#f87171',
    transitioning: '#f5f5f5',
    finished: '#6b7280',
  };

  const badgeColor = phaseBadgeColor[phase];

  // ─── RENDER: Main's visual layout + Matthew's phase-driven overlays ───
  return (
    <div
      className="interview-screen-root"
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
        color: '#f7f7f7',
        backgroundColor: '#000',
        background: '#000',
        boxShadow: '0 20px 80px rgba(0, 0, 0, 0.75)',
        fontFamily: "'Josefin Sans', sans-serif",
      }}
    >
      <style>
        {`
          @import url('https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@500;600;700&display=swap');
          .interview-stars {
            position: absolute;
            inset: 0;
            pointer-events: none;
            z-index: 0;
            background-image: radial-gradient(2.4px 2.4px at 18px 24px, rgba(255, 255, 255, 0.95), transparent 70%),
              radial-gradient(1.6px 1.6px at 62px 96px, rgba(255, 255, 255, 0.85), transparent 70%),
              radial-gradient(2px 2px at 120px 44px, rgba(255, 255, 255, 0.9), transparent 70%),
              radial-gradient(1.4px 1.4px at 176px 120px, rgba(255, 255, 255, 0.75), transparent 70%),
              radial-gradient(2.8px 2.8px at 216px 34px, rgba(255, 255, 255, 0.95), transparent 70%),
              radial-gradient(1.8px 1.8px at 260px 168px, rgba(255, 255, 255, 0.85), transparent 70%),
              radial-gradient(1.6px 1.6px at 310px 78px, rgba(255, 255, 255, 0.8), transparent 70%),
              radial-gradient(2.2px 2.2px at 356px 210px, rgba(255, 255, 255, 0.9), transparent 70%),
              radial-gradient(1.6px 1.6px at 402px 144px, rgba(255, 255, 255, 0.8), transparent 70%);
            background-size: 200px 150px;
            opacity: 0.4;
            filter: drop-shadow(0 0 6px rgba(255, 255, 255, 0.4));
            animation: starTwinkle 3s ease-in-out infinite;
          }
          .interview-stars--layer2 {
            background-size: 300px 230px;
            opacity: 0.24;
            animation-duration: 7s;
            animation-delay: -2.2s;
          }
          .interview-screen-root,
          .interview-screen-root * {
            font-weight: 400 !important;
          }
          .interview-screen-root .end-interview-btn {
            font-weight: 700 !important;
          }
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
          @keyframes starlyFlow {
            0%, 100% { transform: translate(-50%, -50%) scale(1); }
            50% { transform: translate(-50%, -50%) scale(1.06); }
          }
          @keyframes starlyGlow {
            0%, 100% { filter: invert(1) brightness(1.25) drop-shadow(0 0 12px rgba(255, 255, 255, 0.4)) drop-shadow(0 0 26px rgba(180, 210, 255, 0.25)); }
            50% { filter: invert(1) brightness(1.45) drop-shadow(0 0 15px rgba(255, 255, 255, 0.62)) drop-shadow(0 0 36px rgba(190, 220, 255, 0.42)); }
          }
          @keyframes starTwinkle {
            0% { opacity: 0.2; transform: translateY(0); }
            40% { opacity: 0.42; }
            70% { opacity: 0.28; transform: translateY(6px); }
            100% { opacity: 0.22; transform: translateY(0); }
          }
        `}
      </style>

      {/* ── Star field decorations ── */}
      <div className="interview-stars" />
      <div className="interview-stars interview-stars--layer2" />

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
                fontFamily: "'Josefin Sans', sans-serif",
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
          {questionLabel && (
            <div
              style={{
                padding: '4px 10px',
                background: '#141414',
                border: '1px solid #2a2a2a',
                borderRadius: '999px',
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                color: '#f3f4f6',
              }}
            >
              {questionLabel}
            </div>
          )}
        </div>

        <div
          style={{
            justifySelf: 'center',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.78rem',
            fontWeight: 700,
            color: '#f5f5f5',
            fontFamily: "'Josefin Sans', sans-serif",
            background: 'transparent',
            border: '1px solid rgba(255, 255, 255, 0.24)',
            borderRadius: '10px',
            padding: '0.36rem 0.72rem',
            boxShadow: 'none',
            letterSpacing: '0.08em',
          }}
        >
          {answerTimeLabel}
        </div>

        <div style={{ justifySelf: 'end', display: 'flex', gap: '0.6rem' }}>
          {phase === 'ready' && (
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
                  ? 'linear-gradient(135deg, #ffffff, #e6e6e6 55%, #cfcfcf)'
                  : '#111120',
                color: '#0b0b0b',
                fontSize: '0.9rem',
                fontWeight: 700,
                letterSpacing: '0.08em',
                boxShadow: state.currentQuestion
                  ? '0 0 18px rgba(255,255,255,0.28), 0 0 0 1px rgba(255,255,255,0.22)'
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
          )}
          <button
            className="end-interview-btn"
            type="button"
            onClick={() => void handleDone()}
            disabled={phase === 'finished'}
            style={{
              padding: '0.55rem 0.95rem',
              borderRadius: '12px',
              border: '1px solid #2a2a2a',
              background: '#CBFF70',
              color: '#000',
              fontSize: '0.9rem',
              fontWeight: 700,
              letterSpacing: '0.08em',
              boxShadow: '0 0 12px rgba(255, 255, 255, 0.1)',
              cursor: phase === 'finished' ? 'not-allowed' : 'pointer',
              opacity: 1,
            }}
          >
            End Interview
          </button>
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

      {/* ── Body: Full-screen scoring view when finished, otherwise normal layout ── */}
      {phase === 'finished' ? (
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            flex: '1 1 auto',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '24px',
            animation: 'fadeIn 0.4s ease',
          }}
        >
          {/* Spinner */}
          <div style={{ position: 'relative', width: '64px', height: '64px' }}>
            <div
              style={{
                position: 'absolute',
                inset: 0,
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.14)',
                borderTopColor: '#f5f5f5',
                animation: 'spin 0.8s linear infinite',
              }}
            />
            <div
              style={{
                position: 'absolute',
                inset: '6px',
                borderRadius: '50%',
                border: '3px solid rgba(255,255,255,0.08)',
                borderBottomColor: '#d4d4d4',
                animation: 'spin 1.2s linear infinite reverse',
              }}
            />
          </div>

          {/* Status text */}
          <div style={{ textAlign: 'center' }}>
            <p
              style={{
                margin: 0,
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '1.15rem',
                fontWeight: 700,
                color: '#e2e8f0',
                letterSpacing: '0.04em',
              }}
            >
              Analyzing your answers&hellip;
            </p>
            <p
              style={{
                margin: '10px 0 0',
                fontSize: '14px',
                color: '#64748b',
              }}
            >
              {state.questions.length > 1
                ? `Scoring ${state.questions.length} responses`
                : 'Scoring your response'}
            </p>
          </div>

          {/* Question progress dots */}
          {state.questions.length > 1 && (
            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
              {state.questions.map((_, i) => {
                const result = state.questionResults[i];
                const scored = result?.feedback != null;
                return (
                  <div
                    key={i}
                    style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: scored
                        ? '#f5f5f5'
                        : 'rgba(255,255,255,0.2)',
                      boxShadow: scored
                        ? '0 0 8px rgba(255,255,255,0.4)'
                        : 'none',
                      transition: 'all 0.3s ease',
                    }}
                  />
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
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
                border: '1px solid #2a2a2a',
                borderRadius: '22px 10px 22px 10px',
                overflow: 'hidden',
                background: '#111',
                color: '#f7f7f7',
                position: 'relative',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.5)',
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
                    background: '#141414',
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
                    background: '#141414',
                    border: `1px solid ${userSpeaking ? 'rgba(163,230,53,0.35)' : 'rgba(255,255,255,0.18)'}`,
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
                      background: userSpeaking ? '#a3e635' : '#64748b',
                      boxShadow: userSpeaking ? '0 0 6px rgba(163,230,53,0.6)' : 'none',
                      transition: 'all 0.15s ease',
                    }}
                  />
                  <span
                    style={{
                      fontFamily: "'Josefin Sans', sans-serif",
                      fontSize: '10px',
                      fontWeight: '600',
                      letterSpacing: '0.06em',
                      color: userSpeaking ? '#a3e635' : '#64748b',
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
                border: '1px solid #2a2a2a',
                borderRadius: '10px 22px 10px 22px',
                background: '#000',
                color: '#f0f0f0',
                padding: '1.15rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.95rem',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                boxShadow: '0 10px 24px rgba(0, 0, 0, 0.48)',
              }}
            >
              <div style={{ width: '100%', height: '100%', flex: '1 1 auto', minHeight: 0, position: 'relative' }}>
                <ParticleVisualizer analyserNode={ttsAnalyserNode} isSpeaking={visualizerSpeaking} onEnergyChange={handleParticleEnergy} />
                <img
                  src={starlyWordmark}
                  alt="STARLY"
                  style={{
                    position: 'absolute',
                    left: '50%',
                    top: '50%',
                    zIndex: 5,
                    width: '100px',
                    height: 'auto',
                    objectFit: 'contain',
                    pointerEvents: 'none',
                    opacity: 0.54 + activeEnergy * 0.2,
                    filter: `invert(1) brightness(${(1.2 + activeEnergy * 0.36).toFixed(3)}) drop-shadow(0 0 ${Math.round(8 + activeEnergy * 12)}px rgba(255, 255, 255, 0.52)) drop-shadow(0 0 ${Math.round(20 + activeEnergy * 30)}px rgba(180, 210, 255, 0.34))`,
                    mixBlendMode: 'screen',
                    transformOrigin: '50% 50%',
                    backfaceVisibility: 'hidden',
                    willChange: 'transform, filter, opacity',
                    transition: 'opacity 160ms linear, filter 180ms linear',
                    animation: 'starlyFlow 3s ease-in-out infinite, starlyGlow 1.8s ease-in-out infinite',
                    animationFillMode: 'both',
                  }}
                />
              </div>
            </section>
          </div>

          {/* ── Phase-specific overlays (matthew's logic) ── */}

          {/* Typewriter question display — container always present, content fades in/out */}
          <div style={{ position: 'relative', zIndex: 1 }}>
            <TypewriterQuestion
              text={state.currentQuestion?.text ?? ''}
              isTyping={false}
              isComplete={true}
              visible={phase === 'ready' || phase === 'speaking-question' || phase === 'thinking' || phase === 'recording' || phase === 'silence-detected' || phase === 'asking-done'}
              ttsSpeed={state.ttsSpeed}
            />
          </div>

          {/* Status banner — container always visible for stable layout, content fades */}
          {(() => {
            const active = phase === 'thinking';
            return (
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '10px',
                  padding: active ? '8px 24px' : '0 24px',
                  maxHeight: active ? '40px' : '0px',
                  overflow: 'hidden',
                  borderRadius: '14px',
                  background: '#141414',
                  border: active ? '1px solid #2a2a2a' : '1px solid transparent',
                  animation: phase === 'thinking' ? 'breathing 2s ease-in-out infinite' : 'none',
                  transition: 'max-height 0.3s ease, padding 0.3s ease, border-color 0.3s ease',
                }}
              >
                <div
                  style={{
                    width: '7px',
                    height: '7px',
                    borderRadius: '50%',
                    background: phase === 'transitioning' ? '#f5f5f5' : '#cbff70',
                    flexShrink: 0,
                    opacity: active ? 0.8 : 0,
                    transition: 'opacity 0.3s ease',
                    animation: phase === 'transitioning' ? 'pulse-ring 1.2s ease-out infinite' : 'none',
                  }}
                />
                <span
                  style={{
                    fontFamily: "'Josefin Sans', sans-serif",
                    fontSize: '13px',
                    fontWeight: '600',
                    color: phase === 'transitioning' ? '#f5f5f5' : '#d9f99d',
                    letterSpacing: '0.01em',
                    opacity: active ? 1 : 0,
                    transition: 'opacity 0.3s ease',
                  }}
                >
                  {phase === 'transitioning'
                    ? <>Moving to the next question&hellip;</>
                    : <>Take a moment to collect your thoughts&hellip;</>}
                </span>
              </div>
            );
          })()}

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
                    const transcript = deepgram.getFullTranscript().trim();
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
                  {deepgram.getFullTranscript().trim().length > 10 ? 'Score Current Answer' : 'Back to Setup'}
                </button>
              </div>
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
              border: '1px solid #2a2a2a',
              borderRadius: '22px',
              background: 'transparent',
              color: '#f5f5f5',
              boxShadow: 'none',
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
                  fontFamily: "'Josefin Sans', sans-serif",
                  fontSize: '0.85rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: '#ececec',
                }}
              >
                Live Transcript
              </strong>

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
              <p style={{ marginTop: 0, fontSize: '16px', lineHeight: 1.54, color: '#d7d7d7' }}>
                {state.liveTranscript || deepgram.transcript || (
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
        </>
      )}
    </div>
  );
}
