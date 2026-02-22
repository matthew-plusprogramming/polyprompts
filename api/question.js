const IS_DEV = process.env.NODE_ENV !== "production";

function log(level, msg, data) {
  if (!IS_DEV && level === "debug") return;
  const prefix = `[api/question]`;
  if (data) {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`, data);
  } else {
    console[level === "debug" ? "log" : level](`${prefix} ${msg}`);
  }
}

export default async function handler(req, res) {
  log("info", "Request received", { method: req.method });
  if (req.method !== "POST") return res.status(405).end();

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    log("error", "OPENAI_API_KEY not set");
    return res.status(500).json({ error: "OPENAI_API_KEY not set" });
  }

  const { role, questionNumber, previousQuestions } = req.body ?? {};

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
You are a behavioral interviewer conducting a Computer Science mock interview.

Generate exactly ONE interview question for a ${role || "software engineering intern"}.

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
`,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      log("error", "OpenAI API error", { status: response.status, body: errText });
      return res.status(502).json({ error: "OpenAI API error" });
    }

    const data = await response.json();
    let question = (data.output?.[0]?.content?.[0]?.text ?? "").trim();

    // Cleanup safety
    question = question
      .replace(/^.*?:\s*/, "")
      .replace(/["]/g, "")
      .trim();

    log("info", "Question generated", { questionNumber, questionLength: question.length });
    return res.status(200).json({ question });
  } catch (err) {
    log("error", "Failed to generate question", { error: String(err) });
    return res.status(500).json({ error: "Failed to generate question" });
  }
}
