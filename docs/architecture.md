# PolyPrompts Architecture

## User Flow

```
+------------------+       +---------------------+       +-------------------+
|   SETUP SCREEN   | ----> |  INTERVIEW SCREEN   | ----> |  FEEDBACK SCREEN  |
|                  |       |                     |       |                   |
| 1. Select role   |       | 1. TTS reads Q      |       | 1. STAR radar     |
| 2. Select diff   |       | 2. User speaks      |       | 2. Overall score  |
| 3. Paste resume  |       | 3. Live transcript  |       | 3. Suggestions    |
| 4. Start         |       | 4. Silence nudge    |       | 4. Follow-up Q    |
|                  |       | 5. Submit answer    |       | 5. Retry / Next   |
+------------------+       +---------------------+       +-------------------+
        ^                                                     |          |
        |                                                     |          |
        +------------------  "Home"  -------------------------+          |
                            "Next Question" / "Try Again" -------> Back to
                                                              Interview Screen
```

### Detailed User Steps

1. **Setup** - User picks a role (SWE Intern, PM Intern, ML Intern, Custom), difficulty (Easy/Medium/Hard), and optionally pastes resume data
2. **Question Presented** - System picks a seeded question (or generates one from resume) and reads it aloud via TTS
3. **User Responds** - Microphone activates; user speaks their answer while seeing a live transcript and waveform
4. **Silence Detection** - If 4s of silence, system asks "Are you finished?" via TTS nudge
5. **Submit** - User clicks Done (or presses Space); recording stops
6. **Processing** - Deepgram streaming transcript finalized, answer scored against STAR framework
7. **Feedback** - Radar chart of 6 dimensions, suggestions, follow-up coaching question
8. **Loop** - User can retry the same question or move to a new one

---

## Tech Flow

```
                          BROWSER
 +---------------------------------------------------------+
 |                                                         |
 |  SetupScreen -----> InterviewScreen -----> FeedbackScreen
 |       |                   |                      |
 |       |                   |                      |
 |       v                   v                      v
 |  InterviewContext (React Context + useReducer)           |
 |  - role, difficulty, question, transcript, scores       |
 |  - persists sessions to localStorage                    |
 +---------------------------------------------------------+
                             |
            +----------------+----------------+
            |                |                |
            v                v                v
     [Speech/Audio]    [AI Services]    [Data Layer]
```

### External APIs & Services

| Service | Provider | Model/API | Purpose | Called From |
|---------|----------|-----------|---------|------------|
| **Streaming STT** | Deepgram | `nova-2` (WebSocket) | Real-time transcript with filler word detection | `useDeepgramTranscription.ts` via `api/key.js` |
| **Text-to-Speech** | OpenAI | `tts-1` (alloy/nova/etc) | Read questions & nudges aloud | `openai.ts → textToSpeech()` |
| **TTS Fallback** | Browser | SpeechSynthesis API | Fallback if OpenAI TTS fails | `useTTS.ts` |
| **STAR Scoring** | OpenAI | `gpt-4o-mini` | Score answer on 6 STAR dimensions | `openai.ts → scoreAnswer()` |
| **Pause Analysis** | OpenAI | `gpt-4o-mini` | Decide if user is done speaking | `openai.ts → analyzePause()` |
| **Question Gen** | OpenAI | `gpt-4o-mini` | Generate resume-tailored questions | `openai.ts → generateResumeQuestion()` |
| **Voice Detection** | @ricky0123/vad-web | ONNX neural net | Detect speech start/stop | `useAudioRecorder.ts` |
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
    +---> AudioContext + AnalyserNode --> WaveformVisualizer (canvas)
             (also: DynamicsCompressor
              for normalization)

                                     On submit/done:
                                        |
                                        v
                                  Deepgram transcript ---> Final transcript
                                   (already accumulated)        |
                                                                v
                                                         OpenAI gpt-4o-mini
                                                         (STAR scoring)
                                                                |
                                                                v
                                                   FeedbackScreen <--- ScoringResult
```

### Screens & Routes

| Route | Screen | File |
|-------|--------|------|
| `/` | SetupScreen | `src/screens/SetupScreen.tsx` |
| `/interview` | InterviewScreen | `src/screens/InterviewScreen.tsx` |
| `/feedback` | FeedbackScreen | `src/screens/FeedbackScreen.tsx` |

### Key Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useDeepgramTranscription` | `src/hooks/useDeepgramTranscription.ts` | Deepgram WebSocket streaming (real-time, filler words) |
| `useAudioRecorder` | `src/hooks/useAudioRecorder.ts` | VAD + MediaRecorder + silence detection |
| `useTTS` | `src/hooks/useTTS.ts` | OpenAI TTS playback + native fallback |
| `useFillerDetection` | `src/hooks/useFillerDetection.ts` | Count filler words (um, uh, like, etc.) |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| OpenAI | `src/services/openai.ts` | OpenAI calls (TTS, scoring, pause analysis, question gen) |
| Deepgram Key | `api/key.js` | Vercel serverless endpoint — exchanges env key for 60s temp key |
| AudioRecorder | `src/services/audioRecorder.ts` | MediaRecorder lifecycle |
| Supabase | `src/services/supabase.ts` | Placeholder (not implemented) |

### UI Components

| Component | File | Purpose |
|-----------|------|---------|
| WaveformVisualizer | `src/components/WaveformVisualizer.tsx` | Real-time audio waveform canvas |
| CoachingMetrics | `src/components/CoachingMetrics.tsx` | Filler count, WPM, duration |
| SilenceNudge | `src/components/SilenceNudge.tsx` | "Are you finished?" prompt |
| TranscriptPanel | `src/components/TranscriptPanel.tsx` | Live/final transcript display |
| ScoreCard | `src/components/ScoreCard.tsx` | Individual STAR dimension score |
| PerformanceSummary | `src/components/PerformanceSummary.tsx` | Overall feedback synthesis |
| RetryComparison | `src/components/RetryComparison.tsx` | Compare attempts side-by-side |
| SuggestionsList | `src/components/SuggestionsList.tsx` | 3 actionable suggestions |
| FollowUpPrompt | `src/components/FollowUpPrompt.tsx` | Coaching follow-up question |
| FlowProgress | `src/components/FlowProgress.tsx` | Progress indicator |
| DoneButton | `src/components/DoneButton.tsx` | Manual submit button |
| ActionButtons | `src/components/ActionButtons.tsx` | Retry/Next/Home navigation |

### State Management

**InterviewContext** (`src/context/InterviewContext.tsx`)
- React Context + `useReducer`
- Holds: role, difficulty, question, transcript, audio blob, filler count, scores, session history
- Persists sessions to `localStorage`

### STAR Scoring Dimensions

| Dimension | What It Measures | Scale |
|-----------|-----------------|-------|
| Situation | Context & background setup | 1-4 |
| Task | Personal responsibility clarity | 1-4 |
| Action | Concrete steps taken | 1-4 |
| Result | Outcomes & learnings | 1-4 |
| Communication | Clarity & confidence | 1-4 |
| Pacing | Answer length & balance | 1-4 |

### Environment Variables

```
VITE_OPENAI_API_KEY    — OpenAI API key (currently exposed in browser!)
DEEPGRAM_API_KEY       — Deepgram API key (server-side only, used by api/key.js)
VITE_SUPABASE_URL      — Supabase project URL (not yet used)
VITE_SUPABASE_ANON_KEY — Supabase anon key (not yet used)
```
