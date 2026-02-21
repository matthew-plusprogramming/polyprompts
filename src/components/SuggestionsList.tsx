import React, { useEffect } from 'react';

const SL_STYLE_ID = 'suggestions-list-styles';

function injectStyles() {
  if (document.getElementById(SL_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SL_STYLE_ID;
  style.textContent = `
    .suggestion-card {
      word-break: break-word;
      overflow-wrap: anywhere;
    }
    @media (max-width: 639px) {
      .suggestion-card {
        padding: 12px 14px !important;
        margin-left: 0 !important;
      }
    }
  `;
  document.head.appendChild(style);
}

interface SuggestionsListProps {
  suggestions: [string, string, string];
}

const containerStyle: React.CSSProperties = {
  width: '100%',
};

const headerStyle: React.CSSProperties = {
  fontSize: '1rem',
  fontWeight: 700,
  color: '#f1f5f9',
  marginBottom: '14px',
  letterSpacing: '0.01em',
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
};

const headerIconStyle: React.CSSProperties = {
  fontSize: '1rem',
  lineHeight: 1,
};

const cardStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'flex-start',
  gap: '14px',
  background: '#1e293b',
  border: '1px solid #334155',
  borderRadius: '12px',
  padding: '16px 18px',
  marginBottom: '10px',
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.25)',
  transition: 'box-shadow 0.2s ease',
};

const numberCircleStyle: React.CSSProperties = {
  flexShrink: 0,
  width: '32px',
  height: '32px',
  borderRadius: '50%',
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '0.8125rem',
  fontWeight: 700,
  color: '#fff',
  boxShadow: '0 2px 6px rgba(99, 102, 241, 0.4)',
  marginTop: '1px',
};

const textBlockStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const labelStyle: React.CSSProperties = {
  fontSize: '0.6875rem',
  fontWeight: 600,
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
  marginBottom: '4px',
};

const suggestionTextStyle: React.CSSProperties = {
  fontSize: '0.9rem',
  fontWeight: 400,
  color: '#e2e8f0',
  lineHeight: 1.55,
};

const trailingIconStyle: React.CSSProperties = {
  flexShrink: 0,
  fontSize: '1rem',
  color: '#475569',
  marginTop: '2px',
  lineHeight: 1,
};

const LABELS = ['Suggestion 1', 'Suggestion 2', 'Suggestion 3'] as const;

function SuggestionsList({ suggestions }: SuggestionsListProps) {
  useEffect(() => { injectStyles(); }, []);

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <span style={headerIconStyle}>&#128161;</span>
        What to Improve
      </div>

      {suggestions.map((text, index) => (
        <div
          key={index}
          className="suggestion-card"
          style={{
            ...cardStyle,
            marginLeft: `${index * 4}px`,
          }}
        >
          <div style={numberCircleStyle}>{index + 1}</div>

          <div style={textBlockStyle}>
            <div style={labelStyle}>{LABELS[index]}</div>
            <div style={suggestionTextStyle}>{text}</div>
          </div>

          <span style={trailingIconStyle}>&#8594;</span>
        </div>
      ))}
    </div>
  );
}

export default React.memo(SuggestionsList);
