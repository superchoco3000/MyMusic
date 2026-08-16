import type { SpotifyAudioFeatures } from "./api";

export interface AudioDNARecord {
  bpm: number;
  energy: number;
  danceability: number;
  key: string;
  mode: number; // 1 = Major, 0 = Minor
}

let dnaCache: Record<string, AudioDNARecord> | null = null;
const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Loads the offline Audio DNA database generated strictly by extract_dna.py.
 * Cached in memory after the first fetch.
 */
export async function loadAudioDNADatabase(): Promise<Record<string, AudioDNARecord>> {
  if (dnaCache) return dnaCache;

  try {
    const res = await fetch("/data/audio_dna.json");
    if (res.ok) {
      dnaCache = (await res.json()) as Record<string, AudioDNARecord>;
      return dnaCache;
    }
  } catch (err) {
    console.warn("[dna] Could not load /data/audio_dna.json:", err);
  }

  dnaCache = {};
  return dnaCache;
}

/**
 * Converts a local AudioDNARecord strictly derived from Librosa into
 * SpotifyAudioFeatures shape for UI compatibility.
 */
export function convertDNAToAudioFeatures(
  id: string,
  record: AudioDNARecord
): SpotifyAudioFeatures {
  const keyIdx = PITCH_NAMES.indexOf(record.key);

  return {
    id,
    tempo: record.bpm,
    energy: record.energy,
    danceability: record.danceability,
    valence: 0.5,
    acousticness: 0.5,
    instrumentalness: 0,
    speechiness: 0,
    loudness: -6,
    mode: record.mode,
    key: keyIdx >= 0 ? keyIdx : 0,
    time_signature: 4,
    duration_ms: 0,
  };
}
