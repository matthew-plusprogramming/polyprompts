# Job Posting URL Feature — Brainstorm

## Core Feature: Job Posting URL → Tailored Interview

### Basic Flow

Paste URL → scrape posting → extract structured data → generate targeted questions + adjust scoring

### What We Extract from the Posting

- Job title & level (intern, new grad, senior)
- Required skills / tech stack
- Responsibilities & day-to-day
- "Nice to haves" (signals what they value beyond baseline)
- Company name → unlocks the whole research layer below

### How It Changes the Interview

- **Question generation** — Instead of generic "tell me about teamwork," you get: _"Tell me about a time you had to collaborate across teams to ship a feature under a tight deadline"_ — pulled directly from a responsibility like "work cross-functionally to deliver on quarterly goals"
- **Scoring context** — The rubric prompt gets the role context: "This candidate is interviewing for a PM intern at Stripe. Weight communication and prioritization dimensions more heavily."
- **Follow-up questions** — The AI interviewer could probe on specific skills from the posting: "You mentioned using Python — the role requires building data pipelines. Can you elaborate on the scale of data you worked with?"

---

## Layer 2: Company Research

Once we have the company name, we can pull a lot of signal.

### Publicly Available Data

- **Company size** (LinkedIn, Crunchbase) — startup vs. big tech changes what "good" answers look like. A startup wants scrappy/ownership stories. A big company wants "influence without authority" and cross-team collaboration
- **Industry/domain** — fintech, healthtech, edtech etc. Knowing the domain lets us suggest the user frame their stories with relevant analogies
- **Recent news** (funding rounds, launches, layoffs) — "They just raised Series B, so they're scaling fast. Expect questions about working in ambiguity and moving quickly"
- **Glassdoor/Blind interview reviews** — what questions do they _actually_ ask? ("Stripe always asks a product design question")
- **Company values page** — most companies publish these. Map them directly to behavioral dimensions

### How This Changes the Experience

| Signal | Impact |
|--------|--------|
| Startup (< 50 people) | Emphasize ownership, scrappiness, wearing many hats |
| Big tech (1000+) | Emphasize cross-team collab, navigating ambiguity at scale, impact measurement |
| "Move fast" culture | Coach user to keep answers concise, action-heavy |
| "Customer obsessed" value | Generate questions around user empathy, weigh that dimension higher |
| Recent product launch | "They just launched X — be ready to discuss how you'd approach similar problems" |

---

## Layer 3: The Wild Ideas

### 1. "Interview Intel" Briefing Page

Before the mock interview starts, show a one-pager:

- Company snapshot (size, stage, industry)
- What they likely care about based on the posting
- 2-3 "power themes" the user should weave into answers ("ownership," "data-driven," "customer empathy")
- Known interview format (if scrapeable from Glassdoor-style sources)

### 2. Resume + Job Posting = Gap Analysis

Combine resume + job posting to:

- Identify which requirements the user has evidence for vs. gaps
- Generate questions that specifically probe the gaps ("The role asks for ML experience but your resume doesn't mention it — how would you address that?")
- Coach the user on how to reframe adjacent experience to cover gaps

### 3. Role-Specific Scoring Adjustments

With job posting context we could:

- Add a 7th dynamic dimension based on the role (e.g., "Technical Depth" for SWE, "User Empathy" for PM)
- Adjust weights — a PM role might weight Communication 2x, while SWE weights Action/Result higher
- Generate role-specific suggestions: "For this Stripe PM role, try to quantify your impact with metrics"

### 4. Company-Specific Question Bank (Crowdsourced Over Time)

As users paste URLs from the same companies, build a database:

- "Users interviewing at Google tend to get asked X"
- Crowdsourced (anonymized) — "23 users prepped for Amazon SDE intern, here are the most common themes"

### 5. "Why This Company?" Prep

Behavioral interviews almost always include "Why do you want to work here?" Use scraped data + company research to:

- Generate a tailored "Why this company" template
- Score the user's answer against what the company actually cares about
- Flag generic answers: "You said 'I love the mission' but didn't mention anything specific to their product"

### 6. Technical + Behavioral Blend

Some postings signal technical behavioral questions ("Tell me about a time you debugged a production issue"). The posting's tech stack could trigger:

- System design warm-up questions
- Technical storytelling coaching ("When you mention the bug fix, include what the architecture looked like")

---

## Implementation Notes

### Scraping Approaches

| Approach | Tradeoff |
|----------|----------|
| **Fetch URL → pass raw HTML/text to GPT-4o** for structured extraction | Reliable, handles any format, ~1-2 cents per scrape. Probably the MVP move. |
| **Use a service like Jina Reader or Firecrawl** to get clean markdown, then parse with LLM | Cleaner input, slightly more infra |
| **Build scrapers per-platform** (Greenhouse, Lever, Workday, etc.) | Most reliable but not worth it early on |

### Company Research

Similar pattern — a single GPT-4o call with web search (or a few API calls to Crunchbase/LinkedIn) can produce a solid company profile.

---

## Prioritization Thoughts

| Feature | Priority | Rationale |
|---------|----------|-----------|
| Job posting → tailored questions | **MVP** | Core value prop, straightforward to build |
| Interview Intel briefing | **High** | Highest-impact add-on, mostly a single LLM call |
| Role-specific scoring adjustments | **Medium** | Natural extension of existing rubric system |
| Resume + posting gap analysis | **V2** | Killer feature but depends on resume parsing being solid first |
| "Why this company?" prep | **V2** | Nice to have, lower interview-prep urgency |
| Company-specific question bank | **V3** | Needs user volume to be valuable |
