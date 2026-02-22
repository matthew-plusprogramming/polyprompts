const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
  }

  const { resumeText, jobDescription, questionNumber, previousQuestions } =
    req.body ?? {};

  if (!resumeText || !jobDescription) {
    return res
      .status(400)
      .json({ error: "resumeText and jobDescription are required" });
  }

  const prevList =
    Array.isArray(previousQuestions) && previousQuestions.length > 0
      ? `\n\nPrevious questions already asked (do NOT repeat these):\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "";

  const prompt = `You are a behavioral interview question generator. Given a candidate's resume and a job description, generate a single behavioral interview question that is highly relevant to both the candidate's background and the target role.

Resume:
${typeof resumeText === "string" ? resumeText.slice(0, 6000) : ""}

Job Description:
${typeof jobDescription === "string" ? jobDescription.slice(0, 3000) : ""}
${prevList}

This is question number ${questionNumber || 1}.

Generate ONE behavioral interview question. The question should:
- Be specific to the candidate's experience mentioned in their resume
- Be relevant to the skills or responsibilities in the job description
- Follow the "Tell me about a time when..." or similar behavioral format
- Be challenging but fair

Respond with JSON only: {"question": "...", "type": "behavioral", "focus": "brief focus area"}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const response = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[api/resume-question] Groq error", response.status, errText);
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[api/resume-question] JSON parse failed", content.slice(0, 300));
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    return res.status(200).json({
      question: parsed.question || "",
      type: parsed.type || "behavioral",
      focus: parsed.focus || "",
    });
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      return res.status(504).json({ error: "Groq request timed out" });
    }
    console.error("[api/resume-question] Error", String(err));
    return res.status(500).json({ error: "Failed to generate question" });
  }
}
