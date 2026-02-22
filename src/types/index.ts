export type { FaceMetrics } from './faceDetection';

export interface TimestampedWord {
  word: string;
  start: number; // seconds
  end: number;   // seconds
}

export type Role = 'swe_intern' | 'pm_intern';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface ResumeData {
  skills: string[];
  experience: string[];
  projects: string[];
  education: string;
}

export interface ResumeQuestionMeta {
  question: string;
  type: string;
  focus: string;
}

export interface Question {
  id: string;
  text: string;
  role: Role;
  difficulty: Difficulty;
  category?: string;
}

// --- Feedback types (numeric 0-100 scoring) ---

export interface QuestionFeedback {
  score: number;  // avg of 6 categories, 0-100
  best_part_quote: string;
  best_part_explanation: string;
  worst_part_quote: string;
  worst_part_explanation: string;
  what_went_well: string;
  needs_improvement: string;
  summary: string;
  confidence_score: number | null;
}

export interface OverallFeedback {
  score: number;
  response_organization: number;
  technical_knowledge: number;
  problem_solving: number;
  position_application: number;
  timing: number;
  personability: number;
  what_went_well: string;
  needs_improvement: string;
  summary: string;
  confidence_score?: number;
}

export interface FeedbackResponse {
  questions: QuestionFeedback[];
  overall: OverallFeedback;
}

export interface FactCheckResult {
  is_correct: boolean;
  result: string;
  explanation: string;
}

export interface QuestionResult {
  question: Question;
  transcript: string;
  audioBlob?: Blob;
  videoBlob?: Blob;
  feedback: QuestionFeedback | null;
  wordTimestamps?: TimestampedWord[];
  metrics: {
    fillerCount: number;
    wordsPerMinute: number;
    speakingDurationSeconds: number;
    faceMetrics?: import('./faceDetection').FaceMetrics;
  };
}

export interface Session {
  id: string;
  questionId: string;
  attemptNumber: number;
  transcript: string;
  scores: FeedbackResponse;
  durationSeconds: number;
  createdAt: string;
}

export interface InterviewState {
  role: Role;
  difficulty: Difficulty;
  questions: Question[];
  currentQuestionIndex: number;
  currentQuestion: Question | null;  // derived: questions[currentQuestionIndex]
  questionResults: QuestionResult[];
  isRecording: boolean;
  liveTranscript: string;
  audioBlob: Blob | null;
  isScoring: boolean;
  feedbackResponse: FeedbackResponse | null;
  previousAttempts: FeedbackResponse[];
  fillerCount: number;
  wordsPerMinute: number;
  speakingDurationSeconds: number;
  totalDurationSeconds: number;
  resumeData: ResumeData | null;
  resumeText: string | null;
  jobDescription: string | null;
  sessionHistory: Session[];
  ttsVoice: string;
  ttsSpeed: number;
  voiceSummary: string | null;
}

export type InterviewAction =
  | { type: 'SET_ROLE'; payload: Role }
  | { type: 'SET_DIFFICULTY'; payload: Difficulty }
  | { type: 'SET_QUESTION'; payload: Question }
  | { type: 'SET_QUESTIONS'; payload: Question[] }
  | { type: 'SAVE_QUESTION_RESULT'; payload: QuestionResult }
  | { type: 'UPDATE_QUESTION_FEEDBACK'; payload: { index: number; feedback: QuestionFeedback } }
  | { type: 'ADVANCE_QUESTION' }
  | { type: 'SET_RESUME_DATA'; payload: ResumeData }
  | { type: 'SET_RESUME_TEXT'; payload: string }
  | { type: 'SET_JOB_DESCRIPTION'; payload: string }
  | { type: 'START_RECORDING' }
  | { type: 'STOP_RECORDING'; payload: Blob }
  | { type: 'UPDATE_TRANSCRIPT'; payload: string }
  | { type: 'UPDATE_METRICS'; payload: { fillerCount: number; wordsPerMinute: number; speakingDurationSeconds: number } }
  | { type: 'START_SCORING' }
  | { type: 'SET_FEEDBACK_RESPONSE'; payload: FeedbackResponse }
  | { type: 'SET_TOTAL_DURATION'; payload: number }
  | { type: 'RETRY' }
  | { type: 'NEXT_QUESTION' }
  | { type: 'SAVE_SESSION'; payload: Session }
  | { type: 'SET_TTS_VOICE'; payload: string }
  | { type: 'SET_TTS_SPEED'; payload: number }
  | { type: 'SET_VOICE_SUMMARY'; payload: string };
