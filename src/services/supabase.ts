import { createClient } from '@supabase/supabase-js';
import { Question, Session, Role, Difficulty } from '../types';

const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

/**
 * Fetch questions from the bank, filtered by role and difficulty.
 *
 * TODO: Implement Supabase query
 * - SELECT * FROM questions WHERE role = role AND difficulty = difficulty
 * - Fallback: import seededQuestions from ../data/questions and filter locally
 */
export async function getQuestions(role: Role, difficulty: Difficulty): Promise<Question[]> {
  void role;
  void difficulty;
  throw new Error('getQuestions not implemented');
}

/**
 * Save a completed interview session to Supabase.
 *
 * TODO: Implement Supabase insert
 * - INSERT INTO sessions (question_id, attempt_number, transcript, scores, duration_seconds)
 */
export async function saveSession(session: Omit<Session, 'id' | 'createdAt'>): Promise<void> {
  void session;
  throw new Error('saveSession not implemented');
}

export default supabase;
