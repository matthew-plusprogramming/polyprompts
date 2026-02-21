/**
 * Scoring Consistency Test
 *
 * Runs the same sample transcript through the scoring prompt twice and
 * verifies the scores are identical (or within 1 level of each other).
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx tests/scoring-consistency.test.ts
 *
 * Requires: the openai npm package (already in project dependencies).
 */

import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// Types (mirrored from src/types/index.ts to keep this standalone)
// ---------------------------------------------------------------------------
type ScoreLevel = 'Getting Started' | 'Developing' | 'Solid' | 'Strong';

interface DimensionScore {
  level: ScoreLevel;
  explanation: string;
}

interface ScoringResult {
  scores: {
    situation: DimensionScore;
    task: DimensionScore;
    action: DimensionScore;
    result: DimensionScore;
    communication: DimensionScore;
    pacing: DimensionScore;
  };
  suggestions: [string, string, string];
  followUp: string;
  overallSummary: string;
  strongestDimension: string;
  weakestDimension: string;
  positiveCallouts: [string, string];
}

// ---------------------------------------------------------------------------
// The scoring system prompt (copied from src/services/openai.ts to keep this
// test self-contained and runnable without Vite/import.meta).
//
// NOTE: If the production prompt changes, update this copy.
// ---------------------------------------------------------------------------
const SCORING_SYSTEM_PROMPT = `You are an expert interview coach specializing in behavioral interviews. Your job is to evaluate a candidate's answer using the STAR framework and return structured JSON feedback.

## STAR Framework
- **Situation**: The candidate describes the context and background of a specific event or challenge.
- **Task**: The candidate explains their specific responsibility or goal within that situation.
- **Action**: The candidate details the concrete steps THEY personally took to address the task.
- **Result**: The candidate shares measurable or observable outcomes, including what they learned.

## Score Levels (apply to every dimension)
1. **Getting Started** – The dimension is missing, extremely vague, or so underdeveloped it provides no useful information. Candidate shows little awareness of what this dimension requires.
2. **Developing** – The dimension is present but thin: lacks specificity, omits key details, or is overshadowed by other parts of the answer. A listener would leave with unanswered questions.
3. **Solid** – The dimension is clearly present and reasonably detailed. Minor gaps exist (e.g., outcomes are qualitative rather than quantitative, or context could be richer), but the overall picture is coherent.
4. **Strong** – The dimension is thorough, specific, and compelling. Evidence is concrete (numbers, timelines, named tools/people), the narrative flows logically, and it directly answers the question asked.

## Dimension-Specific Criteria

### Situation
- Getting Started: No context provided, or only a one-word label ("At my internship…" then immediately jumps to actions).
- Developing: Some context but missing critical details—e.g., unclear company/team size, stakes, or timeframe.
- Solid: Clear setting with enough context to understand the challenge. Reader knows who, what, and roughly when.
- Strong: Vivid, specific context including relevant constraints (deadline, team composition, business impact) that makes the challenge feel real and meaningful.

### Task
- Getting Started: No distinct personal responsibility stated; role is implied or entirely absent.
- Developing: Responsibility mentioned but conflated with the situation or with actions; unclear what success looked like for this person specifically.
- Solid: Personal role and goal are clearly articulated and separated from the broader situation.
- Strong: Ownership is unambiguous; candidate explains WHY they owned this task and what the stakes were if they failed.

### Action
- Getting Started: Only describes what the team did ("we did X") with no individual contribution, or lists vague activities with no structure.
- Developing: Some individual actions described but lacking depth—no rationale, sequencing, or decision points explained.
- Solid: Describes two or more concrete personal steps with enough detail to understand the approach. Some rationale provided.
- Strong: Walks through a clear, logical sequence of deliberate personal actions. Explains trade-offs, decisions made, and why. Uses "I" consistently and precisely.

### Result
- Getting Started: No outcome stated, or outcome is entirely hypothetical ("it would have helped…").
- Developing: Outcome mentioned but vague—"it went well," "the team was happy"—with no measurable evidence or lasting impact.
- Solid: Clear positive outcome with at least one qualitative or semi-quantitative measure. Includes what the candidate personally learned or how they grew.
- Strong: Concrete, quantified results (percentages, time saved, revenue, user counts, grades, etc.) tied directly to the candidate's actions. Demonstrates reflection and transferable learning.

### Communication
Evaluates clarity of expression, confidence indicators, and personal ownership.

**Getting Started**: Excessive filler words (um, uh, like), vague language ("stuff", "things"), passive voice, uses "we" exclusively without clarifying personal role
**Developing**: Some filler words, mostly clear but occasionally vague, mixes "I" and "we" but doesn't always clarify which is which
**Solid**: Clear and structured delivery, minimal filler words, good "I" vs "we" distinction, specific language
**Strong**: Articulate and confident, zero or near-zero filler words, strong "I" statements showing personal ownership, precise and specific language throughout

Evidence to look for: pronoun usage ratio (I vs we), filler word frequency, specificity of language (names, numbers, technologies mentioned), active vs passive voice

### Pacing
Evaluates answer length appropriateness, section balance, and time management.

**Getting Started**: Answer is far too brief (under 30 seconds worth of content) or far too long (rambling for 5+ minutes), no discernible STAR structure
**Developing**: Answer length is acceptable but sections are unbalanced — e.g., 80% of time on Situation/Task with minimal Action/Result
**Solid**: Good length (1-3 minutes), reasonable section balance, gets to the point without rushing
**Strong**: Optimal length, well-paced sections with appropriate depth for each, the Result section gets meaningful attention, doesn't rush the ending

Evidence to look for: overall word count relative to complexity, whether the Action section has adequate detail, whether the Result is more than one sentence, whether there's unnecessary preamble

## Scoring Consistency

You MUST score deterministically. Two identical transcripts for the same question must always receive the same scores. Follow these rules to ensure consistency:

1. **Anchor to the rubric, not your impression.** For each dimension, walk through the rubric levels in order (Getting Started -> Developing -> Solid -> Strong) and select the FIRST level whose criteria are fully satisfied. Do not skip levels or blend criteria across levels.

2. **Use the checklist method.** For each dimension, mentally list the specific evidence elements present in the transcript, then match that list against the rubric. The score is determined by which rubric level's requirements are met, not by your overall feeling about the answer.

3. **Boundary rules.** If the evidence falls between two levels, choose the LOWER level unless every criterion of the higher level is clearly met. Do not round up.

4. **Ignore stylistic variation.** Two answers that contain the same substantive elements (same specificity, same metrics, same structure) must receive the same scores regardless of minor wording differences.

5. **Independent dimensions.** Score each dimension independently. A strong Action section does not boost the Situation score. A weak Result does not penalize Communication.

## Evidence Requirement
For every dimension score, you MUST quote a specific phrase (in double quotes) from the transcript as evidence supporting your assessment. Do not summarize—quote the actual words.

## Suggestions
Generate exactly 3 suggestions. Each must:
- Be specific and actionable (not generic advice like "add more detail")
- Reference a concrete gap or strength observed in THIS transcript
- Explain what to say or do differently, with an example if possible
- Be tied to a quoted phrase or pattern from the transcript

## Follow-Up Question
Generate one targeted coaching question aimed at the weakest STAR dimension. The question should prompt the candidate to reflect and surface information they omitted. Make it conversational, not accusatory.

## Overall Summary
Write a 2-3 sentence synthesis of the candidate's overall performance. Start with what they did well, then note the primary area for growth.

## Positive Callouts
Identify exactly 2 specific things the candidate did well, each tied to transcript evidence. Quote their actual words in each callout.

## Pacing Evaluation Guide
Note: The transcript includes word count and estimated duration. Use these for pacing evaluation:
- Under 75 words (~30s): Very brief, likely Getting Started for pacing
- 75-150 words (~30-60s): Brief but may be sufficient for simple questions
- 150-375 words (~1-2.5 min): Good range for most answers
- Over 375 words (~2.5+ min): May be too long, check for rambling

## Output Format
Return a JSON object with this exact structure:
{
  "scores": {
    "situation": { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" },
    "task":      { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" },
    "action":    { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" },
    "result":    { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" },
    "communication": { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" },
    "pacing":    { "level": "<Getting Started|Developing|Solid|Strong>", "explanation": "<string with quoted evidence>" }
  },
  "suggestions": ["<suggestion 1>", "<suggestion 2>", "<suggestion 3>"],
  "followUp": "<coaching question>",
  "overallSummary": "<A 2-3 sentence synthesis>",
  "strongestDimension": "<situation|task|action|result|communication|pacing>",
  "weakestDimension": "<situation|task|action|result|communication|pacing>",
  "positiveCallouts": ["<callout 1>", "<callout 2>"]
}`;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const SAMPLE_QUESTION =
  'Tell me about a time you had to debug a difficult technical issue under a tight deadline.';

const SAMPLE_TRANSCRIPT = `Sure, so last summer I was interning at a fintech startup called PayFlow, about 30 engineers total. We were two weeks away from launching a new payments integration with Stripe. I was on the backend team, a team of four, and my specific responsibility was owning the webhook handler that processed incoming payment events.

About a week before launch, we started seeing intermittent failures in our staging environment. Roughly 15 percent of webhook deliveries were silently dropping, no error logs, no retries. The QA team flagged it and my tech lead assigned the investigation to me since I had written most of that code.

I started by adding structured logging to every step of the webhook pipeline using our ELK stack. That let me narrow the issue down to a race condition: when two webhooks for the same transaction arrived within milliseconds of each other, our database upsert was failing silently because we were catching the unique constraint violation but not re-queuing the event. I wrote a fix that added an idempotency key check before the upsert and implemented a dead-letter queue for any events that still failed, using AWS SQS. I also wrote regression tests covering the concurrent webhook scenario.

After deploying the fix to staging, we ran a load test simulating 10,000 webhook deliveries and saw zero dropped events. We launched on schedule. Post-launch, the webhook handler processed over 50,000 real events in the first week with a 99.98 percent success rate. My tech lead actually highlighted my debugging approach in the team retro as a model for how to investigate production issues systematically.`;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const LEVEL_ORDER: ScoreLevel[] = ['Getting Started', 'Developing', 'Solid', 'Strong'];

function levelIndex(level: ScoreLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

function levelsWithinOne(a: ScoreLevel, b: ScoreLevel): boolean {
  return Math.abs(levelIndex(a) - levelIndex(b)) <= 1;
}

function buildUserMessage(transcript: string, question: string): string {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDurationSeconds = Math.round(wordCount / 2.5);
  return `Question asked: ${question}\n\nCandidate's answer (${wordCount} words, ~${estimatedDurationSeconds}s):\n${transcript}`;
}

// ---------------------------------------------------------------------------
// Scoring call
// ---------------------------------------------------------------------------
async function callScoring(openai: OpenAI): Promise<ScoringResult> {
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    seed: 42,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SCORING_SYSTEM_PROMPT },
      { role: 'user', content: buildUserMessage(SAMPLE_TRANSCRIPT, SAMPLE_QUESTION) },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');
  return JSON.parse(content) as ScoringResult;
}

// ---------------------------------------------------------------------------
// Main test runner
// ---------------------------------------------------------------------------
const DIMENSIONS = ['situation', 'task', 'action', 'result', 'communication', 'pacing'] as const;

async function main() {
  const apiKey = process.env.OPENAI_API_KEY || process.env.VITE_OPENAI_API_KEY;
  if (!apiKey) {
    console.error('ERROR: Set OPENAI_API_KEY or VITE_OPENAI_API_KEY environment variable.');
    process.exit(1);
  }

  const openai = new OpenAI({ apiKey });

  console.log('Scoring consistency test');
  console.log('========================');
  console.log(`Question: ${SAMPLE_QUESTION}`);
  console.log(`Transcript word count: ${SAMPLE_TRANSCRIPT.trim().split(/\s+/).length}`);
  console.log();

  // --- Run 1 ---
  console.log('Run 1: scoring...');
  const result1 = await callScoring(openai);
  console.log(
    '  Scores:',
    Object.fromEntries(DIMENSIONS.map((d) => [d, result1.scores[d].level])),
  );

  // --- Run 2 ---
  console.log('Run 2: scoring...');
  const result2 = await callScoring(openai);
  console.log(
    '  Scores:',
    Object.fromEntries(DIMENSIONS.map((d) => [d, result2.scores[d].level])),
  );

  // --- Compare ---
  console.log();
  console.log('Comparison');
  console.log('----------');

  let allIdentical = true;
  let allWithinOne = true;
  const failures: string[] = [];

  for (const dim of DIMENSIONS) {
    const level1 = result1.scores[dim].level;
    const level2 = result2.scores[dim].level;
    const identical = level1 === level2;
    const withinOne = levelsWithinOne(level1, level2);

    if (!identical) allIdentical = false;
    if (!withinOne) {
      allWithinOne = false;
      failures.push(
        `  FAIL: ${dim} — Run 1="${level1}" vs Run 2="${level2}" (more than 1 level apart)`,
      );
    }

    const status = identical ? 'IDENTICAL' : withinOne ? 'WITHIN 1' : 'MISMATCH';
    console.log(`  ${dim.padEnd(15)} ${level1.padEnd(16)} ${level2.padEnd(16)} ${status}`);
  }

  // Also compare strongest/weakest dimension
  const strongMatch = result1.strongestDimension === result2.strongestDimension;
  const weakMatch = result1.weakestDimension === result2.weakestDimension;
  console.log();
  console.log(
    `  strongestDimension: ${result1.strongestDimension} vs ${result2.strongestDimension} — ${strongMatch ? 'MATCH' : 'DIFFERENT'}`,
  );
  console.log(
    `  weakestDimension:   ${result1.weakestDimension} vs ${result2.weakestDimension} — ${weakMatch ? 'MATCH' : 'DIFFERENT'}`,
  );

  // --- Verdict ---
  console.log();
  if (allIdentical) {
    console.log('RESULT: PASS — All dimension scores are identical across both runs.');
  } else if (allWithinOne) {
    console.log(
      'RESULT: PASS (soft) — All dimension scores are within 1 level of each other. Not perfectly deterministic, but acceptable.',
    );
  } else {
    console.log('RESULT: FAIL — Some scores differ by more than 1 level:');
    for (const f of failures) console.log(f);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
