import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Cpu, Layers, Hash, Gauge, Wand2, Download, Upload } from 'lucide-react';
import { useGameStore } from '../../store/useGameStore';
import { useShallow } from 'zustand/react/shallow';
import { backendService } from '../../services/backendService';
import { recommendEngineConfig } from '../../utils/engineConfigUtils';
import './EngineConfigModal.css';

const DEFAULT_CONFIG = {
  depth: 18,
  multiPv: 1,
  liveDepth: 16,
  liveMultiPv: 3,
  threads: 2,
  hash: 512,
};

const downloadBackup = async () => {
  const res = await fetch(`${backendService.httpUrl}/backup`);
  if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tablero-backup-${new Date().toISOString().slice(0, 10)}.sqlite`;
  a.click();
  URL.revokeObjectURL(url);
};

const uploadBackup = async (file) => {
  const res = await fetch(`${backendService.httpUrl}/restore`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: file,
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `El servidor respondió ${res.status}`);
  return body;
};

export const EngineConfigModal = ({ onClose }) => {
  const [backupMsg, setBackupMsg] = useState(null); // { kind: 'ok' | 'error' | 'busy', text }
  const restoreInputRef = React.useRef(null);

  const handleBackup = async () => {
    setBackupMsg({ kind: 'busy', text: 'Generando copia…' });
    try {
      await downloadBackup();
      setBackupMsg({ kind: 'ok', text: 'Copia descargada.' });
    } catch (e) {
      setBackupMsg({ kind: 'error', text: `No se pudo crear la copia: ${e.message}` });
    }
  };

  const handleRestore = async (file) => {
    if (!file) return;
    setBackupMsg({ kind: 'busy', text: 'Restaurando…' });
    try {
      const r = await uploadBackup(file);
      // Refrescar las listas que dependen de la base
      backendService.getAnalyses(0, 50);
      backendService.getAnalysedIds();
      backendService.getPuzzleGameIds();
      setBackupMsg({ kind: 'ok', text: `Restaurado: ${r.analyses} análisis y ${r.puzzles} puzzles nuevos.` });
    } catch (e) {
      setBackupMsg({ kind: 'error', text: `No se pudo restaurar: ${e.message}` });
    }
  };

  const { engineConfig, setEngineConfig } = useGameStore(useShallow(state => ({
    engineConfig: state.engineConfig,
    setEngineConfig: state.setEngineConfig,
  })));

  const config = { ...DEFAULT_CONFIG, ...engineConfig };
  const [isConnected, setIsConnected] = useState(backendService.isConnected);

  useEffect(() => {
    return backendService.addHandler((msg) => {
      if (msg.type === 'connection_status') setIsConnected(msg.connected);
    });
  }, []);

  const handleChange = (key, value) => {
    setEngineConfig({ ...config, [key]: value });
  };

  const handleReset = () => {
    // Reiniciar la conexión para que el servidor descarte los motores con la configuración anterior.
    backendService.disconnect();
    backendService.connect();
    setEngineConfig(DEFAULT_CONFIG);
    setAutoInfo(null);
  };

  const [autoInfo, setAutoInfo] = useState(null);
  const [autoBusy, setAutoBusy] = useState(false);

  // Ajusta hilos y memoria a los recursos reales de la máquina donde corre el backend.
  const handleAutoConfig = async () => {
    setAutoBusy(true);
    try {
      let cpuCount = navigator.hardwareConcurrency ?? 4;
      let freeMemMB = null;
      let source = 'navegador';
      try {
        const info = await backendService.request('get_server_config', {}, 'server_config');
        if (Number.isFinite(info.cpuCount)) { cpuCount = info.cpuCount; source = 'servidor'; }
        if (Number.isFinite(info.freeMemMB)) freeMemMB = info.freeMemMB;
      } catch {
        /* sin backend: se usan los núcleos que reporta el navegador */
      }
      const { threads, hash } = recommendEngineConfig({ cpuCount, freeMemMB });
      setEngineConfig({ ...config, threads, hash });
      setAutoInfo({ cpuCount, freeMemMB, threads, hash, source });
    } finally {
      setAutoBusy(false);
    }
  };

  const handleBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Un motor por hilo, hasta todos los núcleos lógicos de la máquina (el backend aplica el mismo tope).
  const maxThreads = Math.max(1, navigator.hardwareConcurrency ?? 4);

  return createPortal(
    <div
      className="ecm-backdrop"
      role="presentation"
      onClick={handleBackdrop}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="ecm-modal premium-scroll" role="dialog" aria-modal="true" aria-label="Configuración del motor">

        <div className="ecm-header">
          <div className="ecm-header-title">
            <Cpu size={15} className="ecm-header-icon" />
            <span>Motor de Análisis</span>
          </div>
          <button className="ecm-close-btn" onClick={onClose} aria-label="Cerrar">
            <X size={15} />
          </button>
        </div>

        <div className="ecm-engine-badge">
          <div className={`ecm-badge-dot ${isConnected ? 'connected' : 'connecting'}`}
            style={{ backgroundColor: isConnected ? '#10b981' : '#f59e0b' }} />
          <span className="ecm-badge-name">Stockfish 18</span>
          <span className="ecm-badge-tag">{isConnected ? 'NATIVO' : 'CONECTANDO...'}</span>
        </div>

        <div className="ecm-body">

          {!isConnected && (
            <div className="ecm-section" style={{ backgroundColor: 'rgba(245, 158, 11, 0.1)', padding: '12px', borderRadius: '8px', border: '1px solid rgba(245, 158, 11, 0.2)', marginBottom: '16px' }}>
              <h4 className="ecm-section-title" style={{ color: '#f59e0b', marginBottom: '4px' }}>Desconectado</h4>
              <p style={{ fontSize: '12px', color: '#fbbf24', margin: 0 }}>
                No se pudo conectar con el backend en <code>ws://localhost:9001</code>. 
                Asegúrate de que el servidor Node.js esté ejecutándose.
              </p>
            </div>
          )}

          <div className="ecm-section">
            <h4 className="ecm-section-title">Hardware y Recursos</h4>
            <button className="ecm-auto-btn" onClick={handleAutoConfig} disabled={autoBusy}>
              <Wand2 size={13} /> {autoBusy ? 'Detectando…' : 'Configurar según mi PC'}
            </button>
            {autoInfo && (
              <p className="ecm-auto-info">
                Detectado ({autoInfo.source}): {autoInfo.cpuCount} núcleos
                {autoInfo.freeMemMB != null && `, ${(autoInfo.freeMemMB / 1024).toFixed(1)} GB de RAM libre`}
                {' '}→ {autoInfo.threads} {autoInfo.threads === 1 ? 'hilo' : 'hilos'} y {autoInfo.hash >= 1024 ? `${(autoInfo.hash / 1024).toFixed(1)} GB` : `${autoInfo.hash} MB`} de hash.
              </p>
            )}
            <div>
              <ConfigRow
                icon={<Cpu size={14} />}
                label="Hilos CPU"
                description={`Núcleos disponibles: ${navigator.hardwareConcurrency ?? '?'}`}
                value={Math.min(config.threads, maxThreads)}
                min={1}
                max={maxThreads}
                step={1}
                onChange={(v) => handleChange('threads', v)}
                formatValue={(v) => v === 1 ? '1 hilo' : `${v} hilos`}
                colorClass="accent-green"
              />
              <ConfigRow
                icon={<Hash size={14} />}
                label="Memoria Hash"
                description="Memoria total repartida entre instancias nativas"
                value={config.hash}
                min={256}
                max={8192}
                step={256}
                onChange={(v) => handleChange('hash', v)}
                formatValue={(v) => v >= 1024 ? `${(v / 1024).toFixed(1)} GB` : `${v} MB`}
                colorClass="accent-orange"
              />
            </div>
          </div>

          <div className="ecm-section">
            <h4 className="ecm-section-title">Análisis de Partida (Completo)</h4>
            <ConfigRow
              icon={<Gauge size={14} />}
              label="Profundidad"
              description="Profundidad objetivo para cada jugada"
              value={config.depth}
              min={10}
              max={25}
              step={1}
              onChange={(v) => handleChange('depth', v)}
              formatValue={(v) => `${v} ply`}
              colorClass="accent-blue"
            />
            <ConfigRow
              icon={<Layers size={14} />}
              label="Líneas (MultiPV)"
              description="Cantidad de variantes analizadas"
              value={config.multiPv}
              min={1}
              max={5}
              step={1}
              onChange={(v) => handleChange('multiPv', v)}
              formatValue={(v) => v === 1 ? '1 línea' : `${v} líneas`}
              colorClass="accent-purple"
            />
          </div>

          <div className="ecm-section">
            <h4 className="ecm-section-title">Análisis en Vivo (Exploración)</h4>
            <ConfigRow
              icon={<Gauge size={14} />}
              label="Profundidad"
              description="Profundidad para las flechas en el tablero"
              value={config.liveDepth}
              min={10}
              max={25}
              step={1}
              onChange={(v) => handleChange('liveDepth', v)}
              formatValue={(v) => `${v} ply`}
              colorClass="accent-blue"
            />
            <ConfigRow
              icon={<Layers size={14} />}
              label="Flechas (MultiPV)"
              description="Cantidad de flechas simultáneas"
              value={config.liveMultiPv}
              min={1}
              max={5}
              step={1}
              onChange={(v) => handleChange('liveMultiPv', v)}
              formatValue={(v) => v === 1 ? '1 flecha' : `${v} flechas`}
              colorClass="accent-purple"
            />
          </div>

          <div className="ecm-section">
            <h4 className="ecm-section-title">Copia de seguridad</h4>
            <p className="ecm-auto-info">
              Guarda o restaura tus análisis y puzzles. Al restaurar se fusionan con los actuales
              (los análisis del archivo reemplazan a los repetidos).
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="ecm-auto-btn" onClick={handleBackup} disabled={!isConnected || backupMsg?.kind === 'busy'}>
                <Download size={13} /> Descargar copia
              </button>
              <button
                className="ecm-auto-btn"
                onClick={() => restoreInputRef.current?.click()}
                disabled={!isConnected || backupMsg?.kind === 'busy'}
              >
                <Upload size={13} /> Restaurar…
              </button>
              <input
                ref={restoreInputRef}
                type="file"
                accept=".sqlite,.db,application/octet-stream"
                style={{ display: 'none' }}
                onChange={(e) => { handleRestore(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
            {backupMsg && (
              <p className="ecm-auto-info" style={{ color: backupMsg.kind === 'error' ? 'var(--error-primary)' : undefined }}>
                {backupMsg.text}
              </p>
            )}
          </div>

        </div>

        <div className="ecm-footer">
          <p className="ecm-footer-note">
            Los cambios se aplican al iniciar el próximo análisis.
          </p>
          <button className="ecm-reset-btn" onClick={handleReset}>
            Restablecer
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
};

const ConfigRow = ({ icon, label, description, value, min, max, step, onChange, formatValue, colorClass }) => {
  const pct = ((value - min) / (max - min)) * 100;

  return (
    <div className="ecm-row">
      <div className="ecm-row-header">
        <span className={`ecm-row-icon ${colorClass}`}>{icon}</span>
        <div className="ecm-row-labels">
          <span className="ecm-row-label">{label}</span>
          <span className="ecm-row-desc">{description}</span>
        </div>
        <span className={`ecm-row-value ${colorClass}`}>{formatValue(value)}</span>
      </div>
      <div className="ecm-slider-wrap">
        <input
          className={`ecm-slider ${colorClass}`}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ '--pct': `${pct}%` }}
        />
        <div className="ecm-slider-ticks">
          <span>{min}</span>
          <span>{max}</span>
        </div>
      </div>
    </div>
  );
};