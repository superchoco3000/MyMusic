"use client";

import type {
  MusicLibrary,
  MusicLibraryPlaylist,
  MusicLibraryTrack,
  CurationRules,
} from "@/types/library";

const STORAGE_KEY = "mymusic_local_library_v1";

// Internal flag written into localStorage when we store a slim (no tracks_data) payload.
// loadMusicLibrary reads this to know it must still fetch the static JSON for full data.
const SLIM_FLAG = "_slim";

// ─── Track Transfer Diffs Persistence ─────────────────────────────────────────

export interface PlaylistTrackDiff {
  added: MusicLibraryTrack[];
  removedIds: string[];
}

const TRACK_DIFFS_STORAGE_KEY = "mymusic_playlist_track_diffs_v1";

export function getSavedTrackDiffs(): Record<string, PlaylistTrackDiff> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(TRACK_DIFFS_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveTrackDiffs(diffs: Record<string, PlaylistTrackDiff>): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(TRACK_DIFFS_STORAGE_KEY, JSON.stringify(diffs));
  } catch (e) {
    console.error("[libraryStore] Error saving track diffs:", e);
  }
}

export function applyTrackDiffsToPlaylist(
  pl: MusicLibraryPlaylist,
  diffs: Record<string, PlaylistTrackDiff>
): MusicLibraryPlaylist {
  const key = pl.id ?? pl.name;
  const diff = diffs[key] ?? diffs[pl.name] ?? (pl.id ? diffs[pl.id] : undefined);
  if (!diff) return pl;

  let tracks = [...(pl.tracks_data ?? [])];

  // 1. Filter out removed tracks
  if (diff.removedIds?.length) {
    const removedSet = new Set(diff.removedIds.map((s) => s.toLowerCase()));
    tracks = tracks.filter((t) => {
      const idMatch = t.id && removedSet.has(t.id.toLowerCase());
      const nameMatch = t.name && removedSet.has(t.name.toLowerCase());
      const comboMatch = t.name && t.artist && removedSet.has(`${t.name}:::${t.artist}`.toLowerCase());
      return !idMatch && !nameMatch && !comboMatch;
    });
  }

  // 2. Append added tracks (avoid duplicates)
  if (diff.added?.length) {
    for (const add of diff.added) {
      const alreadyExists = tracks.some(
        (t) =>
          (add.id && t.id === add.id) ||
          (t.name.toLowerCase() === add.name.toLowerCase() &&
            (t.artist || "").toLowerCase() === (add.artist || "").toLowerCase())
      );
      if (!alreadyExists) {
        tracks.push(add);
      }
    }
  }

  pl.tracks_data = tracks;
  pl.total_tracks = tracks.length;
  if (pl.completion_meta) {
    pl.completion_meta.current_count = tracks.length;
    pl.completion_meta.gap = pl.completion_meta.target_count - tracks.length;
  }

  return pl;
}

/**
 * Loads the local persistent music library.
 */
export async function loadMusicLibrary(): Promise<MusicLibrary> {
  // ── Step 1: Always fetch the static source of truth ──────────────────────
  let staticData: MusicLibrary | null = null;
  try {
    const res = await fetch(`/data/music_library.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      staticData = (await res.json()) as MusicLibrary;
    }
  } catch (e) {
    console.warn("[libraryStore] Failed to fetch /data/music_library.json:", e);
  }

  // ── Step 2: Read localStorage metadata overlay (optional, non-blocking) ──
  let cachedMeta: MusicLibraryPlaylist[] = [];
  if (typeof window !== "undefined") {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as MusicLibrary & { [key: string]: unknown };
        if (parsed?.playlists?.length) {
          cachedMeta = parsed.playlists as MusicLibraryPlaylist[];
        }
      }
    } catch (e) {
      console.warn("[libraryStore] Failed to read from localStorage:", e);
    }
  }

  // ── Step 3: Merge — static is the list of record, localStorage adds metadata & diffs ─
  if (staticData) {
    const diffs = getSavedTrackDiffs();

    if (cachedMeta.length > 0) {
      // Build lookup maps (by id AND by name) to handle CSV-imported playlists with no id.
      const metaById   = new Map<string, MusicLibraryPlaylist>();
      const metaByName = new Map<string, MusicLibraryPlaylist>();
      for (const p of cachedMeta) {
        if (p.id)   metaById.set(p.id, p);
        if (p.name) metaByName.set(p.name, p);
      }

      staticData.playlists = staticData.playlists.map((pl) => {
        // id lookup first, then name fallback (for playlists imported from CSV without an id)
        const meta = (pl.id ? metaById.get(pl.id) : undefined) ?? metaByName.get(pl.name);
        if (!meta) return applyTrackDiffsToPlaylist(pl, diffs);

        const merged: MusicLibraryPlaylist = {
          ...pl,
          ...(meta.name && meta.name !== pl.name ? { name: meta.name } : {}),
          ...(meta.classification               ? { classification: meta.classification } : {}),
          ...(meta.completion_meta              ? { completion_meta: meta.completion_meta } : {}),
        };
        return applyTrackDiffsToPlaylist(merged, diffs);
      });
    } else {
      staticData.playlists = staticData.playlists.map((pl) => applyTrackDiffsToPlaylist(pl, diffs));
    }
    return staticData;
  }

  // ── Fallback: static fetch failed — serve slim cache (no tracks_data) ─────
  if (cachedMeta.length > 0) {
    console.warn("[libraryStore] Static JSON unavailable — falling back to localStorage cache.");
    const diffs = getSavedTrackDiffs();
    const playlists = cachedMeta.map((pl) => applyTrackDiffsToPlaylist(pl, diffs));
    return { playlists, last_updated_at: new Date().toISOString() };
  }

  return { playlists: [], last_updated_at: new Date().toISOString() };
}


/**
 * Saves a music library state to localStorage and dispatches a custom window event
 * so all active components re-render immediately.
 *
 * Safety valve: if the full JSON exceeds 4 MB (common localStorage limit is 5 MB),
 * we always store a slim version — playlists metadata only (no tracks_data arrays).
 * The slim payload is flagged with `_slim: true` so loadMusicLibrary knows to
 * re-hydrate tracks_data from the static JSON on next load.
 *
 * For libraries under 4 MB we still prefer the slim strategy to keep localStorage
 * writes fast and avoid quota issues as the library grows.
 */
export function saveMusicLibrary(library: MusicLibrary): void {
  if (typeof window === "undefined") return;
  library.last_updated_at = new Date().toISOString();

  const fullJson = JSON.stringify(library);
  const FOUR_MB = 4 * 1024 * 1024;

  // Always use slim storage when the library exceeds 4 MB.
  // For smaller libraries also prefer slim to keep localStorage lean and
  // avoid silent quota failures as the collection grows.
  const useSlim = fullJson.length > FOUR_MB;

  let toStore: string;
  if (useSlim) {
    // Slim payload: strip tracks_data, add self-describing flag.
    const slim = {
      ...library,
      [SLIM_FLAG]: true,
      playlists: library.playlists.map(({ tracks_data: _omit, ...pl }) => pl as MusicLibraryPlaylist),
    };
    toStore = JSON.stringify(slim);
    console.info(
      `[libraryStore] Library too large for localStorage (${(fullJson.length / 1024 / 1024).toFixed(1)} MB). ` +
      `Storing slim metadata (${(toStore.length / 1024 / 1024).toFixed(1)} MB). tracks_data served from static JSON.`
    );
  } else {
    toStore = fullJson;
  }

  try {
    localStorage.setItem(STORAGE_KEY, toStore);
    window.dispatchEvent(new Event("mymusic_library_updated"));
  } catch (e) {
    console.error("[libraryStore] Error saving library to localStorage:", e);
    // If write failed (quota), clear stale cache so next load goes to static JSON.
    try { localStorage.removeItem(STORAGE_KEY); } catch (_) { /* ignore */ }
  }
}

/**
 * Decoupled static file reader: fetches updated `/data/music_library.json`
 * directly from browser bypassing API payloads, updates localStorage, and notifies components.
 */
export async function refreshLibraryFromStatic(): Promise<MusicLibrary | null> {
  if (typeof window === "undefined") return null;
  try {
    const res = await fetch(`/data/music_library.json?t=${Date.now()}`, { cache: "no-store" });
    if (res.ok) {
      const data: MusicLibrary = await res.json();
      // Merge any user metadata sitting in localStorage before saving.
      // This prevents a hard reset of classifications when the static file refreshes.
      try {
        const cached = localStorage.getItem(STORAGE_KEY);
        if (cached) {
          const meta = JSON.parse(cached) as MusicLibrary & { [key: string]: unknown };
          if (meta?.playlists?.length) {
            const metaMap = new Map(meta.playlists.map((p: MusicLibraryPlaylist) => [p.id ?? p.name, p]));
            data.playlists = data.playlists.map((pl) => {
              const m = metaMap.get(pl.id ?? pl.name);
              if (!m) return pl;
              return {
                ...pl,
                name: m.name ?? pl.name,
                classification: m.classification ?? pl.classification,
                completion_meta: m.completion_meta ?? pl.completion_meta,
              };
            });
          }
        }
      } catch (_) { /* non-critical */ }
      saveMusicLibrary(data);
      return data;
    }
  } catch (e) {
    console.warn("[libraryStore] Failed to refresh library from static JSON:", e);
  }
  return null;
}

/**
 * Helper to import a CSV string directly from the browser UI (Sync Button).
 */
export function importCSVToLibrary(currentLibrary: MusicLibrary, csvText: string, filename: string): MusicLibrary {
  const lines = csvText.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return currentLibrary;

  const playlistName = filename.replace(/\.csv$/i, "").replace(/[_-]/g, " ").trim() || "Playlist Importada";

  const tracks: MusicLibraryTrack[] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g) || lines[i].split(",");
    const cleanedRow = row.map((cell) => cell.replace(/^"|"$/g, "").trim());

    const trackName = cleanedRow[0] || `Track ${i}`;
    const artistName = cleanedRow[1] || "Artista Desconocido";
    const albumName = cleanedRow[2] || "Álbum";

    tracks.push({
      id: `tr_${Date.now()}_${i}`,
      name: trackName,
      artist: artistName,
      album: albumName,
      duration_ms: 180000,
    });
  }

  const newPlaylist: MusicLibraryPlaylist = {
    id: `pl_${Date.now()}`,
    name: playlistName,
    description: `Importada mediante Sincronizador UI (${tracks.length} canciones).`,
    image_url: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=500&auto=format&fit=crop&q=60",
    owner_name: "chocow",
    total_tracks: tracks.length,
    collaborative: false,
    last_synced_at: new Date().toISOString(),
    tracks_data: tracks,
  };

  const updatedPlaylists = [newPlaylist, ...currentLibrary.playlists.filter((p) => p.id !== newPlaylist.id)];
  const updatedLibrary: MusicLibrary = {
    playlists: updatedPlaylists,
    last_updated_at: new Date().toISOString(),
  };

  saveMusicLibrary(updatedLibrary);
  return updatedLibrary;
}

// ─── Classification & Curation Rules persistence helpers ─────────────────────

export type PlaylistClassification = "caotica" | "objetivo" | "no_personal";

const CLASSIFICATION_STORAGE_KEY = "mymusic_playlist_classifications_v1";
const RULES_STORAGE_KEY = "mymusic_playlist_rules_v1";

export function getSavedClassifications(): Record<string, PlaylistClassification> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CLASSIFICATION_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function getSavedCurationRules(): Record<string, CurationRules> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(RULES_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function clearAllPlaylistClassifications(): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(CLASSIFICATION_STORAGE_KEY);
    localStorage.removeItem(RULES_STORAGE_KEY);
    localStorage.removeItem(TRACK_DIFFS_STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    window.dispatchEvent(new Event("mymusic_classification_updated"));
    window.dispatchEvent(new Event("mymusic_library_updated"));
  } catch (e) {
    console.error("[libraryStore] Error clearing classifications:", e);
  }
}

export async function savePlaylistClassification(playlistKey: string, classification: PlaylistClassification): Promise<void> {
  if (typeof window === "undefined") return;
  try {
    const current = getSavedClassifications();
    current[playlistKey] = classification;
    localStorage.setItem(CLASSIFICATION_STORAGE_KEY, JSON.stringify(current));

    const lib = await loadMusicLibrary();
    const targetPl = lib.playlists.find(
      (p) => p.id === playlistKey || p.name === playlistKey || encodeURIComponent(p.name) === playlistKey
    );

    if (targetPl) {
      targetPl.classification = classification;
      const count = targetPl.tracks_data?.length ?? targetPl.total_tracks ?? 0;
      if (!targetPl.completion_meta) {
        targetPl.completion_meta = {
          target_count: 100,
          current_count: count,
          benchmark_playlist: null,
          is_benchmark: classification === "objetivo",
          status: "pending",
          last_run_at: null,
          gap: 100 - count,
          classification,
          rules: { era: "all", bpm_tolerance: "flexible", vibes: [] },
        };
      } else {
        targetPl.completion_meta.classification = classification;
      }
      saveMusicLibrary(lib);
    }

    window.dispatchEvent(new Event("mymusic_classification_updated"));
    window.dispatchEvent(new Event("mymusic_library_updated"));
  } catch (e) {
    console.error("[libraryStore] Error saving classification:", e);
  }
}

export async function savePlaylistCurationConfig(
  playlistKey: string,
  classification: PlaylistClassification,
  rules?: CurationRules | null,
  newName?: string | null
): Promise<string> {
  if (typeof window === "undefined") return playlistKey;
  try {
    const finalKey = newName && newName.trim() ? newName.trim() : playlistKey;

    // 1. Save classification under both keys
    const currentClass = getSavedClassifications();
    currentClass[playlistKey] = classification;
    if (finalKey !== playlistKey) {
      currentClass[finalKey] = classification;
    }
    localStorage.setItem(CLASSIFICATION_STORAGE_KEY, JSON.stringify(currentClass));

    // 2. Save rules under both keys
    if (rules) {
      const currentRules = getSavedCurationRules();
      currentRules[playlistKey] = rules;
      if (finalKey !== playlistKey) {
        currentRules[finalKey] = rules;
      }
      localStorage.setItem(RULES_STORAGE_KEY, JSON.stringify(currentRules));
    }

    // 3. Update in local library if present
    const lib = await loadMusicLibrary();
    const targetPl = lib.playlists.find(
      (p) => p.id === playlistKey || p.name === playlistKey || encodeURIComponent(p.name) === playlistKey
    );

    if (targetPl) {
      if (newName && newName.trim() && newName.trim() !== targetPl.name) {
        targetPl.name = newName.trim();
      }
      targetPl.classification = classification;
      if (!targetPl.completion_meta) {
        const count = targetPl.tracks_data?.length ?? targetPl.total_tracks ?? 0;
        targetPl.completion_meta = {
          target_count: 100,
          current_count: count,
          benchmark_playlist: null,
          is_benchmark: classification === "objetivo",
          status: "pending",
          last_run_at: null,
          gap: 100 - count,
        };
      }
      targetPl.completion_meta.classification = classification;
      if (rules) {
        targetPl.completion_meta.rules = rules;
      }
      saveMusicLibrary(lib);
    }

    window.dispatchEvent(new Event("mymusic_classification_updated"));
    window.dispatchEvent(new Event("mymusic_library_updated"));

    return targetPl?.id ?? (targetPl ? encodeURIComponent(targetPl.name) : encodeURIComponent(finalKey));
  } catch (e) {
    console.error("[libraryStore] Error saving curation config:", e);
    return playlistKey;
  }
}

// ─── Track Transfer Engine (Chaotic Source -> Target Objective) ──────────────

export interface TransferTrackResult {
  success: boolean;
  error?: string;
  trackName?: string;
  sourceName?: string;
  targetName?: string;
  sourceRemainingCount?: number;
  targetNewCount?: number;
}

/**
 * Returns all playlists that are designated as "Objetivo" (Target/Benchmark).
 * Excludes the optional sourcePlaylistId.
 */
export async function getTargetPlaylists(excludeSourceIdOrName?: string): Promise<MusicLibraryPlaylist[]> {
  const lib = await loadMusicLibrary();
  const savedClasses = getSavedClassifications();
  const excludeNorm = excludeSourceIdOrName ? excludeSourceIdOrName.toLowerCase() : null;

  return lib.playlists.filter((p) => {
    const key = p.id ?? p.name;
    const isExcluded =
      excludeNorm != null &&
      (p.id?.toLowerCase() === excludeNorm ||
        p.name.toLowerCase() === excludeNorm ||
        encodeURIComponent(p.name).toLowerCase() === excludeNorm);

    if (isExcluded) return false;

    const classification = savedClasses[key] ?? p.completion_meta?.classification ?? p.classification;
    const isBenchmark = p.completion_meta?.is_benchmark === true;

    return classification === "objetivo" || isBenchmark;
  });
}

/**
 * Moves a track from a Chaotic source playlist to an Objetivo (target) playlist.
 * Updates both playlists in local storage and dispatches change events.
 */
export async function moveTrackToTarget(
  sourceIdOrName: string,
  trackIdOrTrack: string | MusicLibraryTrack,
  targetIdOrName: string
): Promise<TransferTrackResult> {
  try {
    let lib = await loadMusicLibrary();
    const sourceNorm = decodeURIComponent(sourceIdOrName).toLowerCase();
    const targetNorm = decodeURIComponent(targetIdOrName).toLowerCase();

    // 1. Locate Source Playlist
    let sourcePl = lib.playlists.find(
      (p) =>
        p.id === sourceIdOrName ||
        (p.id != null && p.id.toLowerCase() === sourceNorm) ||
        p.name.toLowerCase() === sourceNorm ||
        encodeURIComponent(p.name).toLowerCase() === sourceNorm
    );

    // 2. Locate Target Playlist
    let targetPl = lib.playlists.find(
      (p) =>
        p.id === targetIdOrName ||
        (p.id != null && p.id.toLowerCase() === targetNorm) ||
        p.name.toLowerCase() === targetNorm ||
        encodeURIComponent(p.name).toLowerCase() === targetNorm
    );

    // If source or target tracks_data is empty in cache, load static full data
    if (
      (sourcePl && (!sourcePl.tracks_data || sourcePl.tracks_data.length === 0)) ||
      (targetPl && (!targetPl.tracks_data || targetPl.tracks_data.length === 0))
    ) {
      const fresh = await refreshLibraryFromStatic();
      if (fresh) {
        lib = fresh;
        sourcePl = lib.playlists.find(
          (p) =>
            p.id === sourceIdOrName ||
            (p.id != null && p.id.toLowerCase() === sourceNorm) ||
            p.name.toLowerCase() === sourceNorm ||
            encodeURIComponent(p.name).toLowerCase() === sourceNorm
        );
        targetPl = lib.playlists.find(
          (p) =>
            p.id === targetIdOrName ||
            (p.id != null && p.id.toLowerCase() === targetNorm) ||
            p.name.toLowerCase() === targetNorm ||
            encodeURIComponent(p.name).toLowerCase() === targetNorm
        );
      }
    }

    if (!sourcePl) {
      return { success: false, error: "Playlist de origen no encontrada." };
    }
    if (!targetPl) {
      return { success: false, error: "Playlist objetivo de destino no encontrada." };
    }

    // Verify Target is indeed 'objetivo'
    const savedClasses = getSavedClassifications();
    const targetKey = targetPl.id ?? targetPl.name;
    const targetClass = savedClasses[targetKey] ?? targetPl.completion_meta?.classification ?? targetPl.classification;
    const isTargetBenchmark = targetPl.completion_meta?.is_benchmark === true;

    if (targetClass !== "objetivo" && !isTargetBenchmark) {
      return { success: false, error: "La playlist seleccionada no está catalogada como 'Objetivo'." };
    }

    sourcePl.tracks_data = sourcePl.tracks_data ?? [];
    targetPl.tracks_data = targetPl.tracks_data ?? [];

    // 3. Find track to move
    let trackToMove: MusicLibraryTrack | null = null;
    let trackIndex = -1;

    if (typeof trackIdOrTrack === "string") {
      trackIndex = sourcePl.tracks_data.findIndex(
        (t) => t.id === trackIdOrTrack || t.name === trackIdOrTrack
      );
      if (trackIndex !== -1) {
        trackToMove = sourcePl.tracks_data[trackIndex];
      }
    } else {
      trackToMove = trackIdOrTrack;
      trackIndex = sourcePl.tracks_data.findIndex(
        (t) =>
          (trackToMove!.id && t.id === trackToMove!.id) ||
          (t.name === trackToMove!.name && t.artist === trackToMove!.artist)
      );
    }

    if (!trackToMove) {
      return { success: false, error: "Canción no encontrada en la playlist de origen." };
    }

    // 4. Remove from Source
    if (trackIndex !== -1) {
      sourcePl.tracks_data.splice(trackIndex, 1);
    }
    sourcePl.total_tracks = sourcePl.tracks_data.length;
    if (sourcePl.completion_meta) {
      sourcePl.completion_meta.current_count = sourcePl.tracks_data.length;
      sourcePl.completion_meta.gap = sourcePl.completion_meta.target_count - sourcePl.tracks_data.length;
    }

    // 5. Add to Target (avoid exact duplication)
    const existsInTarget = targetPl.tracks_data.some(
      (t) =>
        (trackToMove!.id && t.id === trackToMove!.id) ||
        (t.name === trackToMove!.name && t.artist === trackToMove!.artist)
    );

    if (!existsInTarget) {
      targetPl.tracks_data.push(trackToMove);
    }

    targetPl.total_tracks = targetPl.tracks_data.length;
    if (targetPl.completion_meta) {
      targetPl.completion_meta.current_count = targetPl.tracks_data.length;
      targetPl.completion_meta.gap = targetPl.completion_meta.target_count - targetPl.tracks_data.length;
    }

    // 6. Record Persistent Track Diff in Local Storage
    const diffs = getSavedTrackDiffs();
    const sKey = sourcePl.id ?? sourcePl.name;
    const tKey = targetPl.id ?? targetPl.name;

    if (!diffs[sKey]) diffs[sKey] = { added: [], removedIds: [] };
    if (!diffs[tKey]) diffs[tKey] = { added: [], removedIds: [] };

    // Mark removed from source
    const trackIdVal = trackToMove.id ?? trackToMove.name;
    if (!diffs[sKey].removedIds.includes(trackIdVal)) {
      diffs[sKey].removedIds.push(trackIdVal);
    }
    if (trackToMove.name && trackToMove.artist) {
      const combo = `${trackToMove.name}:::${trackToMove.artist}`;
      if (!diffs[sKey].removedIds.includes(combo)) {
        diffs[sKey].removedIds.push(combo);
      }
    }
    // Remove from source added list if it was there
    diffs[sKey].added = diffs[sKey].added.filter(
      (t: MusicLibraryTrack) => (t.id && t.id !== trackToMove!.id) || (t.name !== trackToMove!.name)
    );

    // Mark added to target
    const alreadyInTargetDiff = diffs[tKey].added.some(
      (t: MusicLibraryTrack) =>
        (trackToMove!.id && t.id === trackToMove!.id) ||
        (t.name.toLowerCase() === trackToMove!.name.toLowerCase() &&
          (t.artist || "").toLowerCase() === (trackToMove!.artist || "").toLowerCase())
    );
    if (!alreadyInTargetDiff) {
      diffs[tKey].added.push(trackToMove);
    }
    // Remove from target removedIds if it was previously removed
    diffs[tKey].removedIds = diffs[tKey].removedIds.filter(
      (id: string) =>
        id !== trackToMove!.id &&
        id !== trackToMove!.name &&
        id !== `${trackToMove!.name}:::${trackToMove!.artist || ""}`
    );

    saveTrackDiffs(diffs);

    // 7. Save and dispatch events
    saveMusicLibrary(lib);
    window.dispatchEvent(
      new CustomEvent("mymusic_track_transferred", {
        detail: {
          sourceId: sourcePl.id ?? sourcePl.name,
          targetId: targetPl.id ?? targetPl.name,
          track: trackToMove,
        },
      })
    );
    window.dispatchEvent(new Event("mymusic_library_updated"));

    return {
      success: true,
      trackName: trackToMove.name,
      sourceName: sourcePl.name,
      targetName: targetPl.name,
      sourceRemainingCount: sourcePl.tracks_data.length,
      targetNewCount: targetPl.tracks_data.length,
    };
  } catch (err) {
    console.error("[libraryStore] Error moving track to target:", err);
    return { success: false, error: err instanceof Error ? err.message : "Error inesperado al mover la pista." };
  }
}
