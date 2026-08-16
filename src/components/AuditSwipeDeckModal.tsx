"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import type { AuditedTrackItem } from "@/types/library";

interface AuditSwipeDeckModalProps {
  queue: AuditedTrackItem[];
  subtitle?: string;
  onApprove: (item: AuditedTrackItem) => void;
  onDiscard: (item: AuditedTrackItem) => void;
  onClose: () => void;
  onComplete?: () => void;
}

export function AuditSwipeDeckModal({
  queue,
  subtitle,
  onApprove,
  onDiscard,
  onClose,
  onComplete,
}: AuditSwipeDeckModalProps) {
  const currentItem = queue[0] ?? null;
  const nextItem = queue[1] ?? null;

  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);

  // ── Drag motion values ──
  const x = useMotionValue(0);
  const rotate = useTransform(x, [-250, 0, 250], [-22, 0, 22]);

  // Stamp Opacity Transforms
  const approveOpacity = useTransform(x, [40, 130], [0, 1]);
  const discardOpacity = useTransform(x, [-40, -130], [0, 1]);

  // ── Audio Preview Engine (Autoplay + 1.5s Crescendo Fade-in) ──
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const deezerCache = useRef<Map<string, string | null>>(new Map());

  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [isResolvingAudio, setIsResolvingAudio] = useState(false);

  // Smooth Volume Crescendo (0 -> 100% in 1.5 seconds)
  const startCrescendo = useCallback((audio: HTMLAudioElement) => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }

    audio.volume = 0;
    const playPromise = audio.play();
    if (playPromise) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          const durationMs = 1500;
          const stepMs = 50;
          const steps = durationMs / stepMs;
          const volStep = 1 / steps;
          let currentVol = 0;

          fadeIntervalRef.current = window.setInterval(() => {
            currentVol = Math.min(1, currentVol + volStep);
            if (audio) audio.volume = currentVol;
            if (currentVol >= 1) {
              if (fadeIntervalRef.current) {
                clearInterval(fadeIntervalRef.current);
                fadeIntervalRef.current = null;
              }
            }
          }, stepMs);
        })
        .catch((err) => {
          console.log("[audit-audio] Autoplay deferred until user interaction:", err?.name);
          setIsPlaying(false);
        });
    }
  }, []);

  // Quick Fade-out & Stop
  const stopAudio = useCallback(() => {
    if (fadeIntervalRef.current) {
      clearInterval(fadeIntervalRef.current);
      fadeIntervalRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setIsPlaying(false);
    setAudioProgress(0);
    setIsResolvingAudio(false);
  }, []);

  // Sync and autoplay preview whenever active card changes
  useEffect(() => {
    let isCancelled = false;
    stopAudio();

    if (!currentItem) return;

    const track = currentItem.track;
    const resolveAndPlay = async () => {
      let url = track.preview_url ?? null;

      // Deezer fallback query if Spotify preview is missing
      if (!url) {
        const cacheKey = `${track.name.toLowerCase()}:::${(track.artist || "").toLowerCase()}`;
        if (deezerCache.current.has(cacheKey)) {
          url = deezerCache.current.get(cacheKey) ?? null;
        } else {
          setIsResolvingAudio(true);
          try {
            const q = `${track.artist || ""} ${track.name}`;
            const res = await fetch(`/api/deezer-preview?q=${encodeURIComponent(q)}`);
            if (res.ok) {
              const data = await res.json();
              url = data?.previewUrl ?? null;
              deezerCache.current.set(cacheKey, url);
            } else {
              deezerCache.current.set(cacheKey, null);
            }
          } catch {
            deezerCache.current.set(cacheKey, null);
          }
          if (isCancelled) return;
          setIsResolvingAudio(false);
        }
      }

      if (!url || isCancelled) return;

      const audio = new Audio(url);
      audioRef.current = audio;

      const onTimeUpdate = () => {
        if (audio.duration && !isNaN(audio.duration)) {
          setAudioProgress((audio.currentTime / audio.duration) * 100);
        }
      };
      const onEnded = () => {
        setIsPlaying(false);
        setAudioProgress(0);
      };
      const onError = () => {
        setIsPlaying(false);
        setAudioProgress(0);
      };

      audio.addEventListener("timeupdate", onTimeUpdate);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      startCrescendo(audio);
    };

    resolveAndPlay();

    return () => {
      isCancelled = true;
      stopAudio();
    };
  }, [currentItem, startCrescendo, stopAudio]);

  const togglePlayPause = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const handleDragEnd = (_: unknown, info: { offset: { x: number }; velocity: { x: number } }) => {
    if (!currentItem) return;

    const swipeThreshold = 110;
    const velocityThreshold = 350;

    if (info.offset.x > swipeThreshold || info.velocity.x > velocityThreshold) {
      // Swipe Right -> Approve (Keep)
      setExitDirection("right");
      setTimeout(() => {
        onApprove(currentItem);
        setExitDirection(null);
        x.set(0);
      }, 200);
    } else if (info.offset.x < -swipeThreshold || info.velocity.x < -velocityThreshold) {
      // Swipe Left -> Discard (Return to Quarry)
      setExitDirection("left");
      setTimeout(() => {
        onDiscard(currentItem);
        setExitDirection(null);
        x.set(0);
      }, 200);
    } else {
      // Spring back
      x.set(0);
    }
  };

  const triggerSwipe = (dir: "left" | "right") => {
    if (!currentItem) return;
    setExitDirection(dir);
    setTimeout(() => {
      if (dir === "right") {
        onApprove(currentItem);
      } else {
        onDiscard(currentItem);
      }
      setExitDirection(null);
      x.set(0);
    }, 220);
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl select-none pointer-events-auto"
        onClick={() => {
          stopAudio();
          onClose();
        }}
      >
        <motion.div
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: "spring", damping: 26, stiffness: 340 }}
          className="relative w-full max-w-sm sm:max-w-md flex flex-col items-center rounded-3xl border-2 border-amber-500/40 bg-[#0c0a08]/95 p-5 sm:p-6 shadow-[0_0_90px_rgba(245,158,11,0.25)] backdrop-blur-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="w-full flex items-center justify-between pb-3 border-b border-amber-500/20">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-xl bg-amber-500/20 text-base border border-amber-400/40">
                🟠
              </span>
              <div>
                <h2 className="text-sm font-black text-white tracking-tight flex items-center gap-1.5">
                  <span>Modo Auditoría</span>
                  <span className="rounded-full bg-amber-400/20 border border-amber-400/50 px-2 py-0.2 text-[9px] font-bold text-amber-300">
                    Swipe
                  </span>
                </h2>
                <p className="text-[10px] text-amber-200/80 font-mono">
                  {subtitle ? `${subtitle} · ` : ""}
                  {queue.length} {queue.length === 1 ? "canción pendiente" : "canciones pendientes"}
                </p>
              </div>
            </div>

            <button
              onClick={() => {
                stopAudio();
                onClose();
              }}
              className="rounded-full bg-white/5 border border-white/10 p-1.5 text-white/50 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
            >
              ✕
            </button>
          </div>

          {/* Swipe Card Deck Area */}
          <div className="relative w-full h-[400px] sm:h-[430px] flex items-center justify-center my-3">
            {currentItem ? (
              <>
                {/* Background Next Card Preview */}
                {nextItem && (
                  <div className="absolute w-[92%] h-[94%] rounded-3xl border border-white/10 bg-[#16120e] p-4 flex flex-col items-center justify-between opacity-50 scale-95 translate-y-3 pointer-events-none shadow-xl">
                    <div className="w-36 h-36 rounded-2xl bg-black/40 overflow-hidden border border-white/10">
                      {nextItem.track.album_cover || nextItem.track.image_url ? (
                        <img
                          src={(nextItem.track.album_cover || nextItem.track.image_url) ?? undefined}
                          alt={nextItem.track.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-3xl">🎵</div>
                      )}
                    </div>
                    <div className="w-full text-center">
                      <p className="text-xs font-bold text-white/80 truncate">{nextItem.track.name}</p>
                      <p className="text-[10px] text-white/40 truncate">{nextItem.track.artist}</p>
                    </div>
                  </div>
                )}

                {/* Active Interactive Top Swipe Card with Atmospheric 1.4s Slow Entrance */}
                <motion.div
                  key={currentItem.id}
                  style={{ x, rotate }}
                  drag="x"
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.8}
                  onDragEnd={handleDragEnd}
                  initial={{ opacity: 0, scale: 0.86, y: 30, filter: "blur(4px)" }}
                  animate={
                    exitDirection === "right"
                      ? { x: 500, opacity: 0, rotate: 25, transition: { duration: 0.22 } }
                      : exitDirection === "left"
                      ? { x: -500, opacity: 0, rotate: -25, transition: { duration: 0.22 } }
                      : { opacity: 1, scale: 1, y: 0, filter: "blur(0px)" }
                  }
                  transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute z-20 w-full h-full rounded-3xl border-2 border-amber-400/50 bg-gradient-to-b from-[#1e1710] via-[#130f0a] to-[#0c0907] p-4 sm:p-5 flex flex-col items-center justify-between shadow-2xl cursor-grab active:cursor-grabbing touch-none"
                >
                  {/* Glowing STAMP: APROBAR (Swipe Right) */}
                  <motion.div
                    style={{ opacity: approveOpacity }}
                    className="pointer-events-none absolute top-5 left-5 z-30 rounded-2xl border-3 border-emerald-400 bg-emerald-950/90 px-3.5 py-1.5 shadow-[0_0_25px_rgba(16,185,129,0.8)] -rotate-12"
                  >
                    <span className="text-xs sm:text-sm font-black text-emerald-300 tracking-wider">
                      🟢 MANTENER
                    </span>
                  </motion.div>

                  {/* Glowing STAMP: DESCARTAR (Swipe Left) */}
                  <motion.div
                    style={{ opacity: discardOpacity }}
                    className="pointer-events-none absolute top-5 right-5 z-30 rounded-2xl border-3 border-rose-500 bg-rose-950/90 px-3.5 py-1.5 shadow-[0_0_25px_rgba(244,63,94,0.8)] rotate-12"
                  >
                    <span className="text-xs sm:text-sm font-black text-rose-300 tracking-wider">
                      🔴 DESCARTAR
                    </span>
                  </motion.div>

                  {/* Album Cover Art with Audio Wave Overlay */}
                  <motion.div
                    initial={{ scale: 0.94, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ duration: 1.4, ease: "easeOut" }}
                    onClick={togglePlayPause}
                    className="relative w-36 h-36 sm:w-44 sm:h-44 rounded-2xl overflow-hidden bg-black/60 border-2 border-amber-400/40 shadow-2xl shrink-0 mt-1 cursor-pointer group"
                  >
                    {currentItem.track.album_cover || currentItem.track.image_url ? (
                      <img
                        src={(currentItem.track.album_cover || currentItem.track.image_url) ?? undefined}
                        alt={currentItem.track.name}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-4xl">🎵</div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent pointer-events-none" />

                    {/* Audio Playback State Indicator & Equalizer */}
                    <div className="absolute bottom-2 inset-x-2 flex items-center justify-between pointer-events-none">
                      <div className="flex items-center gap-1.5 rounded-full bg-black/70 px-2.5 py-1 backdrop-blur-md border border-white/10">
                        {isResolvingAudio ? (
                          <span className="text-[9px] font-mono text-amber-300 animate-pulse">
                            Buscando audio...
                          </span>
                        ) : isPlaying ? (
                          <>
                            {/* Animated Equalizer */}
                            <div className="flex items-end gap-0.5 h-3">
                              {[0.4, 0.9, 0.6, 1.0, 0.7].map((h, i) => (
                                <motion.div
                                  key={i}
                                  className="w-0.5 rounded-full bg-amber-400"
                                  animate={{ height: [`${h * 20}%`, `${h * 100}%`, `${h * 30}%`] }}
                                  transition={{ duration: 0.5 + i * 0.1, repeat: Infinity, ease: "easeInOut" }}
                                />
                              ))}
                            </div>
                            <span className="text-[9px] font-bold text-amber-300 font-mono">
                              Preview
                            </span>
                          </>
                        ) : (
                          <span className="text-[9px] font-mono text-white/50">
                            ▶ Toca para reproducir
                          </span>
                        )}
                      </div>

                      {/* Progress Dot */}
                      {isPlaying && (
                        <div className="h-2 w-2 rounded-full bg-amber-400 animate-ping" />
                      )}
                    </div>

                    {/* Audio Progress Bar at bottom edge of artwork */}
                    <div className="absolute bottom-0 inset-x-0 h-1 bg-white/20">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-100"
                        style={{ width: `${audioProgress}%` }}
                      />
                    </div>
                  </motion.div>

                  {/* Track Info */}
                  <div className="w-full flex flex-col items-center text-center gap-0.5 my-1">
                    <h3 className="text-sm sm:text-base font-black text-white line-clamp-1" title={currentItem.track.name}>
                      {currentItem.track.name}
                    </h3>
                    <p className="text-xs font-semibold text-amber-300 line-clamp-1">
                      {currentItem.track.artist}
                    </p>
                    <span className="text-[10px] text-white/50 mt-0.5">
                      Planeta Destino: <strong className="text-emerald-400 font-bold">{currentItem.targetPlanetName}</strong>
                    </span>
                  </div>

                  {/* Reason Alert Badge */}
                  <div className="w-full rounded-xl bg-amber-500/15 border border-amber-400/30 px-2.5 py-1 text-center">
                    <span className="text-[9.5px] font-bold text-amber-200">
                      ⚠️ {currentItem.reason}
                    </span>
                  </div>

                  {/* Acoustic DNA Metrics */}
                  <div className="w-full grid grid-cols-3 gap-1 rounded-xl bg-black/30 border border-white/5 p-1.5 text-center text-[10px]">
                    <div>
                      <span className="text-[8px] text-white/40 block uppercase">BPM</span>
                      <span className="font-bold text-white font-mono">
                        {currentItem.track.audio_features?.tempo || currentItem.track.bpm
                          ? Math.round((currentItem.track.audio_features?.tempo || currentItem.track.bpm)!)
                          : "—"}
                      </span>
                    </div>
                    <div className="border-x border-white/10">
                      <span className="text-[8px] text-white/40 block uppercase">Energía</span>
                      <span className="font-bold text-amber-300 font-mono">
                        {currentItem.track.audio_features?.energy || currentItem.track.energy
                          ? `${Math.round(((currentItem.track.audio_features?.energy || currentItem.track.energy)!) * 100)}%`
                          : "—"}
                      </span>
                    </div>
                    <div>
                      <span className="text-[8px] text-white/40 block uppercase">Duración</span>
                      <span className="font-bold text-sky-300 font-mono">
                        {currentItem.track.duration_ms
                          ? `${Math.floor(currentItem.track.duration_ms / 60000)}:${Math.floor((currentItem.track.duration_ms % 60000) / 1000).toString().padStart(2, "0")}`
                          : "—"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              </>
            ) : (
              /* All Audits Completed State */
              <div className="flex flex-col items-center justify-center p-6 text-center gap-3">
                <span className="text-5xl animate-bounce">✨</span>
                <h3 className="text-base font-black text-white">¡Auditoría Completada!</h3>
                <p className="text-xs text-white/60 max-w-xs">
                  Todas las canciones dudosas han sido revisadas y organizadas con éxito.
                </p>
                <button
                  onClick={() => {
                    stopAudio();
                    if (onComplete) onComplete();
                    else onClose();
                  }}
                  className="mt-2 rounded-full bg-gradient-to-r from-emerald-400 to-teal-400 px-6 py-2.5 text-xs font-black text-black shadow-lg shadow-emerald-500/30 hover:scale-105 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span>¡Continuar y Ver Celebración!</span>
                  <span>👑</span>
                </button>
              </div>
            )}
          </div>

          {/* Bottom Swipe Quick Action Controls */}
          {currentItem && (
            <div className="w-full flex items-center justify-center gap-6 pt-2 border-t border-amber-500/20">
              {/* Reject / Swipe Left Button */}
              <button
                type="button"
                onClick={() => triggerSwipe("left")}
                className="flex flex-col items-center gap-1 group cursor-pointer"
                title="Descartar (Devolver a la Cantera Caótica)"
              >
                <div className="flex h-13 w-13 items-center justify-center rounded-full border-2 border-rose-500/60 bg-rose-500/20 text-rose-300 shadow-lg shadow-rose-500/30 group-hover:scale-110 group-active:scale-95 group-hover:bg-rose-500 group-hover:text-white transition-all text-xl font-black">
                  ✕
                </div>
                <span className="text-[9px] font-bold text-rose-300 uppercase tracking-wider">
                  Descartar
                </span>
              </button>

              <div className="text-[10px] text-white/30 font-mono">
                ← Swipe →
              </div>

              {/* Approve / Swipe Right Button */}
              <button
                type="button"
                onClick={() => triggerSwipe("right")}
                className="flex flex-col items-center gap-1 group cursor-pointer"
                title="Aprobar (Mantener en Planeta Objetivo)"
              >
                <div className="flex h-13 w-13 items-center justify-center rounded-full border-2 border-emerald-400/60 bg-emerald-500/20 text-emerald-300 shadow-lg shadow-emerald-500/30 group-hover:scale-110 group-active:scale-95 group-hover:bg-emerald-500 group-hover:text-black transition-all text-xl font-black">
                  ✓
                </div>
                <span className="text-[9px] font-bold text-emerald-300 uppercase tracking-wider">
                  Mantener
                </span>
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
