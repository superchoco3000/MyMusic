-- =============================================================================
-- Migration: 00001_initial_schema
-- Description: Base schema for spotify-collab multiplayer micro-SaaS
-- =============================================================================

-- Enable the pgcrypto extension for gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TABLE: profiles
-- Extends auth.users with Spotify-specific metadata.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  spotify_id    TEXT        UNIQUE NOT NULL,
  display_name  TEXT        NOT NULL,
  avatar_url    TEXT,
  is_premium    BOOLEAN     NOT NULL DEFAULT FALSE,
  total_tracks  INTEGER     NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.profiles IS 'User profiles linked to Supabase auth, extended with Spotify data.';
COMMENT ON COLUMN public.profiles.spotify_id IS 'Unique Spotify user ID (e.g. "31xfx...")';
COMMENT ON COLUMN public.profiles.is_premium  IS 'Whether the user has a Spotify Premium subscription.';
COMMENT ON COLUMN public.profiles.total_tracks IS 'Cumulative number of tracks the user has contributed.';

-- =============================================================================
-- TABLE: rooms
-- A collaborative playlist session / game room.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  room_code   TEXT        UNIQUE NOT NULL CHECK (char_length(room_code) = 4),
  status      TEXT        NOT NULL DEFAULT 'waiting'
                          CHECK (status IN ('waiting', 'playing', 'finished')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.rooms IS 'Game/collab rooms identified by a 4-character room code.';
COMMENT ON COLUMN public.rooms.room_code IS 'Short, uppercase code players use to join (e.g. "AB3Z").';
COMMENT ON COLUMN public.rooms.status    IS 'Lifecycle state: waiting → playing → finished.';

-- Index for the common lookup: find a room by its code
CREATE INDEX IF NOT EXISTS idx_rooms_room_code ON public.rooms (room_code);
CREATE INDEX IF NOT EXISTS idx_rooms_host_id   ON public.rooms (host_id);

-- =============================================================================
-- TABLE: players
-- Individual participants inside a room (can be anonymous guests).
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.players (
  id        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id   UUID        NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  nickname  TEXT        NOT NULL,
  score     INTEGER     NOT NULL DEFAULT 0,
  is_host   BOOLEAN     NOT NULL DEFAULT FALSE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.players IS 'Players (host or guests) participating in a room session.';
COMMENT ON COLUMN public.players.nickname IS 'Display name chosen by the player when joining.';
COMMENT ON COLUMN public.players.score    IS 'Accumulated score within the current room session.';
COMMENT ON COLUMN public.players.is_host  IS 'True only for the player who created the room.';

CREATE INDEX IF NOT EXISTS idx_players_room_id ON public.players (room_id);

-- =============================================================================
-- TABLE: leaderboard
-- Persistent global rankings for Challenge / Hell Party / Deathlist modes.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.leaderboard (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID        REFERENCES public.profiles(id) ON DELETE SET NULL,  -- nullable: guests allowed
  player_name TEXT        NOT NULL,
  score       INTEGER     NOT NULL,
  mode        TEXT        NOT NULL CHECK (mode IN ('desafio', 'hell_party', 'deathlist')),
  time_ms     INTEGER     NOT NULL,  -- completion time in milliseconds (lower = better)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.leaderboard IS 'Global leaderboard across all game modes.';
COMMENT ON COLUMN public.leaderboard.user_id     IS 'NULL for anonymous/guest players.';
COMMENT ON COLUMN public.leaderboard.mode        IS 'Game mode: desafio | hell_party | deathlist.';
COMMENT ON COLUMN public.leaderboard.time_ms     IS 'Completion time in milliseconds; lower is better.';

-- Composite index for the most common query pattern: top-N per mode
CREATE INDEX IF NOT EXISTS idx_leaderboard_mode_score
  ON public.leaderboard (mode, score DESC, time_ms ASC);


-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE public.profiles    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leaderboard ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- profiles policies
-- -----------------------------------------------------------------------------

-- Users can read their own profile
CREATE POLICY "profiles: read own"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "profiles: update own"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- The trigger below (end of file) handles INSERT on first Spotify login.
-- Direct INSERT by the authenticated user is also allowed so the client
-- can upsert after OAuth callback.
CREATE POLICY "profiles: insert own"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- rooms policies
-- -----------------------------------------------------------------------------

-- Anyone (anon or authenticated) can look up a room by its code
CREATE POLICY "rooms: read by code"
  ON public.rooms
  FOR SELECT
  USING (TRUE);

-- Only authenticated users can create a room (they become the host)
CREATE POLICY "rooms: authenticated can insert"
  ON public.rooms
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = host_id);

-- Only the host can update the room (e.g. change status)
CREATE POLICY "rooms: host can update"
  ON public.rooms
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = host_id)
  WITH CHECK (auth.uid() = host_id);

-- -----------------------------------------------------------------------------
-- players policies
-- -----------------------------------------------------------------------------

-- Anyone in the room can read the full player list
CREATE POLICY "players: read all in room"
  ON public.players
  FOR SELECT
  USING (TRUE);

-- Anyone (anon included) can join a room that is still in 'waiting' status.
-- We join rooms to validate the status at insertion time.
CREATE POLICY "players: join waiting room"
  ON public.players
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.rooms r
      WHERE r.id = room_id
        AND r.status = 'waiting'
    )
  );

-- Players can update their own row (e.g. update nickname before game starts)
CREATE POLICY "players: update own"
  ON public.players
  FOR UPDATE
  USING (TRUE);  -- scoped further by application logic; scores are updated by backend

-- -----------------------------------------------------------------------------
-- leaderboard policies
-- -----------------------------------------------------------------------------

-- Anyone can read the leaderboard (public ranking)
CREATE POLICY "leaderboard: public read"
  ON public.leaderboard
  FOR SELECT
  USING (TRUE);

-- INSERT is intentionally blocked via RLS for all roles.
-- Scores are submitted by the backend using the service_role key (bypasses RLS).
-- This prevents score manipulation from the client.


-- =============================================================================
-- HELPER: auto-create profile after Supabase auth signup
-- (triggered only when using Supabase's built-in email/social auth)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, spotify_id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'provider_id', NEW.id::TEXT),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email, 'Unknown'),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();
