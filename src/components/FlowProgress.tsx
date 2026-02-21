interface FlowProgressProps {
  currentStep: 'setup' | 'interview' | 'feedback';
}

const STEPS: Array<{ id: 'setup' | 'interview' | 'feedback'; label: string }> = [
  { id: 'setup', label: 'Setup' },
  { id: 'interview', label: 'Interview' },
  { id: 'feedback', label: 'Feedback' },
];

const STEP_ORDER: Record<'setup' | 'interview' | 'feedback', number> = {
  setup: 0,
  interview: 1,
  feedback: 2,
};

export default function FlowProgress({ currentStep }: FlowProgressProps) {
  const currentIndex = STEP_ORDER[currentStep];

  return (
    <div
      style={{
        width: '100%',
        maxWidth: '400px',
        margin: '0 auto 28px',
        padding: '0 4px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {STEPS.map((step, index) => {
          const isCompleted = index < currentIndex;
          const isCurrent = index === currentIndex;
          const isFuture = index > currentIndex;

          return (
            <div
              key={step.id}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                flex: 1,
                position: 'relative',
              }}
            >
              {/* Connector line: left half */}
              {index > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    top: isCurrent ? '9px' : '7px',
                    left: 0,
                    width: '50%',
                    height: '2px',
                    background: isCompleted || isCurrent
                      ? 'linear-gradient(90deg, #6366f1, #6366f1)'
                      : 'rgba(255,255,255,0.07)',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}

              {/* Connector line: right half */}
              {index < STEPS.length - 1 && (
                <div
                  style={{
                    position: 'absolute',
                    top: isCurrent ? '9px' : '7px',
                    right: 0,
                    width: '50%',
                    height: '2px',
                    background: isCompleted
                      ? '#6366f1'
                      : 'rgba(255,255,255,0.07)',
                    transition: 'background 0.3s ease',
                  }}
                />
              )}

              {/* Circle */}
              <div
                style={{
                  position: 'relative',
                  zIndex: 1,
                  width: isCurrent ? '18px' : '14px',
                  height: isCurrent ? '18px' : '14px',
                  borderRadius: '50%',
                  flexShrink: 0,
                  background: isCompleted
                    ? '#6366f1'
                    : isCurrent
                    ? '#818cf8'
                    : 'transparent',
                  border: isFuture
                    ? '2px solid rgba(255,255,255,0.12)'
                    : isCompleted
                    ? '2px solid #6366f1'
                    : '2px solid #818cf8',
                  boxShadow: isCurrent
                    ? '0 0 0 3px rgba(129,140,248,0.18), 0 0 10px rgba(99,102,241,0.35)'
                    : 'none',
                  transition: 'all 0.25s cubic-bezier(0.34,1.56,0.64,1)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isCompleted && (
                  <svg
                    width="8"
                    height="6"
                    viewBox="0 0 8 6"
                    fill="none"
                    style={{ display: 'block' }}
                  >
                    <path
                      d="M1 3L3 5L7 1"
                      stroke="#fff"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>

              {/* Label */}
              <span
                style={{
                  marginTop: '7px',
                  fontFamily: "'DM Mono', monospace",
                  fontSize: '10px',
                  fontWeight: isCurrent ? '600' : '400',
                  letterSpacing: '0.06em',
                  textTransform: 'uppercase',
                  color: isCompleted
                    ? '#a5b4fc'
                    : isCurrent
                    ? '#c7d2fe'
                    : 'rgba(255,255,255,0.2)',
                  transition: 'color 0.2s ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
