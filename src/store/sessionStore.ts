import { create } from "zustand";
import type { Room, Player, RoomStatus } from "@/types";

/** Composite session state: the room + its current player list */
export interface SessionState {
  room: Room | null;
  players: Player[];
  isConnected: boolean;
  /** Local player entry (the current browser participant) */
  localPlayer: Player | null;

  setRoom: (room: Room | null) => void;
  setPlayers: (players: Player[]) => void;
  setConnected: (connected: boolean) => void;
  setLocalPlayer: (player: Player | null) => void;
  updateRoomStatus: (status: RoomStatus) => void;
  reset: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  room: null,
  players: [],
  isConnected: false,
  localPlayer: null,

  setRoom: (room) => set({ room }),
  setPlayers: (players) => set({ players }),
  setConnected: (isConnected) => set({ isConnected }),
  setLocalPlayer: (localPlayer) => set({ localPlayer }),

  updateRoomStatus: (status) =>
    set((state) => ({
      room: state.room ? { ...state.room, status } : null,
    })),

  reset: () =>
    set({ room: null, players: [], isConnected: false, localPlayer: null }),
}));
