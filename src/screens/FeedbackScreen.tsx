import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useInterview } from "../context/InterviewContext";
import type { ScoreLevel, ScoringResult } from "../types";
import "./FeedbackScreen.css";
import { createLogger } from "../utils/logger";
import { sendGroqChat } from "../services/groq";
import type { GroqCategoryFeedback, GroqChatMessage } from "../services/groq";

const log = createLogger("Feedback");

const dimensions = [
  { key: "communication", label: "Communication" },
  { key: "task", label: "Task" },
  { key: "action", label: "Action" },
  { key: "result", label: "Result" },
  { key: "situation", label: "Situation" },
  { key: "pacing", label: "Pacing" },
] as const;

type DimensionKey = (typeof dimensions)[number]["key"];
type DimensionOverride = {
  percent: number;
  level: ScoreLevel;
  explanation: string;
};

const TEST_SCORE_OVERRIDES: Partial<Record<DimensionKey, DimensionOverride>> = {
  // TEST DATA: force Communication to 25% with a fixed summary note.
  communication: {
    percent: 25,
    level: "Getting Started",
    explanation: "stuttering with filler words",
  },
};

const levelToValue: Record<ScoreLevel, number> = {
  "Getting Started": 1,
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

function getScoreRatio(score?: { level: ScoreLevel; explanation: string }) {
  if (!score) return 0;
  return getLevelValue(score.level) / maxLevelValue;
}

function getScorePercent(score?: { level: ScoreLevel; explanation: string }) {
  if (!score) return 0;
  return getLevelPercent(score.level);
}

function clampPercent(value: number) {
  return Math.max(0, Math.min(100, value));
}

function getDimensionOverride(dimensionKey: DimensionKey) {
  return TEST_SCORE_OVERRIDES[dimensionKey];
}

function getDimensionRatio(
  dimensionKey: DimensionKey,
  score?: { level: ScoreLevel; explanation: string },
) {
  const override = getDimensionOverride(dimensionKey);
  if (override) return clampPercent(override.percent) / 100;
  return getScoreRatio(score);
}

function getDimensionPercent(
  dimensionKey: DimensionKey,
  score?: { level: ScoreLevel; explanation: string },
) {
  const override = getDimensionOverride(dimensionKey);
  if (override) return clampPercent(override.percent);
  return getScorePercent(score);
}

function getDimensionLevel(
  dimensionKey: DimensionKey,
  score?: { level: ScoreLevel; explanation: string },
) {
  const override = getDimensionOverride(dimensionKey);
  return override?.level ?? score?.level;
}

function getDimensionExplanation(
  dimensionKey: DimensionKey,
  score?: { level: ScoreLevel; explanation: string },
) {
  const override = getDimensionOverride(dimensionKey);
  return override?.explanation ?? score?.explanation;
}

function getOverallPercent(result: ScoringResult | null) {
  const total = dimensions.reduce((sum, dimension) => {
    const score = result?.scores[dimension.key];
    return sum + getDimensionRatio(dimension.key, score);
  }, 0);
  return Math.round((total / dimensions.length) * 100);
}

export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const result = state.currentResult;
  const hasTestData = Object.values(TEST_SCORE_OVERRIDES).some(Boolean);
  const overallPercent = getOverallPercent(result);
  const hasScoreData = Boolean(result) || hasTestData;

  useEffect(() => {
    log.info("Mounted", {
      overallPercent,
      questionId: state.currentQuestion?.id,
      hasScoreData,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [radarProgress, setRadarProgress] = useState(0);
  const animationRef = useRef<number | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<GroqChatMessage[]>([]);
  const [chatError, setChatError] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const chatFormRef = useRef<HTMLFormElement | null>(null);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    if (!hasScoreData) {
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
  }, [hasScoreData]);

  const reviewItems = useMemo(() => {
    if (!result && !hasTestData) return [];
    return dimensions
      .map((dimension) => {
        const score = result?.scores[dimension.key];
        return {
          key: dimension.key,
          label: dimension.label,
          level: getDimensionLevel(dimension.key, score),
          value: getDimensionRatio(dimension.key, score),
          explanation: getDimensionExplanation(dimension.key, score),
        };
      })
      .sort((a, b) => a.value - b.value);
  }, [hasTestData, result]);

  const activeReview =
    reviewItems.length > 0
      ? reviewItems[reviewIndex % reviewItems.length]
      : null;
  const chatScoreSummary = useMemo(() => {
    if (!result && !hasTestData) return [];
    return dimensions
      .map((dimension) => {
        const score = result?.scores[dimension.key];
        const percent = getDimensionPercent(dimension.key, score);
        const level = getDimensionLevel(dimension.key, score) ?? "Pending";
        if (percent === 0 && level === "Pending") return null;
        return `${dimension.label}: ${percent}% (${level})`;
      })
      .filter((item): item is string => Boolean(item));
  }, [hasTestData, result]);
  const chatCategoryFeedback = useMemo<GroqCategoryFeedback[]>(() => {
    if (!result && !hasTestData) return [];
    return dimensions.map((dimension) => {
      const score = result?.scores[dimension.key];
      const percent = getDimensionPercent(dimension.key, score);
      const level = getDimensionLevel(dimension.key, score) ?? "Pending";
      const explanation = getDimensionExplanation(dimension.key, score) ?? "";
      return {
        key: dimension.key,
        label: dimension.label,
        percent,
        level,
        explanation,
      };
    });
  }, [hasTestData, result]);

  useEffect(() => {
    // setReviewIndex(0);
  }, [reviewOpen, result]);

  useEffect(() => {
    if (!chatThreadRef.current) return;
    chatThreadRef.current.scrollTop = chatThreadRef.current.scrollHeight;
  }, [chatMessages, chatLoading]);

  const radarPoints = () => {
    const center = 150;
    const radius = 110;
    const rawRatios = dimensions.map((dimension) =>
      getDimensionRatio(dimension.key, result?.scores[dimension.key]),
    );
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

  const handlePromptSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = chatInput.trim();
    if (!trimmed || chatLoading) return;

    const userMessage: GroqChatMessage = { role: "user", content: trimmed };
    const nextMessages = [...chatMessages, userMessage];
    setChatMessages(nextMessages);
    setChatError("");
    setChatInput("");
    const stuckTimer = window.setTimeout(() => {
      setChatLoading(false);
      setChatError(
        "Request timed out. Open app on http://localhost:3000 with `npm run dev:vercel`, then retry.",
      );
    }, 25000);

    try {
      setChatLoading(true);
      const response = await sendGroqChat({
        messages: nextMessages,
        question: state.currentQuestion?.text,
        transcript: state.liveTranscript,
        suggestions: result?.suggestions ? [...result.suggestions] : [],
        followUp: result?.followUp,
        scoreSummary: chatScoreSummary,
        overallSummary: result?.overallSummary,
        categoryFeedback: chatCategoryFeedback,
        role: state.role,
        difficulty: state.difficulty,
      });
      setChatMessages((prev) => [
        ...prev,
        { role: "assistant", content: response.reply },
      ]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to contact assistant.";
      setChatError(message);
    } finally {
      window.clearTimeout(stuckTimer);
      setChatLoading(false);
    }
  };

  const handleChatInputKeyDown = (
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (!chatInput.trim() || chatLoading) return;
      chatFormRef.current?.requestSubmit();
    }
  };

  return (
    <div className="feedback">
      <div className="feedback__frame">
        <header className="feedback__header">
          <div>
            {/* <p className="feedback__eyebrow">Interview Feedback</p> */}
            <h1 className="feedback__title">Starly Summary</h1>
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
                  opacity={hasScoreData ? 0.9 : 0.15}
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
                  {hasScoreData ? "Composite STAR score" : "Awaiting scoring"}
                </em>
              </div>
            </div>

            <div className="scoreboard__list">
              {dimensions.map((dimension) => {
                const score = result?.scores[dimension.key as DimensionKey];
                const level = getDimensionLevel(dimension.key, score);
                const explanation = getDimensionExplanation(dimension.key, score);
                const percent = getDimensionPercent(dimension.key, score);
                return (
                  <div key={dimension.key} className="scoreboard__row">
                    <div className="scoreboard__row-header">
                      <div>
                        <p>{dimension.label}</p>
                        <span>{level ?? "Pending"}</span>
                      </div>
                      <strong>{percent}%</strong>
                    </div>
                    <div className="scoreboard__bar">
                      <div
                        className="scoreboard__bar-fill"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                    <p className="scoreboard__note">
                      {explanation ??
                        "Complete an interview answer to see the STAR rationale."}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="feedback__card feedback__card--review">
            <div className="feedback__review-header">
              <h2>Review Questions & Response</h2>
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

                <div className="feedback__review-critique">
                  <div>
                    <span>Area To Improve</span>
                    <strong>{activeReview?.label ?? "Pending"}</strong>
                  </div>
                  <p>
                    {activeReview?.explanation ??
                      "Complete an interview answer to see the STAR rationale."}
                  </p>
                  {reviewItems.length > 1 && (
                    <div className="feedback__review-footer">
                      <span>
                        {reviewIndex + 1} of {reviewItems.length}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setReviewIndex(
                            (index) => (index + 1) % reviewItems.length,
                          )
                        }
                      >
                        Next Panel
                      </button>
                    </div>
                  )}
                </div>

                <form
                  ref={chatFormRef}
                  className="feedback__chat-form"
                  onSubmit={handlePromptSubmit}
                >
                  <textarea
                    value={chatInput}
                    onChange={(event) => setChatInput(event.target.value)}
                    onKeyDown={handleChatInputKeyDown}
                    placeholder="Ask a follow-up question... (Enter to send, Shift+Enter for new line)"
                    aria-label="Chat input"
                    rows={3}
                  />
                  <button type="submit" disabled={!chatInput.trim() || chatLoading}>
                    {chatLoading ? (
                      "..."
                    ) : (
                      <svg
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                        focusable="false"
                      >
                        <path d="M5 12h13M13 6l6 6-6 6" />
                      </svg>
                    )}
                  </button>
                </form>
                <div className="feedback__chat-thread" ref={chatThreadRef}>
                  {chatMessages.length === 0 && !chatLoading && (
                    <p className="feedback__chat-empty">
                      Ask Starly a follow-up question about your answer.
                    </p>
                  )}
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`feedback__chat-message feedback__chat-message--${message.role}`}
                    >
                      <span>{message.role === "assistant" ? "Starly" : "You"}</span>
                      <p>{message.content}</p>
                    </div>
                  ))}
                </div>
                {chatError && <p className="feedback__chat-preview">{chatError}</p>}
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
                <span>Question</span>
                <strong>{state.currentQuestion?.category ?? "General"}</strong>
              </div>
            </div>
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

            {/* <div className="feedback__card feedback__card--highlight">
              <h2>Follow-up Prompt</h2>
              <p>{result?.followUp ?? 'Follow-up coaching question will appear here.'}</p>
            </div> */}
          <div className="feedback__actions">
            <button className="feedback__button" onClick={handleRetry}>
              Try Again
            </button>
            <button
              className="feedback__button feedback__button--ghost"
              onClick={handleNext}
            >
              Next Question
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
