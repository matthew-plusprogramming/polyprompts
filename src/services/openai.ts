import type { ScoringResult } from '../types';

export interface ResumeData {
  skills: string[];
  experience: string[];
  projects: string[];
  education: string;
}

// Lazy-load the OpenAI SDK to avoid blocking initial page load
let _openai: import('openai').default | null = null;

async function getClient() {
  if (_openai) return _openai;
  const OpenAI = (await import('openai')).default;
  _openai = new OpenAI({
    apiKey: import.meta.env.VITE_OPENAI_API_KEY,
    dangerouslyAllowBrowser: true,
  });
  return _openai;
}

// --- TTS ---
const ttsCache = new Map<string, Blob>();

export async function textToSpeech(text: string, voice: string = 'alloy', speed: number = 1.0): Promise<Blob> {
  const cacheKey = voice + ':' + speed + ':' + text;
  const cached = ttsCache.get(cacheKey);
  if (cached) return cached;

  const openai = await getClient();
  const response = await openai.audio.speech.create({
    model: 'tts-1',
    voice: voice as 'alloy' | 'nova' | 'shimmer' | 'echo' | 'onyx' | 'fable',
    input: text,
    response_format: 'mp3',
    speed: Math.max(0.25, Math.min(4.0, speed)), // OpenAI TTS supports 0.25-4.0
  });

  const blob = new Blob([await response.arrayBuffer()], { type: 'audio/mpeg' });
  ttsCache.set(cacheKey, blob);
  return blob;
}

// --- Pause Analysis ---
// Returns:
//   'definitely_done'          — auto-submit the answer (extremely high confidence)
//   'definitely_still_talking' — stay silent, don't interrupt (extremely high confidence)
//   'ask'                      — ask the user if they're finished (anything in between)
export async function analyzePause(transcript: string): Promise<'definitely_done' | 'definitely_still_talking' | 'ask'> {
  console.log('[analyzePause] Called with transcript:', JSON.stringify(transcript));
  const openai = await getClient();
  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0,
    max_tokens: 20,
    messages: [
      {
        role: 'system',
        content: `You analyze an interview candidate's transcript after they paused for several seconds. Decide what to do next.

Return "definitely_done" if ANY of the following are true:
- The candidate explicitly signals they are finished (e.g. "I'm done", "that's it", "that's all", "that's my answer", "yeah that's about it", "I think that covers it")
- The answer has a clear concluding statement (e.g. wrapping up with a result, lesson learned, or summary) AND covers substantial ground (50+ words with a complete narrative arc)

Return "definitely_still_talking" ONLY if you are nearly 100% certain the candidate is mid-thought and will continue. This means:
- The transcript ends mid-sentence, with an incomplete clause
- The last word is a conjunction or preposition (and, but, so, because, like, with, to, for, that, which)
- The transcript is very short (under 20 words) and clearly just getting started

Return "ask" for EVERYTHING else. When in doubt, always return "ask". The interviewer will gently ask "Are you finished with your answer?" which is always a safe, supportive action. Err heavily toward "ask".`,
      },
      {
        role: 'user',
        content: `Transcript so far: "${transcript}"`,
      },
    ],
    response_format: {
      type: 'json_schema',
      json_schema: {
        name: 'pause_analysis',
        strict: true,
        schema: {
          type: 'object' as const,
          properties: {
            verdict: { type: 'string' as const, enum: ['definitely_done', 'definitely_still_talking', 'ask'] },
          },
          required: ['verdict'],
          additionalProperties: false,
        },
      },
    },
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? '{}');
  const verdict = parsed.verdict;
  console.log('[analyzePause] Verdict:', verdict);
  if (verdict === 'definitely_done') return 'definitely_done';
  if (verdict === 'definitely_still_talking') return 'definitely_still_talking';
  return 'ask';
}

// --- Scoring ---
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

## Resume Personalization
If the candidate's background is provided, reference their specific skills, projects, or experience when making suggestions. For example, if they mentioned Python in their resume but did not mention it when describing their technical approach, suggest they ground their answer in that specific experience.

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

## Scoring Consistency

You MUST score deterministically. Two identical transcripts for the same question must always receive the same scores. Follow these rules to ensure consistency:

1. **Anchor to the rubric, not your impression.** For each dimension, walk through the rubric levels in order (Getting Started -> Developing -> Solid -> Strong) and select the FIRST level whose criteria are fully satisfied. Do not skip levels or blend criteria across levels.

2. **Use the checklist method.** For each dimension, mentally list the specific evidence elements present in the transcript, then match that list against the rubric. The score is determined by which rubric level's requirements are met, not by your overall feeling about the answer.

3. **Boundary rules.** If the evidence falls between two levels, choose the LOWER level unless every criterion of the higher level is clearly met. Do not round up.

4. **Ignore stylistic variation.** Two answers that contain the same substantive elements (same specificity, same metrics, same structure) must receive the same scores regardless of minor wording differences.

5. **Independent dimensions.** Score each dimension independently. A strong Action section does not boost the Situation score. A weak Result does not penalize Communication.

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

function buildUserMessage(transcript: string, question: string, resumeData?: ResumeData): string {
  const wordCount = transcript.trim().split(/\s+/).filter(Boolean).length;
  const estimatedDurationSeconds = Math.round(wordCount / 2.5); // ~150 WPM = 2.5 words/sec

  let message = `Question asked: ${question}\n\n`;
  message += `Candidate's answer (${wordCount} words, ~${estimatedDurationSeconds}s):\n${transcript}`;

  if (resumeData) {
    message += `\n\nCandidate's background:`;
    if (resumeData.skills.length > 0) {
      message += `\n- Skills: ${resumeData.skills.join(', ')}`;
    }
    if (resumeData.experience.length > 0) {
      message += `\n- Experience: ${resumeData.experience.join('; ')}`;
    }
    if (resumeData.projects.length > 0) {
      message += `\n- Projects: ${resumeData.projects.join('; ')}`;
    }
    if (resumeData.education) {
      message += `\n- Education: ${resumeData.education}`;
    }
  }

  return message;
}

const VALID_LEVELS = new Set(['Getting Started', 'Developing', 'Solid', 'Strong']);

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
    throw new Error(`"suggestions" must be an array of exactly 3 items, got ${Array.isArray(obj.suggestions) ? obj.suggestions.length : typeof obj.suggestions}`);
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

  // Validate strongestDimension — normalize if LLM returns something invalid
  const validDimensions = new Set(['situation', 'task', 'action', 'result', 'communication', 'pacing']);
  const levelOrder = ['Getting Started', 'Developing', 'Solid', 'Strong'];
  const dimensionKeys = ['situation', 'task', 'action', 'result', 'communication', 'pacing'] as const;

  // Helper: infer strongest/weakest from actual scores
  function inferDimension(best: boolean): string {
    let chosen = 'action';
    let chosenIdx = best ? -1 : 999;
    for (const key of dimensionKeys) {
      const dimScore = scores[key] as Record<string, unknown> | undefined;
      const idx = levelOrder.indexOf((dimScore?.level as string) ?? 'Developing');
      if (best ? idx > chosenIdx : idx < chosenIdx) {
        chosenIdx = idx;
        chosen = key;
      }
    }
    return chosen;
  }

  const rawStrongest = typeof obj.strongestDimension === 'string' ? obj.strongestDimension.toLowerCase().trim() : '';
  if (!validDimensions.has(rawStrongest)) {
    obj.strongestDimension = inferDimension(true);
  } else {
    obj.strongestDimension = rawStrongest;
  }

  // Validate weakestDimension
  const rawWeakest = typeof obj.weakestDimension === 'string' ? obj.weakestDimension.toLowerCase().trim() : '';
  if (!validDimensions.has(rawWeakest)) {
    obj.weakestDimension = inferDimension(false);
  } else {
    obj.weakestDimension = rawWeakest;
  }

  // Validate positiveCallouts — normalize to exactly 2 strings
  if (!Array.isArray(obj.positiveCallouts)) {
    obj.positiveCallouts = ['Good effort on structuring your answer.', 'Keep practicing to strengthen your responses.'];
  }
  // Filter to valid non-empty strings and ensure exactly 2
  const callouts = (obj.positiveCallouts as unknown[])
    .filter((c): c is string => typeof c === 'string' && c.trim() !== '')
    .slice(0, 2);
  while (callouts.length < 2) {
    callouts.push(callouts.length === 0
      ? 'Good effort on structuring your answer.'
      : 'Keep practicing to strengthen your responses.');
  }
  obj.positiveCallouts = callouts;

  return raw as ScoringResult;
}

// JSON Schema for OpenAI structured outputs — guarantees the response shape
const SCORING_JSON_SCHEMA = {
  name: 'interview_scoring',
  strict: true,
  schema: {
    type: 'object' as const,
    properties: {
      scores: {
        type: 'object' as const,
        properties: {
          situation:      { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
          task:           { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
          action:         { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
          result:         { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
          communication:  { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
          pacing:         { type: 'object' as const, properties: { level: { type: 'string' as const, enum: ['Getting Started', 'Developing', 'Solid', 'Strong'] }, explanation: { type: 'string' as const } }, required: ['level', 'explanation'], additionalProperties: false },
        },
        required: ['situation', 'task', 'action', 'result', 'communication', 'pacing'],
        additionalProperties: false,
      },
      suggestions: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
      followUp: { type: 'string' as const },
      overallSummary: { type: 'string' as const },
      strongestDimension: { type: 'string' as const, enum: ['situation', 'task', 'action', 'result', 'communication', 'pacing'] },
      weakestDimension: { type: 'string' as const, enum: ['situation', 'task', 'action', 'result', 'communication', 'pacing'] },
      positiveCallouts: {
        type: 'array' as const,
        items: { type: 'string' as const },
      },
    },
    required: ['scores', 'suggestions', 'followUp', 'overallSummary', 'strongestDimension', 'weakestDimension', 'positiveCallouts'],
    additionalProperties: false,
  },
};

async function attemptScore(
  openai: import('openai').default,
  transcript: string,
  question: string,
  resumeData?: ResumeData,
): Promise<ScoringResult> {
  const timeoutPromise = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('Scoring timed out after 30 seconds')), 30000)
  );

  const response = await Promise.race([
    openai.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0,
      seed: 42,
      response_format: { type: 'json_schema', json_schema: SCORING_JSON_SCHEMA },
      messages: [
        {
          role: 'system',
          content: SCORING_SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: buildUserMessage(transcript, question, resumeData),
        },
      ],
    }),
    timeoutPromise,
  ]);

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response from OpenAI');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse JSON response: ${content.slice(0, 200)}`);
  }

  // With structured outputs the schema is enforced, but we still validate
  // in case of edge cases (e.g. refusal, truncation)
  return validateScoringResult(parsed);
}

// --- Resume Question Generation ---
export async function generateResumeQuestion(
  resumeData: ResumeData,
  role: string,
  difficulty: string,
  category?: string,
): Promise<{ text: string; category: string }> {
  const openai = await getClient();

  const categoryInstruction =
    category && category !== 'random'
      ? `- Test the candidate on the "${category}" competency`
      : '- Choose the most relevant behavioral competency based on their background';

  const systemPrompt = `You are an expert behavioral interview coach. Generate one behavioral interview question tailored to this candidate's background. The question should:
- Reference or relate to their specific experience, skills, or projects
- Be appropriate for a ${role} interview at ${difficulty} difficulty
${categoryInstruction}
- Use the "Tell me about a time when..." format
- Be specific enough that it connects to their resume but general enough they could answer about various experiences

Return JSON: { "text": "the question", "category": "the category tag" }`;

  const backgroundLines: string[] = [];
  if (resumeData.education) backgroundLines.push(`Education: ${resumeData.education}`);
  if (resumeData.skills.length > 0) backgroundLines.push(`Skills: ${resumeData.skills.join(', ')}`);
  if (resumeData.experience.length > 0) backgroundLines.push(`Experience: ${resumeData.experience.join('; ')}`);
  if (resumeData.projects.length > 0) backgroundLines.push(`Projects: ${resumeData.projects.join('; ')}`);

  const userMessage = `Candidate background:\n${backgroundLines.join('\n')}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.8,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Empty response from OpenAI');

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Failed to parse JSON from generateResumeQuestion: ${content.slice(0, 200)}`);
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    typeof (parsed as Record<string, unknown>).text !== 'string' ||
    !(parsed as Record<string, unknown>).text
  ) {
    throw new Error(`Unexpected shape from generateResumeQuestion: ${JSON.stringify(parsed)}`);
  }

  const result = parsed as { text: string; category?: string };
  return {
    text: result.text,
    category:
      typeof result.category === 'string' && result.category
        ? result.category
        : (category && category !== 'random' ? category : 'behavioral'),
  };
}

export async function scoreAnswer(
  transcript: string,
  question: string,
  resumeData?: ResumeData,
): Promise<ScoringResult> {
  const openai = await getClient();

  try {
    return await attemptScore(openai, transcript, question, resumeData);
  } catch (firstError) {
    console.warn('scoreAnswer: first attempt failed, retrying in 1s.', firstError);
    await new Promise((r) => setTimeout(r, 1000));
    try {
      return await attemptScore(openai, transcript, question, resumeData);
    } catch (secondError) {
      const message = secondError instanceof Error ? secondError.message : String(secondError);
      throw new Error(`scoreAnswer failed after 2 attempts: ${message}`);
    }
  }
}
