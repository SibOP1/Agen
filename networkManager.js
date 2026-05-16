import { Group, MeshStandardMaterial, Mesh, BoxGeometry, Vector3, MathUtils, ConeGeometry, CylinderGeometry, TorusGeometry, Shape, ExtrudeGeometry } from 'three';
import Peer from 'peerjs';

const RELAY_TYPES = new Set(['move', 'shoot', 'hit', 'death', 'health', 'protection', 'stats', 'end-match']);
const CONNECTION_TIMEOUT_MS = 20000;
const DEFAULT_ICE_SERVERS = [
    { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:openrelay.metered.ca:80'] },
    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
    { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
];

function getStoredValue(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function setStoredValue(key, value) {
    try {
        localStorage.setItem(key, value);
    } catch {
        // Storage can be disabled in private browser contexts; networking still works for this tab.
    }
}

function removeStoredValue(key) {
    try {
        localStorage.removeItem(key);
    } catch {
        // Ignore unavailable storage.
    }
}

function parseConfigObject(source, label) {
    if (!source) return null;
    if (typeof source === 'object') return source;
    try {
        const parsed = JSON.parse(source);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        console.warn(`Invalid ${label} configuration ignored.`);
        return null;
    }
}

function getIceServers() {
    const sources = [
        globalThis.AGEN_ICE_SERVERS,
        import.meta.env?.VITE_ICE_SERVERS,
        getStoredValue('agen_ice_servers')
    ];

    for (const source of sources) {
        if (!source) continue;
        if (Array.isArray(source)) return source;
        try {
            const parsed = JSON.parse(source);
            if (Array.isArray(parsed)) return parsed;
        } catch {
            console.warn('Invalid ICE server configuration ignored.');
        }
    }

    return DEFAULT_ICE_SERVERS;
}

function getPeerServerOptions() {
    const serverConfig = parseConfigObject(
        globalThis.AGEN_PEER_SERVER || import.meta.env?.VITE_PEER_SERVER || getStoredValue('agen_peer_server'),
        'PeerJS server'
    );
    const options = serverConfig ? { ...serverConfig } : {};

    const host = import.meta.env?.VITE_PEER_HOST || getStoredValue('agen_peer_host');
    const port = import.meta.env?.VITE_PEER_PORT || getStoredValue('agen_peer_port');
    const path = import.meta.env?.VITE_PEER_PATH || getStoredValue('agen_peer_path');
    const secure = import.meta.env?.VITE_PEER_SECURE || getStoredValue('agen_peer_secure');

    if (host) options.host = host;
    if (port) options.port = Number(port);
    if (path) options.path = path;
    if (secure) options.secure = String(secure).toLowerCase() !== 'false';

    return options;
}

function getPeerOptions() {
    const peerServerOptions = getPeerServerOptions();
    const peerConfig = peerServerOptions.config || {};
    delete peerServerOptions.config;

    return {
        ...peerServerOptions,
        debug: 1,
        config: {
            iceServers: getIceServers(),
            sdpSemantics: 'unified-plan',
            ...peerConfig
        }
    };
}

export class NetworkManager {
    constructor(game) {
        this.game = game;
        const savedId = getStoredValue('peer_id');
        this.connections = {};
        this.remotePlayers = {};
        this.remotePlayerData = {};
        this.isHost = false;
        this.hostId = null;
        this.lastMoveSentAt = 0;
        this.moveIntervalMs = 55;
        this.lastSentMove = null;
        this.labelProjector = new Vector3();
        this.initPeer(savedId || undefined);
    }

    initPeer(id = undefined) {
        const options = getPeerOptions();
        this.peer = id ? new Peer(id, options) : new Peer(options);
        this.peer.on('open', (id) => {
            this.myId = id;
            setStoredValue('peer_id', id);
            this.updateStatus(`Network ready: ${id.slice(0, 6)}`);
            this.handleUrlParam();
        });

        this.peer.on('connection', (conn) => {
            this.connections[conn.peer] = conn;
            this.setupConnection(conn);
        });

        this.peer.on('error', (err) => {
            this.updateStatus(`Network error: ${err.type || err.message}`);
            if (err.type === 'unavailable-id') {
                removeStoredValue('peer_id');
                this.peer.destroy();
                setTimeout(() => this.initPeer(), 250);
            }
            console.error(err);
        });
    }

    handleUrlParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');
        if (joinId) {
            this.hostId = joinId;
            this.connectToHost(joinId);
        } else {
            this.isHost = true;
            this.hostId = this.myId;
            this.game.team = 'NONE';
            window.history.replaceState({}, document.title, window.location.pathname);
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
    }

    updateJoinLink() {
        let linkEl = document.getElementById('join-link');
        if (linkEl) linkEl.remove();
    }

    connectToHost(hostId) {
        this.updateStatus(`Joining host ${hostId.slice(0, 6)}...`);
        const conn = this.peer.connect(hostId, { reliable: false });
        if (!conn) {
            this.updateStatus('Unable to start connection. Refresh and try the invite again.');
            return;
        }
        this.connections[hostId] = conn;
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        let opened = false;
        const timeout = setTimeout(() => {
            if (opened || conn.open) return;
            this.updateStatus('Connection timed out. Keep both lobbies open and try the invite again.');
            conn.close();
        }, CONNECTION_TIMEOUT_MS);

        conn.on('open', () => {
            opened = true;
            clearTimeout(timeout);
            this.connections[conn.peer] = conn;
            this.updateStatus(this.isHost ? `Player connected: ${conn.peer.slice(0, 6)}` : 'Connected to host. Waiting for settings...');

            if (this.isHost) {
                this.rebalanceTeams();
                const team = this.remotePlayerData[conn.peer]?.team || this.assignTeam(conn.peer);
                this.ensureRemoteData(conn.peer, { id: conn.peer, team, name: `Player ${conn.peer.slice(0, 4)}` });
                this.sendSettings(conn);
                this.sendPlayerList(conn);
            } else {
                conn.send({
                    type: 'join',
                    from: this.myId,
                    player: this.game.getLocalPlayerInfo()
                });
            }
        });

        conn.on('iceStateChanged', (state) => {
            if (state === 'checking' || state === 'connected' || state === 'completed') {
                this.updateStatus(this.isHost
                    ? `Player ${conn.peer.slice(0, 6)} connection ${state}...`
                    : `Host connection ${state}...`);
            }
            if (state === 'failed' || state === 'disconnected') {
                this.updateStatus('WebRTC connection failed. Try the invite again or switch networks.');
            }
        });

        conn.on('data', (data) => {
            this.handleMessage(conn.peer, data || {});
        });

        conn.on('close', () => {
            clearTimeout(timeout);
            this.removeRemotePlayer(conn.peer);
            delete this.connections[conn.peer];
            if (this.isHost) {
                this.broadcast({ type: 'peer-left', id: conn.peer });
                this.broadcastPlayerList();
            }
            this.updateStatus(this.isHost ? 'A player disconnected.' : 'Disconnected from host.');
            this.game.updateHUDStats();
        });

        conn.on('error', (err) => {
            clearTimeout(timeout);
            this.updateStatus(`Connection error: ${err.message || err}`);
        });
    }

    handleMessage(peerId, data) {
        const senderId = data.from || peerId;

        if (data.type === 'join') {
            if (this.isHost) {
                const team = this.assignTeam(senderId);
                this.ensureRemoteData(senderId, { ...(data.player || {}), id: senderId, team, ready: false, isHost: false });
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
            this.applySettings(data);
            return;
        }

        if (data.type === 'player-list') {
            this.applyPlayerList(data.players || []);
            return;
        }

        if (data.type === 'peer-left') {
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

        if (this.isHost && RELAY_TYPES.has(data.type)) {
            this.relay(senderId, data, peerId);
        }
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
            if (conn.open) conn.send(payload);
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
            if (conn.open) conn.send(payload);
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
            glasses: player.glasses
        };
    }

    applyPlayerList(players) {
        players.forEach(player => {
            if (!player || player.id === this.myId) {
                if (player?.team) this.game.team = player.team;
                if (typeof player?.ready === 'boolean') this.game.lobbyReady = player.ready;
                return;
            }
            this.ensureRemoteData(player.id, player);
        });
        this.game.renderLobbyRoom();
        this.game.updateHUDStats();
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
                glasses: 'NONE'
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
        Object.entries(this.connections).forEach(([id, conn]) => {
            if (id !== originalPeerId && conn.open) {
                conn.send({ ...data, from: senderId });
            }
        });
    }

    broadcast(data) {
        const payload = { ...data, from: this.myId };
        if (this.isHost) {
            Object.values(this.connections).forEach(conn => {
                if (conn.open) conn.send(payload);
            });
            return;
        }

        const hostConn = Object.values(this.connections)[0];
        if (hostConn?.open) hostConn.send(payload);
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
