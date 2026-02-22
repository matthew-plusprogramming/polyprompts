# PolyPrompts Architecture

## User Flow

```
+------------------+       +---------------------+       +---------------------+       +-------------------+
|   HOME SCREEN    | ----> |    SETUP SCREEN     | ----> |  INTERVIEW SCREEN   | ----> |  FEEDBACK SCREEN  |
|                  |       |                     |       |                     |       |                   |
| Landing page     |       | 1. Select role      |       | 1. TTS reads Q      |       | 1. Radar chart    |
|                  |       | 2. Select diff      |       | 2. User speaks      |       | 2. 0-100 scores   |
|                  |       | 3. Paste resume     |       | 3. Live transcript  |       | 3. Per-Q feedback |
|                  |       | 4. Start            |       | 4. Silence nudge    |       | 4. Fact check     |
|                  |       |                     |       | 5. Multi-Q flow     |       | 5. Body language  |
|                  |       |                     |       | 6. Face detection   |       | 6. Retry / Next   |
+------------------+       +---------------------+       +---------------------+       +-------------------+
        ^                                                                                   |          |
        |                                                                                   |          |
        +---------------------------  "Home"  ----------------------------------------------+          |
                                      "Next Question" / "Try Again" -------> Back to
                                                                        Interview Screen
```

### Detailed User Steps

1. **Home** — Landing page with branding
2. **Setup** — User picks a role (SWE Intern, PM Intern, ML Intern, Custom), difficulty (Easy/Medium/Hard), and optionally pastes resume data. Multiple questions are loaded.
3. **Question Presented** — System picks a seeded question (or generates one from resume) and reads it aloud via TTS with typewriter text animation
4. **User Responds** — Microphone activates; user speaks their answer while seeing a live transcript, particle visualizer, and optional face detection metrics
5. **Silence Detection** — If ~3s of silence, system calls `analyzePause()` (GPT-4o-mini) to decide: auto-submit, keep recording, or ask "Are you finished?" via TTS
6. **Multi-Question** — If more questions remain, transitions to the next question automatically. Otherwise proceeds to scoring.
7. **Submit** — After last question, recording stops and all Q&A pairs are batch-scored
8. **Processing** — All questions scored together via `/api/feedback` endpoint (gpt-4o-mini, 0-100 numeric scale)
9. **Feedback** — Radar chart of 6 dimensions, per-question scores with best/worst quotes, fact-check tool, body language metrics, overall narrative feedback
10. **Loop** — User can retry the same question or move to a new one

---

## Tech Flow

```
                          BROWSER
 +---------------------------------------------------------+
 |                                                         |
 |  HomeScreen -> SetupScreen -> InterviewScreen -> FeedbackScreen
 |                    |               |                 |
 |                    |               |                 |
 |                    v               v                 v
 |  InterviewContext (React Context + useReducer)           |
 |  - role, difficulty, questions[], questionResults[]     |
 |  - transcript, feedbackResponse, faceMetrics            |
 |  - persists sessions to localStorage                    |
 +---------------------------------------------------------+
                             |
            +----------------+----------------+
            |                |                |
            v                v                v
     [Speech/Audio]    [AI Services]    [Face Detection]
```

### External APIs & Services

| Service | Provider | Model/API | Purpose | Called From |
|---------|----------|-----------|---------|------------|
| **Streaming STT** | Deepgram | `nova-2` (WebSocket) | Real-time transcript with filler word detection | `useDeepgramTranscription.ts` (uses `VITE_DEEPGRAM_API_KEY` directly) |
| **Text-to-Speech** | OpenAI | `tts-1` (alloy/nova/etc) | Read questions & nudges aloud | `openai.ts → textToSpeech()` |
| **TTS Fallback** | Browser | SpeechSynthesis API | Fallback if OpenAI TTS fails | `useTTS.ts` |
| **Batch Scoring** | OpenAI | `gpt-4o-mini` | Score all Q&A pairs on 6 dimensions (0-100) | `api/feedback.js` |
| **Question Gen** | OpenAI | `gpt-4o-mini` | Generate interview questions for role/difficulty | `api/question.js` |
| **Fact Check** | OpenAI | `gpt-4o-mini` | Validate candidate's fact-corrections | `api/factcheck.js` |
| **Pause Analysis** | OpenAI | `gpt-4o-mini` | Decide if user is done speaking | `openai.ts → analyzePause()` |
| **Groq Chat** | Groq | `llama-3.1-8b-instant` | Follow-up coaching chat on feedback screen | `api/groq.js` |
| **Voice Detection** | @ricky0123/vad-web | ONNX neural net | Detect speech start/stop | `useAudioRecorder.ts` |
| **Face Detection** | @mediapipe/tasks-vision | FaceLandmarker | Eye contact, head stability, nervousness, confidence | `useFaceDetection.ts` |
| **Database** | Supabase | Postgres | Session persistence (NOT YET IMPLEMENTED) | `supabase.ts` (placeholder) |

### Audio/Speech Pipeline (Interview Screen)

```
Microphone (getUserMedia)
    |
    +---> Deepgram WebSocket ---------> Real-time transcript (displayed in UI)
    |        (nova-2, 16kHz Int16 PCM)     (final + interim results, filler words)
    |        via AudioContext +
    |        ScriptProcessor
    |
    +---> VAD (ricky0123/vad-web) ---> Detects speech start/stop
    |        (ONNX neural net)
    |
    +---> MediaRecorder ----------------> Audio Blob (kept for potential replay)
    |        (webm/opus or mp4)
    |
    +---> AudioContext + AnalyserNode --> ParticleVisualizer (Three.js)
    |        (also: DynamicsCompressor      8000 particles, audio-reactive
    |         for normalization)
    |
    +---> Camera (getUserMedia video) --> FaceLandmarker (MediaPipe)
             468-point facial landmarks      Eye contact, head stability,
             ~30 FPS via rAF                 nervousness, confidence metrics

                                     On submit/done (per question):
                                        |
                                        v
                                  Save QuestionResult
                                  (transcript + metrics)
                                        |
                                  If more questions:
                                     beginNextQuestion()
                                  If last question:
                                        |
                                        v
                                  POST /api/feedback
                                  (batch scoring, all Q&A pairs)
                                        |
                                        v
                               FeedbackScreen <--- FeedbackResponse
```

### Screens & Routes

| Route | Screen | File |
|-------|--------|------|
| `/` | HomeScreen | `src/screens/HomeScreen.tsx` |
| `/setup` | SetupScreen | `src/screens/SetupScreen.tsx` |
| `/interview` | InterviewScreen (lazy) | `src/screens/InterviewScreen.tsx` |
| `/feedback` | FeedbackScreen (lazy) | `src/screens/FeedbackScreen.tsx` |
| `/job-description` | JobDescription | `src/screens/JobDescription.tsx` |

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useDeepgramTranscription` | `src/hooks/useDeepgramTranscription.ts` | Deepgram WebSocket streaming (real-time, filler words) |
| `useAudioRecorder` | `src/hooks/useAudioRecorder.ts` | VAD + MediaRecorder + RMS silence detection |
| `useTTS` | `src/hooks/useTTS.ts` | OpenAI TTS playback + native fallback + Web Audio routing |
| `useFillerDetection` | `src/hooks/useFillerDetection.ts` | Count filler words (um, uh, like, etc.) |
| `useFaceDetection` | `src/hooks/useFaceDetection.ts` | MediaPipe FaceLandmarker for body language metrics |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| OpenAI (client) | `src/services/openai.ts` | TTS, pause analysis (client-side calls) |
| API bridge | `src/services/api.ts` | Frontend calls to serverless endpoints (question, feedback, factcheck) |
| Groq | `src/services/groq.ts` | Groq chat service for follow-up coaching |
| AudioRecorder | `src/services/audioRecorder.ts` | MediaRecorder lifecycle |
| Supabase | `src/services/supabase.ts` | Placeholder (not implemented) |

### Serverless Functions (Vercel)

| File | Endpoint | Purpose |
|------|----------|---------|
| `api/feedback.js` | `POST /api/feedback` | Batch scores all Q&A pairs via gpt-4o-mini (0-100 scale, 6 dimensions) |
| `api/question.js` | `POST /api/question` | Generates interview question for role/difficulty |
| `api/factcheck.js` | `POST /api/factcheck` | Validates candidate's fact-correction claims |
| `api/groq.js` | `POST /api/groq` | Groq-powered coaching chat (llama-3.1-8b-instant) |

### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| ParticleVisualizer | `src/components/ParticleVisualizer.tsx` | Three.js 3D particle system (8000 particles), audio-reactive |
| TypewriterQuestion | `src/components/TypewriterQuestion.tsx` | Animated question text with typewriter effect |
| QuestionDisplay | `src/components/QuestionDisplay.tsx` | Question rendering UI |
| WaveformVisualizer | `src/components/WaveformVisualizer.tsx` | Audio frequency/waveform canvas (legacy, replaced by ParticleVisualizer) |
| TranscriptPanel | `src/components/TranscriptPanel.tsx` | Live transcript display during recording |
| TranscriptReview | `src/components/TranscriptReview.tsx` | Transcript review/editing UI |
| CoachingMetrics | `src/components/CoachingMetrics.tsx` | Filler count, WPM, duration |
| SilenceNudge | `src/components/SilenceNudge.tsx` | "Are you finished?" prompt |
| DoneButton | `src/components/DoneButton.tsx` | Manual submit button |
| ActionButtons | `src/components/ActionButtons.tsx` | Retry/Next/Home navigation |
| ScoreCard | `src/components/ScoreCard.tsx` | Individual STAR dimension score |
| ScoreTrendChart | `src/components/ScoreTrendChart.tsx` | Performance trend visualization |
| PerformanceSummary | `src/components/PerformanceSummary.tsx` | Overall feedback synthesis |
| SuggestionsList | `src/components/SuggestionsList.tsx` | 3 actionable suggestions |
| FollowUpPrompt | `src/components/FollowUpPrompt.tsx` | Coaching follow-up question |
| RetryComparison | `src/components/RetryComparison.tsx` | Compare attempts side-by-side |
| FlowProgress | `src/components/FlowProgress.tsx` | Progress indicator |
| RoleSelector | `src/components/RoleSelector.tsx` | Role selection dropdown |
| DifficultySelector | `src/components/DifficultySelector.tsx` | Difficulty selection dropdown |

### State Management

**InterviewContext** (`src/context/InterviewContext.tsx`)
- React Context + `useReducer`
- Holds: role, difficulty, questions[], currentQuestionIndex, questionResults[], transcript, audio blob, filler count, feedbackResponse, session history, TTS preferences
- Persists sessions to `localStorage`

### Scoring Dimensions (Server-Side, 0-100 Scale)

| Dimension | Key | What It Measures |
|-----------|-----|-----------------|
| Organization | `response_organization` | Response structure and clarity |
| Technical | `technical_knowledge` | Technical depth and accuracy |
| Problem Solving | `problem_solving` | Analytical approach |
| Position Fit | `position_application` | Relevance to role |
| Timing | `timing` | Answer pacing and length |
| Personability | `personability` | Communication warmth and confidence |

Each dimension scored 0-100. Per-question feedback includes best/worst quotes, explanations, and narrative fields.

### Face Detection Metrics

| Metric | What It Measures |
|--------|-----------------|
| Eye Contact % | Proportion of frames with gaze centered on screen |
| Head Stability | Inverse of yaw+pitch variance |
| Nervousness Score | Blink rate, head motion, pitch variance composite |
| Confidence Score | Weighted composite: eye contact (50%), head stability (30%), confidence signal (20%) |

### Environment Variables

```
# Client-side
VITE_OPENAI_API_KEY        — OpenAI API key (TTS, pause analysis)
VITE_DEEPGRAM_API_KEY      — Deepgram API key (WebSocket STT)
VITE_SUPABASE_URL          — Supabase project URL (not yet used)
VITE_SUPABASE_ANON_KEY     — Supabase anon key (not yet used)

# Server-side (Vercel serverless)
OPENAI_API_KEY             — OpenAI for scoring, question gen, factcheck
GROQ_API_KEY               — Groq for coaching chat
```
