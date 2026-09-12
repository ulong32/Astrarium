/**
 * Procedural Web Audio API sound synthesizers for Astrhythm.
 * Generates low-latency sound effects in-memory without external assets.
 */

export interface SynthesizedSoundSet {
  perfect: AudioBuffer;
  critical: AudioBuffer;
  scratch: AudioBuffer;
  hold: AudioBuffer;
  holdEnd: AudioBuffer;
}

/**
 * Creates a crisp tap / perfect hit click (pitch drop + fast decay).
 */
export function createTapSound(ctx: AudioContext): AudioBuffer {
  const duration = 0.045;
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Pitch envelope: drops rapidly from 950Hz to 250Hz
    const freq = 950 - 700 * progress;
    const phase = 2 * Math.PI * freq * t;
    // Amplitude envelope: instant attack, exponential-like decay
    const amp = Math.pow(1 - progress, 2.5);
    data[i] = Math.sin(phase) * amp * 0.7;
  }

  return buffer;
}

/**
 * Creates a punchy, resonant critical hit chime.
 */
export function createCriticalSound(ctx: AudioContext): AudioBuffer {
  const duration = 0.08;
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Dual harmonics for metallic shimmer
    const wave1 = Math.sin(2 * Math.PI * 1350 * t);
    const wave2 = Math.sin(2 * Math.PI * 2100 * t) * 0.5;
    const click = (Math.random() * 2 - 1) * Math.exp(-progress * 50) * 0.2;
    const amp = Math.pow(1 - progress, 2.0);
    data[i] = (wave1 + wave2 + click) * amp * 0.6;
  }

  return buffer;
}

/**
 * Creates a swoosh / scratch flick sound with filtered transient noise.
 */
export function createScratchSound(ctx: AudioContext): AudioBuffer {
  const duration = 0.06;
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    // Fast frequency sweep upward
    const freq = 450 + 1200 * progress;
    const tonal = Math.sin(2 * Math.PI * freq * t) * 0.4;
    const noise = (Math.random() * 2 - 1) * 0.6;
    const amp = Math.sin(Math.PI * Math.pow(progress, 0.4)) * (1 - progress);
    data[i] = (tonal + noise) * amp * 0.7;
  }

  return buffer;
}

/**
 * Creates a smooth, seamless looping buzz/shimmer for hold notes.
 */
export function createHoldSound(ctx: AudioContext): AudioBuffer {
  // Use exact cycle length to avoid clicks at loop boundaries
  const fundamental = 330; // E4
  const cycles = 33;
  const duration = cycles / fundamental; // ~0.1s exact integer cycles
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.round(sampleRate * duration);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    const t = (i / numSamples) * duration;
    // Soft blend of fundamental and 2nd harmonic
    const s1 = Math.sin(2 * Math.PI * fundamental * t);
    const s2 = Math.sin(2 * Math.PI * fundamental * 2 * t) * 0.25;
    data[i] = (s1 + s2) * 0.25;
  }

  return buffer;
}

/**
 * Creates a pleasant release chime for hold ends.
 */
export function createHoldEndSound(ctx: AudioContext): AudioBuffer {
  const duration = 0.07;
  const sampleRate = ctx.sampleRate;
  const numSamples = Math.floor(sampleRate * duration);
  const buffer = ctx.createBuffer(1, numSamples, sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const progress = i / numSamples;
    const tone = Math.sin(2 * Math.PI * 1100 * t);
    const amp = Math.pow(1 - progress, 2.2);
    data[i] = tone * amp * 0.5;
  }

  return buffer;
}

/**
 * Generates and returns a complete set of procedural sound effect buffers.
 */
export function initSynthesizedSounds(ctx: AudioContext): SynthesizedSoundSet {
  return {
    perfect: createTapSound(ctx),
    critical: createCriticalSound(ctx),
    scratch: createScratchSound(ctx),
    hold: createHoldSound(ctx),
    holdEnd: createHoldEndSound(ctx),
  };
}
