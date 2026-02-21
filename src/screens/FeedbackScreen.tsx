import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';

export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();

  const handleRetry = () => {
    dispatch({ type: 'RETRY' });
    navigate('/interview');
  };

  const handleNext = () => {
    dispatch({ type: 'NEXT_QUESTION' });
    navigate('/');
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '800px', margin: '0 auto' }}>
      <h1>Feedback</h1>

      {/* TODO: Replace with ScoreCard component */}
      <div style={{ padding: '1rem', background: '#f5f5f5', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Scorecard</strong>
        {state.currentResult ? (
          <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(state.currentResult.scores, null, 2)}</pre>
        ) : (
          <p>No scoring results yet — complete an interview first.</p>
        )}
      </div>

      {/* TODO: Replace with SuggestionsList component */}
      <div style={{ padding: '1rem', border: '1px solid #ccc', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Suggestions</strong>
        {state.currentResult ? (
          <ol>
            {state.currentResult.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ol>
        ) : (
          <p>Suggestions will appear after scoring.</p>
        )}
      </div>

      {/* TODO: Replace with FollowUpPrompt component */}
      <div style={{ padding: '1rem', background: '#fff8e1', borderRadius: '8px', margin: '1rem 0' }}>
        <strong>Follow-up:</strong>{' '}
        {state.currentResult?.followUp ?? 'Follow-up coaching question will appear here.'}
      </div>

      {/* TODO: Replace with RetryComparison component (shown on attempt 2+) */}
      {state.previousAttempts.length > 0 && (
        <div style={{ padding: '1rem', border: '1px dashed #999', borderRadius: '8px', margin: '1rem 0' }}>
          <strong>Previous Attempts:</strong> {state.previousAttempts.length} prior attempt(s) — side-by-side comparison goes here.
        </div>
      )}

      {/* TODO: Replace with ActionButtons component */}
      <div style={{ display: 'flex', gap: '1rem', margin: '1rem 0' }}>
        <button onClick={handleRetry} style={{ padding: '0.75rem 2rem' }}>
          Try Again
        </button>
        <button onClick={handleNext} style={{ padding: '0.75rem 2rem' }}>
          Next Question
        </button>
      </div>
    </div>
  );
}
