import React, { useEffect } from 'react';
import type { CSSProperties } from 'react';

const FUP_STYLE_ID = 'follow-up-prompt-styles';

function injectStyles() {
  if (document.getElementById(FUP_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = FUP_STYLE_ID;
  style.textContent = `
    .follow-up-card {
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    @media (max-width: 639px) {
      .follow-up-card {
        padding: 14px 16px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

interface FollowUpPromptProps {
  followUp: string;
}

function FollowUpPrompt({ followUp }: FollowUpPromptProps) {
  useEffect(() => { injectStyles(); }, []);

  const containerStyle: CSSProperties = {
    position: 'relative',
    background: 'linear-gradient(135deg, #1a1a2e 0%, #1e1e3a 60%, #16162a 100%)',
    border: '1px solid rgba(99,102,241,0.22)',
    borderLeft: '3px solid #6366f1',
    borderRadius: '14px',
    padding: '20px 22px',
    overflow: 'hidden',
  };

  const topAccentStyle: CSSProperties = {
    position: 'absolute',
    top: 0,
    left: '10%',
    right: '30%',
    height: '1px',
    background:
      'linear-gradient(90deg, transparent, rgba(99,102,241,0.55), rgba(129,140,248,0.3), transparent)',
    pointerEvents: 'none',
  };

  const glowStyle: CSSProperties = {
    position: 'absolute',
    top: '-30px',
    left: '-20px',
    width: '120px',
    height: '120px',
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(99,102,241,0.08) 0%, transparent 70%)',
    pointerEvents: 'none',
  };

  const headerRowStyle: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    marginBottom: '12px',
  };

  const iconBlockStyle: CSSProperties = {
    width: '28px',
    height: '28px',
    borderRadius: '8px',
    flexShrink: 0,
    background: 'rgba(99,102,241,0.14)',
    border: '1px solid rgba(99,102,241,0.3)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  };

  // A CSS-drawn speech bubble / quotation mark indicator built from pseudo-content
  // We use a styled open-quote character rendered via a span with specific styling
  const quoteGlyphStyle: CSSProperties = {
    fontFamily: 'Georgia, serif',
    fontSize: '18px',
    lineHeight: 1,
    color: '#818cf8',
    userSelect: 'none',
    // Shift up slightly so the quotation mark sits centered in the box
    position: 'relative',
    top: '-1px',
  };

  const labelStyle: CSSProperties = {
    fontFamily: "'DM Mono', monospace",
    fontSize: '10px',
    fontWeight: 700,
    color: '#6366f1',
    letterSpacing: '0.12em',
    textTransform: 'uppercase' as const,
  };

  const dividerStyle: CSSProperties = {
    height: '1px',
    background:
      'linear-gradient(90deg, rgba(99,102,241,0.25) 0%, rgba(99,102,241,0.08) 60%, transparent 100%)',
    marginBottom: '14px',
  };

  const questionTextStyle: CSSProperties = {
    fontFamily: "'DM Sans', sans-serif",
    fontSize: '14px',
    fontStyle: 'italic',
    fontWeight: 400,
    color: '#c4c9e8',
    lineHeight: 1.65,
    letterSpacing: '0.005em',
  };

  const footerStyle: CSSProperties = {
    marginTop: '14px',
    display: 'flex',
    alignItems: 'center',
    gap: '7px',
  };

  const dotStyle: CSSProperties = {
    width: '5px',
    height: '5px',
    borderRadius: '50%',
    background: '#6366f1',
    flexShrink: 0,
    opacity: 0.7,
  };

  const footerTextStyle: CSSProperties = {
    fontFamily: "'DM Mono', monospace",
    fontSize: '10px',
    color: '#4b5563',
    letterSpacing: '0.04em',
  };

  return (
    <div className="follow-up-card" style={containerStyle}>
      {/* Decorative accents */}
      <div style={topAccentStyle} />
      <div style={glowStyle} />

      {/* Header */}
      <div style={headerRowStyle}>
        <div style={iconBlockStyle}>
          <span style={quoteGlyphStyle}>&ldquo;</span>
        </div>
        <span style={labelStyle}>Coach's Question</span>
      </div>

      {/* Divider */}
      <div style={dividerStyle} />

      {/* Follow-up question text */}
      <p style={questionTextStyle}>{followUp}</p>

      {/* Footer hint */}
      <div style={footerStyle}>
        <div style={dotStyle} />
        <span style={footerTextStyle}>Reflect on this before your next attempt</span>
      </div>
    </div>
  );
}

export default React.memo(FollowUpPrompt);
