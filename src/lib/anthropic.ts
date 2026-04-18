import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

const SEED_DOMAINS = [
  // food & drink
  "world cuisines",
  "street food",
  "desserts & pastries",
  "cocktails",
  "cheeses",
  "spices & herbs",
  "fruits (uncommon)",
  "vegetables",
  "breakfast items",
  "breads from around the world",
  "candy bars & sweets",
  "tea varieties",
  "coffee drinks",
  "sauces & condiments",
  "pasta shapes",
  "soups from around the world",
  "sandwiches",
  // animals
  "wild mammals",
  "birds of prey",
  "songbirds",
  "reptiles",
  "amphibians",
  "deep-sea creatures",
  "coral-reef fish",
  "insects",
  "arachnids",
  "dinosaurs",
  "mythical creatures",
  "farm animals",
  "jungle animals",
  "arctic animals",
  "dog breeds",
  "cat breeds",
  "extinct animals",
  // places
  "capital cities",
  "islands",
  "mountain ranges",
  "famous rivers",
  "deserts",
  "national parks",
  "world landmarks",
  "ancient wonders",
  "famous bridges",
  "castles & palaces",
  "beaches",
  "volcanoes",
  "canyons",
  // entertainment
  "90s sitcoms",
  "2000s sitcoms",
  "animated disney films",
  "pixar films",
  "horror movies",
  "sci-fi films",
  "romantic comedies",
  "oscar best-picture winners",
  "action movie franchises",
  "saturday morning cartoons",
  "anime series",
  "reality tv shows",
  "broadway musicals",
  "stand-up comedians",
  "late-night hosts",
  // music
  "classic rock bands",
  "pop divas",
  "rap artists",
  "classical composers",
  "jazz standards",
  "musical instruments",
  "dance styles",
  "one-hit wonders",
  "music festivals",
  "opera arias",
  // literature & characters
  "childrens book authors",
  "sci-fi novels",
  "fantasy novels",
  "shakespeare plays",
  "superheroes",
  "supervillains",
  "disney princesses",
  "fictional detectives",
  "sitcom characters",
  "literary dogs",
  "cartoon characters",
  // games & sports
  "board games",
  "card games",
  "video-game franchises",
  "nintendo characters",
  "olympic sports",
  "extreme sports",
  "baseball positions",
  "golf terms",
  "soccer tactics",
  "wrestling moves",
  // objects & design
  "kitchen utensils",
  "power tools",
  "office supplies",
  "musical instruments (obscure)",
  "fashion brands",
  "luxury watches",
  "sneakers",
  "handbags",
  "furniture styles",
  "architectural styles",
  "typefaces",
  "pantone shades",
  // vehicles
  "classic cars",
  "fighter jets",
  "warships",
  "locomotives",
  "bicycles & parts",
  "boats & sailing",
  // nature
  "wildflowers",
  "trees",
  "gemstones",
  "weather phenomena",
  "natural disasters",
  "cloud types",
  "rocks & minerals",
  // space & science
  "planets & moons",
  "constellations",
  "chemical elements",
  "dinosaur eras",
  "famous scientists",
  "inventions",
  "space missions",
  // people & professions
  "historical figures",
  "philosophers",
  "explorers",
  "renaissance artists",
  "pop-art figures",
  "professions",
  "nobel laureates",
  // culture & concepts
  "greek gods",
  "egyptian gods",
  "norse mythology",
  "world religions",
  "world festivals",
  "zodiac signs",
  "emotions",
  "optical illusions",
  "logical fallacies",
  // tech & internet
  "programming languages",
  "operating systems",
  "tech companies",
  "social-media platforms",
  "video-game consoles",
  "internet memes",
  "crypto tokens",
  // misc
  "dance moves",
  "magic tricks",
  "conspiracy theories",
  "knots",
  "yoga poses",
  "martial arts",
  "cocktail glassware",
  "cheese-adjacent dairy products",
  "artistic movements",
];

function pickSeed(avoidCategories: string[]): string {
  const lowered = new Set(avoidCategories.map((c) => c.toLowerCase()));
  const pool = SEED_DOMAINS.filter((s) => !lowered.has(s.toLowerCase()));
  const src = pool.length > 0 ? pool : SEED_DOMAINS;
  return src[Math.floor(Math.random() * src.length)];
}

const SYSTEM = `You generate prompts for a social deduction word game.

You will be given a SEED DOMAIN to anchor the round. Produce:
- "category": a specific, evocative category within the seed domain (2-4 words, Title Case). It may narrow the seed (e.g. seed "desserts & pastries" → "French Pastries") or match it.
- "word": one specific, well-known item that unambiguously belongs to that category (1-3 words, Title Case).

Hard rules:
- The word must be commonly known to most adults.
- Avoid the most obvious pick in the category — lean toward the second- or third-most-recognizable option for freshness.
- Different pick every call. Do not fall back to "Pancakes", "Medusa", "Paris", "Mount Everest", or similarly overused entries.
- Avoid offensive, political, or obscure content.

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
