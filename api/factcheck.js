const IS_DEV = process.env.NODE_ENV !== "production";

function log(level, msg, data) {
  if (!IS_DEV && level === "debug") return;
  const prefix = `[api/factcheck]`;
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

  const { question, answer, correction } = req.body ?? {};

  if (!question || !answer || !correction) {
    return res.status(400).json({ error: "question, answer, and correction are required" });
  }

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
You are a strict fact-checking AI for technical interview answers.
Question: ${question}
Candidate Answer: ${answer}
User Correction: ${correction}

Respond in JSON ONLY:
{
  "is_correct": true|false,
  "result": "The correction is accurate." | "The correction is not accurate.",
  "explanation": "Explain in 2-3 sentences why the correction is valid or invalid."
}
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

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (parseErr) {
      log("error", "JSON parse failed", { rawText: rawText.slice(0, 300) });
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    log("info", "Factcheck completed", { is_correct: result.is_correct });
    return res.status(200).json(result);
  } catch (err) {
    log("error", "Factcheck failed", { error: String(err) });
    return res.status(500).json({ error: "Fact-check failed" });
  }
}
