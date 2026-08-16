import type { MusicLibraryPlaylist, MusicLibraryTrack } from "@/types/library";

export interface TargetAcousticProfile {
  meanBpm: number;
  meanEnergy: number;
  meanDanceability: number;
  knownArtists: Set<string>;
  knownGenres: Set<string>;
  sampleCount: number;
}

export interface InfiniteRecommendationResult {
  track: MusicLibraryTrack;
  affinityScore: number;       // 0 - 100%
  affinityReason: string;
}

/**
 * Calculates the average acoustic DNA vectors for a given target playlist.
 */
export function calculateTargetAcousticProfile(playlist: MusicLibraryPlaylist): TargetAcousticProfile {
  const tracks = playlist.tracks_data ?? [];
  let sumBpm = 0;
  let bpmCount = 0;
  let sumEnergy = 0;
  let energyCount = 0;
  let sumDanceability = 0;
  let danceCount = 0;

  const knownArtists = new Set<string>();
  const knownGenres = new Set<string>();

  tracks.forEach((t) => {
    const bpm = t.audio_features?.tempo ?? t.bpm;
    if (typeof bpm === "number" && bpm > 0) {
      sumBpm += bpm;
      bpmCount++;
    }

    const energy = t.audio_features?.energy ?? t.energy;
    if (typeof energy === "number") {
      sumEnergy += energy;
      energyCount++;
    }

    const dance = t.audio_features?.danceability ?? t.danceability;
    if (typeof dance === "number") {
      sumDanceability += dance;
      danceCount++;
    }

    if (t.artist) {
      t.artist.split(";").forEach((a) => {
        const trimmed = a.trim().toLowerCase();
        if (trimmed) knownArtists.add(trimmed);
      });
    }

    if (t.genres) {
      t.genres.split(",").forEach((g) => {
        const trimmed = g.trim().toLowerCase();
        if (trimmed) knownGenres.add(trimmed);
      });
    }
  });

  return {
    meanBpm: bpmCount > 0 ? sumBpm / bpmCount : 124,
    meanEnergy: energyCount > 0 ? sumEnergy / energyCount : 0.65,
    meanDanceability: danceCount > 0 ? sumDanceability / danceCount : 0.65,
    knownArtists,
    knownGenres,
    sampleCount: tracks.length,
  };
}

/**
 * Calculates the acoustic compatibility score (0-100%) between a candidate track
 * and the target playlist profile.
 */
export function scoreTrackAffinity(
  track: MusicLibraryTrack,
  profile: TargetAcousticProfile
): InfiniteRecommendationResult {
  const bpm = track.audio_features?.tempo ?? track.bpm ?? profile.meanBpm;
  const energy = track.audio_features?.energy ?? track.energy ?? profile.meanEnergy;
  const dance = track.audio_features?.danceability ?? track.danceability ?? profile.meanDanceability;

  // 1. BPM affinity (Max 40 points)
  const bpmDelta = Math.abs(bpm - profile.meanBpm);
  let bpmScore = 40;
  if (bpmDelta <= 5) bpmScore = 40;
  else if (bpmDelta <= 15) bpmScore = 32;
  else if (bpmDelta <= 25) bpmScore = 20;
  else bpmScore = Math.max(5, 40 - bpmDelta);

  // 2. Energy affinity (Max 35 points)
  const energyDelta = Math.abs(energy - profile.meanEnergy);
  const energyScore = Math.max(0, 35 * (1 - energyDelta * 2));

  // 3. Danceability affinity (Max 15 points)
  const danceDelta = Math.abs(dance - profile.meanDanceability);
  const danceScore = Math.max(0, 15 * (1 - danceDelta * 2));

  // 4. Artist or Genre affinity bonus (Max 10 points)
  let artistBonus = 0;
  if (track.artist) {
    const artists = track.artist.split(";").map((a) => a.trim().toLowerCase());
    if (artists.some((a) => profile.knownArtists.has(a))) {
      artistBonus = 10;
    }
  }

  const rawScore = Math.round(bpmScore + energyScore + danceScore + artistBonus);
  const affinityScore = Math.min(99, Math.max(55, rawScore));

  let affinityReason = "Coincidencia de tempo y energía óptima";
  if (artistBonus > 0) {
    affinityReason = "Artista afín con el ADN de la playlist";
  } else if (bpmDelta <= 6) {
    affinityReason = `BPM alineado (${Math.round(bpm)} BPM ≈ ${Math.round(profile.meanBpm)} BPM)`;
  } else if (energyDelta <= 0.1) {
    affinityReason = "Vibración y dinámica acústica idéntica";
  }

  return {
    track,
    affinityScore,
    affinityReason,
  };
}

/**
 * Ranks candidate tracks for Infinite Mode, prioritizing the highest acoustic affinity.
 */
export function getInfiniteRecommendations(
  candidates: MusicLibraryTrack[],
  profile: TargetAcousticProfile,
  excludedIds: Set<string>
): InfiniteRecommendationResult[] {
  return candidates
    .filter((t) => {
      const key = t.id ?? `${t.name}:::${t.artist}`;
      return !excludedIds.has(key);
    })
    .map((t) => scoreTrackAffinity(t, profile))
    .sort((a, b) => b.affinityScore - a.affinityScore);
}
