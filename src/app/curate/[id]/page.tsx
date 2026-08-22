"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence, useMotionValue } from "framer-motion";
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
import { getPlaylistRPGState, type RPGStateResult } from "@/lib/gamification/cohesion";
import { SolitaireVictoryAnimation } from "@/components/SolitaireVictoryAnimation";
import { AuditSwipeDeckModal } from "@/components/AuditSwipeDeckModal";
import { playRewardSound } from "@/lib/gamification/sounds";
import { syncChaoticPlaylist } from "@/lib/spotify/clientSync";

import {
  calculateTargetAcousticProfile,
  getInfiniteRecommendations,
  scoreTrackAffinity,
} from "@/lib/gamification/recommendations";
import type {
  MusicLibraryPlaylist,
  MusicLibraryTrack,
  CurationRules,
  AuditedTrackItem,
} from "@/types/library";

const PITCH_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

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

interface PlanetVisuals {
  auraColor: string;
  borderColor: string;
  glowColor: string;
  badgeColor: string;
  icon: string;
}

function getPlanetVisuals(rpgState: RPGStateResult, idx: number): PlanetVisuals {
  const { category, level } = rpgState;
  if (category === "perfect") {
    if (level >= 10) {
      return {
        auraColor: "from-yellow-500/50 via-amber-500/25 to-transparent",
        borderColor: "border-yellow-400 shadow-yellow-500/50",
        glowColor: "shadow-[0_0_40px_rgba(234,179,8,0.5)]",
        badgeColor: "bg-yellow-400 text-black font-black",
        icon: "👑",
      };
    }
    return {
      auraColor: "from-purple-500/50 via-fuchsia-500/25 to-transparent",
      borderColor: "border-purple-400/70 shadow-purple-500/40",
      glowColor: "shadow-[0_0_35px_rgba(168,85,247,0.4)]",
      badgeColor: "bg-purple-500/20 border border-purple-400/40 text-purple-300",
      icon: "🪐",
    };
  }
  if (category === "almost_perfect") {
    return {
      auraColor: "from-lime-500/50 via-emerald-500/25 to-transparent",
      borderColor: "border-lime-400/70 shadow-lime-500/40",
      glowColor: "shadow-[0_0_35px_rgba(163,230,53,0.4)]",
      badgeColor: "bg-lime-500/20 border border-lime-400/40 text-lime-300",
      icon: "🌍",
    };
  }

  const palettes = [
    {
      auraColor: "from-emerald-500/50 via-teal-500/25 to-transparent",
      borderColor: "border-emerald-400/70 shadow-emerald-500/40",
      glowColor: "shadow-[0_0_35px_rgba(16,185,129,0.4)]",
      badgeColor: "bg-emerald-500/20 border border-emerald-400/40 text-emerald-300",
      icon: "🎯",
    },
    {
      auraColor: "from-cyan-500/50 via-blue-500/25 to-transparent",
      borderColor: "border-cyan-400/70 shadow-cyan-500/40",
      glowColor: "shadow-[0_0_35px_rgba(6,182,212,0.4)]",
      badgeColor: "bg-cyan-500/20 border border-cyan-400/40 text-cyan-300",
      icon: "💠",
    },
    {
      auraColor: "from-sky-500/50 via-indigo-500/25 to-transparent",
      borderColor: "border-sky-400/70 shadow-sky-500/40",
      glowColor: "shadow-[0_0_35px_rgba(56,189,248,0.4)]",
      badgeColor: "bg-sky-500/20 border border-sky-400/40 text-sky-300",
      icon: "🌌",
    },
  ];
  return palettes[idx % palettes.length];
}


interface VerdictState {
  planetId: string;
  type: "accepted" | "study";
  trackName: string;
  planetName: string;
}

export default function OrbitalCuratePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const providerToken = useAuthStore((s) => s.providerToken);

  const playlistId = params?.id ?? "";

  const [playlist, setPlaylist] = useState<MusicLibraryPlaylist | null>(null);
  const [classification, setClassification] = useState<PlaylistClassification | null>(null);
  const [curationRules, setCurationRules] = useState<CurationRules | null>(null);
  const [targetPlaylists, setTargetPlaylists] = useState<MusicLibraryPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Queue and current active track
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const [currentTrack, setCurrentTrack] = useState<MusicLibraryTrack | null>(null);
  const [direction, setDirection] = useState<1 | -1>(1);

  // Drag & Black Hole Absorption states
  const [isDraggingCore, setIsDraggingCore] = useState(false);
  const [hoveredPlanetId, setHoveredPlanetId] = useState<string | null>(null);
  const [isAbsorbing, setIsAbsorbing] = useState(false);
  const [absorbDelta, setAbsorbDelta] = useState<{ x: number; y: number } | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictState>>({});
  const [shockwaves, setShockwaves] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<string | null>(null);

  // Modo Auditoría (Filtro Naranja) state
  const [auditQueue, setAuditQueue] = useState<AuditedTrackItem[]>([]);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false);

  // Solitaire Level 1 Victory Celebration state
  const [celebratingPlanet, setCelebratingPlanet] = useState<{
    name: string;
    covers: string[];
  } | null>(null);

  // Orbit rotation pause
  const [isOrbitPaused, setIsOrbitPaused] = useState(false);

  // Responsive window tracking for adaptive orbital geometry
  const [windowWidth, setWindowWidth] = useState<number>(1024);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setWindowWidth(window.innerWidth);
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const isMobile = windowWidth < 640;
  const isTablet = windowWidth >= 640 && windowWidth < 1024;
  // Adaptive radius calculated dynamically from viewport width to prevent phone overflow
  const radiusPx = isMobile
    ? Math.min(Math.max(windowWidth * 0.32, 105), 135)
    : isTablet
    ? Math.min(windowWidth * 0.36, 240)
    : 380;
  const orbitDiameter = radiusPx * 2;


  // Drag motion values
  const dragX = useMotionValue(0);
  const dragY = useMotionValue(0);
  const coreRef = useRef<HTMLDivElement>(null);

  // Load chaotic playlist and target playlists
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
          encodeURIComponent(p.name).toLowerCase() === decoded
      );

      if (found && (!found.tracks_data || found.tracks_data.length === 0)) {
        const fresh = await refreshLibraryFromStatic();
        if (fresh) {
          const freshFound = fresh.playlists.find(
            (p) =>
              p.id === playlistId ||
              (p.id != null && p.id.toLowerCase() === decoded) ||
              p.name.toLowerCase() === decoded ||
              encodeURIComponent(p.name).toLowerCase() === decoded
          );
          if (freshFound?.tracks_data && freshFound.tracks_data.length > 0) {
            found = freshFound;
          }
        }
      }

      if (found) {
        const savedClasses = getSavedClassifications();
        const savedRules = getSavedCurationRules();
        const key = found.id ?? found.name;
        const currentClass = savedClasses[key] ?? found.completion_meta?.classification ?? found.classification ?? "caotica";

        setClassification(currentClass);
        setCurationRules(savedRules[key] ?? found.completion_meta?.rules ?? null);

        // Fetch all Target Objective playlists
        const targets = await getTargetPlaylists(key);
        setTargetPlaylists(targets);

        // JIT Deep Fetch: If tracks_data is empty and it is chaotic (or Liked Songs), fetch from Spotify!
        let tracks = found.tracks_data ?? [];
        if (tracks.length === 0 && (currentClass === "caotica" || found.id === "spotify_liked_songs") && providerToken) {
          try {
            const freshTracks = await syncChaoticPlaylist(key, providerToken);
            if (freshTracks && freshTracks.length > 0) {
              tracks = freshTracks;
              found.tracks_data = freshTracks;
              found.total_tracks = freshTracks.length;
            }
          } catch (e) {
            console.warn("[curate] JIT chaotic sync error:", e);
          }
        }

        setPlaylist({ ...found, tracks_data: tracks });

        // Pick initial random track from tracks_data
        if (tracks.length > 0) {
          const randIdx = Math.floor(Math.random() * tracks.length);
          const initial = tracks[randIdx];
          setCurrentTrack(initial);
          setProcessedIds(new Set([initial.id ?? `${initial.name}:::${initial.artist}`]));
        }
      } else {

        setError("Playlist no encontrada en la biblioteca.");
      }
    } catch (err) {
      console.error("[curate] Error loading playlist:", err);
      setError("Error al cargar los datos de la playlist.");
    } finally {
      setIsLoading(false);
    }
  }, [playlistId]);

  useEffect(() => {
    load();
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("audit") === "1") {
        setIsAuditModalOpen(true);
      }
    }
  }, [load]);

  // ─── PROMPT 6: Modo Infinito Engine State ───
  const [infinitePlanetId, setInfinitePlanetId] = useState<string | null>(null);
  const [currentTrackAffinity, setCurrentTrackAffinity] = useState<{
    score: number;
    reason: string;
    targetName: string;
  } | null>(null);

  const allTracks = useMemo(() => playlist?.tracks_data ?? [], [playlist]);

  // Remaining unvisited tracks in pool
  const remainingTracks = useMemo(() => {
    return allTracks.filter((t) => {
      const key = t.id ?? `${t.name}:::${t.artist}`;
      return !processedIds.has(key);
    });
  }, [allTracks, processedIds]);

  // Pick Next Track (Standard or Infinite Mode Recommendation)
  const advanceToNextTrack = useCallback(() => {
    if (allTracks.length === 0) return;
    setDirection(1);

    // ── Infinite Mode Recommendation Path ──
    if (infinitePlanetId) {
      const targetPl = targetPlaylists.find((p) => (p.id ?? p.name) === infinitePlanetId);
      if (targetPl) {
        const profile = calculateTargetAcousticProfile(targetPl);
        const candidatePool = remainingTracks.length > 0 ? remainingTracks : allTracks;
        const recommendations = getInfiniteRecommendations(candidatePool, profile, processedIds);

        if (recommendations.length > 0) {
          const topMatch = recommendations[0];
          const nextKey = topMatch.track.id ?? `${topMatch.track.name}:::${topMatch.track.artist}`;
          setProcessedIds((prev) => new Set(prev).add(nextKey));
          setCurrentTrack(topMatch.track);
          setCurrentTrackAffinity({
            score: topMatch.affinityScore,
            reason: topMatch.affinityReason,
            targetName: targetPl.name,
          });
          dragX.set(0);
          dragY.set(0);
          setIsAbsorbing(false);
          setAbsorbDelta(null);
          return;
        }
      }
    }

    // ── Standard Random Selection Path ──
    setCurrentTrackAffinity(null);
    if (remainingTracks.length > 0) {
      const randIdx = Math.floor(Math.random() * remainingTracks.length);
      const next = remainingTracks[randIdx];
      const nextKey = next.id ?? `${next.name}:::${next.artist}`;
      setProcessedIds((prev) => new Set(prev).add(nextKey));
      setCurrentTrack(next);
    } else {
      // Pool cycle reset
      const randIdx = Math.floor(Math.random() * allTracks.length);
      const next = allTracks[randIdx];
      const nextKey = next.id ?? `${next.name}:::${next.artist}`;
      setProcessedIds(new Set([nextKey]));
      setCurrentTrack(next);
    }
    dragX.set(0);
    dragY.set(0);
    setIsAbsorbing(false);
    setAbsorbDelta(null);
  }, [allTracks, remainingTracks, infinitePlanetId, targetPlaylists, processedIds, dragX, dragY]);

  // Toggle Infinite Mode on a target planet
  const toggleInfiniteMode = useCallback(
    (planetKey: string, planetName: string) => {
      const targetPl = targetPlaylists.find((p) => (p.id ?? p.name) === planetKey);
      const count = targetPl?.tracks_data?.length ?? targetPl?.total_tracks ?? 0;

      if (count < 100) {
        setToast(`🔒 El Modo Infinito requiere Nivel 1 (100 canciones). Progreso: ${count}/100`);
        return;
      }

      if (infinitePlanetId === planetKey) {
        setInfinitePlanetId(null);
        setCurrentTrackAffinity(null);
        setToast("♾️ Modo Infinito desactivado");
      } else {
        setInfinitePlanetId(planetKey);
        playRewardSound("fanfare");
        setToast(`♾️ Modo Infinito activado para "${planetName}" (Nivel ${Math.max(1, Math.floor(count / 100))})`);

        // Immediately pick the best matching track for this target
        if (targetPl) {
          const profile = calculateTargetAcousticProfile(targetPl);
          const candidatePool = remainingTracks.length > 0 ? remainingTracks : allTracks;
          const recs = getInfiniteRecommendations(candidatePool, profile, new Set());
          if (recs.length > 0) {
            const top = recs[0];
            const nextKey = top.track.id ?? `${top.track.name}:::${top.track.artist}`;
            setProcessedIds((prev) => new Set(prev).add(nextKey));
            setCurrentTrack(top.track);
            setCurrentTrackAffinity({
              score: top.affinityScore,
              reason: top.affinityReason,
              targetName: targetPl.name,
            });
            dragX.set(0);
            dragY.set(0);
            setIsAbsorbing(false);
            setAbsorbDelta(null);
          }
        }
      }
    },
    [infinitePlanetId, targetPlaylists, remainingTracks, allTracks, dragX, dragY]
  );

  // Handle Manual Next Track Selection
  const handleNextTrack = useCallback(() => {
    if (isAbsorbing) return;
    advanceToNextTrack();
  }, [isAbsorbing, advanceToNextTrack]);

  // Keyboard shortcut listener: Space or ArrowRight or N to skip track
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.code === "Space" || e.code === "ArrowRight" || e.key === "n" || e.key === "N") {
        e.preventDefault();
        handleNextTrack();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleNextTrack]);

  // ─── Deezer Preview Fallback Engine & In-Memory Cache ───
  const deezerPreviewCache = useRef<Map<string, string | null>>(new Map());

  const fetchDeezerPreview = useCallback(
    async (trackName: string, artistName: string): Promise<string | null> => {
      const cacheKey = `${trackName.trim().toLowerCase()}:::${artistName.trim().toLowerCase()}`;
      if (deezerPreviewCache.current.has(cacheKey)) {
        return deezerPreviewCache.current.get(cacheKey) ?? null;
      }

      try {
        const q = `${artistName} ${trackName}`;
        const res = await fetch(`/api/deezer-preview?q=${encodeURIComponent(q)}`);
        if (!res.ok) {
          deezerPreviewCache.current.set(cacheKey, null);
          return null;
        }
        const json = await res.json();
        const url = json?.previewUrl ?? null;
        deezerPreviewCache.current.set(cacheKey, url);
        return url;
      } catch (e) {
        console.warn("[deezer] Fallback error:", e);
        deezerPreviewCache.current.set(cacheKey, null);
        return null;
      }
    },
    []
  );

  // Audio preview playback engine
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fadeIntervalRef = useRef<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioProgress, setAudioProgress] = useState(0);
  const [activePreviewUrl, setActivePreviewUrl] = useState<string | null>(null);
  const [isFetchingPreview, setIsFetchingPreview] = useState(false);

  // Stop & clear audio preview
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
    setActivePreviewUrl(null);
    setIsFetchingPreview(false);
  }, []);

  // Autoplay with 1.5-second smooth Crescendo Fade-in
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
          // Autoplay policy: Browser deferred playback until user interacts
          console.log("[audio] Autoplay deferred until interaction:", err?.name);
          setIsPlaying(false);
        });
    }
  }, []);

  // Sync audio with active track & resolve Deezer fallback if needed
  useEffect(() => {
    let isCancelled = false;

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
    setActivePreviewUrl(null);

    if (!currentTrack) return;

    const resolveAndSetupAudio = async () => {
      let url = currentTrack.preview_url ?? null;

      if (!url) {
        setIsFetchingPreview(true);
        url = await fetchDeezerPreview(currentTrack.name, currentTrack.artist || "");
        if (isCancelled) return;
        setIsFetchingPreview(false);
      }

      if (!url || isCancelled) return;

      setActivePreviewUrl(url);
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

      // Start Autoplay with smooth volume crescendo
      startCrescendo(audio);
    };

    resolveAndSetupAudio();

    return () => {
      isCancelled = true;
      if (fadeIntervalRef.current) {
        clearInterval(fadeIntervalRef.current);
        fadeIntervalRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, [currentTrack, fetchDeezerPreview, startCrescendo]);

  // Audio Play / Pause Toggle (with drag & pointer isolation)
  const togglePlayPreview = useCallback(
    (e: React.MouseEvent | React.PointerEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!audioRef.current || !activePreviewUrl) return;

      if (isPlaying) {
        audioRef.current.pause();
        setIsPlaying(false);
      } else {
        audioRef.current
          .play()
          .then(() => setIsPlaying(true))
          .catch((err) => {
            console.warn("[audio] Could not play preview:", err);
            setIsPlaying(false);
          });
      }
    },
    [isPlaying, activePreviewUrl]
  );

  // ─── Drag & Transfer Execution Engine ───
  const executeTransfer = useCallback(
    async (targetPlanetId: string, targetPlanetEl?: HTMLElement | null) => {
      if (!currentTrack || !playlist || isAbsorbing) return;

      // Cut audio immediately upon absorption
      stopAudio();

      const targetPl = targetPlaylists.find(
        (p) => (p.id ?? p.name) === targetPlanetId
      );
      if (!targetPl) return;

      // Play custom Web Audio synthetic reward sound based on target playlist RPG state
      const savedClasses = getSavedClassifications();
      const targetClass = savedClasses[targetPlanetId] ?? targetPl.completion_meta?.classification ?? targetPl.classification;
      const targetRpg = getPlaylistRPGState(targetPl, targetClass);

      const rewardCategory =
        targetRpg.category === "perfect" || targetRpg.category === "almost_perfect"
          ? "perfect"
          : targetRpg.category === "target"
          ? "target"
          : targetRpg.category === "chaotic"
          ? "chaotic"
          : "default";

      playRewardSound(rewardCategory);

      let deltaX = 0;
      let deltaY = -120; // Default vertical flight for mobile if element not measured

      if (coreRef.current && targetPlanetEl) {
        const coreRect = coreRef.current.getBoundingClientRect();
        const planetRect = targetPlanetEl.getBoundingClientRect();
        deltaX = planetRect.left + planetRect.width / 2 - (coreRect.left + coreRect.width / 2);
        deltaY = planetRect.top + planetRect.height / 2 - (coreRect.top + coreRect.height / 2);
      }

      // 1. Trigger Vortex Absorption Animation
      setIsAbsorbing(true);
      setAbsorbDelta({ x: deltaX, y: deltaY });

      // 2. Perform Atomic Track Transfer
      const sourceKey = playlist.id ?? playlist.name;
      const transferRes = await moveTrackToTarget(sourceKey, currentTrack, targetPlanetId);
      console.info("[curate] Transferred track:", transferRes);

      // Remove transferred track from current chaotic playlist state
      setPlaylist((prev) => {
        if (!prev) return prev;
        const remaining = (prev.tracks_data ?? []).filter(
          (t) =>
            (currentTrack.id && t.id !== currentTrack.id) ||
            (!currentTrack.id && (t.name !== currentTrack.name || t.artist !== currentTrack.artist))
        );
        return {
          ...prev,
          total_tracks: remaining.length,
          tracks_data: remaining,
        };
      });

      // 3. Compute Verdict (Aceptada / En Estudio)
      const trackBpm = currentTrack.audio_features?.tempo ?? currentTrack.bpm;
      const trackEnergy = currentTrack.audio_features?.energy ?? currentTrack.energy;
      const isAcousticMatch =
        typeof trackBpm === "number" && typeof trackEnergy === "number" && trackEnergy > 0.4;
      const verdictType: "accepted" | "study" = isAcousticMatch ? "accepted" : "study";

      // Enqueue to Modo Auditoría if classified as study
      if (verdictType === "study") {
        setAuditQueue((prev) => [
          ...prev,
          {
            id: `${currentTrack.id ?? currentTrack.name}-${Date.now()}`,
            track: currentTrack,
            targetPlanetId,
            targetPlanetName: targetPl.name,
            reason:
              typeof trackEnergy === "number" && trackEnergy <= 0.4
                ? "Baja energía detectada (<40%)"
                : "Parámetros acústicos fuera de rango de referencia",
            timestamp: Date.now(),
          },
        ]);
      }

      // Check Level 1 Victory Milestone (100 songs)
      const prevCount = targetPl.tracks_data?.length ?? targetPl.total_tracks ?? 0;
      const newCount = prevCount + 1;
      if (newCount === 100) {
        const covers = (targetPl.tracks_data ?? [])
          .map((t) => t.album_cover ?? t.image_url)
          .filter(Boolean) as string[];
        if (currentTrack.album_cover || currentTrack.image_url) {
          covers.unshift((currentTrack.album_cover || currentTrack.image_url)!);
        }

        setTimeout(() => {
          playRewardSound("perfect");
          setCelebratingPlanet({
            name: targetPl.name,
            covers: covers.length > 0 ? covers : [],
          });
        }, 750);
      }

      // 4. Trigger Planet Shockwave & Verdict Pop-up
      setShockwaves((prev) => ({ ...prev, [targetPlanetId]: Date.now() }));
      setVerdicts((prev) => ({
        ...prev,
        [targetPlanetId]: {
          planetId: targetPlanetId,
          type: verdictType,
          trackName: currentTrack.name,
          planetName: targetPl.name,
        },
      }));

      setToast(
        verdictType === "accepted"
          ? `🟢 ¡Absorbida! "${currentTrack.name}" transferida a ${targetPl.name}`
          : `🟠 "${currentTrack.name}" en estudio transferida a ${targetPl.name}`
      );

      // Refresh targets counts locally
      setTargetPlaylists((prev) =>
        prev.map((tp) => {
          if ((tp.id ?? tp.name) === targetPlanetId) {
            const count = tp.tracks_data?.length ?? tp.total_tracks ?? 0;
            return {
              ...tp,
              total_tracks: count + 1,
              tracks_data: [...(tp.tracks_data ?? []), currentTrack],
            };
          }
          return tp;
        })
      );

      // Clear verdict after 3.5s
      setTimeout(() => {
        setVerdicts((prev) => {
          const next = { ...prev };
          delete next[targetPlanetId];
          return next;
        });
      }, 3500);

      // 5. Auto-advance to Next Track after absorption completes (600ms)
      setTimeout(() => {
        advanceToNextTrack();
      }, 600);
    },
    [currentTrack, playlist, isAbsorbing, targetPlaylists, advanceToNextTrack]
  );

  const handleApproveAudit = (item: AuditedTrackItem) => {
    setAuditQueue((prev) => prev.filter((a) => a.id !== item.id));
    setToast(`🟢 "${item.track.name}" aprobada definitivamente en ${item.targetPlanetName}`);
    playRewardSound("perfect");
  };

  const handleDiscardAudit = async (item: AuditedTrackItem) => {
    if (!playlist) return;
    const sourceKey = playlist.id ?? playlist.name;
    await moveTrackToTarget(item.targetPlanetId, item.track, sourceKey);

    // Add track back to chaotic playlist in state
    setPlaylist((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        total_tracks: (prev.tracks_data?.length ?? prev.total_tracks ?? 0) + 1,
        tracks_data: [...(prev.tracks_data ?? []), item.track],
      };
    });

    // Decrement count in target planet
    setTargetPlaylists((prev) =>
      prev.map((tp) => {
        if ((tp.id ?? tp.name) === item.targetPlanetId) {
          const count = Math.max(0, (tp.tracks_data?.length ?? tp.total_tracks ?? 1) - 1);
          const filtered = (tp.tracks_data ?? []).filter(
            (t) =>
              (item.track.id && t.id !== item.track.id) ||
              (!item.track.id && (t.name !== item.track.name || t.artist !== item.track.artist))
          );
          return {
            ...tp,
            total_tracks: count,
            tracks_data: filtered,
          };
        }
        return tp;
      })
    );

    setAuditQueue((prev) => prev.filter((a) => a.id !== item.id));
    setToast(`🔴 "${item.track.name}" devuelta a la fuente caótica`);
    playRewardSound("chaotic");
  };

  const handleDrag = (_: unknown, info: { point: { x: number; y: number } }) => {
    let px = info.point.x;
    let py = info.point.y;

    if (px === 0 && py === 0 && coreRef.current) {
      const coreRect = coreRef.current.getBoundingClientRect();
      px = coreRect.left + coreRect.width / 2;
      py = coreRect.top + coreRect.height / 2;
    }

    const planetElements = document.querySelectorAll<HTMLElement>("[data-planet-id]");
    let foundId: string | null = null;
    let minDistance = Infinity;

    planetElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(px - cx, py - cy);

      const isInside =
        px >= rect.left - 75 &&
        px <= rect.right + 75 &&
        py >= rect.top - 75 &&
        py <= rect.bottom + 75;

      if ((isInside || dist < 190) && dist < minDistance) {
        minDistance = dist;
        foundId = el.getAttribute("data-planet-id");
      }
    });

    setHoveredPlanetId(foundId);
    if (foundId) setIsOrbitPaused(true);
  };

  const handleDragEnd = async (_: unknown, info: { point: { x: number; y: number } }) => {
    setIsDraggingCore(false);
    if (!currentTrack || !playlist || isAbsorbing) return;

    let px = info.point.x;
    let py = info.point.y;

    if (px === 0 && py === 0 && coreRef.current) {
      const coreRect = coreRef.current.getBoundingClientRect();
      px = coreRect.left + coreRect.width / 2;
      py = coreRect.top + coreRect.height / 2;
    }

    const planetElements = document.querySelectorAll<HTMLElement>("[data-planet-id]");
    let targetPlanetEl: HTMLElement | null = null;
    let targetPlanetId: string | null = null;
    let minDistance = Infinity;

    planetElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dist = Math.hypot(px - cx, py - cy);

      const isInside =
        px >= rect.left - 90 &&
        px <= rect.right + 90 &&
        py >= rect.top - 90 &&
        py <= rect.bottom + 90;

      if ((isInside || dist < 210) && dist < minDistance) {
        minDistance = dist;
        targetPlanetEl = el;
        targetPlanetId = el.getAttribute("data-planet-id");
      }
    });

    if (targetPlanetId && targetPlanetEl) {
      await executeTransfer(targetPlanetId, targetPlanetEl);
      return;
    }

    // No target hit: spring back to center
    setHoveredPlanetId(null);
    dragX.set(0);
    dragY.set(0);
  };

  const bpm = currentTrack?.audio_features?.tempo != null
    ? Math.round(currentTrack.audio_features.tempo)
    : (currentTrack?.bpm ?? null);

  const energy = currentTrack?.audio_features?.energy ?? currentTrack?.energy ?? null;
  const energyPct = energy != null ? Math.round(energy * 100) : null;
  const cover = currentTrack?.album_cover ?? currentTrack?.image_url;
  const keyMode = currentTrack?.audio_features?.key != null
    ? keyLabel(currentTrack.audio_features.key, currentTrack.audio_features.mode)
    : null;

  return (
    <div className="relative flex min-h-dvh flex-col bg-[#05050a] text-white overflow-hidden select-none">
      {/* ── Background: Cosmic Orbital Atmosphere ── */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(16,185,129,0.15),rgba(255,255,255,0))]" />
      <div className="pointer-events-none absolute -left-40 top-1/3 h-96 w-96 rounded-full bg-amber-500/10 blur-[120px]" />
      <div className="pointer-events-none absolute -right-40 bottom-1/4 h-96 w-96 rounded-full bg-spotify/10 blur-[140px]" />

      {/* Decorative cosmic grid & orbital tracks */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-25">
        <div className="h-[760px] w-[760px] rounded-full border border-white/5 animate-[spin_60s_linear_infinite]" />
        <div className="absolute h-[980px] w-[980px] rounded-full border border-dashed border-emerald-500/15 animate-[spin_90s_linear_infinite_reverse]" />
        <div className="absolute h-[1200px] w-[1200px] rounded-full border border-white/[0.03]" />
      </div>

      {/* ── Top Header Bar ── */}
      <header className="relative z-30 flex items-center justify-between px-6 py-5 border-b border-white/5 bg-black/30 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.back()}
            className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 hover:bg-white/10 hover:text-white transition-all cursor-pointer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            <span>Volver a la Playlist</span>
          </button>

          <div className="h-4 w-px bg-white/10 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-amber-500/20 text-amber-300 text-xs font-bold">
              🌪️
            </span>
            <span className="text-xs font-bold text-white truncate max-w-[180px] sm:max-w-xs">
              {playlist?.name ?? "Cargando..."}
            </span>
            <span className="rounded-full bg-amber-500/15 border border-amber-400/30 px-2 py-0.5 text-[10px] font-bold text-amber-300">
              Fuente Caótica
            </span>
          </div>
        </div>

        {/* Orbit System Indicators & Modo Auditoría */}
        <div className="flex items-center gap-3">
          {/* Modo Auditoría Pill (Filtro Naranja) */}
          <button
            type="button"
            onClick={() => setIsAuditModalOpen(true)}
            className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-black transition-all cursor-pointer ${
              auditQueue.length > 0
                ? "border-amber-400/80 bg-amber-500/20 text-amber-300 shadow-[0_0_20px_rgba(245,158,11,0.35)] animate-pulse"
                : "border-white/10 bg-white/5 text-white/60 hover:border-amber-500/40 hover:text-amber-200"
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${auditQueue.length > 0 ? "bg-amber-400 animate-ping" : "bg-white/30"}`} />
            <span className="hidden sm:inline">MODO AUDITORÍA</span>
            <span className="sm:hidden">AUDITAR</span>
            <span className={`rounded-full px-1.5 py-0.2 text-[9px] font-mono font-black ${auditQueue.length > 0 ? "bg-amber-400 text-black" : "bg-white/10 text-white/50"}`}>
              {auditQueue.length}
            </span>
          </button>

          <div className="hidden lg:flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-white/60 font-medium">
              {targetPlaylists.length} {targetPlaylists.length === 1 ? "Planeta en Órbita" : "Planetas en Órbita"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] font-medium text-white/40 uppercase tracking-wider">Examinadas</span>
              <span className="text-xs font-bold text-spotify tabular-nums">
                {processedIds.size} / {allTracks.length}
              </span>
            </div>
            <span className="rounded-full bg-white/10 border border-white/15 px-3 py-1 text-xs font-bold tabular-nums text-white">
              {allTracks.length} tracks
            </span>
          </div>
        </div>
      </header>

      {/* ── Main Orbital System Viewport ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center p-4 sm:p-8 min-h-[700px] lg:min-h-[920px] overflow-hidden">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4 text-center">
            <div className="relative flex h-20 w-20 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-spotify border-t-transparent animate-spin" />
              <span className="text-2xl animate-pulse">🛰️</span>
            </div>
            <p className="text-sm font-bold text-white">Sintonizando Sistema Orbital...</p>
            <p className="text-xs text-white/40">Cargando planetas y catálogo acústico</p>
          </div>
        ) : error || !playlist ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-black/60 p-8 text-center max-w-md backdrop-blur-xl">
            <span className="text-3xl">⚠️</span>
            <p className="text-sm text-red-400 font-semibold">{error || "Playlist no encontrada."}</p>
            <button
              onClick={() => router.back()}
              className="rounded-full bg-white/10 px-5 py-2 text-xs font-bold text-white hover:bg-white/20 transition-all cursor-pointer"
            >
              Regresar
            </button>
          </div>
        ) : allTracks.length === 0 ? (
          <div className="flex flex-col items-center gap-4 rounded-3xl border border-white/10 bg-black/60 p-8 text-center max-w-md backdrop-blur-xl">
            <span className="text-3xl">📭</span>
            <p className="text-sm text-white/70 font-semibold">Esta playlist no contiene pistas para curar.</p>
            <button
              onClick={() => router.back()}
              className="rounded-full bg-spotify px-5 py-2 text-xs font-bold text-black hover:scale-105 transition-all cursor-pointer"
            >
              Volver a la Biblioteca
            </button>
          </div>
        ) : (
          <div
            className="relative flex items-center justify-center w-full max-w-6xl h-full"
            onMouseEnter={() => setIsOrbitPaused(true)}
            onMouseLeave={() => {
              if (!hoveredPlanetId) setIsOrbitPaused(false);
            }}
          >
            {/* ── Adaptive Circular Orbit Ring with Target Planets ── */}
            {targetPlaylists.length > 0 && (
              <div className="absolute inset-0 pointer-events-none">
                {/* Visual Orbit Guide Tracks */}
                <div
                  style={{ width: `${orbitDiameter}px`, height: `${orbitDiameter}px` }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10 shadow-[0_0_50px_rgba(16,185,129,0.06)]"
                />
                <div
                  style={{ width: `${orbitDiameter}px`, height: `${orbitDiameter}px` }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-emerald-500/15 animate-[spin_120s_linear_infinite]"
                />

                {/* Rotating Planet Belt Container (Transparent container, active planets) */}
                <motion.div
                  animate={{ rotate: isOrbitPaused ? undefined : 360 }}
                  transition={{ duration: isMobile ? 65 : 90, ease: "linear", repeat: Infinity }}
                  style={{ width: `${orbitDiameter}px`, height: `${orbitDiameter}px` }}
                  className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                >
                  {targetPlaylists.map((target, idx) => {
                    const totalTargets = targetPlaylists.length;
                    const angleDeg = (360 / totalTargets) * idx - 90;
                    const angleRad = (angleDeg * Math.PI) / 180;

                    const x = Math.cos(angleRad) * radiusPx;
                    const y = Math.sin(angleRad) * radiusPx;

                    const key = target.id ?? target.name;
                    const isTargetHovered = hoveredPlanetId === key;
                    const verdict = verdicts[key];
                    const hasShockwave = Boolean(shockwaves[key]);

                    const rpgState = getPlaylistRPGState(target, "objetivo");
                    const visuals = getPlanetVisuals(rpgState, idx);
                    const count = target.tracks_data?.length ?? target.total_tracks ?? 0;
                    const gap = 100 - count;
                    const pctTowards100 = Math.min(100, Math.round((count / 100) * 100));

                    return (
                      <div
                        key={key}
                        data-planet-id={key}
                        style={{
                          transform: `translate(calc(${radiusPx}px + ${x}px - 50%), calc(${radiusPx}px + ${y}px - 50%))`,
                        }}
                        className="absolute left-0 top-0 pointer-events-auto z-30 group"
                      >
                        {/* ── Wide Gravitational Suction Well ("Punto de Recogida / Agujero de Succión") ── */}
                        <div
                          className={`pointer-events-none absolute -inset-7 sm:-inset-11 rounded-3xl transition-all duration-300 flex items-center justify-center ${
                            isDraggingCore || isTargetHovered ? "opacity-100 scale-100" : "opacity-0 scale-90"
                          }`}
                        >
                          {/* Concentric Pulsing Suction Halo */}
                          <div
                            className={`absolute inset-0 rounded-full transition-all duration-300 ${
                              isTargetHovered
                                ? "bg-gradient-to-r from-emerald-400/40 via-teal-400/30 to-emerald-500/40 blur-xl scale-110 animate-pulse"
                                : "bg-gradient-to-r from-emerald-500/20 via-spotify/15 to-transparent blur-lg animate-pulse"
                            }`}
                          />

                          {/* Outer Rotating Vortex Dashed Ring */}
                          <div
                            className={`absolute inset-0 rounded-full border-2 border-dashed transition-all duration-300 ${
                              isTargetHovered
                                ? "border-emerald-300 animate-[spin_3.5s_linear_infinite] shadow-[0_0_35px_rgba(16,185,129,0.8)]"
                                : "border-emerald-400/40 animate-[spin_10s_linear_infinite]"
                            }`}
                          />

                          {/* Target Magnetic Lock Beacon Badge */}
                          {isTargetHovered && (
                            <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-50 rounded-full border border-emerald-300 bg-emerald-400 px-3 py-0.5 text-[8.5px] font-black text-black uppercase tracking-wider shadow-xl shadow-emerald-500/50 animate-bounce whitespace-nowrap">
                              🕳️ ¡SUELTA AQUÍ PARA ABSORBER!
                            </div>
                          )}
                        </div>

                        {/* Counter-rotation on planet so cards remain upright and prominent */}
                        <motion.button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            executeTransfer(key, e.currentTarget);
                          }}
                          animate={{
                            rotate: isOrbitPaused ? undefined : -360,
                            scale: isTargetHovered ? 1.18 : 1,
                          }}
                          transition={{
                            rotate: { duration: isMobile ? 65 : 90, ease: "linear", repeat: Infinity },
                            scale: { duration: 0.2 },
                          }}
                          className={`relative z-30 pointer-events-auto flex items-center gap-1.5 sm:gap-3 rounded-xl sm:rounded-2xl border-2 ${
                            infinitePlanetId === key
                              ? "border-cyan-400 ring-4 ring-cyan-400/50 shadow-[0_0_35px_rgba(6,182,212,0.8)]"
                              : isTargetHovered
                              ? "border-emerald-300 ring-4 sm:ring-8 ring-emerald-400/40 shadow-[0_0_40px_rgba(16,185,129,0.6)]"
                              : visuals.borderColor
                          } bg-[#0c0c16]/95 p-1.5 sm:p-3.5 shadow-2xl backdrop-blur-2xl ${visuals.glowColor} transition-all duration-300 w-28 sm:w-56 lg:w-64 text-left cursor-pointer active:scale-95`}
                        >
                          {/* Shockwave Particle Pulse upon Absorption */}
                          {hasShockwave && (
                            <motion.div
                              key={shockwaves[key]}
                              initial={{ scale: 0.8, opacity: 1 }}
                              animate={{ scale: 2.2, opacity: 0 }}
                              transition={{ duration: 0.8, ease: "easeOut" }}
                              className="pointer-events-none absolute -inset-2 rounded-2xl sm:rounded-3xl border-2 border-emerald-400 bg-emerald-500/20"
                            />
                          )}

                          {/* Ambient Planet Halo */}
                          <div
                            className={`pointer-events-none absolute -inset-1 rounded-xl sm:rounded-2xl bg-gradient-to-r ${visuals.auraColor} blur-md ${
                              isTargetHovered ? "opacity-100 scale-105" : "opacity-60"
                            } transition-all`}
                          />

                          {/* Floating Verdict Badge Pop-up */}
                          <AnimatePresence>
                            {verdict && (
                              <motion.div
                                initial={{ opacity: 0, y: 8, scale: 0.8 }}
                                animate={{ opacity: 1, y: isMobile ? -30 : -42, scale: 1 }}
                                exit={{ opacity: 0, y: -45, scale: 0.8 }}
                                className="absolute left-1/2 -translate-x-1/2 top-0 z-50 pointer-events-none flex items-center gap-1 rounded-full px-2.5 py-0.5 sm:px-3.5 sm:py-1 shadow-2xl backdrop-blur-md border border-white/30 whitespace-nowrap"
                                style={{
                                  backgroundColor: verdict.type === "accepted" ? "#10b981" : "#f59e0b",
                                  color: "#000000",
                                }}
                              >
                                <span className="text-[9px] sm:text-xs font-black tracking-wide">
                                  {verdict.type === "accepted" ? "🟢 ACEPTADA" : "🟠 EN ESTUDIO"}
                                </span>
                              </motion.div>
                            )}
                          </AnimatePresence>

                          {/* Planet Core Icon Orb */}
                          <div
                            className={`relative flex h-8 w-8 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-lg sm:rounded-2xl bg-white/10 border border-white/15 text-base sm:text-2xl shadow-lg ${
                              isTargetHovered ? "scale-110 bg-emerald-500/25 text-emerald-200 ring-2 ring-emerald-400" : ""
                            } transition-all`}
                          >
                            <span>{visuals.icon}</span>
                            <div className="absolute -inset-0.5 rounded-lg sm:rounded-2xl border border-white/20 animate-ping opacity-25" />
                          </div>

                          {/* Planet Metadata */}
                          <div className="relative min-w-0 flex-1 flex flex-col gap-0.5 sm:gap-1">
                            <p className="truncate text-xs sm:text-sm font-black text-white group-hover:text-spotify transition-colors" title={target.name}>
                              {target.name}
                            </p>

                            <div className="flex items-center gap-1 sm:gap-2 flex-wrap">
                              <span className={`rounded-full px-1.5 py-0.2 text-[7px] sm:text-[8px] font-black uppercase tracking-wider ${visuals.badgeColor}`}>
                                {rpgState.badgeLabel}
                              </span>
                              <span className="text-[8px] sm:text-[9px] text-white/50 tabular-nums font-mono">
                                {count}/100
                              </span>
                            </div>

                            {/* ── PROMPT 6: Modo Infinito Toggle Button (Unlocked at Level >= 1 / count >= 100) ── */}
                            {count >= 100 ? (
                              <button
                                type="button"
                                onPointerDownCapture={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleInfiniteMode(key, target.name);
                                }}
                                className={`mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[7px] sm:text-[7.5px] font-black uppercase tracking-wider transition-all border cursor-pointer ${
                                  infinitePlanetId === key
                                    ? "bg-cyan-400 text-black border-cyan-200 shadow-[0_0_15px_rgba(6,182,212,0.9)] animate-pulse"
                                    : "bg-cyan-500/20 text-cyan-300 border-cyan-400/40 hover:bg-cyan-500/30 hover:scale-105"
                                }`}
                                title="Activar/Desactivar recomendación autónoma continua para este planeta"
                              >
                                <span>♾️</span>
                                <span>{infinitePlanetId === key ? "MODO INFINITO ACTIVO" : "MODO INFINITO"}</span>
                              </button>
                            ) : (
                              <button
                                type="button"
                                onPointerDownCapture={(e) => e.stopPropagation()}
                                onMouseDown={(e) => e.stopPropagation()}
                                onTouchStart={(e) => e.stopPropagation()}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setToast(`🔒 Modo Infinito bloqueado. Requiere Nivel 1 (100 canciones). Progreso: ${count}/100.`);
                                }}
                                className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-white/5 border border-white/10 px-2 py-0.5 text-[6.5px] sm:text-[7px] font-semibold text-white/40 hover:text-white/70 transition-all cursor-pointer"
                                title={`Desbloqueo al alcanzar Nivel 1 (100 canciones). Progreso: ${count}/100`}
                              >
                                <span>🔒</span>
                                <span>Infinito (LVL 1)</span>
                              </button>
                            )}

                            {/* Mini Progress Bar */}
                            <div className="h-1 w-full overflow-hidden rounded-full bg-white/10 mt-0.5">
                              <div
                                className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 transition-all duration-500"
                                style={{ width: `${pctTowards100}%` }}
                              />
                            </div>
                          </div>
                        </motion.button>
                      </div>
                    );
                  })}
                </motion.div>
              </div>
            )}

            {/* ── Central Interactive Extraction Card ("EL NÚCLEO" - Ultra Compact) ── */}
            {currentTrack && (
              <div
                ref={coreRef}
                className="relative z-20 flex flex-col items-center w-44 sm:w-52 md:w-56 touch-none"
              >
                {/* Ambient Core Aura */}
                <div
                  className="pointer-events-none absolute -inset-2 rounded-full bg-gradient-to-tr from-spotify/20 via-emerald-500/10 to-amber-500/15 blur-lg opacity-60 animate-pulse"
                  style={{ animationDuration: "4s" }}
                />

                {/* Orbit Ring surrounding the Core Card */}
                <div className="pointer-events-none absolute -inset-2 rounded-2xl border border-emerald-500/20 animate-[spin_45s_linear_infinite]" />

                <AnimatePresence mode="wait" custom={direction}>
                  <motion.div
                    key={currentTrack.id ?? `${currentTrack.name}:::${currentTrack.artist}`}
                    custom={direction}
                    drag={!isAbsorbing}
                    dragConstraints={{ left: -radiusPx - 100, right: radiusPx + 100, top: -radiusPx - 100, bottom: radiusPx + 100 }}
                    dragElastic={0.2}
                    whileDrag={{ scale: 1.08, cursor: "grabbing", zIndex: 60 }}
                    onDragStart={() => {
                      setIsDraggingCore(true);
                      setIsOrbitPaused(true);
                    }}
                    onDrag={handleDrag}
                    onDragEnd={handleDragEnd}
                    initial={{ opacity: 0, scale: 0.88, y: 15 }}
                    animate={
                      isAbsorbing && absorbDelta
                        ? {
                            x: absorbDelta.x,
                            y: absorbDelta.y,
                            scale: [1, 0.3, 0],
                            rotate: [0, 360, 720],
                            opacity: [1, 0.8, 0],
                            transition: { duration: 0.55, ease: [0.25, 1, 0.5, 1] },
                          }
                        : { opacity: 1, scale: 1, y: 0, x: 0 }
                    }
                    exit={{ opacity: 0, scale: 0.88, y: -15 }}
                    transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
                    className={`relative w-full rounded-2xl border ${
                      currentTrackAffinity
                        ? "border-cyan-400/70 shadow-[0_15px_40px_-10px_rgba(6,182,212,0.4)]"
                        : "border-white/15 shadow-[0_15px_40px_-10px_rgba(0,0,0,0.9)]"
                    } bg-gradient-to-b from-[#12121e]/95 via-[#0c0c16]/98 to-[#06060c]/99 p-2.5 sm:p-3 backdrop-blur-2xl flex flex-col gap-1.5 sm:gap-2 cursor-grab active:cursor-grabbing`}
                  >
                    {/* Drag Helper Tooltip */}
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.2 text-[6.5px] sm:text-[7px] font-bold text-emerald-300 uppercase tracking-wider backdrop-blur-md shadow-md animate-bounce whitespace-nowrap">
                      ✨ Arrastra al planeta
                    </div>

                    {/* Core Header: Origin Pill & Track Counter or Infinite Recommendation Pill */}
                    <div className="flex items-center justify-between border-b border-white/5 pb-1 mt-0.5">
                      {currentTrackAffinity ? (
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <span className="flex h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-400 animate-ping" />
                          <span className="truncate text-[7.5px] sm:text-[8px] font-black tracking-wider uppercase text-cyan-300">
                            ♾️ {currentTrackAffinity.score}% AFÍN · {currentTrackAffinity.targetName}
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1">
                          <span className="flex h-1 w-1 rounded-full bg-emerald-400 animate-ping" />
                          <span className="text-[8px] sm:text-[9px] font-black tracking-wider uppercase text-emerald-400">
                            NÚCLEO
                          </span>
                        </div>
                      )}
                      <span className="text-[8px] sm:text-[9px] font-mono font-semibold text-white/40 shrink-0 ml-1">
                        {processedIds.size}/{allTracks.length}
                      </span>
                    </div>

                    {/* Infinite Mode Affinity Reason */}
                    {currentTrackAffinity && (
                      <div className="rounded-md bg-cyan-500/10 border border-cyan-400/30 px-1.5 py-0.5 text-center">
                        <span className="text-[7.5px] font-bold text-cyan-200 truncate block">
                          ✨ {currentTrackAffinity.reason}
                        </span>
                      </div>
                    )}

                    {/* Mini Album Cover with Integrated Glassmorphic Audio Preview Player */}
                    <div className="relative aspect-square w-16 h-16 sm:w-20 sm:h-20 mx-auto rounded-lg sm:rounded-xl overflow-hidden shadow-lg shadow-black/80 border border-white/10 bg-[#161622] group">
                      <SafeImage
                        src={cover ?? ""}
                        alt={currentTrack.name}
                        fill
                        fallbackIcon={
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-white/20 bg-gradient-to-br from-white/[0.03] to-white/[0.08] pointer-events-none">
                            <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6">
                              <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
                            </svg>
                            <span className="text-[8px] text-white/30">Sin carátula</span>
                          </div>
                        }
                        className="object-cover transition-transform duration-700 pointer-events-none"
                      />

                      {/* Glassmorphic Play/Pause Button Overlay (Drag-isolated) */}
                      <div className="absolute inset-0 flex items-center justify-center bg-black/35 backdrop-blur-[1px] opacity-90 transition-opacity pointer-events-none">
                        {isFetchingPreview ? (
                          <div
                            className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full bg-black/80 border border-emerald-400/50 text-xs shadow-lg animate-pulse pointer-events-auto"
                            title="Buscando preview en Deezer..."
                          >
                            <span className="animate-spin text-spotify">⚡</span>
                          </div>
                        ) : activePreviewUrl ? (
                          <button
                            type="button"
                            onPointerDownCapture={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onTouchStart={(e) => e.stopPropagation()}
                            onClick={togglePlayPreview}
                            className={`pointer-events-auto flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-full border shadow-xl transition-all cursor-pointer active:scale-90 ${
                              isPlaying
                                ? "bg-spotify text-black border-spotify/80 ring-4 ring-spotify/30 animate-pulse"
                                : "bg-black/75 hover:bg-black/90 text-white border-white/30 hover:scale-110"
                            }`}
                            title={isPlaying ? "Pausar Preview" : "Reproducir Preview"}
                          >
                            <span className="text-xs sm:text-sm">{isPlaying ? "⏸️" : "▶️"}</span>
                          </button>
                        ) : (
                          <div
                            className="pointer-events-auto flex h-6 w-6 items-center justify-center rounded-full bg-black/60 border border-white/10 text-[10px] text-white/40 cursor-not-allowed"
                            title="Sin preview de audio disponible"
                          >
                            🔇
                          </div>
                        )}
                      </div>

                      {/* BPM Floating Badge */}
                      {bpm != null && (
                        <div className="absolute top-1 right-1 z-10 flex items-center gap-0.5 rounded-full bg-black/85 border border-emerald-400/40 px-1 py-0.2 backdrop-blur-md shadow-md pointer-events-none">
                          <span className="h-1 w-1 rounded-full bg-emerald-400 animate-pulse" />
                          <span className="text-[7.5px] sm:text-[8px] font-black text-emerald-300 font-mono tabular-nums">
                            {bpm} BPM
                          </span>
                        </div>
                      )}

                      {/* Audio Progress Bar */}
                      {activePreviewUrl && (
                        <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/60 overflow-hidden pointer-events-none">
                          <div
                            className="h-full bg-gradient-to-r from-spotify to-emerald-300 transition-all duration-150"
                            style={{ width: `${audioProgress}%` }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Track Metadata (Compact) */}
                    <div className="flex flex-col items-center text-center gap-0 pointer-events-none px-0.5">
                      <h2 className="text-[11px] sm:text-xs font-bold text-white line-clamp-1 tracking-tight" title={currentTrack.name}>
                        {currentTrack.name}
                      </h2>
                      <p className="text-[9.5px] sm:text-[10px] font-semibold text-spotify line-clamp-1">
                        {currentTrack.artist || "Artista Desconocido"}
                      </p>
                    </div>

                    {/* Acoustic DNA Metrics HUD (Compact) */}
                    <div className="grid grid-cols-3 gap-0.5 rounded-md border border-white/5 bg-white/[0.02] p-1 text-center pointer-events-none">
                      <div className="flex flex-col items-center">
                        <span className="text-[7px] font-medium text-white/40 uppercase">Energía</span>
                        <span className="text-[9px] font-bold text-amber-300">
                          {energyPct != null ? `${energyPct}%` : "—"}
                        </span>
                      </div>
                      <div className="flex flex-col items-center border-x border-white/5">
                        <span className="text-[7px] font-medium text-white/40 uppercase">Tono</span>
                        <span className="text-[9px] font-bold text-sky-300 truncate max-w-[50px]">
                          {keyMode ?? "—"}
                        </span>
                      </div>
                      <div className="flex flex-col items-center">
                        <span className="text-[7px] font-medium text-white/40 uppercase">Dur</span>
                        <span className="text-[9px] font-bold text-white/80 font-mono">
                          {currentTrack.duration_ms ? fmtMs(currentTrack.duration_ms) : "—"}
                        </span>
                      </div>
                    </div>

                    {/* ── Manual Action: Siguiente Pista ── */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleNextTrack();
                      }}
                      className="group relative w-full flex items-center justify-center gap-1 rounded-lg bg-white/10 border border-white/15 py-1 px-2 text-[10px] font-bold text-white hover:border-spotify/60 hover:bg-spotify/20 hover:text-spotify transition-all duration-300 cursor-pointer active:scale-[0.98]"
                    >
                      <span>Siguiente</span>
                      <span className="text-[10px] transition-transform duration-300 group-hover:translate-x-0.5">⏭️</span>
                    </button>
                  </motion.div>
                </AnimatePresence>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: "spring", damping: 20, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 flex items-center gap-3 rounded-2xl border border-white/10 bg-black/90 px-5 py-3 shadow-2xl backdrop-blur-xl pointer-events-none"
          >
            <span className="text-base">⚡</span>
            <p className="text-sm font-semibold text-white">{toast}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Modo Auditoría: Interactive Tinder-Style Swipe Deck Modal ── */}
      {isAuditModalOpen && (
        <AuditSwipeDeckModal
          queue={auditQueue}
          onApprove={handleApproveAudit}
          onDiscard={handleDiscardAudit}
          onClose={() => setIsAuditModalOpen(false)}
        />
      )}

      {/* ── Solitaire Level 1 Victory Celebration (100 Songs Milestone) ── */}
      {celebratingPlanet && (
        <SolitaireVictoryAnimation
          planetName={celebratingPlanet.name}
          albumCovers={celebratingPlanet.covers}
          onClose={() => setCelebratingPlanet(null)}
        />
      )}
    </div>
  );
}
