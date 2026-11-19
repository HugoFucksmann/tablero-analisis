import React, { useCallback, useRef, useState } from 'react';
import './ConfirmDialog.css';

/**
 * Reemplazo de window.confirm / window.alert (bloqueados en iframes y fuera del diseño).
 *   const { confirm, notify, dialog } = useDialog();
 *   if (await confirm('¿Borrar?')) {...}
 *   notify('Listo');
 *   return <>...{dialog}</>;
 */
export const useDialog = () => {
  const [state, setState] = useState(null);
  const resolverRef = useRef(null);

  const close = useCallback((result) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setState(null);
  }, []);

  const confirm = useCallback((message, { confirmLabel = 'Aceptar', danger = true } = {}) =>
    new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ message, confirmLabel, danger, alertOnly: false });
    }), []);

  const notify = useCallback((message) =>
    new Promise((resolve) => {
      resolverRef.current = resolve;
      setState({ message, confirmLabel: 'Entendido', danger: false, alertOnly: true });
    }), []);

  const dialog = state ? (
    <div className="cd-backdrop" onClick={() => close(false)} role="presentation">
      <div className="cd-box glass-panel" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <p className="cd-message">{state.message}</p>
        <div className="cd-actions">
          {!state.alertOnly && (
            <button className="cd-btn" onClick={() => close(false)}>Cancelar</button>
          )}
          <button
            className={`cd-btn ${state.danger ? 'danger' : 'primary'}`}
            onClick={() => close(true)}
            autoFocus
          >
            {state.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return { confirm, notify, dialog };
};
