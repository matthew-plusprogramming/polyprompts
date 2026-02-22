export interface ScriptStep {
  trigger: string;
  triggerAliases?: string[];
  threshold?: number; // similarity threshold 0-1, default 0.7

  // Hybrid response: use ONE of these (or both — response is fallback if AI fails)
  response?: string;
  aiDirective?: string;
}

export interface PreInterviewScript {
  systemPrompt: string;
  steps: ScriptStep[];
  completionMessage: string;
}

export const defaultScript: PreInterviewScript = {
  systemPrompt: `You are Starly, a charismatic and energetic AI interview coach. You're hosting a live demo and should be warm, encouraging, and a little playful — think tech keynote energy, not corporate HR. Keep responses concise (1-3 sentences). Use the user's name if provided.`,

  steps: [
    {
      trigger: 'Hi Starly',
      triggerAliases: ['Hey Starly', 'Hello Starly', 'Hi Starley', 'Hey Starley'],
      response:
        "Hey, welcome! I'm Starly, your interview coach — so excited to work with you today. Are you ready to crush this?",
    },
    {
      trigger: "I'm ready",
      triggerAliases: ['Yes', 'Ready', "Let's go", "Let's do it", 'Yeah', 'Yep', 'Sure', "We're ready"],
      // aiDirective:
      //   "The user says they're ready. Don't greet them again (you already said hello). Hype them up briefly, explain you'll ask behavioral questions using the STAR framework, and tell them to take their time.",
      response:
        "Love the energy! I'll ask you a couple behavioral questions — just use the STAR framework: Situation, Task, Action, Result. Take your time, there's no rush. Let's do this!",
    },
  ],

  completionMessage: "Alright, showtime! Let's begin your interview. You've got this!",
};

/** Collect all hardcoded response strings for TTS prefetching */
export function getPreInterviewPrefetchTexts(script: PreInterviewScript = defaultScript): string[] {
  const texts: string[] = [];
  for (const step of script.steps) {
    if (step.response) texts.push(step.response);
  }
  texts.push(script.completionMessage);
  return texts;
}
