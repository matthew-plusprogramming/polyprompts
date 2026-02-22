const IS_DEV = process.env.NODE_ENV !== "production";

function log(level, msg, data) {
  if (!IS_DEV && level === "debug") return;
  const prefix = `[api/feedback]`;
  if (data) {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`, data);
  } else {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`);
  }
}

const CATEGORIES = [
  "response_organization",
  "technical_knowledge",
  "problem_solving",
  "position_application",
  "timing",
  "personability",
];

function buildSchema(questionCount) {
  const questionSchema = {
    type: "object",
    properties: {
      response_organization: { type: "number" },
      technical_knowledge: { type: "number" },
      problem_solving: { type: "number" },
      position_application: { type: "number" },
      timing: { type: "number" },
      personability: { type: "number" },
      best_part_quote: { type: "string" },
      best_part_explanation: { type: "string" },
      worst_part_quote: { type: "string" },
      worst_part_explanation: { type: "string" },
      what_went_well: { type: "string" },
      needs_improvement: { type: "string" },
      summary: { type: "string" },
      confidence_score: { type: "number" },
    },
    required: [
      "response_organization", "technical_knowledge", "problem_solving",
      "position_application", "timing", "personability",
      "best_part_quote", "best_part_explanation",
      "worst_part_quote", "worst_part_explanation",
      "what_went_well", "needs_improvement", "summary", "confidence_score",
    ],
    additionalProperties: false,
  };

  return {
    type: "json_schema",
    name: "interview_feedback",
    strict: true,
    schema: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: questionSchema,
          minItems: questionCount,
          maxItems: questionCount,
        },
        overall: {
          type: "object",
          properties: {
            response_organization: { type: "number" },
            technical_knowledge: { type: "number" },
            problem_solving: { type: "number" },
            position_application: { type: "number" },
            timing: { type: "number" },
            personability: { type: "number" },
            what_went_well: { type: "string" },
            needs_improvement: { type: "string" },
            summary: { type: "string" },
          },
          required: [
            "response_organization", "technical_knowledge", "problem_solving",
            "position_application", "timing", "personability",
            "what_went_well", "needs_improvement", "summary",
          ],
          additionalProperties: false,
        },
      },
      required: ["questions", "overall"],
      additionalProperties: false,
    },
  };
}

export default async function handler(req, res) {
  log("info", "Request received", { method: req.method });
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("error", "OPENAI_API_KEY not set");
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  const { questions, answers, resumeText, jobDescription } = req.body ?? {};

  if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length) {
    return res.status(400).json({ error: "questions and answers must be parallel arrays" });
  }

  const combined = questions
    .map((q, i) => `Question ${i + 1}: ${q}\nAnswer ${i + 1}: ${answers[i]}`)
    .join("\n\n");

  const resumeContext =
    resumeText && jobDescription
      ? `\n\nCANDIDATE CONTEXT (use this to tailor your feedback):\nResume excerpt: ${String(resumeText).slice(0, 3000)}\nTarget role / Job description: ${String(jobDescription).slice(0, 2000)}\n`
      : "";

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        input: `
You are a strict but supportive software engineering interviewer.

For EACH of the ${questions.length} questions in the transcript, do ALL of the following:
1. Score these categories 0.0–100.0 with ONE decimal: response_organization, technical_knowledge, problem_solving, position_application, timing, personability
2. Identify the BEST sentence EXACTLY as written. Put in "best_part_quote".
3. Explain in 4-5 sentences in "best_part_explanation".
4. Identify the WORST sentence EXACTLY as written. Put in "worst_part_quote".
5. Explain in 4-5 sentences in "worst_part_explanation".
6. Provide "what_went_well", "needs_improvement", "summary" (2-3 sentences each)
7. Provide "confidence_score" (0.0–100.0)

FOR THE OVERALL INTERVIEW:
- Repeat the same six categories, overall.score = average
- Provide overall what_went_well, needs_improvement, summary

You MUST return exactly ${questions.length} items in the "questions" array.
${resumeContext}
Transcript:
${combined}
`,
        text: { format: buildSchema(questions.length) },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log("error", "OpenAI API error", { status: response.status, body: errText });
      return res.status(502).json({ error: "OpenAI API error" });
    }

    const data = await response.json();
    const rawText = (data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "").trim();

    let feedback;
    try {
      feedback = JSON.parse(rawText);
    } catch (parseErr) {
      log("error", "JSON parse failed", { rawText: rawText.slice(0, 300) });
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    // Calculate per-question scores
    feedback.questions = feedback.questions.map((q) => {
      const total = CATEGORIES.reduce((sum, cat) => sum + Number(q[cat] ?? 0), 0);
      const avg = total / CATEGORIES.length;

      return {
        score: Number(avg.toFixed(1)),
        best_part_quote: q.best_part_quote ?? "",
        best_part_explanation: q.best_part_explanation ?? "",
        worst_part_quote: q.worst_part_quote ?? "",
        worst_part_explanation: q.worst_part_explanation ?? "",
        what_went_well: q.what_went_well ?? "",
        needs_improvement: q.needs_improvement ?? "",
        summary: q.summary ?? "",
        confidence_score: q.confidence_score ?? null,
      };
    });

    // Calculate overall scores
    if (feedback.overall) {
      const overallTotal = CATEGORIES.reduce(
        (sum, cat) => sum + Number(feedback.overall[cat] ?? 0),
        0
      );
      feedback.overall.score = Number((overallTotal / CATEGORIES.length).toFixed(1));
    }

    log("info", "Feedback generated", { questionCount: feedback.questions.length });
    return res.status(200).json(feedback);
  } catch (err) {
    log("error", "Feedback failed", { error: String(err) });
    return res.status(500).json({ error: "Feedback failed" });
  }
}
