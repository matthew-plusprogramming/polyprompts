import React, { useState, useEffect } from 'react';

const SC_STYLE_ID = 'scorecard-styles';

function injectStyles() {
  if (document.getElementById(SC_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SC_STYLE_ID;
  style.textContent = `
    @media (max-width: 639px) {
      .dimension-label {
        min-width: 60px !important;
        font-size: 12px !important;
      }
      .dimension-level-label {
        min-width: 68px !important;
        font-size: 10px !important;
      }
      .dimension-row-btn {
        padding: 10px 10px !important;
        gap: 8px !important;
      }
    }
  `;
  document.head.appendChild(style);
}
import type { ScoringResult, ScoreLevel } from '../types';

/* ─────────────────────────────────────────────
   LEVEL CONFIG
───────────────────────────────────────────── */
const LEVEL_CONFIG: Record<ScoreLevel, { pct: number; color: string; trackColor: string }> = {
  'Getting Started': { pct: 25, color: '#f59e0b', trackColor: 'rgba(245,158,11,0.12)' },
  'Developing':      { pct: 50, color: '#fb923c', trackColor: 'rgba(251,146,60,0.12)'  },
  'Solid':           { pct: 75, color: '#22c55e', trackColor: 'rgba(34,197,94,0.12)'   },
  'Strong':          { pct: 100, color: '#3b82f6', trackColor: 'rgba(59,130,246,0.12)' },
};

/* ─────────────────────────────────────────────
   DIMENSION META
───────────────────────────────────────────── */
type DimensionKey = keyof ScoringResult['scores'];

const STAR_DIMENSIONS: DimensionKey[] = ['situation', 'task', 'action', 'result'];
const DELIVERY_DIMENSIONS: DimensionKey[] = ['communication', 'pacing'];

const DIMENSION_LABELS: Record<DimensionKey, string> = {
  situation:     'Situation',
  task:          'Task',
  action:        'Action',
  result:        'Result',
  communication: 'Communication',
  pacing:        'Pacing',
};

const DIMENSION_LETTER: Record<DimensionKey, string> = {
  situation:     'S',
  task:          'T',
  action:        'A',
  result:        'R',
  communication: 'C',
  pacing:        'P',
};

const DIMENSION_ACCENT: Record<DimensionKey, string> = {
  situation:     '#22d3ee',
  task:          '#f59e0b',
  action:        '#a78bfa',
  result:        '#34d399',
  communication: '#6366f1',
  pacing:        '#ec4899',
};

/* ─────────────────────────────────────────────
   PROGRESS BAR
───────────────────────────────────────────── */
function ProgressBar({ level, index }: { level: ScoreLevel; index: number }) {
  const { pct, color, trackColor } = LEVEL_CONFIG[level];
  const fillDelay = `${index * 100 + 200}ms`;

  return (
    <div
      role="progressbar"
      aria-label={`Score level: ${level}`}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      style={{
        flex: 1,
        height: '6px',
        background: trackColor,
        borderRadius: '100px',
        overflow: 'hidden',
        border: `1px solid ${color}22`,
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${pct}%`,
          borderRadius: '100px',
          background: `linear-gradient(90deg, ${color}bb, ${color})`,
          boxShadow: `0 0 8px ${color}55`,
          transition: `width 0.65s cubic-bezier(0.34,1.56,0.64,1) ${fillDelay}`,
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   DIMENSION ROW
───────────────────────────────────────────── */
function DimensionRow({
  dimensionKey,
  score,
  index,
}: {
  dimensionKey: DimensionKey;
  score: { level: ScoreLevel; explanation: string };
  index: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const { color } = LEVEL_CONFIG[score.level];
  const accent = DIMENSION_ACCENT[dimensionKey];
  const rowDelay = `${index * 100}ms`;

  return (
    <div
      style={{
        background: expanded ? `${accent}07` : 'rgba(255,255,255,0.018)',
        border: `1px solid ${expanded ? `${accent}28` : '#1c1c2a'}`,
        borderRadius: '12px',
        overflow: 'hidden',
        transition: 'background 0.2s ease, border-color 0.2s ease',
        opacity: 0,
        animation: `score-row-enter 0.4s ease-out ${rowDelay} forwards`,
      }}
    >
      {/* Header row — always visible */}
      <button
        className="dimension-row-btn"
        onClick={() => setExpanded((v) => !v)}
        style={{
          width: '100%',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          textAlign: 'left',
          minHeight: '44px',
        }}
      >
        {/* Letter badge */}
        <div
          style={{
            width: '28px',
            height: '28px',
            borderRadius: '8px',
            flexShrink: 0,
            background: `${accent}18`,
            border: `1px solid ${accent}38`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: "'Syne', sans-serif",
            fontWeight: '800',
            fontSize: '12px',
            color: accent,
          }}
        >
          {DIMENSION_LETTER[dimensionKey]}
        </div>

        {/* Label */}
        <span
          className="dimension-label"
          style={{
            fontFamily: "'Syne', sans-serif",
            fontWeight: '700',
            fontSize: '13px',
            color: '#d1d5db',
            minWidth: '90px',
          }}
        >
          {DIMENSION_LABELS[dimensionKey]}
        </span>

        {/* Progress bar */}
        <ProgressBar level={score.level} index={index} />

        {/* Level label */}
        <span
          className="dimension-level-label"
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            fontWeight: '600',
            color,
            minWidth: '86px',
            textAlign: 'right',
            flexShrink: 0,
          }}
        >
          {score.level}
        </span>

        {/* Expand chevron */}
        <span
          style={{
            color: '#4b5563',
            fontSize: '12px',
            flexShrink: 0,
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s ease',
            userSelect: 'none',
          }}
        >
          ▾
        </span>
      </button>

      {/* Explanation — collapsible */}
      <div
        style={{
          maxHeight: expanded ? '200px' : '0px',
          overflow: 'hidden',
          transition: 'max-height 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        <div
          style={{
            padding: '0 14px 14px 52px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: '#94a3b8',
            lineHeight: 1.6,
            borderTop: `1px solid ${accent}18`,
            paddingTop: '10px',
          }}
        >
          {score.explanation}
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SECTION HEADER
───────────────────────────────────────────── */
function SectionHeader({ label, color }: { label: string; color: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '10px',
      }}
    >
      <div
        style={{
          width: '3px',
          height: '14px',
          borderRadius: '2px',
          background: color,
          flexShrink: 0,
        }}
      />
      <span
        style={{
          fontFamily: "'DM Mono', monospace",
          fontSize: '10px',
          fontWeight: '600',
          color: `${color}99`,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <div
        style={{
          flex: 1,
          height: '1px',
          background: `linear-gradient(90deg, ${color}22, transparent)`,
        }}
      />
    </div>
  );
}

/* ─────────────────────────────────────────────
   SCORECARD
───────────────────────────────────────────── */
interface ScoreCardProps {
  scores: ScoringResult['scores'];
}

function ScoreCard({ scores }: ScoreCardProps) {
  useEffect(() => { injectStyles(); }, []);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.012)',
        border: '1px solid rgba(255,255,255,0.055)',
        borderRadius: '20px',
        padding: '24px',
        backdropFilter: 'blur(24px)',
        boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
        position: 'relative',
        overflow: 'hidden',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      <style>{`
        @keyframes score-row-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {/* Top shimmer line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), rgba(34,211,238,0.5), transparent)',
          pointerEvents: 'none',
        }}
      />

      {/* Card heading */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '22px',
        }}
      >
        <div
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '9px',
            background: 'rgba(99,102,241,0.14)',
            border: '1px solid rgba(99,102,241,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            flexShrink: 0,
          }}
        >
          ★
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '15px',
              fontWeight: '800',
              color: '#f9fafb',
              letterSpacing: '-0.01em',
            }}
          >
            Score Breakdown
          </div>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#4b5563',
              letterSpacing: '0.06em',
            }}
          >
            Click any row to read feedback
          </div>
        </div>
      </div>

      {/* STAR Framework section */}
      <div style={{ marginBottom: '20px' }}>
        <SectionHeader label="STAR Framework" color="#6366f1" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {STAR_DIMENSIONS.map((key, i) => (
            <DimensionRow key={key} dimensionKey={key} score={scores[key]} index={i} />
          ))}
        </div>
      </div>

      {/* Delivery section */}
      <div>
        <SectionHeader label="Delivery" color="#ec4899" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {DELIVERY_DIMENSIONS.map((key, i) => (
            <DimensionRow key={key} dimensionKey={key} score={scores[key]} index={STAR_DIMENSIONS.length + i} />
          ))}
        </div>
      </div>

      {/* Legend */}
      <div
        style={{
          marginTop: '20px',
          paddingTop: '16px',
          borderTop: '1px solid #1c1c2a',
          display: 'flex',
          flexWrap: 'wrap',
          gap: '10px 18px',
        }}
      >
        {(Object.entries(LEVEL_CONFIG) as [ScoreLevel, { pct: number; color: string }][]).map(
          ([label, { color, pct }]) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div
                style={{
                  width: '22px',
                  height: '4px',
                  borderRadius: '2px',
                  background: color,
                  opacity: 0.85,
                }}
              />
              <span
                style={{
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  color: '#4b5563',
                }}
              >
                {label} ({pct}%)
              </span>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default React.memo(ScoreCard);
