const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

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

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    log("error", "GROQ_API_KEY not set");
    return res.status(500).json({ error: "GROQ_API_KEY not set" });
  }

  const { role, questionNumber, previousQuestions } = req.body ?? {};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          {
            role: "user",
            content: `You are a behavioral interviewer conducting a Computer Science mock interview.

Generate exactly ONE interview question for a ${role || "software engineering intern"}.

STRICT RULES:
- Output ONLY the question itself
- Do NOT include explanations, conclusions, or preamble
- Do NOT include phrases like "Sure!" or "Here is a question"
- Do NOT include numbering
- Keep it concise but allow enough detail for context — aim for 20–40 words
- A brief conversational lead-in like "Tell me about a time when..." is fine

Previously asked questions:
${previousQuestions?.join("\n") || "None"}

Generate a NEW question that is different from the previous ones.`,
          },
        ],
        temperature: 0.8,
        max_tokens: 250,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      log("error", "Groq API error", { status: response.status, body: errText });
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    let question = (data.choices?.[0]?.message?.content ?? "").trim();

    // Cleanup safety
    question = question
      .replace(/^.*?:\s*/, "")
      .replace(/["]/g, "")
      .trim();

    log("info", "Question generated", { questionNumber, questionLength: question.length });
    return res.status(200).json({ question });
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      return res.status(504).json({ error: "Groq request timed out" });
    }
    log("error", "Failed to generate question", { error: String(err) });
    return res.status(500).json({ error: "Failed to generate question" });
  }
}
