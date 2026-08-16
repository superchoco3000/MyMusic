export interface MusicAudioFeatures {
  id?: string;
  tempo?: number | null;          // BPM
  energy?: number | null;         // 0.0-1.0
  danceability?: number | null;   // 0.0-1.0
  valence?: number | null;        // 0.0-1.0
  acousticness?: number | null;
  instrumentalness?: number | null;
  speechiness?: number | null;
  loudness?: number | null;
  mode?: number | null;           // 0=minor, 1=major
  key?: number | null;            // Pitch class notation (0=C, 1=C#, ..., 11=B)
  time_signature?: number | null;
  duration_ms?: number | null;
}

export interface MusicLibraryTrack {
  id: string;
  name: string;
  artist?: string | null;
  album?: string | null;
  album_cover?: string | null;
  duration_ms?: number | null;
  preview_url?: string | null;
  image_url?: string | null;
  added_at?: string | null;       // ISO timestamp from CSV (added_at field)
  release_date?: string | null;   // from CSV
  popularity?: number | null;     // 0-100 from Spotify
  genres?: string | null;         // genre string from CSV
  explicit?: boolean | null;
  bpm?: number | null;
  energy?: number | null;
  danceability?: number | null;
  key?: string | number | null;
  mode?: number | null;
  audio_features?: MusicAudioFeatures | null;
  // Completion Algorithm scaffold
  completion_score?: number | null;
  completion_flags?: string[];
}

// ─── Curation Algorithm Rules & DNA Configuration ───────────────────────────

export type CurationEra = "all" | "pre_2000" | "2000s" | "2010s" | "2020s";
export type CurationBpmTolerance = "strict" | "flexible" | "ignore";
export type CurationVibePill = "instrumental" | "electronic" | "acoustic" | "vocals_only";

export interface CurationRules {
  era: CurationEra;
  bpm_tolerance: CurationBpmTolerance;
  vibes: CurationVibePill[];
  subgenres?: string[];
}

/** Completion Algorithm metadata — one per playlist */
export interface CompletionMeta {
  target_count: number;          // always 100
  current_count: number;
  benchmark_playlist: string | null;  // "DnB" or null for the benchmark itself
  is_benchmark: boolean;
  status: "pending" | "in_progress" | "completed";
  last_run_at: string | null;
  gap: number;                   // positive = need more, negative = need to trim
  classification?: "caotica" | "objetivo" | "no_personal" | null;
  rules?: CurationRules | null;
}

export interface MusicLibraryPlaylist {
  id: string | null;
  name: string;
  description?: string | null;
  image_url?: string | null;
  owner_name?: string | null;
  total_tracks?: number | null;
  tracks?: { total: number } | null;
  collaborative?: boolean | null;
  last_synced_at?: string | null;
  snapshot_id?: string | null;   // Spotify snapshot_id for delta detection
  source?: "csv_import" | "delta_sync" | string | null;
  tracks_data?: MusicLibraryTrack[] | null;
  completion_meta?: CompletionMeta | null;
  classification?: "caotica" | "objetivo" | "no_personal" | null;
}

export interface AuditedTrackItem {
  id: string;
  track: MusicLibraryTrack;
  targetPlanetId: string;
  targetPlanetName: string;
  reason: string;
  timestamp?: number;
}

export interface MusicLibrary {
  playlists: MusicLibraryPlaylist[];
  last_updated_at: string;
}
