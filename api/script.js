const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
  }

  const { systemPrompt, directive, conversationContext } = req.body ?? {};
  if (!systemPrompt || !directive) {
    return res.status(400).json({ error: "systemPrompt and directive are required" });
  }

  const messages = [
    { role: "system", content: systemPrompt },
  ];
  if (conversationContext) {
    messages.push({ role: "user", content: `[Conversation so far]: ${conversationContext}` });
  }
  messages.push({ role: "user", content: directive });

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
        messages,
        temperature: 0.8,
        max_tokens: 150,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[api/script] Groq error", response.status, errText);
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    const text = (data.choices?.[0]?.message?.content ?? "").trim();

    return res.status(200).json({ text });
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      return res.status(504).json({ error: "Groq request timed out" });
    }
    console.error("[api/script] Error", String(err));
    return res.status(500).json({ error: "Script generation failed" });
  }
}
