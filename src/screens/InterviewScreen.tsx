import { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import { useTTS } from '../hooks/useTTS';
import { useSpeechRecognition } from '../hooks/useSpeechRecognition';
import { useAudioRecorder } from '../hooks/useAudioRecorder';
import { analyzePause } from '../services/openai';

type ScreenPhase =
  | 'ready'
  | 'speaking-question'
  | 'recording'
  | 'silence-detected'
  | 'asking-done'
  | 'finished';

export default function InterviewScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const { speak, isPlaying, stopPlayback } = useTTS();
  const speech = useSpeechRecognition();

  const [phase, setPhase] = useState<ScreenPhase>('ready');
  const [statusText, setStatusText] = useState('Click "Start Interview" to begin.');

  const waitCountRef = useRef(0);
  const analyzingRef = useRef(false);
  const activeRef = useRef(false); // tracks whether interview is active

  // Silence handlers (stable refs for useAudioRecorder)
  const handleSilenceStart = useCallback(async () => {
    if (analyzingRef.current || !activeRef.current) return;
    analyzingRef.current = true;

    setPhase('silence-detected');
    setStatusText('Pause detected, analyzing...');

    const transcript = speech.getFullTranscript();

    if (!transcript || transcript.trim().length < 10) {
      setStatusText('Listening...');
      setPhase('recording');
      analyzingRef.current = false;
      return;
    }

    // After 2 "waiting" verdicts, skip GPT and ask directly
    if (waitCountRef.current >= 2) {
      setPhase('asking-done');
      setStatusText('Are you done with your answer?');
      try {
        await speak('Are you done with your answer?');
      } catch (e) {
        console.error('TTS error:', e);
      }
      setStatusText('Listening...');
      setPhase('recording');
      analyzingRef.current = false;
      return;
    }

    try {
      const decision = await analyzePause(transcript);

      if (decision === 'done') {
        setPhase('asking-done');
        setStatusText('Are you done with your answer?');
        await speak('Are you done with your answer?');
        setStatusText('Listening...');
        setPhase('recording');
      } else {
        waitCountRef.current += 1;
        setStatusText('Take your time...');
        setPhase('recording');
      }
    } catch (err) {
      console.error('analyzePause failed:', err);
      setStatusText('Listening...');
      setPhase('recording');
    }

    analyzingRef.current = false;
  }, [speak, speech]);

  const handleSilenceEnd = useCallback(() => {
    if (!analyzingRef.current) {
      setStatusText('Listening...');
      setPhase('recording');
    }
  }, []);

  const recorder = useAudioRecorder(handleSilenceStart, handleSilenceEnd);

  // Start the full interview flow
  const handleStart = async () => {
    if (!state.currentQuestion) return;

    // Step 1: Speak the question via TTS
    setPhase('speaking-question');
    setStatusText('Reading question aloud...');
    try {
      await speak(state.currentQuestion.text);
    } catch (e) {
      console.error('TTS error:', e);
    }

    // Step 2: Start recording + speech recognition
    setPhase('recording');
    setStatusText('Listening...');
    activeRef.current = true;
    waitCountRef.current = 0;
    dispatch({ type: 'START_RECORDING' });

    await recorder.start();
    speech.start();
  };

  // Done button
  const handleDone = async () => {
    activeRef.current = false;
    stopPlayback();
    speech.stop();

    const blob = await recorder.stop();
    if (blob) {
      dispatch({ type: 'STOP_RECORDING', payload: blob });
    }

    const transcript = speech.getFullTranscript();
    if (transcript) {
      dispatch({ type: 'UPDATE_TRANSCRIPT', payload: transcript });
    }

    setPhase('finished');
    navigate('/feedback');
  };

  // Keep context transcript in sync for coaching metrics
  useEffect(() => {
    if (phase === 'recording' && speech.transcript) {
      dispatch({ type: 'UPDATE_TRANSCRIPT', payload: speech.transcript });
    }
  }, [speech.transcript, phase, dispatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      activeRef.current = false;
    };
  }, []);

  const phaseColor =
    phase === 'silence-detected' ? '#fff3cd' :
    phase === 'asking-done' ? '#cce5ff' :
    phase === 'speaking-question' ? '#e8daef' :
    '#d4edda';

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Interview</h1>

      {/* Status indicator */}
      <div style={{
        padding: '0.5rem 1rem',
        background: phaseColor,
        borderRadius: '4px',
        marginBottom: '1rem',
        fontSize: '0.9rem',
        fontWeight: 500,
      }}>
        {statusText}
      </div>

      {/* Question */}
      <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Question:</strong>{' '}
        {state.currentQuestion?.text ?? 'No question loaded — go back to Setup.'}
      </div>

      {/* Volume meter */}
      <div style={{
        height: '8px',
        background: '#e0e0e0',
        borderRadius: '4px',
        margin: '1rem 0',
        overflow: 'hidden',
      }}>
        <div style={{
          height: '100%',
          width: `${Math.min(recorder.volumeLevel * 500, 100)}%`,
          background: recorder.volumeLevel > 0.01 ? '#4caf50' : '#ff9800',
          transition: 'width 0.1s',
        }} />
      </div>

      {/* Live transcript */}
      <div style={{
        minHeight: '120px',
        padding: '1rem',
        border: '1px solid #ccc',
        borderRadius: '8px',
        margin: '1rem 0',
      }}>
        <strong>Live Transcript:</strong>
        <p style={{ color: '#333' }}>{speech.finalTranscript}</p>
        {speech.interimTranscript && (
          <p style={{ color: '#999', fontStyle: 'italic' }}>{speech.interimTranscript}</p>
        )}
        {!speech.finalTranscript && !speech.interimTranscript && (
          <p style={{ color: '#aaa' }}>Transcript will appear here as you speak...</p>
        )}
      </div>

      {/* Coaching metrics */}
      <details style={{ margin: '1rem 0' }}>
        <summary>Coaching Metrics</summary>
        <p>Filler words: {state.fillerCount} | WPM: {state.wordsPerMinute} | Duration: {state.speakingDurationSeconds}s</p>
      </details>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '1rem' }}>
        {phase === 'ready' && (
          <button
            onClick={handleStart}
            disabled={!state.currentQuestion}
            style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            Start Interview
          </button>
        )}
        {(phase === 'recording' || phase === 'silence-detected' || phase === 'asking-done' || phase === 'speaking-question') && (
          <button
            onClick={handleDone}
            disabled={isPlaying}
            style={{ padding: '0.75rem 2rem', fontSize: '1.1rem', cursor: 'pointer' }}
          >
            I'm Done
          </button>
        )}
      </div>

      {/* Debug info */}
      <div style={{ marginTop: '2rem', fontSize: '0.75rem', color: '#aaa' }}>
        Phase: {phase} | Recording: {recorder.isRecording ? 'yes' : 'no'} | Listening: {speech.isListening ? 'yes' : 'no'} | Wait count: {waitCountRef.current}
      </div>
    </div>
  );
}
