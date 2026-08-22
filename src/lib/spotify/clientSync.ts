/**
 * Client-Side Real-Time Spotify Sync Engine (Exportify-style)
 * ============================================================
 * - Executes in the user's browser using active OAuth session.
 * - Uses lightweight, field-filtered requests to prevent HTTP 429 rate limit errors.
 * - Employs snapshot_id delta detection to skip unchanged playlists entirely.
 * - Preserves existing audio_features and acoustic metadata for previously enriched tracks.
 * - Prunes playlists from the library that no longer exist in the user's Spotify account.
 * - Persists the updated library directly to IndexedDB & localStorage.
 */

import type {
  MusicLibrary,
  MusicLibraryPlaylist,
  MusicLibraryTrack,
} from "@/types/library";
import { saveMusicLibrary, getSavedClassifications, savePlaylistClassification } from "@/lib/library/libraryStore";
import { setIndexedDBLibrary } from "@/lib/library/indexedDB";

export interface ClientSyncStats {
  playlistsTotal: number;
  playlistsScanned: number;
  playlistsUpdated: number;
  playlistsUnchanged: number;
  playlistsRemoved: number;
  tracksAdded: number;
  tracksRemoved: number;
  likedSongsTotal: number;
}

export type ClientSyncPhase =
  | "init"
  | "scanning_playlists"
  | "syncing_liked"
  | "syncing_playlists"
  | "pruning"
  | "saving"
  | "complete"
  | "error"
  | "rate_limited";

export interface ClientSyncProgress {
  phase: ClientSyncPhase;
  phaseLabel: string;
  currentPlaylistName?: string;
  progressPercent: number;
  stats: ClientSyncStats;
  message?: string;
  retryAfterSeconds?: number;
}

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
  tracks?: { total: number };
  owner?: { display_name?: string };
  collaborative?: boolean;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Robust fetch with exponential retry on 429
 */
async function spotifyFetchWithRetry<T>(
  url: string,
  token: string,
  onRateLimit?: (seconds: number) => void
): Promise<T> {
  let attempt = 0;
  while (attempt < 5) {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (res.status === 429) {
      const retryHeader = res.headers.get("Retry-After");
      const waitSeconds = Math.max(1, retryHeader ? parseInt(retryHeader, 10) : 5);
      console.warn(`[clientSync] Rate Limited (429). Waiting ${waitSeconds}s before retry.`);
      if (onRateLimit) onRateLimit(waitSeconds);
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

/**
 * Main Client-Side Sync Executor
 */
export async function syncSpotifyLibraryClient(
  token: string,
  currentLibrary: MusicLibrary,
  onProgress: (progress: ClientSyncProgress) => void
): Promise<MusicLibrary> {
  const stats: ClientSyncStats = {
    playlistsTotal: 0,
    playlistsScanned: 0,
    playlistsUpdated: 0,
    playlistsUnchanged: 0,
    playlistsRemoved: 0,
    tracksAdded: 0,
    tracksRemoved: 0,
    likedSongsTotal: 0,
  };

  const notify = (
    phase: ClientSyncPhase,
    phaseLabel: string,
    pct: number,
    extra?: Partial<ClientSyncProgress>
  ) => {
    onProgress({
      phase,
      phaseLabel,
      progressPercent: Math.min(100, Math.max(0, Math.round(pct))),
      stats: { ...stats },
      ...extra,
    });
  };

  notify("init", "Conectando con Spotify API...", 2);

  // 1. Build a fast lookup index of all existing local tracks to preserve audio_features
  const existingTracksMap = new Map<string, MusicLibraryTrack>();
  const localPlaylistsMap = new Map<string, MusicLibraryPlaylist>();

  for (const pl of currentLibrary.playlists) {
    if (pl.id) localPlaylistsMap.set(pl.id, pl);
    if (pl.name) localPlaylistsMap.set(pl.name.toLowerCase().trim(), pl);

    for (const t of pl.tracks_data ?? []) {
      if (t.id && !existingTracksMap.has(t.id)) {
        existingTracksMap.set(t.id, t);
      }
    }
  }

  // 2. Fetch all user playlists metadata
  notify("scanning_playlists", "Obteniendo lista de playlists de tu cuenta...", 5);
  const remotePlaylists: RawSpotifyPlaylistSummary[] = [];
  let playlistUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (playlistUrl) {
    const page: { items: RawSpotifyPlaylistSummary[]; next: string | null } =
      await spotifyFetchWithRetry(playlistUrl, token, (sec) => {
        notify("rate_limited", `Pausa de ${sec}s requerida por Spotify...`, 8, { retryAfterSeconds: sec });
      });

    for (const item of page.items ?? []) {
      if (item && item.id) {
        remotePlaylists.push(item);
      }
    }
    playlistUrl = page.next;
    if (playlistUrl) await sleep(80);
  }

  stats.playlistsTotal = remotePlaylists.length;
  notify("scanning_playlists", `Encontradas ${remotePlaylists.length} playlists remotas.`, 12);

  // 3. Sincronizar Liked Songs (Canciones que te gustan)
  notify("syncing_liked", "Sincronizando Canciones que te gustan...", 15);
  const likedTracks: MusicLibraryTrack[] = [];
  let likedUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
  let likedFetched = 0;
  let likedTotalRemote = 0;

  while (likedUrl) {
    const page: { items: { added_at?: string; track: RawSpotifyTrackItem }[]; total: number; next: string | null } =
      await spotifyFetchWithRetry(likedUrl, token, (sec) => {
        notify("rate_limited", `Pausa de ${sec}s requerida por Spotify...`, 20, { retryAfterSeconds: sec });
      });

    likedTotalRemote = page.total ?? likedTotalRemote;
    stats.likedSongsTotal = likedTotalRemote;

    for (const item of page.items ?? []) {
      const t = item?.track;
      if (!t || !t.id) continue;

      const artists = t.artists?.map((a) => a.name).filter(Boolean).join(", ") || "Artista Desconocido";
      const cover = t.album?.images?.[0]?.url || null;
      const existing = existingTracksMap.get(t.id);

      likedTracks.push({
        id: t.id,
        name: t.name ?? "Sin Título",
        artist: artists,
        album: t.album?.name ?? "",
        album_cover: cover,
        image_url: cover,
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

    likedFetched += page.items?.length ?? 0;
    likedUrl = page.next;

    const likedPct = likedTotalRemote > 0 ? (likedFetched / likedTotalRemote) * 20 : 15;
    notify(
      "syncing_liked",
      `Descargando Canciones que te gustan (${likedFetched} / ${likedTotalRemote})...`,
      15 + likedPct,
      { currentPlaylistName: "Liked Songs" }
    );

    if (likedUrl) await sleep(80);
  }

  // 4. Build Liked Songs playlist object
  const existingLiked = localPlaylistsMap.get("spotify_liked_songs") || localPlaylistsMap.get("liked songs");
  const likedPlaylist: MusicLibraryPlaylist = {
    id: "spotify_liked_songs",
    name: "Liked Songs",
    description: "Tus canciones favoritas sincronizadas en tiempo real con Spotify.",
    image_url:
      existingLiked?.image_url ||
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60",
    owner_name: "Tú",
    total_tracks: likedTracks.length,
    tracks: { total: likedTracks.length },
    collaborative: false,
    snapshot_id: `liked_${likedTracks.length}_${Date.now()}`,
    last_synced_at: new Date().toISOString(),
    source: "spotify_liked_songs",
    tracks_data: likedTracks,
    classification: existingLiked?.classification ?? "caotica",
    completion_meta: existingLiked?.completion_meta ?? {
      target_count: 100,
      current_count: likedTracks.length,
      classification: "caotica",
      is_benchmark: false,
      status: "pending",
      benchmark_playlist: null,
      last_run_at: null,
      gap: 100 - likedTracks.length,
      rules: null,
    },
  };

  // 5. Sincronizar todas las playlists del usuario (Delta por snapshot_id)
  const syncedSpotifyPlaylists: MusicLibraryPlaylist[] = [];
  const remotePlaylistIdsSet = new Set(remotePlaylists.map((p) => p.id));

  const totalPls = remotePlaylists.length;
  let plIdx = 0;

  for (const rpl of remotePlaylists) {
    plIdx++;
    stats.playlistsScanned++;
    const currentProgress = 35 + (plIdx / Math.max(1, totalPls)) * 55;

    const localPl = localPlaylistsMap.get(rpl.id) || localPlaylistsMap.get(rpl.name.toLowerCase().trim());
    const coverUrl = rpl.images?.[0]?.url || localPl?.image_url || null;

    // Check if snapshot_id is identical and tracks_data is present
    if (
      localPl &&
      localPl.snapshot_id === rpl.snapshot_id &&
      localPl.tracks_data &&
      localPl.tracks_data.length === (rpl.tracks?.total ?? localPl.tracks_data.length)
    ) {
      stats.playlistsUnchanged++;
      syncedSpotifyPlaylists.push({
        ...localPl,
        id: rpl.id,
        name: rpl.name,
        description: rpl.description ?? localPl.description,
        image_url: coverUrl,
        owner_name: rpl.owner?.display_name ?? localPl.owner_name ?? "Tú",
        total_tracks: localPl.tracks_data.length,
        tracks: { total: localPl.tracks_data.length },
        last_synced_at: new Date().toISOString(),
      });

      notify(
        "syncing_playlists",
        `[Sin cambios] ${rpl.name} (${localPl.tracks_data.length} tracks)`,
        currentProgress,
        { currentPlaylistName: rpl.name }
      );
      continue;
    }

    // Delta / Changed snapshot ➔ Fetch tracks for this playlist
    notify(
      "syncing_playlists",
      `[Actualizando] Descargando ${rpl.name}...`,
      currentProgress,
      { currentPlaylistName: rpl.name }
    );

    const playlistTracks: MusicLibraryTrack[] = [];
    let trackUrl: string | null = `https://api.spotify.com/v1/playlists/${rpl.id}/tracks?limit=100&fields=items(added_at,track(id,name,artists(name),album(name,images,release_date),duration_ms,preview_url,explicit)),next`;

    while (trackUrl) {
      const page: { items: RawSpotifyPlaylistItem[]; next: string | null } =
        await spotifyFetchWithRetry(trackUrl, token, (sec) => {
          notify("rate_limited", `Pausa de ${sec}s requerida por Spotify...`, currentProgress, { retryAfterSeconds: sec });
        });

      for (const item of page.items ?? []) {
        const t = item?.track;
        if (!t || !t.id) continue;

        const artists = t.artists?.map((a) => a.name).filter(Boolean).join(", ") || "Artista Desconocido";
        const cover = t.album?.images?.[0]?.url || null;
        const existing = existingTracksMap.get(t.id);

        playlistTracks.push({
          id: t.id,
          name: t.name ?? "Sin Título",
          artist: artists,
          album: t.album?.name ?? "",
          album_cover: cover,
          image_url: cover,
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

      trackUrl = page.next;
      if (trackUrl) await sleep(80);
    }

    stats.playlistsUpdated++;
    const oldTrackCount = localPl?.tracks_data?.length ?? 0;
    if (playlistTracks.length > oldTrackCount) {
      stats.tracksAdded += playlistTracks.length - oldTrackCount;
    } else if (playlistTracks.length < oldTrackCount) {
      stats.tracksRemoved += oldTrackCount - playlistTracks.length;
    }

    syncedSpotifyPlaylists.push({
      id: rpl.id,
      name: rpl.name,
      description: rpl.description ?? localPl?.description ?? null,
      image_url: coverUrl,
      owner_name: rpl.owner?.display_name ?? localPl?.owner_name ?? "Tú",
      total_tracks: playlistTracks.length,
      tracks: { total: playlistTracks.length },
      collaborative: rpl.collaborative ?? false,
      snapshot_id: rpl.snapshot_id ?? `snap_${Date.now()}`,
      last_synced_at: new Date().toISOString(),
      source: "delta_sync",
      tracks_data: playlistTracks,
      classification: localPl?.classification ?? "caotica",
      completion_meta: localPl?.completion_meta ?? {
        target_count: 100,
        current_count: playlistTracks.length,
        classification: localPl?.classification ?? "caotica",
        is_benchmark: false,
        status: "pending",
        benchmark_playlist: null,
        last_run_at: null,
        gap: 100 - playlistTracks.length,
        rules: null,
      },
    });
  }

  // 6. Pruning: Detect and remove local Spotify playlists that no longer exist remotely
  notify("pruning", "Depurando playlists eliminadas...", 92);
  const preservedNonSpotifyPlaylists: MusicLibraryPlaylist[] = [];

  for (const pl of currentLibrary.playlists) {
    if (pl.id === "spotify_liked_songs" || pl.name.toLowerCase() === "liked songs") {
      continue; // Liked songs is handled separately
    }

    const isSpotifyPlaylist = Boolean(pl.id && !pl.id.startsWith("pl_") && pl.source !== "csv_import");

    if (isSpotifyPlaylist) {
      if (!remotePlaylistIdsSet.has(pl.id!)) {
        stats.playlistsRemoved++;
        console.log(`[clientSync] Eliminando playlist obsoleta: ${pl.name} (${pl.id})`);
      }
    } else {
      // Local custom / CSV playlist without Spotify ID is preserved
      preservedNonSpotifyPlaylists.push(pl);
    }
  }

  // 7. Combine all updated playlists
  notify("saving", "Guardando y optimizando catálogo en memoria e IndexedDB...", 96);
  const finalPlaylists = [likedPlaylist, ...syncedSpotifyPlaylists, ...preservedNonSpotifyPlaylists];

  const updatedLibrary: MusicLibrary = {
    playlists: finalPlaylists,
    last_updated_at: new Date().toISOString(),
  };

  // 8. Save directly to IndexedDB (supports unlimited MBs) & localStorage
  await setIndexedDBLibrary(updatedLibrary);
  saveMusicLibrary(updatedLibrary);

  // Sync saved classifications map with any remaining playlists
  const savedClassifications = getSavedClassifications();
  for (const pl of finalPlaylists) {
    const key = pl.id ?? pl.name;
    if (pl.classification) {
      savedClassifications[key] = pl.classification;
      savePlaylistClassification(key, pl.classification);
    }
  }

  notify("complete", "¡Sincronización completada con éxito!", 100, {
    message: `Catálogo 100% actualizado: ${stats.likedSongsTotal} canciones en Liked Songs, ${stats.playlistsScanned} playlists procesadas (${stats.playlistsRemoved} eliminadas).`,
  });

  return updatedLibrary;
}
