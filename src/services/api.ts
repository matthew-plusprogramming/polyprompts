import type { FeedbackResponse, FactCheckResult } from '../types';
import { createLogger } from '../utils/logger';

const log = createLogger('API');

export async function generateQuestion(
  role: string,
  questionNumber: number,
  previousQuestions: string[],
  jobDescription?: string,
): Promise<string> {
  const stopTimer = log.time('generateQuestion');
  const res = await fetch('/api/question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role, questionNumber, previousQuestions, ...(jobDescription ? { jobDescription } : {}) }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Question generation failed (${res.status})`);
  }

  const data = await res.json();
  stopTimer();
  return data.question;
}

export async function generateResumeQuestion(
  resumeText: string,
  jobDescription: string,
  questionNumber: number,
  previousQuestions: string[],
  candidateName?: string,
): Promise<{ question: string; type: string; focus: string }> {
  const stopTimer = log.time('generateResumeQuestion');
  const res = await fetch('/api/resume-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ resumeText, jobDescription, questionNumber, previousQuestions, ...(candidateName ? { candidateName } : {}) }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Resume question generation failed (${res.status})`);
  }

  const data = await res.json();
  stopTimer();
  return data;
}

export async function generateJobDescQuestion(
  jobDescription: string,
  questionNumber: number,
  previousQuestions: string[],
  resumeText?: string,
  candidateName?: string,
): Promise<{ question: string; type: string; focus: string }> {
  const stopTimer = log.time('generateJobDescQuestion');
  const res = await fetch('/api/jobdesc-question', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jobDescription,
      questionNumber,
      previousQuestions,
      ...(resumeText ? { resumeText } : {}),
      ...(candidateName ? { candidateName } : {}),
    }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(err.error || `Job description question generation failed (${res.status})`);
  }

  const data = await res.json();
  stopTimer();
  return data;
}

export async function getFeedback(
  questions: string[],
  answers: string[],
  opts?: { resumeText?: string; jobDescription?: string },
): Promise<FeedbackResponse> {
  const stopTimer = log.time('getFeedback');
  const res = await fetch('/api/feedback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      questions,
      answers,
      ...(opts?.resumeText ? { resumeText: opts.resumeText } : {}),
      ...(opts?.jobDescription ? { jobDescription: opts.jobDescription } : {}),
    }),
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
