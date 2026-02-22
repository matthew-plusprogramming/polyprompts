import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useInterview } from "../context/InterviewContext";
import { useTTS } from "../hooks/useTTS";
import { factCheck } from "../services/api";
import { prefetchTTS } from "../services/openai";
import { findQuoteTimeRange } from "../utils/quoteTimestamps";
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

type GuidedPhase = 'idle' | 'intro' | 'clip-best' | 'narrate-best' | 'clip-worst' | 'narrate-worst' | 'outro';

const guidedPhaseLabel: Record<GuidedPhase, string> = {
  idle: '',
  intro: 'Introduction',
  'clip-best': 'Playing best moment',
  'narrate-best': 'Explaining strength',
  'clip-worst': 'Playing area to improve',
  'narrate-worst': 'Explaining improvement',
  outro: 'Closing summary',
};

export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const { speak, stopPlayback, isPlaying: ttsPlaying } = useTTS();

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

  // ─── Video blob URL management ───
  const [videoBlobUrls, setVideoBlobUrls] = useState<Record<number, string>>({});
  const [playingVideoIdx, setPlayingVideoIdx] = useState<number | null>(null);

  // ─── Clip playback state ───
  const [clipRange, setClipRange] = useState<{ idx: number; start: number; end: number } | null>(null);
  const videoRefs = useRef<Record<number, HTMLVideoElement | null>>({});

  // ─── Guided review state ───
  const [guidedPhase, setGuidedPhase] = useState<GuidedPhase>('idle');
  const [guidedQuestionIdx, setGuidedQuestionIdx] = useState(0);
  const guidedCancelledRef = useRef(false);
  const clipResolveRef = useRef<(() => void) | null>(null);

  const handlePlayClip = useCallback((questionIdx: number, quote: string) => {
    // Cancel guided review if active
    if (guidedPhase !== 'idle') {
      guidedCancelledRef.current = true;
      stopPlayback();
      if (clipResolveRef.current) {
        clipResolveRef.current();
        clipResolveRef.current = null;
      }
      setGuidedPhase('idle');
    }

    const qr = questionResults[questionIdx];
    if (!qr?.wordTimestamps?.length) return;

    const range = findQuoteTimeRange(quote, qr.wordTimestamps);
    if (!range) {
      log.warn('No matching time range for quote', { questionIdx, quote: quote.slice(0, 50) });
      return;
    }

    const video = videoRefs.current[questionIdx];
    if (!video) return;

    setClipRange({ idx: questionIdx, start: range.start, end: range.end });
    video.currentTime = range.start;
    void video.play();
  }, [questionResults, guidedPhase, stopPlayback]);

  const playClipAsync = useCallback((questionIdx: number, quote: string): Promise<void> => {
    return new Promise<void>((resolve) => {
      const qr = questionResults[questionIdx];
      if (!qr?.wordTimestamps?.length || !videoBlobUrls[questionIdx]) {
        resolve();
        return;
      }

      const range = findQuoteTimeRange(quote, qr.wordTimestamps);
      if (!range) {
        log.warn('Guided: no matching time range', { questionIdx });
        resolve();
        return;
      }

      const video = videoRefs.current[questionIdx];
      if (!video) {
        resolve();
        return;
      }

      clipResolveRef.current = resolve;
      setClipRange({ idx: questionIdx, start: range.start, end: range.end });
      video.currentTime = range.start;
      void video.play().catch(() => {
        clipResolveRef.current = null;
        resolve();
      });
    });
  }, [questionResults, videoBlobUrls]);

  const cancelGuidedReview = useCallback(() => {
    guidedCancelledRef.current = true;
    stopPlayback();
    if (clipResolveRef.current) {
      clipResolveRef.current();
      clipResolveRef.current = null;
    }
    Object.values(videoRefs.current).forEach(video => {
      if (video && !video.paused) video.pause();
    });
    setClipRange(null);
    setGuidedPhase('idle');
    setGuidedQuestionIdx(0);
  }, [stopPlayback]);

  const runGuidedReview = useCallback(async () => {
    const { ttsVoice, ttsSpeed } = state;
    const guidedSpeed = Math.min(4.0, ttsSpeed);
    const questions = feedbackResponse?.questions ?? [];
    const overallData = feedbackResponse?.overall;

    if (!overallData || questions.length === 0) return;

    guidedCancelledRef.current = false;
    setReviewOpen(true);

    // Wait for React to render the review body + video elements
    await new Promise(resolve => setTimeout(resolve, 300));
    if (guidedCancelledRef.current) return;

    // Prefetch all TTS texts at guided speed
    const introText = `Let's review your interview. You scored ${Math.round(overallData.score)}% overall. Let me walk you through each question.`;
    const outroText = overallData.summary || 'That completes your interview review. Keep practicing!';
    const allTexts = [introText];
    for (const q of questions) {
      if (q.best_part_explanation) allTexts.push(q.best_part_explanation);
      if (q.worst_part_explanation) allTexts.push(q.worst_part_explanation);
    }
    allTexts.push(outroText);
    prefetchTTS(allTexts, ttsVoice, guidedSpeed);

    // Intro
    setGuidedPhase('intro');
    setGuidedQuestionIdx(-1);
    try { await speak(introText, ttsVoice, guidedSpeed); } catch { /* interrupted */ }
    if (guidedCancelledRef.current) return;

    // Per-question loop
    for (let idx = 0; idx < questions.length; idx++) {
      if (guidedCancelledRef.current) return;

      const qFeedback = questions[idx];
      setGuidedQuestionIdx(idx);

      // Scroll question into view
      setTimeout(() => {
        document.getElementById(`guided-question-${idx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);

      // Best part
      if (qFeedback.best_part_quote) {
        setGuidedPhase('clip-best');
        await playClipAsync(idx, qFeedback.best_part_quote);
        if (guidedCancelledRef.current) return;

        setGuidedPhase('narrate-best');
        try { await speak(qFeedback.best_part_explanation, ttsVoice, guidedSpeed); } catch { /* interrupted */ }
        if (guidedCancelledRef.current) return;
      }

      // Worst part
      if (qFeedback.worst_part_quote) {
        setGuidedPhase('clip-worst');
        await playClipAsync(idx, qFeedback.worst_part_quote);
        if (guidedCancelledRef.current) return;

        setGuidedPhase('narrate-worst');
        try { await speak(qFeedback.worst_part_explanation, ttsVoice, guidedSpeed); } catch { /* interrupted */ }
        if (guidedCancelledRef.current) return;
      }
    }

    // Outro
    if (guidedCancelledRef.current) return;
    setGuidedPhase('outro');
    setGuidedQuestionIdx(-1);
    try { await speak(outroText, ttsVoice, guidedSpeed); } catch { /* interrupted */ }

    setGuidedPhase('idle');
    setGuidedQuestionIdx(0);
  }, [state, feedbackResponse, speak, playClipAsync]);

  // ─── Auto-play voice summary on mount ───
  const hasPlayedSummaryRef = useRef(false);

  useEffect(() => {
    if (hasPlayedSummaryRef.current) return;
    if (!state.voiceSummary || !feedbackResponse) return;
    if (guidedPhase !== 'idle') return;

    hasPlayedSummaryRef.current = true;
    log.info('Auto-playing voice summary');
    speak(state.voiceSummary, state.ttsVoice, state.ttsSpeed).catch((err) => {
      log.warn('Voice summary playback failed', { error: String(err) });
    });
  }, [state.voiceSummary, feedbackResponse, guidedPhase, speak, state.ttsVoice, state.ttsSpeed]);

  // Cleanup guided review on unmount
  useEffect(() => {
    return () => {
      guidedCancelledRef.current = true;
      if (clipResolveRef.current) {
        clipResolveRef.current();
        clipResolveRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const urls: Record<number, string> = {};
    questionResults.forEach((qr, idx) => {
      if (qr.videoBlob) {
        urls[idx] = URL.createObjectURL(qr.videoBlob);
      }
    });
    setVideoBlobUrls(urls);

    return () => {
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
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

  // Prefetch all guided review TTS as soon as feedback arrives
  useEffect(() => {
    if (!feedbackResponse) return;
    const questions = feedbackResponse.questions ?? [];
    const overallData = feedbackResponse.overall;
    if (!overallData || questions.length === 0) return;

    const guidedSpeed = Math.min(4.0, state.ttsSpeed);
    const introText = `Let's review your interview. You scored ${Math.round(overallData.score)}% overall. Let me walk you through each question.`;
    const outroText = overallData.summary || 'That completes your interview review. Keep practicing!';
    const allTexts = [introText];
    for (const q of questions) {
      if (q.best_part_explanation) allTexts.push(q.best_part_explanation);
      if (q.worst_part_explanation) allTexts.push(q.worst_part_explanation);
    }
    allTexts.push(outroText);
    log.info('Prefetching guided review TTS', { textCount: allTexts.length });
    prefetchTTS(allTexts, state.ttsVoice, guidedSpeed);
  }, [feedbackResponse, state.ttsSpeed, state.ttsVoice]);

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
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <h1 className="feedback__title">Starly Summary</h1>
              {ttsPlaying && guidedPhase === 'idle' && (
                <div className="voice-summary-indicator">
                  <div className="voice-summary-indicator__bar" />
                  <div className="voice-summary-indicator__bar" />
                  <div className="voice-summary-indicator__bar" />
                </div>
              )}
            </div>
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
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                {guidedPhase !== 'idle' ? (
                  <button
                    type="button"
                    className="feedback__review-toggle"
                    onClick={cancelGuidedReview}
                    style={{ borderColor: 'rgba(248,113,113,0.4)', color: '#f87171' }}
                  >
                    Stop Review
                  </button>
                ) : (
                  feedbackResponse && questionResults.length > 0 && (
                    <button
                      type="button"
                      className="feedback__review-toggle"
                      onClick={() => void runGuidedReview()}
                      style={{ borderColor: 'rgba(129,140,248,0.4)', color: '#a5b4fc' }}
                    >
                      Guided Review
                    </button>
                  )
                )}
                <button
                  type="button"
                  className="feedback__review-toggle"
                  onClick={() => setReviewOpen((open) => !open)}
                >
                  {reviewOpen ? "Hide" : "Review"}
                </button>
              </div>
            </div>

            {reviewOpen && (
              <div className="feedback__review-body">
                {guidedPhase !== 'idle' && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.6rem 0.9rem',
                    borderRadius: '10px',
                    background: 'rgba(129,140,248,0.08)',
                    border: '1px solid rgba(129,140,248,0.2)',
                    marginBottom: '0.25rem',
                  }}>
                    <div style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: '#818cf8',
                      boxShadow: '0 0 8px rgba(129,140,248,0.6)',
                      animation: 'glowPulse 1.5s ease-in-out infinite',
                      flexShrink: 0,
                    }} />
                    <span style={{ fontSize: '0.72rem', color: '#a5b4fc', letterSpacing: '0.06em' }}>
                      {guidedQuestionIdx >= 0
                        ? `Q${guidedQuestionIdx + 1}: ${guidedPhaseLabel[guidedPhase]}`
                        : guidedPhaseLabel[guidedPhase]}
                    </span>
                    {guidedQuestionIdx >= 0 && (
                      <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: '#6366f1' }}>
                        {guidedQuestionIdx + 1} / {questionResults.length}
                      </span>
                    )}
                  </div>
                )}
                {hasMultipleResults ? (
                  questionResults.map((qr, idx) => {
                    const qFeedback = feedbackResponse?.questions[idx] ?? null;
                    const fcResult = factcheckResults[idx];
                    const fcLoading = factcheckLoading[idx];
                    return (
                      <div
                        key={idx}
                        id={`guided-question-${idx}`}
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '0.75rem',
                          ...(guidedPhase !== 'idle' && guidedQuestionIdx === idx ? {
                            outline: '1px solid rgba(129,140,248,0.3)',
                            outlineOffset: '6px',
                            borderRadius: '12px',
                            transition: 'outline-color 0.3s ease',
                          } : {}),
                        }}
                      >
                        <div className="feedback__review-block">
                          <span>Question {idx + 1}</span>
                          <p>{qr.question.text}</p>
                        </div>
                        <div className="feedback__review-block">
                          <span>Your Response</span>
                          <p>{qr.transcript || "Response will appear after recording."}</p>
                        </div>
                        {videoBlobUrls[idx] && (
                          <div style={{ position: 'relative', borderRadius: '10px', overflow: 'hidden' }}>
                            <video
                              ref={(el) => { videoRefs.current[idx] = el; }}
                              src={videoBlobUrls[idx]}
                              controls
                              playsInline
                              onPlay={() => setPlayingVideoIdx(idx)}
                              onPause={() => setPlayingVideoIdx((prev) => prev === idx ? null : prev)}
                              onEnded={() => {
                                setPlayingVideoIdx((prev) => prev === idx ? null : prev);
                                setClipRange((prev) => prev?.idx === idx ? null : prev);
                                if (clipResolveRef.current) {
                                  const resolve = clipResolveRef.current;
                                  clipResolveRef.current = null;
                                  resolve();
                                }
                              }}
                              onTimeUpdate={(e) => {
                                if (clipRange && clipRange.idx === idx) {
                                  const video = e.currentTarget;
                                  if (video.currentTime >= clipRange.end) {
                                    video.pause();
                                    setClipRange(null);
                                    if (clipResolveRef.current) {
                                      const resolve = clipResolveRef.current;
                                      clipResolveRef.current = null;
                                      resolve();
                                    }
                                  }
                                }
                              }}
                              onSeeked={(e) => {
                                if (clipRange && clipRange.idx === idx) {
                                  const t = e.currentTarget.currentTime;
                                  if (t < clipRange.start - 0.5 || t > clipRange.end + 0.5) {
                                    setClipRange(null);
                                  }
                                }
                              }}
                              style={{
                                width: '100%',
                                maxHeight: '300px',
                                borderRadius: '10px',
                                transform: 'scaleX(-1)',
                                background: '#000',
                              }}
                            />
                            {playingVideoIdx === idx && qFeedback && (
                              <div style={{
                                position: 'absolute',
                                bottom: '40px',
                                left: '8px',
                                right: '8px',
                                padding: '0.6rem 0.8rem',
                                borderRadius: '8px',
                                background: 'rgba(0, 0, 0, 0.75)',
                                backdropFilter: 'blur(6px)',
                                pointerEvents: 'none',
                              }}>
                                {qFeedback.what_went_well && (
                                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: '#4ade80' }}>
                                    <strong>Well done:</strong> {qFeedback.what_went_well}
                                  </p>
                                )}
                                {qFeedback.needs_improvement && (
                                  <p style={{ margin: '0 0 0.25rem', fontSize: '0.7rem', color: '#fbbf24' }}>
                                    <strong>Improve:</strong> {qFeedback.needs_improvement}
                                  </p>
                                )}
                                {qFeedback.best_part_quote && (
                                  <p style={{ margin: 0, fontSize: '0.65rem', color: '#a7f3d0', fontStyle: 'italic' }}>
                                    &ldquo;{qFeedback.best_part_quote}&rdquo;
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        )}
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
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#34d399' }}>Best Part</span>
                                  {qr.wordTimestamps?.length && videoBlobUrls[idx] && (
                                    <button
                                      type="button"
                                      onClick={() => handlePlayClip(idx, qFeedback.best_part_quote)}
                                      style={{
                                        padding: '2px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid rgba(52,211,153,0.3)',
                                        background: clipRange?.idx === idx
                                          ? 'rgba(52,211,153,0.2)'
                                          : 'rgba(52,211,153,0.08)',
                                        color: '#34d399',
                                        fontSize: '0.58rem',
                                        fontWeight: '600',
                                        letterSpacing: '0.04em',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      Play Best Part
                                    </button>
                                  )}
                                </div>
                                <p style={{ margin: 0, fontSize: '0.75rem', color: '#a7f3d0', fontStyle: 'italic' }}>"{qFeedback.best_part_quote}"</p>
                                <p style={{ margin: '0.3rem 0 0', fontSize: '0.72rem', color: '#9ca3af' }}>{qFeedback.best_part_explanation}</p>
                              </div>
                            )}
                            {qFeedback.worst_part_quote && (
                              <div style={{ padding: '0.5rem', borderRadius: '8px', background: 'rgba(248,113,113,0.06)', border: '1px solid rgba(248,113,113,0.15)' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: '#f87171' }}>Needs Work</span>
                                  {qr.wordTimestamps?.length && videoBlobUrls[idx] && (
                                    <button
                                      type="button"
                                      onClick={() => handlePlayClip(idx, qFeedback.worst_part_quote)}
                                      style={{
                                        padding: '2px 10px',
                                        borderRadius: '999px',
                                        border: '1px solid rgba(248,113,113,0.3)',
                                        background: clipRange?.idx === idx
                                          ? 'rgba(248,113,113,0.2)'
                                          : 'rgba(248,113,113,0.08)',
                                        color: '#f87171',
                                        fontSize: '0.58rem',
                                        fontWeight: '600',
                                        letterSpacing: '0.04em',
                                        cursor: 'pointer',
                                        whiteSpace: 'nowrap',
                                      }}
                                    >
                                      Play Worst Part
                                    </button>
                                  )}
                                </div>
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
