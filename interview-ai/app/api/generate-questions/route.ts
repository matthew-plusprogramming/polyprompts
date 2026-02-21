import { NextRequest, NextResponse } from "next/server";
import OpenAI from "openai";

export async function POST(req: NextRequest) {
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const { role, count = 5 } = await req.json();

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are an expert technical interviewer. Generate concise, realistic interview questions. Return ONLY a JSON array of strings, no other text.",
      },
      {
        role: "user",
        content: `Generate ${count} interview questions for a ${role} position. Mix behavioral and technical questions. Return as a JSON array like: ["Question 1?", "Question 2?"]`,
      },
    ],
  });

  const text = completion.choices[0].message.content || "[]";
  const questions = JSON.parse(text.replace(/```json|```/g, "").trim());

  return NextResponse.json({ questions });
}
