import express from "express";
import OpenAI from "openai";
import dotenv from "dotenv";
import cors from "cors";

// Load environment variables
dotenv.config();

// Create the Express app
const app = express();

// Allow JSON requests
app.use(express.json());

// Enable CORS so frontend can talk to backend
app.use(cors());

// Initialize OpenAI with API key
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});
app.post("/api/question", async (req, res) => {

  try {

    const { role, questionNumber, previousQuestions } = req.body;

    const response = await openai.responses.create({

      model: "gpt-4o-mini",

      input: `
You are a behavioral interviewer conducting a Computer Science mock interview.

Generate exactly ONE interview question for a ${role}.

STRICT RULES:
- Output ONLY the question itself
- Do NOT include explanations
- Do NOT include introductions, unless it's conversational phrases an interviewer would use
- Do NOT include conclusions
- Do NOT include phrases like "Sure!" or "Here is a question"
- Do NOT include numbering
- Maximum 2 sentences
- Be concise and realistic

Previously asked questions:
${previousQuestions?.join("\n") || "None"}

Generate a NEW question that is different from the previous ones.
`

    });

    let question = response.output[0].content[0].text.trim();

    // Extra cleanup safety
    question = question
      .replace(/^.*?:/, "")  // remove "Sure! Here's..."
      .replace(/["]/g, "")
      .trim();

    res.json({ question });

  } catch (error) {

    console.error(error);

    res.status(500).json({ error: "Failed to generate question" });

  }

});
app.post("/api/feedback", async (req, res) => {

  try {

    const { questions, answers } = req.body;

    const combined = questions.map((q, i) =>
      `Question ${i+1}: ${q}\nAnswer ${i+1}: ${answers[i]}`
    ).join("\n\n");

const response = await openai.responses.create({
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
`
  
});

    const text = response.output[0].content[0].text.trim();

    console.log("NEW FEEDBACK:", text);


    let cleanedText = response.output_text.trim();
    cleanedText = cleanedText.replace(/^```json\s*/, "").replace(/```$/, "").trim();
    const feedback = JSON.parse(cleanedText);
    console.log(
  "Questions returned:",
  feedback.questions?.length
);

feedback.questions?.forEach((q, i) => {
  console.log("Q", i+1, "best quote:", q.best_part_quote);
  console.log("Q", i+1, "worst quote:", q.worst_part_quote);
});

    if (!feedback.questions || feedback.questions.length !== questions.length) {

  console.error("INVALID QUESTION COUNT");
  console.error("Expected:", questions.length);
  console.error("Got:", feedback.questions?.length);

  return res.status(500).json({
    error: "AI returned incomplete feedback. Please retry."
  });
}

const categories = [
  "response_organization",
  "technical_knowledge",
  "problem_solving",
  "position_application",
  "timing",
  "personability"
];

// Calculate per-question score
feedback.questions = feedback.questions.map(q => {

  const total = categories.reduce(
    (sum, cat) => sum + Number(q[cat] ?? 0),
    0
  );

  const avg = total / categories.length;

  return {
    score: Number(avg.toFixed(1)),

    best_part_quote: q.best_part_quote,
    best_part_explanation: q.best_part_explanation,

    worst_part_quote: q.worst_part_quote,
    worst_part_explanation: q.worst_part_explanation,

    what_went_well: q.what_went_well,
    needs_improvement: q.needs_improvement,
    summary: q.summary,

    confidence_score: q.confidence_score ?? null
  };
});
// Calculate overall score
const overallTotal = categories.reduce(
  (sum, cat) => sum + Number(feedback.overall[cat] ?? 0),
  0
);

feedback.overall.score = Number(
  (overallTotal / categories.length).toFixed(1)
);

res.json(feedback);

  } catch (error) {

    console.error(error);

    res.status(500).json({ error: "Feedback failed" });

  }

});
const PORT = 3001;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});