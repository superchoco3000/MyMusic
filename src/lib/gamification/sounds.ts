"use client";

/**
 * Web Audio API Synthesis Engine for Spotify Collab gamified sounds.
 * Zero external audio files required — generates crystalline chimes,
 * level-up fanfares, and sci-fi pulses using pure trigonometric wave synthesis.
 */

let globalAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!globalAudioCtx) {
      globalAudioCtx = new AudioContextClass();
    }
    if (globalAudioCtx.state === "suspended") {
      globalAudioCtx.resume();
    }
    return globalAudioCtx;
  } catch {
    return null;
  }
}

export type RewardSoundType = "perfect" | "target" | "chaotic" | "level_up" | "fanfare" | "default";

export function playRewardSound(type: RewardSoundType = "perfect"): void {
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;

  if (type === "perfect" || type === "target" || type === "level_up") {
    // 🌟 Crystal Arpeggio Chime (C5, E5, G5, C6, E6)
    const freqs =
      type === "level_up" || type === "perfect"
        ? [523.25, 659.25, 783.99, 1046.5, 1318.51] // C5, E5, G5, C6, E6
        : [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6

    freqs.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + idx * 0.07);

      gain.gain.setValueAtTime(0.001, now + idx * 0.07);
      gain.gain.exponentialRampToValueAtTime(0.2, now + idx * 0.07 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.07 + 0.55);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now + idx * 0.07);
      osc.stop(now + idx * 0.07 + 0.6);
    });
  } else if (type === "fanfare") {
    // 👑 Triumphant Victory Chime Chord (C5, G5, C6)
    const chord = [523.25, 783.99, 1046.5];
    chord.forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.25, now + 0.05);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.2);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 1.25);
    });
  } else if (type === "chaotic") {
    // ⚡ Sci-Fi Laser Warp Pulse
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();

    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(320, now);
    osc.frequency.exponentialRampToValueAtTime(75, now + 0.32);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.exponentialRampToValueAtTime(120, now + 0.32);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.36);
  } else {
    // 🫧 Crisp Pop / Fast Confirmation
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.08); // A5

    gain.gain.setValueAtTime(0.15, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.16);
  }
}
