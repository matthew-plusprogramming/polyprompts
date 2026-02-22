import React, { useState, useRef, useEffect, useMemo } from 'react';

interface TranscriptReviewProps {
  transcript: string;
  question: string;
  audioBlob?: Blob | null;
  highlights?: { positive: string[]; negative: string[] };
}

function highlightTranscript(
  text: string,
  highlights?: { positive: string[]; negative: string[] },
): React.ReactNode {
  if (!highlights || (highlights.positive.length === 0 && highlights.negative.length === 0)) {
    return text;
  }

  // Build list of phrases with their type
  const allPhrases = [
    ...highlights.positive.map(p => ({ text: p, type: 'positive' as const })),
    ...highlights.negative.map(p => ({ text: p, type: 'negative' as const })),
  ];

  // Sort by length (longest first) to avoid partial matches
  allPhrases.sort((a, b) => b.text.length - a.text.length);

  // Filter out empty phrases
  const validPhrases = allPhrases.filter(p => p.text.trim().length > 0);
  if (validPhrases.length === 0) return text;

  // Escape regex special chars
  const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const pattern = validPhrases.map(p => `(${escapeRegex(p.text)})`).join('|');
  const regex = new RegExp(pattern, 'gi');

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = regex.exec(text)) !== null) {
    // Add text before match
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // Determine type
    const matchedText = match[0];
    const phraseInfo = validPhrases.find(
      p => p.text.toLowerCase() === matchedText.toLowerCase(),
    );
    const isPositive = phraseInfo?.type === 'positive';

    parts.push(
      <span
        key={key++}
        style={{
          background: isPositive ? 'rgba(34, 197, 94, 0.15)' : 'rgba(245, 158, 11, 0.15)',
          borderBottom: `2px solid ${isPositive ? '#22c55e' : '#f59e0b'}`,
          borderRadius: '2px',
          padding: '1px 2px',
        }}
      >
        {matchedText}
      </span>,
    );

    lastIndex = match.index + matchedText.length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts;
}

function TranscriptReview({
  transcript,
  question,
  audioBlob,
  highlights,
}: TranscriptReviewProps) {
  const wordCount = transcript.trim() === '' ? 0 : transcript.trim().split(/\s+/).length;

  // Memoize highlighted transcript to avoid re-running regex on every render
  const highlightedContent = useMemo(
    () => highlightTranscript(transcript, highlights),
    [transcript, highlights],
  );

  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);

  const handlePlay = () => {
    if (!audioBlob) return;

    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPlaying(false);
      return;
    }

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(audioBlob);

    const audio = new Audio(urlRef.current);
    audioRef.current = audio;
    audio.onended = () => setIsPlaying(false);
    audio.play();
    setIsPlaying(true);
  };

  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  const hasHighlights =
    highlights &&
    (highlights.positive.length > 0 || highlights.negative.length > 0);

  return (
    <div
      style={{
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '16px',
        padding: '20px 22px',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
        }}
      >
        <h3
          style={{
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '13px',
            fontWeight: 700,
            letterSpacing: '0.07em',
            textTransform: 'uppercase',
            color: '#94a3b8',
            margin: 0,
          }}
        >
          Your Response
        </h3>
        {audioBlob && (
          <button
            onClick={handlePlay}
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '12px',
              fontWeight: 500,
              color: isPlaying ? '#f1f5f9' : '#818cf8',
              background: isPlaying ? 'rgba(99,102,241,0.22)' : 'rgba(99,102,241,0.08)',
              border: '1px solid rgba(99,102,241,0.35)',
              borderRadius: '8px',
              padding: '5px 12px',
              cursor: 'pointer',
              transition: 'all 0.18s ease',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              flexShrink: 0,
            }}
          >
            {isPlaying ? '⏸ Pause' : '▶ Play Recording'}
          </button>
        )}
      </div>

      {/* Question context */}
      <p
        style={{
          fontFamily: "'Josefin Sans', sans-serif",
          fontSize: '12px',
          color: 'rgba(148,163,184,0.5)',
          margin: '0 0 14px',
          lineHeight: 1.5,
          fontStyle: 'italic',
          borderLeft: '2px solid rgba(99,102,241,0.3)',
          paddingLeft: '10px',
        }}
      >
        {question}
      </p>

      {/* Divider */}
      <div
        style={{
          height: '1px',
          background: 'rgba(255,255,255,0.06)',
          marginBottom: '14px',
        }}
      />

      {/* Transcript body */}
      <div
        style={{
          maxHeight: '220px',
          overflowY: 'auto',
          scrollbarWidth: 'thin',
          scrollbarColor: 'rgba(99,102,241,0.3) transparent',
        }}
      >
        {transcript.trim() === '' ? (
          <p
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '14px',
              color: 'rgba(148,163,184,0.35)',
              margin: 0,
              fontStyle: 'italic',
            }}
          >
            No transcript captured.
          </p>
        ) : (
          <p
            style={{
              fontFamily: "'Josefin Sans', sans-serif",
              fontSize: '14px',
              color: 'rgba(226,232,240,0.82)',
              margin: 0,
              lineHeight: 1.75,
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
            }}
          >
            {highlightedContent}
          </p>
        )}
      </div>

      {/* Footer: word count + legend */}
      <div
        style={{
          marginTop: '14px',
          paddingTop: '12px',
          borderTop: '1px solid rgba(255,255,255,0.05)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <span
          style={{
            fontFamily: "'Josefin Sans', sans-serif",
            fontSize: '11px',
            color: 'rgba(148,163,184,0.4)',
            letterSpacing: '0.04em',
          }}
        >
          {wordCount} {wordCount === 1 ? 'word' : 'words'}
        </span>

        {hasHighlights && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '11px',
                color: 'rgba(148,163,184,0.55)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '10px',
                  background: 'rgba(34, 197, 94, 0.15)',
                  borderBottom: '2px solid #22c55e',
                  borderRadius: '2px',
                  flexShrink: 0,
                }}
              />
              Strength
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
                fontFamily: "'Josefin Sans', sans-serif",
                fontSize: '11px',
                color: 'rgba(148,163,184,0.55)',
              }}
            >
              <span
                style={{
                  display: 'inline-block',
                  width: '20px',
                  height: '10px',
                  background: 'rgba(245, 158, 11, 0.15)',
                  borderBottom: '2px solid #f59e0b',
                  borderRadius: '2px',
                  flexShrink: 0,
                }}
              />
              Area for improvement
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default React.memo(TranscriptReview);
