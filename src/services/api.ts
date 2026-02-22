import type { FeedbackResponse, FactCheckResult } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('API');

export async function generateQuestion(
  role: string,
  questionNumber: number,
  previousQuestions: string[],
): Promise<string> {
  const stopTimer = log.time('generateQuestion');
  const res = await fetch('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, questionNumber, previousQuestions }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Question generation failed (${res.status})`);
  }

  const data = await res.json();
  stopTimer();
  return data.question;
}

export async function getFeedback(
  questions: string[],
  answers: string[],
): Promise<FeedbackResponse> {
  const stopTimer = log.time('getFeedback');
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ questions, answers }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Feedback failed (${res.status})`);
  }

  const data: FeedbackResponse = await res.json();
  stopTimer();
  return data;
}

export async function factCheck(
  question: string,
  answer: string,
  correction: string,
): Promise<FactCheckResult> {
  const stopTimer = log.time('factCheck');
  const res = await fetch('/api/factcheck', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question, answer, correction }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Factcheck failed (${res.status})`);
  }

  const data: FactCheckResult = await res.json();
  stopTimer();
  return data;
}
