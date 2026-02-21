# Product Requirements Document — UX Focus

---

## 1\. Problem

Students preparing for job interviews have no realistic way to practice. The options today are:

- **Practice alone** — no feedback, no accountability, no idea what "good" sounds like  
- **Practice with friends** — inconsistent quality, awkward, rarely structured  
- **Pay for coaching** — expensive, hard to schedule, doesn't scale

The result: students walk into real interviews underprepared, anxious, and unaware of their own habits (filler words, rambling, missing structure). They have no way to measure whether they're actually getting better.

---

## 2\. Who This Is For

**Primary user:** College students preparing for internship or new-grad job interviews.

They are:

- Motivated but unsure how to improve  
- Likely practicing alone, at odd hours, without a coach  
- Familiar with the *concept* of frameworks like STAR, but struggle to apply them under pressure  
- Looking for something they can use repeatedly — not a one-shot tool

**Key insight:** The user doesn't just need *questions*. They need a mirror — something that shows them what they actually sound like and gives them a clear path to improve.

---

## 3\. Core Experience

The product has one primary flow with four distinct moments. Each moment has a clear job.

### 3.1 Setup — "Get me into an interview fast"

The user's goal is to start practicing, not to configure settings. Setup should feel like pressing play, not filling out a form.

**What the user does:**

- Picks an interview type (Behavioral is the default/MVP)  
- Picks a role (e.g., SWE Intern, PM Intern) — this filters the question bank. SWE roles get technical-leaning behavioral questions (debugging, system design tradeoffs ), PM roles get stakeholder and prioritization scenarios, etc. The rubric and feedback system stay the same across roles.  
- Picks a difficulty (Easy / Medium / Hard) — this controls question complexity only. Easy \= straightforward prompts ("Tell me about a time you worked on a team"), Hard \= multi-layered scenarios with constraints ("Tell me about a time you had to influence a decision you disagreed with under a tight deadline"). The rubric does not get stricter at higher difficulties.

**UX principles at play:**

- *Hick's Law* — Minimize choices. Three decisions max, each with 2-4 options. No dropdowns with 20 items.  
- *Sensible defaults* — Pre-select "Behavioral," "SWE Intern," and "Medium" so the fastest path is one tap and go.  
- *Progressive disclosure* — Advanced options (specific company, question bank filters) can exist later but should never be visible on the first screen.

**The feel:** Quick, confident, low-stakes. "Let's do this."

---

### 3.2 Live Interview — "It feels like a real interview"

This is the core of the product. The AI asks a question out loud, the user answers out loud, and real-time coaching signals appear on screen while they speak.

**What the user sees/hears:**

- The interviewer voice asks a question via text-to-speech, accompanied by an audio waveform visualization that reacts when the interviewer speaks (no avatar or face — adds life without uncanny valley risk)  
- A live transcript of their own words appears as they speak  
- Coaching metrics (filler word count, speaking pace, STAR progress tracker) are collapsed by default behind a small toggle icon. The user can expand them if they want to glance, but nothing competes with the transcript for attention

**Critical UX decisions:**

1. **Live metrics must not distract.** The user is practicing a real skill — speaking under pressure. If the UI screams at them every time they say "um," it defeats the purpose. Metrics are collapsed by default — the user opts in to seeing them. The transcript is center stage; everything else is ambient.  
     
2. **The interviewer should feel like a person, not a chatbot.** The TTS voice, the pacing of questions, and the absence of spinners or loading bars all matter. During API wait times (STT processing, LLM feedback generation), the waveform visualization animates subtly as if the interviewer is "thinking." There should be a brief, natural pause after the user finishes before feedback appears — like a real interviewer collecting their thoughts.  
     
3. **Camera-on should feel optional, not forced.** Users practicing alone at midnight don't want to feel watched. Audio-only should be the default. Camera is an opt-in enhancement.  
     
4. **Ending the answer should be explicit.** MVP: a visible "I'm done" button with a keyboard shortcut (spacebar). Pause detection (auto-detect when the user stops talking) is a stretch enhancement. Never cut the user off mid-thought — the user controls when they're finished.  
     
5. **Handle silence with a gentle nudge.** If the user goes quiet for 10+ seconds, the coach offers a soft prompt like "Take your time — would you like me to rephrase the question?" Supportive, not pressuring. Reduces anxiety instead of adding to it.

**Technical constraints:**

- **Speech-to-text:** Use the browser's Web Speech API for the MVP (zero cost, no API key, works in Chrome). Latency target: transcript updates within 1-2 seconds of speech. If Web Speech API proves unreliable, fall back to Deepgram or AssemblyAI streaming.  
- **STAR progress tracking** operates on the complete answer after the user hits "I'm done," not on partial streaming transcript. Real-time STAR detection on partial text is too fragile for the hackathon.  
- **Text-to-speech:** Use a cloud TTS service (e.g., ElevenLabs, OpenAI TTS) for natural-sounding voice. Pre-record TTS audio for the 5-10 demo questions as a reliability fallback for the live demo.

**Error states:**

- **Mic permission denied:** Show a clear, friendly prompt explaining why mic access is needed with a "Try again" button. Do not proceed to the interview without audio .  
- **STT returns empty/garbage (noisy environment):** Show "We couldn't hear you clearly — try again in a quieter spot or move closer to your mic." Do not score silence or garbled input.  
- **TTS failure:** Fall back to displaying the question as text on screen with a note: "Audio unavailable — read the question above."

**The feel:** Focused, slightly nervous (in a good way), realistic. Like talking to a patient but attentive interviewer.

---

### 3.3 Feedback — "Show me exactly what to fix"

This is the emotional peak of the experience. The user just finished speaking and is wondering "how did I do?" This moment needs to land well.

**Session structure:** The MVP is one question per round. After the user finishes answering, they see the feedback screen. From there, they choose: **"Try again"** (same question, fresh attempt) or **"Next question"** (new question from the bank). This keeps the loop tight and avoids ambiguity about session length.

**What the user sees (MVP):**

1. **Rubric scorecard** — A visual breakdown across dimensions: Situation clarity, Task ownership, Action specificity, Result quality, Communication, Pacing. Each dimension shown as a progress bar with a qualitative label (Getting Started / Developing / Solid / Strong) and a short explanation of why. For strong answers, the scorecard highlights what the user did well with positive callouts — strengths are always surfaced, not just weaknesses.  
     
2. **Top 3 suggestions** — Ranked, specific, actionable. Not "be more specific" but "Your action section was 15 seconds — try expanding it with one concrete detail about *how* you did it."  
     
3. **Follow-up coaching prompt** — A targeted question displayed as text that pushes the user to think about the weakest part of their answer. This is a *coaching prompt the user reads*, not a second scored round. It makes the feedback feel like a session, not a test. Example: "You mentioned leading the project — what was one specific decision you made and what was the tradeoff?"  
     
4. **Action buttons** — "Try again" (redo the same question, optionally with a constraint like "Answer in under 90 seconds") or "Next question." On retry, the feedback screen shows a side-by-side comparison of the two attempts so improvement is visible even if rubric labels stay the same.

**What the user sees (Stretch):**

5. **Annotated transcript** — Their full answer with inline highlights on specific weak spots. Tap a highlight to see the suggestion tied to that moment. This is the " mirror" feature — powerful but requires mapping LLM output to specific transcript spans, which is brittle. Build the simpler feedback components first; add this if time allows.

**Critical UX decisions:**

1. **Scores should feel like progress, not grades.** Use qualitative labels (Getting Started → Developing → Solid → Strong) instead of numeric 0-4 scores. Progress bars, not numbers. Color coding uses warm tones (amber for room to improve, soft green for strengths) — never red/green pass/fail.  
     
2. **Suggestions must be tied to evidence.** Every suggestion should point to a specific moment in the transcript. "You said 'we' 8 times and 'I' twice — try owning the actions more" is powerful. "Be more confident" is useless.  
     
3. **The follow-up prompt should feel natural.** It should reference what the user actually said, not be generic.  
     
4. **Side-by-side retry comparison over raw score deltas.** LLM-based scoring has natural variance — a marginally better answer might score the same. Showing both tran scripts side-by-side with highlighted differences is more honest and more useful than relying on a number going up.

**The feel:** Honest, specific, motivating. "Oh, I see exactly what I need to work on."

---

### 3.4 Progress (Stretch Goal) — "I can see myself getting better"

After multiple sessions, the user wants to see trends. This is a stretch goal for the hackathon but important for the product story.

**What the user sees:**

- Skill trend lines over time (per rubric dimension)  
- Recurring weaknesses ("You consistently score low on Result clarity")  
- Suggested drills ("Practice: give a 30-second result statement with a metric")  
- An overall "interview readiness" score that goes up as they practice

**Critical UX decisions:**

1. **Growth framing, always.** The readiness score is not a grade. It's a progress bar. It should feel like leveling up, not being evaluated.  
     
2. **Don't show this screen until there's enough data.** One session isn't a trend. Wait until session 3+ before surfacing trends. Before that, just show session history.

**The feel:** Motivating, like a fitness tracker for interview skills.

---

## 4\. Key UX Principles — Quick Reference

These principles are operationalized in the subsections above. This table is a scannable cheat-sheet for the team.

| Principle | How It Applies | See |
| :---- | :---- | :---- |
| **Don't overwhelm during performance** | Metrics collapsed by default. Transcript is center stage. The user's focus is on *speaking*. | §3.2 |
| **Feedback is the product** | The post-answer screen is where the real value lives. Invest in the scorecard and suggestions first. | §3.3 |
| **Speed to first interview** | Setup should take under 15 seconds. Every screen before the interview is friction. | §3.1 |
| **Growth over judgment** | Qualitative labels, not numeric grades. Warm tones, not red/green. Progress bars, not scores. | §3.3 |
| **One flow, done well** | Behavioral interview, STAR rubric, one clean loop. Ship one interview type at 100%. | §3.1 |
| **Evidence-based coaching** | Every suggestion traces back to something the user actually said. Nothing feels arbitrary. | §3.3 |

---

## 5\. What "Done" Looks Like for the Hackathon

A judge should be able to watch a 5-minute demo and see:

1. A user starts an interview in under 15 seconds  
2. The AI asks a behavioral question out loud (waveform animates as it speaks)  
3. The user answers — live transcript appears as they speak  
4. The user freezes mid-answer — after 10 seconds, the AI gently offers to rephrase the question  
5. The user finishes — a rubric scorecard with qualitative labels and specific, evidence-backed suggestions appears  
6. The user tries the same question again — a side-by-side comparison shows clear improvement in their answer

**The story in one sentence:** "Practice a real interview, see exactly what to fix, try again, and watch yourself get better."

**Demo risk mitigation:** Pre-record TTS audio for demo questions in case of TTS service issues. If STT lags during the live demo, have a pre-recorded answer ready that demonstrates the feedback flow. Test mic permissions and audio levels before the demo starts.

---

## 6\. What This Is NOT

- **Not a question bank.** The questions are a means to an end. The value is the feedback loop, not the content library.  
- **Not a chatbot.** The AI speaks, listens, and coaches. It doesn't sit in a text box waiting for typed input.  
- **Not a grade.** There is no pass/fail. There is no "you're ready" / "you're not ready." There is only "here's where you are and here's how to improve."  
- **Not a replacement for real interviews.** It's a practice tool. The product should be honest about that — it helps you prepare, it doesn't predict outcomes.

---

## 7\. Resolved Decisions

Decisions made during planning (Feb 17, 2026):

| Question | Decision | Rejected alternatives & reasoning |
| :---- | :---- | :---- |
| **Live metrics prominence** | Collapsed by default behind a toggle. | *Peripheral sidebar* — still too distracting during a simulated interview. *Below transcript* — competes for vertical space with the main content. |
| **Interviewer avatar** | Audio waveform visualization. No face. | *Cartoon/illustrated avatar* — adds uncanny valley risk for minimal benefit. *No visual at all* — too static; the waveform adds life when the interviewer speaks. |
| **Great answer handling** | Scorecard highlights strengths with positive callouts. Same flow, balanced feedback. | *Special animation/celebration* — risks feeling patronizing. *Skip entirely* — misses a chance to reinforce what's working. |
| **Silence / freezing up** | Gentle nudge after 10+ seconds. | *Let them sit with it* — too stressful for solo practice context. *Visual hint only* — easy to miss when anxious; an audio prompt is more supportive. |
| **Audio vs. video default** | Audio-only. Camera is opt-in. | *Camera-on default* — too high friction for the primary use case (solo practice at odd hours). \*No camera support at all\* — worth having as an opt-in for users who want to practice eye contact, but not for MVP. |
| **Scoring format** | Qualitative labels (Getting Started → Strong) with progress bars. | *Numeric 0-4 scores* — invites GPA-style comparison, conflicts with growth-over-judgment philosophy. |
| **"I'm done" mechanism** | Visible button with keyboard shortcut (spacebar). | *Pause detection only* — risks cutting off slow thinkers. Pause detection is a stretch enhancement. |
| **Session structure** | One question per round. "Try again" or "Next question" after feedback. | *Multi-question sessions* — adds complexity around session flow, scoring aggregation, and when to show feedback. One question keeps the loop tight for MVP. |

---

## 8\. Accessibility Considerations

These are acknowledged gaps, not MVP requirements. The team should be aware of them for future iterations.

- **Speech impediments and disfluencies:** The filler-word counter (um, uh, like) may incorrectly penalize users with speech impediments or stutter. Future work: allow users to customize or disable filler-word tracking.  
- **Non-native English speakers:** Pacing norms vary across languages and cultures. A "good" speaking pace for a native speaker may not apply universally. Future work: configurable pace thresholds or locale-aware defaults.  
- **Screen reader compatibility:** The waveform visualization is purely visual. Screen reader users need an alternative signal for when the interviewer is speaking (e. g., an ARIA live region announcing "Interviewer is speaking"). The transcript and scorecard should be fully accessible as structured text.  
- **Keyboard navigation:** Ensure the "I'm done" button, "Try again," and "Next question" actions are all reachable via keyboard. The spacebar shortcut for "I'm done" should be documented on screen.

