import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export type WordPrompt = {
  category: string;
  word: string;
};

// Target audience: millennials in their late 20s to mid-30s. Seeds lean
// toward 90s/2000s nostalgia, internet culture, cultural touchstones they
// all lived through. Some universals (foods, animals) stay for variety.
const SEED_DOMAINS = [
  // 90s / 2000s nostalgia (the core)
  "90s saturday-morning cartoons",
  "2000s disney channel original movies",
  "nickelodeon shows (90s-2000s)",
  "cartoon network shows (90s-00s)",
  "toonami anime",
  "pokemon starter evolutions",
  "pokemon gym leaders",
  "pokemon legendaries",
  "yu-gi-oh cards",
  "digimon",
  "tamagotchi / 90s toys",
  "beanie babies",
  "build-a-bear era fads",
  "furbies and tickle-me-elmo-era toys",
  "ninja turtles villains",
  "x-men characters",
  "spider-man villains",
  "early MCU movies",
  "DC animated series villains",
  "power rangers teams",
  "the magic school bus episodes",
  "arthur characters",
  "rugrats characters",
  "spongebob characters & locations",
  "hey arnold characters",
  "ed edd n eddy gags",
  "kim possible villains",
  "avatar the last airbender nations & characters",
  "scooby-doo villains",
  // 90s/2000s music
  "boy bands (90s-00s)",
  "2000s pop divas",
  "emo/pop-punk bands (2000s)",
  "2000s hip hop",
  "90s alternative rock bands",
  "grunge bands",
  "one-hit wonders of the 90s",
  "teen-movie soundtracks",
  "mtv trl era hits",
  "early 2000s r&b",
  // millennial movies & TV
  "millennial teen movies",
  "mean girls quotes",
  "clueless/heathers-era teen flicks",
  "romcoms of the 2000s",
  "harry potter spells",
  "harry potter characters",
  "lord of the rings characters",
  "star wars species",
  "star wars planets",
  "pixar films",
  "studio ghibli films",
  "the office characters",
  "parks and recreation characters",
  "30 rock running gags",
  "arrested development running jokes",
  "seinfeld bits",
  "friends episodes",
  "breaking bad characters",
  "the sopranos characters",
  "mad men characters",
  "lost mysteries",
  "game of thrones houses / characters",
  "stranger things characters",
  "it's always sunny schemes",
  "community catchphrases",
  "chappelle's show sketches",
  "snl recurring characters",
  // video games (millennial canon)
  "super mario power-ups",
  "mario kart items",
  "super smash bros fighters",
  "zelda dungeons / items",
  "final fantasy summons",
  "halo weapons",
  "call of duty maps",
  "gta 3-era mechanics",
  "sims expansions",
  "minecraft mobs",
  "league of legends champions",
  "wow classes",
  "runescape skills",
  "club penguin features",
  "neopets pets",
  "flash game classics",
  // tech nostalgia
  "aol instant messenger features",
  "myspace era web",
  "limewire era music piracy",
  "vintage iPod models",
  "nokia phone classics",
  "early web 2.0 startups",
  "2000s tech gadgets",
  "early social media platforms",
  "blockbuster/netflix-dvd era experiences",
  "flip phone features",
  "vine-era meme formats",
  "early youtube viral videos",
  "reddit lore",
  "4chan era memes (SFW only)",
  // millennial food & drink
  "brunch items",
  "avocado toast toppings",
  "craft beer styles",
  "hot sauces",
  "trader joe's items",
  "cereals (sugary, 90s-coded)",
  "lunchables & 90s school lunches",
  "boxed mac & cheese & pantry staples",
  "starbucks menu items",
  "cocktails",
  "coffee drinks",
  "bubble tea flavors",
  "ramen shops styles",
  "taco truck items",
  "ice cream flavors",
  "sushi rolls (american-style)",
  // lifestyle, millennial-coded
  "ikea furniture names",
  "costco bulk items",
  "millennial dating app features",
  "wellness trends",
  "peloton/soulcycle mechanics",
  "marathon race experiences",
  "house-hunting terms",
  "personal finance terms",
  "wedding trends",
  // universals (kept for variety)
  "wild mammals",
  "dog breeds",
  "cheeses",
  "spices & herbs",
  "tropical fruits",
  "pasta shapes",
  "board games",
  "card games",
  "capital cities",
  "national parks",
  "world landmarks",
  "cocktail glassware",
  "sneakers",
  "iconic streetwear brands",
  "musical instruments",
  "constellations",
  "chemical elements",
  "greek gods",
  "norse mythology",
  "weather phenomena",
  "yoga poses",
  "martial arts",
  "dance styles",
];

function pickSeed(avoidCategories: string[]): string {
  const lowered = new Set(avoidCategories.map((c) => c.toLowerCase()));
  const pool = SEED_DOMAINS.filter((s) => !lowered.has(s.toLowerCase()));
  const src = pool.length > 0 ? pool : SEED_DOMAINS;
  return src[Math.floor(Math.random() * src.length)];
}

const SYSTEM = `You generate prompts for a social deduction word game.

AUDIENCE: millennials in their late 20s to mid-30s (born roughly 1988-1996). Favor references they'd immediately recognize from their own childhood, teens, or 20s: 90s/2000s cartoons, pokémon, early internet, mtv-era music, 2000s teen movies, the office / parks & rec / breaking bad, pixar, harry potter, LOTR, early mcu, video-game canon, emo/pop-punk, ikea, brunch culture. Hit on shared cultural touchstones from 1995-2015 specifically.

You will be given a SEED DOMAIN to anchor the round. Produce:
- "category": a specific, evocative category within the seed domain (2-4 words, Title Case). It may narrow the seed (e.g. seed "90s saturday-morning cartoons" → "Klasky Csupo Cartoons") or match it.
- "word": one specific, well-known item that unambiguously belongs to that category (1-3 words, Title Case). Should be something your average millennial would recognize in under 3 seconds.

Hard rules:
- The word must be broadly recognizable to millennials — not niche inside-baseball.
- Lean toward the second- or third-most-recognizable option within the category for freshness. Do NOT fall back to the most obvious pick (no Pancakes, Medusa, Paris, Mount Everest, Spider-Man, Beyoncé, Friends-the-show, Harry Potter-the-boy).
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
