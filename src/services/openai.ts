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

export async function textToSpeech(text: string, voice: string = 'marin', speed: number = 1.0): Promise<Blob> {
  const cacheKey = voice + ':' + speed + ':' + text;
  const cached = ttsCache.get(cacheKey);
  if (cached) {
    log.debug('TTS cache hit', { voice, speed });
    return cached;
  }

  const openai = await getClient();
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'nova' | 'shimmer' | 'echo' | 'onyx' | 'fable' | 'marin',
    input: text,
    response_format: 'mp3',
    speed: Math.max(0.25, Math.min(4.0, speed)), // OpenAI TTS supports 0.25-4.0
  });

  const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
  ttsCache.set(cacheKey, blob);
  return blob;
}

// --- TTS Prefetch ---
export function prefetchTTS(texts: string[], voice: string = 'marin', speed: number = 1.0): void {
  for (const text of texts) {
    textToSpeech(text, voice, speed).catch((err) => {
      log.warn('TTS prefetch failed', { text: text.slice(0, 40), error: String(err) });
    });
  }
}

// --- Script Response (Pre-Interview) ---
export async function generateScriptResponse(
  systemPrompt: string,
  directive: string,
  conversationContext?: string,
): Promise<string> {
  const stopTimer = log.time('generateScriptResponse');
  const openai = await getClient();
  const messages: Array<{ role: 'system' | 'user'; content: string }> = [
    { role: 'system', content: systemPrompt },
  ];
  if (conversationContext) {
    messages.push({ role: 'user', content: `[Conversation so far]: ${conversationContext}` });
  }
  messages.push({ role: 'user', content: directive });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.8,
    max_tokens: 150,
    messages,
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';
  stopTimer();
  log.info('Script response generated', { length: text.length });
  return text;
}

// --- Voice Summary (post-interview debrief) ---
export async function generateVoiceSummary(feedback: import('../types').FeedbackResponse): Promise<string> {
  const stopTimer = log.time('generateVoiceSummary');
  const openai = await getClient();
  const { overall, questions } = feedback;

  const questionSummaries = questions
    .map((q, i) => `Q${i + 1}: score ${Math.round(q.score)}% — ${q.summary}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.7,
    max_tokens: 200,
    messages: [
      {
        role: 'system',
        content: `You are Starly, a friendly interview coach giving a brief spoken debrief after a practice interview. Keep it to 2-4 sentences. Mention the overall score, one key strength, one area to improve, then encourage the user to explore the guided review and detailed breakdown below for more. Be warm but concise — this will be read aloud via TTS.`,
      },
      {
        role: 'user',
        content: `Overall score: ${Math.round(overall.score)}%\nStrengths: ${overall.what_went_well}\nAreas to improve: ${overall.needs_improvement}\n\nPer-question summaries:\n${questionSummaries}`,
      },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() ?? '';
  stopTimer();
  log.info('Voice summary generated', { length: text.length });
  return text;
}

// --- Pause Analysis ---
// Returns:
//   'definitely_done'          — auto-submit the answer (extremely high confidence)
//   'definitely_still_talking' — stay silent, don't interrupt (extremely high confidence)
//   'ask'                      — ask the user if they're finished (anything in between)
export async function analyzePause(transcript: string): Promise<'definitely_done' | 'definitely_still_talking' | 'ask'> {
  const stopTimer = log.time('analyzePause');
  log.info('analyzePause called', { transcriptLength: transcript.length });
  const openai = await getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 20,
    messages: [
      {
        role: 'system',
        content: `You analyze an interview candidate's transcript after they paused. Decide what to do next.

Return "definitely_done" if you are ~70-80% confident the candidate has finished their answer. This includes:
- The candidate explicitly signals they are finished (e.g. "I'm done", "that's it", "that's all", "that's my answer", "yeah that's about it", "I think that covers it")
- The answer has a concluding statement (wrapping up with a result, lesson learned, or summary) AND covers reasonable ground (30+ words)
- The candidate has addressed the question and their last sentence feels like a natural stopping point
- The transcript trails off after making a complete point, even without an explicit wrap-up

Return "definitely_still_talking" ONLY if you are confident the candidate is mid-thought:
- The transcript ends mid-sentence with an incomplete clause
- The last word is a conjunction or preposition (and, but, so, because, like, with, to, for, that, which)
- The transcript is very short (under 15 words) and clearly just getting started

Return "ask" when genuinely uncertain. But prefer "definitely_done" over "ask" if the answer seems substantially complete.`,
      },
      {
        role: 'user',
        content: `Transcript so far: "${transcript}"`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'pause_analysis',
        strict: true,
        schema: {
          type: 'object' as const,
          properties: {
            verdict: { type: 'string' as const, enum: ['definitely_done', 'definitely_still_talking', 'ask'] },
          },
          required: ['verdict'],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
  const verdict = parsed.verdict;
  stopTimer();
  log.info('analyzePause verdict', { verdict });
  if (verdict === 'definitely_done') return 'definitely_done';
  if (verdict === 'definitely_still_talking') return 'definitely_still_talking';
  return 'ask';
}
