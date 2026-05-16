import { Group, MeshStandardMaterial, Mesh, BoxGeometry, Vector3, MathUtils, ConeGeometry, CylinderGeometry, TorusGeometry, Shape, ExtrudeGeometry } from 'three';
import { debugLogger } from './debugLogger.js';
import { getWebSocketUrl } from './networkConfig.js';

const RELAY_TYPES = new Set(['move', 'shoot', 'hit', 'death', 'health', 'protection', 'stats', 'end-match']);

function createPeerId() {
    const random = globalThis.crypto?.randomUUID?.() ||
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    return `agen-${random}`;
}

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.connections = {};
        this.remotePlayers = {};
        this.remotePlayerData = {};
        this.isHost = false;
        this.hostId = null;
        this.lastMoveSentAt = 0;
        this.moveIntervalMs = 55;
        this.lastSentMove = null;
        this.labelProjector = new Vector3();
        this.debugPacketCounters = {};
        this.lastDebugPacketFlushAt = 0;
        this.myId = createPeerId();
        this.serverUrl = getWebSocketUrl();
        this.socket = null;
        this.forceRelayOnly = false;
        debugLogger.info('Network', 'NetworkManager created', {
            href: location.href,
            secureContext: window.isSecureContext,
            online: navigator.onLine,
            serverUrl: this.serverUrl
        });
        this.initSocket();
    }

    initSocket() {
        this.updateStatus(`Connecting game server...`);
        debugLogger.info('WebSocket', 'Connecting to game server', {
            serverUrl: this.serverUrl,
            myId: this.myId
        });
        this.socket = new WebSocket(this.serverUrl);
        this.socket.onopen = () => {
            this.updateStatus(`Server connected: ${this.myId.slice(0, 6)}`);
            debugLogger.info('WebSocket', 'Socket open', this.getDebugSnapshot());
            this.handleUrlParam();
        };
        this.socket.onmessage = event => this.handleServerMessage(event);
        this.socket.onclose = event => {
            debugLogger.warn('WebSocket', 'Socket closed', { code: event.code, reason: event.reason, snapshot: this.getDebugSnapshot() });
            this.updateStatus('Game server disconnected. Refresh or try again.');
        };
        this.socket.onerror = event => {
            debugLogger.error('WebSocket', 'Socket error', event);
            this.updateStatus('Game server connection error. Check Render service URL.');
        };
    }

    handleUrlParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');
        debugLogger.info('Network', 'Handling URL params', { joinId, myId: this.myId });
        if (joinId) {
            if (joinId === this.myId) {
                this.updateStatus('That invite belongs to this tab. Open a fresh host lobby and share the new link.');
                this.game.receiveLobbyChat({ system: true, text: 'Invite points to this same browser tab. Create a fresh room and share its link.' });
                this.game.renderLobbyRoom();
                return;
            }
            this.hostId = joinId;
            this.isHost = false;
            this.sendServer({
                kind: 'join',
                id: this.myId,
                roomId: joinId,
                player: this.game.getLocalPlayerInfo()
            });
            this.updateStatus(`Joining room ${joinId.slice(0, 6)}...`);
        } else {
            this.isHost = true;
            this.hostId = this.myId;
            this.game.team = 'NONE';
            window.history.replaceState({}, document.title, window.location.pathname);
            this.sendServer({
                kind: 'host',
                id: this.myId,
                roomId: this.hostId,
                player: this.game.getLocalPlayerInfo()
            });
            this.updateJoinLink();
            this.updateStatus('Hosting lobby. Share the join link with friends.');
            this.game.receiveLobbyChat({ system: true, text: 'Room created. Share the link when you are ready.' });
            this.game.renderLobbyRoom();
            this.game.updateHUDStats();
        }
    }

    updateStatus(message) {
        const el = document.getElementById('network-status');
        if (el) el.innerText = message;
        debugLogger.info('NetworkStatus', message, this.getDebugSnapshot());
    }

    sendServer(message) {
        if (this.socket?.readyState !== WebSocket.OPEN) {
            debugLogger.warn('WebSocket', 'Cannot send before socket open', { message, snapshot: this.getDebugSnapshot() });
            return false;
        }
        this.socket.send(JSON.stringify(message));
        return true;
    }

    sendServerMessage(payload, target = null) {
        return this.sendServer({
            kind: 'message',
            roomId: this.hostId,
            target,
            payload: { ...payload, from: this.myId }
        });
    }

    createVirtualConnection(peerId) {
        return {
            peer: peerId,
            open: true,
            type: 'websocket',
            label: `ws-${peerId.slice(0, 8)}`,
            reliable: true,
            send: payload => this.sendServerMessage(payload, peerId),
            close: () => {}
        };
    }

    ensureVirtualConnection(peerId) {
        if (!peerId || peerId === this.myId) return null;
        if (!this.connections[peerId]) this.connections[peerId] = this.createVirtualConnection(peerId);
        return this.connections[peerId];
    }

    syncVirtualConnections(players = []) {
        const liveIds = new Set(players.map(player => player?.id).filter(Boolean));
        players.forEach(player => {
            if (player?.id && player.id !== this.myId) this.ensureVirtualConnection(player.id);
        });
        Object.keys(this.connections).forEach(id => {
            if (!liveIds.has(id)) delete this.connections[id];
        });
    }

    handleServerMessage(event) {
        let message;
        try {
            message = JSON.parse(event.data);
        } catch {
            debugLogger.warn('WebSocket', 'Ignored invalid server JSON', event.data);
            return;
        }
        debugLogger.info('WebSocket', 'Server message received', message);

        if (message.kind === 'error') {
            this.updateStatus(`Server error: ${message.message}`);
            this.game.receiveLobbyChat({ system: true, text: message.message || 'Server error.' });
            return;
        }

        if (message.kind === 'welcome') {
            this.myId = message.id || this.myId;
            this.hostId = message.hostId || message.roomId || this.hostId;
            this.isHost = !!message.isHost;
            this.syncVirtualConnections(message.players || []);
            this.applyPlayerList(message.players || []);
            this.updateStatus(this.isHost ? 'Server room ready. Share the join link with friends.' : 'Connected to server room. Waiting for settings...');
            return;
        }

        if (message.kind === 'player-list') {
            this.syncVirtualConnections(message.players || []);
            this.applyPlayerList(message.players || []);
            return;
        }

        if (message.kind === 'message') {
            const from = message.from || message.payload?.from;
            if (from && from !== this.myId) this.ensureVirtualConnection(from);
            this.logPacket('recv-server', message.payload?.type || 'unknown', from, message.payload);
            this.handleMessage(from, message.payload || {});
        }
    }

    describeConnection(conn) {
        return {
            peer: conn?.peer,
            open: !!conn?.open,
            label: conn?.label,
            type: conn?.type,
            reliable: !!conn?.reliable,
            metadata: conn?.metadata,
            transport: 'websocket',
            isHost: this.isHost,
            hostId: this.hostId,
            isHostConnection: conn?.peer === this.hostId
        };
    }

    getDebugSnapshot() {
        return {
            myId: this.myId,
            isHost: this.isHost,
            hostId: this.hostId,
            serverUrl: this.serverUrl,
            socketState: this.socket?.readyState,
            connections: Object.fromEntries(Object.entries(this.connections).map(([id, conn]) => [id, {
                open: !!conn?.open,
                label: conn?.label,
                type: conn?.type,
                reliable: !!conn?.reliable,
                isHostConnection: id === this.hostId
            }])),
            remotePlayers: Object.keys(this.remotePlayerData)
        };
    }

    logPacket(direction, type, peerId, data = {}) {
        const key = `${direction}:${type}`;
        this.debugPacketCounters[key] = (this.debugPacketCounters[key] || 0) + 1;
        const noisy = type === 'move';
        const now = performance.now();
        if (noisy) {
            if (now - this.lastDebugPacketFlushAt > 2500) {
                this.lastDebugPacketFlushAt = now;
                debugLogger.info('Packets', 'Packet counters', {
                    counters: this.debugPacketCounters,
                    snapshot: this.getDebugSnapshot()
                });
            }
            return;
        }
        debugLogger.info('Packets', `${direction} ${type}`, {
            peerId,
            data,
            snapshot: this.getDebugSnapshot()
        });
    }

    updateJoinLink() {
        let linkEl = document.getElementById('join-link');
        if (linkEl) linkEl.remove();
    }

    connectToHost(hostId) {
        this.ensureVirtualConnection(hostId);
    }

    connectToMeshPeer(peerId) {
        this.ensureVirtualConnection(peerId);
    }

    getHostConnection() {
        return this.hostId ? this.connections[this.hostId] : null;
    }

    setupConnection(conn) {
        this.ensureVirtualConnection(conn.peer);
    }

    handleMessage(peerId, data) {
        const senderId = data.from || peerId;

        if (data.type === 'peer-hello') {
            this.ensureRemoteData(senderId, data.player || {});
            return;
        }

        if (data.type === 'join') {
            debugLogger.info('Lobby', 'Join message received', { senderId, peerId, player: data.player });
            if (this.isHost) {
                const team = this.assignTeam(senderId);
                this.ensureRemoteData(senderId, { ...(data.player || {}), id: senderId, team, ready: false, isHost: false, relayOnly: !!data.relayOnly });
                this.game.receiveLobbyChat({ system: true, text: `${this.remotePlayerData[senderId].name} joined the room.` });
                this.rebalanceTeams();
                this.sendSettings(this.connections[peerId]);
                this.broadcastPlayerList();
            } else {
                this.ensureRemoteData(senderId, data.player || {});
            }
            return;
        }

        if (data.type === 'lobby-ready') {
            if (!this.isHost) return;
            debugLogger.info('Lobby', 'Ready state received', { senderId, ready: !!data.ready });
            this.ensureRemoteData(senderId);
            this.remotePlayerData[senderId].ready = !!data.ready;
            this.broadcastPlayerList();
            this.game.renderLobbyRoom();
            return;
        }

        if (data.type === 'lobby-chat') {
            const message = {
                name: data.name || this.remotePlayerData[senderId]?.name || `Player ${String(senderId).slice(0, 4)}`,
                text: data.text || '',
                at: data.at || Date.now()
            };
            this.game.receiveLobbyChat(message);
            if (this.isHost) {
                this.broadcast({ type: 'lobby-chat', ...message, from: senderId });
            }
            return;
        }

        if (data.type === 'kicked') {
            this.updateStatus(data.reason || 'Removed from room by host.');
            this.game.receiveLobbyChat({ system: true, text: data.reason || 'You were removed from the room.' });
            this.disconnectFromRoom();
            return;
        }

        if (data.type === 'settings') {
            debugLogger.info('Lobby', 'Settings received', data);
            this.applySettings(data);
            return;
        }

        if (data.type === 'player-list') {
            debugLogger.info('Lobby', 'Player list received', { count: data.players?.length || 0, players: data.players });
            this.applyPlayerList(data.players || []);
            return;
        }

        if (data.type === 'peer-left') {
            if (this.connections[data.id]) {
                this.connections[data.id].close();
                delete this.connections[data.id];
            }
            this.removeRemotePlayer(data.id);
            this.game.updateHUDStats();
            return;
        }

        if (data.type === 'match-start') {
            this.applySettings(data);
            if (document.getElementById('platform-screen')?.classList.contains('active')) return;
            this.game.startGame(true);
            return;
        }

        if (data.type === 'move') {
            this.updateRemotePlayer(senderId, data);
        } else if (data.type === 'shoot') {
            this.game.weaponSystem.createImpactEffect(data.point, 0xffff00);
            this.game.weaponSystem.playSound(200, 'square', 0.1, 0.05);
        } else if (data.type === 'hit') {
            if (data.target === this.myId) {
                this.game.takeDamage(data.damage, senderId);
            }
        } else if (data.type === 'death') {
            this.game.applyRemoteDeath(data.victim || senderId, data.attacker);
        } else if (data.type === 'health') {
            this.ensureRemoteData(senderId);
            this.remotePlayerData[senderId].health = data.value;
            this.updateRemoteOverlay(senderId);
        } else if (data.type === 'stats') {
            this.ensureRemoteData(senderId, data.player || {});
            Object.assign(this.remotePlayerData[senderId], data.player || {});
            this.updateRemoteOverlay(senderId);
            this.applyRemoteStyle(senderId);
            this.game.renderLobbyRoom();
            this.game.updateHUDStats();
        } else if (data.type === 'protection') {
            this.setRemoteProtection(senderId, data.value);
        } else if (data.type === 'end-match') {
            this.game.endMatch(false);
        }

        if (this.isHost && RELAY_TYPES.has(data.type)) return;
    }

    applySettings(data) {
        this.game.applyNetworkSettings(data);
        if (data.playerList) this.applyPlayerList(data.playerList);
        if (data.yourTeam) this.game.team = data.yourTeam;
        this.updateStatus(data.started ? 'Match in progress. Joining...' : `Lobby ready: ${data.map} / ${data.mode}`);
        this.game.updateHUDStats();
    }

    assignTeam(id) {
        if (!this.game.isTeamMode()) return 'NONE';
        if (this.remotePlayerData[id]?.team) return this.remotePlayerData[id].team;
        const counts = { RED: this.game.team === 'RED' ? 1 : 0, BLUE: this.game.team === 'BLUE' ? 1 : 0 };
        Object.values(this.remotePlayerData).forEach(player => {
            if (player.team === 'RED') counts.RED++;
            if (player.team === 'BLUE') counts.BLUE++;
        });
        return counts.RED <= counts.BLUE ? 'RED' : 'BLUE';
    }

    rebalanceTeams() {
        if (!this.isHost) return;
        if (!this.game.isTeamMode()) {
            this.game.team = 'NONE';
            Object.values(this.remotePlayerData).forEach(player => player.team = 'NONE');
            return;
        }

        const players = [
            { id: this.myId, local: true },
            ...Object.values(this.remotePlayerData)
                .filter(player => player.id)
                .map(player => ({ id: player.id, local: false }))
        ].sort((a, b) => String(a.id).localeCompare(String(b.id)));

        players.forEach((player, index) => {
            const team = index % 2 === 0 ? 'RED' : 'BLUE';
            if (player.local) this.game.team = team;
            else if (this.remotePlayerData[player.id]) this.remotePlayerData[player.id].team = team;
        });
    }

    canStartMatch() {
        const players = this.getPlayerList();
        return players.length > 0 && players.every(player => player.ready);
    }

    sendSettings(conn = null) {
        if (this.isHost) this.rebalanceTeams();
        const payload = {
            type: 'settings',
            map: this.game.selectedMap,
            mode: this.game.selectedMode,
            started: this.game.gameStarted,
            matchEndTime: this.game.matchEndTime,
            playerList: this.getPlayerList()
        };
        if (conn) {
            payload.yourTeam = this.remotePlayerData[conn.peer]?.team || this.assignTeam(conn.peer);
            if (conn.open) {
                conn.send(payload);
                this.logPacket('send', 'settings', conn.peer, payload);
            }
        } else {
            this.broadcast(payload);
        }
    }

    sendMatchStart() {
        if (this.isHost) this.rebalanceTeams();
        this.broadcast({
            type: 'match-start',
            map: this.game.selectedMap,
            mode: this.game.selectedMode,
            started: true,
            matchEndTime: this.game.matchEndTime,
            playerList: this.getPlayerList()
        });
    }

    sendPlayerList(conn = null) {
        const payload = { type: 'player-list', players: this.getPlayerList() };
        if (conn) {
            if (conn.open) {
                conn.send(payload);
                this.logPacket('send', 'player-list', conn.peer, { count: payload.players.length });
            }
        } else {
            this.broadcast(payload);
        }
    }

    broadcastPlayerList() {
        this.sendPlayerList();
    }

    getPlayerList() {
        if (this.isHost) this.rebalanceTeams();
        return [
            this.game.getLocalPlayerInfo(),
            ...Object.values(this.remotePlayerData).map(player => this.serializePlayer(player))
        ];
    }

    serializePlayer(player) {
        return {
            id: player.id,
            name: player.name,
            team: player.team,
            ready: !!player.ready,
            isHost: !!player.isHost,
            health: player.health,
            kills: player.kills,
            deaths: player.deaths,
            gunGameLevel: player.gunGameLevel,
            level: player.level,
            badge: player.badge,
            color: player.color,
            hat: player.hat,
            glasses: player.glasses,
            relayOnly: !!player.relayOnly
        };
    }

    applyPlayerList(players) {
        debugLogger.info('Mesh', 'Applying player list', {
            players: players.map(player => ({ id: player?.id, isHost: player?.isHost, ready: player?.ready })),
            snapshot: this.getDebugSnapshot()
        });
        players.forEach(player => {
            if (!player || player.id === this.myId) {
                if (player?.team) this.game.team = player.team;
                if (typeof player?.ready === 'boolean') this.game.lobbyReady = player.ready;
                return;
            }
            this.ensureRemoteData(player.id, player);
        });
        this.syncMeshConnections(players);
        this.game.renderLobbyRoom();
        this.game.updateHUDStats();
    }

    syncMeshConnections(players) {
        this.syncVirtualConnections(players);
    }

    ensureRemoteData(id, info = {}) {
        if (!id || id === this.myId) return null;
        if (!this.remotePlayerData[id]) {
            this.remotePlayerData[id] = {
                id,
                name: `Player ${id.slice(0, 4)}`,
                team: info.team || 'NONE',
                ready: !!info.ready,
                isHost: !!info.isHost,
                health: 100,
                kills: 0,
                deaths: 0,
                gunGameLevel: 0,
                level: 0,
                badge: 'Rookie',
                color: '#ff4444',
                hat: 'NONE',
                glasses: 'NONE',
                relayOnly: false
            };
        }
        Object.assign(this.remotePlayerData[id], info, { id });
        if (!this.remotePlayers[id]) this.createRemotePlayer(id);
        this.applyRemoteStyle(id);
        return this.remotePlayerData[id];
    }

    createRoundedAvatarPart(width, height, depth, radius, material, part) {
        const x = -width / 2;
        const y = -height / 2;
        const shape = new Shape();
        shape.moveTo(x + radius, y);
        shape.lineTo(x + width - radius, y);
        shape.quadraticCurveTo(x + width, y, x + width, y + radius);
        shape.lineTo(x + width, y + height - radius);
        shape.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        shape.lineTo(x + radius, y + height);
        shape.quadraticCurveTo(x, y + height, x, y + height - radius);
        shape.lineTo(x, y + radius);
        shape.quadraticCurveTo(x, y, x + radius, y);

        const geometry = new ExtrudeGeometry(shape, {
            depth,
            bevelEnabled: true,
            bevelThickness: 0.025,
            bevelSize: 0.025,
            bevelSegments: 3,
            curveSegments: 10
        });
        geometry.translate(0, 0, -depth / 2);

        const mesh = new Mesh(geometry, material);
        mesh.userData.part = part;
        return mesh;
    }

    createRemotePlayer(id) {
        const group = new Group();
        group.userData.targetPosition = new Vector3();
        group.userData.targetRotationY = 0;
        group.visible = false;

        const body = this.createRoundedAvatarPart(
            0.74,
            1,
            0.42,
            0.16,
            new MeshStandardMaterial({ color: 0xff4444, roughness: 0.72, metalness: 0.04 }),
            'body'
        );
        body.position.set(0, 0.03, 0);
        group.add(body);

        const head = this.createRoundedAvatarPart(
            0.54,
            0.5,
            0.44,
            0.1,
            new MeshStandardMaterial({ color: 0xd6a06f, roughness: 0.82, metalness: 0.02 }),
            'head'
        );
        head.position.set(0, 0.82, -0.05);
        group.add(head);
        group.userData.head = head;

        const eyeMat = new MeshStandardMaterial({ color: 0x4a2715, emissive: 0xffb347, emissiveIntensity: 0.15 });
        [-0.12, 0.12].forEach((x) => {
            const eye = new Mesh(new BoxGeometry(0.045, 0.045, 0.018), eyeMat);
            eye.position.set(x, 0.86, -0.285);
            eye.userData.part = 'eye';
            group.add(eye);
        });

        this.game.scene.add(group);
        this.remotePlayers[id] = group;
        this.createRemoteOverlay(id);
        this.applyRemoteStyle(id);
    }

    createRemoteOverlay(id) {
        const data = this.remotePlayerData[id];
        if (!data || data.nameLabel) return;

        const nameLabel = document.createElement('div');
        nameLabel.className = 'player-name-label';
        nameLabel.innerText = this.getOverlayText(id);

        const healthBar = document.createElement('div');
        healthBar.className = 'health-bar-container';
        const healthFill = document.createElement('div');
        healthFill.className = 'health-bar-fill';
        healthBar.appendChild(healthFill);

        document.body.appendChild(nameLabel);
        document.body.appendChild(healthBar);
        data.nameLabel = nameLabel;
        data.healthBar = healthBar;
        data.healthFill = healthFill;
        this.updateRemoteOverlay(id);
    }

    updateRemoteOverlay(id) {
        const data = this.remotePlayerData[id];
        if (!data) return;
        if (data.nameLabel) data.nameLabel.innerText = this.getOverlayText(id);
        if (data.healthFill) {
            const health = Math.max(0, Math.min(100, data.health ?? 100));
            data.healthFill.style.width = `${health}%`;
            data.healthFill.style.background = health > 55 ? '#ffb347' : health > 25 ? '#ffd166' : '#ff4d5e';
        }
    }

    applyRemoteStyle(id, protectedSpawn = false) {
        const group = this.remotePlayers[id];
        const data = this.remotePlayerData[id];
        if (!group || !data) return;
        const bodyColor = protectedSpawn ? 0xffb347 : (data.color || '#ff4444');
        const headColor = 0xd6a06f;
        group.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if (child.userData.part === 'body') child.material.color.set(bodyColor);
            if (child.userData.part === 'head') child.material.color.set(headColor);
        });
        this.updateAccessories(id);
        this.updateRemoteOverlay(id);
    }

    getOverlayText(id) {
        const data = this.remotePlayerData[id] || {};
        const name = data.name || `Player ${id.slice(0, 4)}`;
        const level = data.level ? ` Lv.${data.level}` : ' Rookie';
        return `${name}${level}`;
    }

    updateAccessories(id) {
        const group = this.remotePlayers[id];
        const data = this.remotePlayerData[id];
        if (!group || !data) return;
        ['hatMesh', 'glassesMesh'].forEach(key => {
            if (group.userData[key]) {
                group.remove(group.userData[key]);
                group.userData[key] = null;
            }
        });

        if (data.hat && data.hat !== 'NONE') {
            const color = data.hat === 'CROWN' ? 0xffcc00 : data.hat === 'HELMET' ? 0x666666 : 0x111111;
            const hatGroup = new Group();
            if (data.hat === 'CROWN') {
                const band = new Mesh(new CylinderGeometry(0.32, 0.32, 0.1, 6), new MeshStandardMaterial({ color }));
                band.position.set(0, 0, 0);
                hatGroup.add(band);
                for (let i = 0; i < 5; i++) {
                    const point = new Mesh(new ConeGeometry(0.08, 0.22, 4), new MeshStandardMaterial({ color: 0xffee66 }));
                    const angle = (i / 5) * Math.PI * 2;
                    point.position.set(Math.cos(angle) * 0.22, 0.14, Math.sin(angle) * 0.22);
                    hatGroup.add(point);
                }
            } else if (data.hat === 'HELMET') {
                const dome = new Mesh(new CylinderGeometry(0.34, 0.27, 0.26, 16), new MeshStandardMaterial({ color }));
                const visor = new Mesh(new BoxGeometry(0.46, 0.06, 0.18), new MeshStandardMaterial({ color: 0x202020 }));
                visor.position.set(0, -0.04, -0.28);
                hatGroup.add(dome, visor);
            } else {
                const crown = new Mesh(new CylinderGeometry(0.32, 0.28, 0.16, 16), new MeshStandardMaterial({ color }));
                const brim = new Mesh(new BoxGeometry(0.5, 0.04, 0.2), new MeshStandardMaterial({ color: 0x050505 }));
                brim.position.set(0.12, -0.06, -0.24);
                hatGroup.add(crown, brim);
            }
            hatGroup.position.set(0, 1.13, -0.05);
            hatGroup.userData.part = 'accessory';
            group.add(hatGroup);
            group.userData.hatMesh = hatGroup;
        }

        if (data.glasses && data.glasses !== 'NONE') {
            const color = data.glasses === 'VISOR' ? 0xffb347 : data.glasses === 'TACTICAL' ? 0xff3333 : 0x050505;
            const glassesGroup = new Group();
            if (data.glasses === 'VISOR') {
                glassesGroup.add(new Mesh(new BoxGeometry(0.58, 0.13, 0.04), new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.35 })));
            } else if (data.glasses === 'TACTICAL') {
                const left = new Mesh(new BoxGeometry(0.2, 0.12, 0.04), new MeshStandardMaterial({ color }));
                const right = left.clone();
                left.position.x = -0.16;
                right.position.x = 0.16;
                const bridge = new Mesh(new BoxGeometry(0.12, 0.04, 0.04), new MeshStandardMaterial({ color: 0x111111 }));
                glassesGroup.add(left, right, bridge);
            } else {
                const left = new Mesh(new TorusGeometry(0.1, 0.018, 6, 16), new MeshStandardMaterial({ color }));
                const right = left.clone();
                left.position.x = -0.15;
                right.position.x = 0.15;
                const bridge = new Mesh(new BoxGeometry(0.12, 0.025, 0.025), new MeshStandardMaterial({ color }));
                glassesGroup.add(left, right, bridge);
            }
            glassesGroup.position.set(0, 0.86, -0.31);
            glassesGroup.userData.part = 'accessory';
            group.add(glassesGroup);
            group.userData.glassesMesh = glassesGroup;
        }
    }

    updateRemotePlayer(id, data) {
        this.ensureRemoteData(id);
        const mesh = this.remotePlayers[id];
        if (!mesh || !data.pos) return;
        mesh.visible = true;
        mesh.userData.targetPosition.set(data.pos.x, data.pos.y, data.pos.z);
        mesh.userData.targetRotationY = data.rotY || 0;
    }

    setRemoteProtection(id, value) {
        this.ensureRemoteData(id);
        this.applyRemoteStyle(id, value);
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            this.game.scene.remove(this.remotePlayers[id]);
            delete this.remotePlayers[id];
        }
        const data = this.remotePlayerData[id];
        if (data?.nameLabel) data.nameLabel.remove();
        if (data?.healthBar) data.healthBar.remove();
        delete this.remotePlayerData[id];
        this.game.renderLobbyRoom();
    }

    kickPlayer(id) {
        if (!this.isHost || !id || id === this.myId) return;
        const conn = this.connections[id];
        if (conn?.open) {
            conn.send({ type: 'kicked', reason: 'Removed from room by host.' });
            setTimeout(() => conn.close(), 80);
        }
        const name = this.remotePlayerData[id]?.name || `Player ${String(id).slice(0, 4)}`;
        this.removeRemotePlayer(id);
        delete this.connections[id];
        this.game.receiveLobbyChat({ system: true, text: `${name} was removed from the room.` });
        this.broadcast({ type: 'peer-left', id });
        this.broadcastPlayerList();
        this.updateStatus(`${name} removed from room.`);
    }

    disconnectFromRoom() {
        Object.values(this.connections).forEach(conn => conn.close());
        this.connections = {};
        Object.keys(this.remotePlayerData).forEach(id => this.removeRemotePlayer(id));
        this.isHost = false;
        this.hostId = null;
        this.game.lobbyReady = false;
        window.history.replaceState({}, document.title, window.location.pathname);
        this.game.renderLobbyRoom();
    }

    relay(senderId, data, originalPeerId) {
        const meshRecipients = new Set(Array.isArray(data.meshPeers) ? data.meshPeers : []);
        const { meshPeers, ...relayData } = data;
        const relayedTo = [];
        Object.entries(this.connections).forEach(([id, conn]) => {
            if (id !== originalPeerId && !meshRecipients.has(id) && conn.open) {
                conn.send({ ...relayData, from: senderId });
                relayedTo.push(id);
            }
        });
        this.logPacket('relay', data.type, senderId, {
            originalPeerId,
            skippedMeshRecipients: [...meshRecipients],
            relayedTo
        });
    }

    broadcast(data) {
        const payload = { ...data, from: this.myId };
        if (this.isHost) {
            const sentTo = [];
            Object.values(this.connections).forEach(conn => {
                if (conn.open) {
                    conn.send(payload);
                    sentTo.push(conn.peer);
                }
            });
            this.logPacket('send-host', data.type, 'all', { sentTo });
            return;
        }

        const hostConn = this.getHostConnection();
        if (RELAY_TYPES.has(data.type)) {
            const meshPeers = [];
            if (!this.forceRelayOnly) {
                Object.entries(this.connections).forEach(([id, conn]) => {
                    if (id === this.hostId || !conn.open) return;
                    conn.send(payload);
                    meshPeers.push(id);
                });
            }
            if (hostConn?.open) hostConn.send({ ...payload, meshPeers });
            this.logPacket('send-mesh', data.type, 'mesh+host', {
                meshPeers,
                hostOpen: !!hostConn?.open
            });
            return;
        }

        if (hostConn?.open) {
            hostConn.send(payload);
            this.logPacket('send-host', data.type, this.hostId);
        } else {
            debugLogger.warn('Network', 'No open host connection for broadcast', {
                type: data.type,
                snapshot: this.getDebugSnapshot()
            });
        }
    }

    sendUpdate(pos, rotY, force = false) {
        const now = performance.now();
        const movedEnough = !this.lastSentMove ||
            Math.abs(pos.x - this.lastSentMove.x) > 0.02 ||
            Math.abs(pos.y - this.lastSentMove.y) > 0.02 ||
            Math.abs(pos.z - this.lastSentMove.z) > 0.02 ||
            Math.abs(rotY - this.lastSentMove.rotY) > 0.01;

        if (!force && (!movedEnough || now - this.lastMoveSentAt < this.moveIntervalMs)) return;
        this.lastMoveSentAt = now;
        this.lastSentMove = { x: pos.x, y: pos.y, z: pos.z, rotY };
        this.broadcast({ type: 'move', pos, rotY });
    }

    sendShoot(point) {
        this.broadcast({ type: 'shoot', point });
    }

    sendStats() {
        this.broadcast({ type: 'stats', player: this.game.getLocalPlayerInfo() });
        if (this.isHost) this.broadcastPlayerList();
    }

    sendLobbyReady(ready) {
        if (this.isHost) {
            this.game.lobbyReady = !!ready;
            this.broadcastPlayerList();
            return;
        }
        this.broadcast({ type: 'lobby-ready', ready: !!ready });
    }

    sendLobbyChat(text) {
        const message = {
            name: this.game.playerName,
            text: String(text || '').slice(0, 120),
            at: Date.now()
        };
        if (this.isHost) {
            this.game.receiveLobbyChat(message);
            this.broadcast({ type: 'lobby-chat', ...message });
        } else {
            this.broadcast({ type: 'lobby-chat', ...message });
        }
    }

    update(delta) {
        Object.values(this.remotePlayers).forEach(group => {
            if (!group.userData.targetPosition) return;
            const alpha = Math.min(1, delta * 12);
            group.position.lerp(group.userData.targetPosition, alpha);
            group.rotation.y = MathUtils.lerp(group.rotation.y, group.userData.targetRotationY, alpha);
        });
        this.updateRemoteOverlays();
    }

    updateRemoteOverlays() {
        Object.entries(this.remotePlayers).forEach(([id, group]) => {
            const data = this.remotePlayerData[id];
            if (!data?.nameLabel || !data.healthBar) return;
            if (!group.visible || this.game.targetedPlayerId !== id) {
                data.nameLabel.style.display = 'none';
                data.healthBar.style.display = 'none';
                return;
            }

            this.labelProjector.copy(group.position).add(new Vector3(0, 1.35, 0));
            this.labelProjector.project(this.game.camera);
            const inFront = this.labelProjector.z < 1;
            if (!inFront) {
                data.nameLabel.style.display = 'none';
                data.healthBar.style.display = 'none';
                return;
            }

            const x = (this.labelProjector.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-this.labelProjector.y * 0.5 + 0.5) * window.innerHeight;
            data.nameLabel.style.display = 'block';
            data.healthBar.style.display = 'block';
            data.nameLabel.style.left = `${x}px`;
            data.nameLabel.style.top = `${y - 16}px`;
            data.healthBar.style.left = `${x}px`;
            data.healthBar.style.top = `${y}px`;
        });
    }
}
