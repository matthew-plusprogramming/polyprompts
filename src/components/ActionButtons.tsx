import { useState, useEffect } from 'react';

const AB_STYLE_ID = 'action-buttons-styles';

function injectStyles() {
  if (document.getElementById(AB_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = AB_STYLE_ID;
  style.textContent = `
    .action-buttons-row {
      display: flex;
      flex-direction: row;
      align-items: center;
      justify-content: center;
      gap: 12px;
      flex-wrap: wrap;
    }
    .action-btn {
      min-height: 44px;
    }
    @media (max-width: 639px) {
      .action-buttons-row {
        flex-direction: column;
        width: 100%;
      }
      .action-btn {
        width: 100% !important;
        min-height: 52px;
      }
    }
  `;
  document.head.appendChild(style);
}

interface ActionButtonsProps {
  onRetry: () => void;
  onNextQuestion: () => void;
  attemptNumber: number;
}

export default function ActionButtons({
  onRetry,
  onNextQuestion,
  attemptNumber,
}: ActionButtonsProps) {
  const [retryHovered, setRetryHovered] = useState(false);
  const [nextHovered, setNextHovered] = useState(false);

  useEffect(() => { injectStyles(); }, []);

  const retryButtonStyle: React.CSSProperties = {
    padding: '10px 20px',
    borderRadius: '8px',
    border: '1px solid #6366f1',
    background: retryHovered ? '#6366f1' : 'transparent',
    color: retryHovered ? '#ffffff' : '#6366f1',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    transition: 'background 0.15s ease, color 0.15s ease',
    whiteSpace: 'nowrap',
  };

  const nextButtonStyle: React.CSSProperties = {
    padding: '10px 24px',
    borderRadius: '8px',
    border: 'none',
    background: nextHovered
      ? 'linear-gradient(135deg, #4f52d4, #7c3aed)'
      : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
    color: '#ffffff',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    transition: 'background 0.15s ease, box-shadow 0.15s ease',
    boxShadow: nextHovered
      ? '0 4px 16px rgba(99, 102, 241, 0.5)'
      : '0 2px 8px rgba(99, 102, 241, 0.3)',
    whiteSpace: 'nowrap',
  };

  const noteStyle: React.CSSProperties = {
    width: '100%',
    textAlign: 'center',
    fontSize: '12px',
    color: '#9ca3af',
    marginTop: '4px',
  };

  return (
    <div style={{ width: '100%' }}>
      <div className="action-buttons-row">
        <button
          className="action-btn"
          style={retryButtonStyle}
          onClick={onRetry}
          onMouseEnter={() => setRetryHovered(true)}
          onMouseLeave={() => setRetryHovered(false)}
        >
          {attemptNumber > 1 ? `Try Again (Attempt ${attemptNumber})` : 'Try Again'}
        </button>

        <button
          className="action-btn"
          style={nextButtonStyle}
          onClick={onNextQuestion}
          onMouseEnter={() => setNextHovered(true)}
          onMouseLeave={() => setNextHovered(false)}
        >
          Next Question
        </button>
      </div>

      {attemptNumber >= 3 && (
        <p style={noteStyle}>
          You've practiced this {attemptNumber} times
        </p>
      )}
    </div>
  );
}
