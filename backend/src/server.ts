import 'dotenv/config';
import http from 'http';
import { readFileSync, createReadStream, createWriteStream, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { createBackup, restoreFromFile } from './storage/backup.js';
import { WebSocketServer, WebSocket } from 'ws';

// Imports refactorizados
import { AnalysisQueue } from './services/analysis/analysisQueue.js';
import { PuzzleExtractor } from './services/puzzles/puzzleExtractor.js';
import { OpeningBook } from './services/openings/openingBook.js';
import { OpeningService } from './services/openings/openingService.js';
import { GameStore } from './storage/gameStore.js';
import { handleClientMessage, ClientMessageContext } from './handlers/messageHandlers.js';
import { validateClientMessage } from './handlers/messageValidator.js';
import type { ClientMessage, ServerMessage } from '../../shared/protocol.js';

// Inicializar libros de aperturas al arranque
OpeningBook.load();

console.log(`[Server] Opening source: ${OpeningService.source} | TSV Book size: ${OpeningBook.size} entries`);

GameStore.runIntegrityCheck();

const { version: VERSION } = JSON.parse(
    readFileSync(new URL('../package.json', import.meta.url), 'utf8')
) as { version: string };

const PORT = parseInt(process.env.PORT || '9001', 10);

const MAX_RESTORE_BYTES = 1024 * 1024 * 1024; // 1 GB

const server = http.createServer((req, res) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
        res.writeHead(403, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Origin not allowed' }));
        return;
    }
    // CORS solo para orígenes permitidos (el frontend de desarrollo corre en otro puerto)
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    }
    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const path = (req.url || '/').split('?')[0];
    const json = (status: number, body: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(body));
    };

    // Descarga de una copia de seguridad (análisis + puzzles)
    if (req.method === 'GET' && path === '/backup') {
        createBackup().then((backup) => {
            const stamp = new Date().toISOString().slice(0, 10);
            res.writeHead(200, {
                'Content-Type': 'application/octet-stream',
                'Content-Disposition': `attachment; filename="tablero-backup-${stamp}.sqlite"`,
            });
            const stream = createReadStream(backup.path);
            stream.on('close', backup.cleanup);
            stream.on('error', () => { backup.cleanup(); res.destroy(); });
            stream.pipe(res);
        }).catch((err: Error) => json(500, { error: err.message }));
        return;
    }

    // Restauración: el cuerpo es el archivo .sqlite; se fusiona con la base actual
    if (req.method === 'POST' && path === '/restore') {
        const declared = Number(req.headers['content-length'] || 0);
        if (declared > MAX_RESTORE_BYTES) { json(413, { error: 'Archivo demasiado grande' }); return; }

        const dir = mkdtempSync(join(tmpdir(), 'chess-restore-'));
        const file = join(dir, 'upload.sqlite');
        const cleanup = () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* temp */ } };
        let received = 0;
        let aborted = false;
        const out = createWriteStream(file);

        req.on('data', (chunk: Buffer) => {
            received += chunk.length;
            if (received > MAX_RESTORE_BYTES && !aborted) {
                aborted = true;
                req.destroy();
                out.destroy();
                cleanup();
            }
        });
        req.pipe(out);
        out.on('finish', () => {
            if (aborted) return;
            try {
                const result = restoreFromFile(file);
                json(200, { ok: true, ...result });
            } catch (err: any) {
                json(400, { error: err.message });
            } finally {
                cleanup();
            }
        });
        out.on('error', (err) => { cleanup(); if (!res.headersSent) json(500, { error: err.message }); });
        return;
    }

    json(200, { status: 'chess-analysis-server', version: VERSION });
});

// Límite de tamaño por mensaje (un lote con muchos PGN/historiales cabe de sobra).
const MAX_PAYLOAD_BYTES = 8 * 1024 * 1024;

// Solo se aceptan conexiones desde páginas locales (o las de ALLOWED_ORIGINS, separadas por coma):
// evita que cualquier web abierta en el navegador hable con el motor local (CSWSH).
const EXTRA_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim()).filter(Boolean);
const isAllowedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return true; // clientes que no son navegadores (no envían Origin)
    if (EXTRA_ORIGINS.includes(origin)) return true;
    try {
        const { hostname } = new URL(origin);
        return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]' || hostname.endsWith('.localhost');
    } catch {
        return false;
    }
};

const wss = new WebSocketServer({
    server,
    maxPayload: MAX_PAYLOAD_BYTES,
    verifyClient: ({ origin }: { origin: string }) => {
        const ok = isAllowedOrigin(origin);
        if (!ok) console.warn(`[Server] Rejected connection from origin: ${origin}`);
        return ok;
    },
});

wss.on('connection', (ws: WebSocket) => {
    console.log('[Server] Client connected');
    const queue = new AnalysisQueue();
    const puzzleExtractor = new PuzzleExtractor();

    ws.on('message', async (raw) => {
        let msg: ClientMessage;
        try {
            msg = JSON.parse(raw.toString());
        } catch {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid JSON' }));
            return;
        }
        if (!msg || typeof msg !== 'object' || typeof msg.type !== 'string') {
            ws.send(JSON.stringify({ type: 'error', message: 'Invalid message: "type" is required' }));
            return;
        }

        const invalid = validateClientMessage(msg);
        if (invalid) {
            const rejection: Record<string, unknown> = { type: 'error', message: `Invalid message (${msg.type}): ${invalid}` };
            if (typeof msg.requestId === 'string') rejection.requestId = msg.requestId;
            ws.send(JSON.stringify(rejection));
            return;
        }

        const send = (payload: ServerMessage) => {
            if (ws.readyState === WebSocket.OPEN) {
                const response: ServerMessage = { ...payload };
                if (msg.requestId) {
                    response.requestId = msg.requestId;
                }
                ws.send(JSON.stringify(response));
            }
        };

        const context: ClientMessageContext = { ws, queue, puzzleExtractor, send };
        handleClientMessage(msg, context);
    });

    ws.on('close', () => {
        console.log('[Server] Client disconnected');
        queue.cancel();
        queue.destroy();
        puzzleExtractor.cancel();
        puzzleExtractor.destroy();
    });

    ws.on('error', (err: any) => {
        console.error('[Server] WebSocket error:', err.message);
    });
});

server.listen(PORT, '127.0.0.1', () => {
    console.log(`[Server] Chess analysis server listening on ws://127.0.0.1:${PORT}`);
});

process.on('SIGINT', () => {
    console.log('\n[Server] Shutting down...');
    server.close();
    process.exit(0);
});

process.on('SIGTERM', () => {
    server.close();
    process.exit(0);
});
