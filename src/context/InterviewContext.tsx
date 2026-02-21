import { createContext, useContext, useReducer, useMemo, useEffect } from 'react';
import type { ReactNode, Dispatch } from 'react';
import type { InterviewState, InterviewAction, Session } from '../types';

const STORAGE_KEY_SESSIONS = 'polyprompts-sessions';
const STORAGE_KEY_PREFS = 'polyprompts-prefs';

const initialState: InterviewState = {
  role: 'swe_intern',
  difficulty: 'medium',
  currentQuestion: null,
  isRecording: false,
  liveTranscript: '',
  audioBlob: null,
  isScoring: false,
  currentResult: null,
  previousAttempts: [],
  fillerCount: 0,
  wordsPerMinute: 0,
  speakingDurationSeconds: 0,
  totalDurationSeconds: 0,
  resumeData: null,
  sessionHistory: [],
  ttsVoice: 'alloy',
  ttsSpeed: 1.0,
};

function interviewReducer(state: InterviewState, action: InterviewAction): InterviewState {
  switch (action.type) {
    case 'SET_ROLE':
      return { ...state, role: action.payload };
    case 'SET_DIFFICULTY':
      return { ...state, difficulty: action.payload };
    case 'SET_QUESTION':
      return { ...state, currentQuestion: action.payload };
    case 'SET_RESUME_DATA':
      return { ...state, resumeData: action.payload };
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
    case 'SET_TOTAL_DURATION':
      return { ...state, totalDurationSeconds: action.payload };
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
        totalDurationSeconds: 0,
      };
    case 'SET_TTS_VOICE':
      return { ...state, ttsVoice: action.payload };
    case 'SET_TTS_SPEED':
      return { ...state, ttsSpeed: action.payload };
    case 'NEXT_QUESTION':
      return { ...initialState, role: state.role, difficulty: state.difficulty, resumeData: state.resumeData, sessionHistory: state.sessionHistory, ttsVoice: state.ttsVoice, ttsSpeed: state.ttsSpeed };
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

  const [state, dispatch] = useReducer(interviewReducer, {
    ...initialState,
    sessionHistory: savedSessions,
    ...(savedPrefs.role ? { role: savedPrefs.role } : {}),
    ...(savedPrefs.difficulty ? { difficulty: savedPrefs.difficulty } : {}),
    ...(savedPrefs.ttsVoice ? { ttsVoice: savedPrefs.ttsVoice } : {}),
    ...(savedPrefs.ttsSpeed != null ? { ttsSpeed: savedPrefs.ttsSpeed } : {}),
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(state.sessionHistory));
  }, [state.sessionHistory]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY_PREFS, JSON.stringify({ role: state.role, difficulty: state.difficulty, ttsVoice: state.ttsVoice, ttsSpeed: state.ttsSpeed }));
  }, [state.role, state.difficulty, state.ttsVoice, state.ttsSpeed]);

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
