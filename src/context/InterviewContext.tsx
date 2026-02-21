import { createContext, useContext, useEffect, useReducer } from 'react';
import type { InterviewState, InterviewAction, ScoringResult } from '../types';
import type { ReactNode, Dispatch } from 'react';

const demoResult: ScoringResult = {
  scores: {
    situation: { level: null, explanation: null, percent: 0 },
    task: { level: null, explanation: null, percent: 0 },
    action: { level: null, explanation: null, percent: 0 },
    result: {
      level: 'Getting Started',
      explanation: 'Your outcome is mentioned, but it is not yet specific or measurable.',
      percent: 0,
    },
    communication: {
      level: 'Solid',
      explanation: 'Your ideas are clear and structured; consider tightening phrasing for more impact.',
      percent: 0,
    },
    pacing: { level: null, explanation: null, percent: 50 },
  },
  suggestions: [
    'Add one measurable outcome (number, %, or time saved).',
    'State the result in a single sentence before expanding.',
    'Mirror the question keywords to improve alignment.',
  ],
  followUp: 'What specific metric best proves the outcome you described?',
};

const USE_DEMO_RESULT = true;

const initialState: InterviewState = {
  role: 'swe_intern',
  difficulty: 'medium',
  currentQuestion: null,
  isRecording: false,
  liveTranscript: '',
  audioBlob: null,
  isScoring: false,
  currentResult: demoResult,
  previousAttempts: [],
  fillerCount: 0,
  wordsPerMinute: 0,
  speakingDurationSeconds: 0,
};

function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.payload };
    case 'SET_QUESTION':
      return { ...state, currentQuestion: action.payload };
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
    case 'SET_RESULT':
      return { ...state, isScoring: false, currentResult: action.payload };
    case 'RETRY':
      return {
        ...state,
        isRecording: false,
        liveTranscript: '',
        audioBlob: null,
        isScoring: false,
        currentResult: null,
        previousAttempts: state.currentResult
          ? [...state.previousAttempts, state.currentResult]
          : state.previousAttempts,
        fillerCount: 0,
        wordsPerMinute: 0,
        speakingDurationSeconds: 0,
      };
    case 'NEXT_QUESTION':
      return { ...initialState, role: state.role, difficulty: state.difficulty };
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
  const [state, dispatch] = useReducer(interviewReducer, initialState);

  useEffect(() => {
    if (!USE_DEMO_RESULT) return;
    if (state.currentResult) return;
    dispatch({ type: 'SET_RESULT', payload: demoResult });
  }, [state.currentResult]);

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
