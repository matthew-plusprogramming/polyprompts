import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';

export default function InterviewScreen() {
  const { state } = useInterview();
  const navigate = useNavigate();

  const handleDone = () => {
    // TODO: Stop recording, send to Whisper, score, then navigate
    navigate('/feedback');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Interview</h1>

      {/* TODO: Replace with QuestionDisplay component */}
      <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Question:</strong>{' '}
        {state.currentQuestion?.text ?? 'No question loaded — go back to Setup.'}
      </div>

      {/* TODO: Replace with WaveformVisualizer component */}
      <div style={{ height: '80px', background: '#e0e0e0', borderRadius: '8px', margin: '1rem 0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        [Waveform Visualizer]
      </div>

      {/* TODO: Replace with TranscriptPanel component */}
      <div style={{ minHeight: '120px', padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Live Transcript:</strong>
        <p>{state.liveTranscript || 'Transcript will appear here as you speak...'}</p>
      </div>

      {/* TODO: Replace with CoachingMetrics component (collapsed by default) */}
      <details style={{ margin: '1rem 0' }}>
        <summary>Coaching Metrics</summary>
        <p>Filler words: {state.fillerCount} | WPM: {state.wordsPerMinute} | Duration: {state.speakingDurationSeconds}s</p>
      </details>

      {/* TODO: Replace with DoneButton component (add spacebar shortcut) */}
      <button onClick={handleDone} style={{ padding: '0.75rem 2rem', fontSize: '1.1rem' }}>
        I'm Done
      </button>
    </div>
  );
}
