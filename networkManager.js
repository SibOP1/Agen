import Peer from 'peerjs';

export class NetworkManager {
    constructor(game) {
        this.game = game;
        this.peer = new Peer();
        this.connections = {};
        this.remotePlayers = {};
        this.remotePlayerData = {}; // {id: {health, kills, deaths, healthBar}}
        this.isHost = false;

        this.peer.on('open', (id) => {
            console.log('My peer ID is: ' + id);
            this.myId = id;
            this.handleUrlParam();
        });

        this.peer.on('connection', (conn) => {
            this.connections[conn.peer] = conn;
            this.setupConnection(conn);
        });
    }

    handleUrlParam() {
        const urlParams = new URLSearchParams(window.location.search);
        const joinId = urlParams.get('join');
        if (joinId) {
            this.connectToHost(joinId);
        } else {
            this.isHost = true;
            this.updateJoinLink();
        }
    }

    updateJoinLink() {
        const joinUrl = `${window.location.origin}${window.location.pathname}?join=${this.myId}`;
        const linkEl = document.createElement('div');
        linkEl.id = 'join-link';
        linkEl.style.cssText = 'position:absolute; top:10px; left:10px; background:rgba(0,0,0,0.7); color:white; padding:10px; border-radius:5px; cursor:pointer; font-size:12px; z-index:100;';
        linkEl.innerText = 'Click to Copy Join Link';
        linkEl.onclick = () => {
            navigator.clipboard.writeText(joinUrl);
            linkEl.innerText = 'Link Copied!';
            setTimeout(() => linkEl.innerText = 'Click to Copy Join Link', 2000);
        };
        document.body.appendChild(linkEl);
    }

    connectToHost(hostId) {
        const conn = this.peer.connect(hostId);
        this.connections[hostId] = conn;
        this.setupConnection(conn);
    }

    setupConnection(conn) {
        conn.on('open', () => {
            this.connections[conn.peer] = conn;
            console.log('Connected to: ' + conn.peer);
            
            // Broadcast settings if I am the host
            if (this.isHost) {
                conn.send({
                    type: 'settings',
                    map: this.game.selectedMap,
                    mode: this.game.selectedMode
                });
            }
            
            // Always broadcast my presence to new peer
            conn.send({ 
                type: 'join', 
                id: this.myId,
                pos: this.game.playerBody.translation(),
                rot: this.game.playerRotation.y 
            });
        });

        conn.on('data', (data) => {
            this.handleMessage(conn.peer, data);
        });

        conn.on('close', () => {
            this.removeRemotePlayer(conn.peer);
            delete this.connections[conn.peer];
        });
    }

    handleMessage(peerId, data) {
        if (data.type === 'join') {
            this.createRemotePlayer(peerId);
            // If I am the host, send my presence back to the joining peer
            if (this.isHost) {
                this.connections[peerId].send({
                    type: 'join-ack',
                    id: this.myId,
                    pos: this.game.playerBody.translation(),
                    rot: this.game.playerRotation.y
                });
            }
        } else if (data.type === 'join-ack') {
            this.createRemotePlayer(peerId);
        } else if (data.type === 'settings') {
            this.game.selectedMap = data.map;
            this.game.selectedMode = data.mode;
            const info = document.getElementById('join-info');
            const btn = document.getElementById('join-btn');
            if (info) info.innerText = `Map: ${data.map} | Mode: ${data.mode}`;
            if (btn) btn.style.display = 'inline-block';
        } else if (data.type === 'move') {
            this.updateRemotePlayer(peerId, data);
        } else if (data.type === 'shoot') {
            this.game.weaponSystem.createImpactEffect(data.point, 0xffff00);
            this.game.weaponSystem.playSound(200, 'square', 0.1, 0.05);
        } else if (data.type === 'hit') {
            if (data.target === this.myId) {
                this.game.takeDamage(data.damage, peerId);
            }
        } else if (data.type === 'death') {
            if (this.remotePlayerData[peerId]) {
                this.remotePlayerData[peerId].deaths++;
                this.remotePlayerData[peerId].health = 100;
            }
            if (data.attacker === this.myId) {
                this.game.kills++;
                this.game.updateHUDStats();
                this.game.weaponSystem.playSound(800, 'sine', 0.1, 0.2); // Kill sound
            } else if (this.remotePlayerData[data.attacker]) {
                this.remotePlayerData[data.attacker].kills++;
            }
        } else if (data.type === 'health') {
            if (this.remotePlayerData[peerId]) {
                this.remotePlayerData[peerId].health = data.value;
            }
        }
    }

    createRemotePlayer(id) {
        const group = new THREE.Group();
        
        // Body
        const bodyGeo = new THREE.CapsuleGeometry(0.5, 1);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0xff4444 });
        const body = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(body);

        // Head/Direction indicator
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.set(0, 0.6, -0.2);
        group.add(head);

        this.game.scene.add(group);
        this.remotePlayers[id] = group;

        // Create health bar element
        const hb = document.createElement('div');
        hb.className = 'health-bar-container';
        hb.innerHTML = '<div class="health-bar-fill"></div>';
        document.body.appendChild(hb);

        this.remotePlayerData[id] = {
            health: 100,
            kills: 0,
            deaths: 0,
            healthBar: hb
        };
    }

    updateRemotePlayer(id, data) {
        if (!this.remotePlayers[id]) this.createRemotePlayer(id);
        const mesh = this.remotePlayers[id];
        mesh.position.set(data.pos.x, data.pos.y, data.pos.z);
        mesh.rotation.y = data.rotY;
    }

    removeRemotePlayer(id) {
        if (this.remotePlayers[id]) {
            this.game.scene.remove(this.remotePlayers[id]);
            delete this.remotePlayers[id];
        }
    }

    broadcast(data) {
        Object.values(this.connections).forEach(conn => {
            if (conn.open) conn.send(data);
        });
    }

    sendUpdate(pos, rotY) {
        this.broadcast({ type: 'move', pos, rotY });
    }

    sendShoot(point) {
        this.broadcast({ type: 'shoot', point });
    }
}
