"use client";

import { useParams, useRouter } from "next/navigation";
import { useAuthStore } from "@/store/authStore";
import { useEffect } from "react";

export default function SortPlaylistPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const providerToken = useAuthStore((s) => s.providerToken);
  const playlistId = params?.id ?? "";

  useEffect(() => {
    if (!providerToken) {
      router.replace("/");
    }
  }, [providerToken, router]);

  return (
    <div className="flex min-h-dvh flex-col bg-background p-6">
      <button
        onClick={() => router.back()}
        className="flex items-center gap-2 text-sm text-white/50 hover:text-white transition-colors self-start mb-6"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          className="h-4 w-4"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Volver
      </button>

      <div className="flex flex-1 flex-col items-center justify-center text-center gap-4">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-spotify/10 text-spotify border border-spotify/30">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            className="h-8 w-8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 4h18M3 8h12M3 12h18M3 16h12M3 20h18"
            />
          </svg>
        </div>

        <h1 className="text-2xl font-bold text-white">Ordenar Playlist</h1>
        <p className="text-sm text-white/50 max-w-xs">
          Algoritmo de reordenamiento inteligente para playlist ID:{" "}
          <span className="font-mono text-xs text-spotify">{playlistId}</span>
        </p>

        <span className="rounded-full bg-white/5 px-3 py-1 text-xs text-white/40 border border-white/10">
          Fase 3.2 — En construcción
        </span>
      </div>
    </div>
  );
}
