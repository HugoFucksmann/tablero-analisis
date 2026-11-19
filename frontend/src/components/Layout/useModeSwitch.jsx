import { Search, BrainCircuit, BarChart3, Compass, Bot } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { useDialog } from '../Common/ConfirmDialog';

export const MODES = [
  { id: 'analysis', label: 'Análisis', Icon: Search },
  { id: 'explorer', label: 'Explorador', Icon: Compass },
  { id: 'play', label: 'Jugar', Icon: Bot },
  { id: 'puzzle', label: 'Puzzles', Icon: BrainCircuit },
  { id: 'stats', label: 'Estadísticas', Icon: BarChart3 },
];

/**
 * Cambio de modo compartido por el selector de escritorio y el menú móvil.
 * Salir de una partida en curso la abandona, así que antes se pide confirmación.
 * Devuelve `dialog`, que el componente debe renderizar.
 */
export const useModeSwitch = () => {
  const { appMode, setAppMode, gameInProgress } = useGameStore(useShallow(state => ({
    appMode: state.appMode,
    setAppMode: state.setAppMode,
    gameInProgress: state.appMode === 'play' && state.play.phase === 'playing',
  })));
  const { confirm, dialog } = useDialog();

  const selectMode = async (mode) => {
    if (mode === appMode) return false;
    if (gameInProgress && !(await confirm('Hay una partida en curso. Si cambias de pestaña se abandonará.', { confirmLabel: 'Abandonar' }))) {
      return false;
    }
    setAppMode(mode);
    return true;
  };

  return { appMode, selectMode, dialog };
};
