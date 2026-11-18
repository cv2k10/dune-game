// Synthesized sound effects (Web Audio, no audio files).
import type { Effect } from "./types";

export type UiTone = "click" | "success" | "warning";
type CombatSound = "gun" | "turret" | "sonic" | "hit" | "unitDeath" | "buildingDeath";

// Peak gain (0–1) of each interface tone. The limiter keeps overlapping sounds from clipping.
const UI_TONES: Record<UiTone, { wave: OscillatorType; from: number; to: number; duration: number; volume: number }> = {
  click: { wave: "square", from: 390, to: 310, duration: 0.15, volume: 0.2 },
  success: { wave: "square", from: 520, to: 790, duration: 0.22, volume: 0.3 },
  warning: { wave: "sawtooth", from: 210, to: 120, duration: 0.3, volume: 0.35 },
};

// Max new voices of each kind per 120 ms window, so big battles stay readable instead of noisy.
const VOICE_LIMIT: Record<CombatSound, number> = { gun: 3, turret: 2, sonic: 2, hit: 2, unitDeath: 2, buildingDeath: 2 };

export interface Listener {
  /** World point at the centre of the view, in tiles. */
  x: number;
  y: number;
  /** Half the visible width/height, in tiles. */
  halfWidth: number;
  halfHeight: number;
}

export class SoundEngine {
  private context: AudioContext | null = null;
  private output: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private voices = new Map<CombatSound, { windowStart: number; count: number }>();

  private ensure(): AudioContext {
    if (this.context) {
      if (this.context.state === "suspended") void this.context.resume();
      return this.context;
    }
    const context = new AudioContext();
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -6;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    limiter.connect(context.destination);
    // One second of white noise, reused as the source for every gunshot and explosion.
    const noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    this.context = context;
    this.output = limiter;
    this.noise = noise;
    if (context.state === "suspended") void context.resume();
    return context;
  }

  ui(kind: UiTone) {
    try {
      const context = this.ensure();
      const tone = UI_TONES[kind];
      const start = context.currentTime;
      const oscillator = context.createOscillator();
      oscillator.type = tone.wave;
      oscillator.frequency.setValueAtTime(tone.from, start);
      oscillator.frequency.exponentialRampToValueAtTime(tone.to, start + tone.duration * 0.7);
      const gain = this.envelope(context, start, tone.volume, tone.duration);
      oscillator.connect(gain).connect(this.output!);
      oscillator.start(start);
      oscillator.stop(start + tone.duration + 0.02);
    } catch { /* Audio is optional when the browser blocks it. */ }
  }

  /** Plays the sounds for effects created during the last game tick. */
  combat(effects: Effect[], listener: Listener) {
    for (const effect of effects) {
      const sound = classify(effect);
      if (sound) this.combatSound(sound, effect.x, effect.y, listener);
    }
  }

  private combatSound(sound: CombatSound, x: number, y: number, listener: Listener) {
    // Full volume on screen; off screen it fades with distance but stays faintly audible.
    const dx = x - listener.x;
    const dy = y - listener.y;
    const outside = Math.max(0, Math.abs(dx) - listener.halfWidth, Math.abs(dy) - listener.halfHeight);
    const distanceGain = outside === 0 ? 1 : Math.max(0, 0.45 * (1 - outside / 30));
    if (distanceGain <= 0.02) return;
    const pan = Math.max(-0.8, Math.min(0.8, dx / (listener.halfWidth * 1.4)));
    try {
      const context = this.ensure();
      const now = context.currentTime;
      const slot = this.voices.get(sound);
      if (!slot || now - slot.windowStart > 0.12) this.voices.set(sound, { windowStart: now, count: 1 });
      else if (slot.count >= VOICE_LIMIT[sound]) return;
      else slot.count++;
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(this.output!);
      SOUNDS[sound](this, context, now, distanceGain, panner);
    } catch { /* Audio is optional when the browser blocks it. */ }
  }

  // ---- building blocks -------------------------------------------------------------------
  envelope(context: AudioContext, start: number, peak: number, duration: number, attack = 0.005): GainNode {
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    return gain;
  }

  /** Filtered noise burst: the body of gunshots and explosions. */
  noiseBurst(context: AudioContext, start: number, peak: number, duration: number, filter: BiquadFilterType, frequency: number, endFrequency: number, out: AudioNode) {
    const source = context.createBufferSource();
    source.buffer = this.noise;
    source.playbackRate.value = 0.8 + Math.random() * 0.4; // slight variation between shots
    const biquad = context.createBiquadFilter();
    biquad.type = filter;
    biquad.frequency.setValueAtTime(frequency, start);
    biquad.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    source.connect(biquad).connect(this.envelope(context, start, peak, duration, 0.003)).connect(out);
    source.start(start, Math.random() * 0.5);
    source.stop(start + duration + 0.02);
  }

  /** Pitch-dropping sine: the low "thump" under shots and explosions. */
  thump(context: AudioContext, start: number, peak: number, duration: number, from: number, to: number, out: AudioNode, wave: OscillatorType = "sine") {
    const oscillator = context.createOscillator();
    oscillator.type = wave;
    oscillator.frequency.setValueAtTime(from, start);
    oscillator.frequency.exponentialRampToValueAtTime(to, start + duration);
    oscillator.connect(this.envelope(context, start, peak, duration)).connect(out);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }
}

const SOUNDS: Record<CombatSound, (engine: SoundEngine, context: AudioContext, t: number, volume: number, out: AudioNode) => void> = {
  // Cannon / rifle: sharp crack plus a short low thump.
  gun: (e, c, t, v, out) => {
    e.noiseBurst(c, t, 0.32 * v, 0.09, "bandpass", 2200, 700, out);
    e.thump(c, t, 0.3 * v, 0.1, 160, 55, out);
  },
  // Gun turret: heavier and deeper than unit fire.
  turret: (e, c, t, v, out) => {
    e.noiseBurst(c, t, 0.34 * v, 0.13, "bandpass", 1500, 400, out);
    e.thump(c, t, 0.38 * v, 0.14, 120, 45, out);
  },
  // Atreides sonic tank: a wobbling sweep instead of a bang.
  sonic: (e, c, t, v, out) => {
    const oscillator = c.createOscillator();
    oscillator.type = "triangle";
    oscillator.frequency.setValueAtTime(900, t);
    oscillator.frequency.exponentialRampToValueAtTime(180, t + 0.4);
    const wobble = c.createOscillator();
    wobble.frequency.value = 28;
    const depth = c.createGain();
    depth.gain.value = 70;
    wobble.connect(depth).connect(oscillator.frequency);
    oscillator.connect(e.envelope(c, t, 0.28 * v, 0.42, 0.02)).connect(out);
    oscillator.start(t); wobble.start(t);
    oscillator.stop(t + 0.45); wobble.stop(t + 0.45);
  },
  // Shell landing on a target.
  hit: (e, c, t, v, out) => {
    e.noiseBurst(c, t + 0.03, 0.16 * v, 0.14, "lowpass", 1400, 300, out);
  },
  // Vehicle or soldier destroyed.
  unitDeath: (e, c, t, v, out) => {
    e.noiseBurst(c, t, 0.45 * v, 0.6, "lowpass", 1800, 120, out);
    e.thump(c, t, 0.5 * v, 0.5, 95, 32, out);
  },
  // Structure destroyed: the biggest boom, with a rumbling tail.
  buildingDeath: (e, c, t, v, out) => {
    e.noiseBurst(c, t, 0.55 * v, 1.2, "lowpass", 1200, 70, out);
    e.thump(c, t, 0.6 * v, 0.9, 80, 25, out);
    e.noiseBurst(c, t + 0.18, 0.3 * v, 0.9, "lowpass", 600, 60, out);
  },
};

/** Maps an engine effect to a sound. Effect lifetimes identify what made them (see engine.ts). */
function classify(effect: Effect): CombatSound | null {
  if (effect.kind === "shot") {
    if (effect.color === "#a9e6ef") return "sonic";
    if (effect.color === "#f6c274") return "turret";
    return "gun";
  }
  if (effect.kind === "explosion") {
    if (effect.life >= 1) return "buildingDeath";
    if (effect.life >= 0.7) return "unitDeath";
    return "hit";
  }
  return null;
}
