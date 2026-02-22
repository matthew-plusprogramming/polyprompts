const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
  }

  const { overall, questions } = req.body ?? {};
  if (!overall || !Array.isArray(questions)) {
    return res.status(400).json({ error: "overall and questions are required" });
  }

  const questionSummaries = questions
    .map((q, i) => `Q${i + 1}: score ${Math.round(q.score)}% — ${q.summary}`)
    .join("\n");

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
            role: "system",
            content: "You are Starly, a friendly interview coach giving a brief spoken debrief after a practice interview. Keep it to 1-2 sentences. Mention the overall score and one quick takeaway, then encourage them to check out the guided review below. Write exactly how you'd say it out loud — casual, warm, no stiff or formal phrasing. Use contractions and natural speech patterns. This will be read aloud via TTS.",
          },
          {
            role: "user",
            content: `Overall score: ${Math.round(overall.score)}%\nStrengths: ${overall.what_went_well}\nAreas to improve: ${overall.needs_improvement}\n\nPer-question summaries:\n${questionSummaries}`,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[api/voice-summary] Groq error", response.status, errText);
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();

    return res.status(200).json({ text });
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      return res.status(504).json({ error: "Groq request timed out" });
    }
    console.error("[api/voice-summary] Error", String(err));
    return res.status(500).json({ error: "Voice summary failed" });
  }
}
