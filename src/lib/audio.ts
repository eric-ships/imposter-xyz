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
