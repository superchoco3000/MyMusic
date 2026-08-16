import { create } from "zustand";
import type { Profile } from "@/types";

interface AuthState {
  user: Profile | null;
  /** Supabase access token (JWT) */
  accessToken: string | null;
  /** Spotify provider_token — used to call the Spotify Web API directly */
  providerToken: string | null;
  isLoading: boolean;

  setUser: (user: Profile | null) => void;
  setAccessToken: (token: string | null) => void;
  setProviderToken: (token: string | null) => void;
  setLoading: (loading: boolean) => void;
  reset: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  providerToken: null,
  isLoading: false,

  setUser: (user) => set({ user }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setProviderToken: (providerToken) => set({ providerToken }),
  setLoading: (isLoading) => set({ isLoading }),
  reset: () =>
    set({ user: null, accessToken: null, providerToken: null, isLoading: false }),
}));
