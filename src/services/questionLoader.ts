import type { Difficulty, Question, Role } from '../types';
import { generateQuestion, generateResumeQuestion } from './api';

export interface QuestionLoadConfig {
  role: Role;
  difficulty: Difficulty;
  count: number;
  resumeText?: string;
  jobDescription?: string;
}

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
      text = await generateQuestion(role, i + 1, previousQuestions);
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
