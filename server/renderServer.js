import http from 'node:http';
import crypto from 'node:crypto';

const PORT = Number(process.env.PORT || 8787);
const MAX_PAYLOAD_BYTES = 64 * 1024;
const rooms = new Map();
const clients = new Map();

function sendFrame(socket, data) {
    if (socket.destroyed) return;
    const payload = Buffer.from(JSON.stringify(data));
    let header;
    if (payload.length < 126) {
        header = Buffer.from([0x81, payload.length]);
    } else if (payload.length < 65536) {
        header = Buffer.alloc(4);
        header[0] = 0x81;
        header[1] = 126;
        header.writeUInt16BE(payload.length, 2);
    } else {
        header = Buffer.alloc(10);
        header[0] = 0x81;
        header[1] = 127;
        header.writeBigUInt64BE(BigInt(payload.length), 2);
    }
    socket.write(Buffer.concat([header, payload]));
}

function sendError(socket, message) {
    sendFrame(socket, { kind: 'error', message });
}

function getRoom(roomId) {
    if (!rooms.has(roomId)) {
        rooms.set(roomId, { id: roomId, hostId: null, clients: new Map() });
    }
    return rooms.get(roomId);
}

function roomPlayers(room) {
    return [...room.clients.values()].map(client => ({
        ...(client.player || {}),
        id: client.id,
        isHost: client.id === room.hostId
    }));
}

function sendToClient(client, data) {
    sendFrame(client.socket, data);
}

function broadcast(room, data, exceptId = null) {
    room.clients.forEach(client => {
        if (client.id !== exceptId) sendToClient(client, data);
    });
}

function broadcastPlayerList(room) {
    broadcast(room, { kind: 'player-list', players: roomPlayers(room) });
}

function leaveRoom(client) {
    if (!client.roomId) return;
    const room = rooms.get(client.roomId);
    if (!room) return;
    room.clients.delete(client.id);
    clients.delete(client.id);
    if (room.hostId === client.id) {
        broadcast(room, {
            kind: 'message',
            from: client.id,
            payload: { type: 'kicked', reason: 'Host left the room.' }
        });
        room.clients.forEach(peer => {
            peer.roomId = null;
            peer.socket.end();
        });
        rooms.delete(room.id);
        return;
    }
    broadcast(room, {
        kind: 'message',
        from: client.id,
        payload: { type: 'peer-left', id: client.id, from: client.id }
    });
    broadcastPlayerList(room);
    if (room.clients.size === 0) rooms.delete(room.id);
}

function joinRoom(socket, message, asHost) {
    const id = String(message.id || '').slice(0, 80);
    const roomId = String(message.roomId || id || '').slice(0, 80);
    if (!id || !roomId) {
        sendError(socket, 'Missing player or room id.');
        return;
    }

    const oldClient = clients.get(id);
    if (oldClient && oldClient.socket !== socket) {
        oldClient.socket.end();
        leaveRoom(oldClient);
    }

    const room = getRoom(roomId);
    if (asHost) {
        if (room.hostId && room.hostId !== id) {
            sendError(socket, 'Room already has a host.');
            return;
        }
        room.hostId = id;
    } else if (!room.hostId) {
        sendError(socket, 'Host room is not online.');
        return;
    }

    const client = {
        id,
        roomId,
        socket,
        player: { ...(message.player || {}), id, isHost: asHost || id === room.hostId }
    };
    clients.set(id, client);
    room.clients.set(id, client);
    socket.clientId = id;

    sendToClient(client, {
        kind: 'welcome',
        id,
        roomId,
        isHost: id === room.hostId,
        hostId: room.hostId,
        players: roomPlayers(room)
    });

    if (!asHost) {
        const host = room.clients.get(room.hostId);
        if (host) {
            sendToClient(host, {
                kind: 'message',
                from: id,
                payload: {
                    type: 'join',
                    from: id,
                    player: client.player
                }
            });
        }
    }
    broadcastPlayerList(room);
}

function handleClientMessage(socket, message) {
    if (!message || typeof message !== 'object') return;
    if (message.kind === 'host') {
        joinRoom(socket, message, true);
        return;
    }
    if (message.kind === 'join') {
        joinRoom(socket, message, false);
        return;
    }

    const client = clients.get(socket.clientId);
    if (!client) {
        sendError(socket, 'Socket is not in a room.');
        return;
    }
    const room = rooms.get(client.roomId);
    if (!room) return;

    if (message.kind === 'update-player') {
        client.player = { ...(message.player || {}), id: client.id, isHost: client.id === room.hostId };
        broadcastPlayerList(room);
        return;
    }

    if (message.kind === 'message') {
        const payload = { ...(message.payload || {}), from: client.id };
        const packet = { kind: 'message', from: client.id, payload };
        if (message.target) {
            const target = room.clients.get(message.target);
            if (target) sendToClient(target, packet);
        } else {
            broadcast(room, packet, client.id);
        }
    }
}

function parseFrames(socket, chunk) {
    socket.buffer = socket.buffer ? Buffer.concat([socket.buffer, chunk]) : chunk;

    while (socket.buffer.length >= 2) {
        const first = socket.buffer[0];
        const second = socket.buffer[1];
        const opcode = first & 0x0f;
        const masked = (second & 0x80) === 0x80;
        let length = second & 0x7f;
        let offset = 2;

        if (length === 126) {
            if (socket.buffer.length < offset + 2) return;
            length = socket.buffer.readUInt16BE(offset);
            offset += 2;
        } else if (length === 127) {
            if (socket.buffer.length < offset + 8) return;
            const bigLength = socket.buffer.readBigUInt64BE(offset);
            if (bigLength > BigInt(MAX_PAYLOAD_BYTES)) {
                socket.end();
                return;
            }
            length = Number(bigLength);
            offset += 8;
        }

        const maskLength = masked ? 4 : 0;
        if (length > MAX_PAYLOAD_BYTES || socket.buffer.length < offset + maskLength + length) return;

        const mask = masked ? socket.buffer.subarray(offset, offset + 4) : null;
        offset += maskLength;
        const payload = Buffer.from(socket.buffer.subarray(offset, offset + length));
        socket.buffer = socket.buffer.subarray(offset + length);

        if (opcode === 0x8) {
            socket.end();
            return;
        }
        if (opcode === 0x9) {
            socket.write(Buffer.from([0x8a, 0x00]));
            continue;
        }
        if (opcode !== 0x1) continue;

        if (mask) {
            for (let i = 0; i < payload.length; i += 1) payload[i] ^= mask[i % 4];
        }

        try {
            handleClientMessage(socket, JSON.parse(payload.toString('utf8')));
        } catch {
            sendError(socket, 'Invalid JSON message.');
        }
    }
}

const server = http.createServer((req, res) => {
    if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ ok: true, rooms: rooms.size, clients: clients.size }));
        return;
    }
    res.writeHead(200, { 'content-type': 'text/plain' });
    res.end('Agen multiplayer relay is running.');
});

server.on('upgrade', (req, socket) => {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
        socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
        return;
    }
    const accept = crypto
        .createHash('sha1')
        .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
        .digest('base64');

    socket.write([
        'HTTP/1.1 101 Switching Protocols',
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Accept: ${accept}`,
        '\r\n'
    ].join('\r\n'));

    socket.on('data', chunk => parseFrames(socket, chunk));
    socket.on('close', () => {
        const client = clients.get(socket.clientId);
        if (client) leaveRoom(client);
    });
    socket.on('error', () => {
        const client = clients.get(socket.clientId);
        if (client) leaveRoom(client);
    });
});

server.listen(PORT, () => {
    console.log(`Agen multiplayer relay listening on ${PORT}`);
});
