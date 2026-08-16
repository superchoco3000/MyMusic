"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import {
  refreshLibraryFromStatic,
  loadMusicLibrary,
  saveMusicLibrary,
  importCSVToLibrary,
} from "@/lib/library/libraryStore";
import { useAuthStore } from "@/store/authStore";

// ── Rate-limit patterns to detect from error messages ────────────────────────
const RATE_LIMIT_PATTERNS = [
  /rate[/\s._-]?limit/i,
  /429/,
  /retry[/\s._-]?after/i,
  /retry will occur/i,
  /max retries/i,
  /cooldown/i,
  /\b\d+\s*s\b/i,   // e.g. "9929 s" or "10528 s"
];

function isRateLimitError(msg: string): boolean {
  return RATE_LIMIT_PATTERNS.some((re) => re.test(msg));
}

// ── Phase labels ──────────────────────────────────────────────────────────────
const PHASE_LABELS: Record<string, string> = {
  delta:    "Buscando cambios...",
  enrich:   "Enriqueciendo metadatos...",
  complete: "Completado",
};
const PHASE_STEPS: Record<string, number> = { delta: 1, enrich: 2, complete: 2 };
const TOTAL_STEPS = 2;

interface SyncStatus {
  status: "syncing" | "done" | "error";
  phase?: string;
  phase_label?: string;
  message?: string;
  rate_limited?: boolean;
  warning?: boolean;
  updated_at?: string;
}

// ── Phase progress bar ────────────────────────────────────────────────────────
function PhaseProgress({ phase }: { phase: string | undefined }) {
  const step = phase ? (PHASE_STEPS[phase] ?? 1) : 1;
  return (
    <div className="flex items-center gap-1 mt-1.5">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div
          key={i}
          className={[
            "h-0.5 flex-1 rounded-full transition-all duration-500",
            i < step ? "bg-spotify" : "bg-white/20",
          ].join(" ")}
        />
      ))}
    </div>
  );
}

// ── Clock icon (cooldown state) ───────────────────────────────────────────────
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} className={className}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

// ── SyncButton ────────────────────────────────────────────────────────────────
export function SyncButton() {
  const providerToken = useAuthStore((s) => s.providerToken);

  const [isSyncing, setIsSyncing]       = useState(false);
  const [isDone, setIsDone]             = useState(false);
  const [hasError, setHasError]         = useState(false);
  const [isCooldown, setIsCooldown]     = useState(false);   // ← NEW: 429 state
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [syncStatus, setSyncStatus]     = useState<SyncStatus | null>(null);

  const fileInputRef    = useRef<HTMLInputElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cooldownTimerId = useRef<NodeJS.Timeout | null>(null);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => {
    stopPolling();
    if (cooldownTimerId.current) clearTimeout(cooldownTimerId.current);
  }, [stopPolling]);

  /** Activates the cooldown state for `seconds` seconds (default 60s UI-side) */
  const activateCooldown = useCallback((msg: string, seconds = 60) => {
    setIsSyncing(false);
    setHasError(false);
    setIsCooldown(true);
    setErrorMessage(msg);
    // Auto-clear cooldown after the UI cooldown period
    if (cooldownTimerId.current) clearTimeout(cooldownTimerId.current);
    cooldownTimerId.current = setTimeout(() => {
      setIsCooldown(false);
      setErrorMessage(null);
    }, seconds * 1000);
  }, []);

  const handleSyncClick = async () => {
    if (isSyncing || isCooldown) return;
    setIsSyncing(true);
    setIsDone(false);
    setHasError(false);
    setIsCooldown(false);
    setErrorMessage(null);
    setSyncStatus(null);
    stopPolling();

    try {
      const triggerRes = await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_token: providerToken }),
      });

      if (!triggerRes.ok && triggerRes.status === 401) {
        const errData = await triggerRes.json().catch(() => ({}));
        throw new Error(errData?.error || "Token de Spotify no válido o expirado.");
      }

      let pollCount = 0;
      let lastPhase = "";

      pollIntervalRef.current = setInterval(async () => {
        pollCount++;
        try {
          const res = await fetch(`/data/sync_status.json?t=${Date.now()}`, { cache: "no-store" });
          if (!res.ok) return;

          const statusData: SyncStatus = await res.json();
          setSyncStatus(statusData);

          if (statusData.phase && statusData.phase !== lastPhase) {
            console.log(`[SyncButton] Phase: ${lastPhase} → ${statusData.phase}`);
            lastPhase = statusData.phase;
          }

          // ── Rate limit detected in status message ────────────────────────
          if (statusData.status === "error" && (statusData.rate_limited || isRateLimitError(statusData.message ?? ""))) {
            stopPolling();
            activateCooldown("API en Cooldown · Spotify Rate Limit", 60);
            return;
          }

          if (statusData.status === "done") {
            stopPolling();
            await refreshLibraryFromStatic(); // internally calls saveMusicLibrary → dispatches mymusic_library_updated
            setIsSyncing(false);
            setIsDone(true);
            setSyncStatus(statusData);
            setTimeout(() => { setIsDone(false); setSyncStatus(null); }, 3000);
            return;
          }

          if (statusData.status === "error") {
            stopPolling();
            setIsSyncing(false);
            setHasError(true);
            setErrorMessage(statusData.message || "Error en la sincronización (ver sync.log)");
            setSyncStatus(statusData);
            setTimeout(() => { setHasError(false); setErrorMessage(null); setSyncStatus(null); }, 6000);
            return;
          }
        } catch { /* file not written yet */ }

        if (pollCount > 100) {
          stopPolling();
          await refreshLibraryFromStatic();
          setIsSyncing(false);
          setSyncStatus(null);
        }
      }, 3000);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error de conexión";
      stopPolling();
      if (isRateLimitError(msg)) {
        activateCooldown("API en Cooldown · Spotify Rate Limit", 60);
      } else {
        setIsSyncing(false);
        setHasError(true);
        setErrorMessage(msg);
        setTimeout(() => { setHasError(false); setErrorMessage(null); }, 5000);
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsSyncing(true);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      const content = evt.target?.result as string;
      try {
        const currentLib = await loadMusicLibrary();
        if (file.name.endsWith(".json")) {
          saveMusicLibrary(JSON.parse(content));
        } else {
          importCSVToLibrary(currentLib, content, file.name);
        }
        setIsDone(true);
      } catch {
        setHasError(true);
        setErrorMessage("Error al importar archivo");
      } finally {
        setIsSyncing(false);
        setTimeout(() => { setIsDone(false); setHasError(false); }, 3000);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  const phaseKey    = syncStatus?.phase;
  const syncingLabel = phaseKey
    ? (PHASE_LABELS[phaseKey] ?? syncStatus?.phase_label ?? "Sincronizando...")
    : "Sincronizando...";

  // ── Button style resolver ─────────────────────────────────────────────────
  const btnClass = [
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 shadow-md",
    isSyncing
      ? "bg-spotify/20 text-spotify cursor-wait border border-spotify/30 min-w-[168px] justify-center"
      : isCooldown
      ? "bg-amber-500/10 text-amber-400 border border-amber-500/30 cursor-not-allowed min-w-[220px] justify-center"
      : hasError
      ? "bg-red-500/90 text-white hover:bg-red-600"
      : isDone
      ? "bg-emerald-500 text-black"
      : "bg-spotify text-black hover:scale-105 hover:bg-spotify/90 active:scale-95",
  ].join(" ");

  return (
    <div className="inline-flex items-center gap-2">
      <input type="file" ref={fileInputRef} accept=".csv,.json" onChange={handleFileChange} className="hidden" />

      <div className="flex flex-col items-stretch">
        <button
          id="sync-button"
          onClick={handleSyncClick}
          disabled={isSyncing || isCooldown}
          className={btnClass}
        >
          {isSyncing ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"
                className="h-4 w-4 animate-spin shrink-0 text-spotify">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span className="truncate">{syncingLabel}</span>
            </>
          ) : isCooldown ? (
            <>
              <ClockIcon className="h-4 w-4 shrink-0 animate-pulse" />
              <span className="truncate">API en Cooldown</span>
            </>
          ) : hasError ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 shrink-0">
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="truncate max-w-[160px]" title={errorMessage ?? undefined}>
                {errorMessage || "Error (Ver sync.log)"}
              </span>
            </>
          ) : isDone ? (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" className="h-4 w-4 shrink-0">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <span>Sincronizado</span>
            </>
          ) : (
            <>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-4 w-4 shrink-0">
                <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
                <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
                <path d="M16 16h5v5" />
              </svg>
              <span>Sincronizar</span>
            </>
          )}
        </button>

        {/* Cooldown tooltip */}
        {isCooldown && (
          <p className="mt-1 text-center text-[10px] text-amber-500/70 leading-tight max-w-[220px]">
            Spotify Rate Limit · Se desbloqueará automáticamente
          </p>
        )}

        {/* Syncing: phase progress */}
        {isSyncing && (
          <div className="px-1 mt-1">
            <PhaseProgress phase={phaseKey} />
            {phaseKey && (
              <p className="text-center text-[10px] text-white/30 mt-0.5 tabular-nums">
                Paso {PHASE_STEPS[phaseKey] ?? 1} / {TOTAL_STEPS}
              </p>
            )}
          </div>
        )}
      </div>

      {/* CSV/JSON Import Button */}
      <button
        id="import-file-button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSyncing}
        title="Importar CSV/JSON local"
        className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 1 1 0-4v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
    </div>
  );
}
