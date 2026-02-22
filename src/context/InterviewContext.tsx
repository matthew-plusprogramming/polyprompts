import { createContext, useContext, useReducer, useMemo, useEffect } from 'react';
import type { ReactNode, Dispatch } from 'react';
import type { InterviewState, InterviewAction, Session } from '../types';
import { createLogger, withReducerLogging } from '../utils/logger';

const log = createLogger('Context');

const STORAGE_KEY_SESSIONS = 'polyprompts-sessions';
const STORAGE_KEY_PREFS = 'polyprompts-prefs';

const initialState: InterviewState = {
  role: 'swe_intern',
  difficulty: 'medium',
  questions: [],
  currentQuestionIndex: 0,
  currentQuestion: null,
  questionResults: [],
  isRecording: false,
  liveTranscript: '',
  audioBlob: null,
  isScoring: false,
  feedbackResponse: null,
  previousAttempts: [],
  fillerCount: 0,
  wordsPerMinute: 0,
  speakingDurationSeconds: 0,
  totalDurationSeconds: 0,
  resumeData: null,
  resumeText: null,
  jobDescription: null,
  candidateName: null,
  sessionHistory: [],
  ttsVoice: 'marin',
  ttsSpeed: 1.0,
  voiceSummary: null,
};

function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.payload };
    case 'SET_QUESTION':
      return { ...state, currentQuestion: action.payload };
    case 'SET_QUESTIONS': {
      const questions = action.payload;
      return {
        ...state,
        questions,
        currentQuestionIndex: 0,
        currentQuestion: questions[0] ?? null,
        questionResults: [],
      };
    }
    case 'SAVE_QUESTION_RESULT':
      return {
        ...state,
        questionResults: [...state.questionResults, action.payload],
      };
    case 'UPDATE_QUESTION_FEEDBACK': {
      const { index, feedback } = action.payload;
      const updatedResults = [...state.questionResults];
      if (updatedResults[index]) {
        updatedResults[index] = { ...updatedResults[index], feedback };
      }
      return { ...state, questionResults: updatedResults };
    }
    case 'ADVANCE_QUESTION': {
      const nextIndex = state.currentQuestionIndex + 1;
      return {
        ...state,
        currentQuestionIndex: nextIndex,
        currentQuestion: state.questions[nextIndex] ?? null,
        // Reset per-question recording state
        isRecording: false,
        liveTranscript: '',
        audioBlob: null,
        fillerCount: 0,
        wordsPerMinute: 0,
        speakingDurationSeconds: 0,
        totalDurationSeconds: 0,
      };
    }
    case 'SET_RESUME_DATA':
      return { ...state, resumeData: action.payload };
    case 'SET_RESUME_TEXT':
      return { ...state, resumeText: action.payload };
    case 'SET_JOB_DESCRIPTION':
      return { ...state, jobDescription: action.payload };
    case 'SET_CANDIDATE_NAME':
      return { ...state, candidateName: action.payload };
    case 'START_RECORDING':
      return { ...state, isRecording: true, liveTranscript: '', audioBlob: null };
    case 'STOP_RECORDING':
      return { ...state, isRecording: false, audioBlob: action.payload };
    case 'UPDATE_TRANSCRIPT':
      return { ...state, liveTranscript: action.payload };
    case 'UPDATE_METRICS':
      return { ...state, ...action.payload };
    case 'START_SCORING':
      return { ...state, isScoring: true };
    case 'SET_FEEDBACK_RESPONSE':
      return { ...state, isScoring: false, feedbackResponse: action.payload };
    case 'SET_TOTAL_DURATION':
      return { ...state, totalDurationSeconds: action.payload };
    case 'SET_VOICE_SUMMARY':
      return { ...state, voiceSummary: action.payload };
    case 'RETRY':
      return {
        ...state,
        currentQuestionIndex: 0,
        currentQuestion: state.questions[0] ?? state.currentQuestion,
        questionResults: [],
        isRecording: false,
        liveTranscript: '',
        audioBlob: null,
        isScoring: false,
        feedbackResponse: null,
        voiceSummary: null,
        previousAttempts: state.feedbackResponse
          ? [...state.previousAttempts, state.feedbackResponse]
          : state.previousAttempts,
        fillerCount: 0,
        wordsPerMinute: 0,
        speakingDurationSeconds: 0,
        totalDurationSeconds: 0,
      };
    case 'SET_TTS_VOICE':
      return { ...state, ttsVoice: action.payload };
    case 'SET_TTS_SPEED':
      return { ...state, ttsSpeed: action.payload };
    case 'NEXT_QUESTION':
      return { ...initialState, role: state.role, difficulty: state.difficulty, resumeData: state.resumeData, resumeText: state.resumeText, jobDescription: state.jobDescription, candidateName: state.candidateName, sessionHistory: state.sessionHistory, ttsVoice: state.ttsVoice, ttsSpeed: state.ttsSpeed };
    case 'SAVE_SESSION':
      return { ...state, sessionHistory: [...state.sessionHistory, action.payload] };
    default:
      return state;
  }
}

interface InterviewContextValue {
  state: InterviewState;
  dispatch: Dispatch<InterviewAction>;
}

const InterviewContext = createContext<InterviewContextValue | null>(null);

export function InterviewProvider({ children }: { children: ReactNode }) {
  const savedSessions = useMemo<Session[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_SESSIONS);
      return stored ? (JSON.parse(stored) as Session[]) : [];
    } catch {
      return [];
    }
  }, []);

  const savedPrefs = useMemo(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY_PREFS);
      return stored ? (JSON.parse(stored) as { role?: InterviewState['role']; difficulty?: InterviewState['difficulty']; ttsVoice?: string; ttsSpeed?: number }) : {};
    } catch {
      return {};
    }
  }, []);

  const loggedReducer = useMemo(() => withReducerLogging(interviewReducer, log), []);
  const [state, dispatch] = useReducer(loggedReducer, {
    ...initialState,
    sessionHistory: savedSessions,
    ...(savedPrefs.role ? { role: savedPrefs.role } : {}),
    ...(savedPrefs.difficulty ? { difficulty: savedPrefs.difficulty } : {}),
    ...(savedPrefs.ttsVoice ? { ttsVoice: savedPrefs.ttsVoice } : {}),
    ...(savedPrefs.ttsSpeed != null ? { ttsSpeed: savedPrefs.ttsSpeed } : {}),
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(state.sessionHistory));
    log.debug('Persisted sessions', { count: state.sessionHistory.length });
  }, [state.sessionHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify({ role: state.role, difficulty: state.difficulty, ttsVoice: state.ttsVoice, ttsSpeed: state.ttsSpeed }));
    log.debug('Persisted prefs', { role: state.role, difficulty: state.difficulty });
  }, [state.role, state.difficulty, state.ttsVoice, state.ttsSpeed]);

  useEffect(() => {
    log.info('Provider mounted', { savedSessions: savedSessions.length });
  }, [savedSessions.length]);

  return (
    <InterviewContext.Provider value={{ state, dispatch }}>
      {children}
    </InterviewContext.Provider>
  );
}

export function useInterview() {
  const ctx = useContext(InterviewContext);
  if (!ctx) throw new Error('useInterview must be used within InterviewProvider');
  return ctx;
}
