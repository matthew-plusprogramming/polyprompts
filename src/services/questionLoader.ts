import type { Difficulty, Question, Role } from '../types';
import type { ResumeData } from './openai';
import { generateResumeQuestion } from './openai';
import { seededQuestions } from '../data/questions';

export interface QuestionLoadConfig {
  role: Role;
  difficulty: Difficulty;
  category?: string;
  resumeData?: ResumeData | null;
  count: number;
  exclude?: string[];
}

function shuffleArray<T>(arr: T[]): T[] {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export async function loadQuestions(config: QuestionLoadConfig): Promise<Question[]> {
  const { role, difficulty, category, resumeData, count, exclude = [] } = config;

  if (resumeData) {
    // Resume path: generate questions via API in parallel
    const promises = Array.from({ length: count }, () =>
      generateResumeQuestion(resumeData, role, difficulty, category)
    );
    const results = await Promise.all(promises);
    return results.map((result, i) => ({
      id: `resume-${Date.now()}-${i}`,
      text: result.text,
      role,
      difficulty,
      category: result.category,
    }));
  }

  // Seeded path: filter, shuffle, pick unique
  const excludeSet = new Set(exclude);
  const matching = seededQuestions.filter(
    (q) => q.role === role && q.difficulty === difficulty && !excludeSet.has(q.id)
  );

  const categoryFiltered =
    !category || category === 'random'
      ? matching
      : matching.filter((q) => {
          const qcat = (q.category ?? '').toLowerCase();
          if (category === 'teamwork') return qcat.includes('team');
          if (category === 'leadership') return qcat.includes('leader') || qcat.includes('priorit');
          if (category === 'conflict') return qcat.includes('conflict') || qcat.includes('disagree');
          if (category === 'failure') return qcat.includes('mistake') || qcat.includes('fail');
          return true;
        });

  const pool = categoryFiltered.length > 0 ? categoryFiltered : matching;
  const shuffled = shuffleArray(pool);
  return shuffled.slice(0, count);
}
