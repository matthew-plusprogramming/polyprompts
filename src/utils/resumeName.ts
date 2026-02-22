/**
 * Heuristic: extract candidate name from the first non-empty line of resume text.
 * Returns null if the line doesn't look like a personal name.
 */
export function extractNameFromResume(text: string): string | null {
  const lines = text.split(/\n|\r\n?/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // Skip if too long, contains numbers, emails, or URLs
    if (line.length > 40) return null;
    if (/\d/.test(line)) return null;
    if (/@/.test(line)) return null;
    if (/https?:\/\/|www\./i.test(line)) return null;

    const words = line.split(/\s+/);
    if (words.length < 2 || words.length > 4) return null;

    // Each word should start with an uppercase letter
    const allCapitalized = words.every(w => /^[A-Z]/.test(w));
    if (!allCapitalized) return null;

    return line;
  }
  return null;
}
