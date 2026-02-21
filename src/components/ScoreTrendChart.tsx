import type { ScoringResult, ScoreLevel } from '../types';

/* ─────────────────────────────────────────────
   CONSTANTS
───────────────────────────────────────────── */

// Map score levels to numeric values for charting
const LEVEL_VALUE: Record<ScoreLevel, number> = {
  'Getting Started': 1,
  'Developing': 2,
  'Solid': 3,
  'Strong': 4,
};

// Dimension keys in display order
type DimensionKey = keyof ScoringResult['scores'];

const DIMENSIONS: { key: DimensionKey; label: string; color: string }[] = [
  { key: 'situation',     label: 'Situation',     color: '#22d3ee' },
  { key: 'task',          label: 'Task',           color: '#f59e0b' },
  { key: 'action',        label: 'Action',         color: '#a78bfa' },
  { key: 'result',        label: 'Result',         color: '#34d399' },
  { key: 'communication', label: 'Communication',  color: '#6366f1' },
  { key: 'pacing',        label: 'Pacing',         color: '#ec4899' },
];

/* ─────────────────────────────────────────────
   SPARKLINE GEOMETRY
───────────────────────────────────────────── */

// SVG inner dimensions
const SVG_W = 220;
const SVG_H = 60;
const PAD_X = 12;
const PAD_Y = 10;

// Returns SVG x,y for a given attempt index and level value
function toPoint(attemptIndex: number, totalAttempts: number, value: number): { x: number; y: number } {
  const xRange = SVG_W - PAD_X * 2;
  const yRange = SVG_H - PAD_Y * 2;

  // x: spread evenly across width (clamp to single point if only 1 attempt)
  const x = totalAttempts === 1
    ? PAD_X + xRange / 2
    : PAD_X + (attemptIndex / (totalAttempts - 1)) * xRange;

  // y: value 1-4, inverted so 4 = top
  const y = PAD_Y + yRange - ((value - 1) / 3) * yRange;

  return { x, y };
}

/* ─────────────────────────────────────────────
   TREND HELPERS
───────────────────────────────────────────── */

function computeTrend(values: number[]): 'up' | 'down' | 'flat' {
  if (values.length < 2) return 'flat';
  const first = values[0];
  const last = values[values.length - 1];
  if (last > first) return 'up';
  if (last < first) return 'down';
  return 'flat';
}

function trendColor(trend: 'up' | 'down' | 'flat'): string {
  if (trend === 'up') return '#22c55e';
  if (trend === 'down') return '#ef4444';
  return '#6b7280';
}

/* ─────────────────────────────────────────────
   AVERAGE LINE CHART
───────────────────────────────────────────── */

// Computes average level value (1-4) across all 6 dimensions for a single result
function avgScore(result: ScoringResult): number {
  const values = DIMENSIONS.map(d => LEVEL_VALUE[result.scores[d.key].level]);
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const AVG_SVG_W = 300;
const AVG_SVG_H = 80;
const AVG_PAD_X = 20;
const AVG_PAD_Y = 14;

function toAvgPoint(idx: number, total: number, value: number): { x: number; y: number } {
  const xRange = AVG_SVG_W - AVG_PAD_X * 2;
  const yRange = AVG_SVG_H - AVG_PAD_Y * 2;

  const x = total === 1
    ? AVG_PAD_X + xRange / 2
    : AVG_PAD_X + (idx / (total - 1)) * xRange;

  // value 1-4, inverted
  const y = AVG_PAD_Y + yRange - ((value - 1) / 3) * yRange;

  return { x, y };
}

/* ─────────────────────────────────────────────
   MINI SPARKLINE (per dimension)
───────────────────────────────────────────── */

interface SparklineProps {
  label: string;
  color: string;
  values: number[]; // numeric level values for each attempt
  attemptLabels: string[];
}

function Sparkline({ label, color, values, attemptLabels }: SparklineProps) {
  const total = values.length;
  const trend = computeTrend(values);
  const lineColor = trendColor(trend);

  const points = values.map((v, i) => toPoint(i, total, v));
  const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Y-axis guide lines at values 1, 2, 3, 4
  const guideLines = [1, 2, 3, 4].map(v => {
    const y = PAD_Y + (SVG_H - PAD_Y * 2) - ((v - 1) / 3) * (SVG_H - PAD_Y * 2);
    return { y, v };
  });

  // Trend arrow for the label area
  const trendArrow = trend === 'up' ? '▲' : trend === 'down' ? '▼' : '→';
  const trendArrowColor = trendColor(trend);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding: '10px 12px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      {/* Label row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '2px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Color dot */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              fontWeight: 600,
              color: '#94a3b8',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
            }}
          >
            {label}
          </span>
        </div>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            fontWeight: 700,
            color: trendArrowColor,
          }}
          title={`Trend: ${trend}`}
        >
          {trendArrow}
        </span>
      </div>

      {/* SVG sparkline */}
      <svg
        width={SVG_W}
        height={SVG_H}
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        style={{ width: '100%', height: 'auto', overflow: 'visible' }}
      >
        {/* Subtle horizontal guide lines */}
        {guideLines.map(({ y, v }) => (
          <line
            key={v}
            x1={PAD_X}
            y1={y}
            x2={SVG_W - PAD_X}
            y2={y}
            stroke="rgba(255,255,255,0.04)"
            strokeWidth="1"
            strokeDasharray={v === 1 || v === 4 ? '0' : '3 4'}
          />
        ))}

        {/* Attempt x-axis labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={p.x}
            y={SVG_H - 1}
            textAnchor="middle"
            fill="rgba(148,163,184,0.4)"
            fontSize="8"
            fontFamily="DM Mono, monospace"
          >
            {attemptLabels[i]}
          </text>
        ))}

        {/* Connecting line */}
        {total > 1 && (
          <polyline
            points={polylinePoints}
            fill="none"
            stroke={lineColor}
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.85"
          />
        )}

        {/* Dots at each data point */}
        {points.map((p, i) => {
          const isLast = i === total - 1;
          return (
            <g key={i}>
              {/* Outer glow ring for last (current) point */}
              {isLast && (
                <circle
                  cx={p.x}
                  cy={p.y}
                  r="5"
                  fill="none"
                  stroke={color}
                  strokeWidth="1"
                  opacity="0.35"
                />
              )}
              <circle
                cx={p.x}
                cy={p.y}
                r={isLast ? '3.5' : '2.5'}
                fill={isLast ? color : lineColor}
                opacity={isLast ? 1 : 0.65}
              />
            </g>
          );
        })}
      </svg>

      {/* Current value pill */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          marginTop: '2px',
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '9px',
            fontWeight: 600,
            color: color,
            opacity: 0.8,
            letterSpacing: '0.04em',
          }}
        >
          now: {['—', 'Getting Started', 'Developing', 'Solid', 'Strong'][values[values.length - 1]]}
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   OVERALL AVERAGE CHART
───────────────────────────────────────────── */

interface OverallChartProps {
  avgValues: number[];
  attemptLabels: string[];
}

function OverallChart({ avgValues, attemptLabels }: OverallChartProps) {
  const total = avgValues.length;
  const trend = computeTrend(avgValues);
  const lineColor = trendColor(trend);

  const points = avgValues.map((v, i) => toAvgPoint(i, total, v));
  const polylinePoints = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');

  // Y-axis labels (level names, positions)
  const yLabels: { label: string; y: number }[] = [
    { label: 'Strong',         y: toAvgPoint(0, 1, 4).y },
    { label: 'Solid',          y: toAvgPoint(0, 1, 3).y },
    { label: 'Developing',     y: toAvgPoint(0, 1, 2).y },
    { label: 'Getting Started', y: toAvgPoint(0, 1, 1).y },
  ];

  // Area path (filled region under the line)
  const bottomY = toAvgPoint(0, 1, 1).y + 2;
  const areaPoints =
    `${points[0].x.toFixed(1)},${bottomY} ` +
    points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') +
    ` ${points[points.length - 1].x.toFixed(1)},${bottomY}`;

  // Net change across all attempts
  const netChange = avgValues[total - 1] - avgValues[0];
  const netLabel = netChange > 0.05
    ? `+${netChange.toFixed(2)} overall`
    : netChange < -0.05
    ? `${netChange.toFixed(2)} overall`
    : 'No overall change';
  const netColor = trendColor(trend);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.018)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '10px',
        padding: '12px 14px 10px',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            fontWeight: 600,
            color: '#94a3b8',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          Average Score
        </span>
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '11px',
            fontWeight: 700,
            color: netColor,
          }}
        >
          {netLabel}
        </span>
      </div>

      {/* SVG chart */}
      <div style={{ position: 'relative' }}>
        {/* Y-axis labels (positioned absolutely beside SVG) */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: `${AVG_PAD_X - 2}px`,
            pointerEvents: 'none',
          }}
        >
          {yLabels.map(({ label, y }) => {
            // Convert SVG y to % of SVG height for absolute positioning
            const pct = (y / AVG_SVG_H) * 100;
            return (
              <span
                key={label}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: `${pct}%`,
                  transform: 'translateY(-50%)',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '7px',
                  color: 'rgba(148,163,184,0.3)',
                  whiteSpace: 'nowrap',
                }}
              >
                {/* Abbreviated label */}
                {label === 'Getting Started' ? 'GS' : label.slice(0, 2)}
              </span>
            );
          })}
        </div>

        <svg
          width={AVG_SVG_W}
          height={AVG_SVG_H}
          viewBox={`0 0 ${AVG_SVG_W} ${AVG_SVG_H}`}
          style={{ width: '100%', height: 'auto', overflow: 'visible' }}
        >
          {/* Horizontal guide lines */}
          {[1, 2, 3, 4].map(v => {
            const y = toAvgPoint(0, 1, v).y;
            return (
              <line
                key={v}
                x1={AVG_PAD_X}
                y1={y}
                x2={AVG_SVG_W - AVG_PAD_X}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
                strokeDasharray={v === 1 || v === 4 ? '0' : '4 5'}
              />
            );
          })}

          {/* Vertical guides at each attempt */}
          {points.map((p, i) => (
            <line
              key={i}
              x1={p.x}
              y1={AVG_PAD_Y}
              x2={p.x}
              y2={AVG_SVG_H - AVG_PAD_Y}
              stroke="rgba(255,255,255,0.03)"
              strokeWidth="1"
            />
          ))}

          {/* Filled area under the line */}
          {total > 1 && (
            <polygon
              points={areaPoints}
              fill={lineColor}
              opacity="0.07"
            />
          )}

          {/* Main line */}
          {total > 1 && (
            <polyline
              points={polylinePoints}
              fill="none"
              stroke={lineColor}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity="0.9"
            />
          )}

          {/* Dots */}
          {points.map((p, i) => {
            const isLast = i === total - 1;
            return (
              <g key={i}>
                {isLast && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r="6"
                    fill="none"
                    stroke={lineColor}
                    strokeWidth="1.5"
                    opacity="0.3"
                  />
                )}
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={isLast ? '4' : '3'}
                  fill={lineColor}
                  opacity={isLast ? 1 : 0.6}
                />
                {/* Attempt label below dot */}
                <text
                  x={p.x}
                  y={AVG_SVG_H - 2}
                  textAnchor="middle"
                  fill="rgba(148,163,184,0.45)"
                  fontSize="8"
                  fontFamily="DM Mono, monospace"
                >
                  {attemptLabels[i]}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────
   SCORE TREND CHART (exported)
───────────────────────────────────────────── */

export interface ScoreTrendChartProps {
  currentResult: ScoringResult;
  previousAttempts: ScoringResult[];
}

export default function ScoreTrendChart({ currentResult, previousAttempts }: ScoreTrendChartProps) {
  // Need at least 2 data points (one previous + current) to show a trend
  if (previousAttempts.length === 0) return null;

  const allAttempts = [...previousAttempts, currentResult];
  const attemptLabels = allAttempts.map((_, i) =>
    i === allAttempts.length - 1 ? 'Now' : `#${i + 1}`
  );

  // Per-dimension value arrays across all attempts
  const dimensionValues = DIMENSIONS.map(d => ({
    ...d,
    values: allAttempts.map(r => LEVEL_VALUE[r.scores[d.key].level]),
  }));

  // Average values per attempt
  const avgValues = allAttempts.map(r => avgScore(r));

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
      {/* Top shimmer line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(34,197,94,0.5), rgba(99,102,241,0.4), transparent)',
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
            background: 'rgba(34,197,94,0.12)',
            border: '1px solid rgba(34,197,94,0.28)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '15px',
            flexShrink: 0,
          }}
        >
          ↑
        </div>
        <div>
          <div
            style={{
              fontFamily: "'Syne', sans-serif",
              fontSize: '15px',
              fontWeight: 800,
              color: '#f9fafb',
              letterSpacing: '-0.01em',
            }}
          >
            Score Trend
          </div>
          <div
            style={{
              fontFamily: "'DM Mono', monospace",
              fontSize: '10px',
              color: '#4b5563',
              letterSpacing: '0.06em',
            }}
          >
            {allAttempts.length} attempt{allAttempts.length !== 1 ? 's' : ''} on this question
          </div>
        </div>
      </div>

      {/* Overall average chart */}
      <div style={{ marginBottom: '20px' }}>
        <OverallChart avgValues={avgValues} attemptLabels={attemptLabels} />
      </div>

      {/* Section divider */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '14px',
        }}
      >
        <div
          style={{
            width: '3px',
            height: '14px',
            borderRadius: '2px',
            background: '#6366f1',
            flexShrink: 0,
          }}
        />
        <span
          style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: '10px',
            fontWeight: 600,
            color: 'rgba(99,102,241,0.6)',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
          }}
        >
          Per Dimension
        </span>
        <div
          style={{
            flex: 1,
            height: '1px',
            background: 'linear-gradient(90deg, rgba(99,102,241,0.22), transparent)',
          }}
        />
      </div>

      {/* 3x2 grid of sparklines */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
          gap: '10px',
        }}
      >
        {dimensionValues.map(({ key, label, color, values }) => (
          <Sparkline
            key={key}
            label={label}
            color={color}
            values={values}
            attemptLabels={attemptLabels}
          />
        ))}
      </div>

      {/* Legend: trend colors */}
      <div
        style={{
          marginTop: '18px',
          paddingTop: '14px',
          borderTop: '1px solid #1c1c2a',
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        {([
          { color: '#22c55e', label: 'Improving' },
          { color: '#6b7280', label: 'Flat' },
          { color: '#ef4444', label: 'Declining' },
        ] as const).map(({ color, label }) => (
          <div
            key={label}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
            }}
          >
            <div
              style={{
                width: '20px',
                height: '3px',
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
              {label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
