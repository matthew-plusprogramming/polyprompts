import type { Difficulty, Question, Role } from '../types';
import { generateQuestion, generateResumeQuestion } from './api';
import { createLogger } from '../utils/logger';

const log = createLogger('QuestionLoader');

export interface QuestionLoadConfig {
  role: Role;
  difficulty: Difficulty;
  count: number;
  resumeText?: string;
  jobDescription?: string;
}

/* ── Similarity check ── */
const STOP_WORDS = new Set([
  'a','an','the','is','are','was','were','be','been','being',
  'have','has','had','do','does','did','will','would','could',
  'should','may','might','can','shall','to','of','in','for',
  'on','with','at','by','from','about','as','into','through',
  'during','before','after','above','below','between','out',
  'off','over','under','again','further','then','once','here',
  'there','when','where','why','how','all','each','every',
  'both','few','more','most','other','some','such','no','nor',
  'not','only','own','same','so','than','too','very','and',
  'but','or','if','while','that','this','it','its','you','your',
  'me','my','i','we','our','they','them','their','he','she',
  'him','her','his','what','which','who','whom','tell','time',
  'describe','explain','talk','share','give','example','situation',
]);

function getSignificantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
}

function questionsSimilar(a: string, b: string): boolean {
  const wordsA = getSignificantWords(a);
  const wordsB = getSignificantWords(b);
  if (wordsA.size === 0 || wordsB.size === 0) return false;

  let overlap = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) overlap++;
  }
  const smaller = Math.min(wordsA.size, wordsB.size);
  const ratio = overlap / smaller;
  log.debug('Similarity check', { overlap, smaller, ratio: ratio.toFixed(2) });
  return ratio > 0.5;
}

const MAX_REGEN_ATTEMPTS = 2;

export async function loadQuestions(config: QuestionLoadConfig): Promise<Question[]> {
  const { role, difficulty, count, resumeText, jobDescription } = config;
  const questions: Question[] = [];
  const previousQuestions: string[] = [];

  const useResume = Boolean(resumeText && jobDescription);

  // Generate questions sequentially so each call can avoid duplicates
  for (let i = 0; i < count; i++) {
    let text: string;
    let category = 'behavioral';

    if (useResume) {
      const result = await generateResumeQuestion(
        resumeText!,
        jobDescription!,
        i + 1,
        previousQuestions,
      );
      text = result.question;
      category = result.type || 'behavioral';
    } else {
      text = await generateQuestion(role, i + 1, previousQuestions, jobDescription);
    }

    // Similarity guard: if this question is too similar to a previous one, regenerate
    if (i > 0) {
      let attempts = 0;
      while (attempts < MAX_REGEN_ATTEMPTS && previousQuestions.some(prev => questionsSimilar(prev, text))) {
        log.info('Question too similar, regenerating', { attempt: attempts + 1, questionIndex: i });
        const strengthenedPrev = [...previousQuestions, text];
        if (useResume) {
          const result = await generateResumeQuestion(
            resumeText!,
            jobDescription!,
            i + 1,
            strengthenedPrev,
          );
          text = result.question;
          category = result.type || 'behavioral';
        } else {
          text = await generateQuestion(role, i + 1, strengthenedPrev, jobDescription);
        }
        attempts++;
      }
    }

    previousQuestions.push(text);
    questions.push({
      id: `ai-${Date.now()}-${i}`,
      text,
      role,
      difficulty,
      category,
    });
  }

  return questions;
}
