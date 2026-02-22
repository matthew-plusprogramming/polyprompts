const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.1-8b-instant";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    return res.status(500).json({ error: "GROQ_API_KEY is not configured" });
  }

  const { transcript } = req.body ?? {};
  if (!transcript || typeof transcript !== "string") {
    return res.status(400).json({ error: "transcript is required" });
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

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
            content: `You analyze an interview candidate's transcript after they paused for several seconds. Decide what to do next. Be decisive — avoid "ask" unless truly necessary.

Return "definitely_done" if you are >=60% confident the candidate has finished. This includes:
- The candidate explicitly signals they are finished (e.g. "I'm done", "that's it", "that's all", "that's my answer", "yeah that's about it", "I think that covers it")
- The answer has a concluding statement (wrapping up with a result, lesson learned, or summary) AND covers reasonable ground (30+ words)
- The candidate has addressed the question and their last sentence feels like a natural stopping point
- The transcript trails off after making a complete point, even without an explicit wrap-up
- The answer is 50+ words and the last sentence is a complete thought

Return "definitely_still_talking" ONLY if you are very confident the candidate is mid-thought:
- The transcript ends mid-sentence with an incomplete clause
- The last word is a conjunction or preposition (and, but, so, because, like, with, to, for, that, which)
- The transcript is very short (under 15 words) and clearly just getting started

Return "ask" ONLY as a last resort when you genuinely cannot decide. Strongly prefer "definitely_done" over "ask" — a pause of several seconds after a reasonable answer almost always means they're done.

Return JSON only: {"verdict": "definitely_done" | "definitely_still_talking" | "ask"}`,
          },
          {
            role: "user",
            content: `Transcript so far: "${transcript}"`,
          },
        ],
        temperature: 0,
        max_tokens: 20,
        response_format: { type: "json_object" },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      const errText = await response.text();
      console.error("[api/pause] Groq error", response.status, errText);
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "{}";
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[api/pause] JSON parse failed", content.slice(0, 300));
      return res.status(502).json({ error: "AI returned invalid JSON" });
    }

    const verdict = parsed.verdict;
    if (verdict === "definitely_done" || verdict === "definitely_still_talking") {
      return res.status(200).json({ verdict });
    }
    return res.status(200).json({ verdict: "ask" });
  } catch (err) {
    if (err && typeof err === "object" && err.name === "AbortError") {
      return res.status(504).json({ error: "Groq request timed out" });
    }
    console.error("[api/pause] Error", String(err));
    return res.status(500).json({ error: "Pause analysis failed" });
  }
}
