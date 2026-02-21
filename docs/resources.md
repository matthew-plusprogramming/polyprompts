# Developer Resources

Quick-reference links for every technology in our stack. Skim the quickstarts before the hackathon starts — you don't need to read everything, just know where to look when you get stuck.

---

## React

| What | Link |
|------|------|
| Docs home | [react.dev](https://react.dev/) |
| Quick start | [react.dev/learn](https://react.dev/learn) |
| useReducer (our state management) | [react.dev/reference/react/useReducer](https://react.dev/reference/react/useReducer) |
| useContext (sharing state across screens) | [react.dev/reference/react/useContext](https://react.dev/reference/react/useContext) |
| Context + useReducer guide | [Passing Data Deeply with Context](https://react.dev/learn/passing-data-deeply-with-context) |
| Full API reference | [react.dev/reference/react](https://react.dev/reference/react) |

---

## Vite

| What | Link |
|------|------|
| Getting started | [vite.dev/guide](https://vite.dev/guide/) |
| Env variables & modes | [vite.dev/guide/env-and-mode](https://vite.dev/guide/env-and-mode) |
| Config reference | [vite.dev/config](https://vite.dev/config/) |

We use `VITE_` prefixed env vars to expose API keys to the client. See the env variables page for how this works.

---

## React Router

| What | Link |
|------|------|
| Docs home | [reactrouter.com](https://reactrouter.com/) |
| Quick start tutorial | [reactrouter.com/tutorials/quickstart](https://reactrouter.com/tutorials/quickstart) |
| Picking a mode (Library vs Framework) | [reactrouter.com/start/modes](https://reactrouter.com/start/modes) |
| Routing guide | [reactrouter.com/start/framework/routing](https://reactrouter.com/start/framework/routing) |

We're using Library Mode (traditional `<BrowserRouter>` + `<Routes>` + `<Route>`), not Framework Mode. Three routes: `/`, `/interview`, `/feedback`.

---

## Supabase

| What | Link |
|------|------|
| Docs home | [supabase.com/docs](https://supabase.com/docs) |
| React quickstart | [Quickstart: React](https://supabase.com/docs/guides/getting-started/quickstarts/reactjs) |
| JS client reference | [supabase-js Reference](https://supabase.com/docs/reference/javascript/introduction) |
| Creating tables | [Database: Tables](https://supabase.com/docs/guides/database/tables) |
| Inserting data | [.insert()](https://supabase.com/docs/reference/javascript/insert) |
| Querying data | [.select()](https://supabase.com/docs/reference/javascript/select) |
| Database overview | [Database Overview](https://supabase.com/docs/guides/database/overview) |

Start with the React quickstart — it covers project creation, installing `@supabase/supabase-js`, initializing the client, and making your first query.

---

## OpenAI API

### General

| What | Link |
|------|------|
| Platform docs | [platform.openai.com/docs](https://platform.openai.com/docs/overview/) |
| Developer quickstart | [Quickstart](https://platform.openai.com/docs/quickstart) |
| Node.js SDK (npm) | [openai on npm](https://www.npmjs.com/package/openai) |
| SDK GitHub repo | [openai/openai-node](https://github.com/openai/openai-node) |
| Libraries overview | [platform.openai.com/docs/libraries](https://platform.openai.com/docs/libraries) |

Install: `npm install openai`

### Chat Completions (scoring, feedback, follow-up questions)

| What | Link |
|------|------|
| Chat Completions guide | [Chat Completions](https://platform.openai.com/docs/guides/chat-completions) |
| API reference | [Create Chat Completion](https://platform.openai.com/docs/api-reference/chat/create) |
| Structured Outputs (JSON mode) | [Structured Outputs Guide](https://platform.openai.com/docs/guides/structured-outputs) |

We use `response_format: { type: "json_object" }` to guarantee valid JSON from the scoring prompt. The Structured Outputs guide explains how this works.

### Speech-to-Text / Whisper (transcribing user answers)

| What | Link |
|------|------|
| Speech to Text guide | [Speech to Text](https://platform.openai.com/docs/guides/speech-to-text) |
| Audio API reference | [Audio API](https://platform.openai.com/docs/api-reference/audio/) |

Whisper accepts webm files up to 25MB. We send the full audio blob after the user clicks "I'm done."

### Text-to-Speech (interviewer voice)

| What | Link |
|------|------|
| Text to Speech guide | [Text to Speech](https://platform.openai.com/docs/guides/text-to-speech) |
| Create Speech reference | [Create Speech](https://platform.openai.com/docs/api-reference/audio/createSpeech) |

We use model `tts-1` and voice `alloy`. The guide lists all available voices if you want to test alternatives.

---

## Web Speech API (live transcript)

| What | Link |
|------|------|
| Overview | [Web Speech API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) |
| Using the Web Speech API (guide) | [Using the Web Speech API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) |
| SpeechRecognition interface | [SpeechRecognition — MDN](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) |

Key settings: `continuous = true`, `interimResults = true`. Chrome-only in practice. The "Using" guide has a complete working example.

---

## MediaRecorder API (audio capture)

| What | Link |
|------|------|
| Overview | [MediaStream Recording API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API) |
| Using the API (guide) | [Using the MediaStream Recording API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaStream_Recording_API/Using_the_MediaStream_Recording_API) |
| MediaRecorder interface | [MediaRecorder — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder) |
| Constructor | [MediaRecorder() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/MediaRecorder) |

We capture audio via `getUserMedia()`, record with MediaRecorder, then send the resulting blob to Whisper. The "Using" guide walks through this exact flow.

---

## Web Audio API (waveform visualization)

| What | Link |
|------|------|
| Overview | [Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API) |
| Visualizations guide | [Visualizations with Web Audio API — MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Visualizations_with_Web_Audio_API) |
| AnalyserNode | [AnalyserNode — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode) |
| getByteTimeDomainData() | [getByteTimeDomainData() — MDN](https://developer.mozilla.org/en-US/docs/Web/API/AnalyserNode/getByteTimeDomainData) |

The visualizations guide shows exactly how to build an oscilloscope-style waveform using `<canvas>` and `requestAnimationFrame`. This is what powers the interviewer's waveform animation.

---

## TypeScript

| What | Link |
|------|------|
| Docs home | [typescriptlang.org](https://www.typescriptlang.org/) |
| TS in 5 minutes (quickest intro) | [TypeScript for JS Programmers](https://www.typescriptlang.org/docs/handbook/typescript-in-5-minutes.html) |
| The Handbook | [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) |
| Everyday Types (most useful reference) | [Everyday Types](https://www.typescriptlang.org/docs/handbook/2/everyday-types.html) |

If you're less familiar with TS, read the 5-minute intro and the Everyday Types page. That covers 90% of what you'll need during the hackathon.
