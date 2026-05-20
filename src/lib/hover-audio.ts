// Web Audio synthesis for the landing-page card-hover sounds. No
// audio files: each cue is generated on demand from oscillators or a
// noise buffer, so the bundle stays tiny and every sound is exactly
// the brief's spec rather than whatever the asset pipeline happened
// to encode.
//
// Each game gets its own short cue tuned to its vibe:
//
//   imposter   vinyl scratch (sawtooth, 400 to 80 Hz exp ramp, 0.25s)
//   wavelength ascending synth (sine, 220 to 880 Hz exp ramp, 0.4s)
//   just-one   lightbulb chime (stacked sines at 880 + 1320 Hz, 80ms
//              offset, bell-like decay)
//   crew       rocket whoosh (white noise into bandpass sweeping 400
//              to 2000 Hz at Q=5, 0.4s)
//   hold       coin clink (triangles at 1760 + 2640 Hz, 30ms offset)
//
// Browsers require a user gesture before an AudioContext can produce
// output. We lazy-create the context inside playHoverSound, which
// runs on a real mouseenter / focus event. If the context starts
// suspended (Safari sometimes), we attempt resume(). If resume fails
// the call is a no-op and the page keeps working silently.
//
// The toggle is persisted to localStorage so the user's preference
// outlives reloads. Default is ON, except when the user has
// prefers-reduced-motion set, in which case sounds default to OFF.

import type { GameKind } from "@/lib/game";

const STORAGE_KEY = "upper:sound-enabled";
const DEBOUNCE_MS = 300;

let audioCtx: AudioContext | null = null;
const lastPlayMs: Partial<Record<GameKind, number>> = {};

type WebkitWindow = Window & {
  webkitAudioContext?: typeof AudioContext;
};

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (audioCtx) return audioCtx;
  const w = window as WebkitWindow;
  const AC = window.AudioContext ?? w.webkitAudioContext;
  if (!AC) return null;
  audioCtx = new AC();
  return audioCtx;
}

export function isSoundEnabled(): boolean {
  if (typeof window === "undefined") return false;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored === "0") return false;
  if (stored === "1") return true;
  // No stored preference yet: default ON, except for reduced-motion
  // users (the spec treats reduced-motion as a "less sensory load"
  // signal that should also dampen audio).
  return !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function setSoundEnabled(on: boolean): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, on ? "1" : "0");
}

function playImposter(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const dur = 0.25;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(400, now);
  osc.frequency.exponentialRampToValueAtTime(80, now + dur);
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

function playWavelength(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const dur = 0.4;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(220, now);
  osc.frequency.exponentialRampToValueAtTime(880, now + dur);
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(now);
  osc.stop(now + dur);
}

function playJustOne(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const voices: Array<[number, number]> = [[880, 0], [1320, 0.08]];
  for (const [freq, delay] of voices) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now + delay);
    // Bell-like envelope: instant attack, exponential decay.
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.18, now + delay + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.45);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.45);
  }
}

function playCrew(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const dur = 0.4;
  // White noise buffer.
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 5;
  filter.frequency.setValueAtTime(400, now);
  filter.frequency.exponentialRampToValueAtTime(2000, now + dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.5, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  source.connect(filter).connect(gain).connect(ctx.destination);
  source.start(now);
  source.stop(now + dur);
}

function playHold(ctx: AudioContext): void {
  const now = ctx.currentTime;
  const voices: Array<[number, number]> = [[1760, 0], [2640, 0.03]];
  for (const [freq, delay] of voices) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(freq, now + delay);
    gain.gain.setValueAtTime(0.0001, now + delay);
    gain.gain.exponentialRampToValueAtTime(0.15, now + delay + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.2);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + delay);
    osc.stop(now + delay + 0.2);
  }
}

const SYNTHS: Record<GameKind, (ctx: AudioContext) => void> = {
  imposter: playImposter,
  wavelength: playWavelength,
  "just-one": playJustOne,
  crew: playCrew,
  hold: playHold,
};

export function playHoverSound(kind: GameKind): void {
  if (!isSoundEnabled()) return;
  const now = performance.now();
  const last = lastPlayMs[kind] ?? 0;
  if (now - last < DEBOUNCE_MS) return;
  lastPlayMs[kind] = now;
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === "suspended") {
    // The resume() promise is fire-and-forget; if it resolves before
    // the synth's scheduled stops we hear the cue, otherwise the user
    // hears nothing on this hover and the context is unlocked for
    // next time.
    void ctx.resume();
  }
  SYNTHS[kind](ctx);
}
