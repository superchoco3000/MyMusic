"use client";

import { useSpotifyAuth } from "@/hooks/useSpotifyAuth";
import { useAuthStore } from "@/store/authStore";
import { Button } from "@/components/ui/Button";
import { PlaylistsGrid } from "@/components/PlaylistsGrid";
import { GlobalPushHub } from "@/components/GlobalPushHub";
import { SafeImage } from "@/components/SafeImage";
import { SyncButton } from "@/components/SyncButton";

/**
 * Home / Entry screen
 *
 * - Unauthenticated → full-screen login landing with Spotify CTA.
 * - Authenticated   → welcome message with logout option.
 *
 * useSpotifyAuth() registers the onAuthStateChange listener here at the root,
 * ensuring the Zustand store is hydrated before any child renders.
 */
export default function Home() {
  const { login, logout } = useSpotifyAuth();
  const { user, isLoading } = useAuthStore();

  // ─── Loading skeleton ─────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background">
        <span className="h-8 w-8 animate-spin rounded-full border-2 border-spotify border-t-transparent" />
      </div>
    );
  }

  // ─── Authenticated view ───────────────────────────────────────────────────
  if (user) {
    return (
      <div className="flex min-h-dvh flex-col bg-background">
        {/* ── Top bar ── */}
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-white/5 bg-background/80 px-6 py-4 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-spotify/40">
              <SafeImage
                src={user.avatar_url ?? ""}
                alt={user.display_name}
                width={36}
                height={36}
                priority
                fallbackIcon={
                  <div className="flex h-full w-full items-center justify-center bg-surface text-sm font-bold text-spotify">
                    {user.display_name?.charAt(0)?.toUpperCase() || "U"}
                  </div>
                }
                className="h-full w-full object-cover"
              />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-sm font-semibold text-white">
                {user.display_name}
              </span>
              <span className="text-[11px] text-white/40">
                {user.is_premium ? "Spotify Premium" : "Spotify Free"}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <SyncButton />
            <div className="h-4 w-px bg-white/10 hidden sm:block" />
            <Button variant="ghost" size="sm" onClick={logout}>
              Cerrar sesión
            </Button>
          </div>
        </header>


        {/* ── Main content ── */}
        <main className="flex-1 px-4 py-8 sm:px-8 max-w-7xl mx-auto w-full">
          {/* ── Main RPG Library Grid with Integrated Global Push Hub ── */}
          <PlaylistsGrid />
        </main>

      </div>
    );
  }


  // ─── Unauthenticated / login view ─────────────────────────────────────────
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden bg-background px-6">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 flex items-center justify-center"
      >
        <div className="h-[600px] w-[600px] rounded-full bg-spotify/10 blur-[120px]" />
      </div>

      <div className="relative flex flex-col items-center gap-10 text-center">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-4">
          {/* Spotify-green music note icon */}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            className="h-16 w-16 text-spotify"
            aria-hidden="true"
          >
            <path
              d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Zm4.13 12.97a.56.56 0 0 1-.77.19c-2.11-1.29-4.77-1.58-7.9-.87a.56.56 0 0 1-.25-1.09c3.43-.78 6.37-.45 8.73 1.01a.56.56 0 0 1 .19.76Zm1.1-2.45a.7.7 0 0 1-.96.23C13.81 12.2 10.6 11.8 7.7 12.6a.7.7 0 0 1-.37-1.35c3.26-.89 6.82-.46 9.65 1.3a.7.7 0 0 1 .26.97Zm.1-2.55C14.18 9.28 9.9 9.13 7.28 9.9a.84.84 0 1 1-.48-1.61C9.7 7.43 14.37 7.6 17.8 9.68a.84.84 0 0 1-.47 1.29Z"
              fill="currentColor"
            />
          </svg>

          <h1 className="text-6xl font-extrabold tracking-tight text-white sm:text-7xl">
            My<span className="text-spotify">Music</span>
          </h1>
          <p className="max-w-sm text-lg text-white/60 leading-relaxed">
            Sesiones colaborativas de playlist en tiempo real.
          </p>
        </div>

        {/* CTA */}
        <Button
          id="btn-spotify-login"
          size="lg"
          onClick={login}
          className="gap-3 px-10 py-4 text-lg shadow-lg shadow-spotify/20"
        >
          {/* Spotify wordmark icon */}
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            className="h-5 w-5 shrink-0"
            aria-hidden="true"
          >
            <path d="M12 3a9 9 0 1 0 0 18A9 9 0 0 0 12 3Zm4.13 12.97a.56.56 0 0 1-.77.19c-2.11-1.29-4.77-1.58-7.9-.87a.56.56 0 0 1-.25-1.09c3.43-.78 6.37-.45 8.73 1.01a.56.56 0 0 1 .19.76Zm1.1-2.45a.7.7 0 0 1-.96.23C13.81 12.2 10.6 11.8 7.7 12.6a.7.7 0 0 1-.37-1.35c3.26-.89 6.82-.46 9.65 1.3a.7.7 0 0 1 .26.97Zm.1-2.55C14.18 9.28 9.9 9.13 7.28 9.9a.84.84 0 1 1-.48-1.61C9.7 7.43 14.37 7.6 17.8 9.68a.84.84 0 0 1-.47 1.29Z" />
          </svg>
          Iniciar sesión con Spotify
        </Button>

        <p className="text-xs text-white/25">
          Al continuar aceptas los Términos de servicio de Spotify.
        </p>
      </div>
    </div>
  );
}
