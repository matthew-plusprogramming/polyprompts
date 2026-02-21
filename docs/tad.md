# Technical Architecture Document

---

## 1\. Technology Stack

### Frontend

- **React** — The team has the most experience here. Component model maps well to the distinct screens in our flow (setup, interview, feedback). Large ecosystem means we won't get stuck on niche problems during a 48-hour hackathon.
- **Vite** — Near-instant dev server startup and hot reload. In a hackathon, fast iteration cycles matter more than almost anything else.

### Backend / Infrastructure

- **Express (Node.js + TypeScript)** — Lightweight proxy server that sits between the frontend and OpenAI. Its only job is to keep API keys off the client and forward requests. Express is the fastest thing to stand up for a hackathon — the team already knows it, and the framework overhead is negligible compared to the 2-8 second OpenAI round trips behind it.
- **Supabase** — Gives us Postgres, auth, and real-time subscriptions out of the box. We still call Supabase directly from the frontend (the anon key is designed to be public), but all OpenAI traffic routes through the Express proxy.

### AI / ML Services

- **OpenAI ChatGPT API** — Single provider for the core intelligence: generating interview questions, scoring answers against our STAR rubric, producing coaching feedback, and crafting follow-up questions. Using one provider keeps our integration surface small and our API key management simple.
- **Deepgram (nova-2)** — Real-time streaming speech-to-text via WebSocket. Provides high-accuracy transcription with built-in filler word detection (`smart_format`, `filler_words`). Eliminates the post-recording Whisper latency by building the transcript incrementally as the user speaks.
- **OpenAI TTS** — Makes the interviewer feel like a person, not a text box. Staying within the OpenAI ecosystem means one SDK and one set of API patterns across LLM, STT, and TTS.

### Browser APIs

- **MediaRecorder API** — Native browser audio capture with no dependencies. Gives us audio blobs we can send directly to Whisper. No need for a third-party recording library or WebRTC server — keeps the stack thin for a hackathon.

---

## 2\. System Architecture Overview

The system is a client-heavy single-page app with a thin Express proxy that secures API keys and forwards all OpenAI traffic. The frontend never talks to OpenAI directly — every AI call (ChatGPT, Whisper, TTS) goes through the proxy. Supabase is still called directly from the browser since its anon key is designed to be public.

**React Frontend** → **Express Proxy** → **OpenAI APIs**
**React Frontend** → **Supabase** (direct)

- **Screen flow:** Setup Screen → Interview Screen → Feedback Screen → (loop back via "Try Again" or "Next Question")
- **Interview Screen** sends audio blobs and text to the Express proxy, which forwards to OpenAI

**Express Proxy** (API gateway):

- Holds the OpenAI API key server-side
- Proxies ChatGPT scoring, Whisper transcription, and TTS generation
- Streams ChatGPT responses back to the client for lower perceived latency

**Supabase** (data persistence):

- Sessions, scores, questions — called directly from the frontend

**OpenAI APIs** (AI services, accessed via proxy):

- ChatGPT — scoring, question context, feedback
- Whisper — speech-to-text
- TTS — question voice playback

### Data Flow — One Interview Loop

1. **Setup → Interview:** User picks role \+ difficulty. Frontend fetches a question from the question bank (Supabase or local seed data). Frontend calls the proxy's TTS endpoint to convert the question text to audio. Audio plays through the browser.
2. **Interview — Recording:** User speaks. MediaRecorder captures audio chunks. Simultaneously, mic audio is streamed via WebSocket to Deepgram (nova-2) which returns real-time interim and final transcript segments with filler word annotations. When the user clicks "I'm done," the accumulated Deepgram transcript is used directly — no post-recording transcription step needed.
3. **Interview → Scoring:** The Deepgram transcript \+ original question are sent to the scoring endpoint (ChatGPT). ChatGPT returns structured JSON: rubric scores, suggestions, and a follow-up prompt.
4. **Scoring → Feedback:** Frontend renders the scorecard, suggestions, and follow-up. Session data (transcript, scores, question) is written to Supabase (direct).
5. **Feedback → Loop:** User picks "Try Again" (same question, new attempt) or "Next Question" (new question from the bank). On retry, previous attempt data is kept for side-by-side comparison.

### Single STT Path — Deepgram Streaming

Deepgram nova-2 via WebSocket provides a single high-quality transcription path that serves both live display and scoring. The transcript accumulates in real-time as the user speaks — when they click "I'm done," the transcript is already complete. This eliminates the 2-5 second Whisper wait that existed in the original dual-path (Web Speech API + Whisper) architecture.

---

## 3\. Database Schema (Supabase)

Three tables for MVP. No auth for the hackathon — we skip login and treat each browser session as a user.

### `questions`

| Column       | Type          | Notes                                         |
| :----------- | :------------ | :-------------------------------------------- |
| `id`         | `uuid` PK     |                                               |
| `text`       | `text`        | The interview question                        |
| `role`       | `text`        | `swe_intern`, `pm_intern`, etc.               |
| `difficulty` | `text`        | `easy`, `medium`, `hard`                      |
| `category`   | `text`        | Optional tag (e.g., `teamwork`, `leadership`) |
| `created_at` | `timestamptz` |                                               |

Seeded with 5-8 questions before the hackathon. The scoring API does not generate questions — it only scores answers to questions already in the bank.

### `sessions`

| Column             | Type                  | Notes                              |
| :----------------- | :-------------------- | :--------------------------------- |
| `id`               | `uuid` PK             |                                    |
| `question_id`      | `uuid` FK → questions |                                    |
| `attempt_number`   | `int`                 | 1 for first try, 2+ for retries    |
| `transcript`       | `text`                | Authoritative Whisper transcript   |
| `scores`           | `jsonb`               | Full scoring response from ChatGPT |
| `duration_seconds` | `int`                 | How long the user spoke            |
| `created_at`       | `timestamptz`         |                                    |

`scores` stores the entire ChatGPT scoring response as JSON — no need to normalize rubric dimensions into separate columns for a hackathon.

### `question_bank_metadata` (stretch)

Only needed if we build progress tracking. Tracks aggregate stats per question for the user.

---

## 4\. Frontend Architecture

### Routing

Three routes, matching the three screens in the PRD:

| Route        | Component         | Purpose                                  |
| :----------- | :---------------- | :--------------------------------------- |
| `/`          | `SetupScreen`     | Pick role, difficulty, start             |
| `/interview` | `InterviewScreen` | TTS playback, recording, live transcript |
| `/feedback`  | `FeedbackScreen`  | Scorecard, suggestions, retry/next       |

Use React Router. No nested routes needed.

### Component Tree

**App**

- **SetupScreen**
  - RoleSelector — radio/button group
  - DifficultySelector — radio/button group
  - StartButton
- **InterviewScreen**
  - QuestionDisplay — text of the current question
  - WaveformVisualizer — canvas, animates during TTS playback
  - TranscriptPanel — live-updating text from Web Speech API
  - CoachingMetrics — collapsible: filler count, WPM, STAR tracker
  - DoneButton — spacebar shortcut
  - SilenceNudge — appears after 10s of silence
- **FeedbackScreen**
  - ScoreCard — progress bars \+ qualitative labels per dimension
  - SuggestionsList — top 3 actionable suggestions
  - FollowUpPrompt — coaching question
  - RetryComparison — side-by-side, shown on attempt 2+
  - ActionButtons — "Try Again" / "Next Question"

### State Management

React context \+ `useReducer` for global interview state. No Redux — overkill for three screens.

`interface InterviewState {`
`// Setup`
`role: string;`
`difficulty: string;`

`// Current question`
`currentQuestion: Question | null;`

`// Recording`
`isRecording: boolean;`
`liveTranscript: string;`
`audioBlob: Blob | null;`

`// Scoring`
`isScoring: boolean;`
`currentResult: ScoringResult | null;`
`previousAttempts: ScoringResult[];`

`// Metrics (live)`
`fillerCount: number;`
`wordsPerMinute: number;`
`speakingDurationSeconds: number;`
`}`

The state resets on "Next Question" and partially resets on "Try Again" (keep `previousAttempts`, clear recording/transcript).

---

## 5\. Backend Architecture

The backend is a thin Express proxy — its only job is to keep the OpenAI API key off the client and forward requests. It does not own business logic, store state, or talk to Supabase. All three OpenAI services (ChatGPT, Whisper, TTS) are proxied through it.

### Tech Choice

Express on Node.js with TypeScript. Runs as a separate process alongside the Vite dev server during development.

- _Why Express:_ The team already knows it, setup is minimal, and the proxy overhead (~1ms) is irrelevant next to 2-8 second OpenAI round trips.
- _Why not serverless (e.g., Supabase Edge Functions):_ Cold starts add latency to every first request. A long-running Express process avoids this entirely.

### API Routes

| Method | Route | Proxies To | Request Body | Response |
| :----- | :-------------- | :--------------- | :--------------------------------- | :--------------------------------------- |
| POST | `/api/score` | ChatGPT (gpt-4o) | `{ transcript, question }` | Streamed JSON (SSE) — scoring result |
| POST | `/api/transcribe` | Whisper (whisper-1) | `multipart/form-data` (audio file) | `{ text: "..." }` |
| POST | `/api/tts` | TTS (tts-1) | `{ text, voice? }` | Audio binary (`audio/mpeg`) |

All routes:

- Read `OPENAI_API_KEY` from server-side environment (not `VITE_`-prefixed, never sent to the browser)
- Return OpenAI errors as-is with appropriate HTTP status codes
- Have no authentication — acceptable for a hackathon with a local/trusted network

### Streaming (Scoring Endpoint)

The `/api/score` endpoint streams the ChatGPT response back to the frontend using Server-Sent Events (SSE). This lets the frontend start rendering feedback as tokens arrive instead of waiting for the full response (~3-8 seconds).

```
// Server: pipe OpenAI stream to response
res.setHeader('Content-Type', 'text/event-stream');
const stream = await openai.chat.completions.create({
  model: 'gpt-4o',
  messages: [...],
  response_format: { type: 'json_object' },
  stream: true,
});
for await (const chunk of stream) {
  res.write(`data: ${JSON.stringify(chunk)}\n\n`);
}
res.end();
```

For the hackathon, the frontend can also fall back to buffering the full response if streaming parsing proves tricky — the non-streamed round trip is still under 8 seconds.

### File Uploads (Whisper Endpoint)

The `/api/transcribe` endpoint accepts `multipart/form-data` using `multer` (in-memory storage). The audio blob from the frontend's MediaRecorder is forwarded directly to Whisper — no disk writes, no temp files.

### CORS

The proxy runs on a different port than Vite's dev server, so CORS is configured to allow requests from the frontend origin (`http://localhost:5173` in dev). In production, this would be locked to the deployed frontend URL.

### Server Setup

```
// server/index.ts
import express from 'express';
import cors from 'cors';
import multer from 'multer';

const app = express();
app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

app.post('/api/score', scoreHandler);
app.post('/api/transcribe', upload.single('audio'), transcribeHandler);
app.post('/api/tts', ttsHandler);

app.listen(process.env.PORT || 3001);
```

---

## 6\. Audio Pipeline

### TTS (Question → Speaker)

1. Question text is sent to the proxy's `/api/tts` endpoint, which forwards to OpenAI TTS (model: `tts-1`, voice: `alloy`)
2. Audio Blob response is returned
3. AudioContext / `<audio>` element handles playback
4. WaveformVisualizer reads from AnalyserNode during playback

- Use `tts-1` (not `tts-1-hd`) — faster, good enough for a hackathon.
- Voice choice: `alloy` is neutral and professional. Test alternatives (`nova`, `shimmer`) if time allows.
- **Fallback:** Pre-record TTS audio for the seeded demo questions. If the API is slow or down during the demo, play the local files instead.
- Cache TTS audio per question in memory (`Map<questionId, ArrayBuffer>`) so retries don't re-call the API.

### STT — Deepgram Streaming (Real-Time)

1. User speaks into mic
2. `useDeepgramTranscription` hook fetches a 60-second temp key from `/api/key`
3. Opens WebSocket to `wss://api.deepgram.com/v1/listen` with nova-2 model
4. AudioContext at 16 kHz + ScriptProcessor converts mic audio to Int16 PCM and streams to Deepgram
5. Deepgram returns interim and final transcript segments via WebSocket messages
6. Final segments accumulate; interim segment updates live display
7. When user clicks "I'm done," accumulated transcript is used directly for scoring — no post-recording wait

- Deepgram params: `model=nova-2, language=en-US, smart_format=true, filler_words=true, interim_results=true, utterance_end_ms=1000, encoding=linear16, sample_rate=16000, channels=1`
- Cross-browser compatible (uses standard WebSocket + AudioContext, no browser-specific speech API)
- Filler words (um, uh, etc.) are preserved in transcript for coaching metrics
- MediaRecorder still captures audio blob in parallel for potential future replay

### Filler Word Detection (Client-Side)

Runs on the live transcript string, not on audio analysis:

`const FILLERS = ['um', 'uh', 'like', 'you know', 'basically', 'actually', 'so yeah'];`

`function countFillers(transcript: string): number {`
`const lower = transcript.toLowerCase();`
`return FILLERS.reduce((count, filler) => {`
``const regex = new RegExp(`\\b${filler}\\b`, 'g');``
`return count + (lower.match(regex)?.length ?? 0);`
`}, 0);`
`}`

Words-per-minute is calculated as `wordCount / (elapsedSeconds / 60)`, updated every few seconds.

---

## 7\. AI Integration — Scoring Pipeline

### Scoring Prompt

The scoring API is a single ChatGPT call. The prompt structure:

**System:** You are an expert interview coach. Score the following behavioral interview answer using the STAR framework. Return your response as JSON matching the schema below. Be specific — tie every suggestion to something the candidate actually said.

**User:** **Question asked:** {question} **Candidate's answer:** {transcript}

**Expected JSON response shape:**

| Field                  | Type                     | Description                                                       |
| :--------------------- | :----------------------- | :---------------------------------------------------------------- |
| `scores.situation`     | `{ level, explanation }` | Level: Getting Started, Developing, Solid, or Strong              |
| `scores.task`          | `{ level, explanation }` | Same scale                                                        |
| `scores.action`        | `{ level, explanation }` | Same scale                                                        |
| `scores.result`        | `{ level, explanation }` | Same scale                                                        |
| `scores.communication` | `{ level, explanation }` | Same scale                                                        |
| `scores.pacing`        | `{ level, explanation }` | Same scale                                                        |
| `suggestions`          | `string[]` (3 items)     | Specific, actionable, tied to transcript evidence                 |
| `followUp`             | `string`                 | A targeted coaching question about the weakest part of the answer |

### Model Choice

- **`gpt-4o`** — Fast enough for a hackathon demo (typically 3-8 seconds), smart enough for nuanced rubric scoring. The speed/quality tradeoff is right.
- If latency is an issue during the demo, fall back to `gpt-4o-mini` — faster but may produce less nuanced explanations.
- Set `response_format: { type: "json_object" }` to guarantee valid JSON output.

### Prompt Engineering Notes

- The system prompt explicitly says "Return JSON" and provides the exact schema. This plus `response_format: json_object` makes parsing reliable.
- "Tie every suggestion to something the candidate actually said" is the key instruction — this is what makes feedback feel evidence-based instead of generic.
- The scoring levels (Getting Started / Developing / Solid / Strong) are in the prompt, not in post-processing. The LLM picks the label directly.
- The prompt does not include difficulty level — rubric strictness is the same at all difficulty levels (per PRD decision). Difficulty only affects which question is asked.

---

## 8\. Key Technical Decisions

**Backend** — Thin Express proxy for all OpenAI calls; Supabase called directly from the frontend.

- _Why:_ Keeps API keys off the client without adding meaningful latency. Express adds ~1ms of overhead per request — invisible next to 2-8 second OpenAI round trips. The proxy is stateless and simple enough for one person to own.
- _Alternative considered:_ No backend (frontend calls OpenAI directly with `dangerouslyAllowBrowser: true`) — exposes API keys in the browser bundle. Acceptable for a local-only hackathon demo but a bad habit to build on.
- _Alternative considered:_ Supabase Edge Functions — cold starts add latency to first requests; team is less familiar with Deno runtime.

**STT** — Deepgram nova-2 streaming via WebSocket.

- _Why:_ Single high-quality STT path that serves both live display and scoring. Eliminates the 2-5 second Whisper wait after recording stops. Built-in filler word detection. Cross-browser compatible (no Chrome-only Web Speech API dependency).
- _Alternative considered:_ Web Speech API (live) + Whisper (authoritative) — the original dual-path approach. Web Speech API is Chrome-only and unreliable; Whisper adds post-recording latency.
- _Alternative considered:_ Whisper streaming — not available as a real-time WebSocket API from OpenAI.

**State management** — React Context \+ useReducer.

- _Why:_ Three screens, one data flow. No need for external state library.
- _Alternative:_ Redux, Zustand — unnecessary complexity for this scope.

**Scoring format** — Single ChatGPT call returning structured JSON.

- _Why:_ One API call \= one round trip \= simpler error handling. `response_format: json_object` guarantees parseable output.
- _Alternative:_ Separate calls per dimension — more API calls, more latency, more failure points.

**Question source** — Seeded in Supabase, fetched at setup.

- _Why:_ Simple, reliable. No LLM-generated questions for MVP — too much variance in quality.
- _Alternative:_ Generate questions via ChatGPT — adds latency to setup, risk of bad questions during demo.

**TTS caching** — In-memory Map per question ID.

- _Why:_ Avoids re-calling TTS on retries. Lost on page refresh, which is fine.
- _Alternative:_ localStorage/IndexedDB — overkill for a hackathon.

**API key security** — OpenAI key lives server-side only; Supabase anon key stays client-side.

- _Why:_ The Express proxy keeps the OpenAI key out of the browser bundle. Supabase's anon key is designed to be public (Row Level Security handles access control), so it's safe client-side.
- _Previous approach:_ Keys in Vite env vars with `dangerouslyAllowBrowser: true` — replaced by the proxy.

---

## 9\. Project Structure

**polyprompts/**

- **api/**
  - `key.js` — Vercel serverless function: exchanges `DEEPGRAM_API_KEY` for a 60-second scoped temp key
- **server/**
  - `index.ts` — Express app entry point, route registration, CORS
  - **routes/**
    - `score.ts` — `/api/score` handler (ChatGPT proxy, SSE streaming)
    - `transcribe.ts` — `/api/transcribe` handler (Whisper proxy, multer upload)
    - `tts.ts` — `/api/tts` handler (TTS proxy, binary audio response)
  - `openai.ts` — Server-side OpenAI client (reads `OPENAI_API_KEY` from env)
- **public/**
  - **audio/** — Pre-recorded TTS fallback files
- **src/**
  - `main.tsx` — Entry point
  - `App.tsx` — Router setup
  - **context/**
    - `InterviewContext.tsx` — Global state (useReducer \+ context)
  - **screens/**
    - `SetupScreen.tsx`
    - `InterviewScreen.tsx`
    - `FeedbackScreen.tsx`
  - **components/**
    - `RoleSelector.tsx`, `DifficultySelector.tsx`
    - `WaveformVisualizer.tsx`, `TranscriptPanel.tsx`
    - `CoachingMetrics.tsx`, `DoneButton.tsx`, `SilenceNudge.tsx`
    - `ScoreCard.tsx`, `SuggestionsList.tsx`
    - `FollowUpPrompt.tsx`, `RetryComparison.tsx`, `ActionButtons.tsx`
  - **services/**
    - `api.ts` — Frontend HTTP client for the Express proxy (`/api/score`, `/api/transcribe`, `/api/tts`)
    - `supabase.ts` — Supabase client \+ queries (direct, no proxy)
    - `speechRecognition.ts` — Web Speech API wrapper
    - `audioRecorder.ts` — MediaRecorder wrapper
  - **hooks/**
    - `useAudioRecorder.ts` — MediaRecorder lifecycle
    - `useDeepgramTranscription.ts` — Deepgram WebSocket streaming transcription
    - `useTTS.ts` — TTS playback \+ caching
    - `useFillerDetection.ts` — Filler word counting
  - **types/**
    - `index.ts` — Shared TypeScript interfaces
  - **data/**
    - `questions.ts` — Local fallback question bank
- `.env.example` (frontend — Supabase keys only), `server/.env.example` (backend — OpenAI key), `package.json`, `vite.config.ts`

### File Ownership (maps to kickoff-checklist assignments)

- **Tech Lead (Matthew):** `services/`, `hooks/`, `context/`, end-to-end wiring
- **Frontend Dev A:** `screens/InterviewScreen.tsx`, `components/Waveform*`, `TranscriptPanel`, `CoachingMetrics`, `DoneButton`, `SilenceNudge`
- **Frontend Dev B:** `screens/FeedbackScreen.tsx`, `components/ScoreCard`, `SuggestionsList`, `FollowUpPrompt`, `RetryComparison`, `ActionButtons`
- **Product Lead:** `screens/SetupScreen.tsx`, `components/RoleSelector`, `DifficultySelector`, overall styling
- **Backend/AI Dev:** `server/` (all proxy routes), `services/api.ts`, scoring prompt, question seeding

---

## 10\. Environment & Configuration

### Frontend Environment Variables (`.env.example`)

| Variable                 | Example Value                      |
| :----------------------- | :--------------------------------- |
| `VITE_SUPABASE_URL`      | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...`                           |
| `VITE_API_URL`           | `http://localhost:3001`            |

The frontend only needs Supabase keys (safe to expose) and the proxy URL. No OpenAI key on the client.

### Vercel Serverless Environment Variables

| Variable          | Example Value           |
| :---------------- | :---------------------- |
| `DEEPGRAM_API_KEY` | Deepgram API key (server-side only, used by `api/key.js` to mint temp keys) |

### Server Environment Variables (`server/.env.example`)

| Variable          | Example Value           |
| :---------------- | :---------------------- |
| `OPENAI_API_KEY`  | `sk-...`                |
| `PORT`            | `3001`                  |
| `CORS_ORIGIN`     | `http://localhost:5173` |

The OpenAI key lives here — server-side only, never bundled into the frontend.

### OpenAI SDK Setup (Server-Side)

```
// server/openai.ts
import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default openai;
```

No `dangerouslyAllowBrowser` needed — this runs on the server.

### Frontend API Client Setup

```
// src/services/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

export async function transcribeAudio(audioBlob: Blob): Promise<string> {
  const form = new FormData();
  form.append('audio', audioBlob, 'recording.webm');
  const res = await fetch(`${API_URL}/api/transcribe`, { method: 'POST', body: form });
  const data = await res.json();
  return data.text;
}

export async function scoreAnswer(transcript: string, question: string): Promise<ScoringResult> {
  const res = await fetch(`${API_URL}/api/score`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ transcript, question }),
  });
  // For non-streaming fallback; streaming version uses EventSource
  const data = await res.json();
  return data;
}

export async function textToSpeech(text: string): Promise<Blob> {
  const res = await fetch(`${API_URL}/api/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return res.blob();
}
```

### Supabase Client Setup (unchanged — still direct from frontend)

`import { createClient } from '@supabase/supabase-js';`

`const supabase = createClient(`
`import.meta.env.VITE_SUPABASE_URL,`
`import.meta.env.VITE_SUPABASE_ANON_KEY`
`);`

---

## 11\. Performance Budget

These aren't hard requirements — they're targets that keep the demo feeling responsive.

| Interaction                        | Target         | Notes                                                                              |
| :--------------------------------- | :------------- | :--------------------------------------------------------------------------------- |
| Setup → first question audio plays | \< 3 seconds   | TTS latency is the bottleneck. Pre-cache demo questions.                           |
| Live transcript update             | \< 500ms       | Deepgram streaming returns interim results in near real-time.                      |
| "I'm done" → feedback screen       | \< 5 seconds   | No Whisper wait — transcript already built. ChatGPT scoring (\~3-5s). Show a "thinking" animation. |
| Retry → question audio plays       | Instant        | TTS audio cached from first play.                                                  |

### Parallelization Opportunity

After the user clicks "I'm done," the Whisper and TTS-for-next-question calls are independent. If we know the next question (pre-fetch it), we can fire both in parallel:

`const [transcript, nextQuestionAudio] = await Promise.all([`
`whisperTranscribe(audioBlob),`
`ttsGenerate(nextQuestion.text),  // pre-warm for "Next Question"`
`]);`

This shaves a few seconds off the transition if the user picks "Next Question" after feedback.
