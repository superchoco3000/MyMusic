"use client";

import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ClientSyncProgress } from "@/lib/spotify/clientSync";
import { playRewardSound } from "@/lib/gamification/sounds";

interface ClientSyncModalProps {
  isOpen: boolean;
  progress: ClientSyncProgress | null;
  onClose: () => void;
  onLoginRequest?: () => void;
  isAuthMissing?: boolean;
}

export function ClientSyncModal({
  isOpen,
  progress,
  onClose,
  onLoginRequest,
  isAuthMissing,
}: ClientSyncModalProps) {
  const [playedSound, setPlayedSound] = useState(false);

  useEffect(() => {
    if (progress?.phase === "complete" && !playedSound) {
      playRewardSound("fanfare");
      setPlayedSound(true);
    }
    if (progress?.phase !== "complete") {
      setPlayedSound(false);
    }
  }, [progress?.phase, playedSound]);

  if (!isOpen) return null;

  const isDone = progress?.phase === "complete";
  const is403 =
    progress?.phase === "forbidden" ||
    (progress?.message && progress.message.includes("403")) ||
    (progress?.message && progress.message.includes("ERROR_403_FORBIDDEN"));
  const isError = (progress?.phase === "error" || isAuthMissing) && !is403;
  const isRateLimited = progress?.phase === "rate_limited";
  const percent = progress?.progressPercent ?? (isAuthMissing ? 0 : 5);
  const phaseLabel = isAuthMissing
    ? "Sesión de Spotify requerida"
    : is403
    ? "Permisos denegados (Error 403)"
    : progress?.phaseLabel ?? "Conectando con Spotify API...";

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
        <motion.div
          initial={{ opacity: 0, scale: 0.92, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.92, y: 20 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="relative w-full max-w-lg rounded-2xl border border-emerald-500/30 bg-[#0c0d14]/95 p-6 sm:p-7 shadow-[0_0_50px_rgba(16,185,129,0.18)] backdrop-blur-2xl flex flex-col gap-5 overflow-hidden"
        >
          {/* Ambient light ring */}
          <div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-emerald-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -right-24 h-48 w-48 rounded-full bg-spotify/20 blur-3xl" />

          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-500/15 border border-emerald-400/30 text-xl shadow-inner">
                {isDone ? (
                  <span className="text-2xl">✨</span>
                ) : is403 ? (
                  <span className="text-2xl">🔒</span>
                ) : isError ? (
                  <span className="text-2xl">🔑</span>
                ) : isRateLimited ? (
                  <span className="text-2xl animate-pulse">⏳</span>
                ) : (
                  <span className="text-2xl animate-spin">🛰️</span>
                )}
              </div>
              <div>
                <h3 className="text-base sm:text-lg font-black text-white tracking-tight flex items-center gap-2">
                  <span>Sincronización en Tiempo Real</span>
                  <span className="rounded-md bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-300">
                    Exportify Engine
                  </span>
                </h3>
                <p className="text-xs text-white/50">
                  {isAuthMissing
                    ? "Permiso de lectura y escritura de Spotify"
                    : is403
                    ? "Verificación de permisos de cuenta"
                    : "Extracción delta segura sin rate-limits"}
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="h-8 w-8 rounded-full bg-white/10 hover:bg-white/20 text-white/70 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* 403 Forbidden Elegant Alert */}
          {is403 ? (
            <div className="flex flex-col gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4 text-xs text-amber-100">
              <div className="flex items-center gap-2 font-bold text-amber-300">
                <span className="text-base">⚠️</span>
                <span>Error 403: Permisos denegados</span>
              </div>
              <p className="text-amber-200/90 leading-relaxed">
                Verifica los scopes de tu cuenta o que tu usuario de Spotify esté dado de alta en el panel de <strong>Spotify Developer Dashboard</strong> (si la app está en Modo Desarrollo).
              </p>
              <div className="flex justify-end pt-2">
                <button
                  onClick={onLoginRequest}
                  className="rounded-lg bg-amber-400 hover:bg-amber-300 text-black px-4 py-2 font-bold transition-transform active:scale-95 cursor-pointer"
                >
                  Reconectar cuenta
                </button>
              </div>
            </div>
          ) : isAuthMissing ? (
            /* Auth Missing Banner */
            <div className="flex flex-col gap-4 rounded-xl border border-spotify/30 bg-spotify/10 p-4 text-xs text-white/90">
              <p className="font-semibold leading-relaxed">
                Para descargar en tiempo real tus <strong>1.750 canciones</strong> y comparar todas tus playlists sin límites, conecta tu cuenta de Spotify:
              </p>
              <button
                onClick={onLoginRequest}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-spotify hover:bg-spotify/90 px-5 py-2.5 text-xs font-black text-black shadow-lg shadow-spotify/30 transition-transform active:scale-95 cursor-pointer"
              >
                <span>🔑 Conectar Cuenta de Spotify</span>
              </button>
            </div>
          ) : (
            <>
              {/* Animated Progress Bar */}
              <div className="flex flex-col gap-2">
                <div className="flex justify-between items-center text-xs font-mono">
                  <span className="text-emerald-400 font-bold truncate max-w-[70%]">
                    {phaseLabel}
                  </span>
                  <span className="text-white/70 font-black">{percent}%</span>
                </div>

                <div className="relative h-3 w-full rounded-full bg-black/60 border border-white/10 overflow-hidden p-0.5">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percent}%` }}
                    transition={{ duration: 0.35, ease: "easeOut" }}
                    className={`h-full rounded-full ${
                      isError
                        ? "bg-rose-500"
                        : isRateLimited
                        ? "bg-amber-400"
                        : isDone
                        ? "bg-gradient-to-r from-emerald-400 via-spotify to-teal-300 shadow-[0_0_15px_rgba(16,185,129,0.8)]"
                        : "bg-gradient-to-r from-emerald-500 to-spotify"
                    }`}
                  />
                </div>

                {progress?.currentPlaylistName && (
                  <p className="text-[11px] text-white/40 font-mono truncate">
                    Procesando: <span className="text-white/80 font-semibold">{progress.currentPlaylistName}</span>
                  </p>
                )}
              </div>

              {/* Telemetry Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Liked Songs</span>
                  <span className="text-sm sm:text-base font-black text-emerald-300 font-mono mt-0.5">
                    {progress?.stats?.likedSongsTotal ? progress.stats.likedSongsTotal.toLocaleString() : "..."}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Playlists</span>
                  <span className="text-sm sm:text-base font-black text-white font-mono mt-0.5">
                    {progress?.stats ? `${progress.stats.playlistsScanned} / ${progress.stats.playlistsTotal || "..."}` : "..."}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Sin cambios</span>
                  <span className="text-sm sm:text-base font-black text-teal-300 font-mono mt-0.5">
                    {progress?.stats?.playlistsUnchanged ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Canciones (+)</span>
                  <span className="text-sm sm:text-base font-black text-emerald-400 font-mono mt-0.5">
                    +{progress?.stats?.tracksAdded ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Canciones (-)</span>
                  <span className="text-sm sm:text-base font-black text-rose-400 font-mono mt-0.5">
                    -{progress?.stats?.tracksRemoved ?? 0}
                  </span>
                </div>

                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 flex flex-col">
                  <span className="text-[10px] text-white/40 uppercase font-black tracking-wider">Depuradas</span>
                  <span className="text-sm sm:text-base font-black text-amber-300 font-mono mt-0.5">
                    {progress?.stats?.playlistsRemoved ?? 0}
                  </span>
                </div>
              </div>

              {/* Rate limit warning */}
              {isRateLimited && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 flex items-center gap-3">
                  <span className="text-2xl">⏳</span>
                  <div className="text-xs text-amber-200">
                    <p className="font-bold">Pausa de protección activa ({progress?.retryAfterSeconds}s)</p>
                    <p className="text-amber-300/70">Spotify ha solicitado una breve pausa. La sincronización se reanudará automáticamente.</p>
                  </div>
                </div>
              )}

              {/* Error notice */}
              {isError && progress?.message && (
                <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-3.5 text-xs text-rose-200">
                  <p className="font-bold">Aviso durante la sincronización:</p>
                  <p className="text-rose-300/80 mt-0.5">{progress.message}</p>
                </div>
              )}
            </>
          )}

          {/* Footer Actions */}
          <div className="flex justify-end gap-3 mt-1">
            {isDone ? (
              <button
                onClick={onClose}
                className="w-full sm:w-auto rounded-lg bg-spotify hover:bg-spotify/90 px-6 py-2.5 text-sm font-black text-black shadow-lg shadow-spotify/30 transition-transform active:scale-95 cursor-pointer"
              >
                ✓ Aplicar y Continuar
              </button>
            ) : is403 || isError ? (
              <button
                onClick={onClose}
                className="w-full sm:w-auto rounded-lg bg-white/10 hover:bg-white/20 px-6 py-2.5 text-sm font-bold text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            ) : (
              <div className="flex items-center gap-2 text-xs text-white/40 font-mono">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-400 animate-ping" />
                Sincronizando catálogo en tiempo real...
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
