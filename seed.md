# Mock Interview Agent with Real-Time Feedback

**Poly Prompts Hackathon Concept (Education Track)**

---

## 1\. Product Overview

An AI-powered mock interview system that conducts realistic interviews and provides **real-time multimodal feedback** on speaking patterns, pacing, structure, and rubric-based performance. The system adapts questions, tracks longitudinal progress, and recommends targeted drills to improve interview skills.

Primary goals:

- Improve interview preparedness for students  
- Provide explainable, rubric-based coaching  
- Deliver real-time feedback (audio/video/text signals)  
- Track measurable improvement across sessions

---

## 2\. User Experience Flow

### Step 1 — Setup

User selects:

- Interview type: Behavioral / Technical / Case  
- Role: SWE  
- Difficulty level

### Step 2 — Interview Simulation

Agent:

- Speaks question using TTS  
- Records audio/video  
- Streams transcript and live coaching metrics

Live metrics shown:

- Transcript  
- Filler word counter  
- Speaking pace (words per minute)  
- Pause quality indicator  
- Structural completeness tracker (e.g., STAR)

### Step 3 — Post-Answer Feedback

System produces:

- Rubric score breakdown  
- Top 3 improvement suggestions  
- Highlighted transcript weaknesses  
- Follow-up improvement question  
- "Redo with constraints" practice option

### Step 4 — Progress Tracking

Dashboard shows:

- Skill trends over time  
- Recurring weaknesses  
- Suggested drills  
- Interview readiness score (growth-based, not pass/fail)

---

## 3\. Domain-Specific Rubrics

### Behavioral Interview (STAR)

Scoring dimensions (0–4):

- Situation clarity  
- Task ownership  
- Action specificity  
- Result clarity and metrics  
- Reflection quality  
- Communication clarity  
- Conciseness and pacing

Automatic signals:

- STAR segment detection  
- Metric presence detection  
- Filler density  
- Ownership ratio ("I" vs "we")

---

### Technical Interview (SWE)

Scoring dimensions:

- Problem understanding  
- Solution correctness  
- Complexity reasoning  
- Edge case awareness  
- Communication clarity  
- Testing strategy

Automatic signals:

- Constraint mentions  
- Complexity references  
- Iterative reasoning markers

---

### Case Interview

Scoring dimensions:

- Clarifying questions  
- Structured thinking  
- Quantitative reasoning  
- Insight synthesis  
- Recommendation clarity

Automatic signals:

- Framework usage detection  
- Assumption statements  
- Numerical reasoning segments

---

## 4\. Real-Time Signal Analysis

Signals extracted during answer:

- Speech-to-text transcript  
- Filler word detection  
- Speaking rate (WPM)  
- Pause length and timing  
- Sentence repetition detection  
- Structural markers (STAR/framework segments)  
- Optional: head pose / camera engagement

Outputs:

- Live feedback overlay  
- Highlighted transcript weaknesses  
- Real-time pacing indicator

---

## 5\. System Architecture

### Frontend

- WebRTC audio/video capture  
- Live transcript display  
- Real-time feedback overlay  
- Interview dashboard UI

### Backend Services

1. **Speech-to-Text Service**  
     
   - Streaming transcription  
   - Word-level timestamps

   

2. **Signal Processing Engine**  
     
   - Filler detection  
   - Speaking pace calculation  
   - Pause detection  
   - Structure detection

   

3. **Rubric Scoring Engine**  
     
   - Transcript → rubric score mapping  
   - Structured scoring outputs

   

4. **Interview Coach Agent**  
     
   - Generates feedback summaries  
   - Produces follow-up questions  
   - Recommends targeted drills

   

5. **Text-to-Speech Service**  
     
   - Delivers interviewer prompts

---

## 6\. Data Model (Session-Level)

Stored per session:

- Transcript with timestamps  
- Signal metrics time-series  
- Rubric scores per dimension  
- Question metadata  
- User skill progression metrics

---

## 7\. Ethical AI Design

- Transparent scoring rubric visible to users  
- Explainable feedback tied to transcript evidence  
- User-controlled recording storage  
- Accent and speaking style normalization to avoid bias  
- No "hireability" or pass/fail predictions  
- Privacy-first storage options (transcript-only mode)

---

## 8\. MVP Scope (Hackathon)

### Core MVP

- Behavioral interviews (STAR rubric)  
- Real-time transcript \+ filler \+ pacing metrics  
- Post-answer rubric scoring  
- Follow-up coaching question  
- Redo-practice mode with constraints

### Stretch Goals

- Technical interview rubric  
- Video engagement signal detection  
- Progress tracking dashboard  
- Interview skill trend analytics

---

## 9\. Demo Script (2-Minute Pitch)

1. Select "Behavioral Interview → SWE Intern"  
2. Agent asks question using TTS  
3. User answers → live transcript \+ pacing \+ filler counters visible  
4. End response → rubric score \+ improvement suggestions  
5. Follow-up improvement question appears  
6. User retries → improved score visible

Outcome demonstrated:

- Real-time multimodal AI  
- Explainable rubric scoring  
- Measurable skill improvement loop

---

## 10\. Technical Depth Signals for Judges

- Streaming multimodal processing pipeline  
- Structured rubric scoring models  
- Longitudinal skill modeling  
- Domain-adaptive interview generation  
- Real-time coaching interface  
- Explainable AI decision outputs
