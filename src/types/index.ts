/**
 * Global TypeScript interfaces mapping the Supabase database schema.
 * Each interface mirrors its corresponding table in public.* 1-to-1.
 *
 * Naming convention:
 *  - snake_case  → database column names (kept for direct Supabase query compatibility)
 *  - All nullable DB columns are typed as `T | null`
 */

// =============================================================================
// Enums / Union types
// =============================================================================

/** Lifecycle state of a Room. Maps to the CHECK constraint on rooms.status. */
export type RoomStatus = "waiting" | "playing" | "finished";

/** Available leaderboard / game modes. Maps to the CHECK on leaderboard.mode. */
export type GameMode = "desafio" | "hell_party" | "deathlist";

// =============================================================================
// Table: profiles
// =============================================================================

/**
 * Extends auth.users with Spotify-specific metadata.
 * Primary key mirrors auth.users.id.
 */
export interface Profile {
  /** UUID — mirrors auth.users.id */
  id: string;
  /** Unique Spotify user ID (e.g. "31xfx...") */
  spotify_id: string;
  /** Player's Spotify display name */
  display_name: string;
  /** Spotify profile picture URL — null if not provided */
  avatar_url: string | null;
  /** Whether the user has Spotify Premium */
  is_premium: boolean;
  /** Cumulative tracks contributed across all sessions */
  total_tracks: number;
  /** ISO 8601 timestamp of first login */
  created_at: string;
}

/** Payload for creating a new profile (INSERT) */
export type ProfileInsert = Omit<Profile, "total_tracks" | "created_at"> &
  Partial<Pick<Profile, "total_tracks">>;

/** Payload for partial profile updates (UPDATE) */
export type ProfileUpdate = Partial<
  Pick<Profile, "display_name" | "avatar_url" | "is_premium" | "total_tracks">
>;

// =============================================================================
// Table: rooms
// =============================================================================

/**
 * A collaborative playlist session or game room.
 * Identified by a short 4-character room_code.
 */
export interface Room {
  /** UUID — auto-generated */
  id: string;
  /** UUID of the profile that created the room */
  host_id: string;
  /** 4-character uppercase join code (e.g. "AB3Z") */
  room_code: string;
  /** Current lifecycle status */
  status: RoomStatus;
  /** ISO 8601 creation timestamp */
  created_at: string;
}

/** Payload for creating a new room */
export type RoomInsert = Pick<Room, "host_id" | "room_code">;

/** Payload for updating a room (typically the status) */
export type RoomUpdate = Partial<Pick<Room, "status">>;

// =============================================================================
// Table: players
// =============================================================================

/**
 * An individual participant inside a Room.
 * Can be an anonymous guest — no FK to profiles.
 */
export interface Player {
  /** UUID — auto-generated */
  id: string;
  /** UUID of the room this player belongs to */
  room_id: string;
  /** Display name chosen when joining */
  nickname: string;
  /** Score accumulated in this room session */
  score: number;
  /** True for the player who created the room */
  is_host: boolean;
  /** ISO 8601 timestamp of when the player joined */
  joined_at: string;
}

/** Payload for a player joining a room */
export type PlayerInsert = Pick<Player, "room_id" | "nickname"> &
  Partial<Pick<Player, "is_host">>;

/** Payload for updating a player's score or nickname */
export type PlayerUpdate = Partial<Pick<Player, "score" | "nickname">>;

// =============================================================================
// Table: leaderboard
// =============================================================================

/**
 * Persistent global ranking entry.
 * user_id is nullable to support anonymous / guest players.
 * Rows are inserted exclusively by the backend (service_role) to prevent cheating.
 */
export interface LeaderboardEntry {
  /** UUID — auto-generated */
  id: string;
  /** UUID FK to profiles — null for guest players */
  user_id: string | null;
  /** Display name at the time of submission */
  player_name: string;
  /** Final score achieved */
  score: number;
  /** Game mode in which the score was achieved */
  mode: GameMode;
  /** Completion time in milliseconds (lower = better for tiebreaking) */
  time_ms: number;
  /** ISO 8601 timestamp of score submission */
  created_at: string;
}

/** Payload for inserting a leaderboard entry (backend only) */
export type LeaderboardInsert = Omit<LeaderboardEntry, "id" | "created_at">;

// =============================================================================
// Composed / View types (used across the UI layer)
// =============================================================================

/** Room data enriched with the full player list — returned by real-time subscriptions */
export interface RoomWithPlayers extends Room {
  players: Player[];
}

/** Room data enriched with host profile — used on join / lobby screens */
export interface RoomWithHost extends Room {
  host: Pick<Profile, "id" | "display_name" | "avatar_url">;
}

/** Leaderboard entry enriched with profile data for the top-N display */
export interface LeaderboardEntryWithProfile extends LeaderboardEntry {
  profile: Pick<Profile, "display_name" | "avatar_url"> | null;
}
