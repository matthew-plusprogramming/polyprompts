import { useEffect } from 'react';
import type { Question } from '../types';

const QD_STYLE_ID = 'question-display-styles';

function injectStyles() {
  if (document.getElementById(QD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = QD_STYLE_ID;
  style.textContent = `
    .question-display-card {
      padding: 32px 36px;
    }
    @media (max-width: 639px) {
      .question-display-card {
        padding: 20px 18px;
        border-radius: 14px !important;
      }
    }
  `;
  document.head.appendChild(style);
}

interface Props {
  question: Question;
}

const DIFFICULTY_CONFIG: Record<string, { color: string; label: string; glyph: string }> = {
  easy:   { color: '#34d399', label: 'Easy',   glyph: '○' },
  medium: { color: '#f59e0b', label: 'Medium',  glyph: '◑' },
  hard:   { color: '#f87171', label: 'Hard',    glyph: '●' },
};

export default function QuestionDisplay({ question }: Props) {
  const diff = DIFFICULTY_CONFIG[question.difficulty] ?? DIFFICULTY_CONFIG['medium'];
  const category = question.category ?? '';

  useEffect(() => { injectStyles(); }, []);

  return (
    <div
      className="question-display-card"
      style={{
        background: 'rgba(255,255,255,0.012)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '20px',
        position: 'relative',
        overflow: 'hidden',
        backdropFilter: 'blur(20px)',
        boxShadow: '0 8px 40px rgba(0,0,0,0.45)',
      }}
    >
      {/* top accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '10%',
          right: '10%',
          height: '1px',
          background: 'linear-gradient(90deg,transparent,rgba(99,102,241,0.55),rgba(34,211,238,0.45),transparent)',
        }}
      />

      {/* badges row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '20px',
          flexWrap: 'wrap',
        }}
      >
        {/* difficulty indicator */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            background: `${diff.color}18`,
            border: `1px solid ${diff.color}40`,
            borderRadius: '999px',
            padding: '4px 12px',
          }}
        >
          <span style={{ fontSize: '11px', color: diff.color, lineHeight: 1 }}>{diff.glyph}</span>
          <span
            style={{
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: diff.color,
              fontFamily: "'Syne', sans-serif",
            }}
          >
            {diff.label}
          </span>
        </div>

        {/* category badge */}
        {category && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              background: 'rgba(129,140,248,0.12)',
              border: '1px solid rgba(129,140,248,0.25)',
              borderRadius: '999px',
              padding: '4px 12px',
            }}
          >
            <span
              style={{
                fontSize: '11px',
                fontWeight: '600',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: '#a5b4fc',
                fontFamily: "'Syne', sans-serif",
              }}
            >
              {category}
            </span>
          </div>
        )}
      </div>

      {/* question text */}
      <p
        style={{
          fontSize: 'clamp(18px, 2.6vw, 24px)',
          fontWeight: '700',
          lineHeight: 1.55,
          letterSpacing: '-0.01em',
          color: '#f9fafb',
          margin: 0,
          fontFamily: "'Syne', sans-serif",
        }}
      >
        {question.text}
      </p>
    </div>
  );
}
