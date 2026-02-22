interface Props {
  visible: boolean;
  message?: string;
}

const DEFAULT_MESSAGE = "Take your time — would you like me to rephrase the question?";

export default function SilenceNudge({ visible, message }: Props) {
  return (
    <>
      <style>{`
        @keyframes nudge-in {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes nudge-out {
          from {
            opacity: 1;
            transform: translateY(0);
          }
          to {
            opacity: 0;
            transform: translateY(8px);
          }
        }
      `}</style>

      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: visible ? 'auto' : 'none',
        }}
      >
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '10px',
            background: 'rgba(99,102,241,0.1)',
            border: '1px solid rgba(99,102,241,0.22)',
            borderRadius: '999px',
            padding: '10px 22px',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.35)',
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(8px)',
            transition: 'opacity 0.35s ease, transform 0.35s ease',
            animation: visible ? 'nudge-in 0.35s ease forwards' : undefined,
            willChange: 'opacity, transform',
          }}
        >
          {/* gentle pulse dot */}
          <div
            style={{
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: '#a5b4fc',
              flexShrink: 0,
              opacity: 0.75,
            }}
          />

          <span
            style={{
              fontSize: '13px',
              fontWeight: '500',
              color: '#c4b5fd',
              fontFamily: "'Josefin Sans', sans-serif",
              letterSpacing: '0.01em',
              lineHeight: 1.4,
            }}
          >
            {message ?? DEFAULT_MESSAGE}
          </span>
        </div>
      </div>
    </>
  );
}
