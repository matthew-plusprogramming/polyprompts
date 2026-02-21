import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInterview } from '../context/InterviewContext';
import PerformanceSummary from '../components/PerformanceSummary';
import ScoreCard from '../components/ScoreCard';
import SuggestionsList from '../components/SuggestionsList';
import FollowUpPrompt from '../components/FollowUpPrompt';
import ActionButtons from '../components/ActionButtons';
import RetryComparison from '../components/RetryComparison';
import ScoreTrendChart from '../components/ScoreTrendChart';
import TranscriptReview from '../components/TranscriptReview';
import FlowProgress from '../components/FlowProgress';
import type { ScoringResult } from '../types';

/* ─────────────────────────────────────────────
   EXTRACT HIGHLIGHT PHRASES FROM SCORING RESULT
───────────────────────────────────────────── */
function extractHighlights(result: ScoringResult): { positive: string[]; negative: string[] } {
  const positive: string[] = [];
  const negative: string[] = [];

  // Regex that matches text in single quotes, double quotes, or curly quotes
  const quoteRegex = /['""\u2018\u2019\u201c\u201d]([^'"\u2018\u2019\u201c\u201d]{4,})['""\u2018\u2019\u201c\u201d]/g;

  const extractQuoted = (text: string): string[] => {
    const matches: string[] = [];
    let m: RegExpExecArray | null;
    const re = new RegExp(quoteRegex.source, 'g');
    while ((m = re.exec(text)) !== null) {
      const phrase = m[1].trim();
      if (phrase.length >= 4) matches.push(phrase);
    }
    return matches;
  };

  // Extract from positive callouts
  if (result.positiveCallouts) {
    for (const callout of result.positiveCallouts) {
      positive.push(...extractQuoted(callout));
    }
  }

  // Extract from strongest dimension explanation
  const strongDim = result.strongestDimension as keyof typeof result.scores;
  if (result.scores[strongDim]) {
    positive.push(...extractQuoted(result.scores[strongDim].explanation));
  }

  // Extract from weakest dimension explanation
  const weakDim = result.weakestDimension as keyof typeof result.scores;
  if (result.scores[weakDim]) {
    negative.push(...extractQuoted(result.scores[weakDim].explanation));
  }

  // Deduplicate
  return {
    positive: [...new Set(positive)],
    negative: [...new Set(negative)],
  };
}

/* ─────────────────────────────────────────────
   FORMAT FEEDBACK AS PLAIN TEXT
───────────────────────────────────────────── */
function formatFeedbackAsText(result: ScoringResult, question: string, transcript: string): string {
  const lines: string[] = [];
  lines.push('=== PolyPrompts Interview Feedback ===\n');
  lines.push(`Question: ${question}\n`);
  lines.push(`Overall: ${result.overallSummary}\n`);
  lines.push('--- STAR Scores ---');

  const dims = ['situation', 'task', 'action', 'result', 'communication', 'pacing'] as const;
  for (const dim of dims) {
    const score = result.scores[dim];
    lines.push(`${dim.charAt(0).toUpperCase() + dim.slice(1)}: ${score.level} — ${score.explanation}`);
  }

  lines.push('\n--- Suggestions ---');
  result.suggestions.forEach((s, i) => lines.push(`${i + 1}. ${s}`));

  lines.push(`\nCoach's Question: ${result.followUp}`);

  if (result.positiveCallouts?.length) {
    lines.push('\n--- What You Did Well ---');
    result.positiveCallouts.forEach(c => lines.push(`✓ ${c}`));
  }

  lines.push('\n--- Your Response ---');
  lines.push(transcript);

  return lines.join('\n');
}

/* ─────────────────────────────────────────────
   KEYFRAME INJECTION
───────────────────────────────────────────── */
const STYLE_ID = 'feedback-screen-keyframes';

function injectKeyframes() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes fb-pulse {
      0%, 100% { opacity: 0.45; transform: scale(1); }
      50%       { opacity: 1;    transform: scale(1.18); }
    }
    @keyframes fb-pulse-ring {
      0%   { transform: scale(0.85); opacity: 0.6; }
      70%  { transform: scale(1.35); opacity: 0;   }
      100% { transform: scale(1.35); opacity: 0;   }
    }
    @keyframes fb-dot-bounce {
      0%, 80%, 100% { transform: translateY(0);    opacity: 0.35; }
      40%           { transform: translateY(-6px); opacity: 1;    }
    }
    @keyframes fb-fade-in {
      from { opacity: 0; transform: translateY(14px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
    @keyframes fb-slide-down {
      from { opacity: 0; transform: translateY(-8px); }
      to   { opacity: 1; transform: translateY(0);    }
    }
  `;
  document.head.appendChild(style);
}

/* ─────────────────────────────────────────────
   LOADING STATE
───────────────────────────────────────────── */
function ScoringLoader() {
  useEffect(() => { injectKeyframes(); }, []);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '2rem',
        padding: '2rem',
      }}
    >
      {/* Animated orb */}
      <div style={{ position: 'relative', width: '72px', height: '72px' }}>
        {/* Pulse rings */}
        {[0, 1].map((i) => (
          <div
            key={i}
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              border: '1.5px solid rgba(99,102,241,0.45)',
              animation: `fb-pulse-ring 2s ease-out ${i * 0.7}s infinite`,
            }}
          />
        ))}
        {/* Core orb */}
        <div
          style={{
            position: 'absolute',
            inset: '12px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 35% 35%, #818cf8, #6366f1 55%, #4338ca)',
            boxShadow: '0 0 28px rgba(99,102,241,0.55)',
            animation: 'fb-pulse 2.4s ease-in-out infinite',
          }}
        />
      </div>

      {/* Text */}
      <div style={{ textAlign: 'center' }}>
        <p
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '17px',
            fontWeight: 600,
            color: '#e2e8f0',
            margin: '0 0 10px',
            letterSpacing: '0.01em',
          }}
        >
          Your interviewer is reviewing your answer...
        </p>

        {/* Bouncing dots */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '6px' }}>
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              style={{
                display: 'inline-block',
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#818cf8',
                animation: `fb-dot-bounce 1.4s ease-in-out ${i * 0.18}s infinite`,
              }}
            />
          ))}
        </div>
      </div>

      {/* Subtle hint */}
      <p
        style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '13px',
          color: 'rgba(148,163,184,0.55)',
          margin: 0,
          letterSpacing: '0.02em',
        }}
      >
        Analyzing STAR structure, delivery, and impact...
      </p>
    </div>
  );
}

/* ─────────────────────────────────────────────
   NO RESULT STATE
───────────────────────────────────────────── */
function NoResult({ onBack }: { onBack: () => void }) {
  useEffect(() => { injectKeyframes(); }, []);
  const [hov, setHov] = useState(false);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090f',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '1.5rem',
        padding: '2rem',
        animation: 'fb-fade-in 0.4s ease both',
      }}
    >
      <div
        style={{
          width: '52px',
          height: '52px',
          borderRadius: '50%',
          background: 'rgba(99,102,241,0.12)',
          border: '1.5px solid rgba(99,102,241,0.3)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '22px',
          color: '#818cf8',
        }}
      >
        &#9711;
      </div>

      <div style={{ textAlign: 'center' }}>
        <h2
          style={{
            fontFamily: "'Syne', sans-serif",
            fontSize: '20px',
            fontWeight: 700,
            color: '#e2e8f0',
            margin: '0 0 8px',
          }}
        >
          No interview results yet
        </h2>
        <p
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: '14px',
            color: 'rgba(148,163,184,0.7)',
            margin: 0,
            maxWidth: '300px',
          }}
        >
          Something went wrong during scoring. Try again with a longer answer.
        </p>
      </div>

      <button
        onClick={onBack}
        onMouseEnter={() => setHov(true)}
        onMouseLeave={() => setHov(false)}
        style={{
          fontFamily: "'Syne', sans-serif",
          fontSize: '13px',
          fontWeight: 700,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: hov ? '#fff' : '#818cf8',
          background: hov ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.08)',
          border: '1.5px solid rgba(99,102,241,0.35)',
          borderRadius: '10px',
          padding: '10px 24px',
          cursor: 'pointer',
          transition: 'all 0.18s ease',
        }}
      >
        Back to Setup
      </button>
    </div>
  );
}

/* ─────────────────────────────────────────────
   STAR TIPS (COLLAPSIBLE)
───────────────────────────────────────────── */
function StarTipsCollapsible() {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        marginTop: '28px',
        marginBottom: '8px',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '12px',
        overflow: 'hidden',
      }}
    >
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          transition: 'background 0.15s ease',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.025)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '11px',
              fontWeight: '600',
              color: '#374151',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            STAR Tips
          </span>
        </div>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '12px',
            color: '#374151',
            transition: 'transform 0.2s ease',
            display: 'inline-block',
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        >
          ▾
        </span>
      </button>

      <div
        style={{
          maxHeight: open ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          style={{
            padding: '4px 16px 16px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}
        >
          <p
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '13px',
              color: 'rgba(148,163,184,0.6)',
              lineHeight: 1.65,
              margin: '10px 0 0',
            }}
          >
            Remember: Start with a specific{' '}
            <span style={{ color: 'rgba(34,211,238,0.75)' }}>Situation</span>, define your{' '}
            <span style={{ color: 'rgba(245,158,11,0.75)' }}>Task</span>, detail your{' '}
            <span style={{ color: 'rgba(167,139,250,0.75)' }}>Actions</span>, and quantify your{' '}
            <span style={{ color: 'rgba(52,211,153,0.75)' }}>Results</span>.
          </p>
          <div
            style={{
              marginTop: '10px',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '6px',
            }}
          >
            {[
              'Use "I" not "we"',
              'Add numbers & timelines',
              'Quantify your impact',
              'Keep it under 3 min',
            ].map((tip) => (
              <span
                key={tip}
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  color: '#374151',
                  background: 'rgba(255,255,255,0.03)',
                  border: '1px solid rgba(255,255,255,0.07)',
                  borderRadius: '6px',
                  padding: '3px 8px',
                  whiteSpace: 'nowrap',
                }}
              >
                {tip}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   MAIN FEEDBACK SCREEN
───────────────────────────────────────────── */
export default function FeedbackScreen() {
  const { state, dispatch } = useInterview();
  const navigate = useNavigate();
  const [isWide, setIsWide] = useState(window.innerWidth >= 640);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    injectKeyframes();
    const handler = () => setIsWide(window.innerWidth >= 640);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const handleRetry = () => {
    dispatch({ type: 'RETRY' });
    navigate('/interview');
  };

  const handleNext = () => {
    dispatch({ type: 'NEXT_QUESTION' });
    navigate('/');
  };

  const handleCopy = () => {
    if (!state.currentResult) return;
    const text = formatFeedbackAsText(
      state.currentResult,
      state.currentQuestion?.text ?? '',
      state.liveTranscript,
    );
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  /* ── Loading state ── */
  if (state.isScoring) {
    return <ScoringLoader />;
  }

  /* ── No result state ── */
  if (!state.currentResult) {
    return <NoResult onBack={() => navigate('/')} />;
  }

  const { currentResult, previousAttempts, currentQuestion } = state;
  const attemptNumber = previousAttempts.length + 1;

  /* ── Results state ── */
  return (
    <div
      style={{
        minHeight: '100vh',
        background: '#09090f',
        overflowY: 'auto',
        overflowX: 'hidden',
        padding: '0 0 5rem',
      }}
    >
      {/* Background gradient accents */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 0,
          pointerEvents: 'none',
          background: `
            radial-gradient(ellipse 55% 35% at 10% 0%,   rgba(99,102,241,0.09)  0%, transparent 70%),
            radial-gradient(ellipse 40% 30% at 90% 100%, rgba(52,211,153,0.07)  0%, transparent 70%)
          `,
        }}
      />

      <div
        style={{
          position: 'relative',
          zIndex: 1,
          maxWidth: '820px',
          margin: '0 auto',
          padding: isWide ? '3rem 2rem 0' : '2rem 1rem 0',
          animation: 'fb-fade-in 0.45s ease both',
        }}
      >
        <FlowProgress currentStep="feedback" />

        {/* ── Header ── */}
        <header
          style={{
            marginBottom: '2rem',
            animation: 'fb-slide-down 0.4s ease both',
          }}
        >
          {/* Label pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              background: 'rgba(99,102,241,0.1)',
              border: '1px solid rgba(99,102,241,0.25)',
              borderRadius: '999px',
              padding: '4px 12px',
              marginBottom: '14px',
            }}
          >
            <span
              style={{
                width: '6px',
                height: '6px',
                borderRadius: '50%',
                background: '#818cf8',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                fontFamily: "'Syne', sans-serif",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                color: '#818cf8',
              }}
            >
              {attemptNumber > 1 ? `Attempt ${attemptNumber}` : 'Feedback'}
            </span>
          </div>

          <h1
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: isWide ? '32px' : '24px',
              fontWeight: 800,
              color: '#f1f5f9',
              margin: '0 0 12px',
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
            }}
          >
            Your Feedback
          </h1>

          {currentQuestion && (
            <div
              style={{
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '12px',
                padding: '14px 18px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
              }}
            >
              <span
                style={{
                  fontSize: '14px',
                  color: 'rgba(148,163,184,0.5)',
                  flexShrink: 0,
                  marginTop: '1px',
                }}
              >
                Q.
              </span>
              <p
                style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '14px',
                  color: 'rgba(148,163,184,0.85)',
                  margin: 0,
                  lineHeight: 1.6,
                  fontStyle: 'italic',
                }}
              >
                {currentQuestion.text}
              </p>
            </div>
          )}
        </header>

        {/* ── Divider ── */}
        <div
          style={{
            height: '1px',
            background: 'linear-gradient(90deg, rgba(99,102,241,0.25), rgba(255,255,255,0.04), transparent)',
            marginBottom: '2rem',
          }}
        />

        {/* ── Performance Summary ── */}
        <section
          style={{
            marginBottom: '1.75rem',
            animation: 'fb-fade-in 0.5s ease 0s both',
          }}
        >
          <PerformanceSummary
            overallSummary={state.currentResult.overallSummary}
            strongestDimension={state.currentResult.strongestDimension}
            weakestDimension={state.currentResult.weakestDimension}
            positiveCallouts={state.currentResult.positiveCallouts}
          />
        </section>

        {/* ── ScoreCard ── */}
        <section
          style={{
            marginBottom: '1.75rem',
            animation: 'fb-fade-in 0.5s ease 0.05s both',
          }}
        >
          <ScoreCard scores={currentResult.scores} />
        </section>

        {/* ── RetryComparison (only when there are previous attempts) ── */}
        {previousAttempts.length > 0 && (
          <section
            style={{
              marginBottom: '1.75rem',
              animation: 'fb-fade-in 0.5s ease 0.1s both',
            }}
          >
            <RetryComparison
              currentResult={currentResult}
              previousAttempts={previousAttempts}
            />
          </section>
        )}

        {/* ── ScoreTrendChart (only when there are previous attempts) ── */}
        {previousAttempts.length > 0 && (
          <section
            style={{
              marginBottom: '1.75rem',
              animation: 'fb-fade-in 0.5s ease 0.12s both',
            }}
          >
            <ScoreTrendChart
              currentResult={currentResult}
              previousAttempts={previousAttempts}
            />
          </section>
        )}

        {/* ── Transcript Review ── */}
        <section
          style={{
            marginBottom: '1.75rem',
            animation: 'fb-fade-in 0.5s ease 0.15s both',
          }}
        >
          <TranscriptReview
            transcript={state.liveTranscript}
            question={currentQuestion ? currentQuestion.text : ''}
            audioBlob={state.audioBlob}
            highlights={extractHighlights(currentResult)}
          />
        </section>

        {/* ── Two-column: Suggestions + FollowUp ── */}
        <section
          style={{
            display: 'grid',
            gridTemplateColumns: isWide ? '1fr 1fr' : '1fr',
            gap: '1.25rem',
            marginBottom: '2.5rem',
            animation: 'fb-fade-in 0.5s ease 0.18s both',
          }}
        >
          <SuggestionsList suggestions={currentResult.suggestions} />
          <FollowUpPrompt followUp={currentResult.followUp} />
        </section>

        {/* ── Action Buttons ── */}
        <footer
          style={{
            display: 'flex',
            justifyContent: 'center',
            animation: 'fb-fade-in 0.5s ease 0.22s both',
            padding: isWide ? '0' : '0 0 1rem',
          }}
        >
          <ActionButtons
            onRetry={handleRetry}
            onNextQuestion={handleNext}
            attemptNumber={attemptNumber}
          />
        </footer>

        {/* ── STAR Tips (collapsible) ── */}
        <StarTipsCollapsible />

        {/* ── Copy Feedback ── */}
        <div
          style={{
            textAlign: 'center',
            marginTop: '12px',
            marginBottom: '2rem',
            animation: 'fb-fade-in 0.5s ease 0.28s both',
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: '12px',
              fontWeight: 500,
              letterSpacing: '0.02em',
              color: copied ? '#34d399' : 'rgba(148,163,184,0.65)',
              background: 'transparent',
              border: '1px solid ' + (copied ? 'rgba(52,211,153,0.35)' : 'rgba(255,255,255,0.1)'),
              borderRadius: '8px',
              padding: '6px 14px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            {copied ? 'Copied!' : 'Copy Feedback as Text'}
          </button>
        </div>
      </div>
    </div>
  );
}
