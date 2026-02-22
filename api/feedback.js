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

export default async function handler(req, res) {
  log("info", "Request received", { method: req.method });
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("error", "OPENAI_API_KEY not set");
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  const { questions, answers } = req.body ?? {};

  if (!Array.isArray(questions) || !Array.isArray(answers) || questions.length !== answers.length) {
    return res.status(400).json({ error: "questions and answers must be parallel arrays" });
  }

  const combined = questions
    .map((q, i) => `Question ${i + 1}: ${q}\nAnswer ${i + 1}: ${answers[i]}`)
    .join("\n\n");

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

For EACH question in the transcript, do ALL of the following:
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

JSON FORMAT ONLY. DO NOT OMIT ANY FIELDS.
Transcript:
${combined}
`,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log("error", "OpenAI API error", { status: response.status, body: errText });
      return res.status(502).json({ error: "OpenAI API error" });
    }

    const data = await response.json();
    let rawText = (data.output_text ?? data.output?.[0]?.content?.[0]?.text ?? "").trim();

    // Strip markdown fences
    rawText = rawText.replace(/^```json\s*/, "").replace(/```$/, "").trim();

    let feedback;
    try {
      feedback = JSON.parse(rawText);
    } catch (parseErr) {
      log("error", "JSON parse failed", { rawText: rawText.slice(0, 300) });
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    // Validate question count
    if (!feedback.questions || feedback.questions.length !== questions.length) {
      log("error", "Invalid question count", {
        expected: questions.length,
        got: feedback.questions?.length,
      });
      return res.status(502).json({ error: "AI returned incomplete feedback. Please retry." });
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
