const MUTE_KEY = "imposter:muted";

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (ctx) return ctx;
  type WebkitWindow = Window & {
    webkitAudioContext?: typeof AudioContext;
  };
  const AC =
    window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  if (!AC) return null;
  try {
    ctx = new AC();
  } catch {
    ctx = null;
  }
  return ctx;
}

// Browsers require a user gesture before audio can play. We install a
// one-shot click listener on first use; that way every room click counts
// as priming even if the user never touches the mute button.
export function primeAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") {
    c.resume().catch(() => {});
  }
}

export function isMuted(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(MUTE_KEY) === "1";
}

export function setMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

export function playTurnChime() {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  // Three-tone arpeggio (E5 -> A5 -> C#6) at higher volume so it carries
  // over a noisy room. Longer total envelope (~600ms) makes it feel like
  // a real "your turn" cue rather than a click.
  playTone(c, 660, now, 0.28, 0.32);
  playTone(c, 880, now + 0.14, 0.28, 0.32);
  playTone(c, 1108, now + 0.28, 0.36, 0.36);
}

// Voices that consistently sound smooth/natural across browsers. Apple's
// "Ava" (Premium) and "Samantha" are the gold standard on Mac/iOS;
// Microsoft's "Aria" / "Jenny" / "Sonia" Neural voices are the best on
// Windows/Edge; Google's premium English voices are the best on Chrome.
// We score by name match — higher score wins.
const PREFERRED_VOICE_PATTERNS: { pattern: RegExp; score: number }[] = [
  // Apple — Premium / Enhanced
  { pattern: /\bava\b.*premium/i, score: 100 },
  { pattern: /\bzoe\b.*premium/i, score: 95 },
  { pattern: /\bevan\b.*premium/i, score: 90 },
  { pattern: /\b(serena|samantha|allison|susan|karen|moira|tessa|fiona|kate)\b.*(enhanced|premium)/i, score: 85 },
  { pattern: /\b(daniel|tom|aaron|fred|alex|oliver)\b.*(enhanced|premium)/i, score: 80 },
  // Microsoft Neural
  { pattern: /\b(aria|jenny|sonia|libby|natasha|emma|nancy|jane|michelle|sara)\b.*neural/i, score: 88 },
  { pattern: /\b(guy|davis|tony|brandon|christopher)\b.*neural/i, score: 82 },
  // Google premium
  { pattern: /^google.*\(premium\)/i, score: 75 },
  // Apple — base names (still good)
  { pattern: /\b(ava|zoe|serena|samantha|allison|karen|moira)\b/i, score: 60 },
  { pattern: /\b(daniel|alex|tom)\b/i, score: 55 },
  // Microsoft base
  { pattern: /\b(aria|jenny|sonia|emma)\b/i, score: 50 },
  // Generic Google English (robotic but reliable)
  { pattern: /^google.*english/i, score: 30 },
];

let cachedSexyVoice: SpeechSynthesisVoice | null = null;

function pickSexyVoice(synth: SpeechSynthesis): SpeechSynthesisVoice | null {
  if (cachedSexyVoice) return cachedSexyVoice;
  const voices = synth.getVoices();
  if (voices.length === 0) return null;
  const enVoices = voices.filter((v) =>
    v.lang?.toLowerCase().startsWith("en")
  );
  if (enVoices.length === 0) return null;

  let bestScore = -1;
  let best: SpeechSynthesisVoice | null = null;
  for (const v of enVoices) {
    let score = 0;
    for (const { pattern, score: s } of PREFERRED_VOICE_PATTERNS) {
      if (pattern.test(v.name)) {
        score = Math.max(score, s);
      }
    }
    // Light bonus for "natural"/"premium"/"enhanced"/"neural" anywhere
    // in the name even if the specific pattern didn't match.
    if (/(premium|enhanced|neural|natural)/i.test(v.name)) score += 5;
    // Prefer en-US over en-GB/en-AU for default unless the user's locale
    // matches — but if a non-en-US voice scored higher above, keep it.
    if (v.lang?.toLowerCase() === "en-us") score += 1;
    if (score > bestScore) {
      bestScore = score;
      best = v;
    }
  }
  cachedSexyVoice = best ?? enVoices[0];
  return cachedSexyVoice;
}

// Speak the given text via the Web Speech API. Cancels any in-flight
// utterance so rapid taps don't pile up. Respects the global mute
// toggle. No-ops gracefully on browsers without speech synthesis.
//
// Voice tuning: slowed rate + slightly lowered pitch, plus a curated
// preference for the best-sounding voices on each platform (Ava
// Premium on Apple, Aria Neural on Microsoft, Premium Google on
// Chrome). Falls back to the first en voice on platforms with
// nothing premium installed.
export function speakText(text: string) {
  if (isMuted()) return;
  if (typeof window === "undefined") return;
  const synth = window.speechSynthesis;
  if (!synth) return;
  const trimmed = text.trim();
  if (!trimmed) return;

  // Cancel anything currently speaking — so clicking a second clue
  // interrupts the first instead of queuing.
  synth.cancel();

  // Voices may load async on first paint; if they're empty now, listen
  // once and try again on voiceschanged.
  if (synth.getVoices().length === 0) {
    const onVoices = () => {
      synth.removeEventListener("voiceschanged", onVoices);
      speakText(trimmed);
    };
    synth.addEventListener("voiceschanged", onVoices);
    return;
  }

  const u = new SpeechSynthesisUtterance(trimmed);
  u.rate = 0.85;
  u.pitch = 0.9;
  u.volume = 1;
  const voice = pickSexyVoice(synth);
  if (voice) u.voice = voice;
  synth.speak(u);
}

// Soft single-bell tone for reveal-stage transitions. Lower pitched
// than the turn chime so it reads as "something just happened" rather
// than "act now".
export function playRevealStageChime(stage: number) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  // Climb a minor third per stage so the sequence has shape: F4, Ab4,
  // C5, Eb5. Final stage gets a soft chord (root + fifth) as a payoff.
  const ladder = [349, 415, 523, 622];
  const freq = ladder[Math.min(stage, ladder.length - 1)];
  const now = c.currentTime;
  playTone(c, freq, now, 0.5, 0.16);
  if (stage >= 3) {
    playTone(c, freq * 1.5, now + 0.05, 0.55, 0.12);
  }
}

// One tick per second of the final countdown. `urgent` raises the pitch
// a little so the last few seconds read as extra pressure.
export function playTimerTick(urgent: boolean) {
  if (isMuted()) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  const osc = c.createOscillator();
  const gain = c.createGain();
  // Triangle rings closer to a wood-block click than a pure sine.
  osc.type = "triangle";
  osc.frequency.value = urgent ? 1400 : 980;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(urgent ? 0.16 : 0.1, now + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + 0.12);
}

function playTone(
  c: AudioContext,
  freq: number,
  startAt: number,
  duration: number,
  peak: number = 0.18
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.value = freq;
  // Short attack/decay envelope so it sounds like a chime, not a square.
  gain.gain.setValueAtTime(0.0001, startAt);
  gain.gain.exponentialRampToValueAtTime(peak, startAt + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  osc.connect(gain).connect(c.destination);
  osc.start(startAt);
  osc.stop(startAt + duration + 0.02);
}
