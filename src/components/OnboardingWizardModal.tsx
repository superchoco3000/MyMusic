"use client";

import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  detectMacroGenre,
  SUBGENRE_DICTIONARY,
  HIERARCHICAL_MACRO_GENRES,
  generateSmartNamingProposals,
  type SubgenreItem,
  type MacroGenre,
  type MacroGenreCategory,
} from "@/lib/gamification/subgenres";
import type {
  MusicLibraryPlaylist,
  CurationRules,
} from "@/types/library";
import type { PlaylistClassification } from "@/lib/library/libraryStore";

// ─── Scanning Loading State Screen ────────────────────────────────────────────

function ScanningLoadingScreen() {
  const [msgIdx, setMsgIdx] = useState(0);
  const scanTexts = [
    "Escaneando huella acústica...",
    "Calculando densidad de géneros...",
    "Generando identidades...",
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setMsgIdx(1), 650);
    const t2 = setTimeout(() => setMsgIdx(2), 1350);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className="flex flex-col items-center justify-center py-12 px-6 text-center gap-6"
    >
      {/* Radar Holographic Ring */}
      <div className="relative flex items-center justify-center">
        <div className="h-20 w-20 rounded-full border border-spotify/30 animate-ping" style={{ animationDuration: "1.4s" }} />
        <div className="absolute h-16 w-16 rounded-full border-2 border-dashed border-spotify/60 animate-spin" style={{ animationDuration: "4s" }} />
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-spotify/20 text-spotify shadow-lg shadow-spotify/30">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-6 w-6 animate-pulse">
            <path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6Z" />
          </svg>
        </div>
      </div>

      {/* Animated Equalizer */}
      <div className="flex items-end gap-1 h-6">
        {[0.4, 0.9, 0.6, 1.0, 0.7, 0.85, 0.5, 0.95].map((h, i) => (
          <motion.div
            key={i}
            className="w-1 rounded-full bg-gradient-to-t from-spotify to-emerald-300 shadow-xs shadow-spotify/50"
            animate={{ height: [`${h * 30}%`, `${h * 100}%`, `${h * 40}%`] }}
            transition={{ duration: 0.6 + i * 0.1, repeat: Infinity, ease: "easeInOut" }}
          />
        ))}
      </div>

      {/* Dynamic Scan Message */}
      <motion.p
        key={msgIdx}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -6 }}
        transition={{ duration: 0.25 }}
        className="text-sm font-semibold text-white/90 font-mono tracking-wide"
      >
        {scanTexts[msgIdx]}
      </motion.p>
    </motion.div>
  );
}

// ─── Onboarding Wizard: 2-Step DNA & Smart Naming Modal ───────────────────────

export interface OnboardingWizardProps {
  playlist: MusicLibraryPlaylist;
  onComplete: (classification: PlaylistClassification, rules?: CurationRules | null, newName?: string | null) => void;
  onClose: () => void;
}

export function OnboardingWizardModal({ playlist, onComplete, onClose }: OnboardingWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedType, setSelectedType] = useState<PlaylistClassification>("caotica");
  const [isScanning, setIsScanning] = useState(false);

  // Empty playlist detection
  const isEmptyPlaylist =
    (!playlist.tracks_data || playlist.tracks_data.length === 0) &&
    (playlist.total_tracks === 0 || playlist.total_tracks == null);

  // Hierarchical Genre States for Empty Playlists: "macro" -> "subgenres" -> "naming"
  const [emptyStage, setEmptyStage] = useState<"macro" | "subgenres" | "naming">("macro");
  const [customMacroGenre, setCustomMacroGenre] = useState<MacroGenre | null>(null);

  // Genre detection and smart proposals
  const autoMacroGenre = useMemo(() => detectMacroGenre(playlist.name), [playlist.name]);
  const activeMacroGenre = customMacroGenre || autoMacroGenre;

  const activeCategory = useMemo(() => {
    return (
      HIERARCHICAL_MACRO_GENRES.find((g) => g.id === activeMacroGenre) ||
      HIERARCHICAL_MACRO_GENRES[0]
    );
  }, [activeMacroGenre]);

  const subgenreList = useMemo(() => {
    if (isEmptyPlaylist && activeCategory) {
      return activeCategory.subgenres; // Exactly 6 curated subgenres
    }
    return SUBGENRE_DICTIONARY[activeMacroGenre] || SUBGENRE_DICTIONARY.chill;
  }, [isEmptyPlaylist, activeCategory, activeMacroGenre]);

  const namingProposals = useMemo(
    () => generateSmartNamingProposals(playlist.name, activeMacroGenre),
    [playlist.name, activeMacroGenre]
  );

  // Step 2 Form States
  const [selectedSubgenres, setSelectedSubgenres] = useState<string[]>([]);
  const [selectedNameProposal, setSelectedNameProposal] = useState<string>(namingProposals[0]);
  const [keepOriginalName, setKeepOriginalName] = useState(false);

  // Keep selectedNameProposal updated when macro-genre changes
  useEffect(() => {
    if (namingProposals.length > 0) {
      setSelectedNameProposal(namingProposals[0]);
    }
  }, [namingProposals]);

  const toggleSubgenre = (subId: string) => {
    setSelectedSubgenres((prev) =>
      prev.includes(subId) ? prev.filter((id) => id !== subId) : [...prev, subId]
    );
  };

  const handleSelectMacroCategory = (category: MacroGenreCategory) => {
    setCustomMacroGenre(category.id);
    // Pre-select the 6 subgenres
    setSelectedSubgenres(category.subgenres.map((s) => s.id));
    setEmptyStage("subgenres");
  };

  const handleStep1Select = (type: PlaylistClassification) => {
    if (type === "no_personal") {
      onComplete("no_personal", null, playlist.name);
      return;
    }

    if (type === "caotica") {
      // Exención: Las listas caóticas son canteras a vaciar, no requieren configuración pesada de ADN
      onComplete("caotica", null, playlist.name);
      return;
    }

    // Solo las playlists Objetivo pasan a la configuración de ADN
    setSelectedType("objetivo");
    setStep(2);

    if (isEmptyPlaylist) {
      // Lista vacía: Lanzar directamente el Asistente Jerárquico (Paso 1: Macro-Categorías)
      setEmptyStage("macro");
      setIsScanning(false);
    } else {
      // Lista con canciones: Escaneo inteligente de metadatos en background
      setIsScanning(true);
      setTimeout(() => {
        setIsScanning(false);
      }, 1600);
    }
  };

  const handleSave = () => {
    const finalName = keepOriginalName ? playlist.name : selectedNameProposal;
    const rules: CurationRules = {
      era: "all",
      bpm_tolerance: "flexible",
      vibes: [],
      subgenres: selectedSubgenres,
    };
    onComplete(selectedType, rules, finalName);
  };

  const isChaoticTheme = selectedType === "caotica";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.92, opacity: 0, y: 15 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 15 }}
        transition={{ type: "spring", damping: 25, stiffness: 350 }}
        onClick={(e) => e.stopPropagation()}
        className={`w-full max-w-2xl rounded-3xl border bg-[#0e0e18] p-6 shadow-2xl flex flex-col gap-5 ${
          step === 2 && isChaoticTheme ? "border-amber-500/30" : step === 2 ? "border-emerald-500/30" : "border-white/10"
        }`}
      >
        <AnimatePresence mode="wait">
          {step === 1 ? (
            /* ── Step 1: Playlist Classification ── */
            <motion.div
              key="step1"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-5"
            >
              <div className="flex items-start justify-between border-b border-white/5 pb-4">
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-spotify">
                    Clasificación de Lista · Onboarding
                  </span>
                  <h3 className="text-lg font-bold text-white">¿Qué función cumple esta lista?</h3>
                  <p className="text-xs text-white/50 truncate max-w-[280px]">{playlist.name}</p>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/5 p-1.5 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => handleStep1Select("caotica")}
                  className="group flex items-center gap-3.5 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-left hover:border-amber-400/60 hover:bg-amber-500/15 transition-all cursor-pointer hover:scale-[1.01]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/20 text-amber-300 text-xl group-hover:scale-110 transition-transform">🌪️</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-white group-hover:text-amber-200">Playlist Caótica (Cantera)</p>
                      <span className="text-[10px] font-semibold text-amber-400">Configurar Directo ⚡</span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug mt-0.5">Fuente de extracción para vaciar y clasificar. Configuración directa e instantánea.</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleStep1Select("objetivo")}
                  className="group flex items-center gap-3.5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 text-left hover:border-emerald-400/60 hover:bg-emerald-500/15 transition-all cursor-pointer hover:scale-[1.01]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-300 text-xl group-hover:scale-110 transition-transform">🎯</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-white group-hover:text-emerald-200">Playlist Objetivo (Receptora)</p>
                      <span className="text-[10px] font-semibold text-emerald-400">
                        {isEmptyPlaylist ? "Asistente Jerárquico 🧬" : "Asistente ADN →"}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug mt-0.5">
                      {isEmptyPlaylist
                        ? "Lista vacía: Selección en cascada de Macro-Género y 6 Subgéneros específicos."
                        : "Destino curado con calidad benchmark. Asistente de ADN, subgéneros y naming."}
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => handleStep1Select("no_personal")}
                  className="group flex items-center gap-3.5 rounded-2xl border border-slate-500/20 bg-slate-500/5 p-4 text-left hover:border-slate-400/60 hover:bg-slate-500/15 transition-all cursor-pointer hover:scale-[1.01]"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-500/20 text-slate-300 text-xl group-hover:scale-110 transition-transform">📁</div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-bold text-sm text-white group-hover:text-slate-200">Playlist No Personal</p>
                      <span className="text-[10px] font-semibold text-slate-400">Archivar 📁</span>
                    </div>
                    <p className="text-xs text-white/40 leading-snug mt-0.5">Lista compartida o externa (mantiene estado neutral).</p>
                  </div>
                </button>
              </div>
            </motion.div>
          ) : isScanning ? (
            /* ── Scanning Loading State ── */
            <ScanningLoadingScreen key="scanning" />
          ) : isEmptyPlaylist && emptyStage === "macro" ? (
            /* ── Asistente Jerárquico: Paso 1 (Selección de Macro-Categoría) ── */
            <motion.div
              key="empty-macro"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4 max-h-[82vh] overflow-y-auto pr-1"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    ← Tipo
                  </button>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Asistente Jerárquico de ADN</span>
                      <span className="rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 text-[9px] font-bold">
                        PLAYLIST VACÍA
                      </span>
                    </h3>
                    <p className="text-xs text-white/50">
                      Paso 1 de 2: Elige el Género Principal para orientar el vector acústico.
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/5 p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Grid de 8 Macro-Categorías */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-1">
                {HIERARCHICAL_MACRO_GENRES.map((cat) => (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleSelectMacroCategory(cat)}
                    className={`group flex items-start gap-3 rounded-2xl border border-white/10 bg-gradient-to-r ${cat.gradient} p-3.5 text-left transition-all cursor-pointer hover:border-cyan-400/70 hover:scale-[1.02] active:scale-[0.98] shadow-lg`}
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/10 border border-white/15 text-xl group-hover:scale-110 transition-transform">
                      {cat.icon}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p className="font-bold text-sm text-white group-hover:text-cyan-200 truncate">
                          {cat.name}
                        </p>
                        <span className="text-[9px] font-bold text-cyan-400">6 Subgéneros →</span>
                      </div>
                      <p className="text-[10.5px] text-white/50 leading-snug mt-0.5 line-clamp-2">
                        {cat.description}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </motion.div>
          ) : isEmptyPlaylist && emptyStage === "subgenres" ? (
            /* ── Asistente Jerárquico: Paso 2 (Submodal de 6 Subgéneros Específicos) ── */
            <motion.div
              key="empty-subgenres"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4 max-h-[82vh] overflow-y-auto pr-1"
            >
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => setEmptyStage("macro")}
                    className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    ← Géneros
                  </button>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>{activeCategory.icon} {activeCategory.name}</span>
                      <span className="rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-400/30 px-2 py-0.5 text-[9px] font-bold">
                        6 SUBGÉNEROS ASOCIADOS
                      </span>
                    </h3>
                    <p className="text-xs text-white/50">
                      Paso 2: Ajusta los subgéneros clave que definirán la afinidad musical.
                    </p>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/5 p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* Grid de los 6 Subgéneros Específicos */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {activeCategory.subgenres.map((sub) => {
                  const isSelected = selectedSubgenres.includes(sub.id);
                  return (
                    <button
                      key={sub.id}
                      type="button"
                      onClick={() => toggleSubgenre(sub.id)}
                      className={`flex flex-col gap-1 rounded-2xl p-3 text-left transition-all cursor-pointer border ${
                        isSelected
                          ? "bg-cyan-500/20 border-cyan-400/80 shadow-md shadow-cyan-500/20 text-cyan-200"
                          : "bg-white/[0.03] border-white/5 text-white/60 hover:bg-white/[0.07] hover:border-white/15 hover:text-white"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-white/80"}`}>
                          {sub.name}
                        </span>
                        <span className={`text-xs font-bold ${isSelected ? "text-cyan-300" : "text-white/20"}`}>
                          {isSelected ? "✓" : "+"}
                        </span>
                      </div>
                      <p className={`text-[10px] leading-snug ${isSelected ? "text-white/80 font-medium" : "text-white/30"}`}>
                        {sub.includes}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Continuar a Naming */}
              <div className="mt-2 pt-3 border-t border-white/5 flex items-center justify-between gap-3">
                <span className="text-xs text-white/50">
                  {selectedSubgenres.length} de 6 subgéneros seleccionados
                </span>
                <button
                  type="button"
                  onClick={() => setEmptyStage("naming")}
                  disabled={selectedSubgenres.length === 0}
                  className="rounded-2xl bg-gradient-to-r from-cyan-400 to-teal-400 px-6 py-2.5 text-xs font-bold text-black shadow-lg shadow-cyan-500/25 hover:scale-105 active:scale-95 transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Continuar a Naming →
                </button>
              </div>
            </motion.div>
          ) : (
            /* ── Step 2 / Final Stage: Enriched Subgenres & Smart Naming ── */
            <motion.div
              key="step2-naming"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-5 max-h-[82vh] overflow-y-auto pr-1"
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-white/5 pb-3">
                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      if (isEmptyPlaylist) {
                        setEmptyStage("subgenres");
                      } else {
                        setStep(1);
                        setIsScanning(false);
                      }
                    }}
                    className="flex items-center gap-1 rounded-lg bg-white/5 px-2.5 py-1 text-xs text-white/60 hover:bg-white/10 hover:text-white transition-colors cursor-pointer"
                  >
                    ← {isEmptyPlaylist ? "Subgéneros" : "Tipo"}
                  </button>
                  <div>
                    <h3 className="text-base font-bold text-white flex items-center gap-2">
                      <span>Copiloto de ADN &amp; Identidad</span>
                      <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold ${
                        isChaoticTheme ? "bg-amber-500/20 text-amber-300 border border-amber-400/30" : "bg-emerald-500/20 text-emerald-300 border border-emerald-400/30"
                      }`}>
                        {isChaoticTheme ? "CAÓTICA" : "OBJETIVO"}
                      </span>
                    </h3>
                  </div>
                </div>
                <button onClick={onClose} className="rounded-full bg-white/5 p-1 text-white/40 hover:bg-white/10 hover:text-white transition-colors cursor-pointer">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className="h-4 w-4">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* ── Subgéneros seleccionados resumen (si no viene de lista vacía) ── */}
              {!isEmptyPlaylist && (
                <div className="flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                      <span>🧬 Sección A: Subgéneros Presentes</span>
                    </label>
                    <span className="text-[10px] text-white/40 font-mono">
                      Género: <span className="text-white/80 font-bold uppercase">{activeMacroGenre}</span> ({selectedSubgenres.length} elegidos)
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {subgenreList.map((sub: SubgenreItem) => {
                      const isSelected = selectedSubgenres.includes(sub.id);
                      return (
                        <button
                          key={sub.id}
                          type="button"
                          onClick={() => toggleSubgenre(sub.id)}
                          className={`flex flex-col gap-1 rounded-2xl p-3 text-left transition-all cursor-pointer border ${
                            isSelected
                              ? isChaoticTheme
                                ? "bg-amber-500/20 border-amber-400/80 shadow-md shadow-amber-500/20 text-amber-200"
                                : "bg-emerald-500/20 border-emerald-400/80 shadow-md shadow-emerald-500/20 text-emerald-200"
                              : "bg-white/[0.03] border-white/5 text-white/60 hover:bg-white/[0.07] hover:border-white/15 hover:text-white"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-xs font-bold ${isSelected ? "text-white" : "text-white/80"}`}>
                              {sub.name}
                            </span>
                            <span className={`text-xs font-bold ${isSelected ? (isChaoticTheme ? "text-amber-300" : "text-emerald-300") : "text-white/20"}`}>
                              {isSelected ? "✓" : "+"}
                            </span>
                          </div>
                          <p className={`text-[10px] leading-snug ${isSelected ? "text-white/80 font-medium" : "text-white/30"}`}>
                            {sub.includes}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Sección B (Identidad): Smart Naming Proposals ── */}
              <div className="flex flex-col gap-2.5 pt-2 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-white/80 uppercase tracking-wider flex items-center gap-1.5">
                    <span>🏷️ Sección {isEmptyPlaylist ? "A" : "B"}: Nombre Estandarizado</span>
                  </label>
                  <span className="text-[10px] text-white/40 font-mono">5 propuestas de estilo</span>
                </div>

                <div className={`flex flex-col gap-2 ${keepOriginalName ? "opacity-40 pointer-events-none" : ""}`}>
                  {namingProposals.map((proposal, idx) => {
                    const isSelected = selectedNameProposal === proposal && !keepOriginalName;
                    const badgeType =
                      idx < 3 ? { label: "PRO", color: "bg-blue-500/20 text-blue-300 border-blue-400/30" } :
                      idx === 3 ? { label: "HÍBRIDO", color: "bg-purple-500/20 text-purple-300 border-purple-400/30" } :
                                  { label: "LORE / ANOMALÍA", color: "bg-amber-500/20 text-amber-300 border-amber-400/30" };

                    return (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setSelectedNameProposal(proposal)}
                        className={`flex items-center justify-between gap-2.5 rounded-xl px-3.5 py-2.5 text-left border transition-all cursor-pointer ${
                          isSelected
                            ? isChaoticTheme
                              ? "bg-amber-500/25 border-amber-400 text-amber-100 shadow-sm shadow-amber-500/20"
                              : "bg-emerald-500/25 border-emerald-400 text-emerald-100 shadow-sm shadow-emerald-500/20"
                            : "bg-white/[0.03] border-white/5 text-white/70 hover:bg-white/[0.07] hover:text-white"
                        }`}
                      >
                        <span className="text-xs font-bold truncate flex-1">{proposal}</span>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-bold ${badgeType.color}`}>
                          {badgeType.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Sección C (Override): Mantener Nombre Original ── */}
              <div className="flex flex-col gap-1.5 pt-2 border-t border-white/5">
                <button
                  type="button"
                  onClick={() => setKeepOriginalName(!keepOriginalName)}
                  className={`flex items-start gap-3 rounded-2xl border p-3 text-left transition-all cursor-pointer ${
                    keepOriginalName
                      ? "bg-white/10 border-white/30 text-white"
                      : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/[0.05]"
                  }`}
                >
                  <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors ${
                    keepOriginalName ? "bg-spotify border-spotify text-black" : "border-white/30 bg-transparent"
                  }`}>
                    {keepOriginalName && <span className="text-xs font-black">✓</span>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-white">
                      Mantener el nombre original: <span className="text-spotify">&quot;{playlist.name}&quot;</span>
                    </p>
                    <p className="text-[10px] text-white/40 mt-0.5">
                      El sistema guardará la huella acústica de todas formas.
                    </p>
                  </div>
                </button>
              </div>

              {/* ── Final CTA Button ── */}
              <div className="mt-2 pt-2 border-t border-white/5 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={handleSave}
                  className={`w-full rounded-2xl py-3 text-sm font-bold shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2 hover:scale-[1.01] active:scale-[0.99] ${
                    isChaoticTheme
                      ? "bg-gradient-to-r from-amber-400 to-orange-500 text-black shadow-amber-500/25 hover:shadow-amber-500/40"
                      : "bg-gradient-to-r from-emerald-400 to-teal-500 text-black shadow-emerald-500/25 hover:shadow-emerald-500/40"
                  }`}
                >
                  <span>Guardar y Activar Objetivo</span>
                  <span>⚡</span>
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
