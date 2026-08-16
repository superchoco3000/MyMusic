/**
 * Spotify Web API — lightweight typed client
 *
 * All functions receive the provider_token from the Zustand authStore.
 * We call the Spotify REST API directly from the browser (no server proxy
 * needed) since the token is a standard OAuth Bearer token.
 */

const SPOTIFY_BASE = "https://api.spotify.com/v1";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SpotifyImage {
  url: string;
  width: number | null;
  height: number | null;
}

export interface SpotifyPlaylist {
  id: string;
  name: string;
  description: string | null;
  images: SpotifyImage[];
  tracks: { total: number };
  owner: { display_name: string };
  public: boolean | null;
  collaborative: boolean;
  external_urls: { spotify: string };
}

export interface SpotifyPlaylistsResponse {
  items: SpotifyPlaylist[];
  total: number;
  next: string | null;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

async function spotifyFetch<T>(
  endpoint: string,
  token: string
): Promise<T> {
  const res = await fetch(`${SPOTIFY_BASE}${endpoint}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    console.warn(`[spotify/api] Request to ${endpoint} returned ${res.status}:`, text);
    throw new Error(`Spotify API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}


// ─── Exported service functions ───────────────────────────────────────────────

/**
 * Fetches the current user's playlists (max 50 per call).
 * Requires scopes: playlist-read-private, playlist-read-collaborative.
 */
export async function getUserPlaylists(
  token: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPlaylistsResponse> {
  return spotifyFetch<SpotifyPlaylistsResponse>(
    `/me/playlists?limit=${limit}&offset=${offset}`,
    token
  );
}

/**
 * Fetches metadata for a single playlist by ID directly from Spotify API.
 */
export async function getPlaylistDetails(
  token: string,
  playlistId: string
): Promise<SpotifyPlaylist> {
  return spotifyFetch<SpotifyPlaylist>(
    `/playlists/${playlistId}?fields=id,name,description,images,tracks(total),owner(display_name),public,collaborative,external_urls`,
    token
  );
}

// =============================================================================
// Playlist tracks
// =============================================================================

export interface SpotifyArtist {
  id: string;
  name: string;
}

export interface SpotifyTrackObject {
  id: string | null;
  name: string;
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
  external_urls: { spotify: string };
  artists: SpotifyArtist[];
  album: {
    id: string;
    name: string;
    images: SpotifyImage[];
  };
}

export interface SpotifyPlaylistTrackItem {
  added_at: string | null;
  track: SpotifyTrackObject | null; // null for local tracks or deleted tracks
}

export interface SpotifyPlaylistTracksResponse {
  items: SpotifyPlaylistTrackItem[];
  total: number;
  next: string | null;
  offset: number;
  limit: number;
}

/**
 * Fetches up to `limit` tracks for a given playlist.
 * Standalone fetch (does NOT use spotifyFetch) so debug logs are unambiguous.
 */
export async function getPlaylistTracks(
  token: string,
  playlistId: string,
  limit = 50,
  offset = 0
): Promise<SpotifyPlaylistTracksResponse> {
  const url = `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=${limit}&offset=${offset}`;

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.warn(`[spotify/api] Playlist tracks request failed (${response.status}):`, errorData);
    // Return an empty tracks response on 403/error so the UI degrades gracefully
    return {
      items: [],
      total: 0,
      next: null,
      offset,
      limit,
    };
  }

  return response.json() as Promise<SpotifyPlaylistTracksResponse>;
}



// =============================================================================
// Audio features (BPM, energy, danceability)
// =============================================================================

export interface SpotifyAudioFeatures {
  id: string;
  tempo: number;          // BPM
  energy: number;         // 0.0–1.0
  danceability: number;   // 0.0–1.0
  valence: number;        // 0.0–1.0 (musical positiveness)
  acousticness: number;   // 0.0–1.0
  instrumentalness: number;
  speechiness: number;
  loudness: number;       // dB, typically -60–0
  mode: number;           // 0 = minor, 1 = major
  key: number;            // Pitch class notation (0=C, 1=C#, …, 11=B)
  time_signature: number;
  duration_ms: number;
}

interface AudioFeaturesResponse {
  audio_features: (SpotifyAudioFeatures | null)[];
}

/**
 * Fetches audio features for up to 100 tracks per call.
 * Automatically batches if more than 100 IDs are provided.
 * Returns a Map<trackId, SpotifyAudioFeatures> for O(1) lookup.
 *
 * NOTE: Spotify restricted /audio-features to apps with Extended Quota Mode
 * (approved after Nov 2023). On 403 we return an empty Map so callers can
 * render tracks without BPM/energy data rather than crashing the page.
 */
export async function getTracksAudioFeatures(
  token: string,
  trackIds: string[]
): Promise<Map<string, SpotifyAudioFeatures>> {
  if (trackIds.length === 0) return new Map();

  const BATCH = 100;
  const batches: string[][] = [];
  for (let i = 0; i < trackIds.length; i += BATCH) {
    batches.push(trackIds.slice(i, i + BATCH));
  }

  try {
    const results = await Promise.all(
      batches.map((ids) =>
        spotifyFetch<AudioFeaturesResponse>(
          `/audio-features?ids=${ids.join(",")}`,
          token
        )
      )
    );

    const map = new Map<string, SpotifyAudioFeatures>();
    for (const result of results) {
      for (const feat of result.audio_features) {
        if (feat) map.set(feat.id, feat);
      }
    }
    return map;
  } catch (err) {
    // 403 = app lacks Extended Quota Mode approval on Spotify Developer Dashboard.
    // Return empty Map so the track list still renders without audio data.
    console.warn("[spotify/api] getTracksAudioFeatures unavailable:", err);
    return new Map();
  }
}
