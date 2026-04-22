import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

// Mainstream seed domains: categories a 7-year-old and their grandparent
// would both recognize. No alcohol, no adult media, no politics, no
// narrow subcultures. Claude narrows the seed into a specific single-word
// category + item per round.
const SEED_DOMAINS = [
  // food
  "fruits",
  "vegetables",
  "desserts",
  "candy",
  "cereals",
  "breads",
  "pastas",
  "soups",
  "sandwiches",
  "snacks",
  "ice cream flavors",
  "pizzas",
  "fast food",
  "cheeses",
  "spices",
  "sauces",
  "beverages",
  // animals
  "mammals",
  "birds",
  "reptiles",
  "fish",
  "insects",
  "sea creatures",
  "dinosaurs",
  "farm animals",
  "pets",
  "dog breeds",
  "jungle animals",
  "arctic animals",
  // places
  "countries",
  "capital cities",
  "continents",
  "islands",
  "mountains",
  "rivers",
  "beaches",
  "landmarks",
  "national parks",
  "deserts",
  // entertainment (family-safe)
  "disney movies",
  "pixar movies",
  "animated films",
  "cartoons",
  "superhero movies",
  "family tv shows",
  "video games",
  "board games",
  "card games",
  "toys",
  "puppet shows",
  // characters & fiction
  "superheroes",
  "villains",
  "princesses",
  "fairy tales",
  "cartoon characters",
  "storybook characters",
  "mythical creatures",
  // music
  "instruments",
  "bands",
  "songs",
  "dance styles",
  // sports & activities
  "sports",
  "olympic events",
  "team sports",
  "playground games",
  "martial arts",
  // objects
  "kitchen utensils",
  "tools",
  "office supplies",
  "clothing",
  "shoes",
  "hats",
  "jewelry",
  "furniture",
  "appliances",
  "school supplies",
  // vehicles
  "cars",
  "trucks",
  "airplanes",
  "boats",
  "trains",
  "bicycles",
  "construction vehicles",
  // nature
  "flowers",
  "trees",
  "gemstones",
  "weather phenomena",
  "clouds",
  "rocks",
  "seasons",
  // space & science
  "planets",
  "constellations",
  "chemical elements",
  "inventions",
  "dinosaur eras",
  // people
  "professions",
  "historical figures",
  "explorers",
  "artists",
  "scientists",
  // culture & everyday
  "holidays",
  "zodiac signs",
  "greek gods",
  "colors",
  "emotions",
  "shapes",
  "body parts",
  "numbers",
];

function pickSeed(avoidCategories: string[]): string {
  const lowered = new Set(avoidCategories.map((c) => c.toLowerCase()));
  const pool = SEED_DOMAINS.filter((s) => !lowered.has(s.toLowerCase()));
  const src = pool.length > 0 ? pool : SEED_DOMAINS;
  return src[Math.floor(Math.random() * src.length)];
}

const SYSTEM = `You generate prompts for a social deduction word game played across mixed ages (kids through grandparents).

AUDIENCE: a 7-year-old and their grandparent should both recognize the pick. Think picture-book universal: common animals, common foods, Pixar/Disney movies, famous landmarks, weather, planets, fairy-tale characters, schoolyard sports. No alcohol, no adult media, no politics, no religion, no regional/subculture deep cuts.

You will be given a SEED DOMAIN to anchor the round. Produce:
- "category": a SINGLE word (Title Case, no spaces, hyphens allowed). Broad and familiar. Examples: "Cartoons", "Cereals", "Planets", "Instruments", "Flowers", "Dinosaurs", "Superheroes".
- "word": a SINGLE word (Title Case, no spaces, hyphens allowed). One specific, universally well-known item that unambiguously belongs to that category. Examples: "Simba", "Jupiter", "Clarinet", "Rose", "Triceratops", "Batman".

Hard rules:
- BOTH category and word must be exactly ONE word. No spaces. Hyphens and apostrophes allowed. If the natural phrase has a space (e.g. "French Toast"), pick a one-word alternative (e.g. "Croissant") or drop the qualifier (e.g. "Toast").
- The item must be broadly recognizable to almost anyone — from a curious 7-year-old to a 75-year-old. If in doubt, pick something more famous, not more obscure.
- Lean toward the second- or third-most-recognizable option within the category for freshness. Do NOT fall back to the single most obvious pick (no Pancakes, Medusa, Paris, Everest, Spider-Man, Voldemort).
- Different pick every call.
- Absolutely no offensive, political, religious, adult, or gory content. Keep it kid-safe.

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

const CANDIDATES_SYSTEM = `You produce a list of well-known members of a category for a guessing game. The user will give you the CATEGORY and a SECRET WORD that must appear in the list.

Return ONLY JSON: {"candidates": ["...", "...", ...]}

Rules:
- Produce exactly 24 single-word candidates (Title Case, hyphens or apostrophes allowed, no spaces).
- All 24 must be widely recognizable members of the category — the kind a 7-year-old or a grandparent could name.
- INCLUDE the secret word verbatim in the list (case-insensitive). Do not flag it; place it among the others naturally.
- No duplicates. No off-category items. Kid-safe (no alcohol, politics, religion, adult, gore).
- No prose, no markdown fences, no commentary.`;

export async function generateCandidates(
  category: string,
  secret: string
): Promise<string[]> {
  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 600,
    temperature: 0.6,
    system: CANDIDATES_SYSTEM,
    messages: [
      {
        role: "user",
        content: `CATEGORY: ${category}\nSECRET WORD: ${secret}\n\nReturn 24 candidates including the secret. JSON only.`,
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
    throw new Error(`Could not parse candidates from: ${text}`);
  }
  const parsed = JSON.parse(match[0]) as { candidates?: unknown };
  const raw: string[] = Array.isArray(parsed.candidates)
    ? parsed.candidates.filter((c): c is string => typeof c === "string")
    : [];

  // Defensive: ensure the secret is in the list. The model usually obeys,
  // but we never want the imposter staring at a list missing the answer.
  const secretNorm = secret.toLowerCase();
  const hasSecret = raw.some((c) => c.toLowerCase() === secretNorm);
  const merged = hasSecret ? raw : [...raw, secret];

  // Case-insensitive dedupe, preserve first occurrence.
  const seen = new Set<string>();
  const dedup: string[] = [];
  for (const c of merged) {
    const k = c.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    dedup.push(c);
  }

  // Shuffle so an appended secret doesn't always land at the end.
  for (let i = dedup.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [dedup[i], dedup[j]] = [dedup[j], dedup[i]];
  }

  return dedup;
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
