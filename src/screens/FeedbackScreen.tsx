import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInterview } from "../context/InterviewContext";
import { factCheck } from "../services/api";
import type { FactCheckResult, FaceMetrics } from "../types";
import "./FeedbackScreen.css";
import { createLogger } from "../utils/logger";

const log = createLogger("Feedback");

const dimensions = [
  { key: "response_organization", label: "Organization" },
  { key: "technical_knowledge", label: "Technical" },
  { key: "problem_solving", label: "Problem Solving" },
  { key: "position_application", label: "Position Fit" },
  { key: "timing", label: "Timing" },
  { key: "personability", label: "Personability" },
] as const;

type DimensionKey = (typeof dimensions)[number]["key"];

export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();

  const questionResults = state.questionResults;
  const hasMultipleResults = questionResults.length > 0;
  const feedbackResponse = state.feedbackResponse;
  const overall = feedbackResponse?.overall ?? null;

  const overallPercent = overall ? Math.round(overall.score) : 0;
  const hasResult = Boolean(feedbackResponse);

  // Average face metrics across all questions that have them
  const avgFaceMetrics = useMemo((): FaceMetrics | null => {
    const withFace = questionResults.filter((qr) => qr.metrics.faceMetrics);
    if (withFace.length === 0) return null;
    const sum = withFace.reduce(
      (acc, qr) => {
        const fm = qr.metrics.faceMetrics!;
        return {
          eyeContactPercent: acc.eyeContactPercent + fm.eyeContactPercent,
          headStability: acc.headStability + fm.headStability,
          nervousnessScore: acc.nervousnessScore + fm.nervousnessScore,
          confidenceScore: acc.confidenceScore + fm.confidenceScore,
        };
      },
      { eyeContactPercent: 0, headStability: 0, nervousnessScore: 0, confidenceScore: 0 },
    );
    const n = withFace.length;
    return {
      eyeContactPercent: Math.round(sum.eyeContactPercent / n),
      headStability: Math.round(sum.headStability / n),
      nervousnessScore: Math.round(sum.nervousnessScore / n),
      confidenceScore: Math.round(sum.confidenceScore / n),
    };
  }, [questionResults]);

  useEffect(() => {
    log.info("Mounted", {
      overallPercent,
      questionId: state.currentQuestion?.id,
      hasResult,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [radarProgress, setRadarProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  // Factcheck state per question
  const [factcheckInputs, setFactcheckInputs] = useState<Record<number, string>>({});
  const [factcheckResults, setFactcheckResults] = useState<Record<number, FactCheckResult>>({});
  const [factcheckLoading, setFactcheckLoading] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (!feedbackResponse) {
      setRadarProgress(0);
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

    setRadarProgress(0);
    animationRef.current = requestAnimationFrame(tick);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [feedbackResponse]);

  const getDimensionValue = (key: DimensionKey): number => {
    if (!overall) return 0;
    return (overall[key] ?? 0) / 100;
  };

  const getDimensionPercent = (key: DimensionKey): number => {
    if (!overall) return 0;
    return Math.round(overall[key] ?? 0);
  };

  const radarPoints = () => {
    const center = 150;
    const radius = 110;
    const rawRatios = dimensions.map((d) => getDimensionValue(d.key));
    const hasAnyScore = rawRatios.some((value) => value > 0);
    return dimensions
      .map((_dimension, index) => {
        const angle = (-90 + index * 60) * (Math.PI / 180);
        const baseValue = rawRatios[index];
        const value = hasAnyScore && baseValue === 0 ? 0.02 : baseValue;
        const r = radius * value * radarProgress;
        const x = center + r * Math.cos(angle);
        const y = center + r * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
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
      .join(" ");
  };

  const handleRetry = () => {
    log.info("User action: retry");
    dispatch({ type: "RETRY" });
    navigate("/interview");
  };

  const handleNext = () => {
    log.info("User action: next question");
    dispatch({ type: "NEXT_QUESTION" });
    navigate("/");
  };

  const handleFactcheck = async (idx: number) => {
    const qr = questionResults[idx];
    const correction = factcheckInputs[idx]?.trim();
    if (!qr || !correction) return;

    setFactcheckLoading((prev) => ({ ...prev, [idx]: true }));
    try {
      const result = await factCheck(qr.question.text, qr.transcript, correction);
      setFactcheckResults((prev) => ({ ...prev, [idx]: result }));
    } catch (err) {
      log.error("Factcheck failed", { error: String(err) });
    } finally {
      setFactcheckLoading((prev) => ({ ...prev, [idx]: false }));
    }
  };

  return (
    <div className="feedback">
      <div className="feedback__frame">
        <header className="feedback__header">
          <div>
            <h1 className="feedback__title">Starly Summary</h1>
            {hasMultipleResults && (
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#9e9e9e', letterSpacing: '0.06em' }}>
                {questionResults.length} question{questionResults.length !== 1 ? 's' : ''} answered
              </p>
            )}
          </div>
        </header>

        <section className="feedback__main">
          <div className="feedback__left">
            <div className="scoreboard">
            <div className="scoreboard__radar">
              <svg
                viewBox="0 0 300 300"
                role="img"
                aria-label="Radar chart of interview scores"
              >
                <defs>
                  <linearGradient id="radarFill" x1="0" y1="0" x2="1" y2="1">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4" />
                    <stop offset="100%" stopColor="#bfbfbf" stopOpacity="0.12" />
                  </linearGradient>
                  <radialGradient id="radarGlow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#ffffff" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
                  </radialGradient>
                  <filter
                    id="softGlow"
                    x="-50%"
                    y="-50%"
                    width="200%"
                    height="200%"
                  >
                    <feGaussianBlur stdDeviation="6" result="blur" />
                    <feMerge>
                      <feMergeNode in="blur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                <polygon
                  points={gridPoints(1)}
                  fill="none"
                  stroke="#2f2f2f"
                  strokeWidth="1.2"
                />
                <polygon
                  points={gridPoints(0.75)}
                  fill="none"
                  stroke="#2a2a2a"
                  strokeWidth="1"
                />
                <polygon
                  points={gridPoints(0.5)}
                  fill="none"
                  stroke="#232323"
                  strokeWidth="0.9"
                />
                <polygon
                  points={gridPoints(0.25)}
                  fill="none"
                  stroke="#1a1a1a"
                  strokeWidth="0.8"
                />

                {dimensions.map((_, index) => {
                  const angle = (-90 + index * 60) * (Math.PI / 180);
                  const x = 150 + 110 * Math.cos(angle);
                  const y = 150 + 110 * Math.sin(angle);
                  return (
                    <line
                      key={index}
                      x1="150"
                      y1="150"
                      x2={x}
                      y2={y}
                      stroke="#1c1c1c"
                      strokeWidth="1"
                    />
                  );
                })}

                <circle cx="150" cy="150" r="92" fill="url(#radarGlow)" />
                <polygon
                  points={radarPoints()}
                  fill="url(#radarFill)"
                  stroke="rgba(255, 255, 255, 0.45)"
                  strokeWidth="1.2"
                  filter="url(#softGlow)"
                  className="scoreboard__shape"
                  opacity={hasResult ? 0.9 : 0.15}
                />

                {dimensions.map((dimension, index) => {
                  const angle = (-90 + index * 60) * (Math.PI / 180);
                  const labelRadius = 120;
                  const x = 150 + labelRadius * Math.cos(angle);
                  const y = 150 + labelRadius * Math.sin(angle);
                  const anchor =
                    Math.cos(angle) > 0.2
                      ? "start"
                      : Math.cos(angle) < -0.2
                        ? "end"
                        : "middle";
                  const baseline =
                    Math.sin(angle) > 0.2
                      ? "hanging"
                      : Math.sin(angle) < -0.2
                        ? "alphabetic"
                        : "middle";
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
                <em>
                  {hasResult ? "Composite score" : "Awaiting scoring"}
                </em>
              </div>
            </div>

            <div className="scoreboard__list">
              {dimensions.map((dimension) => {
                const percent = getDimensionPercent(dimension.key);
                return (
                  <div key={dimension.key} className="scoreboard__row">
                    <div className="scoreboard__row-header">
                      <div>
                        <p>{dimension.label}</p>
                        <span>{percent > 0 ? `${percent}/100` : "Pending"}</span>
                      </div>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="scoreboard__bar">
                      <div
                        className="scoreboard__bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="feedback__card feedback__card--review">
            <div className="feedback__review-header">
              <h2>Review Questions & Responses</h2>
              <button
                type="button"
                className="feedback__review-toggle"
                onClick={() => setReviewOpen((open) => !open)}
              >
                {reviewOpen ? "Hide" : "Review"}
              </button>
            </div>

            {reviewOpen && (
              <div className="feedback__review-body">
                {hasMultipleResults ? (
                  questionResults.map((qr, idx) => {
                    const qFeedback = feedbackResponse?.questions[idx] ?? null;
                    const fcResult = factcheckResults[idx];
                    const fcLoading = factcheckLoading[idx];
                    return (
                      <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        <div className="feedback__review-block">
                          <span>Question {idx + 1}</span>
                          <p>{qr.question.text}</p>
                        </div>
                        <div className="feedback__review-block">
                          <span>Your Response</span>
                          <p>{qr.transcript || "Response will appear after recording."}</p>
                        </div>
                        {qFeedback && (
                          <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '0.6rem',
                            padding: '0.7rem 0.9rem',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                          }}>
                            <div style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              alignItems: 'center',
                            }}>
                              <span style={{
                                fontSize: '0.65rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.14em',
                                color: '#9d9d9d',
                              }}>
                                Score: {Math.round(qFeedback.score)}%
                              </span>
                              {qFeedback.confidence_score != null && (
                                <span style={{
                                  fontSize: '0.6rem',
                                  color: '#6b6b6b',
                                }}>
                                  Confidence: {Math.round(qFeedback.confidence_score)}%
                                </span>
                              )}
                            </div>
                            <p style={{ margin: 0, fontSize: '0.78rem', color: '#d4d4d4' }}>
                              {qFeedback.summary}
                            </p>
                            {qFeedback.best_part_quote && (
                              <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(52,211,153,0.06)', border: '1px solid rgba(52,211,153,0.15)' }}>
                                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#34d399', display: 'block', marginBottom: '0.25rem' }}>Best Part</span>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#a7f3d0', fontStyle: 'italic' }}>"{qFeedback.best_part_quote}"</p>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{qFeedback.best_part_explanation}</p>
                              </div>
                            )}
                            {qFeedback.worst_part_quote && (
                              <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f87171', display: 'block', marginBottom: '0.25rem' }}>Needs Work</span>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#fca5a5', fontStyle: 'italic' }}>"{qFeedback.worst_part_quote}"</p>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{qFeedback.worst_part_explanation}</p>
                              </div>
                            )}
                            {qFeedback.what_went_well && (
                              <div>
                                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#34d399', display: 'block', marginBottom: '0.15rem' }}>What Went Well</span>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#d4d4d4' }}>{qFeedback.what_went_well}</p>
                              </div>
                            )}
                            {qFeedback.needs_improvement && (
                              <div>
                                <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#fbbf24', display: 'block', marginBottom: '0.15rem' }}>Needs Improvement</span>
                                <p style={{ margin: 0, fontSize: '0.72rem', color: '#d4d4d4' }}>{qFeedback.needs_improvement}</p>
                              </div>
                            )}
                          </div>
                        )}
                        {!qFeedback && (
                          <div style={{
                            padding: '0.5rem 0.9rem',
                            borderRadius: '10px',
                            background: 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(255,255,255,0.06)',
                            fontSize: '0.75rem',
                            color: '#6b6b6b',
                            fontStyle: 'italic',
                          }}>
                            Scoring in progress...
                          </div>
                        )}

                        {/* Factcheck UI */}
                        <div style={{
                          padding: '0.6rem 0.9rem',
                          borderRadius: '10px',
                          background: 'rgba(255,255,255,0.015)',
                          border: '1px solid rgba(255,255,255,0.05)',
                        }}>
                          <span style={{
                            fontSize: '0.6rem',
                            textTransform: 'uppercase',
                            letterSpacing: '0.12em',
                            color: '#818cf8',
                            display: 'block',
                            marginBottom: '0.4rem',
                          }}>
                            Fact Check
                          </span>
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              type="text"
                              placeholder="Enter a correction to verify..."
                              value={factcheckInputs[idx] ?? ''}
                              onChange={(e) => setFactcheckInputs((prev) => ({ ...prev, [idx]: e.target.value }))}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void handleFactcheck(idx);
                              }}
                              style={{
                                flex: 1,
                                padding: '0.45rem 0.7rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(255,255,255,0.1)',
                                background: 'rgba(0,0,0,0.3)',
                                color: '#e2e2e2',
                                fontSize: '0.75rem',
                                outline: 'none',
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => void handleFactcheck(idx)}
                              disabled={!factcheckInputs[idx]?.trim() || fcLoading}
                              style={{
                                padding: '0.45rem 0.8rem',
                                borderRadius: '8px',
                                border: '1px solid rgba(129,140,248,0.3)',
                                background: 'rgba(129,140,248,0.1)',
                                color: '#a5b4fc',
                                fontSize: '0.7rem',
                                fontWeight: '600',
                                cursor: factcheckInputs[idx]?.trim() && !fcLoading ? 'pointer' : 'not-allowed',
                                opacity: factcheckInputs[idx]?.trim() && !fcLoading ? 1 : 0.5,
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {fcLoading ? 'Checking...' : 'Check'}
                            </button>
                          </div>
                          {fcResult && (
                            <div style={{
                              marginTop: '0.5rem',
                              padding: '0.5rem 0.7rem',
                              borderRadius: '8px',
                              background: fcResult.is_correct ? 'rgba(52,211,153,0.06)' : 'rgba(248,113,113,0.06)',
                              border: `1px solid ${fcResult.is_correct ? 'rgba(52,211,153,0.2)' : 'rgba(248,113,113,0.2)'}`,
                            }}>
                              <div style={{
                                fontSize: '0.72rem',
                                fontWeight: '600',
                                color: fcResult.is_correct ? '#34d399' : '#f87171',
                                marginBottom: '0.2rem',
                              }}>
                                {fcResult.result}
                              </div>
                              <p style={{ margin: 0, fontSize: '0.7rem', color: '#b0b0b0' }}>
                                {fcResult.explanation}
                              </p>
                            </div>
                          )}
                        </div>

                        {idx < questionResults.length - 1 && (
                          <div style={{
                            height: '1px',
                            background: 'rgba(255,255,255,0.08)',
                            margin: '0.5rem 0',
                          }} />
                        )}
                      </div>
                    );
                  })
                ) : (
                  <>
                    <div className="feedback__review-block">
                      <span>Question Asked</span>
                      <p>
                        {state.currentQuestion?.text ??
                          "No question captured yet."}
                      </p>
                    </div>
                    <div className="feedback__review-block">
                      <span>Your Response</span>
                      <p>
                        {state.liveTranscript ||
                          "Response will appear after recording."}
                      </p>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          </div>

          <div className="feedback__grid">
            <div className="feedback__meta">
              <div>
                <span>Role</span>
                <strong>{state.role.replace("_", " ")}</strong>
              </div>
              <div>
                <span>Difficulty</span>
                <strong>{state.difficulty}</strong>
              </div>
              <div>
                <span>Questions</span>
                <strong>{hasMultipleResults ? `${questionResults.length} answered` : (state.currentQuestion?.category ?? "General")}</strong>
              </div>
            </div>
            <div className="feedback__card">
              <h2>Feedback</h2>
              {overall ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '0.5rem' }}>
                  {overall.what_went_well && (
                    <div>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#34d399', display: 'block', marginBottom: '0.2rem' }}>What Went Well</span>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#d6d6d6' }}>{overall.what_went_well}</p>
                    </div>
                  )}
                  {overall.needs_improvement && (
                    <div>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#fbbf24', display: 'block', marginBottom: '0.2rem' }}>Needs Improvement</span>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#d6d6d6' }}>{overall.needs_improvement}</p>
                    </div>
                  )}
                  {overall.summary && (
                    <div>
                      <span style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: '#9e9e9e', display: 'block', marginBottom: '0.2rem' }}>Summary</span>
                      <p style={{ margin: 0, fontSize: '0.82rem', color: '#d6d6d6' }}>{overall.summary}</p>
                    </div>
                  )}
                </div>
              ) : (
                <p>Feedback will appear after scoring.</p>
              )}
            </div>

          {avgFaceMetrics && (
            <div className="feedback__card feedback__card--body-language">
              <h2>Body Language</h2>
              <div className="body-language__bars">
                {([
                  { label: 'Eye Contact', value: avgFaceMetrics.eyeContactPercent },
                  { label: 'Head Stability', value: avgFaceMetrics.headStability },
                  { label: 'Composure', value: 100 - avgFaceMetrics.nervousnessScore },
                  { label: 'Confidence', value: avgFaceMetrics.confidenceScore },
                ] as const).map(({ label, value }) => {
                  const color = value > 70 ? '#4ade80' : value >= 40 ? '#fbbf24' : '#f87171';
                  return (
                    <div key={label} className="body-language__row">
                      <div className="body-language__row-header">
                        <span>{label}</span>
                        <strong style={{ color }}>{value}%</strong>
                      </div>
                      <div className="scoreboard__bar">
                        <div
                          className="scoreboard__bar-fill"
                          style={{
                            width: `${value}%`,
                            background: `linear-gradient(90deg, ${color}, ${color}66)`,
                            boxShadow: `0 0 10px ${color}55`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="feedback__actions">
            <button className="feedback__button" onClick={handleRetry}>
              Try Again
            </button>
            <button
              className="feedback__button feedback__button--ghost"
              onClick={handleNext}
            >
              Next Interview
            </button>
          </div>

          </div>
        </section>

        {state.previousAttempts.length > 0 && (
          <section className="feedback__card feedback__card--alt">
            <h2>Previous Attempts</h2>
            <p>
              {state.previousAttempts.length} prior attempt(s) — side-by-side
              comparison goes here.
            </p>
          </section>
        )}


      </div>
    </div>
  );
}
