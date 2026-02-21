import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import type { ScoreLevel, ScoringResult } from '../types';
import './FeedbackScreen.css';

const dimensions = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
  { key: 'communication', label: 'Communication' },
  { key: 'pacing', label: 'Pacing' },
] as const;

type DimensionKey = (typeof dimensions)[number]['key'];

const levelToValue: Record<ScoreLevel, number> = {
  'Getting Started': 1,
  Developing: 2,
  Solid: 3,
  Strong: 4,
};

const maxLevelValue = 4;

function getLevelValue(level?: ScoreLevel) {
  if (!level) return 0;
  return levelToValue[level] ?? 0;
}

function getLevelPercent(level?: ScoreLevel) {
  if (!level) return 0;
  return Math.round((getLevelValue(level) / maxLevelValue) * 100);
}

function getOverallPercent(result: ScoringResult | null) {
  if (!result) return 0;
  const total = dimensions.reduce((sum, dimension) => {
    const score = result.scores[dimension.key]?.level;
    return sum + getLevelValue(score);
  }, 0);
  return Math.round((total / (dimensions.length * maxLevelValue)) * 100);
}

export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const result = state.currentResult;
  const overallPercent = getOverallPercent(result);
  const hasResult = Boolean(result);
  const [radarProgress, setRadarProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (!result) {
      // setRadarProgress(0);
      return;
    }

    const duration = 900;
    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3);
      setRadarProgress(eased);

      if (t < 1) {
        animationRef.current = requestAnimationFrame(tick);
      }
    };

    // setRadarProgress(0);
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [result]);

  const reviewItems = useMemo(() => {
    if (!result) return [];
    return dimensions
      .map((dimension) => {
        const score = result.scores[dimension.key];
        return {
          key: dimension.key,
          label: dimension.label,
          level: score.level,
          value: getLevelValue(score.level),
          explanation: score.explanation,
        };
      })
      .sort((a, b) => a.value - b.value);
  }, [result]);

  const activeReview = reviewItems.length > 0 ? reviewItems[reviewIndex % reviewItems.length] : null;

  useEffect(() => {
    // setReviewIndex(0);
  }, [reviewOpen, result]);

  const radarPoints = () => {
    const center = 150;
    const radius = 110;
    return dimensions
      .map((dimension, index) => {
        const angle = (-90 + index * 60) * (Math.PI / 180);
        const level = result?.scores[dimension.key]?.level;
        const value = getLevelValue(level) / maxLevelValue;
        const r = radius * value * radarProgress;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  };

  const gridPoints = (ratio: number) => {
    const center = 150;
    const radius = 110 * ratio;
    return dimensions
      .map((_, index) => {
        const angle = (-90 + index * 60) * (Math.PI / 180);
        const x = center + radius * Math.cos(angle);
        const y = center + radius * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(' ');
  };

  const handleRetry = () => {
    dispatch({ type: 'RETRY' });
    navigate('/interview');
  };

  const handleNext = () => {
    dispatch({ type: 'NEXT_QUESTION' });
    navigate('/');
  };

  return (
    <div className="feedback">
      <div className="feedback__frame">
        <header className="feedback__header">
          <div>
            {/* <p className="feedback__eyebrow">Interview Feedback</p> */}
            <h1 className="feedback__title">Starly Summary</h1>

          </div>
          <div className="feedback__meta">
            <div>
              <span>Role</span>
              <strong>{state.role.replace('_', ' ')}</strong>
            </div>
            <div>
              <span>Difficulty</span>
              <strong>{state.difficulty}</strong>
            </div>
            <div>
              <span>Question</span>
              <strong>{state.currentQuestion?.category ?? 'General'}</strong>
            </div>
          </div>
        </header>

        <section className="feedback__main">
          <div className="scoreboard">
            <div className="scoreboard__radar">
              <svg viewBox="0 0 300 300" role="img" aria-label="Radar chart of interview scores">
                <defs>
                  <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.85" />
                    <stop offset="100%" stopColor="#bfbfbf" stopOpacity="0.2" />
                  </linearGradient>
                  <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                  <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <polygon points={gridPoints(1)} fill="none" stroke="#2f2f2f" strokeWidth="1.2" />
                <polygon points={gridPoints(0.75)} fill="none" stroke="#2a2a2a" strokeWidth="1" />
                <polygon points={gridPoints(0.5)} fill="none" stroke="#232323" strokeWidth="0.9" />
                <polygon points={gridPoints(0.25)} fill="none" stroke="#1a1a1a" strokeWidth="0.8" />

                {dimensions.map((_, index) => {
                  const angle = (-90 + index * 60) * (Math.PI / 180);
                  const x = 150 + 110 * Math.cos(angle);
                  const y = 150 + 110 * Math.sin(angle);
                  return (
                    <line key={index} x1="150" y1="150" x2={x} y2={y} stroke="#1c1c1c" strokeWidth="1" />
                  );
                })}

                <circle cx="150" cy="150" r="92" fill="url(#radarGlow)" />
                <polygon
                  points={radarPoints()}
                  fill="url(#radarFill)"
                  stroke="#ffffff"
                  strokeWidth="1.5"
                  filter="url(#softGlow)"
                  className="scoreboard__shape"
                  opacity={hasResult ? 0.9 : 0.15}
                />

                {dimensions.map((dimension, index) => {
                  const angle = (-90 + index * 60) * (Math.PI / 180);
                  const labelRadius = 135;
                  const x = 150 + labelRadius * Math.cos(angle);
                  const y = 150 + labelRadius * Math.sin(angle);
                  const anchor =
                    Math.cos(angle) > 0.2 ? 'start' : Math.cos(angle) < -0.2 ? 'end' : 'middle';
                  const baseline =
                    Math.sin(angle) > 0.2 ? 'hanging' : Math.sin(angle) < -0.2 ? 'alphabetic' : 'middle';
                  return (
                    <text
                      key={dimension.key}
                      x={x}
                      y={y}
                      textAnchor={anchor}
                      dominantBaseline={baseline}
                      className="scoreboard__label"
                    >
                      {dimension.label}
                    </text>
                  );
                })}
              </svg>

              <div className="scoreboard__overall">
                <span>Overall</span>
                <strong>{overallPercent}%</strong>
                <em>{hasResult ? 'Composite STAR score' : 'Awaiting scoring'}</em>
              </div>
            </div>

            <div className="scoreboard__list">
              {dimensions.map((dimension) => {
                const level = result?.scores[dimension.key as DimensionKey]?.level;
                const explanation = result?.scores[dimension.key as DimensionKey]?.explanation;
                const percent = getLevelPercent(level);
                return (
                  <div key={dimension.key} className="scoreboard__row">
                    <div className="scoreboard__row-header">
                      <div>
                        <p>{dimension.label}</p>
                        <span>{level ?? 'Pending'}</span>
                      </div>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="scoreboard__bar">
                      <div className="scoreboard__bar-fill" style={{ width: `${percent}%` }} />
                    </div>
                    <p className="scoreboard__note">
                      {explanation ?? 'Complete an interview answer to see the STAR rationale.'}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="feedback__grid">
            <div className="feedback__card">
              <h2>Suggestions</h2>
              {result ? (
                <ol className="feedback__list">
                  {result.suggestions.map((suggestion, index) => (
                    <li key={index}>{suggestion}</li>
                  ))}
                </ol>
              ) : (
                <p>Suggestions will appear after scoring.</p>
              )}
            </div>

            <div className="feedback__card feedback__card--highlight">
              <h2>Follow-up Prompt</h2>
              <p>{result?.followUp ?? 'Follow-up coaching question will appear here.'}</p>
            </div>

            <div className="feedback__card feedback__card--review">
              <div className="feedback__review-header">
                <h2>Review Questions & Response</h2>
                <button
                  type="button"
                  className="feedback__review-toggle"
                  onClick={() => setReviewOpen((open) => !open)}
                >
                  {reviewOpen ? 'Hide' : 'Review'}
                </button>
              </div>

              {reviewOpen && (
                <div className="feedback__review-body">
                  <div className="feedback__review-block">
                    <span>Question Asked</span>
                    <p>{state.currentQuestion?.text ?? 'No question captured yet.'}</p>
                  </div>
                  <div className="feedback__review-block">
                    <span>Your Response</span>
                    <p>{state.liveTranscript || 'Response will appear after recording.'}</p>
                  </div>

                  <div className="feedback__review-critique">
                    <div>
                      <span>Area To Improve</span>
                      <strong>{activeReview?.label ?? 'Pending'}</strong>
                    </div>
                    <p>
                      {activeReview?.explanation ??
                        'Complete an interview answer to see the STAR rationale.'}
                    </p>
                    {reviewItems.length > 1 && (
                      <div className="feedback__review-footer">
                        <span>
                          {reviewIndex + 1} of {reviewItems.length}
                        </span>
                        <button
                          type="button"
                          onClick={() => setReviewIndex((index) => (index + 1) % reviewItems.length)}
                        >
                          Next Panel
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {state.previousAttempts.length > 0 && (
          <section className="feedback__card feedback__card--alt">
            <h2>Previous Attempts</h2>
            <p>
              {state.previousAttempts.length} prior attempt(s) — side-by-side comparison goes here.
            </p>
          </section>
        )}

        <div className="feedback__actions">
          <button className="feedback__button" onClick={handleRetry}>
            Try Again
          </button>
          <button className="feedback__button feedback__button--ghost" onClick={handleNext}>
            Next Question
          </button>
        </div>
      </div>
    </div>
  );
}
