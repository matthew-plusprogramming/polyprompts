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

  const { jobDescription, resumeText, candidateName, questionNumber, previousQuestions } =
    req.body ?? {};

  if (!jobDescription) {
    return res
      .status(400)
      .json({ error: "jobDescription is required" });
  }

  const prevList =
    Array.isArray(previousQuestions) && previousQuestions.length > 0
      ? `\n\nPrevious questions already asked (do NOT repeat these):\n${previousQuestions.map((q, i) => `${i + 1}. ${q}`).join("\n")}`
      : "";

  const nameInstruction = candidateName
    ? `\nThe candidate's name is ${candidateName}. Address them by name naturally in the question.`
    : "";

  const prompt = `You are a behavioral interview question generator. Given a job description (and optionally a candidate's resume for context), generate a single behavioral interview question focused on the job description's requirements.

Job Description:
${typeof jobDescription === "string" ? jobDescription.slice(0, 3000) : ""}
${resumeText ? `\nCandidate Resume (for context only):\n${typeof resumeText === "string" ? resumeText.slice(0, 4000) : ""}` : ""}
${prevList}${nameInstruction}

This is question number ${questionNumber || 1}.

Generate ONE behavioral interview question. The question should:
- START by briefly describing what the company/role does based on the job description, then ask about the candidate's relevant experience. Example: "At our company, we build scalable data pipelines for real-time analytics — tell me about a time when you worked on something similar." or "In this role, you'd be leading cross-functional design sprints — what experience do you have facilitating collaborative workshops?"
- The company context should describe what they actually DO (from the JD), not just say "at our company" generically — give enough context so the candidate understands the work, then ask about their related experience
- Keep the company context lead-in under 25 words, then transition to the behavioral question
- Be relevant to the skills, responsibilities, or values mentioned in the job description
- Follow a behavioral format (e.g. "Tell me about a time when..." or "How did you handle...")
- Be challenging but fair
- Keep it concise but allow enough detail for context — aim for 25–50 words
- Be NDA-conscious: do not ask the candidate to reveal proprietary details, trade secrets, or confidential info from previous employers. Frame questions about past experience to focus on the candidate's role, approach, and learnings rather than specific proprietary technologies or internal processes

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
      console.error("[api/jobdesc-question] Groq error", response.status, errText);
      return res.status(502).json({ error: "Groq API error" });
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content ?? "";

    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch {
      console.error("[api/jobdesc-question] JSON parse failed", content.slice(0, 300));
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
    console.error("[api/jobdesc-question] Error", String(err));
    return res.status(500).json({ error: "Failed to generate question" });
  }
}
