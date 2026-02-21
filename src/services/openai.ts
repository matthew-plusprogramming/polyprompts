import type { ScoringResult } from '../types';

// Lazy-load the OpenAI SDK to avoid blocking initial page load
let _openai: import('openai').default | null = null;

async function getClient() {
  if (_openai) return _openai;
  const OpenAI = (await import('openai')).default;
  _openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });
  return _openai;
}

// --- TTS ---
const ttsCache = new Map<string, Blob>();

export async function textToSpeech(text: string): Promise<Blob> {
  const cached = ttsCache.get(text);
  if (cached) return cached;

  const openai = await getClient();
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: 'alloy',
    input: text,
    response_format: 'mp3',
  });

  const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
  ttsCache.set(text, blob);
  return blob;
}

// --- Pause Analysis ---
export async function analyzePause(transcript: string): Promise<'waiting' | 'done'> {
  const openai = await getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 10,
    messages: [
      {
        role: 'system',
        content: `You analyze interview response transcripts. The person paused speaking for 3 seconds. Based on the transcript so far, determine if they are likely still thinking or if they seem done with their answer. Respond with exactly one word: "waiting" or "done".

Rules:
- If the transcript ends mid-sentence or with a conjunction (and, but, so, because, like), say "waiting"
- If the transcript is very short (under 15 words), say "waiting"
- If the transcript is empty, say "waiting"
- If the transcript ends with a complete thought or sentence, say "done"`,
      },
      {
        role: 'user',
        content: `Transcript so far: "${transcript}"`,
      },
    ],
  });

  const answer = response.choices[0]?.message?.content?.trim().toLowerCase();
  return answer === 'done' ? 'done' : 'waiting';
}

// --- Whisper Transcription ---
export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const openai = await getClient();
  const file = new File([audioBlob], 'recording.webm', { type: audioBlob.type });
  const transcription = await openai.audio.transcriptions.create({
    model: 'whisper-1',
    file: file,
  });
  return transcription.text;
}

// --- Scoring (stub for now) ---
export async function scoreAnswer(transcript: string, question: string): Promise<ScoringResult> {
  void transcript;
  void question;
  throw new Error('scoreAnswer not implemented');
}
