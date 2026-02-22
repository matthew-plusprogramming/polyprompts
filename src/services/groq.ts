export type GroqChatRole = "user" | "assistant";

export interface GroqChatMessage {
  role: GroqChatRole;
  content: string;
}

export interface GroqCategoryFeedback {
  key: string;
  label: string;
  percent: number;
  level: string;
  explanation: string;
}

interface GroqChatRequest {
  messages: GroqChatMessage[];
  question?: string;
  transcript?: string;
  suggestions?: string[];
  followUp?: string;
  scoreSummary?: string[];
  overallSummary?: string;
  categoryFeedback?: GroqCategoryFeedback[];
  role?: string;
  difficulty?: string;
}

interface GroqChatResponse {
  reply: string;
}

export async function sendGroqChat(payload: GroqChatRequest): Promise<GroqChatResponse> {
  const endpoint = "/api/groq";
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20000);

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error("Groq request timed out. Please try again.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 404) {
      const hint =
        window.location.port === "5173"
          ? "Run `npx vercel dev` and open http://localhost:3000 (not 5173)."
          : "Ensure `api/groq.js` exists and Vercel dev is running from the project root.";
      throw new Error(`Groq route not found (${endpoint}). ${hint}`);
    }

    const message =
      typeof data?.error === "string"
        ? data.error
        : `Groq request failed (${response.status}) at ${endpoint}`;
    throw new Error(message);
  }

  return data as GroqChatResponse;
}
