import { useEffect, useRef, useState, useMemo } from 'react';

interface TypewriterQuestionProps {
  text: string;
  /** True when TTS is actively speaking the question */
  isTyping: boolean;
  /** True when the full text should be visible (post-TTS phases) */
  isComplete: boolean;
  /** Whether the content is visible (container always renders for stable layout) */
  visible: boolean;
  /** TTS speed multiplier (1.0 = normal) */
  ttsSpeed?: number;
}

/**
 * Dynamically types out the interview question text synchronized
 * with TTS playback. The outer container always renders to prevent
 * layout snapping; content fades in/out via opacity.
 */
export default function TypewriterQuestion({
  text,
  isTyping,
  isComplete,
  visible,
  ttsSpeed = 1,
}: TypewriterQuestionProps) {
  const [charIndex, setCharIndex] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevTextRef = useRef(text);

  // Reset when question text changes
  useEffect(() => {
    if (text !== prevTextRef.current) {
      setCharIndex(0);
      prevTextRef.current = text;
    }
  }, [text]);

  // Calculate ms per character: ~150 WPM * speed, avg 5 chars/word + 1 space = 6 chars/word
  // 150 * speed WPM = 150*speed * 6 chars/min = 900*speed chars/min
  // = 15*speed chars/sec => interval = 1000 / (15*speed) ≈ 67ms at 1.0x
  const msPerChar = useMemo(() => Math.max(20, Math.round(1000 / (15 * ttsSpeed))), [ttsSpeed]);

  // Drive the typewriter when isTyping is true
  useEffect(() => {
    if (!isTyping) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setCharIndex((prev) => {
        if (prev >= text.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, msPerChar);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isTyping, text.length, msPerChar]);

  // When isComplete, snap to full text
  useEffect(() => {
    if (isComplete && charIndex < text.length) {
      setCharIndex(text.length);
    }
  }, [isComplete, charIndex, text.length]);

  const visibleText = text.slice(0, charIndex);
  const showCursor = isTyping && charIndex < text.length;

  return (
    <div
      style={{
        position: 'relative',
        padding: '18px 17.6px',
        background: 'transparent',
        border: '1px solid #2a2a2a',
        borderRadius: '16px',
        marginBottom: '0.4rem',
        overflow: 'hidden',
        transition: 'opacity 0.3s ease',
        opacity: visible ? 1 : 0,
      }}
    >
      {/* Top accent line */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: '8%',
          right: '8%',
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.18), transparent)',
        }}
      />

      {/* Label */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          marginBottom: '10px',
        }}
      >
        <div
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            background: '#f5f5f5',
            flexShrink: 0,
            animation: isTyping ? 'pulse-ring 1.4s ease-out infinite' : 'none',
            opacity: isTyping ? 1 : 0.4,
            transition: 'opacity 0.3s ease',
          }}
        />
        <span
          style={{
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '10px',
            fontWeight: '700',
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: isTyping ? '#cbff70' : '#9ca3af',
            transition: 'color 0.3s ease',
          }}
        >
          Interview Question
        </span>
      </div>

      {/* Question text with typewriter effect */}
      <p
        style={{
<<<<<<< HEAD
          marginTop: 0,
          marginBottom: 0,
          fontSize: '16px',
          lineHeight: 1.54,
          color: '#d7d7d7',
=======
          margin: 0,
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: 'clamp(16px, 2.2vw, 22px)',
          fontWeight: 700,
          lineHeight: 1.55,
          letterSpacing: '-0.005em',
          color: '#f0f0f5',
>>>>>>> fbab13b941243522a507bcb3b2200d8482fba810
          minHeight: '1.55em',
        }}
      >
        {visible ? visibleText : '\u00A0'}
        {showCursor && (
          <span
            style={{
              display: 'inline-block',
              width: '2px',
              height: '1em',
              background: '#cbff70',
              marginLeft: '2px',
              verticalAlign: 'text-bottom',
              animation: 'cursorBlink 0.6s step-end infinite',
            }}
          />
        )}
        {/* Invisible full text to reserve layout space */}
        <span style={{ visibility: 'hidden', position: 'absolute' }}>{text}</span>
      </p>

      <style>{`
        @keyframes cursorBlink {
          0%, 100% { opacity: 1; }
          50% { opacity: 0; }
        }
      `}</style>
    </div>
  );
}
