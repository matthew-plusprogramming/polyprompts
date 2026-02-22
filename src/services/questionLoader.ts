import type { Difficulty, Question, Role } from '../types';
import { generateQuestion } from './api';

export interface QuestionLoadConfig {
  role: Role;
  difficulty: Difficulty;
  count: number;
}

export async function loadQuestions(config: QuestionLoadConfig): Promise<Question[]> {
  const { role, difficulty, count } = config;
  const questions: Question[] = [];
  const previousQuestions: string[] = [];

  // Generate questions sequentially so each call can avoid duplicates
  for (let i = 0; i < count; i++) {
    const text = await generateQuestion(role, i + 1, previousQuestions);
    previousQuestions.push(text);
    questions.push({
      id: `ai-${Date.now()}-${i}`,
      text,
      role,
      difficulty,
      category: 'behavioral',
    });
  }

  return questions;
}
