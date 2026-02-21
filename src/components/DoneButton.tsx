import { useEffect } from 'react';

interface Props {
  onDone: () => void;
  disabled?: boolean;
  isMobile?: boolean;
}

export default function DoneButton({ onDone, disabled = false, isMobile = false }: Props) {
  // Spacebar shortcut
  useEffect(() => {
    if (disabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid triggering when user is typing in an input/textarea
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        onDone();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onDone]);

  return (
    <>
      <style>{`
        @keyframes done-pulse {
          0%   { box-shadow: 0 6px 28px rgba(99,102,241,0.45), 0 0 0 0   rgba(99,102,241,0.35); }
          70%  { box-shadow: 0 6px 28px rgba(99,102,241,0.45), 0 0 0 14px rgba(99,102,241,0);   }
          100% { box-shadow: 0 6px 28px rgba(99,102,241,0.45), 0 0 0 0   rgba(99,102,241,0);   }
        }
        .done-btn:not(:disabled):hover {
          filter: brightness(1.1);
          transform: translateY(-1px);
        }
        .done-btn:not(:disabled):active {
          transform: translateY(0px);
          filter: brightness(0.95);
        }
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px', width: isMobile ? '100%' : 'auto' }}>
        <button
          className="done-btn"
          onClick={onDone}
          disabled={disabled}
          style={{
            padding: '16px 52px',
            minHeight: '52px',
            width: isMobile ? '100%' : 'auto',
            borderRadius: '14px',
            border: 'none',
            cursor: disabled ? 'not-allowed' : 'pointer',
            background: disabled
              ? '#1c1c2e'
              : 'linear-gradient(135deg, #4338ca, #6366f1 50%, #22d3ee)',
            color: disabled ? '#374151' : '#fff',
            fontFamily: "'Syne', sans-serif",
            fontSize: '17px',
            fontWeight: '800',
            letterSpacing: '0.02em',
            transition: 'filter 0.15s, transform 0.15s',
            animation: disabled ? 'none' : 'done-pulse 2s ease-out infinite',
            outline: 'none',
            boxShadow: disabled ? 'none' : undefined,
          }}
        >
          I'm Done
        </button>

        <span
          style={{
            fontSize: '12px',
            color: disabled ? '#1f2937' : '#4b5563',
            letterSpacing: '0.04em',
            fontFamily: "'Syne', sans-serif",
            transition: 'color 0.3s',
            userSelect: 'none',
          }}
        >
          or press Space
        </span>
      </div>
    </>
  );
}
