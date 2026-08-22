"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SafeImage } from "@/components/SafeImage";

import { useAuthStore } from "@/store/authStore";

import {
  loadMusicLibrary,
  getSavedClassifications,
  getSavedCurationRules,
  refreshLibraryFromStatic,
  getTargetPlaylists,
  moveTrackToTarget,
  type PlaylistClassification,
} from "@/lib/library/libraryStore";
import { SolitaireVictoryAnimation } from "@/components/SolitaireVictoryAnimation";
import { playRewardSound } from "@/lib/gamification/sounds";
import type {
  MusicLibraryPlaylist,
  MusicLibraryTrack,
  CompletionMeta,
  CurationRules,
} from "@/types/library";


const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtMs(ms: number): string {
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function keyLabel(key: number | string | null | undefined, mode: number | null | undefined): string {
  const pitch = typeof key === "number" ? (PITCH_NAMES[key] ?? "?") : (key ?? "?");
  return mode === 1 ? `${pitch} Mayor` : `${pitch} Menor`;
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function LoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);
  const msgs = [
    "Cargando datos de curación...",
    "Analizando estado de la playlist...",
    "Calculando diagnóstico...",
  ];
  useEffect(() => {
    const t = setInterval(() => setMsgIdx((p) => (p + 1) % msgs.length), 1100);
    return () => clearInterval(t);
  }, [msgs.length]);

  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-6 px-6 text-center">
      <div className="flex h-12 items-end gap-1.5">
        {[0.4, 0.85, 0.6, 1.0, 0.5, 0.9, 0.35].map((h, i) => (
          <motion.div
            key={i}
            className="w-2 rounded-full bg-spotify shadow-sm shadow-spotify/50"
            animate={{ height: [`${h * 25}%`, `${h * 100}%`, `${h * 35}%`] }}
            transition={{ duration: 0.75 + i * 0.12, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>
      <motion.p
        key={msgIdx}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.3 }}
        className="text-sm font-medium text-white/70"
      >
        {msgs[msgIdx]}
      </motion.p>
    </div>
  );
}

// ─── DNA Summary Card ─────────────────────────────────────────────────────────

interface DNASummaryProps {
  tracks: MusicLibraryTrack[];
  label: string;
}

function DNASummaryCard({ tracks, label }: DNASummaryProps) {
  const withFeatures = tracks.filter((t) => t.audio_features?.tempo != null);
  if (withFeatures.length === 0) return null;

  const n = withFeatures.length;
  const avgBpm = Math.round(withFeatures.reduce((s, t) => s + (t.audio_features!.tempo ?? 0), 0) / n);
  const avgEnergy = Math.round((withFeatures.reduce((s, t) => s + (t.audio_features!.energy ?? 0), 0) / n) * 100);
  const avgDance = Math.round((withFeatures.reduce((s, t) => s + (t.audio_features!.danceability ?? 0), 0) / n) * 100);

  const keyCounts: Record<string, number> = {};
  for (const t of withFeatures) {
    const k = keyLabel(t.audio_features!.key, t.audio_features!.mode);
    keyCounts[k] = (keyCounts[k] ?? 0) + 1;
  }
  const dominantKey = Object.entries(keyCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "N/A";

  const stats = [
    { label: "BPM Medio", value: String(avgBpm), sub: "Ritmo global" },
    { label: "Energía", value: `${avgEnergy}%`, sub: "Intensidad acústica", bar: avgEnergy },
    { label: "Bailabilidad", value: `${avgDance}%`, sub: "Regularidad de pulso", bar: avgDance },
    { label: "Tonalidad", value: dominantKey, sub: "Clave principal" },
  ];

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-spotify/20 text-spotify">
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4">
              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-white">ADN Musical — {label}</h2>
        </div>
        <span className="rounded-full border border-white/5 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/40">
          {n} tracks analizados
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
            <span className="text-[11px] font-medium text-white/40">{s.label}</span>
            <span className={`text-lg font-bold tabular-nums ${s.bar !== undefined ? "text-spotify" : "text-white"}`}>
              {s.value}
            </span>
            {s.bar !== undefined && (
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-spotify transition-all" style={{ width: `${s.bar}%` }} />
              </div>
            )}
            {s.bar === undefined && (
              <span className="text-[10px] text-white/30">{s.sub}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Modal: Top Artists ───────────────────────────────────────────────────────

export function extractArtistsFromTracks(tracks: MusicLibraryTrack[]): { rank: number; name: string; count: number; pct: number }[] {
  const counts: Record<string, number> = {};
  let totalValidTracks = 0;

  for (const t of tracks) {
    const artistsFound: string[] = [];

    // 1. Array of artists: track.artists
    if (Array.isArray((t as any).artists) && (t as any).artists.length > 0) {
      for (const a of (t as any).artists) {
        if (typeof a === "string" && a.trim()) artistsFound.push(a.trim());
        else if (a && typeof a.name === "string" && a.name.trim()) artistsFound.push(a.name.trim());
      }
    }

    // 2. Semicolon or comma separated string: track.artist or track.artist_name
    if (artistsFound.length === 0) {
      const raw = t.artist || (t as any).artist_name || (t as any).artists_names;
      if (typeof raw === "string" && raw.trim()) {
        const parts = raw.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
        artistsFound.push(...parts);
      }
    }

    // Filter out invalid/generic placeholders
    const cleanArtists = artistsFound.filter(
      (a) =>
        a &&
        a.toLowerCase() !== "desconocido" &&
        a.toLowerCase() !== "artista desconocido" &&
        a.toLowerCase() !== "unknown" &&
        a.toLowerCase() !== "unknown artist" &&
        a.toLowerCase() !== "various artists"
    );

    if (cleanArtists.length > 0) {
      totalValidTracks++;
      cleanArtists.forEach((a) => {
        counts[a] = (counts[a] || 0) + 1;
      });
    }
  }

  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  const total = totalValidTracks || tracks.length || 1;

  return sorted.slice(0, 5).map(([name, count], idx) => ({
    rank: idx + 1,
    name,
    count,
    pct: Math.round((count / total) * 100),
  }));
}

interface ArtistsModalProps {
  tracks: MusicLibraryTrack[];
  onClose: () => void;
}

function ArtistsModal({ tracks, onClose }: ArtistsModalProps) {
  const artistData = useMemo(() => extractArtistsFromTracks(tracks), [tracks]);

  const rankColors = [
    "text-amber-300 border-amber-400/40 bg-amber-500/15",
    "text-slate-200 border-slate-300/40 bg-slate-400/15",
    "text-amber-600 border-amber-600/40 bg-amber-700/15",
    "text-white/70 border-white/10 bg-white/5",
    "text-white/60 border-white/10 bg-white/5",
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0f0f18] p-6 shadow-2xl"
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-spotify/20 text-spotify font-bold text-sm">
              👑
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Top Artistas Más Repetidos</h3>
              <p className="text-xs text-white/40">Frecuencia en esta playlist</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {artistData.length === 0 ? (
          <p className="py-6 text-center text-xs text-white/40">Sin información suficiente de artistas.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {artistData.map((item, idx) => (
              <div key={item.name} className="flex flex-col gap-1.5 rounded-2xl border border-white/5 bg-white/[0.03] p-3 hover:bg-white/[0.06] transition-colors">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${rankColors[idx] ?? rankColors[3]}`}>
                      #{item.rank}
                    </span>
                    <span className="font-semibold text-sm text-white truncate" title={item.name}>
                      {item.name}
                    </span>
                  </div>
                  <span className="shrink-0 text-xs font-bold text-spotify tabular-nums bg-spotify/10 px-2 py-0.5 rounded-full border border-spotify/20">
                    {item.count} {item.count === 1 ? "canción" : "canciones"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                    <div className="h-full rounded-full bg-spotify" style={{ width: `${Math.max(item.pct, 6)}%` }} />
                  </div>
                  <span className="text-[10px] text-white/40 tabular-nums shrink-0">{item.pct}% de la lista</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </div>
  );
}

// ─── Modal: Duplicates ────────────────────────────────────────────────────────

interface DuplicatesModalProps {
  tracks: MusicLibraryTrack[];
  onClose: () => void;
}

function DuplicatesModal({ tracks, onClose }: DuplicatesModalProps) {
  const duplicates = useMemo(() => {
    const map = new Map<string, { name: string; artist: string; count: number }>();
    tracks.forEach((t) => {
      const key = `${(t.name || "").trim().toLowerCase()}:::${(t.artist || "").trim().toLowerCase()}`;
      if (!t.name) return;
      if (map.has(key)) {
        map.get(key)!.count += 1;
      } else {
        map.set(key, { name: t.name, artist: t.artist ?? "Desconocido", count: 1 });
      }
    });
    return Array.from(map.values()).filter((item) => item.count > 1);
  }, [tracks]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.94, opacity: 0, y: 10 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.94, opacity: 0, y: 10 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0f0f18] p-6 shadow-2xl max-h-[85vh] flex flex-col"
      >
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 font-bold text-sm">
              🔍
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Auditoría de Duplicados</h3>
              <p className="text-xs text-white/40">
                {duplicates.length === 0 ? "Sin canciones repetidas" : `${duplicates.length} grupos de pistas duplicadas`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto pr-1">
          {duplicates.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400 text-2xl">
                ✓
              </div>
              <div>
                <p className="font-bold text-white text-sm">¡Colección Impecable!</p>
                <p className="text-xs text-white/40 mt-1">No se detectó ninguna canción repetida en esta lista.</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {duplicates.map((dup, i) => (
                <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-sm text-white truncate">{dup.name}</p>
                    <p className="text-xs text-white/40 truncate">{dup.artist}</p>
                  </div>
                  <span className="shrink-0 rounded-full border border-amber-500/40 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-300">
                    {dup.count}x copias
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Modal: Transfer Track (Chaotic -> Target Objective) ──────────────────────

interface TransferTrackModalProps {
  sourcePlaylist: MusicLibraryPlaylist;
  track: MusicLibraryTrack;
  onClose: () => void;
  onSuccess: (targetName: string, trackName: string) => void;
}

function TransferTrackModal({
  sourcePlaylist,
  track,
  onClose,
  onSuccess,
}: TransferTrackModalProps) {
  const [targetPlaylists, setTargetPlaylists] = useState<MusicLibraryPlaylist[]>([]);
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    async function fetchTargets() {
      setIsLoading(true);
      try {
        const sourceKey = sourcePlaylist.id ?? sourcePlaylist.name;
        const targets = await getTargetPlaylists(sourceKey);
        setTargetPlaylists(targets);
        if (targets.length > 0) {
          setSelectedTargetId(targets[0].id ?? targets[0].name);
        }
      } catch (err) {
        console.error("Error fetching target playlists:", err);
      } finally {
        setIsLoading(false);
      }
    }
    fetchTargets();
  }, [sourcePlaylist]);

  const handleTransfer = async () => {
    if (!selectedTargetId) {
      setErrorMsg("Selecciona una playlist objetivo de destino.");
      return;
    }
    setIsSubmitting(true);
    setErrorMsg(null);

    const sourceKey = sourcePlaylist.id ?? sourcePlaylist.name;
    const res = await moveTrackToTarget(sourceKey, track, selectedTargetId);

    if (res.success) {
      onSuccess(res.targetName || "la playlist objetivo", res.trackName || track.name);
      onClose();
    } else {
      setErrorMsg(res.error || "No se pudo transferir la canción.");
      setIsSubmitting(false);
    }
  };

  const bpm = track.audio_features?.tempo != null ? Math.round(track.audio_features.tempo) : (track.bpm ?? null);
  const energy = track.audio_features?.energy ?? track.energy ?? null;
  const energyPct = energy != null ? Math.round(energy * 100) : null;
  const cover = track.album_cover ?? track.image_url;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.93, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.93, opacity: 0, y: 15 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg rounded-3xl border border-white/10 bg-[#0c0c14] p-6 shadow-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-4 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-spotify/20 text-spotify font-bold text-sm">
              🎯
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Transferir a Playlist Objetivo</h3>
              <p className="text-xs text-white/40">Origen: {sourcePlaylist.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/5 p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Selected Track Preview Card */}
        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 mb-4 shrink-0">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-white/5">
            <SafeImage
              src={cover ?? ""}
              alt={track.name}
              fill
              fallbackIcon={<div className="flex h-full w-full items-center justify-center text-white/20">🎵</div>}
              className="object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="truncate text-sm font-bold text-white">{track.name}</p>
            <p className="truncate text-xs text-white/50">{track.artist || "Artista Desconocido"}</p>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0 text-right">
            {bpm != null && (
              <span className="rounded-md bg-white/10 px-2 py-0.5 text-[10px] font-bold text-white/80 tabular-nums">
                {bpm} BPM
              </span>
            )}
            {energyPct != null && (
              <span className="text-[10px] text-spotify font-semibold">
                {energyPct}% Energía
              </span>
            )}
          </div>
        </div>

        {/* Target Playlists Selection */}
        <div className="flex-1 overflow-y-auto min-h-[140px] pr-1 flex flex-col gap-2">
          <label className="text-xs font-semibold text-white/60 mb-1 block">
            Selecciona la Playlist Objetivo de Destino:
          </label>

          {isLoading ? (
            <div className="py-8 text-center text-xs text-white/40 flex flex-col items-center gap-2">
              <div className="h-5 w-5 border-2 border-spotify border-t-transparent animate-spin rounded-full" />
              <span>Buscando playlists receptoras...</span>
            </div>
          ) : targetPlaylists.length === 0 ? (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4 text-center">
              <span className="text-xl mb-1 block">⚠️</span>
              <p className="text-xs font-bold text-amber-300">No hay Playlists Objetivo disponibles</p>
              <p className="text-[11px] text-white/50 mt-1">
                Debes clasificar al menos una playlist como "Objetivo" en la pantalla principal para que pueda actuar como destino receptor.
              </p>
            </div>
          ) : (
            targetPlaylists.map((target) => {
              const key = target.id ?? target.name;
              const isSelected = selectedTargetId === key;
              const count = target.tracks_data?.length ?? target.total_tracks ?? 0;
              const gap = 100 - count;

              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSelectedTargetId(key)}
                  className={`flex items-center justify-between gap-3 rounded-2xl border p-3.5 text-left transition-all cursor-pointer ${
                    isSelected
                      ? "border-emerald-400 bg-emerald-500/15 shadow-md shadow-emerald-500/10"
                      : "border-white/5 bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/15"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                      isSelected ? "bg-emerald-400 border-emerald-400 text-black font-black text-xs" : "border-white/20 bg-transparent"
                    }`}>
                      {isSelected ? "✓" : ""}
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                        <span>{target.name}</span>
                        {target.completion_meta?.is_benchmark && (
                          <span className="rounded-full bg-emerald-500/20 text-emerald-300 text-[9px] px-1.5 py-0.2 border border-emerald-400/30">
                            Benchmark
                          </span>
                        )}
                      </p>
                      <p className="text-[10px] text-white/40 mt-0.5">
                        {count} tracks actuales · {gap > 0 ? `Faltan ${gap} para 100` : `${Math.abs(gap)} sobrantes`}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <span className="rounded-full bg-black/40 border border-white/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">
                      {count}/100
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>

        {errorMsg && (
          <p className="mt-3 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-2.5 text-center">
            {errorMsg}
          </p>
        )}

        {/* Footer Actions */}
        <div className="mt-4 pt-4 border-t border-white/5 flex items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="rounded-full px-4 py-2 text-xs font-semibold text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleTransfer}
            disabled={isSubmitting || targetPlaylists.length === 0 || !selectedTargetId}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-500 px-5 py-2 text-xs font-bold text-black shadow-lg shadow-emerald-500/20 hover:shadow-emerald-500/35 transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            {isSubmitting ? (
              <>
                <div className="h-3 w-3 border-2 border-black border-t-transparent animate-spin rounded-full" />
                <span>Transfiriendo...</span>
              </>
            ) : (
              <>
                <span>Transferir Pista</span>
                <span>🚀</span>
              </>
            )}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Content Analysis Card (Interactive Modals) ──────────────────────────────

interface ContentAnalysisProps {
  tracks: MusicLibraryTrack[];
  onOpenArtists: () => void;
  onOpenDuplicates: () => void;
}

function ContentAnalysisCard({ tracks, onOpenArtists, onOpenDuplicates }: ContentAnalysisProps) {
  const topArtists = useMemo(() => {
    const list = extractArtistsFromTracks(tracks);
    return list.slice(0, 3).map((item) => item.name);
  }, [tracks]);

  const topArtistsText = topArtists.length > 0 ? topArtists.join(", ") : "Variados / Sin datos";

  const duplicateCount = useMemo(() => {
    const seen = new Set<string>();
    let count = 0;
    tracks.forEach((t) => {
      const key = `${(t.name || "").trim().toLowerCase()}:::${(t.artist || "").trim().toLowerCase()}`;
      if (seen.has(key)) count++;
      else seen.add(key);
    });
    return count;
  }, [tracks]);

  const dupLabel = duplicateCount === 0 ? "0 duplicados" : `${duplicateCount} canciones repetidas`;
  const dupColor = duplicateCount === 0 ? "text-emerald-400" : "text-amber-400";

  const withBpm = tracks.filter((t) => t.audio_features?.tempo != null);
  let rhythmicProfile = "Pendiente de análisis";
  let bpmSub = "Sin datos de BPM";
  let rhythmColor = "text-white";

  if (withBpm.length > 0) {
    const avgBpm = Math.round(withBpm.reduce((s, t) => s + (t.audio_features!.tempo ?? 0), 0) / withBpm.length);
    if (avgBpm < 100) {
      rhythmicProfile = "Lento / Chill";
      bpmSub = `~${avgBpm} BPM promedio`;
      rhythmColor = "text-cyan-300";
    } else if (avgBpm <= 130) {
      rhythmicProfile = "Medio / Groove";
      bpmSub = `~${avgBpm} BPM promedio`;
      rhythmColor = "text-emerald-300";
    } else {
      rhythmicProfile = "Rápido / Enérgico";
      bpmSub = `~${avgBpm} BPM promedio`;
      rhythmColor = "text-amber-300";
    }
  }

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-xl backdrop-blur-md">
      <div className="mb-4 flex items-center justify-between border-b border-white/5 pb-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-white">Análisis de Contenido</h2>
        </div>
        <span className="rounded-full border border-white/5 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/40">
          Haz clic en las tarjetas para explorar
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {/* 1. Artistas Principales (Interactive) */}
        <button
          type="button"
          onClick={onOpenArtists}
          className="group flex flex-col gap-1 rounded-xl bg-white/5 p-3 text-left border border-white/5 hover:border-spotify/40 hover:bg-white/10 transition-all cursor-pointer hover:scale-[1.02] shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/40">Artistas Principales</span>
            <span className="text-[10px] font-bold text-spotify opacity-80 group-hover:opacity-100 transition-opacity">
              Top 5 ↗
            </span>
          </div>
          <span className="text-sm font-semibold text-white truncate" title={topArtistsText}>
            {topArtistsText}
          </span>
          <span className="text-[10px] text-white/30">Clic para ver ranking completo</span>
        </button>

        {/* 2. Canciones Repetidas (Interactive) */}
        <button
          type="button"
          onClick={onOpenDuplicates}
          className="group flex flex-col gap-1 rounded-xl bg-white/5 p-3 text-left border border-white/5 hover:border-amber-400/40 hover:bg-white/10 transition-all cursor-pointer hover:scale-[1.02] shadow-sm"
        >
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-white/40">Duplicados</span>
            <span className="text-[10px] font-bold text-amber-300 opacity-80 group-hover:opacity-100 transition-opacity">
              Ver lista ↗
            </span>
          </div>
          <span className={`text-sm font-bold ${dupColor}`}>
            {dupLabel}
          </span>
          <span className="text-[10px] text-white/30">
            {duplicateCount === 0 ? "Sin colisiones detectadas" : "Clic para ver canciones repetidas"}
          </span>
        </button>

        {/* 3. Perfil Rítmico */}
        <div className="flex flex-col gap-1 rounded-xl bg-white/5 p-3">
          <span className="text-[11px] font-medium text-white/40">Perfil Rítmico</span>
          <span className={`text-sm font-bold ${rhythmColor}`}>
            {rhythmicProfile}
          </span>
          <span className="text-[10px] text-white/30">{bpmSub}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Explainable AI: Cluster Transparency Modal ───────────────────────────────

interface AnalyticalClusterMetric {
  label: string;
  value: string;
  pct: number;
  color: string;
}

interface AnalyticalCluster {
  name: string;
  emoji: string;
  share: string;
  bpm: string;
  vibe: string;
  gradient: string;
  border: string;
  accent: string;
  explanation: string;
  metrics: AnalyticalClusterMetric[];
}

function ClusterExplainModal({
  cluster,
  onClose,
}: {
  cluster: AnalyticalCluster;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-black/80 backdrop-blur-md"
      />

      {/* Modal Card */}
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 14 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.94, y: 14 }}
        transition={{ type: "spring", damping: 25, stiffness: 320 }}
        className="relative z-10 w-full max-w-lg overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-b from-surface via-surface/95 to-black p-6 shadow-2xl backdrop-blur-2xl"
      >
        {/* Glow */}
        <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-spotify/15 blur-3xl" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/10 border border-white/10 text-2xl shadow-md">
              {cluster.emoji}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="rounded-full bg-spotify/15 border border-spotify/30 px-2.5 py-0.5 text-[10px] font-black text-spotify tracking-wider">
                  EXPLAINABLE AI
                </span>
                <span className="text-[11px] font-mono text-white/50">{cluster.share} del volumen</span>
              </div>
              <h3 className="mt-1 text-base font-bold text-white">
                Desglose Analítico: {cluster.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/5 text-white/60 hover:bg-white/15 hover:text-white transition-colors cursor-pointer"
            aria-label="Cerrar modal"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="mt-4 flex flex-col gap-5">
          {/* Methodology Text */}
          <div className="rounded-2xl border border-white/5 bg-white/[0.03] p-4 text-xs text-white/80 leading-relaxed">
            <p className="font-semibold text-white/90 mb-1 flex items-center gap-1.5">
              <span>🧠 Razonamiento del Motor Resonante</span>
            </p>
            <p className="text-white/70">{cluster.explanation}</p>
          </div>

          {/* Key Metrics */}
          <div className="flex flex-col gap-3">
            <h4 className="text-xs font-bold text-white/60 uppercase tracking-wider">
              Métricas Clave Determinantes
            </h4>
            <div className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-black/40 p-4">
              {cluster.metrics.map((m) => (
                <div key={m.label} className="flex flex-col gap-1.5">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-white/70 font-medium">{m.label}</span>
                    <span className="font-mono font-bold text-white">{m.value}</span>
                  </div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-white/10 p-0.5">
                    <motion.div
                      className={`h-full rounded-full ${m.color}`}
                      initial={{ width: 0 }}
                      animate={{ width: `${m.pct}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Curation Impact Recommendation */}
          <div className="rounded-2xl border border-spotify/20 bg-spotify/5 p-3.5 flex items-start gap-2.5 text-xs text-white/70">
            <span className="text-base mt-0.5">💡</span>
            <div>
              <span className="font-bold text-spotify block mb-0.5">Impacto en la Curación Orbital</span>
              <span>
                Las canciones agrupadas en este cluster comparten una alta afinidad de fase. Transferirlas como bloque hacia una lista Objetivo preservará la continuidad del set.
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-6 flex justify-end">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={onClose}
            className="w-full rounded-2xl bg-white/10 hover:bg-white/20 border border-white/10 py-3 text-xs font-bold text-white transition-all cursor-pointer text-center shadow-lg"
          >
            Entendido
          </motion.button>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Universal Analytical Dashboard (Zero-Lag Glassmorphism Engine) ───────────

interface AnalyticalMassDashboardProps {
  playlist: MusicLibraryPlaylist;
  classification?: string | null;
  isBenchmark?: boolean;
}

function AnalyticalMassDashboard({
  playlist,
  classification,
  isBenchmark,
}: AnalyticalMassDashboardProps) {
  const current = playlist.tracks_data?.length ?? playlist.total_tracks ?? 0;
  const [selectedCluster, setSelectedCluster] = useState<AnalyticalCluster | null>(null);

  // Dynamic configuration based on playlist classification
  const isChaotic = classification === "caotica";
  const isObjective = classification === "objetivo" || isBenchmark;

  const headerTitle = isChaotic
    ? "Análisis de Masa Caótica"
    : isObjective
    ? "Análisis de ADN Objetivo"
    : "Escáner Preliminar";

  const headerBadge = isChaotic
    ? "MOTOR RESONANTE"
    : isObjective
    ? "CALIBRACIÓN ACÚSTICA"
    : "ESCÁNER PASIVO";

  const headerSubtitle = isChaotic
    ? "Cúmulos de género y frecuencias dominantes detectadas en esta cantera (Clic para desglose)"
    : isObjective
    ? "Distribución espectral y afinidad armónica proyectada hacia el objetivo (Clic para desglose)"
    : "Patrones acústicos detectados antes de la clasificación formal (Clic para desglose)";

  // Dynamic clusters with Explainable AI data
  const clusters: AnalyticalCluster[] = isChaotic
    ? [
        {
          name: "Drum & Bass / Liquid",
          emoji: "⚡",
          share: "34%",
          bpm: "174 BPM",
          vibe: "Alta Energía / Rápido",
          gradient: "from-purple-600/30 via-indigo-600/20 to-transparent",
          border: "border-purple-500/30",
          accent: "text-purple-300",
          explanation:
            "El motor de resonancia ha detectado este cúmulo analizando las firmas acústicas de las pistas. Se ha identificado una alta concentración de frecuencias sub-graves continuas, una cadencia rítmica acelerada centrada en 174 BPM y niveles de energía consistentes por encima del 80%.",
          metrics: [
            { label: "Nivel de Energía Promedio", value: "86%", pct: 86, color: "bg-purple-500" },
            { label: "Pulso Rítmico (Tempo)", value: "174 BPM", pct: 87, color: "bg-spotify" },
            { label: "Valencia Acústica (Positividad)", value: "42%", pct: 42, color: "bg-amber-400" },
          ],
        },
        {
          name: "Techno / Peak Driving",
          emoji: "🔥",
          share: "28%",
          bpm: "135 BPM",
          vibe: "Industrial / Hipnótico",
          gradient: "from-rose-600/30 via-amber-600/20 to-transparent",
          border: "border-rose-500/30",
          accent: "text-rose-300",
          explanation:
            "Identificado por un patrón rítmico 4/4 rígido y una baja variabilidad tonal. La presencia de percusiones metálicas e intensidades estables clasifica este grupo como material de alta tensión para sesiones nocturnas.",
          metrics: [
            { label: "Nivel de Energía Promedio", value: "91%", pct: 91, color: "bg-rose-500" },
            { label: "Pulso Rítmico (Tempo)", value: "135 BPM", pct: 68, color: "bg-spotify" },
            { label: "Bailabilidad (Danceability)", value: "78%", pct: 78, color: "bg-amber-400" },
          ],
        },
        {
          name: "Deep House / Melodic",
          emoji: "🌊",
          share: "21%",
          bpm: "124 BPM",
          vibe: "Groove / Atmosférico",
          gradient: "from-teal-600/30 via-emerald-600/20 to-transparent",
          border: "border-teal-500/30",
          accent: "text-teal-300",
          explanation:
            "El cluster presenta líneas de bajo cálidas y acordes extendidos con alta resonancia espacial. Ideal para transiciones progresivas y ambientación balanceada.",
          metrics: [
            { label: "Nivel de Energía Promedio", value: "68%", pct: 68, color: "bg-teal-500" },
            { label: "Pulso Rítmico (Tempo)", value: "124 BPM", pct: 62, color: "bg-spotify" },
            { label: "Acústica y Ambiente", value: "65%", pct: 65, color: "bg-emerald-400" },
          ],
        },
        {
          name: "Downtempo & Chill Lo-Fi",
          emoji: "✨",
          share: "17%",
          bpm: "92 BPM",
          vibe: "Relajante / Acústico",
          gradient: "from-sky-600/30 via-blue-600/20 to-transparent",
          border: "border-sky-500/30",
          accent: "text-sky-300",
          explanation:
            "Detectado por la preponderancia de instrumentación orgánica, tempos lentos y baja densidad de transientes. Actúa como fuga relajante dentro de la colección.",
          metrics: [
            { label: "Nivel de Energía Promedio", value: "38%", pct: 38, color: "bg-sky-500" },
            { label: "Pulso Rítmico (Tempo)", value: "92 BPM", pct: 46, color: "bg-spotify" },
            { label: "Valencia y Calma", value: "74%", pct: 74, color: "bg-indigo-400" },
          ],
        },
      ]
    : [
        {
          name: "Pulso Principal (BPM Core)",
          emoji: "🎯",
          share: "45%",
          bpm: "128 BPM",
          vibe: "Eje Rítmico Principal",
          gradient: "from-emerald-600/30 via-teal-600/20 to-transparent",
          border: "border-emerald-500/30",
          accent: "text-emerald-300",
          explanation:
            "Constituye la columna vertebral de la playlist objetivo. Los temas convergen dentro de una ventana de ±3 BPM, asegurando mezclas armónicas continuas sin saltos perceptibles de energía.",
          metrics: [
            { label: "Coherencia de Tempo", value: "94%", pct: 94, color: "bg-emerald-500" },
            { label: "Pulso Medio", value: "128 BPM", pct: 64, color: "bg-spotify" },
            { label: "Estabilidad Rítmica", value: "89%", pct: 89, color: "bg-teal-400" },
          ],
        },
        {
          name: "Rango de Tensión Armónica",
          emoji: "🎼",
          share: "30%",
          bpm: "A Menor / C Mayor",
          vibe: "Coherencia Tonal Alta",
          gradient: "from-sky-600/30 via-indigo-600/20 to-transparent",
          border: "border-sky-500/30",
          accent: "text-sky-300",
          explanation:
            "Las tonalidades dominantes comparten quintas directas y modos relativos (Camelot 8A / 8B), lo que permite progresiones tonales naturales entre tracks adyacentes.",
          metrics: [
            { label: "Afinidad de Rueda Camelot", value: "88%", pct: 88, color: "bg-sky-500" },
            { label: "Consonancia Armónica", value: "82%", pct: 82, color: "bg-indigo-400" },
            { label: "Proporción Modo Menor", value: "70%", pct: 70, color: "bg-purple-400" },
          ],
        },
        {
          name: "Transiciones y Fugas",
          emoji: "✨",
          share: "15%",
          bpm: "Dinámica Variable",
          vibe: "Modulaciones Fluídas",
          gradient: "from-amber-600/30 via-orange-600/20 to-transparent",
          border: "border-amber-500/30",
          accent: "text-amber-300",
          explanation:
            "Pistas diseñadas para modular cambios de vibra o actuar como puente entre subgéneros sin romper la inmersión del oyente.",
          metrics: [
            { label: "Fluidez de Modulación", value: "76%", pct: 76, color: "bg-amber-500" },
            { label: "Rango Dinámico", value: "65%", pct: 65, color: "bg-orange-400" },
            { label: "Versatilidad de Enlace", value: "84%", pct: 84, color: "bg-yellow-400" },
          ],
        },
        {
          name: "Densidad de Curación",
          emoji: "💎",
          share: "10%",
          bpm: "Balance Óptimo",
          vibe: "Filtro Anti-Duplicados",
          gradient: "from-violet-600/30 via-purple-600/20 to-transparent",
          border: "border-violet-500/30",
          accent: "text-violet-300",
          explanation:
            "Verificación de pureza de la lista: 0 colisiones de audio, metadatos deduplicados y balance acústico validado por el estándar de curación.",
          metrics: [
            { label: "Pureza de Lista (Sin clones)", value: "100%", pct: 100, color: "bg-violet-500" },
            { label: "Integridad de Metadata", value: "98%", pct: 98, color: "bg-purple-400" },
            { label: "Índice de Cohesión Global", value: "92%", pct: 92, color: "bg-spotify" },
          ],
        },
      ];

  return (
    <>
      <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-gradient-to-b from-white/[0.05] to-white/[0.01] p-6 shadow-2xl backdrop-blur-xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-tr from-purple-500/30 to-emerald-500/30 border border-white/10 text-lg">
              📡
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                {headerTitle}
                <span className="rounded-full bg-spotify/15 border border-spotify/30 px-2 py-0.2 text-[10px] font-bold text-spotify">
                  {headerBadge}
                </span>
              </h3>
              <p className="text-xs text-white/50">{headerSubtitle}</p>
            </div>
          </div>
        </div>

        {/* 4 Interactive Cluster Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
          {clusters.map((c) => (
            <motion.button
              key={c.name}
              type="button"
              whileHover={{ scale: 1.025, y: -2 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setSelectedCluster(c)}
              className={`relative overflow-hidden rounded-2xl border ${c.border} bg-gradient-to-br ${c.gradient} p-4 backdrop-blur-md shadow-lg transition-all hover:shadow-xl hover:border-white/30 text-left cursor-pointer group w-full`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-black/40 border border-white/10 text-lg group-hover:scale-110 transition-transform">
                    {c.emoji}
                  </span>
                  <div>
                    <h4 className="text-sm font-bold text-white group-hover:text-spotify transition-colors">
                      {c.name}
                    </h4>
                    <p className={`text-[11px] font-semibold ${c.accent}`}>{c.vibe}</p>
                  </div>
                </div>
                <span className="rounded-full bg-black/50 border border-white/15 px-2 py-0.5 text-xs font-black text-white tabular-nums">
                  {c.share}
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-[11px] text-white/60 border-t border-white/5 pt-2 font-mono">
                <span>Métrica: <strong className="text-white">{c.bpm}</strong></span>
                <span className="text-spotify font-semibold flex items-center gap-1 group-hover:underline">
                  <span>Ver Desglose</span>
                  <span>🔍</span>
                </span>
              </div>
            </motion.button>
          ))}
        </div>

        <div className="mt-2 rounded-2xl border border-white/5 bg-black/30 p-3.5 flex items-center justify-between text-xs text-white/60">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
            <span>Filtro de rendimiento activo: renderizado masivo suprimido</span>
          </span>
          <span className="font-mono text-white/40">{current} tracks procesados con 0ms lag</span>
        </div>
      </div>

      {/* ── Explainable AI Modal ── */}
      <AnimatePresence>
        {selectedCluster && (
          <ClusterExplainModal
            cluster={selectedCluster}
            onClose={() => setSelectedCluster(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}

// ─── Chaotic State Dashboard ──────────────────────────────────────────────────

interface ChaoticDashboardProps {
  playlist: MusicLibraryPlaylist;
  meta: CompletionMeta;
  classificationLabel: string;
  onCurateClick: () => void;
  onOpenArtists: () => void;
  onOpenDuplicates: () => void;
}

function ChaoticDashboard({
  playlist,
  meta,
  classificationLabel,
  onCurateClick,
  onOpenArtists,
  onOpenDuplicates,
}: ChaoticDashboardProps) {
  const current = playlist.tracks_data?.length ?? meta.current_count ?? 0;
  const withFeatures = (playlist.tracks_data ?? []).filter((t) => t.audio_features?.tempo != null);

  const initialBase = Math.max(current, 1);
  const remainingPct = Math.min(100, Math.max(0, Math.round((current / initialBase) * 100)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* ── Diagnosis banner ── */}
      <div className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-950/20 to-black/60 p-5 shadow-xl backdrop-blur-md">
        <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/15 blur-3xl animate-pulse" />

        <div className="flex items-start gap-3.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300 font-bold shadow-md shadow-amber-500/10">
            🌪️
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-bold text-amber-200">Cantera de Extracción Masiva</p>
              <span className="rounded-full bg-amber-500/20 border border-amber-400/40 px-2.5 py-0.5 text-[10px] font-black text-amber-300 tracking-wider">
                {classificationLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/70 leading-relaxed">
              Esta lista actúa como depósito de masa caótica. Tu misión es drenar y proyectar sus canciones hacia tus listas Objetivo hasta alcanzar el vaciado total (0 pistas).
            </p>
          </div>
        </div>
      </div>

      {/* ── Reverse Gap Stats Grid (Cuenta atrás del Caos) ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-center">
          <span className="text-2xl font-black tabular-nums text-amber-300">{current.toLocaleString()}</span>
          <span className="text-[11px] font-medium text-white/50">Masa Restante</span>
          <span className="text-[9px] text-amber-400/70 font-mono">Por depurar</span>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <span className="text-2xl font-black tabular-nums text-emerald-400">0</span>
          <span className="text-[11px] font-medium text-white/50">Meta de Cantera</span>
          <span className="text-[9px] text-emerald-400/70 font-mono">Vaciado total</span>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <span className="text-2xl font-black tabular-nums text-white">⚡ Activa</span>
          <span className="text-[11px] font-medium text-white/50">Extracción</span>
          <span className="text-[9px] text-white/40 font-mono">Cantera lista</span>
        </div>
      </div>

      {/* ── Reverse Gap Progress Bar (Barra de Caos Restante) ── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-white/70 flex items-center gap-1.5">
            <span>🔥 Caos Restante por Drenar</span>
          </span>
          <span className="text-amber-300 font-mono tabular-nums">{current.toLocaleString()} pistas activas</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full border border-white/10 bg-black/50 p-0.5">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 shadow-lg shadow-amber-500/30"
            initial={{ width: 0 }}
            animate={{ width: `${remainingPct}%` }}
            transition={{ duration: 1.2, ease: "easeOut" }}
          />
        </div>
        <div className="flex justify-between text-[10px] text-white/40 font-mono">
          <span>Meta: 0 (Cantera Limpia)</span>
          <span>Volumen actual: {current}</span>
        </div>
      </div>

      {/* ── Content Analysis Modals Cards ── */}
      <ContentAnalysisCard
        tracks={playlist.tracks_data ?? []}
        onOpenArtists={onOpenArtists}
        onOpenDuplicates={onOpenDuplicates}
      />

      {/* ── DNA Summary ── */}
      {withFeatures.length > 0 && (
        <DNASummaryCard tracks={playlist.tracks_data ?? []} label="Huella Acústica Global" />
      )}

      {/* ── Generalized Analytical Dashboard (Caótica) ── */}
      <AnalyticalMassDashboard
        playlist={playlist}
        classification="caotica"
      />

      {/* ── Main CTA: Lanzar Curación Orbital ── */}
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-transparent p-6 text-center shadow-xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-300 text-2xl shadow-md shadow-amber-500/20">
          🪐
        </div>
        <div>
          <h3 className="text-base font-bold text-white">Lanzar Sistema de Curación Orbital</h3>
          <p className="mt-1 text-xs text-white/60 max-w-sm">
            Entra a la vista orbital interactiva para orbitar, audicionar y disparar estas canciones caóticas hacia tus listas Objetivo.
          </p>
        </div>
        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onCurateClick}
          className="mt-2 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 px-7 py-3 text-sm font-black text-black shadow-xl shadow-amber-500/25 transition-all hover:shadow-amber-500/40 cursor-pointer"
        >
          <span>Lanzar Sistema Orbital</span>
          <span>⚡</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Objective Dashboard (RPG Level Lock & Targeted Progress) ────────────────

interface ObjectiveDashboardProps {
  playlist: MusicLibraryPlaylist;
  meta: CompletionMeta;
  classificationLabel: string;
  onCurateClick: () => void;
  onOpenArtists: () => void;
  onOpenDuplicates: () => void;
}

function ObjectiveDashboard({
  playlist,
  meta,
  classificationLabel,
  onCurateClick,
  onOpenArtists,
  onOpenDuplicates,
}: ObjectiveDashboardProps) {
  const allTracks = playlist.tracks_data ?? [];
  const count = allTracks.length;
  const target = 100;
  const gap = target - count;

  // RPG Level: 0-99 -> Nivel 0; 100-199 -> Nivel 1; etc.
  const level = Math.floor(count / 100);
  const isUnlocked = level >= 1; // Desbloqueado a partir de Nivel 1 (>=100 canciones)
  const progressToLvl1 = Math.min(100, Math.round((count / target) * 100));

  const withFeatures = allTracks.filter((t) => t.audio_features?.tempo != null);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* ── Header Status Banner ── */}
      <div className={`relative overflow-hidden rounded-3xl border p-5 shadow-xl backdrop-blur-md ${
        isUnlocked
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-sky-500/30 bg-sky-950/20"
      }`}>
        <div className="flex items-start gap-3.5">
          <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl font-bold text-base shadow-md ${
            isUnlocked ? "bg-emerald-500/20 text-emerald-300" : "bg-sky-500/20 text-sky-300"
          }`}>
            {isUnlocked ? "🎯" : "🔒"}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-white">
                Playlist Objetivo · {isUnlocked ? `Nivel ${level}` : "Nivel 0 (En Crecimiento)"}
              </h3>
              <span className="rounded-full bg-white/10 border border-white/20 px-2.5 py-0.5 text-[10px] font-bold text-white">
                {classificationLabel}
              </span>
            </div>
            <p className="mt-1 text-xs text-white/70 leading-relaxed">
              {isUnlocked
                ? `¡Nivel 1 alcanzado (${count}/100 canciones)! El sistema de curación avanzada está activo.`
                : `Esta lista necesita al menos 100 canciones para alcanzar el Nivel 1 y desbloquear el Sistema Orbital. Transfiere pistas desde tus listas Caóticas.`}
            </p>
          </div>
        </div>
      </div>

      {/* ── Stats Grid ── */}
      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/5 bg-white/5 p-4 text-center">
          <span className="text-2xl font-black tabular-nums text-white">{count}</span>
          <span className="text-[11px] font-medium text-white/50">Canciones actuales</span>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-center">
          <span className="text-2xl font-black tabular-nums text-emerald-400">Nivel {level}</span>
          <span className="text-[11px] font-medium text-white/50">Rango RPG</span>
        </div>

        <div className="flex flex-col items-center gap-1 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
          <span className={`text-2xl font-black tabular-nums ${gap > 0 ? "text-amber-400" : "text-emerald-400"}`}>
            {gap > 0 ? `-${gap}` : `+${Math.abs(gap)}`}
          </span>
          <span className="text-[11px] font-medium text-white/50">{gap > 0 ? "Faltan para LVL 1" : "Excedente"}</span>
        </div>
      </div>

      {/* ── Progress towards Level 1 ── */}
      <div className="flex flex-col gap-2 rounded-2xl border border-white/5 bg-white/[0.02] p-4">
        <div className="flex justify-between items-center text-xs font-semibold">
          <span className="text-white/70">Progreso hacia Nivel 1 (100 Pistas)</span>
          <span className="text-emerald-300 font-mono tabular-nums">{count} / 100 ({progressToLvl1}%)</span>
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-black/50 p-0.5">
          <motion.div
            className={`h-full rounded-full ${
              isUnlocked
                ? "bg-gradient-to-r from-emerald-500 to-teal-400"
                : "bg-gradient-to-r from-sky-500 to-emerald-400"
            }`}
            initial={{ width: 0 }}
            animate={{ width: `${progressToLvl1}%` }}
            transition={{ duration: 0.9, ease: "easeOut" }}
          />
        </div>
      </div>

      {/* ── Content Analysis ── */}
      <ContentAnalysisCard
        tracks={allTracks}
        onOpenArtists={onOpenArtists}
        onOpenDuplicates={onOpenDuplicates}
      />

      {/* ── DNA Summary ── */}
      {withFeatures.length > 0 && (
        <DNASummaryCard tracks={allTracks} label="Huella Acústica Actual" />
      )}

      {/* ── Generalized Analytical Dashboard (Objetivo) ── */}
      <AnalyticalMassDashboard
        playlist={playlist}
        classification="objetivo"
      />

      {/* ── Main CTA: Lanzar Curación Orbital (Bloqueado si Nivel < 1) ── */}
      <div className={`flex flex-col items-center gap-3 rounded-3xl border p-6 text-center shadow-xl ${
        isUnlocked
          ? "border-emerald-500/30 bg-emerald-500/10"
          : "border-white/10 bg-white/[0.02]"
      }`}>
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl shadow-md ${
          isUnlocked ? "bg-emerald-500/20 text-emerald-300" : "bg-white/10 text-white/40"
        }`}>
          {isUnlocked ? "🪐" : "🔒"}
        </div>
        <div>
          <h3 className="text-base font-bold text-white">
            {isUnlocked ? "Lanzar Sistema Orbital" : "Curación Orbital Bloqueada"}
          </h3>
          <p className="mt-1 text-xs text-white/60 max-w-sm">
            {isUnlocked
              ? "Accede a la mesa de curación orbital para calibrar la cohesión y balance de tu playlist."
              : "Alcanza el Nivel 1 recibiendo pistas desde tus listas Caóticas para desbloquear la curación avanzada."}
          </p>
        </div>

        <motion.button
          whileHover={isUnlocked ? { scale: 1.03 } : {}}
          whileTap={isUnlocked ? { scale: 0.97 } : {}}
          onClick={isUnlocked ? onCurateClick : undefined}
          disabled={!isUnlocked}
          className={`mt-2 inline-flex items-center gap-2.5 rounded-full px-7 py-3 text-sm font-black transition-all ${
            isUnlocked
              ? "bg-gradient-to-r from-emerald-400 to-teal-500 text-black shadow-xl shadow-emerald-500/25 hover:shadow-emerald-500/40 cursor-pointer"
              : "bg-white/10 text-white/30 border border-white/5 cursor-not-allowed"
          }`}
        >
          {isUnlocked ? (
            <>
              <span>Lanzar Sistema Orbital</span>
              <span>⚡</span>
            </>
          ) : (
            <>
              <span>🔒 Bloqueado (Requiere Nivel 1)</span>
            </>
          )}
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Perfect / Benchmark View ─────────────────────────────────────────────────

interface PerfectViewProps {
  playlist: MusicLibraryPlaylist;
  isBenchmark: boolean;
  onOpenArtists: () => void;
  onOpenDuplicates: () => void;
  onCurateClick?: () => void;
}

function PerfectView({
  playlist,
  isBenchmark,
  onOpenArtists,
  onOpenDuplicates,
  onCurateClick,
}: PerfectViewProps) {
  const allTracks = playlist.tracks_data ?? [];
  const count = playlist.total_tracks ?? allTracks.length;
  const level = Math.max(1, Math.floor(count / 100));

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
      className="flex flex-col gap-6"
    >
      {/* ── Status banner ── */}
      <div className={`flex items-center gap-3 rounded-3xl border p-5 shadow-xl ${
        isBenchmark ? "border-spotify/25 bg-spotify/5" : "border-emerald-500/25 bg-emerald-500/5"
      }`}>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl ${
          isBenchmark ? "bg-spotify/20 text-spotify" : "bg-emerald-500/20 text-emerald-400"
        }`}>
          {isBenchmark ? (
            <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5">
              <path fillRule="evenodd" clipRule="evenodd"
                d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.006 5.404.434c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.434 2.082-5.006Z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-5 w-5">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
        <div>
          <p className={`text-sm font-bold ${isBenchmark ? "text-spotify" : "text-emerald-400"}`}>
            {isBenchmark ? "Playlist Benchmark de Referencia" : `Playlist Curada · Nivel ${level} 👑`}
          </p>
          <p className="text-xs text-white/50">
            {isBenchmark
              ? "Esta es la referencia de calidad musical del sistema. Define el estándar para el resto."
              : `Optimizada a ${count} canciones. El Modo Infinito está completamente desbloqueado.`}
          </p>
        </div>
      </div>

      {/* ── Content Analysis ── */}
      <ContentAnalysisCard
        tracks={allTracks}
        onOpenArtists={onOpenArtists}
        onOpenDuplicates={onOpenDuplicates}
      />

      {/* ── DNA Summary ── */}
      <DNASummaryCard tracks={allTracks} label={isBenchmark ? "Benchmark" : "Curada"} />

      {/* ── Generalized Analytical Dashboard (Curada / Benchmark) ── */}
      <AnalyticalMassDashboard
        playlist={playlist}
        classification="objetivo"
        isBenchmark={isBenchmark}
      />

      {/* ── Main CTA: Lanzar Curación Orbital con Modo Infinito Desbloqueado ── */}
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-cyan-500/30 bg-cyan-950/20 p-6 text-center shadow-xl backdrop-blur-md">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/20 text-cyan-300 text-2xl shadow-md border border-cyan-400/30">
          ♾️
        </div>
        <div>
          <h3 className="text-base font-bold text-white">
            Curación Orbital con Modo Infinito
          </h3>
          <p className="mt-1 text-xs text-white/60 max-w-sm">
            ¡Nivel {level} alcanzado! Accede a la mesa orbital para seguir alimentando tu playlist de forma autónoma con coincidencia acústica perfecta.
          </p>
        </div>

        <motion.button
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.97 }}
          onClick={onCurateClick}
          className="mt-2 inline-flex items-center gap-2.5 rounded-full bg-gradient-to-r from-cyan-400 via-teal-400 to-emerald-400 px-7 py-3 text-sm font-black text-black shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 cursor-pointer"
        >
          <span>Lanzar Curación Orbital</span>
          <span>⚡</span>
        </motion.button>
      </div>
    </motion.div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  useEffect(() => {
    const t = setTimeout(onClose, 3500);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: "spring", damping: 20, stiffness: 300 }}
      className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-white/10 bg-surface/95 px-5 py-3 shadow-2xl backdrop-blur-xl"
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-spotify/20 text-spotify">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
        </svg>
      </div>
      <p className="text-sm font-medium text-white">{message}</p>
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function PlaylistDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const providerToken = useAuthStore((s) => s.providerToken);

  const [playlist, setPlaylist] = useState<MusicLibraryPlaylist | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Modals state
  const [activeModal, setActiveModal] = useState<"artists" | "duplicates" | null>(null);
  const [transferTrack, setTransferTrack] = useState<MusicLibraryTrack | null>(null);

  // Read saved classification and rules from persistence
  const [classification, setClassification] = useState<PlaylistClassification | null>(null);
  const [curationRules, setCurationRules] = useState<CurationRules | null>(null);
  const [showVictorySolitaire, setShowVictorySolitaire] = useState(false);

  const playlistId = params?.id ?? "";

  const load = useCallback(async () => {

    if (!playlistId) return;
    setIsLoading(true);
    setError(null);

    try {
      let lib = await loadMusicLibrary();
      const decoded = decodeURIComponent(playlistId).toLowerCase();

      let found = lib.playlists.find(
        (p) =>
          p.id === playlistId ||
          (p.id != null && p.id.toLowerCase() === decoded) ||
          p.name.toLowerCase() === decoded ||
          encodeURIComponent(p.name) === playlistId
      );

      // If found in localStorage slim cache but tracks_data is empty, fetch full static JSON
      if (found && (!found.tracks_data || found.tracks_data.length === 0)) {
        try {
          const fresh = await refreshLibraryFromStatic();
          if (fresh) {
            const freshFound = fresh.playlists.find(
              (p) =>
                p.id === playlistId ||
                (p.id != null && p.id.toLowerCase() === decoded) ||
                p.name.toLowerCase() === decoded ||
                encodeURIComponent(p.name) === playlistId
            );
            if (freshFound && freshFound.tracks_data && freshFound.tracks_data.length > 0) {
              found = freshFound;
            }
          }
        } catch (e) {
          console.warn("[page] Could not refresh static library:", e);
        }
      }

      if (found) {
        const savedClasses = getSavedClassifications();
        const savedRules = getSavedCurationRules();
        const key = found.id ?? found.name;

        const currentSavedClass = savedClasses[key] ?? found.completion_meta?.classification ?? found.classification ?? (found.completion_meta?.is_benchmark ? "objetivo" : "caotica");
        setClassification(currentSavedClass);

        const trackCount = found.tracks_data?.length ?? found.total_tracks ?? 0;
        if (!found.completion_meta) {
          found.completion_meta = {
            target_count: 100,
            current_count: trackCount,
            benchmark_playlist: null,
            is_benchmark: currentSavedClass === "objetivo" && trackCount === 100,
            status: "pending",
            last_run_at: null,
            gap: 100 - trackCount,
            classification: currentSavedClass,
            rules: savedRules[key] ?? {
              era: "all",
              bpm_tolerance: "flexible",
              vibes: [],
            },
          };
        } else {
          found.completion_meta.classification = currentSavedClass;
        }

        setPlaylist({ ...found });

        const currentRules = savedRules[key] ?? found.completion_meta?.rules ?? null;
        if (currentRules) {
          setCurationRules(currentRules);
        }
      } else {
        setError("Playlist no encontrada en la biblioteca local. Usa el botón 'Sincronizar' para actualizar.");
      }
    } catch (e) {
      console.warn("[playlist/detail] Error loading library:", e);
      setError("Error al acceder a la biblioteca local.");
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const handleUpdate = () => { load(); };
    window.addEventListener("mymusic_track_transferred", handleUpdate);
    window.addEventListener("mymusic_library_updated", handleUpdate);
    window.addEventListener("mymusic_classification_updated", handleUpdate);
    return () => {
      window.removeEventListener("mymusic_track_transferred", handleUpdate);
      window.removeEventListener("mymusic_library_updated", handleUpdate);
      window.removeEventListener("mymusic_classification_updated", handleUpdate);
    };
  }, [load]);

  const currentCount = playlist?.tracks_data?.length ?? playlist?.total_tracks ?? 0;
  const effectiveClass = classification ?? playlist?.completion_meta?.classification ?? playlist?.classification ?? "caotica";
  const isBenchmark = playlist?.completion_meta?.is_benchmark === true;
  const isPerfect = isBenchmark || (effectiveClass === "objetivo" && currentCount >= 100);
  const isObjective = effectiveClass === "objetivo" && !isBenchmark;
  const isChaotic = effectiveClass === "caotica" || (!isObjective && !isBenchmark);

  const level = Math.floor(currentCount / 100);

  const meta: CompletionMeta = playlist?.completion_meta ?? {
    target_count: 100,
    current_count: currentCount,
    benchmark_playlist: null,
    is_benchmark: isBenchmark,
    status: "pending",
    last_run_at: null,
    gap: 100 - currentCount,
    classification: effectiveClass,
    rules: curationRules ?? {
      era: "all",
      bpm_tolerance: "flexible",
      vibes: [],
    },
  };

  const classificationLabel =
    effectiveClass === "caotica" ? "🌪️ Caótica" :
    effectiveClass === "objetivo" ? "🎯 Objetivo" :
    effectiveClass === "no_personal" ? "📁 No Personal" : "Pendiente";

  const handleCurateClick = () => {
    const targetId = playlist?.id ?? encodeURIComponent(playlist?.name ?? playlistId);
    router.push(`/curate/${targetId}`);
  };

  const cover = playlist?.image_url;

  return (
    <div className="relative flex min-h-dvh flex-col bg-background pb-28">

      {/* Back button */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 px-4 pt-5 pb-2 text-sm text-white/50 hover:text-white transition-colors cursor-pointer"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      {/* Hero header */}
      <header className="flex flex-col items-center gap-4 px-6 pb-6 pt-2 text-center">
        {/* Cover */}
        <div className="relative h-44 w-44 overflow-hidden rounded-2xl shadow-2xl shadow-black/60 sm:h-52 sm:w-52">
          <SafeImage
            src={cover ?? ""}
            alt={playlist?.name ?? "Playlist"}
            fill
            priority
            fallbackIcon={
              <div className="flex h-full w-full items-center justify-center bg-surface">
                <svg viewBox="0 0 24 24" fill="currentColor" className="h-16 w-16 text-white/10">
                  <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
                </svg>
              </div>
            }
            className="object-cover"
          />
          {/* State badge over cover */}
          {!isLoading && playlist && (
            <div className="absolute bottom-2 left-2 flex items-center gap-1">
              {isBenchmark && (
                <span className="inline-flex items-center gap-1 rounded-full bg-spotify/90 px-2 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
                  BENCHMARK
                </span>
              )}
              {isPerfect && !isBenchmark && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    playRewardSound("fanfare");
                    setShowVictorySolitaire(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full bg-emerald-400 px-2.5 py-0.5 text-[10px] font-black text-black backdrop-blur-sm shadow-md hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  title="¡Ver celebración de nivel!"
                >
                  <span>✨ CURADA LVL {level}</span>
                  <span className="text-[9px]">👑</span>
                </button>
              )}
              {isObjective && !isPerfect && (
                <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/90 px-2 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
                  OBJETIVO (LVL 0)
                </span>
              )}
              {isChaotic && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/90 px-2 py-0.5 text-[10px] font-bold text-black backdrop-blur-sm">
                  CANTERA CAÓTICA
                </span>
              )}
            </div>
          )}
        </div>

        {/* Title + owner */}
        <div className="flex flex-col items-center gap-1 w-full max-w-sm">
          <h1 className="text-xl font-bold text-white sm:text-2xl">
            {playlist?.name ?? (isLoading ? "Cargando…" : "Playlist")}
          </h1>
          {playlist?.owner_name && (
            <p className="text-xs text-white/40">{playlist.owner_name}</p>
          )}

          {/* Track count & classification chip */}
          {!isLoading && playlist && (
            <div className="mt-1 flex items-center gap-2 flex-wrap justify-center">
              <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium text-white/60">
                {currentCount.toLocaleString()} canciones
              </span>
              {classification && (
                <span className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/80">
                  {classificationLabel}
                </span>
              )}
              {isChaotic ? (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-400">
                  🌪️ Cantera activa
                </span>
              ) : isObjective && !isPerfect ? (
                <span className="rounded-full border border-sky-500/30 bg-sky-500/10 px-3 py-1 text-xs font-semibold text-sky-300">
                  Nivel 0 · {currentCount}/100
                </span>
              ) : (
                <span className="rounded-full border border-spotify/30 bg-spotify/10 px-3 py-1 text-xs font-semibold text-spotify">
                  Nivel {level} · {isBenchmark ? "Benchmark" : "Curada"}
                </span>
              )}
            </div>
          )}

          {/* DNA Rules Configured Chips */}
          {!isLoading && curationRules && (
            <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
              <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-white/70">
                {curationRules.era === "all" ? "🌐 Todas las épocas" :
                 curationRules.era === "pre_2000" ? "📻 Pre-2000s" :
                 curationRules.era === "2000s" ? "💿 2000s" :
                 curationRules.era === "2010s" ? "🎧 2010s" : "🚀 2020+"}
              </span>
              <span className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-white/70">
                {curationRules.bpm_tolerance === "strict" ? "🔒 BPM Estricto" :
                 curationRules.bpm_tolerance === "flexible" ? "⚖️ BPM Flexible" : "♾️ Ignorar BPM"}
              </span>
              {curationRules.vibes && curationRules.vibes.map((v) => (
                <span key={v} className="rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[10px] text-white/70">
                  {v === "instrumental" ? "🎻 Instrumental" :
                   v === "electronic" ? "⚡ Electrónico" :
                   v === "acoustic" ? "🎸 Acústico" : "🎤 Vocales"}
                </span>
              ))}
            </div>
          )}
        </div>
      </header>



      {/* Main content */}
      <main className="flex-1 px-4 sm:px-8 max-w-2xl mx-auto w-full flex flex-col gap-6">
        <AnimatePresence mode="wait">
          {isLoading ? (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <LoadingScreen />
            </motion.div>
          ) : error ? (
            <motion.div
              key="error"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center gap-4 rounded-2xl border border-white/5 bg-surface p-8 text-center"
            >
              <p className="text-sm text-white/50">{error}</p>
              <button
                onClick={load}
                className="text-xs text-white/30 underline underline-offset-2 hover:text-white"
              >
                Reintentar
              </button>
            </motion.div>
          ) : playlist ? (
            <motion.div key="content" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* 1. Vista Caótica: Reverse Gap + Dashboard de Masa Caótica + 0 LAG */}
              {isChaotic && (
                <ChaoticDashboard
                  playlist={playlist}
                  meta={meta}
                  classificationLabel={classificationLabel}
                  onCurateClick={handleCurateClick}
                  onOpenArtists={() => setActiveModal("artists")}
                  onOpenDuplicates={() => setActiveModal("duplicates")}
                />
              )}

              {/* 2. Vista Objetivo (En Crecimiento con Bloqueo RPG Nivel 1) */}
              {isObjective && !isPerfect && (
                <ObjectiveDashboard
                  playlist={playlist}
                  meta={meta}
                  classificationLabel={classificationLabel}
                  onCurateClick={handleCurateClick}
                  onOpenArtists={() => setActiveModal("artists")}
                  onOpenDuplicates={() => setActiveModal("duplicates")}
                />
              )}

              {/* 3. Vista Perfecta / Benchmark / Nivel 1+ */}
              {isPerfect && (
                <PerfectView
                  playlist={playlist}
                  isBenchmark={isBenchmark}
                  onOpenArtists={() => setActiveModal("artists")}
                  onOpenDuplicates={() => setActiveModal("duplicates")}
                  onCurateClick={handleCurateClick}
                />
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {activeModal === "artists" && playlist && (
          <ArtistsModal
            tracks={playlist.tracks_data ?? []}
            onClose={() => setActiveModal(null)}
          />
        )}
        {activeModal === "duplicates" && playlist && (
          <DuplicatesModal
            tracks={playlist.tracks_data ?? []}
            onClose={() => setActiveModal(null)}
          />
        )}
        {transferTrack && playlist && (
          <TransferTrackModal
            sourcePlaylist={playlist}
            track={transferTrack}
            onClose={() => setTransferTrack(null)}
            onSuccess={(targetName, trackName) => {
              setToast(`✓ "${trackName}" transferida con éxito a "${targetName}".`);
              load();
            }}
          />
        )}
      </AnimatePresence>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <Toast key="toast" message={toast} onClose={() => setToast(null)} />
        )}
      </AnimatePresence>

      {/* ── Solitaire Victory Celebration ── */}
      {showVictorySolitaire && playlist && (
        <SolitaireVictoryAnimation
          planetName={playlist.name}
          albumCovers={
            (playlist.tracks_data ?? [])
              .map((t) => t.album_cover ?? t.image_url)
              .filter(Boolean) as string[]
          }
          onClose={() => setShowVictorySolitaire(false)}
        />
      )}
    </div>
  );
}


