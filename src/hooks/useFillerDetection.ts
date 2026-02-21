const FILLERS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'so yeah'];

export function countFillers(transcript: string): number {
  const lower = transcript.toLowerCase();
  return FILLERS.reduce((count, filler) => {
    const regex = new RegExp(`\\b${filler}\\b`, 'g');
    return count + (lower.match(regex)?.length ?? 0);
  }, 0);
}

export function useFillerDetection(transcript: string) {
  return { fillerCount: countFillers(transcript), fillers: FILLERS };
}
