"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * /auth/callback — Client Component
 *
 * With PKCE flow, Supabase redirects here as:
 *   /auth/callback?code=<authorization_code>
 *
 * The @supabase/supabase-js browser SDK automatically detects the `code`
 * parameter in the URL, exchanges it for tokens using the code_verifier it
 * stored in sessionStorage during login(), and fires an SIGNED_IN event via
 * onAuthStateChange — which our useSpotifyAuth hook is already listening to.
 *
 * This page simply waits for that event, then redirects to the app root.
 * It never manually calls exchangeCodeForSession — the SDK handles it.
 */
export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        // Session established — navigate to the app.
        router.replace("/");
      }
    });

    // Safety net: if the SDK fires no event within 8 s (e.g. invalid code),
    // send the user to the error page so they're not stuck on a spinner.
    const timeout = setTimeout(() => {
      router.replace("/auth/error");
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-background">
      <span className="h-10 w-10 animate-spin rounded-full border-2 border-spotify border-t-transparent" />
      <p className="text-sm text-white/50">Iniciando sesión con Spotify…</p>
    </div>
  );
}
