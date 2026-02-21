import type { Question } from '../types';

export const seededQuestions: Question[] = [
  // --- Existing questions (unchanged) ---
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

  // --- New SWE Intern questions ---

  // Easy
  {
    id: '9',
    text: 'Tell me about a time you had to communicate a complex technical concept to someone without a technical background.',
    role: 'swe_intern',
    difficulty: 'easy',
    category: 'communication',
  },
  {
    id: '10',
    text: 'Describe a situation where plans changed unexpectedly mid-project. How did you adjust?',
    role: 'swe_intern',
    difficulty: 'easy',
    category: 'adaptability',
  },
  {
    id: '11',
    text: 'Tell me about a time a teammate was struggling. How did you support them?',
    role: 'swe_intern',
    difficulty: 'easy',
    category: 'teamwork',
  },

  // Medium
  {
    id: '12',
    text: 'Describe a time you received critical feedback on your code during a review. How did you respond?',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'communication',
  },
  {
    id: '13',
    text: 'Tell me about a time you had to choose between two valid technical approaches with real tradeoffs. How did you decide?',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'technical-decision',
  },
  {
    id: '14',
    text: 'Describe a situation where you found and fixed a bug that had been overlooked by others. Walk me through your process.',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'problem-solving',
  },
  {
    id: '15',
    text: 'Tell me about a time you had a disagreement with a teammate about code quality or best practices. What happened?',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'conflict-resolution',
  },
  {
    id: '16',
    text: 'Describe a time you took the initiative to improve a process or codebase that was not part of your assigned work.',
    role: 'swe_intern',
    difficulty: 'medium',
    category: 'initiative',
  },

  // Hard
  {
    id: '17',
    text: 'Tell me about a time you had to make a significant system design decision with incomplete information. What was your approach and what would you do differently now?',
    role: 'swe_intern',
    difficulty: 'hard',
    category: 'technical-decision',
  },
  {
    id: '18',
    text: 'Describe a project or feature that failed or was cancelled after you had already invested significant effort. How did you handle it and what did you learn?',
    role: 'swe_intern',
    difficulty: 'hard',
    category: 'failure',
  },
  {
    id: '19',
    text: 'Tell me about a time you had to rally a team around a technical direction when there was significant skepticism or resistance.',
    role: 'swe_intern',
    difficulty: 'hard',
    category: 'leadership',
  },
  {
    id: '20',
    text: 'Describe a situation where you identified a systemic problem—not just a one-off bug—and drove a longer-term fix. How did you build support for it?',
    role: 'swe_intern',
    difficulty: 'hard',
    category: 'initiative',
  },

  // --- New PM Intern questions ---

  // Easy
  {
    id: '21',
    text: 'Tell me about a time you worked closely with engineers or designers to ship something. What was your role?',
    role: 'pm_intern',
    difficulty: 'easy',
    category: 'teamwork',
  },
  {
    id: '22',
    text: 'Describe a time you had to explain a product decision to someone who disagreed with it. How did you approach the conversation?',
    role: 'pm_intern',
    difficulty: 'easy',
    category: 'communication',
  },
  {
    id: '23',
    text: 'Tell me about a time you had to quickly adjust your plan because something higher priority came up.',
    role: 'pm_intern',
    difficulty: 'easy',
    category: 'adaptability',
  },

  // Medium
  {
    id: '24',
    text: 'Describe a time you had to say no to a feature request from a stakeholder. How did you handle it?',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'prioritization',
  },
  {
    id: '25',
    text: 'Tell me about a time you had to align two stakeholders with conflicting opinions about product direction. What did you do?',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'conflict-resolution',
  },
  {
    id: '26',
    text: 'Describe a situation where you used data or metrics to change how your team was thinking about a problem.',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'decision-making',
  },
  {
    id: '27',
    text: 'Tell me about a time you defined success metrics for a feature or project. How did you choose what to measure?',
    role: 'pm_intern',
    difficulty: 'medium',
    category: 'decision-making',
  },

  // Hard
  {
    id: '28',
    text: 'Describe a time you had to make a major product call in a situation that was deeply ambiguous—where the right answer was genuinely unclear. How did you move forward?',
    role: 'pm_intern',
    difficulty: 'hard',
    category: 'ambiguity',
  },
  {
    id: '29',
    text: 'Tell me about a time you discovered that your team was solving the wrong problem. How did you recognize it, and what did you do about it?',
    role: 'pm_intern',
    difficulty: 'hard',
    category: 'user-empathy',
  },
  {
    id: '30',
    text: 'Describe a situation where you had to advocate for a long-term strategic investment that conflicted with short-term business pressures. How did you build the case?',
    role: 'pm_intern',
    difficulty: 'hard',
    category: 'prioritization',
  },
];

export const categoryDescriptions: Record<string, string> = {
  'teamwork': 'Working effectively with others toward shared goals',
  'adaptability': 'Adjusting to new situations and learning quickly',
  'problem-solving': 'Analyzing challenges and finding effective solutions',
  'conflict-resolution': 'Navigating disagreements and finding common ground',
  'leadership': 'Guiding others and taking initiative on projects',
  'prioritization': 'Managing competing demands and making tradeoffs',
  'decision-making': 'Making sound choices with available information',
  'user-empathy': 'Understanding and advocating for user needs',
  'failure': 'Learning and growing from setbacks',
  'communication': 'Conveying ideas clearly and listening effectively',
  'technical-decision': 'Making informed technology and architecture choices',
  'initiative': 'Proactively identifying and acting on opportunities',
  'ambiguity': 'Operating effectively with unclear or incomplete information',
};

export const difficultyDescriptions: Record<string, string> = {
  'easy': 'Straightforward prompts about common experiences',
  'medium': 'Nuanced scenarios requiring structured thinking',
  'hard': 'Complex situations with constraints and tradeoffs',
};
