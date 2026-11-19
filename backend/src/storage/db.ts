import Database from 'better-sqlite3';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ─── Connection ───────────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH
    ? resolve(process.env.DB_PATH)
    : join(__dirname, '..', '..', 'data', 'database.sqlite');
const DATA_DIR = dirname(DB_PATH);

if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
}

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('cache_size = -32000');      // ~32 MB de caché de páginas
db.pragma('mmap_size = 268435456');    // lecturas mapeadas en memoria (hasta 256 MB)

// ─── Schema (versión actual) ──────────────────────────────────────────────────
// Las bases creadas desde cero nacen con el esquema final. Las bases anteriores
// se actualizan con `MIGRATIONS` (controladas por PRAGMA user_version).

db.exec(`
    CREATE TABLE IF NOT EXISTS analyses (
        id               TEXT PRIMARY KEY,
        gameId           TEXT UNIQUE,
        username         TEXT,
        createdAt        TEXT,
        date             TEXT,
        gameDate         TEXT,
        opponent         TEXT,
        opening          TEXT,
        eco              TEXT,
        moveCount        INTEGER,
        color            TEXT,
        win              INTEGER,
        timeControl      TEXT,
        customStart      INTEGER DEFAULT 0,
        whiteAccuracy    INTEGER,
        blackAccuracy    INTEGER,
        accuracyByPhase  TEXT,
        labelCounts      TEXT,
        advancedMetrics  TEXT
    );

    CREATE TABLE IF NOT EXISTS phase_accuracy (
        game_id   TEXT NOT NULL,
        phase     TEXT,
        accuracy  INTEGER,
        FOREIGN KEY(game_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS move_quality (
        game_id  TEXT NOT NULL,
        label    TEXT,
        count    INTEGER,
        FOREIGN KEY(game_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS game_moves (
        game_id          TEXT NOT NULL,
        ply              INTEGER NOT NULL,
        move_san         TEXT,
        evaluation       REAL,
        label            TEXT,
        move_time        INTEGER,
        remaining_time   INTEGER,
        fen              TEXT,
        start_fen        TEXT,
        error_time_class TEXT,
        PRIMARY KEY (game_id, ply),
        FOREIGN KEY(game_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS analysis_full_data (
        analysis_id TEXT PRIMARY KEY,
        full_json   TEXT,
        FOREIGN KEY(analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
    );

    -- puzzles.gameId es el id de la plataforma y NO lleva FK a analyses a propósito: los puzzles
    -- se pueden extraer de partidas sin analizar (Database Bypass) y deben sobrevivir al borrado
    -- de su análisis. Los datos de la partida se unen con LEFT JOIN por gameId (ver puzzleRepo).
    CREATE TABLE IF NOT EXISTS puzzles (
        id                   TEXT PRIMARY KEY,
        createdAt            TEXT,
        solvedCount          INTEGER DEFAULT 0,
        fen                  TEXT,
        solutionSequence     TEXT,
        baseFen              TEXT,
        contextMoves         TEXT,
        originalContinuation TEXT,
        preBlunderFen        TEXT,
        playedMove           TEXT,
        label                TEXT,
        puzzleType           TEXT,
        mateIn               INTEGER,
        wpLoss               REAL,
        preBlunderWp         REAL,
        playerColor          TEXT,
        gameId               TEXT,
        ply                  INTEGER,
        blunderSeverity      REAL,
        tensionIndex         REAL,
        attackedSquares      INTEGER,
        isOnlyMove           INTEGER,   -- 0/1 (SQLite no tiene BOOLEAN)
        criticalityGap       REAL,
        tacticalMotifs       TEXT,      -- array JSON
        attempts             INTEGER DEFAULT 0,   -- SRS: veces entrenado
        failures             INTEGER DEFAULT 0,   -- SRS: veces fallado
        streak               INTEGER DEFAULT 0,   -- SRS: aciertos seguidos
        nextReviewAt         TEXT                 -- SRS: próximo repaso (ISO)
    );
`);

// ─── Migraciones (solo para bases creadas con versiones anteriores) ───────────

function columnNames(table: string): Set<string> {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
    return new Set(rows.map(r => r.name));
}

function ensureColumns(table: string, columns: Record<string, string>): void {
    const existing = columnNames(table);
    for (const [name, definition] of Object.entries(columns)) {
        if (!existing.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
}

function dropColumnsIfPresent(table: string, columns: string[]): void {
    const existing = columnNames(table);
    for (const name of columns) {
        if (existing.has(name)) db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`);
    }
}

const MIGRATIONS: Array<() => void> = [
    // v1 — consolida las migraciones históricas (ALTER TABLE ... ADD COLUMN) y limpia lo obsoleto.
    () => {
        ensureColumns('analyses', {
            username: 'TEXT', eco: 'TEXT', advancedMetrics: 'TEXT', opponent: 'TEXT', gameDate: 'TEXT',
        });
        ensureColumns('game_moves', { error_time_class: 'TEXT' });
        ensureColumns('puzzles', {
            baseFen: 'TEXT', contextMoves: 'TEXT', originalContinuation: 'TEXT', preBlunderFen: 'TEXT',
            playedMove: 'TEXT', label: 'TEXT', puzzleType: 'TEXT', mateIn: 'INTEGER', wpLoss: 'REAL',
            preBlunderWp: 'REAL', playerColor: 'TEXT', gameId: 'TEXT', ply: 'INTEGER',
            blunderSeverity: 'REAL', tensionIndex: 'REAL', attackedSquares: 'INTEGER',
            isOnlyMove: 'INTEGER', criticalityGap: 'REAL', tacticalMotifs: 'TEXT',
        });
        // Columnas heredadas del esquema original de puzzles: ya nadie las lee ni escribe.
        dropColumnsIfPresent('puzzles', ['initialMove', 'theme', 'difficulty']);
        // Redundante: (game_id, ply) ya es PRIMARY KEY y cubre búsquedas por game_id.
        db.exec('DROP INDEX IF EXISTS idx_moves_game');
    },
    // v2 — analysis_full_data referenciaba analyses(gameId) mientras el resto de tablas hijas usan
    // analyses(id). Se unifica en analysis_id → analyses(id) conservando los datos existentes.
    () => {
        if (!columnNames('analysis_full_data').has('game_id')) return; // ya creada con el esquema final
        db.exec(`
            CREATE TABLE analysis_full_data_new (
                analysis_id TEXT PRIMARY KEY,
                full_json   TEXT,
                FOREIGN KEY(analysis_id) REFERENCES analyses(id) ON DELETE CASCADE
            );
            INSERT OR IGNORE INTO analysis_full_data_new (analysis_id, full_json)
                SELECT a.id, f.full_json
                FROM analysis_full_data f JOIN analyses a ON a.gameId = f.game_id;
            DROP TABLE analysis_full_data;
            ALTER TABLE analysis_full_data_new RENAME TO analysis_full_data;
        `);
    },
    // v3 — marca las partidas con posición inicial personalizada (Chess960 / temáticas).
    () => {
        ensureColumns('analyses', { customStart: 'INTEGER DEFAULT 0' });
    },
    // v4 — repetición espaciada (SRS) en puzzles.
    () => {
        ensureColumns('puzzles', {
            attempts: 'INTEGER DEFAULT 0', failures: 'INTEGER DEFAULT 0',
            streak: 'INTEGER DEFAULT 0', nextReviewAt: 'TEXT',
        });
    },
];

const currentVersion = db.pragma('user_version', { simple: true }) as number;
if (currentVersion < MIGRATIONS.length) {
    db.transaction(() => {
        for (let v = currentVersion; v < MIGRATIONS.length; v++) MIGRATIONS[v]();
    })();
    db.pragma(`user_version = ${MIGRATIONS.length}`);
}

// ─── Índices (después de migrar, cuando todas las columnas existen) ───────────

db.exec(`
    CREATE INDEX IF NOT EXISTS idx_analyses_username  ON analyses(username);
    CREATE INDEX IF NOT EXISTS idx_analyses_eff_date  ON analyses(COALESCE(gameDate, date));
    CREATE INDEX IF NOT EXISTS idx_phase_game         ON phase_accuracy(game_id);
    CREATE INDEX IF NOT EXISTS idx_quality_game       ON move_quality(game_id);
    CREATE INDEX IF NOT EXISTS idx_moves_label        ON game_moves(label);
    CREATE INDEX IF NOT EXISTS idx_moves_start_fen    ON game_moves(start_fen);
    CREATE INDEX IF NOT EXISTS idx_puzzles_fen        ON puzzles(fen);
    CREATE INDEX IF NOT EXISTS idx_puzzles_gameId     ON puzzles(gameId);
    CREATE INDEX IF NOT EXISTS idx_puzzles_type       ON puzzles(puzzleType);
    CREATE INDEX IF NOT EXISTS idx_puzzles_review     ON puzzles(nextReviewAt);
    DROP INDEX IF EXISTS idx_date;
    DROP INDEX IF EXISTS idx_timeControl;
    DROP INDEX IF EXISTS idx_username;
    DROP INDEX IF EXISTS idx_gameDate;
    DROP INDEX IF EXISTS idx_moves_fen;
`);

// Mantenimiento: deja que SQLite refresque estadísticas de planificación al abrir.
db.pragma('optimize');

export default db;
export type DatabaseInstance = typeof db;
