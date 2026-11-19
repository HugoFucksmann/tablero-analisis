import React from 'react';
import { MODES, useModeSwitch } from './useModeSwitch';
import './ModeSelector.css';

export const ModeSelector = () => {
  const { appMode, selectMode, dialog } = useModeSwitch();

  return (
    <div className="mode-selector-container glass-panel">
      <div className="mode-selector-track">
        {MODES.map(({ id, label, Icon }) => (
          <button
            key={id}
            className={`mode-btn ${appMode === id ? 'active' : ''}`}
            title={label}
            aria-label={label}
            onClick={() => selectMode(id)}
          >
            {React.createElement(Icon, { size: 16 })}
            <span>{label}</span>
          </button>
        ))}
      </div>
      {dialog}
    </div>
  );
};
