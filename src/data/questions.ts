import type { Question } from '../types';

export const seededQuestions: Question[] = [
  {
    id: '1',
    text: 'Tell me about a time you worked on a team to complete a project.',
    role: 'swe_intern',
    difficulty: 'easy',
    category: 'teamwork',
  },
  {
    id: '2',
    text: 'Describe a situation where you had to learn a new technology quickly to finish a task.',
    role: 'swe_intern',
    difficulty: 'easy',
    category: 'adaptability',
  },
  {
    id: '3',
    text: 'Tell me about a time you had to debug a difficult issue under a tight deadline.',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'problem-solving',
  },
  {
    id: '4',
    text: 'Describe a time you disagreed with a teammate about a technical decision. How did you handle it?',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'conflict-resolution',
  },
  {
    id: '5',
    text: 'Tell me about a time you had to influence a decision you disagreed with while working under a tight deadline and limited resources.',
    role: 'swe_intern',
    difficulty: 'hard',
    category: 'leadership',
  },
  {
    id: '6',
    text: 'Tell me about a time you had to prioritize between multiple competing stakeholder requests.',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'prioritization',
  },
  {
    id: '7',
    text: 'Describe a situation where you had to make a product decision with incomplete data.',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'decision-making',
  },
  {
    id: '8',
    text: 'Tell me about a time you identified a user need that no one else on your team had noticed.',
    role: 'pm_intern',
    difficulty: 'hard',
    category: 'user-empathy',
  },
];
