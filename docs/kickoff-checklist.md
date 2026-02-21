# Poly Prompts — Hackathon Kickoff Checklist

## Pre-Hackathon Prep (Tech Lead — before kickoff)

- [ ] Scaffold the repo: `npm create vite@latest` with React + TypeScript
- [ ] Install core deps: `@supabase/supabase-js`, `openai`, router
- [ ] Set up folder structure with placeholder files for each screen (Setup, Interview, Feedback)
- [ ] Get basic routing working so frontend devs can work in parallel
- [ ] Push to GitHub, give everyone access
- [ ] Create Supabase project and basic schema (sessions, questions, scores)
- [ ] Get OpenAI API key set up and loaded with credits (GPT, Whisper, TTS)
- [ ] Create `.env.example` with all required keys
- [ ] Seed 5-8 behavioral interview questions across Easy / Medium / Hard
- [ ] Draft v1 of the scoring prompt with Backend/AI Dev

---

## Team Assignments

| Person | Owns | Primary Screen/Area |
|--------|------|-------------------|
| **Tech Lead (Matthew)** | Audio pipeline, project scaffolding, system integration | STT/TTS, end-to-end wiring |
| **Product Lead** | UX design, demo script, user flow | Setup screen, overall polish |
| **Ethics Lead** | Responsible AI, failure modes, bias review | Ethics presentation section + general dev help |
| **Frontend Dev A** | Live interview experience | `/interview` — transcript, waveform, metrics, "I'm done" button |
| **Frontend Dev B** | Feedback and retry flow | `/feedback` — scorecard, suggestions, retry comparison |
| **Backend/AI Dev** | Supabase, OpenAI prompts, scoring engine | API layer, question bank, prompt engineering |

**Rule: own your screen. Don't touch someone else's screen without talking to them first.**

---

## Integration Contracts

Agree on these data shapes before anyone starts coding. If you change a contract, announce it.

### Scoring API

**Input:**
```json
{
  "transcript": "string (user's full answer)",
  "question": "string (the interview question asked)"
}
```

**Output:**
```json
{
  "scores": {
    "situation": { "level": "Developing", "explanation": "..." },
    "task": { "level": "Solid", "explanation": "..." },
    "action": { "level": "Getting Started", "explanation": "..." },
    "result": { "level": "Strong", "explanation": "..." },
    "communication": { "level": "Solid", "explanation": "..." },
    "pacing": { "level": "Developing", "explanation": "..." }
  },
  "suggestions": [
    "Your action section was 15 seconds — try expanding with one concrete detail about how you did it.",
    "You said 'we' 8 times and 'I' twice — try owning the actions more.",
    "Add a specific metric to your result — even an estimate helps."
  ],
  "followUp": "You mentioned leading the project — what was one specific decision you made and what was the tradeoff?"
}
```

### TTS (Text-to-Speech)

**Input:** `string` (question text)
**Output:** `Blob` (audio) — play via `Audio` element

### STT (Speech-to-Text)

**Input:** `Blob` (recorded audio from MediaRecorder)
**Output:** `string` (transcript text)

---

## How We Work

### Branching
- Work on feature branches (`feat/interview-screen`, `feat/scoring-api`, etc.)
- Merge to `main` frequently — don't sit on a branch for more than a few hours
- If you're blocked by someone else's work, say something immediately

### Check-ins
- Quick standup every 4-6 hours: what's done, what's blocked, what's next
- Use the group chat for async updates between standups

### Decision-making
- Tech calls → Tech Lead
- UX/flow calls → Product Lead
- "Should we build this?" → Product Lead
- "Is this ethical?" → Ethics Lead
- If it's not in the priority stack below, the answer is probably "not yet"

---

## Priority Stack

### MUST HAVE — Hours 0-20
The single working loop. Everything else depends on this.

- [ ] Setup screen: pick role + difficulty, start interview
- [ ] TTS plays an interview question out loud
- [ ] User speaks, live transcript appears on screen
- [ ] User clicks "I'm done"
- [ ] Transcript sent to scoring API
- [ ] Feedback scorecard appears with qualitative labels + suggestions
- [ ] "Try Again" and "Next Question" buttons work

**Checkpoint: by hour 20, a judge can watch someone do one full question-answer-feedback loop.**

### SHOULD HAVE — Hours 20-36
Polish that makes the demo impressive.

- [ ] Audio waveform visualization (interviewer speaking)
- [ ] Retry with side-by-side comparison of attempts
- [ ] Silence nudge after 10 seconds
- [ ] Collapsible live coaching metrics (filler count, pace)
- [ ] Error states (mic denied, STT failure, TTS fallback)
- [ ] Pre-recorded TTS audio for demo questions (fallback)

### DO NOT TOUCH UNTIL HOUR 36
- [ ] Progress tracking dashboard
- [ ] Multiple interview types (technical, case)
- [ ] Video/camera features
- [ ] Annotated transcript highlights

### HOUR 36-48 — Demo Prep Only
- [ ] Lock features — no new code after hour 40
- [ ] Practice the 5-minute demo at least 3 times
- [ ] Test mic permissions and audio levels in the demo room
- [ ] Have pre-recorded fallbacks ready for STT/TTS failures
- [ ] Rehearse the one-sentence story: "Practice a real interview, see exactly what to fix, try again, and watch yourself get better."

---

## Ethics Checklist (for presentation)

- [ ] Document what the product does NOT claim (no hireability predictions, no pass/fail)
- [ ] Address filler-word bias against speech impediments
- [ ] Address accent/pacing bias for non-native speakers
- [ ] Explain privacy approach for audio recordings
- [ ] Show that feedback is evidence-based, not arbitrary
- [ ] Acknowledge limitations honestly — this is a practice tool, not a predictor

---

## Demo Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| TTS service down | Pre-recorded audio files for demo questions |
| STT lags or fails | Pre-recorded answer ready to show feedback flow |
| Mic permission issues | Test in demo room before presenting |
| API rate limits | Cache responses for demo questions |
| Wi-Fi issues | Have a screen recording of a successful run as last resort |
