/** Normalize text: lowercase, strip punctuation, collapse whitespace */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Levenshtein distance between two strings */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)),
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/** Similarity between two strings (0-1) */
function similarity(a: string, b: string): number {
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

/**
 * Check if a trigger phrase (or any of its aliases) fuzzy-matches within a transcript segment.
 * Uses token-level matching with a sliding window.
 *
 * @param trigger - primary trigger phrase
 * @param aliases - alternative phrasings
 * @param transcript - the transcript text to search (should be only NEW text since last match)
 * @param threshold - minimum average similarity (0-1), default 0.7
 */
export function fuzzyMatchTrigger(
  trigger: string,
  aliases: string[],
  transcript: string,
  threshold: number = 0.7,
): boolean {
  const phrases = [trigger, ...aliases];
  const normalizedTranscript = normalize(transcript);
  const transcriptWords = normalizedTranscript.split(' ').filter(Boolean);

  for (const phrase of phrases) {
    const phraseWords = normalize(phrase).split(' ').filter(Boolean);
    if (phraseWords.length === 0) continue;

    // Sliding window across transcript words
    const windowSize = phraseWords.length;
    for (let i = 0; i <= transcriptWords.length - windowSize; i++) {
      let totalSim = 0;
      for (let j = 0; j < windowSize; j++) {
        // Find best match for this trigger word in the window position
        totalSim += similarity(phraseWords[j], transcriptWords[i + j]);
      }
      const avgSim = totalSim / windowSize;
      if (avgSim >= threshold) return true;
    }

    // Also check single-word triggers against individual transcript words
    if (phraseWords.length === 1) {
      for (const word of transcriptWords) {
        if (similarity(phraseWords[0], word) >= threshold) return true;
      }
    }
  }

  return false;
}
