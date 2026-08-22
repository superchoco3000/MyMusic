/**
 * Client-Side Real-Time Spotify Sync Engine (Exportify-style 3-Phase Comparator)
 * ==============================================================================
 * Phase 1: Superficial Comparison (Fast fetch of metadata & track counts).
 * Phase 2: Instant UI Update (Prunes removed playlists, adds new ones, updates counts).
 * Phase 3: Exhaustive Real-Time Track Download for all playlists and Liked Songs.
 */

import type {
  MusicLibrary,
  MusicLibraryPlaylist,
  MusicLibraryTrack,
} from "@/types/library";
import { saveMusicLibrary, getSavedClassifications } from "@/lib/library/libraryStore";
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
  | "updating_ui"
  | "syncing_liked"
  | "syncing_playlists"
  | "pruning"
  | "saving"
  | "complete"
  | "error"
  | "forbidden"
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

    if (res.status === 403) {
      throw new Error("ERROR_403_FORBIDDEN: Permisos denegados. Verifica los scopes de tu cuenta o el panel de Spotify Developer.");
    }

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
 * Main Client-Side Sync Executor (3-Step Version Comparator)
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

  notify("init", "Conectando con Spotify API...", 5);

  // Read saved classifications from localStorage to ensure RPG state is never lost
  const savedClassifications = getSavedClassifications();

  // 1. Index existing local tracks to preserve acoustic audio_features
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

  // ─── PASO 1: Comparación Superficial (Fetch solo metadatos y totales) ───────────
  notify("scanning_playlists", "Paso 1/3: Escaneo superficial de catálogo...", 10);

  // 1a. Obtener total real de Liked Songs con 1 sola petición ligera (limit=1)
  let remoteLikedTotal = 0;
  try {
    const likedHead: { total?: number } = await spotifyFetchWithRetry(
      "https://api.spotify.com/v1/me/tracks?limit=1",
      token
    );
    remoteLikedTotal = typeof likedHead?.total === "number" ? likedHead.total : 0;
    stats.likedSongsTotal = remoteLikedTotal;
  } catch (err) {
    console.warn("[clientSync] Error al consultar total de Liked Songs:", err);
  }

  // 1b. Obtener lista completa de playlists del usuario (solo metadatos)
  const remotePlaylists: RawSpotifyPlaylistSummary[] = [];
  let playlistUrl: string | null = "https://api.spotify.com/v1/me/playlists?limit=50";

  while (playlistUrl) {
    const page: { items?: RawSpotifyPlaylistSummary[]; next?: string | null } =
      await spotifyFetchWithRetry(playlistUrl, token, (sec) => {
        notify("rate_limited", `Pausa de ${sec}s requerida por Spotify...`, 15, { retryAfterSeconds: sec });
      });

    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      if (item && item.id) {
        remotePlaylists.push(item);
      }
    }
    playlistUrl = page?.next || null;
    if (playlistUrl) await sleep(60);
  }

  stats.playlistsTotal = remotePlaylists.length + (remoteLikedTotal > 0 ? 1 : 0);

  // ─── PASO 2: Actualización Rápida de UI (Fase 1) ────────────────────────────────
  notify("updating_ui", "Paso 2/3: Comparando versiones y actualizando contadores...", 25);

  const remotePlaylistIdsSet = new Set(remotePlaylists.map((p) => p.id));
  const stagedPlaylists: MusicLibraryPlaylist[] = [];

  // 2a. Comparar y preparar Liked Songs
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

  // 2b. Comparar playlists del usuario (eliminar obsoletas, añadir nuevas, actualizar totales)
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
        source: "spotify_sync",
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

  // Contar cuántas playlists locales fueron eliminadas (depuradas)
  for (const localPl of currentLibrary.playlists) {
    if (localPl.id === "spotify_liked_songs" || localPl.name.toLowerCase() === "liked songs") continue;
    if (localPl.id && !remotePlaylistIdsSet.has(localPl.id)) {
      stats.playlistsRemoved++;
    }
  }

  // Guardado provisional rápido para que la UI refleje el nuevo conteo de inmediato
  const fastLib: MusicLibrary = {
    last_updated_at: new Date().toISOString(),
    playlists: stagedPlaylists,
  };
  saveMusicLibrary(fastLib);
  await setIndexedDBLibrary(fastLib);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mymusic_library_updated"));
  }

  // ─── PASO 3: Descarga Real y Exhaustiva de Canciones ─────────────────────────────
  notify("syncing_playlists", "Paso 3/3: Descargando canciones reales de todas las listas...", 35);

  const finalizedPlaylists: MusicLibraryPlaylist[] = [];

  // 3a. Descarga real y exhaustiva de Liked Songs
  notify("syncing_liked", `Descargando Liked Songs (${remoteLikedTotal > 0 ? remoteLikedTotal : "..."} canciones)...`, 40, {
    currentPlaylistName: "Liked Songs",
  });

  const likedTracks: MusicLibraryTrack[] = [];
  let likedUrl: string | null = "https://api.spotify.com/v1/me/tracks?limit=50";
  let fetchedLiked = 0;

  while (likedUrl) {
    const page: { items?: RawSpotifyPlaylistItem[]; next?: string | null; total?: number } =
      await spotifyFetchWithRetry(likedUrl, token, (sec) => {
        notify("rate_limited", `Pausa de ${sec}s en Liked Songs...`, 45, { retryAfterSeconds: sec });
      });

    if (typeof page?.total === "number" && page.total > 0) {
      remoteLikedTotal = page.total;
      stats.likedSongsTotal = page.total;
    }

    const items = Array.isArray(page?.items) ? page.items : [];
    for (const item of items) {
      const t = item?.track;
      if (!t || !t.id) continue;

      const existing = existingTracksMap.get(t.id);
      likedTracks.push({
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

    fetchedLiked += items.length;
    const pct = remoteLikedTotal > 0 ? (fetchedLiked / remoteLikedTotal) * 20 : 15;
    notify(
      "syncing_liked",
      `Descargando Liked Songs (${fetchedLiked}/${remoteLikedTotal || fetchedLiked})...`,
      40 + pct,
      { currentPlaylistName: "Liked Songs" }
    );

    likedUrl = page?.next || null;
    if (likedUrl) await sleep(60);
  }

  const finalLikedTracks = likedTracks.length > 0 ? likedTracks : (existingLiked?.tracks_data ?? []);
  stagedLiked.tracks_data = finalLikedTracks;
  stagedLiked.total_tracks = finalLikedTracks.length;
  stagedLiked.tracks = { total: finalLikedTracks.length };
  stats.playlistsUpdated++;
  stats.tracksAdded += finalLikedTracks.length;
  finalizedPlaylists.push(stagedLiked);

  // 3b. Descarga real y exhaustiva de todas las playlists del usuario
  let currentPlIdx = 0;
  const totalToExamine = remotePlaylists.length;

  for (const rpl of remotePlaylists) {
    currentPlIdx++;
    stats.playlistsScanned++;
    const progressPct = 60 + (currentPlIdx / Math.max(1, totalToExamine)) * 35;

    const localPl = localPlaylistsMap.get(rpl.id) || localPlaylistsMap.get(rpl.name.toLowerCase().trim());
    const coverUrl = rpl.images?.[0]?.url || localPl?.image_url || null;
    const persistentClass = savedClassifications[rpl.id] || savedClassifications[rpl.name] || localPl?.classification || null;

    notify("syncing_playlists", `Descargando canciones de "${rpl.name}"...`, progressPct, {
      currentPlaylistName: rpl.name,
    });

    const downloadedTracks: MusicLibraryTrack[] = [];
    let trackUrl: string | null = `https://api.spotify.com/v1/playlists/${rpl.id}/tracks?limit=100`;

    while (trackUrl) {
      const page: { items?: RawSpotifyPlaylistItem[]; next?: string | null } =
        await spotifyFetchWithRetry(trackUrl, token, (sec) => {
          notify("rate_limited", `Pausa de ${sec}s en "${rpl.name}"...`, progressPct, { retryAfterSeconds: sec });
        });

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

    const finalTracks = downloadedTracks.length > 0 ? downloadedTracks : (localPl?.tracks_data ?? []);
    const finalCount = finalTracks.length;
    stats.tracksAdded += finalTracks.length;
    stats.playlistsUpdated++;

    finalizedPlaylists.push({
      id: rpl.id,
      name: rpl.name,
      description: rpl.description || (localPl?.description ?? `Playlist importada de Spotify (${finalCount} canciones).`),
      image_url: coverUrl,
      owner_name: rpl.owner?.display_name || (localPl?.owner_name ?? "Tú"),
      total_tracks: finalCount,
      tracks: { total: finalCount },
      collaborative: rpl.collaborative ?? (localPl?.collaborative ?? false),
      snapshot_id: rpl.snapshot_id ?? null,
      last_synced_at: new Date().toISOString(),
      source: "spotify_sync",
      tracks_data: finalTracks,
      classification: persistentClass,
      completion_meta: localPl?.completion_meta ?? {
        target_count: 100,
        current_count: finalCount,
        classification: persistentClass,
        is_benchmark: false,
        status: "pending",
        benchmark_playlist: null,
        last_run_at: null,
        gap: 100 - finalCount,
        rules: null,
      },
    });
  }

  // Guardado definitivo en IndexedDB y localStorage
  notify("saving", "Guardando catálogo completo en base de datos local...", 96);

  const updatedLibrary: MusicLibrary = {
    last_updated_at: new Date().toISOString(),
    playlists: finalizedPlaylists,
  };

  saveMusicLibrary(updatedLibrary);
  await setIndexedDBLibrary(updatedLibrary);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("mymusic_library_updated"));
  }

  notify("complete", "¡Sincronización completa finalizada con éxito!", 100);

  return updatedLibrary;
}
