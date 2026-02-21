import { useState } from 'react';
import type { ScoringResult, ScoreLevel } from '../types/index';

interface Props {
  currentResult: ScoringResult;
  previousAttempts: ScoringResult[];
}

// Ordered list of all scored dimensions
const DIMENSIONS: {
  key: keyof ScoringResult['scores'];
  label: string;
}[] = [
  { key: 'situation', label: 'Situation' },
  { key: 'task', label: 'Task' },
  { key: 'action', label: 'Action' },
  { key: 'result', label: 'Result' },
  { key: 'communication', label: 'Communication' },
  { key: 'pacing', label: 'Pacing' },
];

// Numeric rank for each level so we can compute deltas
const LEVEL_RANK: Record<ScoreLevel, number> = {
  'Getting Started': 1,
  Developing: 2,
  Solid: 3,
  Strong: 4,
};

// Background + text colours that match the ScoreCard design
const LEVEL_STYLE: Record<ScoreLevel, { bg: string; text: string }> = {
  'Getting Started': { bg: '#3f1f1f', text: '#f87171' },
  Developing: { bg: '#3f2e1a', text: '#fb923c' },
  Solid: { bg: '#1a3040', text: '#38bdf8' },
  Strong: { bg: '#14301e', text: '#4ade80' },
};

const ARROW_IMPROVED = '#22c55e';
const ARROW_SAME = '#6b7280';
const ARROW_REGRESSED = '#ef4444';

function LevelBadge({ level }: { level: ScoreLevel }) {
  const { bg, text } = LEVEL_STYLE[level];
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 6,
        backgroundColor: bg,
        color: text,
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.02em',
        whiteSpace: 'nowrap',
      }}
    >
      {level}
    </span>
  );
}

interface DimensionRowProps {
  label: string;
  prevLevel: ScoreLevel;
  currLevel: ScoreLevel;
}

function DimensionRow({ label, prevLevel, currLevel }: DimensionRowProps) {
  const delta = LEVEL_RANK[currLevel] - LEVEL_RANK[prevLevel];
  const arrowColor =
    delta > 0 ? ARROW_IMPROVED : delta < 0 ? ARROW_REGRESSED : ARROW_SAME;

  // Arrow symbol
  const arrowSymbol = delta > 0 ? '▲' : delta < 0 ? '▼' : '→';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '110px 1fr 28px 1fr',
        alignItems: 'center',
        gap: 8,
        padding: '8px 0',
        borderBottom: '1px solid #1f2937',
      }}
    >
      {/* Dimension name */}
      <span
        style={{
          color: '#9ca3af',
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        {label}
      </span>

      {/* Previous badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <LevelBadge level={prevLevel} />
      </div>

      {/* Arrow */}
      <div
        style={{
          textAlign: 'center',
          color: arrowColor,
          fontSize: 14,
          fontWeight: 700,
        }}
      >
        {arrowSymbol}
      </div>

      {/* Current badge */}
      <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
        <LevelBadge level={currLevel} />
      </div>
    </div>
  );
}

function computeSummary(
  prev: ScoringResult,
  curr: ScoringResult
): { improved: number; same: number; regressed: number } {
  let improved = 0;
  let same = 0;
  let regressed = 0;

  for (const { key } of DIMENSIONS) {
    const delta =
      LEVEL_RANK[curr.scores[key].level] -
      LEVEL_RANK[prev.scores[key].level];
    if (delta > 0) improved++;
    else if (delta < 0) regressed++;
    else same++;
  }

  return { improved, same, regressed };
}

export default function RetryComparison({
  currentResult,
  previousAttempts,
}: Props) {
  // Tab state: which previous attempt are we comparing against?
  // Index into previousAttempts array. Default to the most recent previous attempt.
  // Hook must be declared unconditionally before any early returns.
  const [selectedIdx, setSelectedIdx] = useState(
    Math.max(0, previousAttempts.length - 1)
  );

  // Only render when there is at least one previous attempt
  if (previousAttempts.length === 0) return null;

  const comparisonTarget = previousAttempts[selectedIdx];
  const { improved, same, regressed } = computeSummary(
    comparisonTarget,
    currentResult
  );

  const totalAttempts = previousAttempts.length + 1; // previous + current

  return (
    <div
      style={{
        backgroundColor: '#111827',
        border: '1px solid #1f2937',
        borderRadius: 12,
        padding: '20px 24px',
        marginTop: 24,
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            color: '#f9fafb',
            fontSize: 16,
            fontWeight: 700,
          }}
        >
          Attempt Comparison
        </h3>

        {/* Attempt tabs — only shown when there are multiple previous attempts */}
        {totalAttempts > 2 && (
          <div
            style={{
              display: 'flex',
              gap: 4,
              flexWrap: 'wrap',
            }}
          >
            {previousAttempts.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedIdx(i)}
                style={{
                  padding: '4px 12px',
                  borderRadius: 6,
                  border: '1px solid',
                  borderColor: selectedIdx === i ? '#3b82f6' : '#374151',
                  backgroundColor: selectedIdx === i ? '#1d4ed8' : '#1f2937',
                  color: selectedIdx === i ? '#eff6ff' : '#9ca3af',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                }}
              >
                Attempt {i + 1}
              </button>
            ))}
            {/* "Current" tab is always the active comparison target on the right */}
            <span
              style={{
                padding: '4px 12px',
                borderRadius: 6,
                border: '1px solid #374151',
                backgroundColor: '#14532d',
                color: '#4ade80',
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              Current
            </span>
          </div>
        )}
      </div>

      {/* Column headers */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '110px 1fr 28px 1fr',
          gap: 8,
          marginBottom: 4,
        }}
      >
        <div />
        <div
          style={{
            textAlign: 'right',
            color: '#6b7280',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          {totalAttempts > 2
            ? `Attempt ${selectedIdx + 1}`
            : 'Previous Attempt'}
        </div>
        <div />
        <div
          style={{
            textAlign: 'left',
            color: '#6b7280',
            fontSize: 11,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}
        >
          Current Attempt
        </div>
      </div>

      {/* Dimension rows */}
      <div>
        {DIMENSIONS.map(({ key, label }) => (
          <DimensionRow
            key={key}
            label={label}
            prevLevel={comparisonTarget.scores[key].level}
            currLevel={currentResult.scores[key].level}
          />
        ))}
      </div>

      {/* Summary line */}
      <div
        style={{
          marginTop: 14,
          display: 'flex',
          gap: 16,
          flexWrap: 'wrap',
        }}
      >
        {improved > 0 && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
              color: ARROW_IMPROVED,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 12 }}>▲</span>
            Improved in {improved} dimension{improved !== 1 ? 's' : ''}
          </span>
        )}
        {same > 0 && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
              color: ARROW_SAME,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 12 }}>→</span>
            Same in {same} dimension{same !== 1 ? 's' : ''}
          </span>
        )}
        {regressed > 0 && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 13,
              color: ARROW_REGRESSED,
              fontWeight: 600,
            }}
          >
            <span style={{ fontSize: 12 }}>▼</span>
            Regressed in {regressed} dimension{regressed !== 1 ? 's' : ''}
          </span>
        )}
      </div>
    </div>
  );
}
