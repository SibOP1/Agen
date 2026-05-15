import { Group, CapsuleGeometry, MeshStandardMaterial, Mesh, BoxGeometry, Vector3, MathUtils, ConeGeometry, CylinderGeometry, TorusGeometry } from 'three';
import Peer from 'peerjs';

const RELAY_TYPES = new Set(['move', 'shoot', 'hit', 'death', 'health', 'protection', 'stats', 'end-match']);

export class NetworkManager {
    constructor(game) {
        this.game = game;
        const savedId = localStorage.getItem('peer_id');
        this.connections = {};
        this.remotePlayers = {};
        this.remotePlayerData = {};
        this.isHost = false;
        this.lastMoveSentAt = 0;
        this.moveIntervalMs = 55;
        this.lastSentMove = null;
        this.labelProjector = new Vector3();
        this.initPeer(savedId || undefined);
    }

    initPeer(id = undefined) {
        this.peer = new Peer(id);
        this.peer.on('open', (id) => {
            this.myId = id;
            localStorage.setItem('peer_id', id);
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
                localStorage.removeItem('peer_id');
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
            this.connectToHost(joinId);
        } else {
            this.isHost = true;
            this.game.team = 'RED';
            this.updateJoinLink();
            this.updateStatus('Hosting lobby. Share the join link with friends.');
            this.game.updateHUDStats();
        }
    }

    updateStatus(message) {
        const el = document.getElementById('network-status');
        if (el) el.innerText = message;
    }

    updateJoinLink() {
        const joinUrl = `${window.location.origin}${window.location.pathname}?join=${this.myId}`;
        let linkEl = document.getElementById('join-link');
        if (!linkEl) {
            linkEl = document.createElement('div');
            linkEl.id = 'join-link';
            linkEl.style.cssText = 'position:absolute; top:50px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:10px; border-radius:5px; cursor:pointer; font-size:12px; z-index:120;';
            document.body.appendChild(linkEl);
        }
        linkEl.innerText = 'Click to Copy Join Link';
        linkEl.onclick = () => {
            navigator.clipboard.writeText(joinUrl);
            linkEl.innerText = 'Link Copied!';
            setTimeout(() => linkEl.innerText = 'Click to Copy Join Link', 2000);
        };
    }

    connectToHost(hostId) {
        this.updateStatus(`Joining host ${hostId.slice(0, 6)}...`);
        const conn = this.peer.connect(hostId, { reliable: false });
        this.connections[hostId] = conn;
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        conn.on('open', () => {
            this.connections[conn.peer] = conn;
            this.updateStatus(this.isHost ? `Player connected: ${conn.peer.slice(0, 6)}` : 'Connected to host. Waiting for settings...');

            if (this.isHost) {
                const team = this.assignTeam(conn.peer);
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

        conn.on('data', (data) => {
            this.handleMessage(conn.peer, data || {});
        });

        conn.on('close', () => {
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
            this.updateStatus(`Connection error: ${err.message || err}`);
        });
    }

    handleMessage(peerId, data) {
        const senderId = data.from || peerId;

        if (data.type === 'join') {
            if (this.isHost) {
                const team = this.assignTeam(senderId);
                this.ensureRemoteData(senderId, { ...(data.player || {}), id: senderId, team });
                this.sendSettings(this.connections[peerId]);
                this.broadcastPlayerList();
            } else {
                this.ensureRemoteData(senderId, data.player || {});
            }
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
        if (this.remotePlayerData[id]?.team) return this.remotePlayerData[id].team;
        const counts = { RED: this.game.team === 'RED' ? 1 : 0, BLUE: this.game.team === 'BLUE' ? 1 : 0 };
        Object.values(this.remotePlayerData).forEach(player => {
            if (player.team === 'RED') counts.RED++;
            if (player.team === 'BLUE') counts.BLUE++;
        });
        return counts.RED <= counts.BLUE ? 'RED' : 'BLUE';
    }

    sendSettings(conn = null) {
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
                return;
            }
            this.ensureRemoteData(player.id, player);
        });
        this.game.updateHUDStats();
    }

    ensureRemoteData(id, info = {}) {
        if (!id || id === this.myId) return null;
        if (!this.remotePlayerData[id]) {
            this.remotePlayerData[id] = {
                id,
                name: `Player ${id.slice(0, 4)}`,
                team: info.team || 'NONE',
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

    createRemotePlayer(id) {
        const group = new Group();
        group.userData.targetPosition = new Vector3();
        group.userData.targetRotationY = 0;
        group.visible = false;

        const bodyGeo = new CapsuleGeometry(0.5, 1);
        const bodyMat = new MeshStandardMaterial({ color: 0xff4444 });
        const body = new Mesh(bodyGeo, bodyMat);
        body.userData.part = 'body';
        group.add(body);

        const headGeo = new BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new MeshStandardMaterial({ color: 0x333333 });
        const head = new Mesh(headGeo, headMat);
        head.userData.part = 'head';
        head.position.set(0, 0.6, -0.2);
        group.add(head);
        group.userData.head = head;

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
            data.healthFill.style.background = health > 55 ? '#00ff66' : health > 25 ? '#ffcc00' : '#ff4444';
        }
    }

    applyRemoteStyle(id, protectedSpawn = false) {
        const group = this.remotePlayers[id];
        const data = this.remotePlayerData[id];
        if (!group || !data) return;
        const bodyColor = protectedSpawn ? 0xffff00 : (data.color || (data.team === 'BLUE' ? '#4488ff' : '#ff4444'));
        const headColor = data.team === 'BLUE' ? 0x223355 : 0x333333;
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
            hatGroup.position.set(0, 0.93, -0.05);
            hatGroup.userData.part = 'accessory';
            group.add(hatGroup);
            group.userData.hatMesh = hatGroup;
        }

        if (data.glasses && data.glasses !== 'NONE') {
            const color = data.glasses === 'VISOR' ? 0x00ffff : data.glasses === 'TACTICAL' ? 0xff3333 : 0x050505;
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
            glassesGroup.position.set(0, 0.62, -0.44);
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
