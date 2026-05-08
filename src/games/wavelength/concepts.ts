// Concept-pair cards for Wavelength. Each pair defines the ends of a
// 0-100 spectrum the psychic gets a target on and the team guesses
// against. Curated for broad recognizability — anyone at the table
// should be able to argue where on the dial something falls without
// looking up a definition.
//
// Picked at random per round. Static list for v1; we can swap to
// Anthropic generation later if we want more variety.
export type ConceptPair = {
  left: string;
  right: string;
};

export const CONCEPT_PAIRS: ConceptPair[] = [
  { left: "Cold", right: "Hot" },
  { left: "Soft", right: "Hard" },
  { left: "Cheap", right: "Expensive" },
  { left: "Boring", right: "Exciting" },
  { left: "Quiet", right: "Loud" },
  { left: "Slow", right: "Fast" },
  { left: "Heavy", right: "Light" },
  { left: "Round", right: "Pointy" },
  { left: "Smooth", right: "Rough" },
  { left: "Healthy", right: "Unhealthy" },
  { left: "Easy", right: "Hard" },
  { left: "Common", right: "Rare" },
  { left: "Tame", right: "Wild" },
  { left: "Useful", right: "Useless" },
  { left: "Sad", right: "Happy" },
  { left: "Funny", right: "Serious" },
  { left: "Embarrassing", right: "Cool" },
  { left: "Polite", right: "Rude" },
  { left: "Forgettable", right: "Memorable" },
  { left: "Underrated", right: "Overrated" },
  { left: "Modern", right: "Ancient" },
  { left: "Indoor", right: "Outdoor" },
  { left: "Childish", right: "Grown-up" },
  { left: "Tacky", right: "Classy" },
  { left: "Fragile", right: "Sturdy" },
  { left: "Quiet date", right: "Wild night" },
  { left: "Boring job", right: "Dream job" },
  { left: "Casual", right: "Formal" },
  { left: "Solo activity", right: "Group activity" },
  { left: "Indoor pet", right: "Outdoor pet" },
  { left: "Snack", right: "Meal" },
  { left: "Salty", right: "Sweet" },
  { left: "Bitter", right: "Mild" },
  { left: "Sour", right: "Savory" },
  { left: "Greasy", right: "Clean" },
  { left: "Casual outfit", right: "Fancy outfit" },
  { left: "Cheap gift", right: "Thoughtful gift" },
  { left: "Bad smell", right: "Great smell" },
  { left: "Calm music", right: "Hype music" },
  { left: "Bad weather", right: "Perfect weather" },
  { left: "Trash TV", right: "Prestige TV" },
  { left: "Lazy day", right: "Busy day" },
  { left: "Bad gift", right: "Great gift" },
  { left: "Awkward", right: "Smooth" },
  { left: "Risky", right: "Safe" },
  { left: "Salty take", right: "Sweet take" },
  { left: "Scary", right: "Cute" },
  { left: "Cluttered", right: "Minimal" },
  { left: "Lo-fi", right: "Hi-fi" },
  { left: "Lazy", right: "Hardworking" },
  { left: "Cringe", right: "Based" },
  { left: "Ugly", right: "Beautiful" },
  { left: "Mainstream", right: "Niche" },
  { left: "Unhealthy snack", right: "Health food" },
  { left: "Quick read", right: "Long read" },
  { left: "Forgivable", right: "Unforgivable" },
  { left: "Whisper", right: "Shout" },
  { left: "Smelly", right: "Fragrant" },
  { left: "Foreign", right: "Familiar" },
  { left: "Innocent", right: "Guilty" },
];
