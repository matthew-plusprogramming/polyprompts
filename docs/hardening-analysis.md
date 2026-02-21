# Hardening Analysis — Polyprompts

Post-merge audit of the unified codebase. 21 issues identified across security, memory safety, error resilience, and browser compatibility.

---

## Critical (Fix Before Production)

### 1. API Key Exposed in Browser
- **File**: `src/services/openai.ts:16-19`
- **Problem**: OpenAI API key accessed via `VITE_OPENAI_API_KEY` with `dangerouslyAllowBrowser: true`. Key is visible in network requests, browser devtools, and extensions.
- **Impact**: Attackers can drain API quota (costs $$$).
- **Fix**: Move all OpenAI calls behind a backend proxy (Express/Vercel serverless). Frontend calls `/api/score`, `/api/tts`, etc. Backend holds the key server-side with rate limiting and auth.

### 2. Dual Mic Streams Race Condition
- **Files**: `src/components/WaveformVisualizer.tsx:141-155`, `src/hooks/useAudioRecorder.ts:140-157`
- **Problem**: WaveformVisualizer independently calls `getUserMedia()` for its AnalyserNode. useAudioRecorder also requests a mic stream for VAD + recording. Two simultaneous streams can conflict — one may fail silently, or both consume double CPU/memory.
- **Impact**: VAD fails silently, recording stops, memory leak, high CPU.
- **Fix**: WaveformVisualizer should accept an optional `MediaStream` prop from the recording hook instead of requesting its own. When a stream is passed, use it for visualization. When not passed (e.g., `phase === 'ready'`), request its own.

### 3. AudioContext Leak in handleStart
- **File**: `src/screens/InterviewScreen.tsx:244`
- **Problem**: `new AudioContext()` is created for mic permission priming. On the failure path it's properly closed, but on the success path it's passed to `startRecording()` and never explicitly closed afterward. Each repeated Start leaks one AudioContext.
- **Impact**: Browser becomes unresponsive after ~10-20 leaked contexts.
- **Fix**: Close the permission-priming AudioContext after permission is granted, before creating the VAD's own context. Or track it in a ref and close on cleanup.

### 4. No Error Boundary
- **File**: `src/App.tsx`
- **Problem**: No React error boundary wraps the app. Any unhandled error in InterviewScreen, WaveformVisualizer, or async callbacks crashes the entire app — blank white screen, all state lost including recording.
- **Impact**: Data loss, users unable to recover.
- **Fix**: Create `src/components/ErrorBoundary.tsx` using `componentDidCatch`. Wrap `<BrowserRouter>` in App.tsx. Show friendly error message with "Return to Home" button.

---

## High Priority

### 5. Async State Updates After Unmount
- **Files**: `src/hooks/useAudioRecorder.ts:247-282`, `src/hooks/useSpeechRecognition.ts`
- **Problem**: `stop()` is async and calls `setIsRecording(false)`, etc. If component unmounts before resolution, React logs memory leak warnings.
- **Fix**: Track mounted state with a ref. Check before calling setState in async callbacks.

### 6. TTS Blob Cache Unbounded
- **Files**: `src/services/openai.ts:24-42`
- **Problem**: `ttsCache: Map<string, Blob>` grows without limit. Each unique (voice, speed, text) combination adds 100-500KB. Never cleared.
- **Fix**: Add LRU eviction with max 10 entries. Add timestamp tracking and evict oldest on overflow.

### 7. localStorage Quota Risk
- **File**: `src/context/InterviewContext.tsx:116-122`
- **Problem**: `sessionHistory` grows unbounded. After ~100 interviews with long transcripts, 5-10MB quota is exceeded. `setItem` throws silently.
- **Fix**: Cap at 20 sessions, evict oldest. Wrap `setItem` in try/catch with quota recovery. Consider IndexedDB for larger data.

### 8. Unvalidated OpenAI Responses
- **File**: `src/services/openai.ts:94-101`
- **Problem**: `analyzePause()` does `JSON.parse(content)` then accesses `.verdict` without shape validation. Malformed responses cause undefined behavior.
- **Fix**: Validate parsed shape before accessing fields. Return safe default (`'ask'`) on any validation failure.

### 9. Speech Recognition Restart Loop
- **File**: `src/hooks/useSpeechRecognition.ts:16-53`
- **Problem**: `onend` triggers immediate restart with `countAgainstLimit: false`. If the API keeps auto-ending, restarts accumulate rapidly (50+ in 10 seconds). No windowed rate tracking.
- **Fix**: Add windowed restart tracking (max 5 restarts per 10s window). If exceeded, set `isAvailable: false` and stop retrying.

### 10. Phase State Machine Lacks Transition Locking
- **File**: `src/screens/InterviewScreen.tsx:162-207, 301-387`
- **Problem**: `handleSilenceStart()` can fire while `handleDone()` is running. Both call `speech.stop()`, close AudioContext, and navigate. TTS calls can overlap (question + nudge simultaneously). Ref-based flags are manual and fragile.
- **Fix**: Add a shared `isTransitioning` ref. Both handlers check and acquire it before proceeding. Release in `finally` blocks.

### 11. Missing Timeouts on API Calls
- **Files**: `src/services/openai.ts:26-43, 50-101`
- **Problem**: `textToSpeech()` and `analyzePause()` have no timeouts. On slow networks, UI hangs indefinitely in "analyzing..." or "speaking question..." state. Only `scoreAnswer()` has a 30s timeout.
- **Fix**: Wrap all OpenAI calls with `Promise.race` against a timeout (15s for TTS, 10s for analyzePause, 30s for scoring).

---

## Medium Priority

### 12. No Fallback for Total Transcription Failure
- **File**: `src/screens/InterviewScreen.tsx:333-346`
- **Problem**: If both Whisper and Web Speech API fail, `transcript` is empty. Scoring is skipped, user sees blank feedback. No error message.
- **Fix**: Detect empty transcript after both paths. Show explicit error on feedback screen ("Transcription failed, please try again").

### 13. Unhandled Promise Rejections
- **Files**: `src/screens/InterviewScreen.tsx:357, 282-292`
- **Problem**: Some async operations swallow errors silently (`.catch(() => {})`). Makes debugging production issues difficult.
- **Fix**: Always log errors, even for fire-and-forget operations. Use `console.debug` for non-critical, `console.error` for critical.

### 14. Browser Compatibility Not Checked
- **Files**: `src/hooks/useSpeechRecognition.ts`, `src/hooks/useAudioRecorder.ts`
- **Problem**: Web Speech API is Chrome/Edge only. VAD is Chromium only. Firefox/Safari users get cryptic errors. No upfront compatibility check.
- **Fix**: Add `useAppCompatibility` hook. Check for `SpeechRecognition`, `getUserMedia`, `AudioContext` at startup. Show friendly browser requirement banner if missing.

### 15. No Environment Variable Validation
- **File**: `src/services/openai.ts:16-20`
- **Problem**: If `VITE_OPENAI_API_KEY` is missing, app loads fine but all API calls fail with cryptic auth errors. User discovers this only after recording a full answer.
- **Fix**: Validate env vars at startup in `main.tsx`. Show clear error message if missing. Check `sk-` prefix format.

### 16. InterviewContext Not Reset on Mid-Recording Unmount
- **File**: `src/screens/InterviewScreen.tsx`
- **Problem**: If user force-navigates away mid-recording, context stays in `isRecording: true`. Stale state on return.
- **Fix**: Add unmount cleanup effect that dispatches `STOP_RECORDING` if still recording.

### 17. FeedbackScreen No Guard for Null Result
- **File**: `src/screens/FeedbackScreen.tsx`
- **Problem**: Direct navigation to `/feedback` renders "0%" and "Pending" everywhere. No redirect guard.
- **Fix**: Add `useEffect` guard: if `!state.currentResult`, navigate to `/`.

### 18. Volume Monitor Interval Cleanup Edge Case
- **File**: `src/hooks/useAudioRecorder.ts:61-118`
- **Problem**: If `startVolumeMonitor()` throws partway through setup, interval may not be properly assigned to ref.
- **Fix**: Wrap setup in try/catch, ensure interval is cleared on any error.

---

## Low Priority

### 19. No Rate Limiting on API Calls
- **Problem**: Rapid "Try Again" clicks hammer OpenAI API. Could exceed rate limits or run up costs.
- **Fix**: Add debouncing on retry actions. Consider request queue with backoff.

### 20. Speech Recognition Error Types Incomplete
- **File**: `src/hooks/useSpeechRecognition.ts:94-128`
- **Problem**: `service-unavailable` falls through to default retry. Should be treated as permanent failure.
- **Fix**: Expand error switch to handle `service-unavailable`, `bad-grammar` as non-retriable.

### 21. WaveformVisualizer Logo Not Preloaded
- **File**: `src/components/WaveformVisualizer.tsx:78-92`
- **Problem**: Logo loaded async on first draw, causing brief flicker.
- **Fix**: Preload image in a `useEffect` with `onload` callback. Delay first canvas draw until loaded.

---

## Recommended Implementation Order

1. **Critical (Sprint 1)**: Backend proxy for API key (#1), shared mic stream (#2), AudioContext cleanup (#3), error boundary (#4)
2. **High (Sprint 2)**: Unmount cleanup (#5), cache limits (#6, #7), API response validation (#8), restart loop fix (#9), transition locking (#10), timeouts (#11)
3. **Medium (Sprint 3)**: Transcription fallback (#12), browser compat (#14), env validation (#15), FeedbackScreen guard (#17)
4. **Low (Backlog)**: Rate limiting (#19), error types (#20), logo preload (#21)
