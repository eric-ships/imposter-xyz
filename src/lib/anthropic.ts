import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

// Mainstream seed domains live in src/data/categories.json so collaborators
// can edit them through CODEOWNERS-scoped PRs without touching code.
// Contents: a flat string[] of category names a 7-year-old and their
// grandparent would both recognize. No alcohol, no adult media, no
// politics, no narrow subcultures. Claude narrows the seed into a
// specific single-word category + item per round.
import seedDomainsRaw from "@/data/categories.json";

const SEED_DOMAINS: string[] = seedDomainsRaw as string[];

function pickSeed(avoidCategories: string[]): string {
  const lowered = new Set(avoidCategories.map((c) => c.toLowerCase()));
  const pool = SEED_DOMAINS.filter((s) => !lowered.has(s.toLowerCase()));
  const src = pool.length > 0 ? pool : SEED_DOMAINS;
  return src[Math.floor(Math.random() * src.length)];
}

const SYSTEM = `You generate prompts for a social deduction word game played across mixed ages (kids through grandparents).

AUDIENCE: a 7-year-old and their grandparent should both recognize the pick. Think picture-book universal: common animals, common foods, Pixar/Disney movies, famous landmarks, weather, planets, fairy-tale characters, schoolyard sports. No alcohol, no adult media, no politics, no religion, no regional/subculture deep cuts.

You will be given a SEED DOMAIN to anchor the round. Produce:
- "category": one or two words in Title Case. Use the natural form — "Dance Styles", "National Parks", "Dried Fruits", or single words like "Cartoons", "Planets". Do NOT hyphenate to fake a single word. Examples: "Cartoons", "Cereals", "Dance Styles", "National Parks", "Dried Fruits", "Greek Gods".
- "word": one or two words in Title Case. Same rule — natural spelling, no forced hyphens. Examples: "Simba", "Jupiter", "French Toast", "Mount Fuji", "Big Ben", "Spider Man".

Hard rules:
- Up to TWO words for both category and word. Use natural spelling and spacing — never insert a hyphen just to dodge a space (no "Spider-Man" if the natural form is "Spider Man", no "Dried-Fruits", no "DanceStyles"). Real hyphens that exist in the name are fine ("Pop-Tarts", "Forget-Me-Not").
- Prefer the shortest natural form. If a single word works, use it.
- The item must be broadly recognizable to almost anyone — from a curious 7-year-old to a 75-year-old. If in doubt, pick something more famous, not more obscure.
- Lean toward the second- or third-most-recognizable option within the category for freshness. Do NOT fall back to the single most obvious pick (no Pancakes, Medusa, Paris, Everest, Spider-Man, Voldemort).
- Different pick every call.
- Absolutely no offensive, political, religious, adult, or gory content. Keep it kid-safe.

Return ONLY JSON: {"category": "...", "word": "..."}. No prose, no markdown fences.`;

const ROUND_SYSTEM = `You generate the full round payload for a social deduction word game played across mixed ages (kids through grandparents).

AUDIENCE: a 7-year-old and their grandparent should both recognize every pick. Picture-book universal: common animals, common foods, Pixar/Disney movies, famous landmarks, weather, planets, fairy-tale characters, schoolyard sports. No alcohol, no adult media, no politics, no religion, no regional/subculture deep cuts.

You will be given a SEED DOMAIN. Produce:
- "category": one or two words in Title Case (natural spelling, no fake hyphens). Examples: "Cartoons", "Cereals", "Dance Styles", "National Parks", "Dried Fruits", "Greek Gods".
- "candidates": exactly 12 distinct, well-known members of the category. Title Case, one or two words each (natural spelling, no fake hyphens). Real hyphens in real names ("Pop-Tarts", "Forget-Me-Not") are fine.

Hard rules:
- Up to two words per item. Use natural spelling and spacing — never insert a hyphen just to dodge a space (no "Spider-Man" if the natural form is "Spider Man", no "DriedFig"). Prefer the shortest natural form.
- Every candidate must be broadly recognizable to almost anyone — from a curious 7-year-old to a 75-year-old. If in doubt, pick something more famous, not more obscure.
- DIVERSITY IS CRITICAL: the 12 candidates must be meaningfully distinct from each other. NO near-duplicates, NO synonyms, NO singular/plural pairs, NO members from the same sub-family that share most attributes.
  - Bad: ["Pancake", "Pancakes", "Flapjack"] (same thing).
  - Bad: ["Black Bear", "Brown Bear", "Polar Bear", "Grizzly Bear"] (one bear is enough).
  - Bad: ["Maine Coon", "Persian", "Ragdoll", "Sphynx"] for "Cats" (all are breeds — pick the breeds OR pick household-recognizable variants, not five from the same micro-category).
  - Good: a wide spread across the category so a player could tell any two apart at a glance.
- The category should be familiar enough that 12 distinct, famous members exist. If the seed is too narrow, broaden gracefully.
- No duplicates (case-insensitive). No off-category items. Kid-safe.
- Different category every call — avoid the recent ones in the avoid list.

Return ONLY JSON: {"category": "...", "candidates": ["...", "...", ...]}. No prose, no markdown fences.`;

export type RoundPayload = {
  category: string;
  word: string;
  candidates: string[];
};

/**
 * Single Claude call: produces the category + 12 distinct candidates.
 * The secret word is then picked server-side from the candidate list,
 * so the shortlist is guaranteed to contain the answer (no risk of the
 * model dropping it from a separate "candidates from secret" call).
 */
export async function generateRound(
  avoid: { categories?: string[]; words?: string[] } = {}
): Promise<RoundPayload> {
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
      `Avoid these recent secret words: ${avoid.words
        .map((w) => `"${w}"`)
        .join(", ")}.`
    );
  }
  const salt = Math.random().toString(36).slice(2, 10);
  const userContent = [
    `SEED DOMAIN: ${seed}`,
    `Salt (ignore, just ensures variety): ${salt}`,
    avoidLines.join("\n"),
    "Generate a fresh category and 12 distinct candidates from the seed domain. Return only JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const resp = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 800,
    temperature: 1,
    system: ROUND_SYSTEM,
    messages: [{ role: "user", content: userContent }],
  });

  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`Could not parse round payload from: ${text}`);
  }
  const parsed = JSON.parse(match[0]) as {
    category?: string;
    candidates?: unknown;
  };
  if (!parsed.category || !Array.isArray(parsed.candidates)) {
    throw new Error(`Invalid round payload: ${text}`);
  }

  // Sanitize candidates: case-insensitive dedupe, drop empties, cap at 12.
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of parsed.candidates) {
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    const k = trimmed.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cleaned.push(trimmed);
    if (cleaned.length >= 12) break;
  }
  if (cleaned.length < 4) {
    throw new Error(`Too few candidates: ${cleaned.length}`);
  }

  // Pick the secret from the candidate pool. Avoid recently used words
  // when possible (so casual mode + a tight category doesn't keep
  // landing on the same secret across rounds).
  const recentWords = new Set(
    (avoid.words ?? []).map((w) => w.toLowerCase())
  );
  const fresh = cleaned.filter((c) => !recentWords.has(c.toLowerCase()));
  const pool = fresh.length > 0 ? fresh : cleaned;
  const word = pool[Math.floor(Math.random() * pool.length)];

  // Shuffle so the secret isn't always in the same position in the list
  // shown to players.
  for (let i = cleaned.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [cleaned[i], cleaned[j]] = [cleaned[j], cleaned[i]];
  }

  return {
    category: parsed.category.trim(),
    word,
    candidates: cleaned,
  };
}

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
- Produce exactly 12 candidates in Title Case. Each candidate may be one or two words — use the natural spelling and spacing. Never insert a hyphen just to dodge a space (no "Spider-Man" if the natural form is "Spider Man", no "DriedFig"). Real hyphens that exist in the name are fine ("Pop-Tarts", "Forget-Me-Not").
- Prefer the shortest natural form. If a single word works, use it.
- All 12 must be widely recognizable members of the category — the kind a 7-year-old or a grandparent could name.
- DIVERSITY IS CRITICAL: the 12 must be meaningfully distinct. NO near-duplicates, NO synonyms, NO singular/plural pairs, NO multiple items from the same micro-sub-family. A player should be able to tell any two apart at a glance.
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
        content: `CATEGORY: ${category}\nSECRET WORD: ${secret}\n\nReturn 12 candidates including the secret. JSON only.`,
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
