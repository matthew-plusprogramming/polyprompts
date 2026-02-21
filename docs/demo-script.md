# PolyPrompts Demo Script

## Pre-Demo Checklist
- [ ] Chrome browser open, mic connected and tested
- [ ] App running on localhost:5173
- [ ] OpenAI API key configured in .env
- [ ] Quiet room / good mic quality
- [ ] Clear browser localStorage for a clean start

---

## Opening (30 seconds)

**Say:**
"Students preparing for job interviews have no realistic way to practice. Their options today are: practice alone with no feedback, practice with friends which is inconsistent, or pay for coaching which is expensive and hard to schedule. The result is students walk into real interviews underprepared, anxious, and completely unaware of their own habits — filler words, rambling, missing structure. PolyPrompts gives them a realistic AI coach they can use anytime."

**[Show the landing page]**

---

## Demo Flow (4 minutes)

### 1. Setup (30 seconds)

**[Show the landing page with role/difficulty/category selectors]**

**Say:**
"Setup is designed to feel like pressing play, not filling out a form. Three decisions: role, difficulty, and category — each with a small, focused set of options."

**Actions:**
- Point out the four roles (SWE Intern, PM Intern, DS Intern, Design Intern) and explain each filters the question bank to role-relevant scenarios
- Point out the three difficulty levels and read the descriptions aloud: Easy is "straightforward prompts about common experiences," Hard is "complex situations with constraints and tradeoffs"
- Point out the question count badge on each category chip — this shows how many questions exist for the current role/difficulty combo
- Click **SWE Intern** → **Medium** → **Teamwork**
  - The selected question for this path is: *"Tell me about a time you worked on a team to complete a project."* (Question ID 1) — easy to demo, universally relatable
- Briefly toggle to **"From My Resume"** mode and show the PDF/text upload zone
  - **Say:** "In resume mode, the AI scores answers in the context of the candidate's own background — their projects, their tech stack, their experiences."
- Toggle back to **Generic**, click **Start Interview**

---

### 2. Interview Experience (90 seconds)

**[The interview screen loads]**

**Say:**
"The question is read aloud by TTS. Notice the waveform animation as it plays — the app waits for the audio to finish before starting to record, so you never accidentally cut yourself off."

**Actions:**
- Let TTS finish reading: *"Tell me about a time you worked on a team to complete a project."*
- Point out the live transcript populating below as you speak
- Point out the coaching metrics panel (expand it): filler word count, words per minute, estimated duration
- Point out the mic level indicator pulsing with your voice

**Speak a deliberate STAR answer (target 60–90 seconds):**

> "In my sophomore year, our CS 201 class had a semester-long group project — we were building a to-do app with a React front end and a Node backend. I was responsible for the API layer, but two weeks before the deadline our backend teammate had a family emergency and had to step away. The task fell to me to absorb his portion on top of my own while we only had one week left. I stayed two extra evenings in the library, rewrote the authentication endpoints from scratch, and documented everything so the team could keep moving without me becoming a bottleneck. We submitted on time, got full marks on the backend portion, and the professor cited our API documentation as an example to the class. The big takeaway for me was that clear documentation is an insurance policy for the whole team — not just a nice-to-have."

**After finishing:**
- Point out the recording timer showing elapsed time
- Click **"I'm Done"**

---

### 3. Feedback (90 seconds)

**[The "Analyzing..." loading state appears]**

**Say:**
"The app sends the Whisper transcript to GPT-4o along with the STAR rubric. Notice the loading state is named — it says Analyzing, not just a spinner — so the user knows something meaningful is happening."

**[Feedback screen loads]**

**Walk through the sections top to bottom:**

1. **Performance Summary**
   - **Say:** "The top card gives a plain-language overall read — what worked, what needs work. No letter grades. The rubric uses qualitative labels like 'Strong' or 'Developing' on purpose, because grades make people defensive and we want them to keep practicing."

2. **STAR ScoreCard**
   - Expand a couple of the STAR rows (Situation, Task, Action, Result)
   - **Say:** "Every row has an explanation that quotes or references what was actually said. This is evidence-based feedback — the AI has to justify its score with a line from the transcript, not just give a number in a vacuum."
   - Point out the progress bar animations on each dimension

3. **Suggestions**
   - **Say:** "The suggestions section shows two or three specific, actionable items — not generic tips. If you said 'um' twelve times, it tells you that. If your Result was vague, it tells you the specific moment it went vague."

4. **Coach's Question**
   - **Say:** "This is the feature I'm most proud of. After every answer the coach asks one targeted follow-up — the kind of question a real interviewer would ask to probe a weak spot. In a real interview, this is usually where candidates get knocked off script."

5. **Transcript + Playback**
   - Point out the full transcript with the "Play Recording" button
   - **Say:** "You can re-listen to yourself. Most people have never heard themselves answer an interview question. That alone changes behavior."

6. **STAR Tips**
   - Briefly scroll to show the framework reference at the bottom
   - **Say:** "For users who are new to STAR, the tips card is always available at the bottom — not hidden behind a help modal."

---

### 4. Retry Flow (30 seconds)

**[Click "Try Again"]**

**Say:**
"The retry flow is designed for deliberate practice — not just repetition. You see your previous score alongside the new one so every attempt has a direct comparison."

**Actions:**
- Give a noticeably shorter, less structured answer (e.g., 20–30 seconds, skip the Result entirely)
- After submitting, point out the **RetryComparison** component showing the two attempts side by side
- Point out the **Score Trend Chart** showing the delta across STAR dimensions
- **Say:** "The chart makes regression visible too — if your Result score drops, you see it immediately. The goal is deliberate improvement, not false encouragement."

---

## Closing (30 seconds)

**Say:**
"PolyPrompts helps college students practice behavioral interviews with a full AI coaching pipeline. The technical stack is React with TypeScript, OpenAI GPT-4o for STAR scoring, Whisper for speech-to-text, and the browser's native TTS for question delivery. Voice Activity Detection gates the recorder so we only send audio when the user is actually speaking. Every piece of feedback is grounded in the transcript — we designed against hallucinated critique from the start.

The rubric doesn't get stricter at higher difficulty — the questions get harder, but a student at any level gets the same honest evaluation. That's by design: we want students to feel safe failing here so they don't fail in the room that matters."

---

## Backup Plans

| Failure Mode | What Happens | What to Say |
|---|---|---|
| TTS fails to load | Question text displays prominently on screen, interview continues without audio | "The question is always shown as text — audio is an enhancement, not a dependency." |
| Mic permission denied or mic hardware fails | Show the text input fallback; type a sample answer to demonstrate the feedback pipeline | "The feedback pipeline is fully functional from text input — the audio path is additive." |
| GPT-4o scoring call fails | The no-result fallback UI renders with a graceful error message | "In production we'd retry with exponential backoff. The UI is designed to never leave the user on a blank screen." |
| Network drops mid-session | Offline banner appears at the top; explain that the app saves session state to localStorage | "Previous sessions are persisted locally — you can review past feedback without a connection." |
| Question bank looks empty | Confirm role + difficulty + category combo has questions (e.g., Hard + Design Intern has fewer entries) | Switch to SWE Intern + Medium to guarantee question availability. |

---

## Key Talking Points for Judges

### Technical (50% of rubric)
- Full audio pipeline: VAD detects speech onset/offset → MediaRecorder captures audio → Whisper transcribes → GPT-4o scores against STAR rubric with structured JSON output
- Prompt engineering: the scoring prompt injects the full transcript, the question text, the selected role, and optionally the resume context — not just "score this answer"
- Edge cases handled: empty transcript fallback, TTS failure fallback, mic permission denial fallback, network-offline banner

### Impact (20% of rubric)
- Target user: college students preparing for SWE / PM internship interviews — a very specific, underserved population
- Before PolyPrompts: practice alone with no feedback, or pay $100+/hr for a coach
- After PolyPrompts: structured feedback on every attempt, available at 2am the night before the interview

### Product (10% of rubric)
- One primary flow: Setup → Interview → Feedback → (optional) Retry
- Setup completes in under 30 seconds with sensible defaults (SWE Intern, Medium, pre-selected)
- The demo feels like a product because it has real failure handling, loading states with labels, and animations that convey meaning (waveform, progress bars, score trend chart)

### Use of AI (10% of rubric)
- AI is doing something meaningfully hard: evaluating spoken behavioral answers against a structured rubric and generating evidence-cited feedback
- Model choice is deliberate: GPT-4o for reasoning, Whisper for speech-to-text (not browser Web Speech API, which has no transcript export), TTS for realistic question delivery
- Resume mode personalizes the scoring prompt with candidate context — the AI asks "given this person's background, was that Result specific enough?"

### Ethics (10% of rubric)
- Qualitative labels instead of numeric grades reduce the risk of score-chasing behavior
- Every suggestion must cite the transcript — designed to prevent hallucinated critique
- The Coach's Question is framed as a follow-up prompt, not a verdict — users are encouraged to re-answer, not penalized
- Explicit UI text states the AI coach is a practice tool, not a hiring oracle
- No interview audio is stored server-side; recordings live only in the browser session

---

## Recommended Demo Question

For the live demo, use this question from the question bank:

> **Question ID 1** — *"Tell me about a time you worked on a team to complete a project."*
> Role: SWE Intern | Difficulty: Easy | Category: Teamwork

**Why this question works for a demo:**
- Universally relatable — judges can evaluate answer quality themselves
- Short enough that a 75-second scripted answer covers all four STAR components cleanly
- The feedback on this question will show a high Action score (easy to demonstrate "I" statements) and a medium Result score if you forget to quantify — which creates an interesting coaching moment to show the judges
