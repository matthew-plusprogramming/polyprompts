export type Role = 'swe_intern' | 'pm_intern';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type ScoreLevel = 'Getting Started' | 'Developing' | 'Solid' | 'Strong';

export interface ResumeData {
  skills: string[];
  experience: string[];
  projects: string[];
  education: string;
}

export interface Question {
  id: string;
  text: string;
  role: Role;
  difficulty: Difficulty;
  category?: string;
}

export interface DimensionScore {
  level: ScoreLevel;
  explanation: string;
}

export interface ScoringResult {
  scores: {
    situation: DimensionScore;
    task: DimensionScore;
    action: DimensionScore;
    result: DimensionScore;
    communication: DimensionScore;
    pacing: DimensionScore;
  };
  suggestions: [string, string, string];
  followUp: string;
  overallSummary: string;
  strongestDimension: string;
  weakestDimension: string;
  positiveCallouts: [string, string];
}

export interface Session {
  id: string;
  questionId: string;
  attemptNumber: number;
  transcript: string;
  scores: ScoringResult;
  durationSeconds: number;
  createdAt: string;
}

export interface InterviewState {
  role: Role;
  difficulty: Difficulty;
  currentQuestion: Question | null;
  isRecording: boolean;
  liveTranscript: string;
  audioBlob: Blob | null;
  isScoring: boolean;
  currentResult: ScoringResult | null;
  previousAttempts: ScoringResult[];
  fillerCount: number;
  wordsPerMinute: number;
  speakingDurationSeconds: number;
  totalDurationSeconds: number;
  resumeData: ResumeData | null;
  sessionHistory: Session[];
  ttsVoice: string;
  ttsSpeed: number;
}

export type InterviewAction =
  | { type: 'SET_ROLE'; payload: Role }
  | { type: 'SET_DIFFICULTY'; payload: Difficulty }
  | { type: 'SET_QUESTION'; payload: Question }
  | { type: 'SET_RESUME_DATA'; payload: ResumeData }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING'; payload: Blob }
  | { type: 'UPDATE_TRANSCRIPT'; payload: string }
  | { type: 'UPDATE_METRICS'; payload: { fillerCount: number; wordsPerMinute: number; speakingDurationSeconds: number } }
  | { type: 'START_SCORING' }
  | { type: 'SET_RESULT'; payload: ScoringResult }
  | { type: 'SET_TOTAL_DURATION'; payload: number }
  | { type: 'RETRY' }
  | { type: 'NEXT_QUESTION' }
  | { type: 'SAVE_SESSION'; payload: Session }
  | { type: 'SET_TTS_VOICE'; payload: string }
  | { type: 'SET_TTS_SPEED'; payload: number };
