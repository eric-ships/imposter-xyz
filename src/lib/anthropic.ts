import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

// Generic seed domains: broad, universal categories most adults would
// recognize, spanning food, nature, places, entertainment, objects, and
// concepts. Claude narrows the seed into a specific single-word
// category + item per round.
const SEED_DOMAINS = [
  // food & drink
  "fruits",
  "vegetables",
  "desserts",
  "candy",
  "cheeses",
  "spices",
  "breads",
  "pastas",
  "soups",
  "sandwiches",
  "cocktails",
  "coffee drinks",
  "teas",
  "cereals",
  "sauces",
  "snacks",
  "fast food",
  "street food",
  "ice cream flavors",
  "pizzas",
  // animals
  "mammals",
  "birds",
  "reptiles",
  "amphibians",
  "fish",
  "insects",
  "sea creatures",
  "dinosaurs",
  "mythical creatures",
  "dog breeds",
  "cat breeds",
  "farm animals",
  "pets",
  // places
  "countries",
  "capital cities",
  "islands",
  "mountains",
  "rivers",
  "deserts",
  "beaches",
  "landmarks",
  "national parks",
  "volcanoes",
  // entertainment
  "movies",
  "sitcoms",
  "cartoons",
  "animated films",
  "superhero movies",
  "horror movies",
  "musicals",
  "tv shows",
  "video games",
  "anime",
  // music
  "bands",
  "pop stars",
  "rock bands",
  "rappers",
  "instruments",
  "songs",
  "dance styles",
  "composers",
  // characters & fiction
  "superheroes",
  "villains",
  "princesses",
  "cartoon characters",
  "sitcom characters",
  "video-game characters",
  "fictional detectives",
  "book characters",
  // games & sports
  "board games",
  "card games",
  "sports",
  "olympic events",
  "martial arts",
  "extreme sports",
  // objects
  "kitchen utensils",
  "tools",
  "office supplies",
  "clothing",
  "shoes",
  "jewelry",
  "furniture",
  "appliances",
  "toys",
  "musical instruments",
  // vehicles
  "cars",
  "airplanes",
  "boats",
  "trains",
  "bicycles",
  // nature
  "flowers",
  "trees",
  "gemstones",
  "weather phenomena",
  "clouds",
  "rocks",
  // space & science
  "planets",
  "constellations",
  "chemical elements",
  "scientists",
  "inventions",
  // people
  "historical figures",
  "artists",
  "authors",
  "philosophers",
  "explorers",
  "professions",
  // culture
  "greek gods",
  "norse mythology",
  "egyptian gods",
  "religions",
  "holidays",
  "zodiac signs",
  "festivals",
  // tech
  "tech companies",
  "programming languages",
  "apps",
  "websites",
  "gadgets",
  "video-game consoles",
  // misc
  "colors",
  "emotions",
  "shapes",
  "knots",
  "yoga poses",
  "magic tricks",
  "fashion brands",
  "cosmetics",
  "beverages",
];

function pickSeed(avoidCategories: string[]): string {
  const lowered = new Set(avoidCategories.map((c) => c.toLowerCase()));
  const pool = SEED_DOMAINS.filter((s) => !lowered.has(s.toLowerCase()));
  const src = pool.length > 0 ? pool : SEED_DOMAINS;
  return src[Math.floor(Math.random() * src.length)];
}

const SYSTEM = `You generate prompts for a social deduction word game.

You will be given a SEED DOMAIN to anchor the round. Produce:
- "category": a SINGLE word (Title Case, no spaces, hyphens allowed). Broad enough to fit several specific items. Examples: "Cartoons", "Cocktails", "Cereals", "Sitcoms", "Sneakers", "Villains", "Anime", "Pastries", "Planets", "Instruments".
- "word": a SINGLE word (Title Case, no spaces, hyphens allowed). One specific, well-known item that unambiguously belongs to that category. Examples: "Squirtle", "Negroni", "Rocky", "Crocs", "Naruto", "Eclair", "Jupiter", "Clarinet".

Hard rules:
- BOTH category and word must be exactly ONE word. No spaces. Hyphens and apostrophes allowed. If the natural phrase has a space (e.g. "French Toast"), pick a one-word alternative (e.g. "Croissant") or drop the qualifier (e.g. "Toast").
- The word must be broadly recognizable to an average adult — not niche inside-baseball.
- Lean toward the second- or third-most-recognizable option within the category for freshness. Do NOT fall back to the most obvious pick (no Pancakes, Medusa, Paris, Everest, Spider-Man, Beyoncé, Friends, Voldemort).
- Different pick every call.
- Avoid offensive, political, or obscure content. Keep it SFW and inclusive.

Return ONLY JSON: {"category": "...", "word": "..."}. No prose, no markdown fences.`;

export async function generateWordPrompt(
  avoid: { categories?: string[]; words?: string[] } = {}
): Promise<WordPrompt> {
  const seed = pickSeed(avoid.categories ?? []);
  const avoidLines: string[] = [];
  if (avoid.categories?.length) {
    avoidLines.push(
      `Avoid these recent categories: ${avoid.categories
        .map((c) => `"${c}"`)
        .join(", ")}.`
    );
  }
  if (avoid.words?.length) {
    avoidLines.push(
      `Avoid these recent words: ${avoid.words
        .map((w) => `"${w}"`)
        .join(", ")}.`
    );
  }
  // A random salt nudges Claude toward a different sample each call even
  // when the seed and avoid lists are identical.
  const salt = Math.random().toString(36).slice(2, 10);
  const userContent = [
    `SEED DOMAIN: ${seed}`,
    `Salt (ignore, just ensures variety): ${salt}`,
    avoidLines.join("\n"),
    "Generate a fresh category and word from the seed domain. Return only JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    temperature: 1,
    system: SYSTEM,
    messages: [
      {
        role: "user",
        content: userContent,
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

export function normalizeWord(input: string): string {
  return input.trim().toLowerCase().replace(/\s+/g, " ");
}

const JUDGE_SYSTEM = `You judge whether a player's guess is "close enough" to a secret word in a word-guessing game. The imposter is trying to guess the secret word after being caught, and deserves partial credit if they're clearly on the right track.

Return ONLY JSON: {"close": true|false, "reason": "brief explanation"}

Consider "close" if the guess is:
- A plural/singular variant or close misspelling of the secret word
- A direct synonym or near-synonym
- A specific instance of the same concept (e.g. "labrador" for "dog")
- A generic parent category that uniquely points at the secret (e.g. "breakfast pancake" for "Pancakes")

Do NOT consider close:
- A different item in the same broad category (e.g. "waffles" for "pancakes", "cat" for "dog")
- Vague or generic guesses that could fit many words
- Unrelated concepts

Be strict. If unsure, return close=false.`;

export async function judgeGuess(
  secretWord: string,
  guess: string
): Promise<{ close: boolean; reason: string }> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 200,
    temperature: 0,
    system: JUDGE_SYSTEM,
    messages: [
      {
        role: "user",
        content: `Secret word: "${secretWord}"\nGuess: "${guess}"\n\nReturn only JSON.`,
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
    return { close: false, reason: "parse failed" };
  }

  try {
    const parsed = JSON.parse(match[0]) as {
      close: boolean;
      reason: string;
    };
    return { close: !!parsed.close, reason: parsed.reason ?? "" };
  } catch {
    return { close: false, reason: "parse failed" };
  }
}
