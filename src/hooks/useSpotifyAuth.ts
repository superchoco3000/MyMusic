"use client";

import { useEffect } from "react";
import { supabase } from "@/lib/supabase/client";
import { useAuthStore } from "@/store/authStore";
import type { Profile } from "@/types";

const SPOTIFY_SCOPES = [
  "user-read-email",
  "user-read-private",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
  "playlist-modify-public",
  "playlist-modify-private",
].join(" ");

/**
 * useSpotifyAuth
 *
 * Encapsulates the Spotify OAuth flow via Supabase Auth.
 *  - login()  → redirects the user to Spotify's authorization page.
 *  - logout() → destroys the Supabase session and resets the auth store.
 *  - A useEffect listener keeps the Zustand authStore in sync with the
 *    Supabase session state across tab changes, token refreshes, etc.
 */
export function useSpotifyAuth() {
  const { setUser, setAccessToken, setProviderToken, setLoading, reset } = useAuthStore();

  // ─── Session state listener ───────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);

    const getStoredProviderToken = () => {
      if (typeof window === "undefined") return null;
      try {
        return localStorage.getItem("spotify_provider_token");
      } catch {
        return null;
      }
    };

    const storeProviderToken = (token: string | null | undefined) => {
      if (typeof window === "undefined" || !token) return;
      try {
        localStorage.setItem("spotify_provider_token", token);
      } catch {
        // ignore
      }
    };

    // Hydrate from the current session on first mount.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        if (session.provider_token) {
          storeProviderToken(session.provider_token);
        }
        const effectiveProviderToken = session.provider_token ?? getStoredProviderToken();
        setAccessToken(session.access_token);
        setProviderToken(effectiveProviderToken);
        syncProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Subscribe to future auth state changes (login, logout, token refresh).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session) {
        if (session.provider_token) {
          storeProviderToken(session.provider_token);
        }
        const effectiveProviderToken = session.provider_token ?? getStoredProviderToken();
        setAccessToken(session.access_token);
        setProviderToken(effectiveProviderToken);
        await syncProfile(session.user.id);
      } else {
        if (typeof window !== "undefined") {
          try { localStorage.removeItem("spotify_provider_token"); } catch (_) {}
        }
        reset();
      }
    });

    return () => {
      subscription.unsubscribe();
    };

  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Helpers ──────────────────────────────────────────────────────────────

  /**
   * Fetches (or creates via upsert) the user's profile row and pushes it to
   * the auth store.  Called after every successful auth state change.
   */
  async function syncProfile(userId: string) {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (error) {
        // Profile may not exist yet on first login — the trigger handles it,
        // but if it races, we just set user to null and let the next event win.
        console.warn("[useSpotifyAuth] syncProfile:", error.message);
        setUser(null);
      } else {
        setUser(data as Profile);
      }
    } finally {
      setLoading(false);
    }
  }

  // ─── Public API ──────────────────────────────────────────────────────────

  /**
   * Kicks off the Spotify OAuth PKCE flow via Supabase Auth.
   * The user is redirected to Spotify, then back to /auth/callback.
   */
  async function login() {
    const baseOrigin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL ||
          (process.env.NEXT_PUBLIC_VERCEL_URL
            ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
            : "http://localhost:3000");

    const redirectTo = `${baseOrigin}/auth/callback`;

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "spotify",
      options: {
        scopes: SPOTIFY_SCOPES,
        redirectTo,
      },
    });

    if (error) {
      console.error("[useSpotifyAuth] login error:", error.message);
    }
  }

  /**
   * Destroys the current Supabase session and resets local auth state.
   */
  async function logout() {
    if (typeof window !== "undefined") {
      try { localStorage.removeItem("spotify_provider_token"); } catch (_) {}
    }
    const { error } = await supabase.auth.signOut();
    if (error) {
      console.error("[useSpotifyAuth] logout error:", error.message);
    }
    reset();
  }


  return { login, logout };
}
