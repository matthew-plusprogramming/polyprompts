import OpenAI from 'openai';
import { ScoringResult } from '../types';

const openai = new OpenAI({
  apiKey: import.meta.env.VITE_OPENAI_API_KEY,
  dangerouslyAllowBrowser: true,
});

/**
 * Score a candidate's answer against the STAR rubric.
 *
 * TODO: Implement ChatGPT scoring call
 * - Use gpt-4o with response_format: { type: "json_object" }
 * - System prompt: expert interview coach, STAR rubric, return JSON
 * - Parse response into ScoringResult
 * - See kickoff-checklist.md "Scoring API" for exact input/output contract
 */
export async function scoreAnswer(transcript: string, question: string): Promise<ScoringResult> {
  void transcript;
  void question;
  throw new Error('scoreAnswer not implemented');
}

/**
 * Convert question text to speech audio.
 *
 * TODO: Implement TTS call
 * - Use model: tts-1, voice: alloy
 * - Return audio as Blob
 * - Cache results per question in a Map<string, Blob> to avoid repeat calls
 */
export async function textToSpeech(text: string): Promise<Blob> {
  void text;
  throw new Error('textToSpeech not implemented');
}

/**
 * Transcribe recorded audio to text (authoritative transcript).
 *
 * TODO: Implement Whisper transcription call
 * - Use model: whisper-1
 * - Send as File in multipart form data
 * - Return transcript text string
 */
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  void audioBlob;
  throw new Error('transcribeAudio not implemented');
}

export default openai;
