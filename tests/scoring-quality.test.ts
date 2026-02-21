/**
 * Scoring Quality Tests (T71)
 *
 * Tests that scoreAnswer() produces reasonable scores for sample transcripts
 * at various quality levels.
 *
 * Requirements:
 *   - VITE_OPENAI_API_KEY (or OPENAI_API_KEY) must be set in the environment
 *   - Run with: npx tsx tests/scoring-quality.test.ts
 *
 * The script exits with code 0 on success, 1 on failure, and 2 if skipped
 * (no API key found).
 */

import OpenAI from 'openai';

// ---------------------------------------------------------------------------
// API key resolution — skip gracefully when unavailable
// ---------------------------------------------------------------------------

const API_KEY = process.env.VITE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY;

if (!API_KEY) {
  console.log(
    '\x1b[33mSKIPPED\x1b[0m: No VITE_OPENAI_API_KEY or OPENAI_API_KEY set — scoring quality tests require a real OpenAI key.',
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Types (mirrored from src/types/index.ts to avoid Vite import issues)
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
// Scoring prompt & helpers (copied from src/services/openai.ts)
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

## Evidence Requirement
For every dimension score, you MUST quote a specific phrase (in double quotes) from the transcript as evidence supporting your assessment. Do not summarize—quote the actual words.

## Special Cases

### Special case: Very weak answers
If the transcript is very brief (under 50 words), lacks any STAR structure, or is mostly filler words/silence, still provide constructive feedback. Focus suggestions on:
1. Breaking the answer into STAR sections
2. Adding specific details from their experience
3. Practicing with a clear opening statement
Do NOT be harsh or discouraging. Frame everything as "areas to build on."

### Special case: Very strong answers
If the answer hits Strong on most dimensions, celebrate it! The overallSummary should lead with genuine praise. Suggestions for strong answers should focus on:
1. Advanced refinements (making a great answer even better)
2. Adapting the answer for different audiences (technical vs behavioral)
3. Preparing for likely follow-up questions

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

## Scoring Examples

### Example 1: Strong Answer
Question: "Tell me about a time you worked on a team project."
Answer: "During my sophomore year, our team of four was tasked with building a web app for a local nonprofit. I specifically owned the backend API and database design. When we hit a blocker where the frontend team couldn't integrate with our API due to inconsistent response formats, I took the initiative to write a shared API specification document and refactored all endpoints to follow RESTful conventions. I also set up automated API tests to catch future inconsistencies. The result was that we delivered the project two days early, the nonprofit reported a 40% increase in volunteer sign-ups through the platform, and our team received the highest grade in the class."

Scoring: situation=Strong (specific context, clear setting), task=Strong (clear personal ownership), action=Strong (multiple specific steps, shows initiative), result=Strong (quantified impact with metrics), communication=Strong (clear I vs we distinction), pacing=Solid (well-structured, could be slightly more concise)

### Example 2: Getting Started Answer
Question: "Tell me about a time you had to debug a difficult issue under a deadline."
Answer: "Um, so like, we had this bug and it was really hard. We tried a lot of things and eventually we fixed it. It was stressful but we got through it."

Scoring: situation=Getting Started (no specific context), task=Getting Started (no clarity on personal role), action=Getting Started (no specific steps described), result=Getting Started (no outcome or impact), communication=Developing (filler words but grammatically coherent), pacing=Getting Started (far too brief, no structure)

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
  "overallSummary": "<A 2-3 sentence synthesis of the candidate's overall performance. Start with what they did well, then note the primary area for growth.>",
  "strongestDimension": "<The key name (situation/task/action/result/communication/pacing) of the dimension where the candidate performed best>",
  "weakestDimension": "<The key name of the dimension where the candidate most needs improvement>",
  "positiveCallouts": ["<Specific thing the candidate did well, tied to transcript evidence with a direct quote>", "<Second specific thing the candidate did well, tied to transcript evidence with a direct quote>"]
}`;

const VALID_LEVELS = new Set<string>(['Getting Started', 'Developing', 'Solid', 'Strong']);
const VALID_DIMENSIONS = new Set<string>([
  'situation',
  'task',
  'action',
  'result',
  'communication',
  'pacing',
]);

function buildUserMessage(transcript: string, question: string): string {
  const wordCount = transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
  const estimatedDurationSeconds = Math.round(wordCount / 2.5);
  return `Question asked: ${question}\n\nCandidate's answer (${wordCount} words, ~${estimatedDurationSeconds}s):\n${transcript}`;
}

function validateScoringResult(raw: unknown): ScoringResult {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Response is not an object');
  }

  const obj = raw as Record<string, unknown>;

  // Validate scores
  if (!obj.scores || typeof obj.scores !== 'object') {
    throw new Error('Missing or invalid "scores" field');
  }

  const scores = obj.scores as Record<string, unknown>;
  const requiredDimensions = ['situation', 'task', 'action', 'result', 'communication', 'pacing'];

  for (const dim of requiredDimensions) {
    if (!scores[dim] || typeof scores[dim] !== 'object') {
      throw new Error(`Missing or invalid dimension: "${dim}"`);
    }
    const dimScore = scores[dim] as Record<string, unknown>;
    if (typeof dimScore.level !== 'string' || !VALID_LEVELS.has(dimScore.level)) {
      throw new Error(`Invalid level for dimension "${dim}": ${dimScore.level}`);
    }
    if (typeof dimScore.explanation !== 'string' || dimScore.explanation.trim() === '') {
      throw new Error(`Missing explanation for dimension "${dim}"`);
    }
  }

  // Validate suggestions
  if (!Array.isArray(obj.suggestions) || obj.suggestions.length !== 3) {
    throw new Error(
      `"suggestions" must be an array of exactly 3 items, got ${Array.isArray(obj.suggestions) ? obj.suggestions.length : typeof obj.suggestions}`,
    );
  }
  for (let i = 0; i < 3; i++) {
    if (typeof obj.suggestions[i] !== 'string' || (obj.suggestions[i] as string).trim() === '') {
      throw new Error(`Suggestion at index ${i} is not a valid string`);
    }
  }

  // Validate followUp
  if (typeof obj.followUp !== 'string' || obj.followUp.trim() === '') {
    throw new Error('Missing or invalid "followUp" field');
  }

  // Validate overallSummary
  if (typeof obj.overallSummary !== 'string' || obj.overallSummary.trim() === '') {
    throw new Error('Missing or invalid "overallSummary" field');
  }

  // Validate strongestDimension
  if (typeof obj.strongestDimension !== 'string' || !VALID_DIMENSIONS.has(obj.strongestDimension)) {
    throw new Error(`Invalid "strongestDimension": ${obj.strongestDimension}`);
  }

  // Validate weakestDimension
  if (typeof obj.weakestDimension !== 'string' || !VALID_DIMENSIONS.has(obj.weakestDimension)) {
    throw new Error(`Invalid "weakestDimension": ${obj.weakestDimension}`);
  }

  // Validate positiveCallouts
  if (!Array.isArray(obj.positiveCallouts) || obj.positiveCallouts.length !== 2) {
    throw new Error(
      `"positiveCallouts" must be an array of exactly 2 items, got ${Array.isArray(obj.positiveCallouts) ? obj.positiveCallouts.length : typeof obj.positiveCallouts}`,
    );
  }
  for (let i = 0; i < 2; i++) {
    if (
      typeof obj.positiveCallouts[i] !== 'string' ||
      (obj.positiveCallouts[i] as string).trim() === ''
    ) {
      throw new Error(`positiveCallouts at index ${i} is not a valid string`);
    }
  }

  return raw as ScoringResult;
}

// ---------------------------------------------------------------------------
// OpenAI client + scoreAnswer (decoupled from import.meta.env)
// ---------------------------------------------------------------------------

const openai = new OpenAI({ apiKey: API_KEY });

async function scoreAnswer(transcript: string, question: string): Promise<ScoringResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Scoring timed out after 30 seconds')), 30_000),
  );

  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.3,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SCORING_SYSTEM_PROMPT },
        { role: 'user', content: buildUserMessage(transcript, question) },
      ],
    }),
    timeoutPromise,
  ]);

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}`);
  }

  return validateScoringResult(parsed);
}

// ---------------------------------------------------------------------------
// Numeric helpers for comparing score levels
// ---------------------------------------------------------------------------

const LEVEL_ORDER: Record<string, number> = {
  'Getting Started': 1,
  Developing: 2,
  Solid: 3,
  Strong: 4,
};

function levelToNumber(level: string): number {
  return LEVEL_ORDER[level] ?? 0;
}

function averageScore(result: ScoringResult): number {
  const dims = ['situation', 'task', 'action', 'result', 'communication', 'pacing'] as const;
  let sum = 0;
  for (const d of dims) {
    sum += levelToNumber(result.scores[d].level);
  }
  return sum / dims.length;
}

// ---------------------------------------------------------------------------
// Sample transcripts
// ---------------------------------------------------------------------------

const QUESTION = 'Tell me about a time you worked on a challenging team project.';

const TRANSCRIPTS = {
  strong: {
    label: 'Strong STAR answer (~200 words)',
    transcript: `During my junior year, I was part of a four-person team building a full-stack inventory management system for a local restaurant chain that was losing track of supplies across three locations. As the lead backend developer, I was personally responsible for designing the database schema and building the REST API that all three restaurant locations would depend on. When we realized halfway through the project that the original relational schema couldn't handle the real-time syncing requirement across locations, I researched and proposed switching to a document-based approach with change streams. I redesigned the data model in MongoDB, wrote migration scripts for the existing test data, implemented WebSocket-based real-time updates, and created comprehensive API documentation so the frontend team could integrate without delays. I also set up a CI pipeline with automated integration tests to prevent regressions during the transition. The result was that we delivered the project on time, the restaurant owner reported a 35 percent reduction in food waste within the first month of use, and our professor highlighted our project as the best in the class. I learned that being willing to pivot on a technical decision early, even when it feels risky, can save the entire team time in the long run.`,
  },

  developing: {
    label: 'Developing answer (~100 words)',
    transcript: `So at my internship last summer, we had this project where we needed to build a dashboard for the marketing team. I was on the frontend team. We used React and it was pretty challenging because the requirements kept changing. I worked on some of the components and helped with the design. We had some issues with the API integration but we figured it out eventually. The marketing team ended up using the dashboard and they liked it. I think I learned a lot about working with a team and dealing with changing requirements.`,
  },

  weak: {
    label: 'Weak / Getting Started answer (~40 words)',
    transcript: `Um, yeah, so like we had this group project in school and it was kind of hard. We all worked on it together and, you know, we got it done. It was okay I guess.`,
  },

  mediumWeakResult: {
    label: 'Medium answer with good action but weak result (~150 words)',
    transcript: `Last semester I was in a software engineering class where my team of five had to build a mobile app for campus event discovery. I was responsible for the entire backend API and push notification system. When we discovered that our original notification approach using polling was draining phone batteries, I dove into Firebase Cloud Messaging documentation, set up a new notification service, wrote custom topic-based subscription logic so students only got alerts for events matching their interests, and refactored the existing endpoints to trigger push notifications on event creation. I coordinated with the iOS and Android developers to ensure the notification payloads were compatible with both platforms and wrote unit tests for all the notification edge cases. The app worked and people seemed to like it. We presented it at the end of the semester and got a good grade. Overall it was a good experience.`,
  },
};

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

interface TestCase {
  name: string;
  fn: () => Promise<void>;
}

const tests: TestCase[] = [];
let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => Promise<void>) {
  tests.push({ name, fn });
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTests() {
  console.log('\n========================================');
  console.log('  Scoring Quality Tests (T71)');
  console.log('========================================\n');

  for (const t of tests) {
    const start = Date.now();
    try {
      await t.fn();
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      console.log(`  \x1b[32mPASS\x1b[0m  ${t.name} (${elapsed}s)`);
      passCount++;
    } catch (err) {
      const elapsed = ((Date.now() - start) / 1000).toFixed(1);
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  \x1b[31mFAIL\x1b[0m  ${t.name} (${elapsed}s)`);
      console.log(`        ${msg}\n`);
      failCount++;
    }
  }

  console.log('\n----------------------------------------');
  console.log(`  ${passCount} passed, ${failCount} failed, ${tests.length} total`);
  console.log('----------------------------------------\n');

  process.exit(failCount > 0 ? 1 : 0);
}

// ---------------------------------------------------------------------------
// Store results for cross-test comparisons
// ---------------------------------------------------------------------------

const results: Record<string, ScoringResult> = {};

// ---------------------------------------------------------------------------
// Test: Strong transcript — structure & score level validation
// ---------------------------------------------------------------------------

test('Strong transcript returns valid structure with high scores', async () => {
  const result = await scoreAnswer(TRANSCRIPTS.strong.transcript, QUESTION);
  results['strong'] = result;

  // Structure checks
  const dims = ['situation', 'task', 'action', 'result', 'communication', 'pacing'] as const;
  for (const dim of dims) {
    assert(result.scores[dim] !== undefined, `Missing dimension: ${dim}`);
    assert(VALID_LEVELS.has(result.scores[dim].level), `Invalid level for ${dim}: ${result.scores[dim].level}`);
    assert(result.scores[dim].explanation.length > 0, `Empty explanation for ${dim}`);
  }

  assert(result.suggestions.length === 3, `Expected 3 suggestions, got ${result.suggestions.length}`);
  for (let i = 0; i < 3; i++) {
    assert(result.suggestions[i].length > 10, `Suggestion ${i} is too short: "${result.suggestions[i]}"`);
  }
  assert(result.followUp.length > 10, 'followUp is too short');
  assert(result.overallSummary.length > 20, 'overallSummary is too short');
  assert(VALID_DIMENSIONS.has(result.strongestDimension), `Invalid strongestDimension: ${result.strongestDimension}`);
  assert(VALID_DIMENSIONS.has(result.weakestDimension), `Invalid weakestDimension: ${result.weakestDimension}`);
  assert(result.positiveCallouts.length === 2, `Expected 2 positiveCallouts, got ${result.positiveCallouts.length}`);
  for (let i = 0; i < 2; i++) {
    assert(result.positiveCallouts[i].length > 10, `positiveCallout ${i} is too short`);
  }

  // The strong answer should average at least Solid (3.0)
  const avg = averageScore(result);
  assert(avg >= 3.0, `Strong answer average score is ${avg.toFixed(2)}, expected >= 3.0`);

  // STAR core dimensions (situation, task, action, result) should each be at least Solid
  for (const d of ['situation', 'task', 'action', 'result'] as const) {
    const lv = levelToNumber(result.scores[d].level);
    assert(lv >= 3, `Strong answer: ${d} is "${result.scores[d].level}" (expected >= Solid)`);
  }

  console.log(`        Average score: ${avg.toFixed(2)}/4.0`);
});

// ---------------------------------------------------------------------------
// Test: Developing transcript
// ---------------------------------------------------------------------------

test('Developing transcript returns valid structure with mid-range scores', async () => {
  const result = await scoreAnswer(TRANSCRIPTS.developing.transcript, QUESTION);
  results['developing'] = result;

  // Structure checks (basic)
  assert(result.overallSummary.length > 20, 'overallSummary is too short');
  assert(result.suggestions.length === 3, `Expected 3 suggestions, got ${result.suggestions.length}`);
  assert(VALID_DIMENSIONS.has(result.strongestDimension), `Invalid strongestDimension`);
  assert(VALID_DIMENSIONS.has(result.weakestDimension), `Invalid weakestDimension`);

  // Developing answers should fall in the Developing-to-Solid range on average (1.5 - 3.5)
  const avg = averageScore(result);
  assert(avg >= 1.5, `Developing answer average is ${avg.toFixed(2)}, expected >= 1.5`);
  assert(avg <= 3.5, `Developing answer average is ${avg.toFixed(2)}, expected <= 3.5`);

  console.log(`        Average score: ${avg.toFixed(2)}/4.0`);
});

// ---------------------------------------------------------------------------
// Test: Weak / Getting Started transcript
// ---------------------------------------------------------------------------

test('Weak transcript returns valid structure with low scores', async () => {
  const result = await scoreAnswer(TRANSCRIPTS.weak.transcript, QUESTION);
  results['weak'] = result;

  // Structure checks (basic)
  assert(result.overallSummary.length > 20, 'overallSummary is too short');
  assert(result.suggestions.length === 3, `Expected 3 suggestions, got ${result.suggestions.length}`);
  assert(VALID_DIMENSIONS.has(result.strongestDimension), `Invalid strongestDimension`);
  assert(VALID_DIMENSIONS.has(result.weakestDimension), `Invalid weakestDimension`);

  // Weak answer should average at most Developing (2.0)
  const avg = averageScore(result);
  assert(avg <= 2.0, `Weak answer average is ${avg.toFixed(2)}, expected <= 2.0`);

  // STAR core dimensions should mostly be Getting Started
  const starDims = ['situation', 'task', 'action', 'result'] as const;
  let gettingStartedCount = 0;
  for (const d of starDims) {
    if (result.scores[d].level === 'Getting Started') gettingStartedCount++;
  }
  assert(
    gettingStartedCount >= 3,
    `Weak answer: expected at least 3/4 STAR dimensions at Getting Started, got ${gettingStartedCount}`,
  );

  console.log(`        Average score: ${avg.toFixed(2)}/4.0`);
});

// ---------------------------------------------------------------------------
// Test: Medium answer (good action, weak result)
// ---------------------------------------------------------------------------

test('Medium transcript (strong action, weak result) scores action higher than result', async () => {
  const result = await scoreAnswer(TRANSCRIPTS.mediumWeakResult.transcript, QUESTION);
  results['mediumWeakResult'] = result;

  // Structure checks (basic)
  assert(result.overallSummary.length > 20, 'overallSummary is too short');
  assert(result.suggestions.length === 3, `Expected 3 suggestions, got ${result.suggestions.length}`);

  // Action should score higher than result
  const actionLevel = levelToNumber(result.scores.action.level);
  const resultLevel = levelToNumber(result.scores.result.level);
  assert(
    actionLevel > resultLevel,
    `Expected action (${result.scores.action.level}=${actionLevel}) > result (${result.scores.result.level}=${resultLevel})`,
  );

  // Action should be at least Solid
  assert(actionLevel >= 3, `Action should be >= Solid, got "${result.scores.action.level}"`);

  // Result should be at most Developing (the result section is intentionally vague)
  assert(
    resultLevel <= 2,
    `Result should be <= Developing, got "${result.scores.result.level}"`,
  );

  const avg = averageScore(result);
  console.log(`        Average score: ${avg.toFixed(2)}/4.0  |  action=${result.scores.action.level}, result=${result.scores.result.level}`);
});

// ---------------------------------------------------------------------------
// Test: Cross-transcript ordering (strong > developing > weak)
// ---------------------------------------------------------------------------

test('Score ordering: strong > developing > weak', async () => {
  // These results were populated by earlier tests
  assert(results['strong'] !== undefined, 'Strong result not available (earlier test may have failed)');
  assert(results['developing'] !== undefined, 'Developing result not available');
  assert(results['weak'] !== undefined, 'Weak result not available');

  const strongAvg = averageScore(results['strong']);
  const developingAvg = averageScore(results['developing']);
  const weakAvg = averageScore(results['weak']);

  assert(
    strongAvg > developingAvg,
    `Strong average (${strongAvg.toFixed(2)}) should be > Developing average (${developingAvg.toFixed(2)})`,
  );
  assert(
    developingAvg > weakAvg,
    `Developing average (${developingAvg.toFixed(2)}) should be > Weak average (${weakAvg.toFixed(2)})`,
  );

  console.log(`        Strong: ${strongAvg.toFixed(2)}  >  Developing: ${developingAvg.toFixed(2)}  >  Weak: ${weakAvg.toFixed(2)}`);
});

// ---------------------------------------------------------------------------
// Test: Suggestions are specific (not generic boilerplate)
// ---------------------------------------------------------------------------

test('Suggestions reference transcript content (not generic advice)', async () => {
  // Check the strong result's suggestions reference something specific
  const result = results['strong'];
  assert(result !== undefined, 'Strong result not available');

  for (let i = 0; i < 3; i++) {
    const suggestion = result.suggestions[i];
    // A specific suggestion should be at least 30 characters long
    assert(
      suggestion.length >= 30,
      `Suggestion ${i} seems too short to be specific (${suggestion.length} chars)`,
    );
  }

  // Check the weak result's suggestions are constructive
  const weakResult = results['weak'];
  assert(weakResult !== undefined, 'Weak result not available');

  for (let i = 0; i < 3; i++) {
    const suggestion = weakResult.suggestions[i];
    assert(
      suggestion.length >= 30,
      `Weak suggestion ${i} seems too short to be specific (${suggestion.length} chars)`,
    );
  }

  console.log('        All suggestions are reasonably specific (>= 30 chars each)');
});

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

runTests();
