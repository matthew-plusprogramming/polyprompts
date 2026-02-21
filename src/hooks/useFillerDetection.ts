import { createLogger } from '../utils/logger';

const log = createLogger('FillerDetection');

const FILLERS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'so yeah'];

export function countFillers(transcript: string): number {
  const lower = transcript.toLowerCase();
  return FILLERS.reduce((count, filler) => {
    const regex = new RegExp(`\\b${filler}\\b`, 'g');
    return count + (lower.match(regex)?.length ?? 0);
  }, 0);
}

export function useFillerDetection(transcript: string) {
  const fillerCount = countFillers(transcript);
  if (fillerCount > 0) {
    log.debug('Fillers detected', { fillerCount });
  }
  return { fillerCount, fillers: FILLERS };
}
