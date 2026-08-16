import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Lazy singleton — the client is created on first call, not at module import
 * time. This prevents "supabaseUrl is required" errors during Next.js
 * build-time static prerender, where env vars may not yet be injected.
 */
let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: {
          // PKCE flow: Supabase redirects to /auth/callback?code=...
          // instead of /auth/callback#access_token=... (Implicit Flow).
          // The Route Handler then exchanges the code for a session server-side.
          flowType: "pkce",
        },
      }
    );
  }
  return _client;
}

/**
 * Named export kept for convenience in client components that call it at
 * render / effect time (never at module scope).
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return getSupabaseClient()[prop as keyof SupabaseClient];
  },
});
