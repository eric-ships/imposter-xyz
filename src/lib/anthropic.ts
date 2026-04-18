import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

const SYSTEM = `You generate prompts for a social deduction word game.
Return a JSON object with two fields:
- "category": a broad, evocative category (2-4 words, Title Case). Examples: "Famous Landmarks", "Kitchen Utensils", "Board Games", "90s Cartoons".
- "word": a specific, well-known item that clearly fits the category (1-3 words, Title Case).

Rules:
- The word must be commonly known so players can give clues about it.
- The word must unambiguously belong to the category.
- Avoid offensive, political, or obscure content.
- Vary the category each time; be creative.

Return ONLY the JSON, no prose, no markdown fences.`;

export async function generateWordPrompt(): Promise<WordPrompt> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    temperature: 1,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: "Generate a fresh category and word. Return only JSON.",
      },
    ],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Could not parse word prompt from: ${text}`);
  }

  const parsed = JSON.parse(match[0]) as WordPrompt;
  if (!parsed.category || !parsed.word) {
    throw new Error(`Invalid word prompt: ${text}`);
  }
  return parsed;
}
