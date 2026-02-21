# CLAUDE.md — PolyPrompts (Starly)

## Project Overview
Behavioral interview coaching app. Users select a role/difficulty, hear an interview question via TTS, speak their answer, and receive STAR framework scoring with coaching feedback.

## Tech Stack
- **Frontend:** React + TypeScript, Vite, React Router
- **Hosting:** Vercel (static + serverless functions in `api/`)
- **AI:** OpenAI (TTS via `tts-1`, scoring via `gpt-4o-mini`, pause analysis, question generation)
- **STT:** Deepgram nova-2 via WebSocket streaming (`useDeepgramTranscription` hook + `api/key.js` serverless endpoint)
- **Audio:** VAD (`@ricky0123/vad-web`), MediaRecorder, AudioContext for waveform visualization
- **State:** React Context + `useReducer` (`InterviewContext`)

## Key Architecture
- **Screens:** `SetupScreen` → `InterviewScreen` → `FeedbackScreen` (routes: `/`, `/interview`, `/feedback`)
- **Hooks:** `useDeepgramTranscription` (STT), `useAudioRecorder` (VAD + recording), `useTTS` (playback), `useFillerDetection`
- **Services:** `src/services/openai.ts` (all OpenAI calls), `src/services/audioRecorder.ts` (MediaRecorder wrapper)
- **Serverless:** `api/key.js` (Deepgram temp key exchange)

## Build & Dev
```bash
npm install
npm run dev          # Vite dev server (localhost:5173)
npm run build        # Production build
npm run lint         # ESLint
```

## Environment Variables
- `VITE_OPENAI_API_KEY` — OpenAI API key (client-side, used for TTS/scoring/pause analysis)
- `DEEPGRAM_API_KEY` — Deepgram API key (server-side only, used by `api/key.js`)
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Supabase (placeholder, not yet implemented)

## Important Conventions
- Keep `docs/architecture.md` and `docs/tad.md` in sync when making architectural changes
- STAR scoring dimensions: Situation, Task, Action, Result, Communication, Pacing (4-level scale)
- Filler word detection runs client-side on the live transcript string
- Audio pipeline: mic → VAD (speech detection) + Deepgram (transcription) + MediaRecorder (blob) + AnalyserNode (waveform)
