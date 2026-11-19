import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import db from './db.js';

/**
 * Copia de seguridad / restauración de análisis y puzzles.
 *  - backup: instantánea consistente de la base (API de backup de SQLite, segura con WAL).
 *  - restore: FUSIONA el contenido de un archivo de respaldo en la base actual (no la reemplaza):
 *    las partidas del respaldo sobrescriben las locales con el mismo id y los puzzles ya existentes
 *    se conservan (con su progreso de repaso).
 */

export interface BackupHandle {
    path: string;
    cleanup: () => void;
}

export async function createBackup(): Promise<BackupHandle> {
    const dir = mkdtempSync(join(tmpdir(), 'chess-backup-'));
    const path = join(dir, 'backup.sqlite');
    await db.backup(path);
    return { path, cleanup: () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } } };
}

export interface RestoreResult {
    analyses: number;
    puzzles: number;
}

const REQUIRED_TABLES = ['analyses', 'game_moves', 'puzzles'];

/** Columnas comunes entre la tabla del respaldo (alias `b`) y la tabla actual. */
function commonColumns(table: string): string[] {
    const mine = (db.prepare(`PRAGMA main.table_info(${table})`).all() as { name: string }[]).map(c => c.name);
    const theirs = new Set((db.prepare(`PRAGMA b.table_info(${table})`).all() as { name: string }[]).map(c => c.name));
    return mine.filter(c => theirs.has(c));
}

export function restoreFromFile(filePath: string): RestoreResult {
    // 1. Validar que sea una base SQLite íntegra con las tablas esperadas
    const probe = new Database(filePath, { readonly: true, fileMustExist: true });
    try {
        const tables = new Set(
            (probe.prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`).all() as { name: string }[]).map(t => t.name)
        );
        const missing = REQUIRED_TABLES.filter(t => !tables.has(t));
        if (missing.length > 0) throw new Error(`El archivo no es un respaldo válido (faltan tablas: ${missing.join(', ')})`);
        const check = probe.pragma('integrity_check', { simple: true });
        if (check !== 'ok') throw new Error('El archivo de respaldo está dañado');
    } finally {
        probe.close();
    }

    // 2. Fusionar (ATTACH no puede ir dentro de una transacción)
    db.prepare('ATTACH DATABASE ? AS b').run(filePath);
    try {
        const copyTable = (table: string, mode: 'REPLACE' | 'IGNORE') => {
            const cols = commonColumns(table);
            if (cols.length === 0) return 0;
            const list = cols.join(', ');
            return db.prepare(`INSERT OR ${mode} INTO main.${table} (${list}) SELECT ${list} FROM b.${table}`).run().changes;
        };

        let analyses = 0;
        let puzzles = 0;

        db.transaction(() => {
            // REPLACE en analyses dispara el CASCADE sobre las tablas hijas: se reinsertan desde el respaldo
            analyses = copyTable('analyses', 'REPLACE');
            copyTable('phase_accuracy', 'REPLACE');
            copyTable('move_quality', 'REPLACE');
            copyTable('game_moves', 'REPLACE');

            // analysis_full_data: esquema actual (analysis_id) o antiguo (game_id → analyses.gameId)
            const theirFull = (db.prepare(`PRAGMA b.table_info(analysis_full_data)`).all() as { name: string }[]).map(c => c.name);
            if (theirFull.includes('analysis_id')) {
                db.prepare(`INSERT OR REPLACE INTO main.analysis_full_data (analysis_id, full_json)
                            SELECT analysis_id, full_json FROM b.analysis_full_data`).run();
            } else if (theirFull.includes('game_id')) {
                db.prepare(`INSERT OR REPLACE INTO main.analysis_full_data (analysis_id, full_json)
                            SELECT a.id, f.full_json FROM b.analysis_full_data f
                            JOIN b.analyses a ON a.gameId = f.game_id`).run();
            }

            puzzles = copyTable('puzzles', 'IGNORE');
        })();

        return { analyses, puzzles };
    } finally {
        try { db.exec('DETACH DATABASE b'); } catch { /* ya desconectada */ }
    }
}
