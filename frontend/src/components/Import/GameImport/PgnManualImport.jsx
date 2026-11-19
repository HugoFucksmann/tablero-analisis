import React, { useMemo, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
import { splitPgnGames } from '../../../utils/pgnImport';

const MAX_FILE_BYTES = 50 * 1024 * 1024;

export const PgnManualImport = ({ customPgn, setCustomPgn, onLoad, onAnalyzeBatch }) => {
  const [dragOver, setDragOver] = useState(false);
  const [fileError, setFileError] = useState('');
  const inputRef = useRef(null);

  const games = useMemo(() => splitPgnGames(customPgn), [customPgn]);
  const isMulti = games.length > 1;

  const readFile = async (file) => {
    setFileError('');
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      setFileError('El archivo supera los 50 MB.');
      return;
    }
    try {
      setCustomPgn(await file.text());
    } catch {
      setFileError('No se pudo leer el archivo.');
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    readFile(e.dataTransfer.files?.[0]);
  };

  return (
    <div
      className={`gi-pgn-manual-wrap ${dragOver ? 'drag-over' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      <textarea
        className="gi-pgn-textarea premium-scroll"
        placeholder="Pega el texto de tu PGN aquí o arrastra un archivo .pgn…"
        value={customPgn}
        onChange={(e) => setCustomPgn(e.target.value)}
      />

      <input
        ref={inputRef}
        type="file"
        accept=".pgn,.txt,text/plain"
        style={{ display: 'none' }}
        onChange={(e) => { readFile(e.target.files?.[0]); e.target.value = ''; }}
      />
      <button className="gi-pgn-file-btn" onClick={() => inputRef.current?.click()}>
        <Upload size={13} /> Elegir archivo .pgn
      </button>

      {fileError && <p className="gi-pgn-hint error">{fileError}</p>}
      {isMulti && <p className="gi-pgn-hint">{games.length} partidas detectadas en el texto.</p>}

      <button
        className="gi-pgn-load-btn"
        onClick={() => onLoad(games.length > 0 ? games[0] : customPgn)}
        disabled={!customPgn.trim()}
      >
        {isMulti ? 'Cargar la primera al tablero' : 'Cargar al tablero'}
      </button>
      {isMulti && onAnalyzeBatch && (
        <button className="gi-pgn-load-btn" onClick={() => onAnalyzeBatch(games)}>
          Analizar {games.length} partidas en lote
        </button>
      )}
    </div>
  );
};
