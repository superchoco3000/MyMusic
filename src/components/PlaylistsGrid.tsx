"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import dynamic from "next/dynamic";
import { SafeImage } from "@/components/SafeImage";

import {
  loadMusicLibrary,
  getSavedClassifications,
  savePlaylistCurationConfig,
  clearAllPlaylistClassifications,
  type PlaylistClassification,
} from "@/lib/library/libraryStore";
import {
  getPlaylistRPGState,
  type RPGStateResult,
} from "@/lib/gamification/cohesion";
import { SyncButton } from "@/components/SyncButton";
import { GlobalPushHub } from "@/components/GlobalPushHub";
import { playRewardSound } from "@/lib/gamification/sounds";

import type {
  MusicLibraryPlaylist,
  MusicLibraryTrack,
  CurationRules,
  AuditedTrackItem,
} from "@/types/library";

// ─── Lazy-loaded heavy modals (not needed on first render) ─────────────────────

const OnboardingWizardModal = dynamic(
  () => import("@/components/OnboardingWizardModal").then((m) => m.OnboardingWizardModal),
  { ssr: false }
);

const AuditSwipeDeckModal = dynamic(
  () => import("@/components/AuditSwipeDeckModal").then((m) => m.AuditSwipeDeckModal),
  { ssr: false }
);

const SolitaireVictoryAnimation = dynamic(
  () => import("@/components/SolitaireVictoryAnimation").then((m) => m.SolitaireVictoryAnimation),
  { ssr: false }
);

// ─── 10 Extended Vibes Engine ─────────────────────────────────────────────────

export type VibeType =
  | "dnb_soundsystem"
  | "laser_techno"
  | "sunset_chill"
  | "tropical_fire"
  | "rock_amplifier"
  | "hiphop_boombox"
  | "jazz_saxophone"
  | "pop_disco"
  | "classical_orchestra"
  | "cosmic_voyage";

export interface PlaylistVibeAsset {
  id: string;
  type: VibeType;
  title: string;
  badge: string;
  emoji: string;
  gifUrl?: string;
  ambientColor: string;
  borderAccent: string;
}

export function getPlaylistVibe(playlist: MusicLibraryPlaylist): PlaylistVibeAsset {
  const name = playlist.name.toLowerCase();

  // 1. DnB / Drum / Jungle / Bass
  if (name.includes("dnb") || name.includes("drum") || name.includes("jungle") || name.includes("bass")) {
    return {
      id: "vibe_dnb",
      type: "dnb_soundsystem",
      title: "Rasta Sound System",
      badge: "DnB Basshead",
      emoji: "🔊",
      ambientColor: "from-lime-500/30 via-amber-500/20 to-emerald-950/80",
      borderAccent: "border-lime-400/50",
    };
  }

  // 2. Techno / House / Dance / Rave / Club / Acid
  if (name.includes("techno") || name.includes("house") || name.includes("dance") || name.includes("rave") || name.includes("club") || name.includes("acid")) {
    return {
      id: "vibe_techno",
      type: "laser_techno",
      title: "Cyber Rave Lasers",
      badge: "Club / Laser",
      emoji: "⚡",
      ambientColor: "from-fuchsia-600/30 via-cyan-500/25 to-purple-950/80",
      borderAccent: "border-cyan-400/50",
    };
  }

  // 3. Chill / Sunset / Joyas / Alma / Lofi / Relax
  if (name.includes("chill") || name.includes("sunset") || name.includes("joyas") || name.includes("alma") || name.includes("lofi") || name.includes("relax") || name.includes("acoustic")) {
    return {
      id: "vibe_chill",
      type: "sunset_chill",
      title: "Sunset Breeze & Palms",
      badge: "Chill Sunset",
      emoji: "🌴",
      ambientColor: "from-rose-500/30 via-amber-500/20 to-indigo-950/80",
      borderAccent: "border-amber-400/50",
    };
  }

  // 4. Reggaeton / Funk / RFD / Latin / Perreo / Dancehall
  if (name.includes("reggaeton") || name.includes("funk") || name.includes("rfd") || name.includes("latin") || name.includes("perreo") || name.includes("dancehall")) {
    return {
      id: "vibe_tropical",
      type: "tropical_fire",
      title: "Tropical Fire Beat",
      badge: "Tropical Fire",
      emoji: "🔥",
      ambientColor: "from-orange-500/35 via-rose-500/25 to-red-950/80",
      borderAccent: "border-orange-400/50",
    };
  }

  // 5. Rock / Metal / Punk / Indie / Guitar
  if (name.includes("rock") || name.includes("metal") || name.includes("punk") || name.includes("indie") || name.includes("guitar")) {
    return {
      id: "vibe_rock",
      type: "rock_amplifier",
      title: "Overdrive Vinyl & Amp",
      badge: "Rock / Vinyl",
      emoji: "🎸",
      ambientColor: "from-amber-600/30 via-red-600/20 to-zinc-950/80",
      borderAccent: "border-amber-500/50",
    };
  }

  // 6. Hip Hop / Rap / Trap / Boom Bap / Urban
  if (name.includes("hip hop") || name.includes("hiphop") || name.includes("rap") || name.includes("trap") || name.includes("urban") || name.includes("boombap")) {
    return {
      id: "vibe_hiphop",
      type: "hiphop_boombox",
      title: "Street Boombox Beat",
      badge: "Hip-Hop / Trap",
      emoji: "📻",
      ambientColor: "from-yellow-500/30 via-purple-600/25 to-zinc-950/80",
      borderAccent: "border-yellow-400/50",
    };
  }

  // 7. Jazz / Soul / Blues / R&B / Groove
  if (name.includes("jazz") || name.includes("soul") || name.includes("blues") || name.includes("r&b") || name.includes("groove")) {
    return {
      id: "vibe_jazz",
      type: "jazz_saxophone",
      title: "Neon Saxophone Lounge",
      badge: "Jazz & Soul",
      emoji: "🎷",
      ambientColor: "from-blue-600/30 via-violet-500/25 to-slate-950/80",
      borderAccent: "border-blue-400/50",
    };
  }

  // 8. Pop / Chart / Hits / Disco / Mainstream
  if (name.includes("pop") || name.includes("chart") || name.includes("hits") || name.includes("disco") || name.includes("mainstream")) {
    return {
      id: "vibe_pop",
      type: "pop_disco",
      title: "Disco Ball Pop Glitz",
      badge: "Pop Hits",
      emoji: "🪩",
      ambientColor: "from-pink-500/30 via-yellow-400/20 to-purple-950/80",
      borderAccent: "border-pink-400/50",
    };
  }

  // 9. Classical / Orchestra / Piano / Symphony / Cinematic
  if (name.includes("classic") || name.includes("clasica") || name.includes("clásica") || name.includes("piano") || name.includes("orchestra") || name.includes("symphony") || name.includes("cinematic")) {
    return {
      id: "vibe_classical",
      type: "classical_orchestra",
      title: "Grand Symphony Aura",
      badge: "Symphony / Piano",
      emoji: "🎻",
      ambientColor: "from-amber-200/20 via-slate-300/15 to-stone-950/85",
      borderAccent: "border-amber-200/50",
    };
  }

  // 10. Cosmic (Default Fallback)
  return {
    id: "vibe_cosmic",
    type: "cosmic_voyage",
    title: "Cosmic Holo Equalizer",
    badge: "Cosmic Audio",
    emoji: "🌌",
    ambientColor: "from-indigo-600/30 via-cyan-500/20 to-slate-950/80",
    borderAccent: "border-indigo-400/50",
  };
}

// ─── Vibe Visualizer Component ────────────────────────────────────────────────

interface VibeVisualizerProps {
  vibe: PlaylistVibeAsset;
  isEvolved?: boolean;
  level?: number;
}

function VibeVisualizer({ vibe, isEvolved, level }: VibeVisualizerProps) {
  if (vibe.gifUrl) {
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center overflow-hidden bg-black/60 backdrop-blur-xs">
        <SafeImage
          src={vibe.gifUrl}
          alt={vibe.title}
          fill
          unoptimized
          className="object-cover"
        />
      </div>
    );
  }


  return (
    <div className="absolute inset-0 z-10 flex flex-col items-center justify-center overflow-hidden bg-black/85 p-3">
      {isEvolved && (
        <div className="absolute inset-0 pointer-events-none border-2 border-yellow-400/60 shadow-[inset_0_0_20px_rgba(234,179,8,0.4)] animate-pulse" />
      )}

      {isEvolved && (
        <div className="absolute top-2 left-2 z-30">
          <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-yellow-400 to-amber-500 px-2 py-0.5 text-[8px] font-black text-black shadow-md shadow-yellow-500/50">
            ✨ EVOLVED · LVL {level}
          </span>
        </div>
      )}

      {(() => {
        switch (vibe.type) {
          case "dnb_soundsystem":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-20 w-20 rounded-full border-2 border-lime-400/50 animate-ping" style={{ animationDuration: "1s" }} />
                  <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-lime-950 to-zinc-900 border border-lime-400 shadow-lg shadow-lime-500/30 animate-bounce" style={{ animationDuration: "0.7s" }}>
                    <div className="h-8 w-8 rounded-full bg-gradient-to-br from-lime-400 to-amber-500 flex items-center justify-center">
                      <div className="h-3 w-3 rounded-full bg-black animate-pulse" />
                    </div>
                  </div>
                </div>
                <div className="mt-3 flex items-end gap-1 h-5">
                  {[0.9, 0.5, 1.0, 0.7, 0.9, 0.6, 0.85].map((h, i) => (
                    <div key={i} className="w-1.5 rounded-full bg-gradient-to-t from-lime-400 to-amber-400 animate-pulse" style={{ height: `${h * 100}%`, animationDuration: `${0.35 + i * 0.08}s` }} />
                  ))}
                </div>
              </div>
            );

          case "laser_techno":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="absolute inset-0 pointer-events-none opacity-70">
                  <div className="absolute top-0 left-1/2 -translate-x-1/2 w-48 h-1 bg-cyan-400 blur-[1px] animate-pulse" />
                  <div className="absolute bottom-6 left-0 right-0 h-0.5 bg-gradient-to-r from-fuchsia-500 via-cyan-400 to-fuchsia-500 blur-[1px] animate-pulse" />
                </div>
                <div className="relative flex items-center justify-center">
                  <div className="h-16 w-16 rotate-45 rounded-xl border border-cyan-400 bg-gradient-to-br from-cyan-500/30 to-fuchsia-500/30 shadow-[0_0_20px_rgba(6,182,212,0.6)] flex items-center justify-center animate-spin" style={{ animationDuration: "5s" }}>
                    <div className="h-8 w-8 rounded-lg bg-fuchsia-500/50 border border-fuchsia-300 animate-pulse" />
                  </div>
                  <span className="absolute text-cyan-300 font-mono text-xs font-black drop-shadow-[0_0_8px_rgba(6,182,212,1)]">RAVE</span>
                </div>
              </div>
            );

          case "sunset_chill":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="h-14 w-14 rounded-full bg-gradient-to-t from-rose-500 via-amber-400 to-yellow-300 shadow-[0_0_25px_rgba(251,146,60,0.7)] animate-pulse" style={{ animationDuration: "2.5s" }} />
                <div className="w-24 h-0.5 bg-gradient-to-r from-transparent via-amber-300 to-transparent mt-1" />
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-base animate-bounce" style={{ animationDuration: "2s" }}>🌴</span>
                  <span className="text-[10px] font-semibold text-amber-200 tracking-widest uppercase font-mono">CHILL VIBE</span>
                  <span className="text-base animate-bounce" style={{ animationDuration: "2.2s" }}>✨</span>
                </div>
              </div>
            );

          case "tropical_fire":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <div className="absolute h-16 w-16 rounded-full bg-orange-500/30 blur-md animate-ping" style={{ animationDuration: "1.2s" }} />
                  <div className="text-3xl animate-bounce drop-shadow-[0_0_12px_rgba(249,115,22,0.9)]" style={{ animationDuration: "0.8s" }}>🔥</div>
                </div>
                <div className="mt-2 text-[10px] font-extrabold text-orange-300 tracking-wider uppercase font-mono">TROPICAL FIRE</div>
              </div>
            );

          case "rock_amplifier":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="relative flex items-center justify-center">
                  <div className="h-14 w-14 rounded-full bg-gradient-to-br from-zinc-900 via-black to-zinc-950 border-2 border-zinc-700 shadow-xl flex items-center justify-center animate-spin" style={{ animationDuration: "2.2s" }}>
                    <div className="h-6 w-6 rounded-full bg-gradient-to-br from-amber-500 to-red-600 flex items-center justify-center">
                      <div className="h-1.5 w-1.5 rounded-full bg-black" />
                    </div>
                  </div>
                  <div className="absolute -top-1 -right-1 text-xs">⚡</div>
                </div>
                <div className="mt-2 text-[10px] font-black text-amber-300 tracking-widest uppercase font-mono">OVERDRIVE</div>
              </div>
            );

          case "hiphop_boombox":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl animate-bounce drop-shadow-[0_0_15px_rgba(234,179,8,0.8)]" style={{ animationDuration: "1s" }}>📻</div>
                <div className="mt-2 flex items-center gap-1">
                  {[0.7, 1.0, 0.4, 0.9, 0.6].map((h, i) => (
                    <div key={i} className="w-1.5 bg-gradient-to-t from-yellow-400 to-purple-500 rounded-full animate-pulse" style={{ height: `${h * 16}px`, animationDuration: `${0.4 + i * 0.1}s` }} />
                  ))}
                </div>
                <div className="mt-1 text-[10px] font-extrabold text-yellow-300 tracking-wider font-mono">BOOMBOX</div>
              </div>
            );

          case "jazz_saxophone":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl animate-pulse drop-shadow-[0_0_15px_rgba(96,165,250,0.8)]">🎷</div>
                <div className="mt-2 text-[10px] font-bold text-blue-300 tracking-widest uppercase font-mono">VELVET JAZZ</div>
              </div>
            );

          case "pop_disco":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl animate-spin" style={{ animationDuration: "4s" }}>🪩</div>
                <div className="mt-2 text-[10px] font-black text-pink-300 tracking-wider uppercase font-mono">POP GLITZ</div>
              </div>
            );

          case "classical_orchestra":
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="text-3xl animate-bounce" style={{ animationDuration: "2.5s" }}>🎻</div>
                <div className="mt-2 text-[10px] font-semibold text-amber-200 tracking-widest uppercase font-mono">SYMPHONY</div>
              </div>
            );

          default:
            return (
              <div className="flex flex-col items-center justify-center">
                <div className="flex items-end gap-1.5 h-10">
                  {[0.4, 0.9, 0.6, 1.0, 0.5, 0.8, 0.3].map((h, i) => (
                    <div key={i} className="w-1.5 rounded-full bg-gradient-to-t from-violet-500 to-cyan-400 animate-pulse shadow-[0_0_8px_rgba(167,139,250,0.5)]" style={{ height: `${h * 100}%`, animationDuration: `${0.6 + i * 0.12}s` }} />
                  ))}
                </div>
                <div className="mt-2 text-[10px] font-bold text-violet-300 tracking-wider font-mono">COSMIC DNA</div>
              </div>
            );
        }
      })()}
    </div>
  );
}

// ─── Dynamic RPG Palette Resolver ─────────────────────────────────────────────

interface RPGCardStyle {
  gradient: string;
  glow: string;
  badge: string;
  accentColor: string;
  borderHover: string;
  isGoldEmblem?: boolean;
}

export function getRPGCardStyle(rpgState: RPGStateResult): RPGCardStyle {
  const { category, level } = rpgState;

  switch (category) {
    case "unconfigured":
      return {
        gradient: "from-[#141420] via-[#0d0d15] to-[#07070b]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(255,255,255,0.06)]",
        badge: "bg-white/10 border-white/15 text-white/60",
        accentColor: "text-white/50",
        borderHover: "hover:border-white/20",
      };

    case "in_creation":
      return {
        gradient: "from-[#0f2338] via-[#091827] to-[#040c14]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(56,189,248,0.3)]",
        badge: "bg-sky-500/20 border-sky-400/40 text-sky-300",
        accentColor: "text-sky-300",
        borderHover: "hover:border-sky-400/40",
      };

    case "almost_perfect":
      return {
        gradient: "from-[#1b3805] via-[#102402] to-[#081201]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(163,230,53,0.35)]",
        badge: "bg-lime-500/20 border-lime-400/40 text-lime-300",
        accentColor: "text-lime-300",
        borderHover: "hover:border-lime-400/40",
      };

    case "target":
      return {
        gradient: "from-[#063b28] via-[#03261a] to-[#01140e]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(16,185,129,0.4)]",
        badge: "bg-emerald-500/20 border-emerald-400/40 text-emerald-300",
        accentColor: "text-emerald-300",
        borderHover: "hover:border-emerald-400/40",
      };

    case "perfect": {
      if (level >= 10) {
        return {
          gradient: "from-[#5c4308] via-[#332402] to-[#171000]",
          glow: "hover:shadow-[0_20px_60px_-10px_rgba(234,179,8,0.7)]",
          badge: "bg-gradient-to-r from-yellow-400 to-amber-500 text-black font-black border-yellow-300 shadow-md shadow-yellow-500/40",
          accentColor: "text-yellow-300",
          borderHover: "hover:border-yellow-300",
          isGoldEmblem: true,
        };
      }

      if (level >= 7) {
        return {
          gradient: "from-[#522005] via-[#2e1002] to-[#140600]",
          glow: "hover:shadow-[0_20px_60px_-10px_rgba(249,115,22,0.5)]",
          badge: "bg-orange-500/25 border-orange-400/50 text-orange-300",
          accentColor: "text-orange-300",
          borderHover: "hover:border-orange-400/50",
        };
      }

      if (level >= 4) {
        return {
          gradient: "from-[#4f0e13] via-[#2d0508] to-[#140103]",
          glow: "hover:shadow-[0_20px_60px_-10px_rgba(244,63,94,0.45)]",
          badge: "bg-rose-500/25 border-rose-400/50 text-rose-300",
          accentColor: "text-rose-300",
          borderHover: "hover:border-rose-400/50",
        };
      }

      if (level >= 2) {
        return {
          gradient: "from-[#4a0d38] via-[#29051f] to-[#12010d]",
          glow: "hover:shadow-[0_20px_60px_-10px_rgba(217,70,239,0.45)]",
          badge: "bg-fuchsia-500/25 border-fuchsia-400/50 text-fuchsia-300",
          accentColor: "text-fuchsia-300",
          borderHover: "hover:border-fuchsia-400/50",
        };
      }

      return {
        gradient: "from-[#2e0f4f] via-[#1a072e] to-[#0d0217]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(168,85,247,0.45)]",
        badge: "bg-purple-500/25 border-purple-400/50 text-purple-300",
        accentColor: "text-purple-300",
        borderHover: "hover:border-purple-400/50",
      };
    }

    case "chaotic":
    default:
      return {
        gradient: "from-[#331105] via-[#1f0902] to-[#0d0300]",
        glow: "hover:shadow-[0_20px_60px_-10px_rgba(245,158,11,0.35)]",
        badge: "bg-amber-500/20 border-amber-400/40 text-amber-300",
        accentColor: "text-amber-300",
        borderHover: "hover:border-amber-400/40",
      };
  }
}

function getAcronym(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.slice(0, 3).map((w) => w[0]).join("").toUpperCase();
}

function SkeletonCard() {
  return (
    <div className="animate-pulse rounded-2xl bg-surface p-3 flex flex-col gap-3">
      <div className="aspect-square w-full rounded-xl bg-white/5" />
      <div className="h-4 w-3/4 rounded bg-white/5" />
      <div className="h-3 w-1/3 rounded bg-white/5" />
    </div>
  );
}

// ─── Gamified RPG Playlist Card ───────────────────────────────────────────────

interface PlaylistCardProps {
  playlist: MusicLibraryPlaylist;
  classification?: PlaylistClassification;
  onClick: (e: React.MouseEvent) => void;
}

function PlaylistCard({ playlist, classification, onClick }: PlaylistCardProps) {
  const rpgState = useMemo(() => getPlaylistRPGState(playlist, classification), [playlist, classification]);
  const style    = useMemo(() => getRPGCardStyle(rpgState), [rpgState]);
  const acronym  = useMemo(() => getAcronym(playlist.name), [playlist.name]);
  const vibe     = useMemo(() => getPlaylistVibe(playlist), [playlist]);

  const classificationIcon =
    classification === "caotica" ? "🌪️" :
    classification === "objetivo" ? "🎯" :
    classification === "no_personal" ? "📁" : null;

  const isUnconfigured = rpgState.category === "unconfigured";

  return (
    <div
      onClick={onClick}
      className={[
        "group relative flex flex-col gap-0 rounded-2xl overflow-hidden cursor-pointer",
        style.isGoldEmblem ? "border-2 border-yellow-400/70 shadow-lg shadow-yellow-500/20" : "border border-white/[0.06]",
        "transition-all duration-300 ease-out",
        style.borderHover,
        style.glow,
        "hover:-translate-y-2 hover:scale-[1.02]",
        "bg-[#0a0a0f]",
      ].join(" ")}
    >
      {/* ── Cover Area with RPG Palette & Living Animations ── */}
      <div className={`relative aspect-square w-full bg-gradient-to-br ${style.gradient} overflow-hidden`}>
        {/* Living pulse ambient glow */}
        <div
          className={`absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(255,255,255,0.08)_0%,transparent_65%)] ${style.isGoldEmblem ? "animate-ping opacity-25" : "animate-pulse"}`}
          style={{ animationDuration: style.isGoldEmblem ? "2s" : "4s" }}
        />

        {/* Watermark acronym */}
        <div className="absolute inset-0 flex items-center justify-center select-none pointer-events-none transition-opacity duration-300 group-hover:opacity-10">
          <span
            className="font-black tracking-tighter leading-none text-white/[0.07] group-hover:text-white/[0.12] transition-all duration-500 animate-pulse"
            style={{ fontSize: "clamp(3rem, 20cqw, 6rem)", animationDuration: "5s" }}
          >
            {acronym}
          </span>
        </div>

        {/* Center default state */}
        <div className="absolute inset-0 flex items-center justify-center transition-opacity duration-300 group-hover:opacity-0 pointer-events-none">
          {isUnconfigured ? (
            <div className="flex flex-col items-center gap-1.5 opacity-80 animate-pulse" style={{ animationDuration: "3s" }}>
              <span className="text-2xl drop-shadow-md">✨</span>
              <span className="text-[9px] font-bold text-white/60 tracking-wider uppercase font-mono">
                CONFIGURAR ADN
              </span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1.5 opacity-70 animate-bounce" style={{ animationDuration: "3.5s" }}>
              <span className="text-2xl drop-shadow-md">{style.isGoldEmblem ? "👑" : vibe.emoji}</span>
              <span className="text-[9px] font-bold text-white/50 tracking-wider uppercase font-mono">
                {rpgState.cohesionScore}% COHESIÓN
              </span>
            </div>
          )}
        </div>

        {/* Dynamic Vibe Hover Visualizer with Evolved Upgrades */}
        <div className="opacity-0 group-hover:opacity-100 transition-opacity duration-300">
          <VibeVisualizer vibe={vibe} isEvolved={rpgState.isEvolved} level={rpgState.level} />
        </div>

        {/* Top-left: Vibe Badge on hover */}
        <div className="absolute top-2.5 left-2.5 opacity-0 group-hover:opacity-100 transition-all duration-300 z-20">
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-bold tracking-wider bg-black/80 ${vibe.borderAccent} text-white backdrop-blur-md shadow-md`}>
            <span>{vibe.emoji}</span>
            <span>{vibe.badge}</span>
          </span>
        </div>

        {/* Top-right: SINGLE Clean RPG State Badge + Discrete Classification Icon */}
        <div className="absolute top-2.5 right-2.5 z-20 flex items-center gap-1.5">
          {classificationIcon && (
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 border border-white/20 text-[10px] backdrop-blur-md shadow-sm"
              title={`Clasificación: ${classification}`}
            >
              {classificationIcon}
            </span>
          )}
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[9px] font-black tracking-wider ${style.badge} backdrop-blur-sm shadow-sm`}>
            {rpgState.badgeLabel}
          </span>
        </div>

        {/* Bottom bar: quick stats overlay (Tracks + Cohesion %) */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent px-3 pb-2.5 pt-6 z-20">
          <div className="flex items-end justify-between gap-1">
            <span className="text-[11px] font-semibold text-white/90">
              {rpgState.trackCount.toLocaleString()}
              <span className="ml-0.5 text-[9px] font-normal text-white/40">tracks</span>
            </span>
            <span className={`text-[10px] font-bold ${style.accentColor}`}>
              {rpgState.cohesionScore}% Cohesión
            </span>
          </div>

          {/* Cohesion Meter */}
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-white/10 p-0.25">
            <div
              className={`h-full rounded-full transition-all duration-700 ${
                rpgState.cohesionScore >= 80 ? "bg-gradient-to-r from-emerald-400 to-teal-300" :
                rpgState.cohesionScore >= 70 ? "bg-gradient-to-r from-lime-400 to-emerald-400" :
                rpgState.cohesionScore >= 50 ? "bg-gradient-to-r from-sky-400 to-blue-400" :
                                              "bg-gradient-to-r from-amber-400 to-rose-400"
              }`}
              style={{ width: `${Math.min(100, Math.max(8, rpgState.cohesionScore))}%` }}
            />
          </div>
        </div>
      </div>

      {/* ── Metadata footer (Clean: Name + Owner only, NO duplicate badges) ── */}
      <div className="flex flex-col gap-0.5 px-3 py-2.5 bg-[#0d0d14]">
        <p className={`truncate text-sm font-semibold text-white/90 group-hover:${style.accentColor} transition-colors duration-200`} title={playlist.name}>
          {playlist.name}
        </p>
        <span className="text-[11px] text-white/35 truncate">
          {playlist.owner_name ?? "MyMusic"}
        </span>
      </div>
    </div>
  );
}

// ─── Grid ─────────────────────────────────────────────────────────────────────

export function PlaylistsGrid() {
  const router = useRouter();
  const [playlists, setPlaylists] = useState<MusicLibraryPlaylist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  const [classifications, setClassifications] = useState<Record<string, PlaylistClassification>>({});
  const [interceptPlaylist, setInterceptPlaylist] = useState<MusicLibraryPlaylist | null>(null);

  // ── PROMPT 5.2: Background Scan, Direct Audit Swipe Deck & Level Victory ──
  const [activeAuditDeck, setActiveAuditDeck] = useState<{
    playlist: MusicLibraryPlaylist;
    targetIdOrName: string;
    items: AuditedTrackItem[];
    totalCount: number;
    level: number;
    covers: string[];
  } | null>(null);

  const [celebratingPlaylist, setCelebratingPlaylist] = useState<{
    name: string;
    level: number;
    totalTracks: number;
    covers: string[];
    targetIdOrName: string;
  } | null>(null);

  const handleApproveSwipeInGrid = (item: AuditedTrackItem) => {
    playRewardSound("perfect");
    setActiveAuditDeck((prev) => {
      if (!prev) return null;
      const nextItems = prev.items.filter((i) => i.id !== item.id);
      return { ...prev, items: nextItems };
    });
  };

  const handleDiscardSwipeInGrid = (item: AuditedTrackItem) => {
    playRewardSound("chaotic");
    setActiveAuditDeck((prev) => {
      if (!prev) return null;
      const nextItems = prev.items.filter((i) => i.id !== item.id);
      return { ...prev, items: nextItems, totalCount: Math.max(0, prev.totalCount - 1) };
    });
  };

  const handleCompleteAuditDeck = () => {
    if (!activeAuditDeck) return;
    const { playlist, targetIdOrName, totalCount, level, covers } = activeAuditDeck;
    setActiveAuditDeck(null);

    if (totalCount >= 100) {
      playRewardSound("fanfare");
      setCelebratingPlaylist({
        name: playlist.name,
        level,
        totalTracks: totalCount,
        covers,
        targetIdOrName,
      });
    } else {
      router.push(`/playlist/${targetIdOrName}`);
    }
  };

  const fetchLocalLibrary = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const libData = await loadMusicLibrary();
      setPlaylists(libData.playlists || []);
      setClassifications(getSavedClassifications());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar la biblioteca");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLocalLibrary();
    const onUpdate = () => fetchLocalLibrary();
    window.addEventListener("mymusic_library_updated", onUpdate);
    window.addEventListener("mymusic_classification_updated", onUpdate);
    window.addEventListener("mymusic_track_transferred", onUpdate);
    window.addEventListener("storage", onUpdate);
    return () => {
      window.removeEventListener("mymusic_library_updated", onUpdate);
      window.removeEventListener("mymusic_classification_updated", onUpdate);
      window.removeEventListener("mymusic_track_transferred", onUpdate);
      window.removeEventListener("storage", onUpdate);
    };
  }, [fetchLocalLibrary]);

  const handleCardClick = (e: React.MouseEvent, playlist: MusicLibraryPlaylist) => {
    e.stopPropagation();
    e.preventDefault();
    const key = playlist.id ?? playlist.name;
    const existing = classifications[key];

    if (!existing) {
      setInterceptPlaylist(playlist);
      return;
    }

    const targetUrl = `/playlist/${playlist.id ?? encodeURIComponent(playlist.name)}`;
    router.push(targetUrl);
  };

  const handleWizardComplete = async (
    type: PlaylistClassification,
    rules?: CurationRules | null,
    newName?: string | null
  ) => {
    if (!interceptPlaylist) return;
    const key = interceptPlaylist.id ?? interceptPlaylist.name;

    const targetIdOrName = await savePlaylistCurationConfig(key, type, rules, newName);
    setClassifications((prev) => ({ ...prev, [key]: type }));

    // ── PROMPT 5.2: Intelligent Background Scan & Conditional Branching ──
    if (type === "objetivo") {
      let tracks = interceptPlaylist.tracks_data ?? [];
      let totalCount = tracks.length || interceptPlaylist.total_tracks || 0;

      // Ensure full tracks_data is hydrated from library
      if (tracks.length === 0) {
        try {
          const fullLib = await loadMusicLibrary();
          const found = fullLib.playlists.find(
            (p) => p.id === key || p.name === key || p.name === interceptPlaylist.name
          );
          if (found?.tracks_data && found.tracks_data.length > 0) {
            tracks = found.tracks_data;
            totalCount = tracks.length;
          }
        } catch (e) {
          console.warn("[PlaylistsGrid] Failed to hydrate full tracks:", e);
        }
      }

      const calculatedLevel = Math.max(1, Math.floor(totalCount / 100));

      const covers = tracks
        .map((t) => t.album_cover ?? t.image_url)
        .filter(Boolean) as string[];

      if (interceptPlaylist.image_url && !covers.includes(interceptPlaylist.image_url)) {
        covers.unshift(interceptPlaylist.image_url);
      }

      // Background evaluate orange / doubtful tracks (low energy <= 0.4 or unanalyzed)
      const orangeTracks = tracks.filter((t) => {
        const energy = t.audio_features?.energy ?? t.energy;
        const tempo = t.audio_features?.tempo ?? t.bpm;
        return (
          (typeof energy === "number" && energy <= 0.4) ||
          typeof tempo !== "number" ||
          tempo <= 0
        );
      });

      if (orangeTracks.length > 0) {
        // Lanzar inmediatamente el Swipe Deck de Auditoría
        const auditItems: AuditedTrackItem[] = orangeTracks.map((t, idx) => ({
          id: t.id ?? `${t.name}-${idx}`,
          track: t,
          targetPlanetId: targetIdOrName,
          targetPlanetName: newName || interceptPlaylist.name,
          reason:
            typeof (t.audio_features?.energy ?? t.energy) === "number" &&
            (t.audio_features?.energy ?? t.energy)! <= 0.4
              ? `Baja energía acústica (${Math.round(((t.audio_features?.energy ?? t.energy)!) * 100)}%)`
              : "Parámetros acústicos atípicos",
        }));

        setActiveAuditDeck({
          playlist: { ...interceptPlaylist, tracks_data: tracks },
          targetIdOrName,
          items: auditItems,
          totalCount,
          level: calculatedLevel,
          covers,
        });
        setInterceptPlaylist(null);
        return;
      } else {
        // Cero pistas en naranja -> Si supera 100 canciones, ¡Celebración Solitario Directa!
        if (totalCount >= 100) {
          playRewardSound("fanfare");
          setCelebratingPlaylist({
            name: newName || interceptPlaylist.name,
            level: calculatedLevel,
            totalTracks: totalCount,
            covers,
            targetIdOrName,
          });
          setInterceptPlaylist(null);
          return;
        }
      }
    }

    setInterceptPlaylist(null);
    router.push(`/playlist/${targetIdOrName}`);
  };

  const rpgStats = useMemo(() => {
    let unconfigured = 0;
    let perfect = 0;
    let almost = 0;
    let creation = 0;
    let target = 0;
    let chaotic = 0;

    playlists.forEach((p) => {
      const key = p.id ?? p.name;
      const s = getPlaylistRPGState(p, classifications[key]);
      if (s.category === "unconfigured") unconfigured++;
      else if (s.category === "perfect") perfect++;
      else if (s.category === "almost_perfect") almost++;
      else if (s.category === "in_creation") creation++;
      else if (s.category === "target") target++;
      else chaotic++;
    });

    return { unconfigured, perfect, almost, creation, target, chaotic };
  }, [playlists, classifications]);

  if (isLoading) {
    return (
      <section className="w-full">
        <div className="mb-4 h-5 w-40 animate-pulse rounded bg-white/5" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {Array.from({ length: 10 }).map((_, i) => <SkeletonCard key={i} />)}
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="w-full rounded-2xl border border-white/5 bg-surface/50 p-6 text-center">
        <p className="text-sm text-white/40">{error}</p>
        <button onClick={fetchLocalLibrary} className="mt-3 text-xs text-white/30 underline hover:text-white">
          Reintentar
        </button>
      </section>
    );
  }

  if (playlists.length === 0) {
    return (
      <section className="w-full flex flex-col items-center justify-center rounded-2xl border border-white/5 bg-surface p-10 text-center gap-4">
        <p className="text-white/40">No se encontraron playlists en la biblioteca local.</p>
        <SyncButton />
      </section>
    );
  }

  console.log("🚨 [DEBUG] RENDERIZANDO PLAYLISTSGRID", { playlistsCount: playlists.length });

  return (
    <section className="w-full">
      {/* Header row with clean RPG progression summary */}
      <div className="mb-6 flex flex-col gap-4 border-b border-white/5 pb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              Biblioteca de Curación RPG
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-normal text-white/60">
                {playlists.length}
              </span>
            </h2>

            <div className="mt-1.5 flex items-center gap-3 flex-wrap">
              {rpgStats.unconfigured > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-white/50 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/40" />
                  {rpgStats.unconfigured} Sin configurar
                </span>
              )}
              {rpgStats.perfect > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-purple-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-purple-400" />
                  {rpgStats.perfect} Perfecta{rpgStats.perfect > 1 ? "s" : ""}
                </span>
              )}
              {rpgStats.almost > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-lime-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-lime-400" />
                  {rpgStats.almost} Casi Perfecta{rpgStats.almost > 1 ? "s" : ""}
                </span>
              )}
              {rpgStats.target > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-emerald-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  {rpgStats.target} Objetivo{rpgStats.target > 1 ? "s" : ""}
                </span>
              )}
              {rpgStats.creation > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-sky-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-sky-400" />
                  {rpgStats.creation} En Creación
                </span>
              )}
              {rpgStats.chaotic > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {rpgStats.chaotic} Caótica{rpgStats.chaotic > 1 ? "s" : ""}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (window.confirm("¿Restablecer todas las clasificaciones de playlists al estado inicial 'Sin configurar'?")) {
                  clearAllPlaylistClassifications();
                  setClassifications({});
                  fetchLocalLibrary();
                }
              }}
              className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/60 hover:border-amber-400/40 hover:bg-amber-500/10 hover:text-amber-300 transition-all cursor-pointer"
              title="Restablece las clasificaciones para volver a probar el asistente inicial"
            >
              <span>🔄</span>
              <span className="hidden sm:inline">Restablecer Estados</span>
            </button>
            <SyncButton />
          </div>
        </div>

        {/* ── Global Push Control Center (Neón Azul Compacto) ── */}
        <GlobalPushHub />
      </div>


      {/* Cards grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
        {playlists.map((pl, idx) => {
          const key = pl.id ?? pl.name ?? String(idx);
          return (
            <PlaylistCard
              key={key}
              playlist={pl}
              classification={classifications[key]}
              onClick={(e) => handleCardClick(e, pl)}
            />
          );
        })}
      </div>

      {/* 2-Step Onboarding Wizard Modal */}
      <AnimatePresence>
        {interceptPlaylist && (
          <OnboardingWizardModal
            playlist={interceptPlaylist}
            onComplete={handleWizardComplete}
            onClose={() => setInterceptPlaylist(null)}
          />
        )}
      </AnimatePresence>

      {/* ── Modo Auditoría: Interactive Swipe Deck Modal ── */}
      {activeAuditDeck && (
        <AuditSwipeDeckModal
          queue={activeAuditDeck.items}
          subtitle={`Planeta ${activeAuditDeck.playlist.name} · Nivel ${activeAuditDeck.level}`}
          onApprove={handleApproveSwipeInGrid}
          onDiscard={handleDiscardSwipeInGrid}
          onClose={() => {
            const target = activeAuditDeck.targetIdOrName;
            setActiveAuditDeck(null);
            router.push(`/playlist/${target}`);
          }}
          onComplete={handleCompleteAuditDeck}
        />
      )}

      {/* ── Solitaire Victory Celebration (Dynamic Milestone Level) ── */}
      {celebratingPlaylist && (
        <SolitaireVictoryAnimation
          planetName={celebratingPlaylist.name}
          level={celebratingPlaylist.level}
          totalTracks={celebratingPlaylist.totalTracks}
          albumCovers={celebratingPlaylist.covers}
          onClose={() => {
            const target = celebratingPlaylist.targetIdOrName;
            setCelebratingPlaylist(null);
            router.push(`/playlist/${target}`);
          }}
        />
      )}
    </section>
  );
}
