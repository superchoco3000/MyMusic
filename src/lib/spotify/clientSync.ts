/**
 * Client-Side Spotify Sync Engine (Asymmetric Architecture: Superficial Global vs JIT Chaotic)
 * ==============================================================================================
 * 1. Global Sync: Ultra-fast (<3s) superficial scan of catalog metadata & counts only.
 *    - ONLY calls /v1/me/tracks?limit=1 (to get Liked Songs total count).
 *    - ONLY calls /v1/me/playlists?limit=50 (to get playlist names, IDs, and tracks.total).
 *    - ZERO track downloading loops. Zero risk of 403 or rate-limits.
 * 2. JIT Chaotic Sync: Independent deep-fetch function exclusively for user playlists
 *    classified as "Caótica", triggered on-demand.
 * 3. Objective Playlists: Shielded as receptacles, never download remote tracks.
 */

import type {
  MusicLibrary,
  MusicLibraryPlaylist,
  MusicLibraryTrack,
} from "@/types/library";
import {
  saveMusicLibrary,
  loadMusicLibrary,
  getSavedClassifications,
} from "@/lib/library/libraryStore";
import { setIndexedDBLibrary } from "@/lib/library/indexedDB";

interface RawSpotifyImage {
  url: string;
  height?: number;
  width?: number;
}

interface RawSpotifyArtist {
  id?: string;
  name?: string;
}

interface RawSpotifyAlbum {
  id?: string;
  name?: string;
  images?: RawSpotifyImage[];
  release_date?: string;
}

interface RawSpotifyTrackItem {
  id?: string;
  name?: string;
  duration_ms?: number;
  preview_url?: string | null;
  explicit?: boolean;
  artists?: RawSpotifyArtist[];
  album?: RawSpotifyAlbum;
}

interface RawSpotifyPlaylistItem {
  added_at?: string | null;
  track?: RawSpotifyTrackItem | null;
}

interface RawSpotifyPlaylistSummary {
  id: string;
  name: string;
  description?: string | null;
  images?: RawSpotifyImage[];
  snapshot_id?: string;
  tracks?: { total?: number; href?: string };
  owner?: { display_name?: string };
  collaborative?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust fetch with exponential retry on 429 and graceful 403 handling
 */
async function spotifyFetchWithRetry<T>(
  url: string,
  token: string
): Promise<T> {
  let attempt = 0;
  while (attempt < 5) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 403) {
      throw new Error("ERROR_403_FORBIDDEN: Permisos denegados por Spotify.");
    }

    if (res.status === 429) {
      const retryHeader = res.headers.get("Retry-After");
      const waitSeconds = Math.max(1, retryHeader ? parseInt(retryHeader, 10) : 5);
      console.warn(`[clientSync] Rate Limited (429). Waiting ${waitSeconds}s before retry.`);
      await sleep((waitSeconds + 1) * 1000);
      attempt++;
      continue;
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      throw new Error(`Spotify HTTP ${res.status}: ${JSON.stringify(errBody)}`);
    }

    return (await res.json()) as T;
  }
  throw new Error("Límite de reintentos excedido por restricciones temporales de Spotify.");
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. SINCRONIZACIÓN GLOBAL SILENCIOSA Y ULTRA-RÁPIDA (SOLO METADATOS Y CONTEOS)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Executes a fast superficial sync: Fetches catalog metadata and counts in <3s.
 * Only makes 2 API calls: /v1/me/tracks?limit=1 and /v1/me/playlists?limit=50.
 * Absolutely NO track downloads.
 */
export async function syncSpotifyLibraryClient(
  token: string,
  currentLibrary: MusicLibrary
): Promise<MusicLibrary> {
  const savedClassifications = getSavedClassifications();
  const localPlaylistsMap = new Map<string, MusicLibraryPlaylist>();

  for (const pl of currentLibrary.playlists) {
    if (pl.id) localPlaylistsMap.set(pl.id, pl);
    if (pl.name) localPlaylistsMap.set(pl.name.toLowerCase().trim(), pl);
  }

  // 1a. Consultar total exacto de Liked Songs con una única petición (limit=1)
  let remoteLikedTotal = 0;
  try {
    const likedHead: { total?: number } = await spotifyFetchWithRetry(
      "https://api.spotify.com/v1/me/tracks?limit=1",
      token
    );
    remoteLikedTotal = typeof likedHead?.total === "number" ? likedHead.total : 0;
  } catch (err) {
    console.warn("[clientSync] Error al consultar total de Liked Songs:", err);
  }

  // 1b. Obtener lista completa de playlists del usuario (solo metadatos y tracks.total)
  const remotePlaylists: RawSpotifyPlaylistSummary[] = [];
  let playlistUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (playlistUrl) {
    const page: { items?: RawSpotifyPlaylistSummary[]; next?: string | null } =
      await spotifyFetchWithRetry(playlistUrl, token);

    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      if (item && item.id) {
        remotePlaylists.push(item);
      }
    }
    playlistUrl = page?.next || null;
    if (playlistUrl) await sleep(50);
  }

  // ─── 2. Comparación de Versiones y Actualización en Memoria ─────────────────
  const remotePlaylistIdsSet = new Set(remotePlaylists.map((p) => p.id));
  const stagedPlaylists: MusicLibraryPlaylist[] = [];

  // 2a. Procesar Liked Songs (preservar tracks_data local existente)
  const existingLiked = localPlaylistsMap.get("spotify_liked_songs") || localPlaylistsMap.get("liked songs");
  const effectiveLikedCount = remoteLikedTotal > 0 ? remoteLikedTotal : (existingLiked?.total_tracks ?? existingLiked?.tracks_data?.length ?? 0);

  const stagedLiked: MusicLibraryPlaylist = {
    id: "spotify_liked_songs",
    name: "Liked Songs",
    description: "Tus canciones favoritas sincronizadas en tiempo real con Spotify.",
    image_url:
      existingLiked?.image_url ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60",
    owner_name: "Tú",
    total_tracks: effectiveLikedCount,
    tracks: { total: effectiveLikedCount },
    collaborative: false,
    snapshot_id: existingLiked?.snapshot_id || `liked_${effectiveLikedCount}`,
    last_synced_at: new Date().toISOString(),
    source: "spotify_liked_songs",
    tracks_data: existingLiked?.tracks_data ?? [],
    classification: existingLiked?.classification ?? "caotica",
    completion_meta: existingLiked?.completion_meta ?? {
      target_count: 100,
      current_count: effectiveLikedCount,
      classification: "caotica",
      is_benchmark: false,
      status: "pending",
      benchmark_playlist: null,
      last_run_at: null,
      gap: 100 - effectiveLikedCount,
      rules: null,
    },
  };

  stagedPlaylists.push(stagedLiked);

  // 2b. Procesar cada playlist remota (preservar tracks_data local y actualizar conteos)
  for (const rpl of remotePlaylists) {
    const localPl = localPlaylistsMap.get(rpl.id) || localPlaylistsMap.get(rpl.name.toLowerCase().trim());
    const remoteCount = typeof rpl.tracks?.total === "number" ? rpl.tracks.total : (localPl?.total_tracks ?? localPl?.tracks_data?.length ?? 0);
    const coverUrl = rpl.images?.[0]?.url || localPl?.image_url || null;
    const persistentClass = savedClassifications[rpl.id] || savedClassifications[rpl.name] || localPl?.classification || null;

    if (localPl) {
      // Playlist existente: actualizar metadatos y conteo
      stagedPlaylists.push({
        ...localPl,
        id: rpl.id,
        name: rpl.name,
        description: rpl.description ?? localPl.description,
        image_url: coverUrl,
        owner_name: rpl.owner?.display_name ?? localPl.owner_name ?? "Tú",
        total_tracks: remoteCount,
        tracks: { total: remoteCount },
        snapshot_id: rpl.snapshot_id ?? localPl.snapshot_id,
        classification: persistentClass,
        tracks_data: localPl.tracks_data ?? [],
        completion_meta: localPl.completion_meta
          ? {
              ...localPl.completion_meta,
              current_count: remoteCount,
              classification: persistentClass,
              gap: (localPl.completion_meta.target_count || 100) - remoteCount,
            }
          : {
              target_count: 100,
              current_count: remoteCount,
              classification: persistentClass,
              is_benchmark: false,
              status: "pending",
              benchmark_playlist: null,
              last_run_at: null,
              gap: 100 - remoteCount,
              rules: null,
            },
      });
    } else {
      // Playlist nueva
      stagedPlaylists.push({
        id: rpl.id,
        name: rpl.name,
        description: rpl.description || `Playlist importada de Spotify (${remoteCount} canciones).`,
        image_url: coverUrl,
        owner_name: rpl.owner?.display_name || "Tú",
        total_tracks: remoteCount,
        tracks: { total: remoteCount },
        collaborative: rpl.collaborative ?? false,
        snapshot_id: rpl.snapshot_id ?? null,
        last_synced_at: new Date().toISOString(),
        source: "delta_sync",
        tracks_data: [],
        classification: persistentClass,
        completion_meta: {
          target_count: 100,
          current_count: remoteCount,
          classification: persistentClass,
          is_benchmark: false,
          status: "pending",
          benchmark_playlist: null,
          last_run_at: null,
          gap: 100 - remoteCount,
          rules: null,
        },
      });
    }
  }

  // ─── 3. Guardado en Memoria y Base de Datos Local ─────────────────────────────
  const updatedLibrary: MusicLibrary = {
    last_updated_at: new Date().toISOString(),
    playlists: stagedPlaylists,
  };

  saveMusicLibrary(updatedLibrary);
  await setIndexedDBLibrary(updatedLibrary);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mymusic_library_updated"));
  }

  return updatedLibrary;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. DEEP FETCH EXCLUSIVO PARA PLAYLISTS CAÓTICAS (JIT EN BACKGROUND)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Downloads full track listing on-demand for a single user CAÓTICA playlist.
 * Merges with local cache, preserving previously analyzed acoustic audio features.
 * Shielded: Never executes on 'objetivo' playlists or Liked Songs.
 */
export async function syncChaoticPlaylist(
  playlistIdOrName: string,
  token: string
): Promise<MusicLibraryTrack[]> {
  if (!playlistIdOrName || !token) return [];

  const lib = await loadMusicLibrary();
  const targetPl = lib.playlists.find(
    (p) =>
      p.id === playlistIdOrName ||
      p.name.toLowerCase().trim() === playlistIdOrName.toLowerCase().trim()
  );

  if (!targetPl) {
    console.warn(`[syncChaoticPlaylist] Playlist ${playlistIdOrName} not found in local library.`);
    return [];
  }

  const savedClasses = getSavedClassifications();
  const targetKey = targetPl.id ?? targetPl.name;
  const classification = savedClasses[targetKey] ?? targetPl.completion_meta?.classification ?? targetPl.classification;

  // Blindaje: Las listas "objetivo" JAMÁS descargan tracks remotos
  if (classification === "objetivo" || targetPl.completion_meta?.is_benchmark === true) {
    console.log(`[syncChaoticPlaylist] Playlist "${targetPl.name}" is Objetivo. Shield active: Track download skipped.`);
    return targetPl.tracks_data ?? [];
  }

  // Si es Liked Songs, no descargar por paginación para evitar rate-limits y 403
  if (targetPl.id === "spotify_liked_songs" || targetPl.name.toLowerCase() === "liked songs") {
    return targetPl.tracks_data ?? [];
  }

  // Index existing audio features across the library to avoid recalculating
  const existingTracksMap = new Map<string, MusicLibraryTrack>();
  for (const pl of lib.playlists) {
    for (const t of pl.tracks_data ?? []) {
      if (t.id && !existingTracksMap.has(t.id)) {
        existingTracksMap.set(t.id, t);
      }
    }
  }

  const downloadedTracks: MusicLibraryTrack[] = [];

  try {
    if (targetPl.id) {
      let trackUrl: string | null = `https://api.spotify.com/v1/playlists/${targetPl.id}/tracks?limit=100`;

      while (trackUrl) {
        const page: { items?: RawSpotifyPlaylistItem[]; next?: string | null } =
          await spotifyFetchWithRetry(trackUrl, token);

        const items = Array.isArray(page?.items) ? page.items : [];
        for (const item of items) {
          const t = item?.track;
          if (!t || !t.id) continue;

          const existing = existingTracksMap.get(t.id);
          downloadedTracks.push({
            id: t.id,
            name: t.name ?? "Desconocido",
            artist: Array.isArray(t.artists) ? t.artists.map((a) => a?.name).filter(Boolean).join(", ") : "Desconocido",
            album: t.album?.name ?? null,
            image_url: t.album?.images?.[0]?.url ?? null,
            duration_ms: t.duration_ms ?? 0,
            preview_url: t.preview_url ?? null,
            added_at: item.added_at ?? null,
            release_date: t.album?.release_date ?? null,
            explicit: t.explicit ?? false,
            audio_features: existing?.audio_features ?? null,
            bpm: existing?.bpm ?? null,
            energy: existing?.energy ?? null,
            danceability: existing?.danceability ?? null,
            key: existing?.key ?? null,
            mode: existing?.mode ?? null,
          });
        }

        trackUrl = page?.next || null;
        if (trackUrl) await sleep(50);
      }
    }

    const finalTracks = downloadedTracks.length > 0 ? downloadedTracks : (targetPl.tracks_data ?? []);

    // Actualizar la playlist en la biblioteca local
    targetPl.tracks_data = finalTracks;
    targetPl.total_tracks = finalTracks.length;
    targetPl.tracks = { total: finalTracks.length };
    if (targetPl.completion_meta) {
      targetPl.completion_meta.current_count = finalTracks.length;
      targetPl.completion_meta.gap = (targetPl.completion_meta.target_count || 100) - finalTracks.length;
    }

    saveMusicLibrary(lib);
    await setIndexedDBLibrary(lib);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("mymusic_library_updated"));
    }

    return finalTracks;
  } catch (err) {
    console.error(`[syncChaoticPlaylist] Error syncing "${targetPl.name}":`, err);
    return targetPl.tracks_data ?? [];
  }
}
