"use client";

import { useState, useRef } from "react";
import {
  loadMusicLibrary,
  saveMusicLibrary,
  importCSVToLibrary,
} from "@/lib/library/libraryStore";
import { useAuthStore } from "@/store/authStore";
import { useSpotifyAuth } from "@/hooks/useSpotifyAuth";
import { syncSpotifyLibraryClient } from "@/lib/spotify/clientSync";

export function SyncButton() {
  const providerToken = useAuthStore((s) => s.providerToken);
  const { login } = useSpotifyAuth();

  const [isSyncing, setIsSyncing] = useState(false);
  const [isDone, setIsDone] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSyncClick = async () => {
    if (isSyncing) return;

    const token =
      providerToken ||
      (typeof window !== "undefined" ? localStorage.getItem("spotify_provider_token") : null);

    setHasError(false);
    setErrorMessage(null);
    setIsDone(false);

    if (!token) {
      console.warn("[SyncButton] Spotify token is missing, redirecting to login...");
      login();
      return;
    }

    setIsSyncing(true);

    try {
      const currentLib = await loadMusicLibrary();
      await syncSpotifyLibraryClient(token, currentLib);

      setIsDone(true);
      setTimeout(() => {
        setIsDone(false);
      }, 3000);
    } catch (err) {
      console.error("[SyncButton] Error en sincronización silenciosa:", err);
      const msg = err instanceof Error ? err.message : "Error durante la sincronización";
      setHasError(true);
      setErrorMessage(msg);
      setTimeout(() => {
        setHasError(false);
        setErrorMessage(null);
      }, 4000);
    } finally {
      setIsSyncing(false);
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
        setTimeout(() => setIsDone(false), 3000);
      } catch {
        setHasError(true);
        setErrorMessage("Error al importar archivo");
        setTimeout(() => setHasError(false), 3000);
      } finally {
        setIsSyncing(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  };

  // Button style resolver
  const btnClass = [
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-all duration-300 shadow-md cursor-pointer",
    isSyncing
      ? "bg-spotify/20 text-spotify cursor-wait border border-spotify/30 min-w-[140px] justify-center"
      : hasError
      ? "bg-red-500/90 text-white hover:bg-red-600"
      : isDone
      ? "bg-emerald-500 text-black shadow-emerald-500/30"
      : "bg-spotify text-black hover:scale-105 hover:bg-spotify/90 active:scale-95 shadow-spotify/25",
  ].join(" ");

  return (
    <div className="inline-flex items-center gap-2">
      <input
        type="file"
        ref={fileInputRef}
        accept=".csv,.json"
        onChange={handleFileChange}
        className="hidden"
      />

      <button
        id="sync-button"
        onClick={handleSyncClick}
        disabled={isSyncing}
        className={btnClass}
      >
        {isSyncing ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-4 w-4 animate-spin shrink-0 text-spotify"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span className="truncate">Sincronizando...</span>
          </>
        ) : hasError ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-4 w-4 shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="truncate max-w-[160px]" title={errorMessage ?? undefined}>
              {errorMessage || "Error"}
            </span>
          </>
        ) : isDone ? (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="h-4 w-4 shrink-0"
            >
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Sincronizado</span>
          </>
        ) : (
          <>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-4 w-4 shrink-0"
            >
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 16h5v5" />
            </svg>
            <span>Sincronizar</span>
          </>
        )}
      </button>

      {/* CSV/JSON Import Button */}
      <button
        id="import-file-button"
        onClick={() => fileInputRef.current?.click()}
        disabled={isSyncing}
        title="Importar CSV/JSON local"
        className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/20 hover:text-white transition-colors disabled:opacity-40 cursor-pointer"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 1 1 0-4v-4" />
          <polyline points="17 8 12 3 7 8" />
          <line x1="12" y1="3" x2="12" y2="15" />
        </svg>
      </button>
    </div>
  );
}
