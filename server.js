import { createServer } from 'node:http';
import { existsSync, createReadStream } from 'node:fs';
import { extname, isAbsolute, join, normalize, relative, resolve } from 'node:path';
import { WebSocketServer } from 'ws';

const PORT = Number(process.env.PORT || 5174);
const ROOT = resolve(process.cwd());
const DIST = join(ROOT, 'dist');
const STATIC_ROOT = existsSync(join(DIST, 'index.html')) ? DIST : ROOT;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm'
};

const rooms = new Map();

function send(ws, payload) {
    if (ws?.readyState === ws.OPEN) ws.send(JSON.stringify(payload));
}

function getRoom(roomId) {
    return roomId ? rooms.get(roomId) : null;
}

function removeClient(ws) {
    const state = ws.agenState;
    if (!state?.roomId) return;

    const room = getRoom(state.roomId);
    if (!room) return;

    if (state.isHost) {
        room.clients.forEach(client => send(client, { type: 'relay-error', message: 'Host left the room.' }));
        rooms.delete(state.roomId);
        return;
    }

    room.clients.delete(state.id);
    send(room.host, { type: 'relay-peer-left', peerId: state.id });
}

function serveFile(req, res) {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const requested = url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname);
    const safePath = normalize(requested).replace(/^[/\\]+/, '').replace(/^(\.\.[/\\])+/, '');
    const resolved = resolve(STATIC_ROOT, safePath);
    const staticRelative = relative(STATIC_ROOT, resolved);

    if (staticRelative.startsWith('..') || isAbsolute(staticRelative) || !existsSync(resolved)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
    }

    res.writeHead(200, { 'content-type': MIME_TYPES[extname(resolved)] || 'application/octet-stream' });
    createReadStream(resolved).pipe(res);
}

const server = createServer(serveFile);
const wss = new WebSocketServer({ server, path: '/relay' });

wss.on('connection', (ws) => {
    ws.agenState = { id: null, roomId: null, isHost: false };

    ws.on('message', (raw) => {
        let message;
        try {
            message = JSON.parse(raw);
        } catch {
            send(ws, { type: 'relay-error', message: 'Bad relay message.' });
            return;
        }

        if (message.type === 'create-room') {
            const roomId = String(message.roomId || '').slice(0, 48);
            const id = String(message.clientId || '').slice(0, 48);
            if (!roomId || !id) {
                send(ws, { type: 'relay-error', message: 'Could not create room.' });
                return;
            }
            removeClient(ws);
            rooms.set(roomId, { host: ws, hostId: id, clients: new Map() });
            ws.agenState = { id, roomId, isHost: true };
            send(ws, { type: 'relay-open', id, roomId, isHost: true, hostId: id });
            return;
        }

        if (message.type === 'join-room') {
            const roomId = String(message.roomId || '').slice(0, 48);
            const id = String(message.clientId || '').slice(0, 48);
            const room = getRoom(roomId);
            if (!room || room.host.readyState !== room.host.OPEN) {
                send(ws, { type: 'relay-error', message: 'Room not found. Ask the host for a fresh link.' });
                return;
            }
            removeClient(ws);
            room.clients.set(id, ws);
            ws.agenState = { id, roomId, isHost: false };
            send(ws, { type: 'relay-open', id, roomId, isHost: false, hostId: room.hostId });
            send(room.host, { type: 'relay-peer-open', peerId: id, player: message.player || {} });
            return;
        }

        if (message.type === 'relay-data') {
            const state = ws.agenState;
            const room = getRoom(state?.roomId);
            if (!room) return;

            const payload = message.payload || {};
            if (state.isHost) {
                if (message.target) {
                    send(room.clients.get(message.target), { type: 'relay-data', from: state.id, payload });
                    return;
                }
                room.clients.forEach(client => send(client, { type: 'relay-data', from: state.id, payload }));
                return;
            }

            send(room.host, { type: 'relay-data', from: state.id, payload });
            return;
        }

        if (message.type === 'kick-peer') {
            const state = ws.agenState;
            const room = getRoom(state?.roomId);
            if (!state?.isHost || !room) return;
            const target = room.clients.get(message.target);
            send(target, { type: 'relay-kicked', message: message.message || 'Removed from room by host.' });
            room.clients.delete(message.target);
            send(room.host, { type: 'relay-peer-left', peerId: message.target });
            return;
        }

        if (message.type === 'leave-room') {
            removeClient(ws);
            ws.agenState = { id: null, roomId: null, isHost: false };
        }
    });

    ws.on('close', () => removeClient(ws));
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`Agen relay server running on http://localhost:${PORT}`);
});
