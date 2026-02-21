# Assumptions Log

This file tracks all assumptions made during autonomous development. Each entry includes the assumption, rationale, and impact if wrong.

---

## Architecture Assumptions

### A1: Skip Express Backend Proxy for Now
**Assumption:** Continue using `dangerouslyAllowBrowser: true` for direct OpenAI calls rather than building the Express proxy described in the TAD.
**Rationale:** The hackathon demo runs on a trusted local network. Building the proxy is significant work that doesn't improve the demo experience. The API key is in `.env` which is gitignored.
**Impact if wrong:** API key could be exposed in production. Easy to add proxy later without changing the service interface.

### A2: Skip Supabase Integration for MVP
**Assumption:** Use local seeded questions and in-memory state only. Don't implement Supabase `getQuestions()` or `saveSession()`.
**Rationale:** Supabase env vars aren't even configured. The local question bank works. Session persistence is a nice-to-have for a 48-hour hackathon demo.
**Impact if wrong:** No cross-session progress tracking. Acceptable for demo.

### A3: Resume Parsing Stays Mock for Now
**Assumption:** The resume upload feature will use enhanced mock data rather than real PDF/DOCX parsing, but I'll make the mock data more realistic and wire it into the scoring pipeline.
**Rationale:** Real resume parsing (pdf-parse, mammoth) requires new dependencies and significant work. The demo value comes from showing personalized feedback, which can be demonstrated with well-structured mock data.
**Impact if wrong:** Less impressive demo if judges notice. Mitigated by making mock data realistic.

## Scoring & AI Assumptions

### A4: Use gpt-4o-mini for Scoring Instead of gpt-4o
**Assumption:** Use `gpt-4o-mini` for the scoring endpoint to keep costs low and latency reasonable during development.
**Rationale:** The TAD suggests gpt-4o but acknowledges gpt-4o-mini as fallback. For rapid iteration, the faster/cheaper model is better. Can switch to gpt-4o for final demo.
**Impact if wrong:** Slightly less nuanced feedback. Easy to change model string.

### A5: Non-Streaming Scoring Response
**Assumption:** Implement scoring as a single non-streaming API call rather than SSE streaming.
**Rationale:** Streaming adds complexity (EventSource, incremental JSON parsing). Non-streaming is simpler and total latency is acceptable (3-8s) with a loading animation.
**Impact if wrong:** Slightly longer perceived wait. Can add streaming later.

### A6: Resume Context in Scoring Prompt
**Assumption:** When resume data is available, include it in the scoring prompt so feedback references the candidate's actual experience.
**Rationale:** This is the key differentiator - personalized feedback based on resume. The prompt can include resume summary as additional context for the LLM to reference.
**Impact if wrong:** None - this is additive to the base scoring.

## UI/UX Assumptions

### A7: Dark Theme Throughout
**Assumption:** Maintain the dark theme established in SetupScreen across all screens.
**Rationale:** SetupScreen has a polished dark aesthetic. Consistency matters for the demo.
**Impact if wrong:** None - purely cosmetic preference.

### A8: Inline Styles for Components
**Assumption:** Use inline styles (matching SetupScreen's pattern) rather than CSS modules or styled-components.
**Rationale:** SetupScreen uses inline styles extensively. Consistency > methodology. No time to introduce a new styling approach.
**Impact if wrong:** Harder to maintain long-term, but irrelevant for hackathon.

### A9: ScoreLevel Color Mapping
**Assumption:** Map score levels to colors: Getting Started = #ef4444 (red), Developing = #f59e0b (amber), Solid = #22c55e (green), Strong = #3b82f6 (blue/highlight).
**Rationale:** PRD says "warm tones" and "never red/green pass/fail." But the PRD also contradicts itself by saying amber for room to improve, soft green for strengths. I'll use a warm gradient that feels encouraging.
**Impact if wrong:** Easy color change.

### A10: Progress Bar Percentage Mapping
**Assumption:** Map score levels to percentages: Getting Started = 25%, Developing = 50%, Solid = 75%, Strong = 100%.
**Rationale:** Need numeric values for progress bar widths. Even spacing is intuitive.
**Impact if wrong:** Could adjust percentages. Non-critical.

## Technical Assumptions

### A11: Browser Compatibility = Chrome Only
**Assumption:** Only target Chrome. Web Speech API, MediaRecorder, and VAD all work best in Chrome.
**Rationale:** Hackathon demo will use Chrome. PRD acknowledges Chrome-only for Web Speech API.
**Impact if wrong:** None for hackathon context.

### A12: No Error Boundary Components
**Assumption:** Skip React error boundaries for now. Use try/catch in async functions.
**Rationale:** Time is better spent on features. Errors during demo can be handled by refreshing.
**Impact if wrong:** Uncaught errors could crash the app during demo. Low risk with testing.

### A13: TypeScript Strict Mode Compliance
**Assumption:** All new code will pass TypeScript strict mode checks (`noUnusedLocals`, `noUnusedParameters`).
**Rationale:** The tsconfig enforces this. Non-compliant code won't build.
**Impact if wrong:** Build failures. Must comply.

---

## Changes Log

| Timestamp | What Changed | Files Modified |
|-----------|-------------|----------------|
| Session Start | Initial codebase analysis | (read only) |
| Wave 1 | scoreAnswer() implementation, 5 feedback components | openai.ts, ScoreCard, SuggestionsList, FollowUpPrompt, ActionButtons, RetryComparison |
| Wave 2 | FeedbackScreen redesign, 5 interview components, scoring wiring, question bank expansion | FeedbackScreen, QuestionDisplay, TranscriptPanel, DoneButton, WaveformVisualizer, CoachingMetrics, SilenceNudge, InterviewScreen, types, context, questions.ts |
| Wave 3 | InterviewScreen restyle, WPM/filler wiring, resume data wiring, navigation guards, category/difficulty descriptions | InterviewScreen, InterviewContext, types, SetupScreen, App.tsx, questions.ts |
| Wave 4 | PerformanceSummary, TranscriptReview, timer/keyboard shortcuts, resume question generation, localStorage persistence, error handling, branding | PerformanceSummary, TranscriptReview, InterviewScreen, FeedbackScreen, openai.ts, types, context, index.html, index.css, favicon.svg |
| Wave 5 | Playwright test infrastructure + 126 tests (45 passing, 4 skipped) | playwright.config.ts, tests/helpers.ts, tests/*.spec.ts |
| Wave 6 | PerformanceSummary wiring, short transcript handling, scoring timeout, TTS fallback, branding | FeedbackScreen, InterviewScreen, openai.ts, index.html, index.css, favicon.svg |
| Wave 7 | Few-shot scoring examples, animated score reveal, responsive design, question preview | openai.ts, ScoreCard, SetupScreen, InterviewScreen, FeedbackScreen, all components |
| Wave 8 | Silence detection UX, audio playback, network failure handling, visual polish | SilenceNudge, TranscriptReview, InterviewScreen, index.css |
| Wave 9 | Transcript highlights, FlowProgress breadcrumb, mic disconnection, performance optimization, Quick Start, category counts | FeedbackScreen, FlowProgress, InterviewScreen, SetupScreen, all components (React.memo) |
| Wave 10 | Communication/Pacing prompt details, TTS voice selection, VAD tuning, interview timer state | openai.ts, SetupScreen, useAudioRecorder, InterviewContext |
| Wave 11 | TTS speed control, speech recognition restart improvements, word count in scoring | openai.ts, useTTS, useSpeechRecognition, InterviewContext, SetupScreen, InterviewScreen |
| Wave 12 | Scoring quality tests, scoring consistency (temp=0, seed=42), audio normalization, complete E2E journey tests | tests/scoring-quality.test.ts, tests/scoring-consistency.test.ts, tests/complete-journey.spec.ts, openai.ts, useAudioRecorder, InterviewScreen, RetryComparison, InterviewContext, helpers.ts |

