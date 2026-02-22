import { useEffect, useRef } from 'react';

interface Props {
  transcript: string;
  interimText?: string;
  isRecording: boolean;
}

export default function TranscriptPanel({ transcript, interimText, isRecording }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isEmpty = !transcript && !interimText;

  // Auto-scroll to bottom whenever content grows
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      el.scrollTop = el.scrollHeight;
    }
  }, [transcript, interimText]);

  return (
    <>
      <style>{`
        @keyframes blink-cursor {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }
      `}</style>

      <div
        style={{
          background: '#0f0f1a',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: '16px',
          padding: '20px 24px',
          position: 'relative',
          boxShadow: 'inset 0 2px 12px rgba(0,0,0,0.35)',
        }}
      >
        {/* header bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            marginBottom: '14px',
          }}
        >
          {/* recording dot */}
          <div
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: isRecording ? '#f87171' : '#374151',
              boxShadow: isRecording ? '0 0 0 2px rgba(248,113,113,0.25)' : 'none',
              transition: 'background 0.3s, box-shadow 0.3s',
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontSize: '11px',
              fontWeight: '700',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: isRecording ? '#f87171' : '#4b5563',
              fontFamily: "'Josefin Sans', sans-serif",
              transition: 'color 0.3s',
            }}
          >
            {isRecording ? 'Live transcript' : 'Transcript'}
          </span>
        </div>

        {/* scrollable content */}
        <div
          ref={scrollRef}
          style={{
            maxHeight: '220px',
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'rgba(99,102,241,0.3) transparent',
          }}
        >
          {isEmpty ? (
            <p
              style={{
                margin: 0,
                fontSize: '15px',
                color: '#374151',
                fontStyle: 'italic',
                lineHeight: 1.6,
              }}
            >
              Start speaking and your words will appear here…
            </p>
          ) : (
            <p
              style={{
                margin: 0,
                fontSize: '16px',
                color: '#e5e7eb',
                lineHeight: 1.7,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {/* committed transcript */}
              {transcript}

              {/* interim text — lighter/italic */}
              {interimText && (
                <span
                  style={{
                    color: '#6b7280',
                    fontStyle: 'italic',
                  }}
                >
                  {transcript ? ' ' : ''}{interimText}
                </span>
              )}

              {/* blinking cursor when recording */}
              {isRecording && (
                <span
                  style={{
                    display: 'inline-block',
                    width: '2px',
                    height: '1em',
                    background: '#6366f1',
                    marginLeft: '2px',
                    verticalAlign: 'text-bottom',
                    borderRadius: '1px',
                    animation: 'blink-cursor 1s step-end infinite',
                  }}
                />
              )}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
