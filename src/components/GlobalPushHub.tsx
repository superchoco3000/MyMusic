"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  loadMusicLibrary,
  getSavedClassifications,
  getSavedTrackDiffs,
  type PlaylistClassification,
} from "@/lib/library/libraryStore";
import { useAuthStore } from "@/store/authStore";
import { pushTracksToSpotify, type PushResult } from "@/lib/spotify/api";
import { playRewardSound } from "@/lib/gamification/sounds";
import type { MusicLibraryPlaylist } from "@/types/library";

interface TargetPlaylistSummary {
  playlist: MusicLibraryPlaylist;
  key: string;
  name: string;
  spotifyId: string | null;
  count: number;
  gap: number;
  pendingPushesCount: number;
  isBenchmark: boolean;
  classification: PlaylistClassification;
}

export function GlobalPushHub() {
  const providerToken = useAuthStore((s) => s.providerToken);
  const [playlists, setPlaylists] = useState<MusicLibraryPlaylist[]>([]);
  const [classifications, setClassifications] = useState<Record<string, PlaylistClassification>>({});
  const [isPushing, setIsPushing] = useState(false);
  const [currentProgressText, setCurrentProgressText] = useState<string | null>(null);
  const [pushStatusLog, setPushStatusLog] = useState<{
    success: boolean;
    message: string;
    totalPushed?: number;
    playlistsCount?: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const lib = await loadMusicLibrary();
      setPlaylists(lib.playlists || []);
      setClassifications(getSavedClassifications());
    } catch (e) {
      console.warn("[GlobalPushHub] Error loading library:", e);
    }
  }, []);

  useEffect(() => {
    loadData();
    const handleUpdate = () => loadData();
    window.addEventListener("mymusic_library_updated", handleUpdate);
    window.addEventListener("mymusic_classification_updated", handleUpdate);
    window.addEventListener("mymusic_track_transferred", handleUpdate);
    window.addEventListener("storage", handleUpdate);
    return () => {
      window.removeEventListener("mymusic_library_updated", handleUpdate);
      window.removeEventListener("mymusic_classification_updated", handleUpdate);
      window.removeEventListener("mymusic_track_transferred", handleUpdate);
      window.removeEventListener("storage", handleUpdate);
    };
  }, [loadData]);

  // Extract all Target/Objective playlists
  const targetSummaries = useMemo<TargetPlaylistSummary[]>(() => {
    const diffs = getSavedTrackDiffs();

    return playlists
      .filter((pl) => {
        const key = pl.id ?? pl.name;
        const savedClass = classifications[key] ?? pl.completion_meta?.classification ?? pl.classification;
        const isBench = pl.completion_meta?.is_benchmark === true;
        return savedClass === "objetivo" || isBench;
      })
      .map((pl) => {
        const key = pl.id ?? pl.name;
        const count = pl.tracks_data?.length ?? pl.total_tracks ?? 0;
        const gap = Math.max(0, 100 - count);
        const savedClass = classifications[key] ?? pl.completion_meta?.classification ?? pl.classification ?? "objetivo";
        const isBench = pl.completion_meta?.is_benchmark === true;
        const diff = diffs[key] ?? (pl.id ? diffs[pl.id] : undefined) ?? diffs[pl.name];
        const pendingCount = diff?.added?.length ?? 0;

        return {
          playlist: pl,
          key,
          name: pl.name,
          spotifyId: pl.id ?? null,
          count,
          gap,
          pendingPushesCount: pendingCount > 0 ? pendingCount : count,
          isBenchmark: isBench,
          classification: savedClass,
        };
      });
  }, [playlists, classifications]);

  const totalTracksToSync = useMemo(() => {
    return targetSummaries.reduce((sum, item) => sum + item.count, 0);
  }, [targetSummaries]);

  // Master push action: iterate over all target playlists and push in batches of 100
  const handleMasterPush = async () => {
    if (isPushing) return;

    const token =
      providerToken ||
      (typeof window !== "undefined" ? localStorage.getItem("spotify_provider_token") : null);

    if (!token) {
      setPushStatusLog({
        success: false,
        message: "Inicia sesión con Spotify para realizar el Push Global.",
      });
      return;
    }


    if (targetSummaries.length === 0) {
      setPushStatusLog({
        success: false,
        message: "No hay Listas Objetivo configuradas para sincronizar.",
      });
      return;
    }

    setIsPushing(true);
    setPushStatusLog(null);
    setCurrentProgressText("Iniciando secuencia de sincronización neón...");

    let totalPushedGlobal = 0;
    let successfulPlaylists = 0;
    const errors: string[] = [];

    try {
      for (let i = 0; i < targetSummaries.length; i++) {
        const item = targetSummaries[i];
        const spotifyId = item.spotifyId;

        if (!spotifyId) {
          console.warn(`[GlobalPushHub] Playlist "${item.name}" lacks Spotify ID, skipping.`);
          continue;
        }

        const tracks = item.playlist.tracks_data ?? [];
        const trackUris = tracks
          .map((t) => (t.id ? (t.id.startsWith("spotify:track:") ? t.id : `spotify:track:${t.id}`) : null))
          .filter(Boolean) as string[];

        if (trackUris.length === 0) continue;

        setCurrentProgressText(
          `[${i + 1}/${targetSummaries.length}] Sincronizando "${item.name}" (${trackUris.length} pistas)...`
        );

        try {
          const res: PushResult = await pushTracksToSpotify(spotifyId, trackUris, token);
          totalPushedGlobal += res.totalPushed;

          successfulPlaylists++;
        } catch (err) {
          const errMsg = err instanceof Error ? err.message : `Error en "${item.name}"`;
          errors.push(errMsg);
        }
      }

      if (successfulPlaylists > 0) {
        playRewardSound("perfect");
        setPushStatusLog({
          success: true,
          message: `✓ Sincronización exitosa: ${totalPushedGlobal} canciones enviadas a Spotify en ${successfulPlaylists} lista(s) objetivo.`,
          totalPushed: totalPushedGlobal,
          playlistsCount: successfulPlaylists,
        });
        window.dispatchEvent(new Event("mymusic_library_updated"));
      } else if (errors.length > 0) {
        setPushStatusLog({
          success: false,
          message: `Error durante el push: ${errors[0]}`,
        });
      }
    } catch (e) {
      console.error("[GlobalPushHub] Global push error:", e);
      setPushStatusLog({
        success: false,
        message: e instanceof Error ? e.message : "Error inesperado al conectar con Spotify.",
      });
    } finally {
      setIsPushing(false);
      setCurrentProgressText(null);
    }
  };

  console.log("🚨 [DEBUG] RENDERIZANDO HUB ROJO", { targetSummariesCount: targetSummaries.length });

  return (

    <section className="relative overflow-hidden rounded-lg border border-blue-500/40 bg-gradient-to-b from-[#081028]/95 via-[#070b18]/90 to-[#060814]/95 px-4 py-3 sm:px-5 sm:py-3.5 shadow-[0_0_25px_rgba(59,130,246,0.15)] backdrop-blur-xl mb-6 w-full">

      {/* ── Ambient Neon Cyber Glow Effects ── */}
      <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-blue-500/15 blur-[70px]" />
      <div className="pointer-events-none absolute -right-16 -bottom-16 h-40 w-40 rounded-full bg-cyan-400/10 blur-[70px]" />

      {/* Cyber Scanline Top Border Accent */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-blue-400 to-transparent opacity-80" />

      {/* ── Header Row ── */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-blue-500/20 pb-2.5">

        <div className="flex items-center gap-2.5">
          <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-blue-500/20 text-blue-300 border border-blue-400/50 shadow-[0_0_10px_rgba(59,130,246,0.4)]">
            <span className="text-base">🛰️</span>
            <span className="absolute -top-0.5 -right-0.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-blue-500" />
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs sm:text-sm font-black tracking-wider text-white uppercase font-mono">
                CENTRO DE MANDO PUSH GLOBAL
              </h2>
              <span className="rounded bg-blue-500/20 border border-blue-400/40 px-1.5 py-0.5 text-[8px] font-mono font-bold text-blue-300 shadow-[0_0_8px_rgba(59,130,246,0.3)]">
                CHUNKING 100
              </span>
            </div>
            <p className="text-[11px] text-blue-200/60 font-sans">
              Sincronización masiva de Listas Objetivo hacia Spotify Cloud
            </p>
          </div>
        </div>

        {/* Master Action Trigger (Blue Neon Button) */}
        <button
          type="button"
          id="global-master-push-btn"
          onClick={handleMasterPush}
          disabled={isPushing || totalTracksToSync === 0}
          className={`relative group inline-flex items-center gap-2 rounded-md px-4 py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 cursor-pointer active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shadow-[0_0_15px_rgba(59,130,246,0.3)] hover:shadow-[0_0_25px_rgba(59,130,246,0.6)] ${
            isPushing
              ? "bg-blue-600/30 border border-blue-400 text-blue-200 cursor-wait animate-pulse"
              : totalTracksToSync === 0
              ? "bg-blue-900/30 border border-blue-500/30 text-blue-300/50"
              : "bg-gradient-to-r from-blue-500 via-cyan-400 to-blue-600 text-black hover:scale-105 border border-cyan-300"
          }`}
        >
          {isPushing ? (
            <>
              <div className="h-3.5 w-3.5 border-2 border-cyan-300 border-t-transparent animate-spin rounded-full shrink-0" />
              <span className="font-mono text-cyan-200">{currentProgressText || "Sincronizando..."}</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="currentColor" className="h-3.5 w-3.5 shrink-0 text-black">
                <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.308-1.758-8.793-.963-.335.077-.67-.133-.746-.468-.077-.334.132-.67.467-.746 3.808-.87 7.076-.51 9.722 1.113.294.18.386.563.207.857zm1.224-2.72c-.226.367-.706.482-1.072.257-2.69-1.653-6.79-2.133-9.97-1.167-.413.125-.849-.107-.973-.52-.125-.413.108-.849.52-.973 3.632-1.102 8.147-.568 11.238 1.332.366.226.482.706.257 1.072zm.105-2.835C14.692 8.95 9.375 8.775 6.297 9.71c-.493.15-1.016-.13-1.165-.624-.15-.493.13-1.017.624-1.166 3.532-1.072 9.404-.866 13.115 1.338.445.264.59.838.327 1.282-.264.444-.838.59-1.282.327z"/>
              </svg>
              <span>🚀 Sincronizar Todo a Spotify</span>
              <span className="rounded bg-black/30 px-1.5 py-0.5 text-[9px] text-white font-mono">
                {totalTracksToSync} tracks
              </span>
            </>
          )}
        </button>
      </div>


      {/* ── Status Feedback Banner ── */}
      <AnimatePresence>
        {pushStatusLog && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className={`mt-4 rounded-2xl p-3 text-xs font-semibold flex items-center justify-between border ${
              pushStatusLog.success
                ? "bg-blue-500/15 border-blue-400/50 text-blue-200 shadow-[0_0_15px_rgba(59,130,246,0.3)]"
                : "bg-red-500/15 border-red-400/50 text-red-200"
            }`}
          >
            <span>{pushStatusLog.message}</span>
            <button
              onClick={() => setPushStatusLog(null)}
              className="text-white/40 hover:text-white text-xs px-2 cursor-pointer"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Target Playlists Breakdown Grid (or Neutral Empty State) ── */}
      {targetSummaries.length === 0 ? (
        <div className="mt-3 rounded-md border border-white/10 bg-white/[0.02] p-3 text-center">
          <p className="text-[11px] font-mono text-white/40">
            0 pistas pendientes · Configura o clasifica playlists como &quot;Objetivo&quot; para enviar automáticamente a Spotify en lotes de 100
          </p>
        </div>
      ) : (
        <div className="relative z-10 mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {targetSummaries.map((item) => {
            const pct = Math.min(100, Math.round((item.count / 100) * 100));

            return (
              <div
                key={item.key}
                className="flex flex-col gap-1.5 rounded-md border border-blue-500/20 bg-blue-950/30 p-2.5 hover:border-blue-400/60 hover:bg-blue-900/30 transition-all duration-200 group shadow-sm hover:shadow-[0_0_15px_rgba(59,130,246,0.2)]"
              >
                {/* Top Row: Name and Benchmark Chip */}
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white/90 truncate group-hover:text-blue-200 transition-colors" title={item.name}>
                    {item.name}
                  </span>
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[8px] font-mono font-black border ${
                      item.isBenchmark
                        ? "bg-cyan-500/20 border-cyan-400/50 text-cyan-300 shadow-[0_0_8px_rgba(6,182,212,0.4)]"
                        : "bg-blue-500/20 border-blue-400/40 text-blue-300"
                    }`}
                  >
                    {item.isBenchmark ? "BENCHMARK" : "OBJETIVO"}
                  </span>
                </div>

                {/* Reactive Blue Neon Line (Format: X/100 para [Nombre]) */}
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-[11px] font-bold text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)] font-mono">
                    {item.count}/100 para {item.name}
                  </p>
                  <span className="text-[9px] font-mono text-white/40 tabular-nums">
                    {pct}%
                  </span>
                </div>

                {/* Glowing Neon Progress Track */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-blue-950 border border-blue-500/30">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-500 via-cyan-400 to-teal-300 shadow-[0_0_10px_rgba(59,130,246,0.8)] transition-all duration-700"
                    style={{ width: `${Math.max(6, pct)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
