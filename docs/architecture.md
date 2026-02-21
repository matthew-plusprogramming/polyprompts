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
6. **Processing** - Audio transcribed (Whisper), answer scored against STAR framework
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
| **Live STT** | Browser | Web Speech API | Real-time transcript during speaking | `useSpeechRecognition.ts` |
| **Authoritative STT** | OpenAI | `whisper-1` | Accurate post-recording transcript | `openai.ts → transcribeAudio()` |
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
    +---> Web Speech API ------------> Live transcript (displayed in UI)
    |        (continuous, interim)
    |
    +---> VAD (ricky0123/vad-web) ---> Detects speech start/stop
    |        (ONNX neural net)              |
    |                                       v
    +---> MediaRecorder ----------------> Audio Blob
    |        (webm/opus or mp4)              |
    |                                        v
    +---> AudioContext + AnalyserNode --> WaveformVisualizer (canvas)
             (also: DynamicsCompressor       |
              for normalization)             v
                                     On submit/done:
                                        |
                                        v
                                  OpenAI Whisper -----> Final transcript
                                   (whisper-1)              |
                                        |                   v
                                        |            OpenAI gpt-4o-mini
                                        |            (STAR scoring)
                                        |                   |
                                        v                   v
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
| `useSpeechRecognition` | `src/hooks/useSpeechRecognition.ts` | Web Speech API wrapper (auto-restart, interim results) |
| `useAudioRecorder` | `src/hooks/useAudioRecorder.ts` | VAD + MediaRecorder + silence detection |
| `useTTS` | `src/hooks/useTTS.ts` | OpenAI TTS playback + native fallback |
| `useFillerDetection` | `src/hooks/useFillerDetection.ts` | Count filler words (um, uh, like, etc.) |

### Key Services

| Service | File | Purpose |
|---------|------|---------|
| OpenAI | `src/services/openai.ts` | All OpenAI calls (TTS, Whisper, scoring, pause analysis, question gen) |
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
VITE_SUPABASE_URL      — Supabase project URL (not yet used)
VITE_SUPABASE_ANON_KEY — Supabase anon key (not yet used)
```
