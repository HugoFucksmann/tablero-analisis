import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createGameSlice } from './slices/gameSlice';
import { createAnalysisSlice } from './slices/analysisSlice';
import { createUISlice } from './slices/uiSlice';
import { createLibrarySlice } from './slices/librarySlice';
import { createPlaySlice } from './slices/playSlice';

// `persist` reescribe localStorage en CADA cambio del store (decenas por segundo durante la evaluación
// en vivo o los relojes). Solo se escribe cuando el contenido serializado realmente cambió.
const lastWritten = new Map();
const dedupedLocalStorage = createJSONStorage(() => ({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    if (lastWritten.get(key) === value) return;
    lastWritten.set(key, value);
    localStorage.setItem(key, value);
  },
  removeItem: (key) => {
    lastWritten.delete(key);
    localStorage.removeItem(key);
  },
}));

export const useGameStore = create(
  persist(
    (...a) => ({
      ...createGameSlice(...a),
      ...createAnalysisSlice(...a),
      ...createUISlice(...a),
      ...createLibrarySlice(...a),
      ...createPlaySlice(...a),
    }),
    {
      name: 'game-storage',
      storage: dedupedLocalStorage,
      partialize: (state) => ({
        // UI preferences
        boardOrientation: state.boardOrientation,
        engineConfig: state.engineConfig,
        // Library — search preferences only (not the game list itself)
        searchUsername: state.searchUsername,
        searchPlatform: state.searchPlatform,
        lichessToken: state.lichessToken,
        // Jugar: última configuración elegida
        playConfig: state.playConfig,
      }),
    }
  )
);
