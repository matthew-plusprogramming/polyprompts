import { createLogger } from '../utils/logger';

const log = createLogger('OpenAI');

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

export async function textToSpeech(text: string, voice: string = 'marin', speed: number = 1.0, instructions?: string): Promise<Blob> {
  const cacheKey = voice + ':' + speed + ':' + (instructions ?? '') + ':' + text;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    log.debug('TTS cache hit', { voice, speed });
    return cached;
  }

  const openai = await getClient();
  const response = await openai.audio.speech.create({
    model: 'gpt-4o-mini-tts-2025-12-15',
    voice: voice as 'alloy' | 'nova' | 'shimmer' | 'echo' | 'onyx' | 'fable' | 'marin',
    input: text,
    instructions: instructions ?? 'Casual American female voice. Relaxed, steady pacing with natural micro-pauses between phrases. Slight upward inflection when asking questions. No vocal fry. Do not sound like a narrator or announcer — sound like a real person talking across a table.',
    response_format: 'mp3',
    speed: Math.max(0.25, Math.min(4.0, speed)), // OpenAI TTS supports 0.25-4.0
  });

  const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
  ttsCache.set(cacheKey, blob);
  return blob;
}

// --- TTS Prefetch ---
export function prefetchTTS(texts: string[], voice: string = 'marin', speed: number = 1.0, instructions?: string): void {
  for (const text of texts) {
    textToSpeech(text, voice, speed, instructions).catch((err) => {
      log.warn('TTS prefetch failed', { text: text.slice(0, 40), error: String(err) });
    });
  }
}

// --- Script Response (Pre-Interview) --- via Groq serverless
export async function generateScriptResponse(
  systemPrompt: string,
  directive: string,
  conversationContext?: string,
): Promise<string> {
  const stopTimer = log.time('generateScriptResponse');

  const response = await fetch('/api/script', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemPrompt, directive, conversationContext }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Script generation failed');
  }

  const data = await response.json();
  const text = data.text ?? '';
  stopTimer();
  log.info('Script response generated', { length: text.length });
  return text;
}

// --- Voice Summary (post-interview debrief) --- via Groq serverless
export async function generateVoiceSummary(feedback: import('../types').FeedbackResponse): Promise<string> {
  const stopTimer = log.time('generateVoiceSummary');

  const response = await fetch('/api/voice-summary', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ overall: feedback.overall, questions: feedback.questions }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Voice summary failed');
  }

  const data = await response.json();
  const text = data.text ?? '';
  stopTimer();
  log.info('Voice summary generated', { length: text.length });
  return text;
}

// --- Pause Analysis --- via Groq serverless
// Returns:
//   'definitely_done'          — auto-submit the answer (extremely high confidence)
//   'definitely_still_talking' — stay silent, don't interrupt (extremely high confidence)
//   'ask'                      — ask the user if they're finished (anything in between)
export async function analyzePause(transcript: string): Promise<'definitely_done' | 'definitely_still_talking' | 'ask'> {
  const stopTimer = log.time('analyzePause');
  log.info('analyzePause called', { transcriptLength: transcript.length });

  const response = await fetch('/api/pause', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Pause analysis failed');
  }

  const data = await response.json();
  const verdict = data.verdict;
  stopTimer();
  log.info('analyzePause verdict', { verdict });
  if (verdict === 'definitely_done') return 'definitely_done';
  if (verdict === 'definitely_still_talking') return 'definitely_still_talking';
  return 'ask';
}
