# Technical Architecture Document

---

## 1\. Technology Stack

### Frontend

- **React** — The team has the most experience here. Component model maps well to the distinct screens in our flow (setup, interview, feedback). Large ecosystem means we won't get stuck on niche problems during a 48-hour hackathon.
- **Vite** — Near-instant dev server startup and hot reload. In a hackathon, fast iteration cycles matter more than almost anything else.

### Backend / Infrastructure

- **Supabase** — Gives us Postgres, auth, and real-time subscriptions out of the box with zero server setup. We skip building a custom backend entirely and go straight to storing sessions, scores, and transcripts. The real-time subscriptions could also power live metric updates if we need a server-push model.

### AI / ML Services

- **OpenAI ChatGPT API** — Single provider for the core intelligence: generating interview questions, scoring answers against our STAR rubric, producing coaching feedback, and crafting follow-up questions. Using one provider keeps our integration surface small and our API key management simple.
- **OpenAI Whisper** — Accurate speech-to-text that handles diverse accents well, which matters for a product built around speaking. Pairs naturally with the rest of our OpenAI stack — same auth, same SDK, same billing.
- **OpenAI TTS** — Makes the interviewer feel like a person, not a text box. Staying within the OpenAI ecosystem means one SDK and one set of API patterns across LLM, STT, and TTS.

### Browser APIs

- **MediaRecorder API** — Native browser audio capture with no dependencies. Gives us audio blobs we can send directly to Whisper. No need for a third-party recording library or WebRTC server — keeps the stack thin for a hackathon.

---

## 2\. System Architecture Overview

The system is a client-heavy single-page app supported by a lightweight custom backend. This backend's primary role is to secure API secrets and serve as a secure proxy for key AI services, such as running Whisper for authoritative transcription. This approach allows the team to maintain a simple, client-heavy focus while improving security and control over core AI operations.

**React Frontend** → talks directly to two external services (no custom backend server):

- **Screen flow:** Setup Screen → Interview Screen → Feedback Screen → (loop back via "Try Again" or "Next Question")
- **Interview Screen** sends audio blobs and text to external APIs

**Supabase** (data persistence):

- Sessions, scores, questions

**OpenAI APIs** (AI services):

- ChatGPT — scoring, question context, feedback
- Whisper — speech-to-text
- TTS — question voice playback

### Data Flow — One Interview Loop

1. **Setup → Interview:** User picks role \+ difficulty. Frontend fetches a question from the question bank (Supabase or local seed data). TTS converts the question text to audio. Audio plays through the browser.
2. **Interview — Recording:** User speaks. MediaRecorder captures audio chunks. Live transcript updates via Web Speech API (browser-native, zero cost) for real-time display. When the user clicks "I'm done," the full audio blob is sent to Whisper for the authoritative transcript.
3. **Interview → Scoring:** The authoritative Whisper transcript \+ original question are sent to ChatGPT with the scoring prompt. ChatGPT returns structured JSON: rubric scores, suggestions, and a follow-up prompt.
4. **Scoring → Feedback:** Frontend renders the scorecard, suggestions, and follow-up. Session data (transcript, scores, question) is written to Supabase.
5. **Feedback → Loop:** User picks "Try Again" (same question, new attempt) or "Next Question" (new question from the bank). On retry, previous attempt data is kept for side-by-side comparison.

### Why Two STT Paths?

- **Web Speech API (live):** Free, instant, runs in-browser. Good enough for a live transcript that helps the user see their words on screen. Not reliable enough to score against.
- **Whisper (authoritative):** Costs money and adds latency (\~2-5s for a 2-minute answer), but produces an accurate transcript we can trust for rubric scoring. Only called once per answer, after the user finishes.

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

## 5\. Audio Pipeline

### TTS (Question → Speaker)

1. Question text is sent to OpenAI TTS API (model: `tts-1`, voice: `alloy`)
2. ArrayBuffer response is returned
3. AudioContext / `<audio>` element handles playback
4. WaveformVisualizer reads from AnalyserNode during playback

- Use `tts-1` (not `tts-1-hd`) — faster, good enough for a hackathon.
- Voice choice: `alloy` is neutral and professional. Test alternatives (`nova`, `shimmer`) if time allows.
- **Fallback:** Pre-record TTS audio for the seeded demo questions. If the API is slow or down during the demo, play the local files instead.
- Cache TTS audio per question in memory (`Map<questionId, ArrayBuffer>`) so retries don't re-call the API.

### STT — Live Transcript (Web Speech API)

1. User speaks into mic
2. MediaRecorder captures audio (for Whisper later)
3. **Simultaneously:** Web Speech API (SpeechRecognition) streams interim results
4. `onresult` callback updates `liveTranscript` in state
5. TranscriptPanel re-renders with new text

- `SpeechRecognition.continuous = true` and `interimResults = true` for streaming text.
- Chrome-only in practice (Firefox/Safari support is spotty). Acceptable for a hackathon demo.
- If Web Speech API is unavailable, fall back to showing "Transcript will appear after you finish" and rely on Whisper only.

### STT — Authoritative Transcript (Whisper)

1. User clicks "I'm done"
2. `MediaRecorder.stop()` produces final audio Blob (webm/opus)
3. POST to OpenAI Whisper API (model: `whisper-1`)
4. Returns `{ text: "..." }` — this transcript is what gets scored

- Send as `file` in multipart form data. Whisper accepts webm.
- Expected latency: 2-5 seconds for a 1-3 minute answer.
- During this wait, show a "thinking" state with the waveform doing a subtle idle animation — matches the PRD's "interviewer collecting their thoughts" moment.

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

## 6\. AI Integration — Scoring Pipeline

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

## 7\. Key Technical Decisions

**Backend** — No custom backend; frontend calls Supabase \+ OpenAI directly.

- _Why:_ Eliminates a deployment target and the need for someone to own server code. API keys are in env vars loaded by Vite.
- _Alternative:_ Express/Node server — adds ops overhead, no clear benefit for MVP scope.

**Live STT** — Web Speech API (browser-native).

- _Why:_ Zero cost, zero setup, low latency. Only used for live display, not scoring.
- _Alternative:_ Whisper streaming — adds latency \+ cost for a display-only feature.

**Authoritative STT** — Whisper (called once after "I'm done").

- _Why:_ Accurate, handles accents well, produces clean text for scoring.
- _Alternative:_ Web Speech API final transcript — too unreliable for rubric scoring.

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

**API key exposure** — Keys in Vite env vars, loaded client-side.

- _Why:_ Acceptable for a hackathon. Not acceptable for production. Keys are on the team's accounts with spending caps set.
- _Alternative:_ Proxy server to hide keys — adds infra we don't have time to build.

---

## 8\. Project Structure

**polyprompts/**

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
    - `openai.ts` — ChatGPT, Whisper, TTS API wrappers
    - `supabase.ts` — Supabase client \+ queries
    - `speechRecognition.ts` — Web Speech API wrapper
    - `audioRecorder.ts` — MediaRecorder wrapper
  - **hooks/**
    - `useAudioRecorder.ts` — MediaRecorder lifecycle
    - `useSpeechRecognition.ts` — Web Speech API lifecycle
    - `useTTS.ts` — TTS playback \+ caching
    - `useFillerDetection.ts` — Filler word counting
  - **types/**
    - `index.ts` — Shared TypeScript interfaces
  - **data/**
    - `questions.ts` — Local fallback question bank
- `.env.example`, `package.json`, `vite.config.ts`

### File Ownership (maps to kickoff-checklist assignments)

- **Tech Lead (Matthew):** `services/`, `hooks/`, `context/`, end-to-end wiring
- **Frontend Dev A:** `screens/InterviewScreen.tsx`, `components/Waveform*`, `TranscriptPanel`, `CoachingMetrics`, `DoneButton`, `SilenceNudge`
- **Frontend Dev B:** `screens/FeedbackScreen.tsx`, `components/ScoreCard`, `SuggestionsList`, `FollowUpPrompt`, `RetryComparison`, `ActionButtons`
- **Product Lead:** `screens/SetupScreen.tsx`, `components/RoleSelector`, `DifficultySelector`, overall styling
- **Backend/AI Dev:** `services/openai.ts`, `services/supabase.ts`, scoring prompt, question seeding

---

## 9\. Environment & Configuration

### Environment Variables (`.env.example`)

| Variable                 | Example Value                      |
| :----------------------- | :--------------------------------- |
| `VITE_OPENAI_API_KEY`    | `sk-...`                           |
| `VITE_SUPABASE_URL`      | `https://your-project.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | `eyJ...`                           |

All prefixed with `VITE_` so Vite exposes them to the client bundle. Again — this is a hackathon pattern, not a production pattern.

### OpenAI SDK Setup

`import OpenAI from 'openai';`

`const openai = new OpenAI({`
`apiKey: import.meta.env.VITE_OPENAI_API_KEY,`
`dangerouslyAllowBrowser: true,  // Required for client-side usage`
`});`

`dangerouslyAllowBrowser: true` is required because the OpenAI SDK warns against client-side usage by default. This is fine for a hackathon with spending caps on the API key.

### Supabase Client Setup

`import { createClient } from '@supabase/supabase-js';`

`const supabase = createClient(`
`import.meta.env.VITE_SUPABASE_URL,`
`import.meta.env.VITE_SUPABASE_ANON_KEY`
`);`

---

## 10\. Performance Budget

These aren't hard requirements — they're targets that keep the demo feeling responsive.

| Interaction                        | Target         | Notes                                                                              |
| :--------------------------------- | :------------- | :--------------------------------------------------------------------------------- |
| Setup → first question audio plays | \< 3 seconds   | TTS latency is the bottleneck. Pre-cache demo questions.                           |
| Live transcript update             | \< 1-2 seconds | Web Speech API handles this natively.                                              |
| "I'm done" → feedback screen       | \< 8 seconds   | Whisper (\~3s) \+ ChatGPT scoring (\~5s) in sequence. Show a "thinking" animation. |
| Retry → question audio plays       | Instant        | TTS audio cached from first play.                                                  |

### Parallelization Opportunity

After the user clicks "I'm done," the Whisper and TTS-for-next-question calls are independent. If we know the next question (pre-fetch it), we can fire both in parallel:

`const [transcript, nextQuestionAudio] = await Promise.all([`
`whisperTranscribe(audioBlob),`
`ttsGenerate(nextQuestion.text),  // pre-warm for "Next Question"`
`]);`

This shaves a few seconds off the transition if the user picks "Next Question" after feedback.
