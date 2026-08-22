import type { MusicLibraryTrack, MusicLibraryPlaylist } from "@/types/library";

/**
 * Calculates the acoustic cohesion of a playlist based on the standard deviation
 * of BPM (tempo) and Energy across all analyzed tracks.
 * Returns an integer score between 0% and 100%.
 * Defaults to 50% if tracks lack audio features.
 */
export function calculateCohesion(tracks?: MusicLibraryTrack[] | null): number {
  if (!tracks || tracks.length === 0) return 50;

  const validTracks = tracks.filter((t) => {
    const tempo = t.audio_features?.tempo ?? t.bpm;
    const energy = t.audio_features?.energy ?? t.energy;
    return typeof tempo === "number" && typeof energy === "number";
  });

  if (validTracks.length === 0) return 50;
  if (validTracks.length === 1) return 100;

  const tempos = validTracks.map((t) => (t.audio_features?.tempo ?? t.bpm) as number);
  const energies = validTracks.map((t) => (t.audio_features?.energy ?? t.energy) as number);

  const n = validTracks.length;

  // 1. Tempo Standard Deviation
  const meanTempo = tempos.reduce((acc, v) => acc + v, 0) / n;
  const varTempo = tempos.reduce((acc, v) => acc + Math.pow(v - meanTempo, 2), 0) / n;
  const stdTempo = Math.sqrt(varTempo);

  // 2. Energy Standard Deviation
  const meanEnergy = energies.reduce((acc, v) => acc + v, 0) / n;
  const varEnergy = energies.reduce((acc, v) => acc + Math.pow(v - meanEnergy, 2), 0) / n;
  const stdEnergy = Math.sqrt(varEnergy);

  // Normalization:
  // - Tempo std dev: 0 BPM diff -> 100% cohesion; 28+ BPM diff -> 0% cohesion
  const tempoCohesion = Math.max(0, Math.min(1, 1 - stdTempo / 28));

  // - Energy std dev: 0 diff -> 100% cohesion; 0.28+ diff -> 0% cohesion
  const energyCohesion = Math.max(0, Math.min(1, 1 - stdEnergy / 0.28));

  // Weighted score (50% tempo balance, 50% energy balance)
  const score = Math.round((tempoCohesion * 0.5 + energyCohesion * 0.5) * 100);

  return Math.max(0, Math.min(100, score));
}

export type RPGPlaylistCategory =
  | "unconfigured"
  | "in_creation"
  | "almost_perfect"
  | "target"
  | "perfect"
  | "chaotic";

export interface RPGStateResult {
  category: RPGPlaylistCategory;
  level: number; // 1 to 10 if perfect, otherwise 0
  cohesionScore: number; // 0 - 100%
  badgeLabel: string;
  isEvolved: boolean; // perfect && level >= 2
  trackCount: number;
}

/**
 * 5-Category RPG State Machine with Unconfigured Support
 *
 * If playlist has not been classified or configured yet by the user,
 * it returns category: "unconfigured" with "SIN CONFIGURAR" badge.
 */
export function getPlaylistRPGState(
  playlist: MusicLibraryPlaylist,
  classification?: string | null
): RPGStateResult {
  const tracks = playlist.tracks_data ?? [];
  const trackCount =
    (typeof playlist.total_tracks === "number" && playlist.total_tracks > 0)
      ? playlist.total_tracks
      : (typeof playlist.tracks?.total === "number" && playlist.tracks.total > 0)
      ? playlist.tracks.total
      : (typeof playlist.completion_meta?.current_count === "number" && playlist.completion_meta.current_count > 0)
      ? playlist.completion_meta.current_count
      : (tracks.length > 0)
      ? tracks.length
      : 0;


  const cohesionScore = calculateCohesion(tracks);
  const isBenchmark = playlist.completion_meta?.is_benchmark === true;

  // If not classified/configured by the user yet, maintain clean unconfigured state
  const effectiveClass = classification ?? playlist.completion_meta?.classification ?? playlist.classification;
  if (!effectiveClass && !isBenchmark) {
    return {
      category: "unconfigured",
      level: 0,
      cohesionScore,
      badgeLabel: "SIN CONFIGURAR",
      isEvolved: false,
      trackCount,
    };
  }

  // 1. Perfecta (Nivel 1 al 10)
  if (trackCount >= 100 && cohesionScore >= 80) {
    const rawLevel = Math.floor(trackCount / 100);
    const level = Math.min(10, Math.max(1, rawLevel));
    const badgeLabel = level === 10 ? "🏆 LVL 10 DORADO" : `PERFECTA LVL ${level}`;
    return {
      category: "perfect",
      level,
      cohesionScore,
      badgeLabel,
      isEvolved: level >= 2,
      trackCount,
    };
  }

  // 2. Casi Perfecta (80 - 99 tracks & cohesion >= 70%)
  if (trackCount >= 80 && trackCount <= 99 && cohesionScore >= 70) {
    return {
      category: "almost_perfect",
      level: 0,
      cohesionScore,
      badgeLabel: "CASI PERFECTA",
      isEvolved: false,
      trackCount,
    };
  }

  // 3. En Creación (50 - 79 tracks)
  if (trackCount >= 50 && trackCount <= 79) {
    return {
      category: "in_creation",
      level: 0,
      cohesionScore,
      badgeLabel: "EN CREACIÓN",
      isEvolved: false,
      trackCount,
    };
  }

  // 4. Objetivo (Benchmark or cohesion >= 70%)
  if (isBenchmark || effectiveClass === "objetivo" || cohesionScore >= 70) {
    return {
      category: "target",
      level: 0,
      cohesionScore,
      badgeLabel: isBenchmark ? "BENCHMARK OBJETIVO" : "OBJETIVO",
      isEvolved: false,
      trackCount,
    };
  }

  // 5. Caótica (Fallback)
  return {
    category: "chaotic",
    level: 0,
    cohesionScore,
    badgeLabel: "CAÓTICA",
    isEvolved: false,
    trackCount,
  };
}
