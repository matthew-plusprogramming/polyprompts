import { useState, useEffect } from 'react';

const METRICS_STYLE_ID = 'coaching-metrics-styles';

function injectMetricsStyles() {
  if (document.getElementById(METRICS_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = METRICS_STYLE_ID;
  style.textContent = `
    .coaching-metrics-grid {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    @media (max-width: 639px) {
      .coaching-metrics-grid {
        flex-direction: column;
      }
      .coaching-metrics-grid > * {
        flex: none !important;
        width: 100% !important;
      }
    }
  `;
  document.head.appendChild(style);
}

interface Props {
  fillerCount: number;
  wordsPerMinute: number;
  speakingDurationSeconds: number;
  isExpanded?: boolean;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function fillerColor(count: number): string {
  if (count <= 2) return '#34d399';
  if (count <= 5) return '#f59e0b';
  return '#f87171';
}

function paceColor(wpm: number): string {
  if (wpm >= 120 && wpm <= 150) return '#34d399';
  if (wpm >= 100 && wpm <= 170) return '#f59e0b';
  return '#f87171';
}

function paceLabel(wpm: number): string {
  if (wpm === 0) return '—';
  if (wpm < 100) return 'Too slow';
  if (wpm < 120) return 'A bit slow';
  if (wpm <= 150) return 'Ideal';
  if (wpm <= 170) return 'A bit fast';
  return 'Too fast';
}

interface MetricCardProps {
  label: string;
  value: string;
  subLabel: string;
  color: string;
}

function MetricCard({ label, value, subLabel, color }: MetricCardProps) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: '90px',
        background: 'rgba(255,255,255,0.025)',
        border: `1px solid ${color}30`,
        borderRadius: '12px',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
      }}
    >
      <span
        style={{
          fontSize: '10px',
          fontWeight: '700',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: '#6b7280',
          fontFamily: "'Syne', sans-serif",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: '22px',
          fontWeight: '800',
          color,
          fontFamily: "'Syne', sans-serif",
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontSize: '11px',
          color: '#4b5563',
          fontFamily: "'Syne', sans-serif",
        }}
      >
        {subLabel}
      </span>
    </div>
  );
}

export default function CoachingMetrics({
  fillerCount,
  wordsPerMinute,
  speakingDurationSeconds,
  isExpanded: initialExpanded = false,
}: Props) {
  const [expanded, setExpanded] = useState(initialExpanded);

  useEffect(() => { injectMetricsStyles(); }, []);

  return (
    <div
      style={{
        background: 'rgba(15,15,26,0.75)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '14px',
        overflow: 'hidden',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* toggle header */}
      <button
        onClick={() => setExpanded(v => !v)}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: expanded ? '12px 16px 10px' : '10px 16px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: '#6b7280',
          fontFamily: "'Syne', sans-serif",
          fontSize: '11px',
          fontWeight: '700',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'color 0.2s',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* small chart icon */}
          <svg
            width="13"
            height="13"
            viewBox="0 0 13 13"
            fill="none"
            style={{ opacity: 0.7 }}
          >
            <rect x="0" y="7" width="3" height="6" rx="1" fill="currentColor" />
            <rect x="5" y="4" width="3" height="9" rx="1" fill="currentColor" />
            <rect x="10" y="1" width="3" height="12" rx="1" fill="currentColor" />
          </svg>
          Coaching Metrics
        </span>

        {/* chevron */}
        <svg
          width="12"
          height="12"
          viewBox="0 0 12 12"
          fill="none"
          style={{
            transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 0.2s',
          }}
        >
          <path
            d="M2 4L6 8L10 4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* expanded metric cards */}
      {expanded && (
        <div
          className="coaching-metrics-grid"
          style={{
            padding: '0 16px 16px',
          }}
        >
          <MetricCard
            label="Filler Words"
            value={String(fillerCount)}
            subLabel={fillerCount <= 2 ? 'Nice and clean' : fillerCount <= 5 ? 'Getting noticeable' : 'Try to reduce'}
            color={fillerColor(fillerCount)}
          />
          <MetricCard
            label="Speaking Pace"
            value={wordsPerMinute > 0 ? `${wordsPerMinute}` : '—'}
            subLabel={wordsPerMinute > 0 ? `${paceLabel(wordsPerMinute)} · ideal 120–150` : 'Not yet measured'}
            color={wordsPerMinute > 0 ? paceColor(wordsPerMinute) : '#4b5563'}
          />
          <MetricCard
            label="Duration"
            value={speakingDurationSeconds > 0 ? formatDuration(speakingDurationSeconds) : '—'}
            subLabel="M:SS elapsed"
            color={speakingDurationSeconds > 0 ? '#a78bfa' : '#4b5563'}
          />
        </div>
      )}
    </div>
  );
}
