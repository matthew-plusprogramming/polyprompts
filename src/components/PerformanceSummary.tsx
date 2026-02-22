import React from 'react';
import type { CSSProperties } from 'react';

interface PerformanceSummaryProps {
  overallSummary: string;
  strongestDimension: string;
  weakestDimension: string;
  positiveCallouts: [string, string];
}

const DIMENSION_LABELS: Record<string, string> = {
  situation:     'Situation',
  task:          'Task',
  action:        'Action',
  result:        'Result',
  communication: 'Communication',
  pacing:        'Pacing',
};

function PerformanceSummary({
  overallSummary,
  strongestDimension,
  weakestDimension,
  positiveCallouts,
}: PerformanceSummaryProps) {
  const containerStyle: CSSProperties = {
    position: 'relative',
    background: 'rgba(255,255,255,0.012)',
    border: '1px solid rgba(255,255,255,0.055)',
    borderRadius: '20px',
    padding: '24px',
    backdropFilter: 'blur(24px)',
    boxShadow: '0 24px 60px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.04)',
    overflow: 'hidden',
    fontFamily: "'Josefin Sans', sans-serif",
  };

  const shimmerStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '10%',
    height: '1px',
    background:
      'linear-gradient(90deg, transparent, rgba(34,197,94,0.5), rgba(99,102,241,0.4), transparent)',
    pointerEvents: 'none',
  };

  const glowStyle: CSSProperties = {
    position: 'absolute',
    top: '-40px',
    right: '-40px',
    width: '180px',
    height: '180px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(34,197,94,0.06) 0%, transparent 70%)',
    pointerEvents: 'none',
  };

  const headingRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '18px',
  };

  const iconBlockStyle: CSSProperties = {
    width: '32px',
    height: '32px',
    borderRadius: '9px',
    flexShrink: 0,
    background: 'rgba(34,197,94,0.12)',
    border: '1px solid rgba(34,197,94,0.28)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '15px',
  };

  const headingTextStyle: CSSProperties = {
    fontFamily: "'Josefin Sans', sans-serif",
    fontSize: '15px',
    fontWeight: '800',
    color: '#f5f5f5',
    letterSpacing: '-0.01em',
  };

  const summaryTextStyle: CSSProperties = {
    fontSize: '14px',
    color: '#d4d4d4',
    lineHeight: 1.7,
    marginBottom: '20px',
  };

  const highlightRowStyle: CSSProperties = {
    display: 'flex',
    gap: '12px',
    marginBottom: '22px',
  };

  const strongestCardStyle: CSSProperties = {
    flex: 1,
    background: 'rgba(34,197,94,0.07)',
    border: '1px solid rgba(34,197,94,0.22)',
    borderTop: '3px solid #22c55e',
    borderRadius: '12px',
    padding: '14px 16px',
  };

  const weakestCardStyle: CSSProperties = {
    flex: 1,
    background: 'rgba(245,158,11,0.07)',
    border: '1px solid rgba(245,158,11,0.22)',
    borderTop: '3px solid #f59e0b',
    borderRadius: '12px',
    padding: '14px 16px',
  };

  const highlightLabelStyle: CSSProperties = {
    fontFamily: "'Josefin Sans', sans-serif",
    fontSize: '10px',
    fontWeight: 600,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    marginBottom: '6px',
  };

  const highlightValueStyle: CSSProperties = {
    fontFamily: "'Josefin Sans', sans-serif",
    fontSize: '14px',
    fontWeight: '700',
  };

  const sectionDividerStyle: CSSProperties = {
    height: '1px',
    background:
      'linear-gradient(90deg, rgba(34,197,94,0.22) 0%, rgba(34,197,94,0.06) 60%, transparent 100%)',
    marginBottom: '18px',
  };

  const sectionHeaderStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '12px',
  };

  const sectionBarStyle: CSSProperties = {
    width: '3px',
    height: '14px',
    borderRadius: '2px',
    background: '#22c55e',
    flexShrink: 0,
  };

  const sectionLabelStyle: CSSProperties = {
    fontFamily: "'Josefin Sans', sans-serif",
    fontSize: '10px',
    fontWeight: '600',
    color: 'rgba(34,197,94,0.7)',
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
  };

  const sectionLineStyle: CSSProperties = {
    flex: 1,
    height: '1px',
    background: 'linear-gradient(90deg, rgba(34,197,94,0.2), transparent)',
  };

  const calloutCardStyle: CSSProperties = {
    background: 'rgba(255,255,255,0.018)',
    border: '1px solid #1c1c1c',
    borderLeft: '3px solid #22c55e',
    borderRadius: '12px',
    padding: '14px 16px',
    marginBottom: '10px',
    boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
  };

  const calloutLabelStyle: CSSProperties = {
    fontFamily: "'Josefin Sans', sans-serif",
    fontSize: '10px',
    fontWeight: 600,
    color: 'rgba(34,197,94,0.65)',
    letterSpacing: '0.08em',
    textTransform: 'uppercase',
    marginBottom: '5px',
  };

  const calloutTextStyle: CSSProperties = {
    fontSize: '13px',
    color: '#e2e8f0',
    lineHeight: 1.6,
  };

  const strongestLabel = DIMENSION_LABELS[strongestDimension] ?? strongestDimension;
  const weakestLabel = DIMENSION_LABELS[weakestDimension] ?? weakestDimension;

  return (
    <div style={containerStyle}>
      {/* Decorative accents */}
      <div style={shimmerStyle} />
      <div style={glowStyle} />

      {/* Heading */}
      <div style={headingRowStyle}>
        <div style={iconBlockStyle}>&#9733;</div>
        <div>
          <div style={headingTextStyle}>Performance Summary</div>
          <div
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '10px',
              color: '#4b5563',
              letterSpacing: '0.06em',
            }}
          >
            Overall assessment of your response
          </div>
        </div>
      </div>

      {/* Overall summary text */}
      <p style={summaryTextStyle}>{overallSummary}</p>

      {/* Strongest / Focus Area highlight cards */}
      <div style={highlightRowStyle}>
        <div style={strongestCardStyle}>
          <div style={{ ...highlightLabelStyle, color: 'rgba(34,197,94,0.75)' }}>
            Strongest Area
          </div>
          <div style={{ ...highlightValueStyle, color: '#4ade80' }}>{strongestLabel}</div>
        </div>
        <div style={weakestCardStyle}>
          <div style={{ ...highlightLabelStyle, color: 'rgba(245,158,11,0.75)' }}>
            Focus Area
          </div>
          <div style={{ ...highlightValueStyle, color: '#fbbf24' }}>{weakestLabel}</div>
        </div>
      </div>

      {/* Divider before callouts */}
      <div style={sectionDividerStyle} />

      {/* What You Did Well section header */}
      <div style={sectionHeaderStyle}>
        <div style={sectionBarStyle} />
        <span style={sectionLabelStyle}>What You Did Well</span>
        <div style={sectionLineStyle} />
      </div>

      {/* Positive callout cards */}
      {positiveCallouts.map((callout, index) => (
        <div key={index} style={calloutCardStyle}>
          <div style={calloutLabelStyle}>Highlight {index + 1}</div>
          <div style={calloutTextStyle}>{callout}</div>
        </div>
      ))}
    </div>
  );
}

export default React.memo(PerformanceSummary);
