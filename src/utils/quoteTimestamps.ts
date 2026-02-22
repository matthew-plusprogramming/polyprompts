import type { TimestampedWord } from '../types';

export interface TimeRange {
  start: number;
  end: number;
}

/**
 * Compute LCS (longest common subsequence) length between two string arrays.
 */
function lcsLength(a: string[], b: string[]): number {
  const m = a.length;
  const n = b.length;
  // Use 1D DP (only need previous row)
  let prev = new Array<number>(n + 1).fill(0);
  let curr = new Array<number>(n + 1).fill(0);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        curr[j] = prev[j - 1] + 1;
      } else {
        curr[j] = Math.max(prev[j], curr[j - 1]);
      }
    }
    [prev, curr] = [curr, prev];
    curr.fill(0);
  }
  return prev[n];
}

/**
 * Normalize a word for matching: lowercase, strip leading/trailing punctuation.
 */
function normalize(w: string): string {
  return w.toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/**
 * Find the time range in `words` that best matches `quote` using sliding-window LCS.
 *
 * Returns the { start, end } timestamps of the best match, or null if
 * no sufficiently good match is found (score < 0.45).
 */
export function findQuoteTimeRange(
  quote: string,
  words: TimestampedWord[],
): TimeRange | null {
  if (!quote || words.length === 0) return null;

  const quoteTokens = quote
    .split(/\s+/)
    .map(normalize)
    .filter(Boolean);

  if (quoteTokens.length === 0) return null;

  const wordTokens = words.map((w) => normalize(w.word)).map((w) => w || '');

  const qLen = quoteTokens.length;
  const minWindow = Math.max(1, Math.floor(qLen * 0.6));
  const maxWindow = Math.min(words.length, Math.ceil(qLen * 1.5));

  let bestScore = 0;
  let bestStart = -1;
  let bestEnd = -1;

  for (let winSize = minWindow; winSize <= maxWindow; winSize++) {
    for (let i = 0; i <= wordTokens.length - winSize; i++) {
      const windowTokens = wordTokens.slice(i, i + winSize);
      const lcs = lcsLength(quoteTokens, windowTokens);
      const avgLen = (qLen + winSize) / 2;
      const score = lcs / avgLen;

      if (score > bestScore) {
        bestScore = score;
        bestStart = i;
        bestEnd = i + winSize - 1;
      }
    }
  }

  if (bestScore < 0.45 || bestStart < 0) return null;

  return {
    start: words[bestStart].start,
    end: words[bestEnd].end,
  };
}
