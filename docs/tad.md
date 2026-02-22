# Technical Architecture Document

---

## 1\. Technology Stack

### Frontend

- **React** — Component model maps well to the distinct screens (home, setup, interview, feedback). Large ecosystem for rapid development.
- **TypeScript** — Type safety across the codebase.
- **Vite** — Near-instant dev server startup and hot reload.

### Backend / Infrastructure

- **Vercel** — Static hosting + serverless functions in `api/`. No separate backend server needed.
- **Serverless Functions** — `api/feedback.js`, `api/question.js`, `api/factcheck.js`, `api/groq.js` handle server-side AI calls, keeping API keys off the client.
- **Supabase** — Postgres + auth (placeholder, not yet implemented). Intended for session persistence.

### AI / ML Services

- **OpenAI** — TTS (`tts-1`), scoring and question generation (`gpt-4o-mini`), pause analysis (`gpt-4o-mini`). Client-side TTS + pause analysis; server-side scoring, question gen, and factcheck.
- **Deepgram (nova-2)** — Real-time streaming speech-to-text via WebSocket. High-accuracy transcription with built-in filler word detection.
- **Groq (llama-3.1-8b-instant)** — Fast coaching chat for follow-up questions on the feedback screen. Accessed via `api/groq.js` serverless proxy.
- **MediaPipe (FaceLandmarker)** — Client-side face detection for body language metrics (eye contact, head stability, nervousness, confidence). Uses `@mediapipe/tasks-vision`.

### Browser APIs & Libraries

- **MediaRecorder API** — Native browser audio capture.
- **VAD (@ricky0123/vad-web)** — ONNX neural net for voice activity detection.
- **Three.js** — 3D particle visualization that responds to audio energy.
- **Web Audio API** — AudioContext, AnalyserNode, DynamicsCompressor for audio routing and analysis.

---

## 2\. System Architecture Overview

The system is a client-heavy single-page app deployed on Vercel. AI calls that require server-side API keys go through Vercel serverless functions. Client-side code handles TTS playback, real-time transcription, face detection, and audio visualization directly.

**React Frontend** → **Vercel Serverless** → **OpenAI / Groq APIs**
**React Frontend** → **Deepgram WebSocket** (direct, using client-side key)
**React Frontend** → **MediaPipe** (client-side face detection)

- **Screen flow:** HomeScreen → SetupScreen → InterviewScreen → FeedbackScreen → (loop back via "Try Again" or "Next Question")
- **Multi-question flow:** InterviewScreen handles N questions sequentially before navigating to FeedbackScreen for batch scoring

**Vercel Serverless** (API gateway):

- `api/feedback.js` — Batch scores all Q&A pairs via gpt-4o-mini
- `api/question.js` — Generates interview questions for role/difficulty
- `api/factcheck.js` — Validates candidate's fact-correction claims
- `api/groq.js` — Groq-powered coaching chat

**Supabase** (data persistence, placeholder):

- Not yet implemented. Sessions currently persisted to localStorage.

### Data Flow — One Interview Loop

1. **Home → Setup:** User navigates to setup, picks role + difficulty. Questions are loaded/generated.
2. **Setup → Interview:** Frontend calls OpenAI TTS to read the first question aloud. ParticleVisualizer animates to TTS audio. TypewriterQuestion displays text.
3. **Interview — Recording:** User speaks. Deepgram WebSocket streams real-time transcript. VAD detects speech boundaries. MediaPipe tracks face metrics. ParticleVisualizer responds to mic audio energy.
4. **Silence Detection:** After ~3s of low RMS volume, `analyzePause()` (gpt-4o-mini) decides: auto-submit (`definitely_done`), keep recording (`definitely_still_talking`), or ask via TTS nudge (`ask`).
5. **Multi-Question Transition:** If more questions remain, `beginNextQuestion()` advances the index, speaks a transition phrase + next question, and restarts recording. QuestionResult is saved per question.
6. **Interview → Scoring:** After the last question, all Q&A pairs + transcripts are sent to `POST /api/feedback` for batch scoring (gpt-4o-mini, 0-100 scale, 6 dimensions per question + overall).
7. **Scoring → Feedback:** FeedbackScreen renders radar chart, per-question scores with best/worst quotes, fact-check tool, body language metrics (if face detection was active), and overall narrative feedback.
8. **Feedback → Loop:** User picks "Try Again" (same questions, new attempt) or "Next Interview" (new questions). On retry, previous attempt data is kept for comparison.

### Single STT Path — Deepgram Streaming

Deepgram nova-2 via WebSocket provides a single high-quality transcription path that serves both live display and scoring. The transcript accumulates in real-time — when the user finishes, the transcript is already complete. No post-recording transcription wait.

---

## 3\. Database Schema (Supabase — Placeholder)

Not yet implemented. Currently using localStorage for session persistence. The Supabase schema below is the intended target.

### `questions`

| Column       | Type          | Notes                                         |
| :----------- | :------------ | :-------------------------------------------- |
| `id`         | `uuid` PK     |                                               |
| `text`       | `text`        | The interview question                        |
| `role`       | `text`        | `swe_intern`, `pm_intern`, etc.               |
| `difficulty` | `text`        | `easy`, `medium`, `hard`                      |
| `category`   | `text`        | Optional tag (e.g., `teamwork`, `leadership`) |
| `created_at` | `timestamptz` |                                               |

### `sessions`

| Column             | Type                  | Notes                              |
| :----------------- | :-------------------- | :--------------------------------- |
| `id`               | `uuid` PK             |                                    |
| `question_id`      | `uuid` FK → questions |                                    |
| `attempt_number`   | `int`                 | 1 for first try, 2+ for retries    |
| `transcript`       | `text`                | Deepgram transcript                |
| `scores`           | `jsonb`               | Full scoring response              |
| `duration_seconds` | `int`                 | How long the user spoke            |
| `created_at`       | `timestamptz`         |                                    |

---

## 4\. Frontend Architecture

### Routing

| Route              | Component         | Purpose                                    |
| :----------------- | :---------------- | :----------------------------------------- |
| `/`                | `HomeScreen`      | Landing page                               |
| `/setup`           | `SetupScreen`     | Pick role, difficulty, load questions       |
| `/interview`       | `InterviewScreen` | TTS, recording, live transcript, face detection, multi-Q flow |
| `/feedback`        | `FeedbackScreen`  | Radar chart, scores, fact-check, coaching   |
| `/job-description` | `JobDescription`  | Job description input                       |

InterviewScreen and FeedbackScreen are lazy-loaded.

### Component Tree

**App**

- **HomeScreen** — Landing/branding page
- **SetupScreen**
  - RoleSelector — radio/button group
  - DifficultySelector — radio/button group
- **InterviewScreen**
  - TypewriterQuestion — animated question text
  - ParticleVisualizer — Three.js 3D particles, audio-reactive (8000 particles)
  - TranscriptPanel — live-updating text from Deepgram
  - CoachingMetrics — filler count, WPM, duration
  - DoneButton — spacebar shortcut
  - SilenceNudge — appears after silence + pause analysis
  - FaceDetection — MediaPipe FaceLandmarker (optional, camera stream)
- **FeedbackScreen**
  - Radar chart — SVG hexagonal chart of 6 dimensions
  - Scoreboard — per-dimension 0-100 bars
  - Per-question review — question, response, best/worst quotes, scores
  - Fact-check — per-question correction validation
  - Body language card — eye contact, head stability, composure, confidence bars
  - ActionButtons — "Try Again" / "Next Interview"
- **JobDescription** — Job description input screen

### State Management

React Context + `useReducer` for global interview state.

```typescript
interface InterviewState {
  // Setup
  role: string;
  difficulty: string;
  resumeData: ResumeData | null;

  // Question management (multi-question)
  questions: Question[];
  currentQuestionIndex: number;
  currentQuestion: Question | null;
  questionResults: QuestionResult[];

  // Recording (per-question)
  isRecording: boolean;
  liveTranscript: string;
  audioBlob: Blob | null;

  // Scoring
  isScoring: boolean;
  feedbackResponse: FeedbackResponse | null;
  previousAttempts: FeedbackResponse[];

  // Metrics (per-question)
  fillerCount: number;
  wordsPerMinute: number;
  speakingDurationSeconds: number;
  totalDurationSeconds: number;

  // History
  sessionHistory: Session[];

  // TTS preferences
  ttsVoice: string;
  ttsSpeed: number;
}
```

Key actions: `SET_QUESTIONS`, `ADVANCE_QUESTION`, `SAVE_QUESTION_RESULT`, `UPDATE_QUESTION_FEEDBACK`, `SET_FEEDBACK_RESPONSE`, `START_SCORING`, `RETRY`, `NEXT_QUESTION`.

---

## 5\. Backend Architecture

### Vercel Serverless Functions

The backend consists of Vercel serverless functions in `api/`. Each function handles one concern, keeping API keys server-side.

| Method | Route | Purpose | Model |
| :----- | :-------------- | :--------------- | :---- |
| POST | `/api/feedback` | Batch score all Q&A pairs | gpt-4o-mini |
| POST | `/api/question` | Generate interview question | gpt-4o-mini |
| POST | `/api/factcheck` | Validate fact-correction | gpt-4o-mini |
| POST | `/api/groq` | Coaching chat | llama-3.1-8b-instant (Groq) |

All routes read API keys from server-side environment variables (`OPENAI_API_KEY`, `GROQ_API_KEY`).

### Scoring Endpoint (`/api/feedback`)

The scoring endpoint receives all Q&A pairs and returns structured feedback:

**Per-question scores (6 dimensions, 0-100 each):**
- `response_organization` — Response structure and clarity
- `technical_knowledge` — Technical depth and accuracy
- `problem_solving` — Analytical approach
- `position_application` — Relevance to role
- `timing` — Answer pacing and length
- `personability` — Communication warmth and confidence

**Per-question feedback fields:**
- `score` — Average of 6 dimensions
- `best_part_quote` / `best_part_explanation` — Strongest part of the answer
- `worst_part_quote` / `worst_part_explanation` — Weakest part
- `what_went_well` / `needs_improvement` — Narrative feedback
- `summary` — 2-3 sentence summary
- `confidence_score` — 0-100 (optional)

**Overall feedback:** Same 6 dimensions averaged across all questions, plus overall narrative.

### Groq Chat Endpoint (`/api/groq`)

Provides follow-up coaching conversation. Receives chat history + interview context (question, transcript, scores). Uses Groq's `llama-3.1-8b-instant` for fast responses. Includes topic guardrails to keep conversation focused on interview coaching.

---

## 6\. Audio Pipeline

### TTS (Question → Speaker)

1. Question text sent to OpenAI TTS (model: `tts-1`, configurable voice)
2. Audio blob returned, played via AudioContext
3. TTS audio routed through AnalyserNode → ParticleVisualizer reacts to TTS energy
4. Fallback to browser SpeechSynthesis API if OpenAI TTS fails

### STT — Deepgram Streaming (Real-Time)

1. User speaks into mic
2. `useDeepgramTranscription` connects to `wss://api.deepgram.com/v1/listen` using `VITE_DEEPGRAM_API_KEY`
3. AudioContext at 16 kHz + ScriptProcessor converts mic audio to Int16 PCM and streams to Deepgram
4. Deepgram returns interim and final transcript segments via WebSocket messages
5. Final segments accumulate; interim segment updates live display
6. When done, accumulated transcript is used directly for scoring

Deepgram params: `model=nova-2, language=en-US, smart_format=true, filler_words=true, interim_results=true, utterance_end_ms=1000, encoding=linear16, sample_rate=16000, channels=1`

### ParticleVisualizer (Three.js)

- 8000 particles in a 3D sphere (radius 1.0)
- Colors: White (#ffffff) to light blue (#a0c4ff) gradient
- Audio input: AnalyserNode (300-3000 Hz frequency band)
- **Quiet mode** (not speaking): particles orbit in a calm ring, center halo effect
- **Speaking mode**: particles expand, turbulence and orbital speed increase with energy
- Center dead zone (radius 0.24) repels particles to create halo around logo
- Perlin noise drives particle motion direction

### Face Detection (MediaPipe)

- `@mediapipe/tasks-vision` FaceLandmarker with 468-point facial landmarks
- Runs at ~30 FPS via requestAnimationFrame on camera stream
- Smoothing: EMA (α=0.15 for gaze, 0.8 for head pose)
- Ring buffers for history (90 frames eye, 300 frames blink, 60 frames head)
- Non-blocking: errors don't fail the interview
- Outputs: eye contact %, head stability, nervousness score, confidence score

### Filler Word Detection (Client-Side)

Runs on the live transcript string:

Fillers detected: um, uh, like, you know, basically, actually, so yeah

Words-per-minute: `wordCount / (elapsedSeconds / 60)`, updated periodically.

### Pause Analysis (Client-Side → OpenAI)

When ~3s of low RMS volume detected:
1. `analyzePause()` sends current transcript + question to gpt-4o-mini
2. Returns one of: `definitely_done`, `definitely_still_talking`, `ask`
3. If `ask`, plays TTS nudge: "Are you finished?"
4. If `definitely_done`, auto-submits the answer

---

## 7\. AI Integration — Scoring Pipeline

### Multi-Question Batch Scoring

After all questions are answered, `POST /api/feedback` receives the full set of Q&A pairs and returns structured JSON.

**Scoring dimensions (6 categories, 0-100 each):**

| Dimension | Key | What It Measures |
|-----------|-----|-----------------|
| Organization | `response_organization` | Response structure and clarity |
| Technical | `technical_knowledge` | Technical depth and accuracy |
| Problem Solving | `problem_solving` | Analytical approach |
| Position Fit | `position_application` | Relevance to role |
| Timing | `timing` | Answer pacing and length |
| Personability | `personability` | Communication warmth and confidence |

### Model

- **`gpt-4o-mini`** — Server-side scoring. Good balance of speed and quality for structured JSON output.
- `response_format: { type: "json_object" }` guarantees valid JSON.

---

## 8\. Key Technical Decisions

**Hosting** — Vercel (static + serverless functions).

- _Why:_ Zero-config deployment, serverless functions co-located with frontend, no separate backend server to manage.
- _Previous approach:_ Express proxy server — replaced by Vercel serverless for simpler deployment.

**STT** — Deepgram nova-2 streaming via WebSocket (client-side key).

- _Why:_ Single high-quality path for both live display and scoring. No post-recording wait.
- _Previous approach:_ Temp key exchange via `api/key.js` — simplified to direct client-side key.

**Scoring** — Server-side batch scoring via Vercel serverless.

- _Why:_ Keeps `OPENAI_API_KEY` server-side. Batch scoring all questions together gives more coherent overall feedback.
- _Previous approach:_ Client-side scoring with `VITE_OPENAI_API_KEY` — moved server-side for security.

**Visualization** — Three.js ParticleVisualizer.

- _Why:_ More engaging than a 2D waveform. Audio-reactive particles create an immersive interview experience.
- _Previous approach:_ Canvas-based WaveformVisualizer (still in codebase but replaced).

**Face Detection** — MediaPipe FaceLandmarker (client-side).

- _Why:_ Runs entirely in-browser, no server calls. Provides body language metrics without privacy concerns of sending video.
- Uses `@mediapipe/tasks-vision` (tasks-vision API, not legacy FaceMesh).

**State management** — React Context + useReducer.

- _Why:_ Multi-question flow with shared state across screens. No external library needed.

**Multi-question flow** — Sequential questions with per-question state management.

- _Why:_ More realistic interview simulation. Batch scoring at the end gives holistic feedback.

**Coaching chat** — Groq (llama-3.1-8b-instant) via serverless proxy.

- _Why:_ Very fast inference for interactive chat. Topic guardrails keep conversation focused on interview coaching.

---

## 9\. Project Structure

**polyprompts/**

- **api/**
  - `feedback.js` — Batch scoring serverless function (gpt-4o-mini)
  - `question.js` — Question generation serverless function (gpt-4o-mini)
  - `factcheck.js` — Fact-check validation serverless function (gpt-4o-mini)
  - `groq.js` — Groq coaching chat serverless function (llama-3.1-8b-instant)
- **public/** — Static assets
- **src/**
  - `main.tsx` — Entry point
  - `App.tsx` — Router setup (5 routes)
  - **context/**
    - `InterviewContext.tsx` — Global state (useReducer + context)
  - **screens/**
    - `HomeScreen.tsx` — Landing page
    - `SetupScreen.tsx` — Role/difficulty selection
    - `InterviewScreen.tsx` — Main interview orchestration
    - `FeedbackScreen.tsx` — Results and scoring
    - `JobDescription.tsx` — Job description input
  - **components/**
    - `ParticleVisualizer.tsx` — Three.js audio-reactive particles
    - `TypewriterQuestion.tsx` — Animated question text
    - `QuestionDisplay.tsx` — Question rendering
    - `WaveformVisualizer.tsx` — Legacy waveform canvas
    - `TranscriptPanel.tsx`, `TranscriptReview.tsx`
    - `CoachingMetrics.tsx`, `DoneButton.tsx`, `SilenceNudge.tsx`
    - `ScoreCard.tsx`, `ScoreTrendChart.tsx`
    - `PerformanceSummary.tsx`, `SuggestionsList.tsx`
    - `FollowUpPrompt.tsx`, `RetryComparison.tsx`, `ActionButtons.tsx`
    - `RoleSelector.tsx`, `DifficultySelector.tsx`
    - `FlowProgress.tsx`
  - **services/**
    - `api.ts` — Frontend HTTP client for serverless endpoints
    - `openai.ts` — Client-side OpenAI calls (TTS, pause analysis)
    - `groq.ts` — Groq chat client
    - `audioRecorder.ts` — MediaRecorder wrapper
    - `supabase.ts` — Supabase client (placeholder)
  - **hooks/**
    - `useAudioRecorder.ts` — VAD + MediaRecorder + silence detection
    - `useDeepgramTranscription.ts` — Deepgram WebSocket streaming
    - `useTTS.ts` — TTS playback + caching
    - `useFillerDetection.ts` — Filler word counting
    - `useFaceDetection.ts` — MediaPipe face detection metrics
  - **utils/**
    - `logger.ts` — Structured logging
  - **types/**
    - `index.ts` — Shared TypeScript interfaces
  - **data/**
    - `questions.ts` — Local fallback question bank
- `vercel.json` — Vercel SPA rewrites
- `vite.config.ts` — Vite config with `/api` dev proxy
- `.env.example`, `package.json`

---

## 10\. Environment & Configuration

### Client-Side Environment Variables

| Variable                 | Purpose                                |
| :----------------------- | :------------------------------------- |
| `VITE_OPENAI_API_KEY`    | OpenAI API key (TTS, pause analysis)   |
| `VITE_DEEPGRAM_API_KEY`  | Deepgram API key (WebSocket STT)       |
| `VITE_SUPABASE_URL`      | Supabase project URL (not yet used)    |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon key (not yet used)       |

### Server-Side Environment Variables (Vercel)

| Variable          | Purpose                                        |
| :---------------- | :--------------------------------------------- |
| `OPENAI_API_KEY`  | OpenAI for scoring, question gen, factcheck     |
| `GROQ_API_KEY`    | Groq for coaching chat                          |

### Local Development

```bash
npm run dev          # Vite dev server on :5173 (proxies /api to :3000)
npm run dev:vercel   # Vercel dev server on :3000 (runs serverless functions)
npm run build        # Production build (tsc + vite)
```

For local development with serverless functions, run `npm run dev:vercel` and access the app at `http://localhost:3000`. The Vite config includes a proxy for `/api` routes when using the standalone dev server on :5173.
