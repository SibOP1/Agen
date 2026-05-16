import {
    Scene,
    PerspectiveCamera,
    WebGLRenderer,
    Clock,
    Euler,
    Quaternion,
    Vector3,
    AmbientLight,
    DirectionalLight,
    HemisphereLight,
    Raycaster,
    Vector2,
    Group,
    CapsuleGeometry,
    BoxGeometry,
    CylinderGeometry,
    ConeGeometry,
    TorusGeometry,
    MeshStandardMaterial,
    Mesh,
    MathUtils,
    Box3
} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MapManager } from './mapManager.js';
import { WeaponSystem, WEAPON_DATA } from './weaponSystem.js';
import { NetworkManager } from './networkManager.js';

const MODE_LABELS = {
    PRACTICE: 'Practice',
    ENDLESS_FFA: 'Endless FFA',
    ENDLESS_TDM: 'Endless TDM',
    ENDLESS_SNIPER: 'Endless Sniper',
    TIME_FFA: 'Timed FFA',
    TIME_GUNGAME: 'Gun Game',
    TIME_TDM: 'Timed TDM',
    TIME_SNIPER: 'Timed Sniper'
};
const MAP_LABELS = {
    URBAN: 'Urban City',
    SCIFI: 'Neon SciFi',
    DESERT: 'Desert Outpost'
};
const ALL_WEAPONS = Object.keys(WEAPON_DATA);
const GUNGAME_LADDER = ['PISTOL', 'DEAGLE', 'SHOTGUN', 'RIFLE', 'SNIPER', 'SWORD'];
const PROFILE_KEY = 'agen_profile_v1';
const MOBILE_LAYOUT_KEY = 'agen_mobile_layout_v1';
const MOBILE_AIM_ASSIST_KEY = 'agen_mobile_aim_assist_v1';
const PUBLIC_URL_KEY = 'agen_public_url';
const MAX_LEVEL = 25;
const PRACTICE_XP_PER_KILL = Math.max(1, Math.round(25 * 0.25));
const BOT_DIFFICULTIES = {
    EASY: { label: 'Easy', speed: 2.35, reaction: 1.1, accuracy: 0.18, fireInterval: 0.62, vision: 34, damage: 6, strafe: false },
    NORMAL: { label: 'Normal', speed: 3.15, reaction: 0.62, accuracy: 0.09, fireInterval: 0.45, vision: 46, damage: 8, strafe: false },
    HARD: { label: 'Hard', speed: 3.8, reaction: 0.34, accuracy: 0.045, fireInterval: 0.32, vision: 58, damage: 9, strafe: true }
};
const MOBILE_CONTROL_ELEMENTS = {
    joystick: 'joystick-container',
    shoot: 'btn-shoot',
    jump: 'btn-jump',
    reload: 'btn-reload',
    scope: 'btn-scope',
    switch: 'btn-switch',
    slide: 'btn-slide'
};
const DEFAULT_MOBILE_LAYOUT = {
    size: 1,
    opacity: 0.72,
    controls: {
        joystick: { x: 0.15, y: 0.72, base: 150 },
        shoot: { x: 0.88, y: 0.60, base: 100 },
        jump: { x: 0.73, y: 0.82, base: 70 },
        reload: { x: 0.73, y: 0.48, base: 70 },
        scope: { x: 0.88, y: 0.82, base: 70 },
        switch: { x: 0.88, y: 0.36, base: 70 },
        slide: { x: 0.73, y: 0.30, base: 70 }
    }
};
const DEFAULT_PROFILE = {
    version: 1,
    name: '',
    level: 0,
    xp: 0,
    totalKills: 0,
    totalDeaths: 0,
    matchesPlayed: 0,
    timedModesCompleted: [],
    unlockedModes: ['TIME_FFA', 'ENDLESS_FFA'],
    unlockedWeapons: ['RIFLE'],
    unlockedHats: ['NONE'],
    unlockedGlasses: ['NONE'],
    unlockedColors: ['#ff4444'],
    color: '#ff4444',
    hat: 'NONE',
    glasses: 'NONE',
    badge: 'Rookie'
};

function getStoredValue(key) {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
}

function normalizeBaseUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) return '';
    try {
        const url = new URL(raw, window.location.href);
        url.hash = '';
        url.search = '';
        return url.toString();
    } catch {
        return '';
    }
}

function getConfiguredPublicUrl() {
    const sources = [
        globalThis.AGEN_PUBLIC_URL,
        import.meta.env?.VITE_PUBLIC_URL,
        getStoredValue(PUBLIC_URL_KEY)
    ];

    for (const source of sources) {
        const normalized = normalizeBaseUrl(source);
        if (normalized) return normalized;
    }

    return '';
}

function isPrivateOrLocalHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '[::1]' ||
        host.startsWith('192.168.') ||
        host.startsWith('10.') ||
        /^172\.(1[6-9]|2\d|3[0-1])\./.test(host);
}

function buildJoinUrl(baseUrl, id) {
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set('join', id);
    return url.toString();
}
const MODE_MULTIPLIERS = {
    TIME_FFA: 1,
    ENDLESS_FFA: 1,
    TIME_TDM: 1.1,
    ENDLESS_TDM: 1.1,
    TIME_SNIPER: 1.2,
    ENDLESS_SNIPER: 1.2,
    TIME_GUNGAME: 1.35
};
const LEVEL_REWARDS = {
    1: { type: 'weapon', key: 'PISTOL', label: 'Pistol' },
    2: { type: 'hat', key: 'CAP', label: 'Cap' },
    3: { type: 'mode', key: 'TIME_TDM', label: 'Timed TDM' },
    4: { type: 'weapon', key: 'DEAGLE', label: 'Deagle' },
    5: { type: 'glasses', key: 'SHADES', label: 'Shades' },
    6: { type: 'mode', key: 'TIME_SNIPER', label: 'Timed Sniper' },
    7: { type: 'weapon', key: 'SHOTGUN', label: 'Shotgun' },
    8: { type: 'hat', key: 'CROWN', label: 'Crown' },
    9: { type: 'mode', key: 'TIME_GUNGAME', label: 'Gun Game' },
    10: { type: 'weapon', key: 'SNIPER', label: 'Sniper' },
    11: { type: 'glasses', key: 'VISOR', label: 'Visor' },
    12: { type: 'weapon', key: 'GRENADE', label: 'Grenade Launcher' },
    13: { type: 'hat', key: 'HELMET', label: 'Helmet' },
    14: { type: 'weapon', key: 'SWORD', label: 'Sword' },
    15: { type: 'glasses', key: 'TACTICAL', label: 'Tactical Glasses' },
    16: { type: 'color', key: '#ff7a59', label: 'Ember Color' },
    17: { type: 'color', key: '#d9b26f', label: 'Brass Color' },
    18: { type: 'color', key: '#ffcc00', label: 'Gold Color' },
    19: { type: 'color', key: '#cc66ff', label: 'Violet Color' },
    20: { type: 'badge', key: 'Veteran', label: 'Veteran Badge' },
    21: { type: 'color', key: '#ffffff', label: 'White Color' },
    22: { type: 'color', key: '#111111', label: 'Shadow Color' },
    23: { type: 'badge', key: 'Elite', label: 'Elite Badge' },
    24: { type: 'color', key: '#f2f2f2', label: 'Chrome Color' },
    25: { type: 'badge', key: 'Legend', label: 'Legend Badge' }
};

class PracticeBotManager {
    constructor(game) {
        this.game = game;
        this.bots = [];
        this.raycaster = new Raycaster();
        this.tmpA = new Vector3();
        this.tmpB = new Vector3();
        this.tmpC = new Vector3();
        this.tmpBox = new Box3();
        this.spawnCursor = 0;
        this.botLooks = [
            { color: '#ff8844', hat: 'CAP', glasses: 'SHADES' },
            { color: '#d9b26f', hat: 'HELMET', glasses: 'TACTICAL' },
            { color: '#ff4d5e', hat: 'CROWN', glasses: 'VISOR' },
            { color: '#f2f2f2', hat: 'NONE', glasses: 'SHADES' },
            { color: '#ff7a59', hat: 'CAP', glasses: 'NONE' },
            { color: '#8f5c37', hat: 'HELMET', glasses: 'VISOR' }
        ];
    }

    start(count, difficultyKey) {
        this.clear();
        this.count = count;
        this.difficultyKey = BOT_DIFFICULTIES[difficultyKey] ? difficultyKey : 'NORMAL';
        for (let i = 0; i < count; i++) this.spawnBot(i);
    }

    clear() {
        this.bots.forEach(bot => {
            this.game.scene.remove(bot.group);
            bot.nameLabel?.remove();
            bot.healthBar?.remove();
            bot.group.traverse(child => {
                child.geometry?.dispose?.();
                child.material?.dispose?.();
            });
        });
        this.bots = [];
    }

    createBotGroup(bot) {
        const group = new Group();
        group.userData.botId = bot.id;
        group.visible = true;

        const body = new Mesh(
            new CapsuleGeometry(0.5, 1),
            new MeshStandardMaterial({ color: 0xff8844 })
        );
        body.userData.botId = bot.id;
        body.userData.part = 'body';
        group.add(body);

        const head = new Mesh(
            new BoxGeometry(0.4, 0.4, 0.4),
            new MeshStandardMaterial({ color: 0x2b211d })
        );
        head.position.set(0, 0.6, -0.2);
        head.userData.botId = bot.id;
        head.userData.part = 'head';
        group.add(head);

        const rifle = new Mesh(
            new BoxGeometry(0.12, 0.09, 0.72),
            new MeshStandardMaterial({ color: 0x16191d, emissive: 0xff8844, emissiveIntensity: 0.08 })
        );
        rifle.position.set(0.32, 0.22, -0.42);
        rifle.userData.botId = bot.id;
        rifle.userData.part = 'weapon';
        group.add(rifle);

        this.game.scene.add(group);
        this.updateBotAccessories(bot, group);
        return group;
    }

    updateBotAccessories(bot, group = bot.group) {
        if (!group) return;
        ['hatMesh', 'glassesMesh'].forEach(key => {
            if (group.userData[key]) {
                group.remove(group.userData[key]);
                group.userData[key].traverse?.(child => {
                    child.geometry?.dispose?.();
                    child.material?.dispose?.();
                });
                group.userData[key] = null;
            }
        });

        if (bot.hat && bot.hat !== 'NONE') {
            const hatGroup = new Group();
            hatGroup.userData.botId = bot.id;
            hatGroup.userData.part = 'accessory';
            if (bot.hat === 'CROWN') {
                const band = new Mesh(new CylinderGeometry(0.31, 0.31, 0.08, 6), new MeshStandardMaterial({ color: 0xffcc00 }));
                band.userData.botId = bot.id;
                hatGroup.add(band);
                for (let i = 0; i < 5; i++) {
                    const point = new Mesh(new ConeGeometry(0.07, 0.2, 4), new MeshStandardMaterial({ color: 0xffee66 }));
                    const angle = (i / 5) * Math.PI * 2;
                    point.position.set(Math.cos(angle) * 0.21, 0.13, Math.sin(angle) * 0.21);
                    point.userData.botId = bot.id;
                    hatGroup.add(point);
                }
            } else if (bot.hat === 'HELMET') {
                const dome = new Mesh(new CylinderGeometry(0.34, 0.27, 0.24, 16), new MeshStandardMaterial({ color: 0x666666 }));
                const visor = new Mesh(new BoxGeometry(0.46, 0.05, 0.16), new MeshStandardMaterial({ color: 0x202020 }));
                dome.userData.botId = bot.id;
                visor.userData.botId = bot.id;
                visor.position.set(0, -0.04, -0.28);
                hatGroup.add(dome, visor);
            } else {
                const cap = new Mesh(new CylinderGeometry(0.31, 0.28, 0.14, 16), new MeshStandardMaterial({ color: 0x111111 }));
                const brim = new Mesh(new BoxGeometry(0.5, 0.04, 0.18), new MeshStandardMaterial({ color: 0x050505 }));
                cap.userData.botId = bot.id;
                brim.userData.botId = bot.id;
                brim.position.set(0.12, -0.05, -0.24);
                hatGroup.add(cap, brim);
            }
            hatGroup.position.set(0, 0.93, -0.05);
            group.add(hatGroup);
            group.userData.hatMesh = hatGroup;
        }

        if (bot.glasses && bot.glasses !== 'NONE') {
            const glassesGroup = new Group();
            glassesGroup.userData.botId = bot.id;
            glassesGroup.userData.part = 'accessory';
            if (bot.glasses === 'VISOR') {
                const visor = new Mesh(new BoxGeometry(0.58, 0.12, 0.035), new MeshStandardMaterial({ color: 0xffb347, emissive: 0xff4d5e, emissiveIntensity: 0.25 }));
                visor.userData.botId = bot.id;
                glassesGroup.add(visor);
            } else if (bot.glasses === 'TACTICAL') {
                const left = new Mesh(new BoxGeometry(0.2, 0.1, 0.035), new MeshStandardMaterial({ color: 0x1a0505 }));
                const right = left.clone();
                const bridge = new Mesh(new BoxGeometry(0.12, 0.035, 0.035), new MeshStandardMaterial({ color: 0xff3333 }));
                left.position.x = -0.16;
                right.position.x = 0.16;
                [left, right, bridge].forEach(mesh => mesh.userData.botId = bot.id);
                glassesGroup.add(left, right, bridge);
            } else {
                const left = new Mesh(new TorusGeometry(0.1, 0.017, 6, 16), new MeshStandardMaterial({ color: 0x050505 }));
                const right = left.clone();
                const bridge = new Mesh(new BoxGeometry(0.12, 0.022, 0.022), new MeshStandardMaterial({ color: 0x050505 }));
                left.position.x = -0.15;
                right.position.x = 0.15;
                [left, right, bridge].forEach(mesh => mesh.userData.botId = bot.id);
                glassesGroup.add(left, right, bridge);
            }
            glassesGroup.position.set(0, 0.62, -0.44);
            group.add(glassesGroup);
            group.userData.glassesMesh = glassesGroup;
        }
    }

    spawnBot(index) {
        const look = this.botLooks[index % this.botLooks.length];
        const bot = {
            id: `bot-${index + 1}`,
            name: `Bot ${index + 1}`,
            color: look.color,
            hat: look.hat,
            glasses: look.glasses,
            health: 100,
            kills: 0,
            deaths: 0,
            alive: true,
            respawnTimer: 0,
            spawnProtection: 1.2,
            seenTimer: 0,
            nextFireAt: performance.now() + 600,
            waypointIndex: index,
            stuckTimer: 0,
            lastPosition: new Vector3(),
            strafeDir: index % 2 === 0 ? 1 : -1,
            strafeTimer: 0
        };
        bot.group = this.createBotGroup(bot);
        this.createBotOverlay(bot);
        this.placeBot(bot, index);
        this.bots.push(bot);
    }

    createBotOverlay(bot) {
        const nameLabel = document.createElement('div');
        nameLabel.className = 'player-name-label';
        nameLabel.innerText = bot.name;

        const healthBar = document.createElement('div');
        healthBar.className = 'health-bar-container';
        const healthFill = document.createElement('div');
        healthFill.className = 'health-bar-fill';
        healthBar.appendChild(healthFill);

        document.body.appendChild(nameLabel);
        document.body.appendChild(healthBar);
        bot.nameLabel = nameLabel;
        bot.healthBar = healthBar;
        bot.healthFill = healthFill;
        this.updateBotOverlay(bot);
    }

    placeBot(bot, index = 0) {
        const spawn = this.game.mapManager.getSpawnTransform(
            this.spawnCursor++ + index + 1,
            this.game.getSpawnAvoidPositions({ includePlayer: true, includeBots: true }),
            15
        );
        bot.group.position.set(spawn.x, 1, spawn.z);
        bot.group.rotation.y = spawn.yaw || 0;
        bot.lastPosition.copy(bot.group.position);
        bot.health = 100;
        bot.alive = true;
        bot.group.visible = true;
        if (bot.nameLabel) bot.nameLabel.style.display = 'none';
        if (bot.healthBar) bot.healthBar.style.display = 'none';
        bot.spawnProtection = 1.2;
        bot.respawnTimer = 0;
        bot.seenTimer = 0;
        bot.nextFireAt = performance.now() + 500;
        bot.waypointIndex = (index + Math.floor(Math.random() * this.game.mapManager.getWaypoints().length)) % this.game.mapManager.getWaypoints().length;
        this.applyBotStyle(bot);
    }

    applyBotStyle(bot) {
        const protectedColor = bot.spawnProtection > 0 ? 0xffee55 : (bot.color || '#ff8844');
        bot.group.traverse(child => {
            if (!child.isMesh || !child.material) return;
            if (child.userData.part === 'body') child.material.color.set(protectedColor);
            if (child.userData.part === 'head') child.material.color.set(0x2b211d);
        });
    }

    isBlockedAt(x, z, radius = 0.58) {
        if (x < -99 + radius || x > 99 - radius || z < -99 + radius || z > 99 - radius) return true;
        const meshes = this.game.mapManager?.meshes || [];
        for (const mesh of meshes) {
            if (!mesh?.userData?.mapObject) continue;
            this.tmpBox.setFromObject(mesh);
            if (this.tmpBox.max.y < 0.65) continue;
            if (
                x >= this.tmpBox.min.x - radius &&
                x <= this.tmpBox.max.x + radius &&
                z >= this.tmpBox.min.z - radius &&
                z <= this.tmpBox.max.z + radius
            ) {
                return true;
            }
        }
        return false;
    }

    hasWalkPath(from, to, radius = 0.58) {
        const dx = to.x - from.x;
        const dz = to.z - from.z;
        const distance = Math.hypot(dx, dz);
        if (distance < 0.001) return true;
        const steps = Math.max(1, Math.ceil(distance / 0.65));
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            if (this.isBlockedAt(from.x + dx * t, from.z + dz * t, radius)) return false;
        }
        return true;
    }

    getAliveBotPositions() {
        return this.bots
            .filter(bot => bot.alive)
            .map(bot => ({ x: bot.group.position.x, y: bot.group.position.y, z: bot.group.position.z }));
    }

    damageBotByObject(object, damage) {
        const bot = this.findBotByObject(object);
        if (!bot) return false;
        return this.damageBot(bot.id, damage);
    }

    damageBotInRadius(point, radius, damage) {
        let hit = false;
        this.bots.forEach(bot => {
            if (!bot.alive) return;
            if (bot.group.position.distanceTo(point) <= radius) {
                hit = this.damageBot(bot.id, damage) || hit;
            }
        });
        return hit;
    }

    findBotByObject(object) {
        let current = object;
        while (current) {
            if (current.userData?.botId) return this.bots.find(bot => bot.id === current.userData.botId) || null;
            current = current.parent;
        }
        return null;
    }

    damageBot(id, damage) {
        const bot = this.bots.find(item => item.id === id);
        if (!bot || !bot.alive || bot.spawnProtection > 0) return false;
        bot.health = Math.max(0, bot.health - damage);
        this.updateBotOverlay(bot);
        this.game.showHitMarker();
        this.game.weaponSystem.createImpactEffect(bot.group.position.clone().add(new Vector3(0, 0.55, 0)), 0xff3333, 0.08);
        if (bot.health <= 0) this.killBot(bot);
        return true;
    }

    killBot(bot) {
        bot.alive = false;
        bot.group.visible = false;
        if (bot.nameLabel) bot.nameLabel.style.display = 'none';
        if (bot.healthBar) bot.healthBar.style.display = 'none';
        bot.deaths++;
        bot.respawnTimer = 2.4;
        this.game.handleLocalKill(bot.id, { practice: true });
    }

    canSeePlayer(bot, playerPos) {
        if (!this.game.gameStarted || this.game.isDead) return false;
        const settings = BOT_DIFFICULTIES[this.difficultyKey];
        const origin = bot.group.position.clone().add(new Vector3(0, 0.75, 0));
        const target = new Vector3(playerPos.x, playerPos.y + 0.55, playerPos.z);
        if (!this.hasShotLine(origin, target)) return false;
        const toPlayer = target.clone().sub(origin);
        const distance = toPlayer.length();
        if (distance > settings.vision) return false;
        const dir = toPlayer.normalize();
        this.raycaster.set(origin, dir);
        this.raycaster.near = 0;
        this.raycaster.far = distance - 0.75;
        const blockers = this.raycaster.intersectObjects(this.game.mapManager.meshes, true);
        return blockers.length === 0;
    }

    hasShotLine(origin, target) {
        const distance = origin.distanceTo(target);
        if (distance <= 0.2) return true;
        const dir = target.clone().sub(origin).normalize();
        this.raycaster.set(origin, dir);
        this.raycaster.near = 0.18;
        this.raycaster.far = Math.max(0.2, distance - 0.18);
        return this.raycaster.intersectObjects(this.game.mapManager.meshes, true).length === 0;
    }

    chooseNextWaypoint(bot) {
        const waypoints = this.game.mapManager.getWaypoints();
        if (!waypoints.length) return;
        const current = waypoints[bot.waypointIndex % waypoints.length];
        let bestIndex = bot.waypointIndex;
        let bestScore = -Infinity;
        waypoints.forEach((point, index) => {
            if (index === bot.waypointIndex) return;
            if (!this.hasWalkPath(bot.group.position, point)) return;
            const dx = point.x - current.x;
            const dz = point.z - current.z;
            const distance = Math.sqrt(dx * dx + dz * dz);
            const score = distance + Math.random() * 28;
            if (score > bestScore) {
                bestScore = score;
                bestIndex = index;
            }
        });
        if (bestIndex === bot.waypointIndex) {
            waypoints.forEach((point, index) => {
                if (index !== bot.waypointIndex && !this.isBlockedAt(point.x, point.z)) bestIndex = index;
            });
        }
        bot.waypointIndex = bestIndex;
    }

    update(delta) {
        if (!this.game.isPracticeMode || !this.game.gameStarted) return;
        const settings = BOT_DIFFICULTIES[this.difficultyKey];
        const playerPos = this.game.playerBody.translation();
        const now = performance.now();

        this.bots.forEach((bot, index) => {
            if (!bot.alive) {
                bot.respawnTimer -= delta;
                if (bot.respawnTimer <= 0) this.placeBot(bot, index);
                return;
            }

            if (bot.spawnProtection > 0) {
                bot.spawnProtection = Math.max(0, bot.spawnProtection - delta);
                this.applyBotStyle(bot);
            }

            const seesPlayer = this.canSeePlayer(bot, playerPos);
            bot.seenTimer = seesPlayer ? bot.seenTimer + delta : 0;
            const moveTarget = this.getMoveTarget(bot, playerPos, seesPlayer);
            this.moveBot(bot, moveTarget, seesPlayer, settings, delta);

            if (seesPlayer && bot.seenTimer >= settings.reaction && now >= bot.nextFireAt) {
                this.fireAtPlayer(bot, settings, playerPos, now);
            }
        });
    }

    getMoveTarget(bot, playerPos, seesPlayer) {
        if (seesPlayer) {
            const distance = bot.group.position.distanceTo(new Vector3(playerPos.x, playerPos.y, playerPos.z));
            if (distance > 18) return playerPos;
            const waypoints = this.game.mapManager.getWaypoints();
            return waypoints[bot.waypointIndex % waypoints.length] || playerPos;
        }

        const waypoints = this.game.mapManager.getWaypoints();
        const target = waypoints[bot.waypointIndex % waypoints.length];
        if (!target) return playerPos;
        const flatDistance = Math.hypot(target.x - bot.group.position.x, target.z - bot.group.position.z);
        if (flatDistance < 2.2 || bot.stuckTimer > 1.1 || !this.hasWalkPath(bot.group.position, target)) {
            this.chooseNextWaypoint(bot);
            bot.stuckTimer = 0;
        }
        return waypoints[bot.waypointIndex % waypoints.length] || target;
    }

    moveBot(bot, target, seesPlayer, settings, delta) {
        this.tmpA.set(target.x - bot.group.position.x, 0, target.z - bot.group.position.z);
        if (this.tmpA.lengthSq() > 0.001) this.tmpA.normalize();

        if (settings.strafe && seesPlayer) {
            bot.strafeTimer -= delta;
            if (bot.strafeTimer <= 0) {
                bot.strafeTimer = 0.8 + Math.random() * 0.8;
                bot.strafeDir *= -1;
            }
            this.tmpB.set(-this.tmpA.z, 0, this.tmpA.x).multiplyScalar(0.55 * bot.strafeDir);
            this.tmpA.add(this.tmpB).normalize();
        }

        const step = settings.speed * delta;
        const nextX = bot.group.position.x + this.tmpA.x * step;
        const nextZ = bot.group.position.z + this.tmpA.z * step;
        if (!this.isBlockedAt(nextX, nextZ)) {
            bot.group.position.x = nextX;
            bot.group.position.z = nextZ;
        } else if (!this.isBlockedAt(nextX, bot.group.position.z)) {
            bot.group.position.x = nextX;
            bot.stuckTimer += delta * 0.5;
        } else if (!this.isBlockedAt(bot.group.position.x, nextZ)) {
            bot.group.position.z = nextZ;
            bot.stuckTimer += delta * 0.5;
        } else {
            bot.stuckTimer += delta;
            if (bot.stuckTimer > 0.35) this.chooseNextWaypoint(bot);
        }

        const moved = bot.group.position.distanceTo(bot.lastPosition);
        bot.stuckTimer = moved < 0.015 ? bot.stuckTimer + delta : 0;
        bot.lastPosition.copy(bot.group.position);

        const lookTarget = seesPlayer ? new Vector3(target.x, bot.group.position.y, target.z) : target;
        const yaw = Math.atan2(bot.group.position.x - lookTarget.x, bot.group.position.z - lookTarget.z);
        bot.group.rotation.y = MathUtils.lerp(bot.group.rotation.y, yaw, Math.min(1, delta * 8));
    }

    fireAtPlayer(bot, settings, playerPos, now) {
        bot.nextFireAt = now + settings.fireInterval * 1000 + Math.random() * 90;
        this.game.weaponSystem.playSound(170, 'square', 0.07, 0.035);

        const origin = bot.group.position.clone().add(new Vector3(0, 0.68, 0));
        const target = new Vector3(playerPos.x, playerPos.y + 0.55, playerPos.z);
        const aimYaw = Math.atan2(bot.group.position.x - target.x, bot.group.position.z - target.z);
        bot.group.rotation.y = aimYaw;
        if (!this.hasShotLine(origin, target)) {
            this.game.weaponSystem.createImpactEffect(origin.clone().lerp(target, 0.18), 0xff8844, 0.035);
            return;
        }
        const dir = target.clone().sub(origin).normalize();
        dir.x += (Math.random() - 0.5) * settings.accuracy;
        dir.y += (Math.random() - 0.5) * settings.accuracy * 0.55;
        dir.z += (Math.random() - 0.5) * settings.accuracy;
        dir.normalize();

        const distance = origin.distanceTo(target);
        this.raycaster.set(origin, dir);
        this.raycaster.near = 0.18;
        this.raycaster.far = Math.max(0.2, distance - 0.18);
        const blockers = this.raycaster.intersectObjects(this.game.mapManager.meshes, true);
        if (blockers.length) {
            this.game.weaponSystem.createImpactEffect(blockers[0].point, 0xff8844, 0.04);
            return;
        }

        const toPlayer = target.clone().sub(origin);
        const projected = Math.max(0, Math.min(distance, toPlayer.dot(dir)));
        const closest = origin.clone().add(dir.clone().multiplyScalar(projected));
        const hitRadius = this.game.isSliding ? 0.45 : 0.7;
        if (closest.distanceTo(target) <= hitRadius) {
            this.game.takeDamage(settings.damage, bot.id);
            this.game.weaponSystem.createImpactEffect(target, 0xff8844, 0.045);
        } else {
            this.game.weaponSystem.createImpactEffect(origin.clone().add(dir.multiplyScalar(Math.min(distance, 40))), 0xff8844, 0.035);
        }
    }

    updateBotOverlay(bot) {
        if (!bot?.healthFill) return;
        const health = Math.max(0, Math.min(100, bot.health || 0));
        bot.healthFill.style.width = `${health}%`;
        bot.healthFill.style.background = health > 55 ? '#ffb347' : health > 25 ? '#ffd166' : '#ff4d5e';
        if (bot.nameLabel) bot.nameLabel.innerText = `${bot.name} ${Math.round(health)}HP`;
    }

    updateOverlays() {
        this.bots.forEach(bot => {
            if (!bot.nameLabel || !bot.healthBar) return;
            if (!bot.alive || !bot.group.visible || this.game.targetedPlayerId !== bot.id) {
                bot.nameLabel.style.display = 'none';
                bot.healthBar.style.display = 'none';
                return;
            }

            this.tmpC.copy(bot.group.position).add(new Vector3(0, 1.35, 0));
            this.tmpC.project(this.game.camera);
            if (this.tmpC.z >= 1) {
                bot.nameLabel.style.display = 'none';
                bot.healthBar.style.display = 'none';
                return;
            }

            const x = (this.tmpC.x * 0.5 + 0.5) * window.innerWidth;
            const y = (-this.tmpC.y * 0.5 + 0.5) * window.innerHeight;
            bot.nameLabel.style.display = 'block';
            bot.healthBar.style.display = 'block';
            bot.nameLabel.style.left = `${x}px`;
            bot.nameLabel.style.top = `${y - 16}px`;
            bot.healthBar.style.left = `${x}px`;
            bot.healthBar.style.top = `${y}px`;
        });
    }
}

class Game {
    constructor() {
        window.gameInstance = this;
        window.startGame = () => this.startGame();
        this.scene = new Scene();
        this.camera = new PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.clock = new Clock();
        this.keys = {};
        this.isLocked = false;
        this.gameStarted = false;
        this.matchEnded = false;
        this.isDead = false;
        this.platform = 'PC';
        this.team = 'NONE';
        this.teamScores = { RED: 0, BLUE: 0 };
        this.spawnIndex = 0;
        this.timerInterval = null;
        this.matchEndTime = null;
        this.lobbyReady = false;
        this.lobbyChatMessages = [];
        this.profile = this.loadProfile();
        this.playerName = this.profile.name || localStorage.getItem('player_name') || `Player-${Math.floor(Math.random() * 9000 + 1000)}`;
        this.profile.name = this.playerName;
        this.saveProfile();
        this.normalSensitivity = Number(localStorage.getItem('normal_sensitivity') || 1);
        this.scopedSensitivity = Number(localStorage.getItem('scoped_sensitivity') || 0.55);
        this.mobileLayout = this.loadMobileLayout();
        this.savedMobileAimAssist = localStorage.getItem(MOBILE_AIM_ASSIST_KEY);
        this.mobileLayoutEditing = false;
        this.mobileActiveTouches = {
            joystick: null,
            fire: null,
            look: new Set(),
            buttons: new Map()
        };
        this.lastTouchPos = {};
        this.targetRaycaster = new Raycaster();
        this.aimAssistRaycaster = new Raycaster();
        this.aimAssistProjector = new Vector3();
        this.centerPoint = new Vector2(0, 0);
        this.targetedPlayerId = null;
        this.lastProfileSnapshot = null;
        this.achievementNoticeQueue = [];
        this.achievementNoticeActive = false;

        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.isPracticeMode = false;
        this.practiceBotCount = 5;
        this.practiceDifficulty = 'NORMAL';
        this.practiceXpPending = 0;
        this.gunGameLevel = 0;
        this.selectedMap = 'URBAN';
        this.selectedMode = 'ENDLESS_FFA';
        this.timeRemaining = 300;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.slideDirection = new Vector3(0, 0, -1);
        this.recoilPitch = 0;
        this.recoilYaw = 0;
        this.recoilRoll = 0;
        this.recoilShake = 0;

        this.keybinds = {
            forward: 'KeyW',
            backward: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            jump: 'Space',
            reload: 'KeyR',
            sprint: 'ShiftLeft',
            slide: 'KeyC'
        };

        this.initPhysics().then(() => {
            this.initLights();
            this.initPlayer();
            this.mapManager = new MapManager(this.scene, this.world);
            this.weaponSystem = new WeaponSystem(this.scene, this.camera);
            this.botManager = new PracticeBotManager(this);
            this.networkManager = null;
            if (new URLSearchParams(window.location.search).get('join')) this.ensureNetwork();
            this.setupEvents();
            this.initSettings();
            if (!this.networkManager) this.showMenuNotice('Offline menu ready. Choose multiplayer or practice.');
            this.updateHUDStats();
            this.animate();
        });
    }

    ensureNetwork() {
        if (!this.networkManager) this.networkManager = new NetworkManager(this);
        return this.networkManager;
    }

    onPlatformSelect(platform) {
        this.platform = platform;
        const menuNameInput = document.getElementById('menu-player-name-input');
        if (menuNameInput?.value.trim()) {
            this.playerName = menuNameInput.value.trim().slice(0, 16);
            this.profile.name = this.playerName;
            this.saveProfile();
        }
        document.getElementById('platform-screen').classList.remove('active');
        document.getElementById('mobile-controls').style.display = platform === 'MOBILE' ? 'block' : 'none';
        document.body.classList.toggle('mobile-platform', platform === 'MOBILE');
        this.applyMobileLayout();
        this.syncMobileSettingsUI();
        this.showMenuScreen('room-screen');
        this.ensureNetwork();
        this.renderLobbyRoom();
        if (this.networkManager?.isHost) this.networkManager.sendSettings();
    }

    openPracticeSetup() {
        const menuNameInput = document.getElementById('menu-player-name-input');
        if (menuNameInput?.value.trim()) {
            this.playerName = menuNameInput.value.trim().slice(0, 16);
            this.profile.name = this.playerName;
            this.saveProfile();
        }
        this.showMenuScreen('practice-screen');
        this.renderPracticeSetup();
        this.showMenuNotice('Practice is local-only. No PeerJS room is required.');
    }

    onPracticeOption(kind, value) {
        if (kind === 'map') this.selectedMap = value;
        if (kind === 'count') this.practiceBotCount = Number(value) || 5;
        if (kind === 'difficulty') this.practiceDifficulty = BOT_DIFFICULTIES[value] ? value : 'NORMAL';
        if (kind === 'platform') {
            this.platform = value === 'MOBILE' ? 'MOBILE' : 'PC';
            document.getElementById('mobile-controls').style.display = this.platform === 'MOBILE' ? 'block' : 'none';
            document.body.classList.toggle('mobile-platform', this.platform === 'MOBILE');
            this.applyMobileLayout();
            this.syncMobileSettingsUI();
        }
        this.renderPracticeSetup();
    }

    renderPracticeSetup() {
        document.querySelectorAll('[data-practice-map]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.practiceMap === this.selectedMap);
        });
        document.querySelectorAll('[data-practice-count]').forEach(btn => {
            btn.classList.toggle('selected', Number(btn.dataset.practiceCount) === this.practiceBotCount);
        });
        document.querySelectorAll('[data-practice-difficulty]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.practiceDifficulty === this.practiceDifficulty);
        });
        document.querySelectorAll('[data-practice-platform]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.practicePlatform === this.platform);
        });
        const summary = document.getElementById('practice-summary');
        if (summary) {
            summary.innerText = `${MAP_LABELS[this.selectedMap]} | ${this.practiceBotCount} bots | ${BOT_DIFFICULTIES[this.practiceDifficulty].label}`;
        }
    }

    startPractice() {
        if (this.gameStarted) return;
        this.isPracticeMode = true;
        this.gameStarted = true;
        this.matchEnded = false;
        this.isDead = false;
        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.practiceXpPending = 0;
        this.spawnIndex = 0;
        this.team = 'NONE';
        this.teamScores = { RED: 0, BLUE: 0 };
        this.selectedMode = 'PRACTICE';
        this.botManager.clear();
        this.mapManager.loadMap(this.selectedMap);
        this.applyModeRules();
        document.getElementById('menu-container').style.display = 'none';
        document.getElementById('timer').innerText = '';
        this.respawn(true);
        this.botManager.start(this.practiceBotCount, this.practiceDifficulty);
        this.updateHUDStats();
        this.showMenuNotice(`Practice: ${this.practiceBotCount} local bots on ${MAP_LABELS[this.selectedMap]}.`);
        if (this.platform === 'PC') this.renderer.domElement.requestPointerLock();
    }

    onMapSelect(map) {
        this.selectedMap = map;
        this.renderLobbyRoom();
        if (this.networkManager?.isHost) this.networkManager.sendSettings();
    }

    onModeSelect(mode) {
        if (!this.isModeUnlocked(mode)) {
            this.showMenuNotice('Mode locked. Level up and complete timed modes to unlock it.');
            return;
        }
        this.selectedMode = mode;
        this.renderLobbyRoom();
        if (this.networkManager?.isHost) this.networkManager.sendSettings();
    }

    startGame(fromNetwork = false) {
        if (this.gameStarted) return;
        if (!fromNetwork) this.ensureNetwork();
        this.isPracticeMode = false;
        this.botManager?.clear();
        if (this.selectedMode === 'PRACTICE') this.selectedMode = 'ENDLESS_FFA';
        if (!fromNetwork && this.networkManager && !this.networkManager.isHost) {
            this.showMenuNotice('Only the host can launch the room.');
            return;
        }
        if (!fromNetwork && this.networkManager?.isHost && !this.networkManager.canStartMatch()) {
            this.showMenuNotice('Waiting for every player to ready up.');
            return;
        }
        this.gameStarted = true;
        this.matchEnded = false;
        this.isDead = false;
        this.health = 100;
        this.teamScores = { RED: 0, BLUE: 0 };
        this.gunGameLevel = 0;
        this.timeRemaining = 300;
        if (!fromNetwork && this.networkManager?.isHost) {
            this.networkManager.rebalanceTeams();
        }
        this.mapManager.loadMap(this.selectedMap);
        this.applyModeRules();
        document.getElementById('menu-container').style.display = 'none';

        if (this.isTimedMode()) {
            if (!this.matchEndTime || (!fromNetwork && this.networkManager?.isHost)) {
                this.matchEndTime = Date.now() + 300000;
            }
            this.startTimer();
        } else {
            this.matchEndTime = null;
            document.getElementById('timer').innerText = '';
        }

        this.respawn(true);
        this.updateHUDStats();
        if (this.platform === 'PC') this.renderer.domElement.requestPointerLock();

        if (this.networkManager) {
            this.networkManager.sendStats();
            if (!fromNetwork && this.networkManager.isHost) this.networkManager.sendMatchStart();
        }
    }

    applyNetworkSettings(data) {
        if (data.map) this.selectedMap = data.map;
        if (data.mode) this.selectedMode = data.mode;
        if (data.matchEndTime) this.matchEndTime = data.matchEndTime;
        if (data.yourTeam) this.team = data.yourTeam;

        const info = document.getElementById('join-info');
        const btn = document.getElementById('join-btn');
        if (info) info.innerText = `Map: ${this.selectedMap} | Mode: ${MODE_LABELS[this.selectedMode] || this.selectedMode}`;
        if (btn) btn.style.display = 'inline-block';
        this.renderLobbyRoom();
        this.updateHUDStats();
    }

    showMenuScreen(id) {
        document.querySelectorAll('.menu-screen').forEach(screen => screen.classList.remove('active'));
        document.getElementById(id)?.classList.add('active');
    }

    leaveLobbyToMenu() {
        const nm = this.networkManager;
        if (nm) {
            Object.values(nm.connections || {}).forEach(conn => conn.close());
            Object.keys(nm.remotePlayerData || {}).forEach(id => nm.removeRemotePlayer(id));
            if (nm.peer && !nm.peer.destroyed) nm.peer.destroy();
            this.networkManager = null;
        }
        this.lobbyReady = false;
        this.lobbyChatMessages = [];
        this.team = 'NONE';
        window.history.replaceState({}, document.title, window.location.pathname);
        document.getElementById('mobile-controls').style.display = 'none';
        document.body.classList.remove('mobile-platform');
        this.showMenuScreen('platform-screen');
        this.showMenuNotice('Offline menu ready. Choose multiplayer or practice.');
        this.updateHUDStats();
    }

    getJoinUrl() {
        const id = this.networkManager?.hostId || this.networkManager?.myId || '';
        const baseUrl = getConfiguredPublicUrl() || `${window.location.origin}${window.location.pathname}`;
        return buildJoinUrl(baseUrl, id);
    }

    getShareLinkNote() {
        if (!this.networkManager?.myId) return '';
        if (getConfiguredPublicUrl()) return '';
        if (window.location.protocol === 'file:') {
            return 'This invite is local-only. Use the deployed HTTPS URL before sharing with friends.';
        }
        if (isPrivateOrLocalHost(window.location.hostname)) {
            return 'This invite points at your machine. Deploy it or set a public tunnel URL before sharing.';
        }
        if (!window.isSecureContext) {
            return 'Use an HTTPS URL for the most reliable browser-to-browser connections.';
        }
        return '';
    }

    async copyToClipboard(text, button, feedback, message) {
        const value = String(text || '');
        if (!value) return;
        const original = button?.innerText;
        try {
            await navigator.clipboard.writeText(value);
            if (feedback) feedback.innerText = message;
        } catch {
            if (feedback) feedback.innerText = value;
        }
        if (button) {
            button.classList.add('copied');
            button.innerText = 'Copied';
            setTimeout(() => {
                button.classList.remove('copied');
                button.innerText = original || 'Copy';
                if (feedback && feedback.innerText === message) feedback.innerText = '';
            }, 1800);
        }
    }

    getLobbyPlayers() {
        return this.networkManager?.getPlayerList() || [this.getLocalPlayerInfo()];
    }

    syncLocalProfileToNetwork() {
        if (!this.networkManager) return;
        this.networkManager.sendStats();
        if (this.networkManager.isHost) this.networkManager.broadcastPlayerList();
    }

    createMiniAvatar(player = {}) {
        const avatar = document.createElement('div');
        avatar.className = 'room-player-avatar mini-avatar';
        avatar.style.setProperty('--avatar-color', player.color || '#ff4444');

        const hat = document.createElement('div');
        hat.className = 'mini-avatar-hat';
        if (player.hat === 'CAP') hat.classList.add('cap');
        if (player.hat === 'CROWN') hat.classList.add('crown');
        if (player.hat === 'HELMET') hat.classList.add('helmet');

        const head = document.createElement('div');
        head.className = 'mini-avatar-head';
        const leftEye = document.createElement('div');
        leftEye.className = 'mini-avatar-eye left';
        const rightEye = document.createElement('div');
        rightEye.className = 'mini-avatar-eye right';
        const glasses = document.createElement('div');
        glasses.className = 'mini-avatar-glasses';
        if (player.glasses === 'SHADES') glasses.classList.add('shades');
        if (player.glasses === 'VISOR') glasses.classList.add('visor');
        if (player.glasses === 'TACTICAL') glasses.classList.add('tactical');
        const body = document.createElement('div');
        body.className = 'mini-avatar-body';

        avatar.append(hat, head, leftEye, rightEye, glasses, body);
        return avatar;
    }

    renderLobbyRoom() {
        const roomScreen = document.getElementById('room-screen');
        if (!roomScreen || this.gameStarted) return;

        const nm = this.networkManager;
        const isHost = !!nm?.isHost;
        const shareLink = document.getElementById('room-share-link');
        const copyRoomLink = document.getElementById('copy-room-link');
        const lobbyMeta = document.getElementById('room-meta');
        const playerList = document.getElementById('room-player-list');
        const readyBtn = document.getElementById('ready-btn');
        const startBtn = document.getElementById('host-start-btn');
        const hostControls = document.getElementById('host-controls');
        const guestNote = document.getElementById('guest-controls-note');
        const chatLog = document.getElementById('lobby-chat-log');
        const shareNote = document.getElementById('room-share-note');

        if (shareLink) shareLink.value = nm?.myId ? this.getJoinUrl() : 'Creating PeerJS room...';
        if (copyRoomLink) {
            copyRoomLink.disabled = !nm?.myId;
            copyRoomLink.title = nm?.myId ? 'Copy invite link' : 'Network is still creating the room';
        }
        if (shareNote) {
            const note = this.getShareLinkNote();
            shareNote.innerText = note;
            shareNote.style.display = note ? 'block' : 'none';
        }
        if (lobbyMeta) {
            const hostLabel = isHost ? 'Host room' : 'Joined room';
            const xpLabel = this.isEndlessMode() ? 'No XP' : 'XP enabled';
            lobbyMeta.innerText = `${hostLabel} | ${MAP_LABELS[this.selectedMap] || this.selectedMap} | ${MODE_LABELS[this.selectedMode] || this.selectedMode} | ${xpLabel}`;
        }

        document.querySelectorAll('[data-map-option]').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.mapOption === this.selectedMap);
            btn.disabled = !isHost;
        });
        document.querySelectorAll('[data-mode-option]').forEach(btn => {
            const mode = btn.dataset.modeOption;
            const unlocked = this.isModeUnlocked(mode);
            btn.classList.toggle('selected', mode === this.selectedMode);
            btn.classList.toggle('locked', !unlocked);
            btn.disabled = !isHost || !unlocked;
            btn.title = unlocked ? (mode.startsWith('ENDLESS') ? 'Endless modes do not award XP.' : 'Timed modes award XP.') : 'Locked by profile level/progress.';
        });

        if (hostControls) hostControls.classList.toggle('disabled-panel', !isHost);
        if (guestNote) guestNote.style.display = isHost ? 'none' : 'block';
        if (readyBtn) {
            readyBtn.classList.toggle('ready', this.lobbyReady);
            readyBtn.innerText = this.lobbyReady ? 'Ready' : 'Mark Ready';
        }
        if (startBtn) {
            startBtn.style.display = isHost ? 'inline-flex' : 'none';
            startBtn.disabled = !isHost || !nm?.canStartMatch();
            startBtn.title = startBtn.disabled ? 'All players must be ready' : 'Start synced match';
        }

        if (playerList) {
            playerList.innerHTML = '';
            this.getLobbyPlayers().forEach(player => {
                const row = document.createElement('div');
                row.className = `room-player ${player.ready ? 'is-ready' : ''}`;
                const avatar = this.createMiniAvatar(player);

                const body = document.createElement('div');
                body.className = 'room-player-body';
                const name = document.createElement('div');
                name.className = 'room-player-name';
                name.innerText = player.name || `Player ${String(player.id || '').slice(0, 4)}`;
                const sub = document.createElement('div');
                sub.className = 'room-player-sub';
                const hostTag = player.isHost ? 'Host' : 'Guest';
                const teamTag = this.isTeamMode() ? ` | ${player.team || 'Team pending'}` : '';
                sub.innerText = `${hostTag} | ${player.badge || 'Rookie'} L${player.level || 0}${teamTag}`;
                body.append(name, sub);

                const state = document.createElement('div');
                state.className = 'room-player-state';
                state.innerText = player.ready ? 'READY' : 'WAITING';

                row.append(avatar, body, state);
                if (isHost && !player.isHost && player.id) {
                    const kick = document.createElement('button');
                    kick.className = 'kick-btn';
                    kick.type = 'button';
                    kick.innerText = 'Kick';
                    kick.onclick = () => nm.kickPlayer(player.id);
                    row.appendChild(kick);
                }
                playerList.appendChild(row);
            });
        }

        if (chatLog) {
            chatLog.innerHTML = '';
            this.lobbyChatMessages.slice(-40).forEach(message => {
                const line = document.createElement('div');
                line.className = `chat-line ${message.system ? 'system' : ''}`;
                const name = document.createElement('span');
                name.className = 'chat-name';
                name.innerText = message.system ? 'Room' : (message.name || 'Player');
                const text = document.createElement('span');
                text.innerText = message.text || '';
                line.append(name, text);
                chatLog.appendChild(line);
            });
            chatLog.scrollTop = chatLog.scrollHeight;
        }
    }

    receiveLobbyChat(message) {
        this.lobbyChatMessages.push({
            name: String(message.name || 'Player').slice(0, 16),
            text: String(message.text || '').slice(0, 120),
            system: !!message.system,
            at: message.at || Date.now()
        });
        this.lobbyChatMessages = this.lobbyChatMessages.slice(-60);
        this.renderLobbyRoom();
    }

    setLobbyReady(value) {
        this.lobbyReady = !!value;
        if (this.networkManager) this.networkManager.sendLobbyReady(this.lobbyReady);
        this.renderLobbyRoom();
    }

    applyModeRules() {
        if (this.isSniperMode()) {
            this.weaponSystem.setAllowedWeapons(['SNIPER']);
        } else if (this.isGunGameMode()) {
            this.weaponSystem.setAllowedWeapons([GUNGAME_LADDER[this.gunGameLevel]]);
        } else {
            const weapons = ALL_WEAPONS.filter(key => this.profile.unlockedWeapons.includes(key));
            this.weaponSystem.setAllowedWeapons(weapons.length ? weapons : ['RIFLE']);
        }
    }

    isTimedMode() {
        return this.selectedMode.startsWith('TIME');
    }

    isEndlessMode() {
        return this.selectedMode.startsWith('ENDLESS');
    }

    isTeamMode() {
        return this.selectedMode.includes('TDM');
    }

    isSniperMode() {
        return this.selectedMode.includes('SNIPER');
    }

    isGunGameMode() {
        return this.selectedMode === 'TIME_GUNGAME';
    }

    loadProfile() {
        try {
            const parsed = JSON.parse(localStorage.getItem(PROFILE_KEY) || 'null');
            return this.normalizeProfile(parsed || {});
        } catch {
            return this.normalizeProfile({});
        }
    }

    normalizeProfile(profile) {
        const normalized = { ...DEFAULT_PROFILE, ...profile };
        ['timedModesCompleted', 'unlockedModes', 'unlockedWeapons', 'unlockedHats', 'unlockedGlasses', 'unlockedColors'].forEach(key => {
            normalized[key] = Array.from(new Set(Array.isArray(normalized[key]) ? normalized[key] : DEFAULT_PROFILE[key]));
        });
        normalized.level = Math.max(0, Math.min(MAX_LEVEL, Number(normalized.level) || 0));
        normalized.xp = Math.max(0, Number(normalized.xp) || 0);
        normalized.name = String(normalized.name || '').slice(0, 16);
        if (!normalized.unlockedModes.includes('TIME_FFA')) normalized.unlockedModes.push('TIME_FFA');
        if (!normalized.unlockedModes.includes('ENDLESS_FFA')) normalized.unlockedModes.push('ENDLESS_FFA');
        if (!normalized.unlockedWeapons.includes('RIFLE')) normalized.unlockedWeapons.push('RIFLE');
        if (!normalized.unlockedHats.includes('NONE')) normalized.unlockedHats.unshift('NONE');
        if (!normalized.unlockedGlasses.includes('NONE')) normalized.unlockedGlasses.unshift('NONE');
        if (!normalized.unlockedColors.includes(normalized.color)) normalized.unlockedColors.push(normalized.color);
        if (!normalized.unlockedHats.includes(normalized.hat)) normalized.hat = 'NONE';
        if (!normalized.unlockedGlasses.includes(normalized.glasses)) normalized.glasses = 'NONE';
        return normalized;
    }

    saveProfile() {
        localStorage.setItem(PROFILE_KEY, JSON.stringify(this.profile));
        localStorage.setItem('player_name', this.profile.name || this.playerName);
    }

    loadMobileLayout() {
        const cloneDefault = () => JSON.parse(JSON.stringify(DEFAULT_MOBILE_LAYOUT));
        try {
            const parsed = JSON.parse(localStorage.getItem(MOBILE_LAYOUT_KEY) || 'null');
            if (!parsed || typeof parsed !== 'object') return cloneDefault();
            const layout = cloneDefault();
            layout.size = Math.max(0.75, Math.min(1.35, Number(parsed.size) || layout.size));
            layout.opacity = Math.max(0.35, Math.min(1, Number(parsed.opacity) || layout.opacity));
            Object.keys(layout.controls).forEach(key => {
                const saved = parsed.controls?.[key];
                if (!saved) return;
                layout.controls[key].x = Math.max(0.02, Math.min(0.98, Number(saved.x) || layout.controls[key].x));
                layout.controls[key].y = Math.max(0.02, Math.min(0.98, Number(saved.y) || layout.controls[key].y));
            });
            return layout;
        } catch {
            return cloneDefault();
        }
    }

    saveMobileLayout() {
        localStorage.setItem(MOBILE_LAYOUT_KEY, JSON.stringify(this.mobileLayout));
    }

    resetMobileLayout() {
        this.mobileLayout = JSON.parse(JSON.stringify(DEFAULT_MOBILE_LAYOUT));
        this.saveMobileLayout();
        this.applyMobileLayout();
        this.syncMobileSettingsUI();
    }

    getMobileAimAssistMode() {
        if (this.savedMobileAimAssist === 'off' || this.savedMobileAimAssist === 'normal') {
            return this.savedMobileAimAssist;
        }
        return this.platform === 'MOBILE' ? 'normal' : 'off';
    }

    setMobileAimAssistMode(mode) {
        this.savedMobileAimAssist = mode === 'normal' ? 'normal' : 'off';
        localStorage.setItem(MOBILE_AIM_ASSIST_KEY, this.savedMobileAimAssist);
    }

    syncMobileSettingsUI() {
        const sizeInputs = [document.getElementById('mobile-size'), document.getElementById('layout-size')].filter(Boolean);
        const opacityInputs = [document.getElementById('mobile-opacity'), document.getElementById('layout-opacity')].filter(Boolean);
        const sizeValue = document.getElementById('mobile-size-value');
        const opacityValue = document.getElementById('mobile-opacity-value');
        sizeInputs.forEach(input => input.value = this.mobileLayout.size);
        opacityInputs.forEach(input => input.value = this.mobileLayout.opacity);
        if (sizeValue) sizeValue.innerText = this.mobileLayout.size.toFixed(2);
        if (opacityValue) opacityValue.innerText = this.mobileLayout.opacity.toFixed(2);
        const aimAssist = document.getElementById('mobile-aim-assist');
        if (aimAssist) aimAssist.value = this.getMobileAimAssistMode();
    }

    applyMobileLayout() {
        const viewportW = Math.max(1, window.innerWidth);
        const viewportH = Math.max(1, window.innerHeight);
        const pad = 8;
        Object.entries(MOBILE_CONTROL_ELEMENTS).forEach(([key, id]) => {
            const el = document.getElementById(id);
            const control = this.mobileLayout.controls[key];
            if (!el || !control) return;
            const isJoystick = key === 'joystick';
            const size = Math.round(control.base * this.mobileLayout.size);
            const centerX = Math.max(pad + size / 2, Math.min(viewportW - pad - size / 2, control.x * viewportW));
            const centerY = Math.max(pad + size / 2, Math.min(viewportH - pad - size / 2, control.y * viewportH));
            control.x = centerX / viewportW;
            control.y = centerY / viewportH;
            el.style.left = `${centerX - size / 2}px`;
            el.style.top = `${centerY - size / 2}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
            el.style.width = `${size}px`;
            el.style.height = `${size}px`;
            el.style.opacity = this.mobileLayout.opacity;
            if (!isJoystick) el.style.fontSize = `${Math.max(10, Math.round(size * 0.16))}px`;
            if (isJoystick) {
                const stick = document.getElementById('joystick-stick');
                if (stick) {
                    const stickSize = Math.round(size * 0.4);
                    stick.style.width = `${stickSize}px`;
                    stick.style.height = `${stickSize}px`;
                }
            }
        });
    }

    xpNeeded(level = this.profile.level) {
        return 100 + level * 60;
    }

    isModeUnlocked(mode) {
        if (mode === 'TIME_FFA' || mode === 'ENDLESS_FFA') return true;
        if (mode.startsWith('ENDLESS')) return ['TIME_FFA', 'TIME_TDM', 'TIME_SNIPER', 'TIME_GUNGAME'].every(m => this.profile.timedModesCompleted.includes(m));
        return this.profile.unlockedModes.includes(mode);
    }

    updateModeLocks() {
        Object.keys(MODE_LABELS).forEach(mode => {
            const btn = document.getElementById(`mode-${mode}`);
            if (!btn) return;
            const unlocked = this.isModeUnlocked(mode);
            btn.disabled = !unlocked;
            btn.classList.toggle('locked', !unlocked);
            btn.title = unlocked ? '' : 'Locked by profile level/progress';
        });
    }

    showMenuNotice(message) {
        if (this.gameStarted) return;
        const status = document.getElementById('network-status');
        if (status) status.innerText = message;
    }

    startTimer() {
        clearInterval(this.timerInterval);
        const timerEl = document.getElementById('timer');
        const tick = () => {
            const remainingMs = Math.max(0, (this.matchEndTime || Date.now()) - Date.now());
            this.timeRemaining = Math.ceil(remainingMs / 1000);
            const mins = Math.floor(this.timeRemaining / 60);
            const secs = this.timeRemaining % 60;
            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
            if (remainingMs <= 0) this.endMatch(true);
        };
        tick();
        this.timerInterval = setInterval(tick, 250);
    }

    endMatch(announce = true) {
        if (this.matchEnded) return;
        if (this.isPracticeMode) {
            this.endPractice();
            return;
        }
        this.matchEnded = true;
        this.gameStarted = false;
        this.isShooting = false;
        clearInterval(this.timerInterval);
        this.applyMatchProgress();
        this.showLeaderboard();
        if (announce && this.networkManager) this.networkManager.broadcast({ type: 'end-match' });
    }

    endPractice() {
        if (!this.isPracticeMode && !this.gameStarted) return;
        this.gameStarted = false;
        this.matchEnded = true;
        this.isPracticeMode = false;
        this.isShooting = false;
        this.isDead = false;
        clearInterval(this.timerInterval);
        if (document.pointerLockElement) document.exitPointerLock();
        document.getElementById('death-screen').style.display = 'none';
        document.getElementById('settings-modal').style.display = 'none';
        this.botManager?.clear();
        this.mapManager?.clear();
        this.applyPracticeProgress();
        this.selectedMode = 'ENDLESS_FFA';
        this.health = 100;
        this.spawnIndex = 0;
        this.updateHUDStats();
        document.getElementById('menu-container').style.display = 'flex';
        this.showMenuScreen('practice-screen');
        this.renderPracticeSetup();
        this.showMenuNotice('Practice ended. Multiplayer lobby remains separate.');
    }

    initSettings() {
        const modal = document.getElementById('settings-modal');
        const btn = document.getElementById('settings-btn');
        const list = document.getElementById('bind-list');
        const close = document.getElementById('close-settings');
        const endBtn = document.getElementById('end-game-btn');
        const endPracticeBtn = document.getElementById('end-practice-btn');
        const profileBtn = document.getElementById('profile-btn');
        const profileModal = document.getElementById('profile-modal');
        const closeProfile = document.getElementById('close-profile');
        const downloadProfile = document.getElementById('download-profile');
        const uploadProfile = document.getElementById('upload-profile');
        const deleteProfile = document.getElementById('delete-profile');
        const profileFile = document.getElementById('profile-file');
        const profileName = document.getElementById('profile-name');
        const profileColor = document.getElementById('profile-color');
        const profileHat = document.getElementById('profile-hat');
        const profileGlasses = document.getElementById('profile-glasses');
        const profileAvatar = document.getElementById('profile-avatar');
        const avatarHat = document.getElementById('avatar-hat');
        const avatarGlasses = document.getElementById('avatar-glasses');
        const profileLevelChip = document.getElementById('profile-level-chip');
        const profileKdChip = document.getElementById('profile-kd-chip');
        const accessoryPreview = document.getElementById('accessory-preview');
        const fullscreenBtn = document.getElementById('fullscreen-btn');
        const closeXp = document.getElementById('close-xp');
        const nameInput = document.getElementById('player-name-input');
        const normalSens = document.getElementById('normal-sens');
        const scopedSens = document.getElementById('scoped-sens');
        const normalValue = document.getElementById('normal-sens-value');
        const scopedValue = document.getElementById('scoped-sens-value');
        const mobileSize = document.getElementById('mobile-size');
        const mobileOpacity = document.getElementById('mobile-opacity');
        const mobileSizeValue = document.getElementById('mobile-size-value');
        const mobileOpacityValue = document.getElementById('mobile-opacity-value');
        const mobileAimAssist = document.getElementById('mobile-aim-assist');
        const editMobileLayout = document.getElementById('edit-mobile-layout');
        const resetMobileLayout = document.getElementById('reset-mobile-layout');
        const layoutSize = document.getElementById('layout-size');
        const layoutOpacity = document.getElementById('layout-opacity');
        const layoutSave = document.getElementById('layout-save');
        const layoutReset = document.getElementById('layout-reset');
        const menuNameInput = document.getElementById('menu-player-name-input');
        const lobbyName = document.getElementById('lobby-player-name');
        const lobbyMeta = document.getElementById('lobby-player-meta');
        const lobbyAvatar = document.getElementById('lobby-avatar');
        const lobbyHat = document.getElementById('lobby-avatar-hat');
        const lobbyGlasses = document.getElementById('lobby-avatar-glasses');
        const copyRoomLink = document.getElementById('copy-room-link');
        const roomCopyFeedback = document.getElementById('room-copy-feedback');
        const lobbyBackBtn = document.getElementById('lobby-back-btn');
        const readyBtn = document.getElementById('ready-btn');
        const startBtn = document.getElementById('host-start-btn');
        const lobbyChatInput = document.getElementById('lobby-chat-input');
        const lobbyChatSend = document.getElementById('lobby-chat-send');
        const practiceStart = document.getElementById('practice-start');
        const practiceBack = document.getElementById('practice-back');

        nameInput.value = this.playerName;
        if (menuNameInput) menuNameInput.value = this.playerName;
        normalSens.value = this.normalSensitivity;
        scopedSens.value = this.scopedSensitivity;
        normalValue.innerText = this.normalSensitivity.toFixed(2);
        scopedValue.innerText = this.scopedSensitivity.toFixed(2);
        this.applyMobileLayout();
        this.syncMobileSettingsUI();

        const renderLobby = () => {
            if (lobbyName) lobbyName.innerText = this.playerName || 'Player';
            if (lobbyMeta) lobbyMeta.innerText = `${this.profile.badge || 'Rookie'} | Level ${this.profile.level} | ${this.profile.xp}/${this.xpNeeded()} XP`;
            this.renderProfileAvatar(lobbyAvatar, lobbyHat, lobbyGlasses);
        };

        nameInput.oninput = () => {
            const cleaned = nameInput.value.trim().slice(0, 16);
            this.playerName = cleaned || 'Player';
            this.profile.name = this.playerName;
            if (menuNameInput) menuNameInput.value = this.playerName;
            this.saveProfile();
            renderLobby();
            this.syncLocalProfileToNetwork();
            this.renderLobbyRoom();
        };

        if (menuNameInput) {
            menuNameInput.oninput = () => {
                const cleaned = menuNameInput.value.trim().slice(0, 16);
                this.playerName = cleaned || 'Player';
                this.profile.name = this.playerName;
                nameInput.value = this.playerName;
                this.saveProfile();
                renderLobby();
                this.syncLocalProfileToNetwork();
                this.renderLobbyRoom();
            };
        }

        normalSens.oninput = () => {
            this.normalSensitivity = Number(normalSens.value);
            normalValue.innerText = this.normalSensitivity.toFixed(2);
            localStorage.setItem('normal_sensitivity', this.normalSensitivity);
        };

        scopedSens.oninput = () => {
            this.scopedSensitivity = Number(scopedSens.value);
            scopedValue.innerText = this.scopedSensitivity.toFixed(2);
            localStorage.setItem('scoped_sensitivity', this.scopedSensitivity);
        };

        const setMobileSize = (value) => {
            this.mobileLayout.size = Math.max(0.75, Math.min(1.35, Number(value) || 1));
            if (mobileSizeValue) mobileSizeValue.innerText = this.mobileLayout.size.toFixed(2);
            this.applyMobileLayout();
            this.saveMobileLayout();
            this.syncMobileSettingsUI();
        };
        const setMobileOpacity = (value) => {
            this.mobileLayout.opacity = Math.max(0.35, Math.min(1, Number(value) || 0.72));
            if (mobileOpacityValue) mobileOpacityValue.innerText = this.mobileLayout.opacity.toFixed(2);
            this.applyMobileLayout();
            this.saveMobileLayout();
            this.syncMobileSettingsUI();
        };
        if (mobileSize) mobileSize.oninput = () => setMobileSize(mobileSize.value);
        if (layoutSize) layoutSize.oninput = () => setMobileSize(layoutSize.value);
        if (mobileOpacity) mobileOpacity.oninput = () => setMobileOpacity(mobileOpacity.value);
        if (layoutOpacity) layoutOpacity.oninput = () => setMobileOpacity(layoutOpacity.value);
        if (mobileAimAssist) {
            mobileAimAssist.onchange = () => {
                this.setMobileAimAssistMode(mobileAimAssist.value);
                this.syncMobileSettingsUI();
            };
        }
        if (editMobileLayout) editMobileLayout.onclick = () => this.openMobileLayoutEditor();
        if (resetMobileLayout) resetMobileLayout.onclick = () => this.resetMobileLayout();
        if (layoutReset) layoutReset.onclick = () => this.resetMobileLayout();
        if (layoutSave) layoutSave.onclick = () => this.closeMobileLayoutEditor();

        btn.onclick = () => {
            modal.style.display = 'block';
            if (endPracticeBtn) endPracticeBtn.style.display = this.isPracticeMode ? 'block' : 'none';
            this.syncMobileSettingsUI();
            if (this.platform === 'PC') document.exitPointerLock();
        };

        close.onclick = () => {
            modal.style.display = 'none';
            if (this.mobileLayoutEditing) this.closeMobileLayoutEditor();
            if (this.gameStarted && !this.isDead && this.platform === 'PC') {
                this.renderer.domElement.requestPointerLock();
            }
        };

        endBtn.onclick = () => {
            window.history.replaceState({}, document.title, window.location.pathname);
            location.reload();
        };
        if (endPracticeBtn) {
            endPracticeBtn.onclick = () => this.endPractice();
        }

        const renderProfile = () => {
            document.getElementById('profile-summary').innerText = `${this.profile.badge || 'Rookie'} | Level ${this.profile.level} | ${this.profile.xp}/${this.xpNeeded()} XP`;
            profileName.value = this.playerName;
            profileColor.value = this.profile.color;
            const fillSelect = (select, values, labels) => {
                select.innerHTML = '';
                values.forEach(value => {
                    const option = document.createElement('option');
                    option.value = value;
                    option.innerText = labels[value] || value;
                    select.appendChild(option);
                });
            };
            fillSelect(profileHat, this.profile.unlockedHats, { NONE: 'No Hat', CAP: 'Cap', CROWN: 'Crown', HELMET: 'Helmet' });
            fillSelect(profileGlasses, this.profile.unlockedGlasses, { NONE: 'No Glasses', SHADES: 'Shades', VISOR: 'Visor', TACTICAL: 'Tactical' });
            profileHat.value = this.profile.hat;
            profileGlasses.value = this.profile.glasses;
            profileLevelChip.innerText = `${this.profile.level === 0 ? 'Rookie' : `Level ${this.profile.level}`} | ${this.profile.badge || 'Rookie'}`;
            profileKdChip.innerText = `K/D ${this.profile.totalKills}/${this.profile.totalDeaths}`;
            this.renderProfileAvatar(profileAvatar, avatarHat, avatarGlasses);
            this.renderAccessoryPreview(accessoryPreview);
        };

        const applyProfileControls = () => {
            this.playerName = profileName.value.trim().slice(0, 16) || 'Player';
            this.profile.name = this.playerName;
            this.profile.color = profileColor.value || this.profile.color || '#ff4444';
            if (!this.profile.unlockedColors.includes(this.profile.color)) this.profile.unlockedColors.push(this.profile.color);
            this.profile.hat = profileHat.value;
            this.profile.glasses = profileGlasses.value;
            nameInput.value = this.playerName;
            if (menuNameInput) menuNameInput.value = this.playerName;
            this.saveProfile();
            this.renderProfileAvatar(profileAvatar, avatarHat, avatarGlasses);
            this.syncLocalProfileToNetwork();
            this.renderAccessoryPreview(accessoryPreview);
            renderLobby();
            this.renderLobbyRoom();
        };

        [profileName, profileColor, profileHat, profileGlasses].forEach(input => input.oninput = applyProfileControls);

        this.openProfilePanel = () => {
            if (this.gameStarted) return;
            renderProfile();
            profileModal.style.display = 'block';
        };
        profileBtn.onclick = this.openProfilePanel;
        closeProfile.onclick = () => profileModal.style.display = 'none';
        closeXp.onclick = () => document.getElementById('xp-modal').style.display = 'none';
        fullscreenBtn.onclick = () => {
            if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen();
        };
        downloadProfile.onclick = () => {
            const blob = new Blob([JSON.stringify(this.profile, null, 2)], { type: 'application/json' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'agen-profile.json';
            a.click();
            URL.revokeObjectURL(a.href);
        };
        uploadProfile.onclick = () => profileFile.click();
        profileFile.onchange = () => {
            const file = profileFile.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                try {
                    this.profile = this.normalizeProfile(JSON.parse(reader.result));
                    this.playerName = this.profile.name || this.playerName;
                    this.saveProfile();
                    this.updateModeLocks();
                    renderProfile();
                    renderLobby();
                } catch {
                    this.showMenuNotice('Profile import failed.');
                }
            };
            reader.readAsText(file);
        };
        deleteProfile.onclick = () => {
            if (this.gameStarted) return;
            localStorage.removeItem(PROFILE_KEY);
            this.profile = this.normalizeProfile({ name: this.playerName });
            this.saveProfile();
            this.updateModeLocks();
            renderProfile();
            renderLobby();
            this.renderLobbyRoom();
        };

        document.querySelectorAll('[data-map-option]').forEach(btn => {
            btn.onclick = () => this.onMapSelect(btn.dataset.mapOption);
        });
        document.querySelectorAll('[data-mode-option]').forEach(btn => {
            btn.onclick = () => this.onModeSelect(btn.dataset.modeOption);
        });
        if (copyRoomLink) {
            copyRoomLink.onclick = () => this.copyToClipboard(this.getJoinUrl(), copyRoomLink, roomCopyFeedback, 'Share link copied.');
        }
        if (lobbyBackBtn) lobbyBackBtn.onclick = () => this.leaveLobbyToMenu();
        if (readyBtn) readyBtn.onclick = () => this.setLobbyReady(!this.lobbyReady);
        if (startBtn) startBtn.onclick = () => this.startGame();
        if (practiceStart) practiceStart.onclick = () => this.startPractice();
        if (practiceBack) practiceBack.onclick = () => {
            this.showMenuScreen('platform-screen');
            this.showMenuNotice('Offline menu ready. Choose multiplayer or practice.');
        };
        document.querySelectorAll('[data-practice-map]').forEach(btn => {
            btn.onclick = () => this.onPracticeOption('map', btn.dataset.practiceMap);
        });
        document.querySelectorAll('[data-practice-count]').forEach(btn => {
            btn.onclick = () => this.onPracticeOption('count', btn.dataset.practiceCount);
        });
        document.querySelectorAll('[data-practice-difficulty]').forEach(btn => {
            btn.onclick = () => this.onPracticeOption('difficulty', btn.dataset.practiceDifficulty);
        });
        document.querySelectorAll('[data-practice-platform]').forEach(btn => {
            btn.onclick = () => this.onPracticeOption('platform', btn.dataset.practicePlatform);
        });

        const sendLobbyChat = () => {
            const text = lobbyChatInput?.value.trim().slice(0, 120);
            if (!text) return;
            lobbyChatInput.value = '';
            this.networkManager?.sendLobbyChat(text);
        };
        if (lobbyChatSend) lobbyChatSend.onclick = sendLobbyChat;
        if (lobbyChatInput) {
            lobbyChatInput.onkeydown = (e) => {
                if (e.key === 'Enter') sendLobbyChat();
            };
        }

        const renderBinds = () => {
            list.innerHTML = '';
            Object.keys(this.keybinds).forEach(action => {
                const div = document.createElement('div');
                div.style.cssText = 'display:flex; justify-content:space-between; margin:10px 0; border-bottom:1px solid #333; padding-bottom:5px;';
                div.innerHTML = `<span>${action.toUpperCase()}</span> <button id="bind-${action}" style="padding:5px; min-width:80px; cursor:pointer;">${this.keybinds[action]}</button>`;
                list.appendChild(div);

                const bindBtn = div.querySelector('button');
                bindBtn.onclick = () => {
                    bindBtn.innerText = '...';
                    const listener = (e) => {
                        this.keybinds[action] = e.code;
                        renderBinds();
                        window.removeEventListener('keydown', listener);
                    };
                    window.addEventListener('keydown', listener);
                };
            });
        };
        renderBinds();
        this.updateModeLocks();
        renderLobby();
        this.renderLobbyRoom();
    }

    renderProfileAvatar(profileAvatar, avatarHat, avatarGlasses) {
        if (!profileAvatar || !avatarHat || !avatarGlasses) return;
        profileAvatar.style.setProperty('--avatar-color', this.profile.color || '#ff4444');
        avatarHat.className = 'avatar-hat';
        avatarGlasses.className = 'avatar-glasses';
        if (this.profile.hat === 'CAP') avatarHat.classList.add('cap');
        if (this.profile.hat === 'CROWN') avatarHat.classList.add('crown');
        if (this.profile.hat === 'HELMET') avatarHat.classList.add('helmet');
        if (this.profile.glasses === 'SHADES') avatarGlasses.classList.add('shades');
        if (this.profile.glasses === 'VISOR') avatarGlasses.classList.add('visor');
        if (this.profile.glasses === 'TACTICAL') avatarGlasses.classList.add('tactical');
    }

    renderAccessoryPreview(container) {
        if (!container) return;
        const items = [
            ...this.profile.unlockedHats.filter(item => item !== 'NONE').map(item => ({ type: 'hat', key: item })),
            ...this.profile.unlockedGlasses.filter(item => item !== 'NONE').map(item => ({ type: 'glasses', key: item }))
        ];
        const labels = { CAP: 'Cap', CROWN: 'Crown', HELMET: 'Helmet', SHADES: 'Shades', VISOR: 'Visor', TACTICAL: 'Tactical' };
        const shapeClasses = { CAP: 'mini-cap', CROWN: 'mini-crown', HELMET: 'mini-helmet', SHADES: 'mini-shades', VISOR: 'mini-visor', TACTICAL: 'mini-tactical' };
        container.innerHTML = '';
        if (items.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'accessory-tile';
            empty.innerText = 'Level up to unlock shapes';
            container.appendChild(empty);
            return;
        }
        items.forEach(item => {
            const tile = document.createElement('div');
            tile.className = 'accessory-tile';
            const shape = document.createElement('div');
            shape.className = `mini-shape ${shapeClasses[item.key] || ''}`;
            const label = document.createElement('div');
            label.innerText = labels[item.key] || item.key;
            tile.appendChild(shape);
            tile.appendChild(label);
            container.appendChild(tile);
        });
    }

    getLookSensitivity(input = 'mouse') {
        const base = input === 'touch' ? 0.005 : 0.0025;
        return base * (this.weaponSystem?.isZoomed ? this.scopedSensitivity : this.normalSensitivity);
    }

    async initPhysics() {
        await RAPIER.init();
        this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
    }

    initLights() {
        const ambient = new AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const sun = new DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        const hemi = new HemisphereLight(0xeeeeff, 0xaa9988, 0.5);
        this.scene.add(hemi);
    }

    initPlayer() {
        const radius = 0.5;
        const height = 1.0;
        const rigidBodyDesc = RAPIER.RigidBodyDesc.kinematicPositionBased()
            .setTranslation(0, 5, 0)
            .setCanSleep(false);
        this.playerBody = this.world.createRigidBody(rigidBodyDesc);

        const colliderDesc = RAPIER.ColliderDesc.capsule(height / 2, radius);
        this.playerCollider = this.world.createCollider(colliderDesc, this.playerBody);

        this.characterController = this.world.createCharacterController(0.01);
        this.characterController.setApplyImpulsesToDynamicBodies(true);
        this.characterController.enableAutostep(0.5, 0.2, true);
        this.characterController.enableSnapToGround(0.5);

        this.playerRotation = new Euler(0, 0, 0, 'YXZ');
        this.camera.position.set(0, 0.6, 0);
        this.scene.add(this.camera);
    }

    setupEvents() {
        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.renderer.domElement;
            if (!this.isLocked) {
                this.isShooting = false;
                this.weaponSystem.setZoom(false);
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isLocked || !this.gameStarted || this.platform !== 'PC') return;
            const sensitivity = this.getLookSensitivity('mouse');
            this.playerRotation.y -= e.movementX * sensitivity;
            this.playerRotation.x -= e.movementY * sensitivity;
            this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
        });

        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Space') e.preventDefault();
            if (e.code === this.keybinds.slide) e.preventDefault();
            if (e.code === 'Backquote') {
                if (document.pointerLockElement === this.renderer.domElement) {
                    document.exitPointerLock();
                } else if (this.gameStarted && this.platform === 'PC') {
                    this.renderer.domElement.requestPointerLock();
                }
            }
            if (e.code.startsWith('Digit')) {
                const slot = Number(e.code.replace('Digit', '')) - 1;
                if (slot >= 0) this.weaponSystem.switchByIndex(slot);
            }
            if (e.code === this.keybinds.reload) this.weaponSystem.reload();
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        window.addEventListener('mousedown', (e) => {
            if (e.button === 2) e.preventDefault();
            if (this.gameStarted && !this.isLocked && this.platform === 'PC' && e.target === this.renderer.domElement) {
                this.renderer.domElement.requestPointerLock();
                return;
            }
            if (!this.gameStarted || this.isDead) return;
            if (this.platform === 'PC' && !this.isLocked) return;
            if (e.button === 0) this.isShooting = true;
            if (e.button === 2) this.weaponSystem.setZoom(true);
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isShooting = false;
            if (e.button === 2) this.weaponSystem.setZoom(false);
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
            this.applyMobileLayout();
        });

        window.addEventListener('wheel', (e) => {
            if (this.platform === 'PC' && !this.isLocked) return;
            e.preventDefault();
            this.weaponSystem.cycleWeapon(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        this.setupMobileEvents();
        this.setupMobileLayoutEditor();
    }

    openMobileLayoutEditor() {
        document.getElementById('mobile-controls').style.display = 'block';
        this.mobileLayoutEditing = true;
        this.isShooting = false;
        this.clearMobileTouches();
        this.applyMobileLayout();
        this.syncMobileSettingsUI();
        document.body.classList.add('mobile-layout-editing');
        const editor = document.getElementById('mobile-layout-editor');
        if (editor) editor.style.display = 'block';
    }

    closeMobileLayoutEditor() {
        this.mobileLayoutEditing = false;
        document.body.classList.remove('mobile-layout-editing');
        const editor = document.getElementById('mobile-layout-editor');
        if (editor) editor.style.display = 'none';
        this.saveMobileLayout();
        this.applyMobileLayout();
        document.getElementById('mobile-controls').style.display = this.platform === 'MOBILE' ? 'block' : 'none';
    }

    setupMobileLayoutEditor() {
        const controls = document.getElementById('mobile-controls');
        if (!controls) return;
        let drag = null;
        const label = document.getElementById('layout-selected');
        const setLabel = (key) => {
            if (label) label.innerText = key ? `Moving ${key.toUpperCase()}` : 'Drag a control to move it.';
        };

        controls.addEventListener('pointerdown', (e) => {
            if (!this.mobileLayoutEditing) return;
            const el = e.target.closest('[data-mobile-control]');
            if (!el) return;
            e.preventDefault();
            const key = el.dataset.mobileControl;
            if (!this.mobileLayout.controls[key]) return;
            drag = { key, pointerId: e.pointerId };
            el.setPointerCapture?.(e.pointerId);
            setLabel(key);
        });

        controls.addEventListener('pointermove', (e) => {
            if (!this.mobileLayoutEditing || !drag || e.pointerId !== drag.pointerId) return;
            e.preventDefault();
            const control = this.mobileLayout.controls[drag.key];
            const size = control.base * this.mobileLayout.size;
            const padX = (size / 2 + 8) / Math.max(1, window.innerWidth);
            const padY = (size / 2 + 8) / Math.max(1, window.innerHeight);
            control.x = Math.max(padX, Math.min(1 - padX, e.clientX / Math.max(1, window.innerWidth)));
            control.y = Math.max(padY, Math.min(1 - padY, e.clientY / Math.max(1, window.innerHeight)));
            this.applyMobileLayout();
        });

        const stopDrag = (e) => {
            if (!drag || e.pointerId !== drag.pointerId) return;
            e.preventDefault();
            drag = null;
            setLabel(null);
            this.saveMobileLayout();
        };
        controls.addEventListener('pointerup', stopDrag);
        controls.addEventListener('pointercancel', stopDrag);
    }

    clearMobileTouches() {
        this.mobileActiveTouches.joystick = null;
        this.mobileActiveTouches.fire = null;
        this.mobileActiveTouches.look.clear();
        this.mobileActiveTouches.buttons.clear();
        this.lastTouchPos = {};
        this.isShooting = false;
        this.keys[this.keybinds.forward] = false;
        this.keys[this.keybinds.backward] = false;
        this.keys[this.keybinds.left] = false;
        this.keys[this.keybinds.right] = false;
    }

    setupMobileEvents() {
        const joyContainer = document.getElementById('joystick-container');
        const joyStick = document.getElementById('joystick-stick');
        let joyStart = { x: 0, y: 0 };
        const touchOptions = { passive: false };

        const clearJoystick = () => {
            this.mobileActiveTouches.joystick = null;
            joyStick.style.transform = 'translate(-50%, -50%)';
            this.keys[this.keybinds.forward] = false;
            this.keys[this.keybinds.backward] = false;
            this.keys[this.keybinds.left] = false;
            this.keys[this.keybinds.right] = false;
        };

        joyContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            if (this.mobileLayoutEditing) return;
            const touch = e.changedTouches[0];
            this.mobileActiveTouches.joystick = touch.identifier;
            joyStart = { x: touch.clientX, y: touch.clientY };
        }, touchOptions);

        window.addEventListener('touchstart', (e) => {
            if (this.mobileLayoutEditing) {
                e.preventDefault();
                return;
            }
            if (!this.gameStarted || this.platform !== 'MOBILE') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target?.closest('.mobile-btn') || target?.closest('#joystick-container')) continue;
                if (touch.clientX > window.innerWidth * 0.28) {
                    this.mobileActiveTouches.look.add(touch.identifier);
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, touchOptions);

        window.addEventListener('touchmove', (e) => {
            if (this.mobileLayoutEditing) {
                e.preventDefault();
                return;
            }
            if (!this.gameStarted || this.platform !== 'MOBILE') return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.mobileActiveTouches.joystick) {
                    const dx = touch.clientX - joyStart.x;
                    const dy = touch.clientY - joyStart.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const maxDist = Math.max(42, 50 * this.mobileLayout.size);
                    const angle = Math.atan2(dy, dx);
                    const moveX = Math.cos(angle) * Math.min(dist, maxDist);
                    const moveY = Math.sin(angle) * Math.min(dist, maxDist);
                    joyStick.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
                    this.keys[this.keybinds.forward] = dy < -20;
                    this.keys[this.keybinds.backward] = dy > 20;
                    this.keys[this.keybinds.left] = dx < -20;
                    this.keys[this.keybinds.right] = dx > 20;
                    continue;
                }

                if (this.lastTouchPos[touch.identifier]) {
                    this.applyTouchLook(touch.clientX - this.lastTouchPos[touch.identifier].x, touch.clientY - this.lastTouchPos[touch.identifier].y);
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, touchOptions);

        const endTouch = (e) => {
            if (this.mobileLayoutEditing) return;
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.mobileActiveTouches.joystick) clearJoystick();
                if (touch.identifier === this.mobileActiveTouches.fire) {
                    this.mobileActiveTouches.fire = null;
                    this.isShooting = false;
                }
                const buttonId = this.mobileActiveTouches.buttons.get(touch.identifier);
                if (buttonId === 'btn-jump') this.keys[this.keybinds.jump] = false;
                this.mobileActiveTouches.buttons.delete(touch.identifier);
                this.mobileActiveTouches.look.delete(touch.identifier);
                delete this.lastTouchPos[touch.identifier];
            }
        };
        window.addEventListener('touchend', endTouch, touchOptions);
        window.addEventListener('touchcancel', endTouch, touchOptions);

        window.addEventListener('touchmove', (e) => {
            if (this.gameStarted && this.platform === 'MOBILE') e.preventDefault();
        }, touchOptions);
        document.addEventListener('gesturestart', (e) => e.preventDefault());

        const bindTouchButton = (id, start, end = null, options = {}) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                if (this.mobileLayoutEditing) return;
                const touch = e.changedTouches[0];
                this.mobileActiveTouches.buttons.set(touch.identifier, id);
                if (options.lookWhileHeld) {
                    this.mobileActiveTouches.fire = touch.identifier;
                    this.mobileActiveTouches.look.add(touch.identifier);
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
                start(touch);
            }, touchOptions);
            if (end) {
                el.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    if (this.mobileLayoutEditing) return;
                    for (const touch of e.changedTouches) {
                        if (this.mobileActiveTouches.buttons.get(touch.identifier) !== id) continue;
                        if (options.lookWhileHeld) {
                            this.mobileActiveTouches.fire = null;
                            this.mobileActiveTouches.look.delete(touch.identifier);
                            delete this.lastTouchPos[touch.identifier];
                        }
                        this.mobileActiveTouches.buttons.delete(touch.identifier);
                        end(touch);
                    }
                }, touchOptions);
                el.addEventListener('touchcancel', (e) => {
                    e.preventDefault();
                    if (this.mobileLayoutEditing) return;
                    for (const touch of e.changedTouches) {
                        if (this.mobileActiveTouches.buttons.get(touch.identifier) !== id) continue;
                        if (options.lookWhileHeld) {
                            this.mobileActiveTouches.fire = null;
                            this.mobileActiveTouches.look.delete(touch.identifier);
                            delete this.lastTouchPos[touch.identifier];
                        }
                        this.mobileActiveTouches.buttons.delete(touch.identifier);
                        end(touch);
                    }
                }, touchOptions);
            }
        };

        bindTouchButton('btn-shoot', () => this.isShooting = true, () => this.isShooting = false, { lookWhileHeld: true });
        bindTouchButton('btn-jump', () => this.keys[this.keybinds.jump] = true, () => this.keys[this.keybinds.jump] = false);
        bindTouchButton('btn-reload', () => this.weaponSystem.reload());
        bindTouchButton('btn-scope', () => this.weaponSystem.setZoom(!this.weaponSystem.isZoomed));
        bindTouchButton('btn-switch', () => this.weaponSystem.cycleWeapon(1));
        bindTouchButton('btn-slide', () => this.slideRequested = true);
    }

    applyTouchLook(movementX, movementY) {
        const sensitivity = this.getLookSensitivity('touch');
        this.playerRotation.y -= movementX * sensitivity;
        this.playerRotation.x -= movementY * sensitivity;
        this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
    }

    wrapAngle(angle) {
        return Math.atan2(Math.sin(angle), Math.cos(angle));
    }

    hasLineOfSightToTarget(targetId, targetPoint, distance) {
        const nm = this.networkManager;
        const group = nm?.remotePlayers[targetId];
        if (!group) return false;
        const origin = new Vector3();
        this.camera.getWorldPosition(origin);
        const direction = targetPoint.clone().sub(origin).normalize();
        this.aimAssistRaycaster.set(origin, direction);
        this.aimAssistRaycaster.far = distance + 0.25;
        const hits = this.aimAssistRaycaster.intersectObjects(this.scene.children, true);
        if (!hits.length) return true;
        for (const hit of hits) {
            let node = hit.object;
            let isViewModel = false;
            while (node) {
                if (node === this.camera) {
                    isViewModel = true;
                    break;
                }
                node = node.parent;
            }
            if (isViewModel) continue;
            let belongsToTarget = false;
            group.traverse(child => {
                if (child === hit.object) belongsToTarget = true;
            });
            if (belongsToTarget) return true;
            if (hit.distance < distance - 0.35) return false;
        }
        return true;
    }

    findMobileAimAssistTarget() {
        const nm = this.networkManager;
        if (!nm) return null;
        const origin = new Vector3();
        this.camera.getWorldPosition(origin);
        let best = null;
        Object.entries(nm.remotePlayers).forEach(([id, group]) => {
            if (!group.visible || !this.canDamagePlayer(id)) return;
            const data = nm.remotePlayerData[id];
            if ((data?.health ?? 100) <= 0) return;
            const target = group.position.clone().add(new Vector3(0, 0.55, 0));
            const distance = target.distanceTo(origin);
            if (distance > 55) return;
            this.aimAssistProjector.copy(target).project(this.camera);
            if (this.aimAssistProjector.z < -1 || this.aimAssistProjector.z > 1) return;
            const screenDistance = Math.hypot(this.aimAssistProjector.x, this.aimAssistProjector.y);
            const radius = this.weaponSystem?.isZoomed ? 0.22 : 0.16;
            if (screenDistance > radius) return;
            if (!this.hasLineOfSightToTarget(id, target, distance)) return;
            const score = screenDistance + distance * 0.002;
            if (!best || score < best.score) best = { id, target, distance, screenDistance, radius, score };
        });
        return best;
    }

    applyMobileAimAssist(delta) {
        if (this.platform !== 'MOBILE' || this.getMobileAimAssistMode() !== 'normal') return;
        if (!this.gameStarted || this.isDead || this.mobileLayoutEditing) return;
        const hasTouchLook = this.mobileActiveTouches.look.size > 0;
        if (!hasTouchLook && !this.isShooting) return;
        const target = this.findMobileAimAssistTarget();
        if (!target) return;

        const origin = new Vector3();
        this.camera.getWorldPosition(origin);
        const direction = target.target.clone().sub(origin).normalize();
        const desiredYaw = Math.atan2(-direction.x, -direction.z);
        const desiredPitch = Math.asin(Math.max(-1, Math.min(1, direction.y)));
        const closeness = 1 - Math.min(1, target.screenDistance / target.radius);
        const assist = Math.min(1, delta * 4.5) * (0.16 + closeness * 0.22);
        this.playerRotation.y += this.wrapAngle(desiredYaw - this.playerRotation.y) * assist;
        this.playerRotation.x += (desiredPitch - this.playerRotation.x) * assist;
        this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
    }

    tryStartSlide(movementInput, fallbackForward) {
        if (!this.gameStarted || this.isDead || this.isSliding || this.slideCooldown > 0 || !this.onGround) return;
        if (!movementInput || movementInput.lengthSq() < 0.001) return;
        this.isSliding = true;
        this.slideTimer = 0.6;
        this.slideCooldown = 1.0;
        this.slideDirection.copy(movementInput.lengthSq() > 0 ? movementInput : fallbackForward).normalize();
        this.weaponSystem.playSound(90, 'sawtooth', 0.12, 0.05);
    }

    addRecoilShake(weaponData = {}) {
        const weaponKey = this.weaponSystem?.currentWeaponKey || 'RIFLE';
        const profiles = {
            PISTOL: { pitch: 0.006, yaw: 0.003, roll: 0.003, shake: 0.0018, vibration: 10 },
            RIFLE: { pitch: 0.0045, yaw: 0.0025, roll: 0.002, shake: 0.0015, vibration: 8 },
            DEAGLE: { pitch: 0.011, yaw: 0.005, roll: 0.005, shake: 0.0028, vibration: 16 },
            SHOTGUN: { pitch: 0.015, yaw: 0.007, roll: 0.006, shake: 0.004, vibration: 24 },
            SNIPER: { pitch: 0.018, yaw: 0.006, roll: 0.007, shake: 0.0045, vibration: 28 },
            GRENADE: { pitch: 0.013, yaw: 0.006, roll: 0.006, shake: 0.0035, vibration: 22 },
            SWORD: { pitch: 0.003, yaw: 0.002, roll: 0.002, shake: 0.001, vibration: 6 }
        };
        const profile = profiles[weaponKey] || profiles.RIFLE;
        const zoomScale = this.weaponSystem?.isZoomed ? 0.55 : 1;
        const fireScale = weaponData.pellets ? 1.15 : 1;

        this.recoilPitch = Math.min(0.035, this.recoilPitch + profile.pitch * zoomScale * fireScale);
        this.recoilYaw += (Math.random() - 0.5) * profile.yaw * zoomScale;
        this.recoilRoll += (Math.random() - 0.5) * profile.roll * zoomScale;
        this.recoilShake = Math.min(0.009, this.recoilShake + profile.shake * zoomScale);

        if (this.platform === 'MOBILE' && navigator.vibrate) navigator.vibrate(profile.vibration);
    }

    applyCameraRecoil(delta) {
        if (!this.recoilPitch && !this.recoilYaw && !this.recoilRoll && !this.recoilShake) return;

        const time = performance.now() / 1000;
        const jitterPitch = Math.sin(time * 88) * this.recoilShake;
        const jitterYaw = Math.sin(time * 103) * this.recoilShake * 0.45;
        const jitterRoll = Math.sin(time * 73) * this.recoilShake * 0.75;
        const recoilRotation = new Quaternion().setFromEuler(new Euler(
            -this.recoilPitch + jitterPitch,
            this.recoilYaw + jitterYaw,
            this.recoilRoll + jitterRoll,
            'YXZ'
        ));

        this.camera.quaternion.multiply(recoilRotation);
        const decay = Math.min(1, delta * 14);
        this.recoilPitch = MathUtils.lerp(this.recoilPitch, 0, decay);
        this.recoilYaw = MathUtils.lerp(this.recoilYaw, 0, decay);
        this.recoilRoll = MathUtils.lerp(this.recoilRoll, 0, decay);
        this.recoilShake = MathUtils.lerp(this.recoilShake, 0, Math.min(1, delta * 18));
    }

    updatePlayer(delta) {
        if (!this.gameStarted) return;

        this.applyMobileAimAssist(delta);

        if (this.isShooting) {
            const hitPoint = this.weaponSystem.shoot();
            if (hitPoint && this.networkManager && !this.isPracticeMode) this.networkManager.sendShoot(hitPoint);
            if (WEAPON_DATA[this.weaponSystem.currentWeaponKey].fireRate > 0.5 && this.platform === 'MOBILE') {
                this.isShooting = false;
            }
        }

        const isMoving = this.keys[this.keybinds.forward] || this.keys[this.keybinds.backward] ||
                         this.keys[this.keybinds.left] || this.keys[this.keybinds.right];
        this.weaponSystem.update(delta, performance.now() / 1000, isMoving);
        if (this.slideCooldown > 0) this.slideCooldown = Math.max(0, this.slideCooldown - delta);
        if (this.isSliding) {
            this.slideTimer -= delta;
            if (this.slideTimer <= 0 || !this.onGround) this.isSliding = false;
        }

        const isSprinting = this.keys[this.keybinds.sprint] || this.keys.ShiftRight;
        const speed = isSprinting ? 8 : 4;
        const movement = new Vector3(0, 0, 0);
        const forward = new Vector3(0, 0, -1).applyQuaternion(new Quaternion().setFromEuler(new Euler(0, this.playerRotation.y, 0)));
        const right = new Vector3(1, 0, 0).applyQuaternion(new Quaternion().setFromEuler(new Euler(0, this.playerRotation.y, 0)));

        if (this.keys[this.keybinds.forward]) movement.add(forward);
        if (this.keys[this.keybinds.backward]) movement.sub(forward);
        if (this.keys[this.keybinds.left]) movement.sub(right);
        if (this.keys[this.keybinds.right]) movement.add(right);

        const wantsSlide = this.keys[this.keybinds.slide] || this.slideRequested;
        if (wantsSlide) this.tryStartSlide(movement, forward);
        this.slideRequested = false;

        if (this.isSliding) {
            const slideProgress = Math.max(0, this.slideTimer / 0.6);
            movement.copy(this.slideDirection).multiplyScalar((7 + slideProgress * 5) * delta);
        } else {
            movement.normalize().multiplyScalar(speed * delta);
        }

        this.verticalVelocity = (this.verticalVelocity || 0) - 9.81 * delta;
        if (this.keys[this.keybinds.jump] && this.onGround) {
            this.verticalVelocity = 5;
            this.weaponSystem.playJumpSound();
            this.onGround = false;
        }
        movement.y = this.verticalVelocity * delta;

        this.characterController.computeColliderMovement(this.playerCollider, movement);
        const correctedMovement = this.characterController.computedMovement();

        if (this.onGround && isMoving) {
            this.footstepTimer = (this.footstepTimer || 0) + delta;
            const stepInterval = isSprinting ? 0.3 : 0.5;
            if (this.footstepTimer > stepInterval) {
                this.weaponSystem.playFootstepSound();
                this.footstepTimer = 0;
            }
        }

        const currentPos = this.playerBody.translation();
        const nextPos = {
            x: currentPos.x + correctedMovement.x,
            y: currentPos.y + correctedMovement.y,
            z: currentPos.z + correctedMovement.z
        };
        this.playerBody.setNextKinematicTranslation(nextPos);
        if (this.networkManager && !this.isPracticeMode) this.networkManager.sendUpdate(nextPos, this.playerRotation.y);

        this.onGround = this.characterController.computedGrounded();
        if (this.onGround) this.verticalVelocity = Math.max(0, this.verticalVelocity);

        const cameraHeight = this.isSliding ? 0.32 : 0.6;
        this.camera.position.set(nextPos.x, nextPos.y + cameraHeight, nextPos.z);
        this.camera.quaternion.setFromEuler(this.playerRotation);
        this.applyCameraRecoil(delta);
    }

    canDamagePlayer(targetId) {
        if (!this.isTeamMode()) return true;
        const targetTeam = this.networkManager?.remotePlayerData[targetId]?.team;
        return !targetTeam || targetTeam !== this.team;
    }

    canTakeDamageFrom(attackerId) {
        if (!this.isTeamMode()) return true;
        const attackerTeam = this.networkManager?.remotePlayerData[attackerId]?.team;
        return !attackerTeam || attackerTeam !== this.team;
    }

    takeDamage(amount, attackerId) {
        if (this.isDead || !this.gameStarted || this.isSpawnProtected || !this.canTakeDamageFrom(attackerId)) return;
        this.health -= amount;
        if (this.networkManager && !this.isPracticeMode) this.networkManager.broadcast({ type: 'health', value: this.health });
        if (this.health <= 0) this.die(attackerId);
    }

    die(attackerId) {
        this.isDead = true;
        this.isShooting = false;
        this.deaths++;
        this.applyKillCredit(attackerId);
        this.updateHUDStats();
        document.getElementById('death-screen').style.display = 'flex';
        if (this.platform === 'PC') document.exitPointerLock();

        if (this.networkManager && !this.isPracticeMode) {
            this.networkManager.broadcast({ type: 'death', victim: this.networkManager.myId, attacker: attackerId });
            this.networkManager.sendStats();
        }
    }

    applyRemoteDeath(victimId, attackerId) {
        if (!victimId || victimId === this.networkManager?.myId) return;
        const victim = this.networkManager?.remotePlayerData[victimId];
        if (victim) {
            victim.deaths = (victim.deaths || 0) + 1;
            victim.health = 100;
        }
        if (this.networkManager?.remotePlayers[victimId]) this.networkManager.remotePlayers[victimId].visible = false;
        this.applyKillCredit(attackerId, victimId);
        this.updateHUDStats();
    }

    applyKillCredit(attackerId, victimId = null) {
        if (!attackerId) return;
        if (attackerId === this.networkManager?.myId) {
            this.handleLocalKill(victimId);
            return;
        }

        const attacker = this.networkManager?.remotePlayerData[attackerId];
        if (attacker) {
            attacker.kills = (attacker.kills || 0) + 1;
            if (this.isTeamMode() && attacker.team) this.teamScores[attacker.team] = (this.teamScores[attacker.team] || 0) + 1;
        }
    }

    handleLocalKill(victimId = null, options = {}) {
        this.kills++;
        if (options.practice) {
            this.practiceXpPending += PRACTICE_XP_PER_KILL;
        } else {
            this.profile.totalKills++;
            this.saveProfile();
        }
        if (this.isTeamMode() && this.team) this.teamScores[this.team] = (this.teamScores[this.team] || 0) + 1;
        if (this.isGunGameMode()) this.advanceGunGame();
        this.weaponSystem.playSound(800, 'sine', 0.1, 0.2);
        this.weaponSystem.playSound(1200, 'square', 0.04, 0.04);
        this.updateHUDStats();
        if (this.networkManager && !options.practice) this.networkManager.sendStats();
    }

    advanceGunGame() {
        if (this.gunGameLevel >= GUNGAME_LADDER.length - 1) {
            this.endMatch(true);
            return;
        }
        this.gunGameLevel++;
        this.applyModeRules();
    }

    respawn(initial = false) {
        this.isDead = false;
        this.health = 100;
        this.isSpawnProtected = true;
        this.verticalVelocity = 0;
        this.weaponSystem?.resetAmmo();
        document.getElementById('death-screen').style.display = 'none';

        const playerOffset = Object.keys(this.networkManager?.remotePlayerData || {}).length;
        const spawn = this.mapManager.getSpawnTransform(
            this.spawnIndex++ + playerOffset,
            this.getSpawnAvoidPositions({ includeBots: true }),
            this.isPracticeMode ? 18 : 14
        );
        const spawnPos = { x: spawn.x, y: spawn.y, z: spawn.z };
        if (typeof spawn.yaw === 'number') this.playerRotation.y = spawn.yaw;
        this.playerBody.setTranslation(spawnPos, true);
        this.camera.position.set(spawnPos.x, spawnPos.y + 0.6, spawnPos.z);
        this.camera.quaternion.setFromEuler(this.playerRotation);

        if (this.gameStarted && this.platform === 'PC' && !initial) {
            this.renderer.domElement.requestPointerLock();
        }

        if (this.networkManager && !this.isPracticeMode) {
            this.networkManager.broadcast({ type: 'health', value: 100 });
            this.networkManager.sendUpdate(spawnPos, this.playerRotation.y, true);
            this.networkManager.broadcast({ type: 'protection', value: true });
            this.networkManager.sendStats();
        }

        setTimeout(() => {
            this.isSpawnProtected = false;
            if (this.networkManager && !this.isPracticeMode) this.networkManager.broadcast({ type: 'protection', value: false });
        }, 2000);
    }

    getSpawnAvoidPositions(options = {}) {
        const avoid = [];
        const current = this.playerBody?.translation?.();
        if (options.includePlayer && current) avoid.push({ x: current.x, y: current.y, z: current.z });
        Object.values(this.networkManager?.remotePlayers || {}).forEach(group => {
            if (group.visible) avoid.push({ x: group.position.x, y: group.position.y, z: group.position.z });
        });
        if (options.includeBots !== false && this.botManager) {
            avoid.push(...this.botManager.getAliveBotPositions());
        }
        return avoid;
    }

    updateHUDStats() {
        document.getElementById('kill-count').innerText = this.kills;
        document.getElementById('death-count').innerText = this.deaths;
        document.getElementById('mode-label').innerText = this.isPracticeMode ? 'Practice' : (MODE_LABELS[this.selectedMode] || this.selectedMode);
        document.getElementById('team-label').innerText = this.isTeamMode() ? this.team : '-';
        document.getElementById('team-score').innerText = this.isTeamMode() ? `R ${this.teamScores.RED || 0} / B ${this.teamScores.BLUE || 0}` : '-';
        document.getElementById('player-count').innerText = this.isPracticeMode
            ? `${1 + (this.botManager?.bots.length || this.practiceBotCount)} (${this.practiceBotCount} bots)`
            : 1 + Object.keys(this.networkManager?.remotePlayerData || {}).length;
        const practiceHud = document.getElementById('practice-hud');
        const practiceDetail = document.getElementById('practice-detail');
        if (practiceHud) practiceHud.style.display = this.isPracticeMode ? 'block' : 'none';
        if (practiceDetail) practiceDetail.innerText = `${this.practiceBotCount} bots | ${BOT_DIFFICULTIES[this.practiceDifficulty]?.label || 'Normal'} | +${this.practiceXpPending} XP`;
    }

    getLocalPlayerInfo() {
        return {
            id: this.networkManager?.myId,
            name: this.playerName,
            team: this.team,
            ready: this.lobbyReady,
            isHost: !!this.networkManager?.isHost,
            health: this.health,
            kills: this.kills,
            deaths: this.deaths,
            gunGameLevel: this.gunGameLevel,
            level: this.profile.level,
            badge: this.profile.badge,
            color: this.profile.color,
            hat: this.profile.hat,
            glasses: this.profile.glasses
        };
    }

    showLeaderboard() {
        const modal = document.getElementById('leaderboard-modal');
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';

        const players = [
            { id: this.networkManager?.myId || 'YOU', name: 'YOU', team: this.team, kills: this.kills, deaths: this.deaths },
            ...Object.values(this.networkManager?.remotePlayerData || {})
        ];
        players.sort((a, b) => (b.kills || 0) - (a.kills || 0));

        if (this.isTeamMode()) {
            const teamRow = document.createElement('div');
            teamRow.className = 'leaderboard-row';
            teamRow.innerHTML = `<span>Team Score</span> <span>RED ${this.teamScores.RED || 0} | BLUE ${this.teamScores.BLUE || 0}</span>`;
            list.appendChild(teamRow);
        }

        players.forEach(p => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            const label = p.name || `Player ${String(p.id).slice(0, 4)}`;
            const team = this.isTeamMode() ? ` [${p.team || '-'}]` : '';
            row.innerHTML = `<span>${label}${team}</span> <span>K: ${p.kills || 0} | D: ${p.deaths || 0}</span>`;
            list.appendChild(row);
        });

        modal.style.display = 'block';
        if (document.pointerLockElement) document.exitPointerLock();
    }

    applyMatchProgress() {
        if (this.selectedMode === 'PRACTICE') return;
        if (this.profile._appliedMatchId === this.matchEndTime && this.matchEndTime) return;
        const before = { level: this.profile.level, xp: this.profile.xp };
        this.profile.matchesPlayed++;
        this.profile.totalDeaths += this.deaths;
        if (this.isEndlessMode()) {
            this.profile._appliedMatchId = Date.now();
            this.saveProfile();
            this.updateModeLocks();
            this.showXpAnimation(before, 0, ['Endless modes are casual and do not award XP.'], 'No XP in Endless');
            return;
        }

        if (this.selectedMode.startsWith('TIME') && !this.profile.timedModesCompleted.includes(this.selectedMode)) {
            this.profile.timedModesCompleted.push(this.selectedMode);
        }

        if (['TIME_FFA', 'TIME_TDM', 'TIME_SNIPER', 'TIME_GUNGAME'].every(m => this.profile.timedModesCompleted.includes(m))) {
            ['ENDLESS_FFA', 'ENDLESS_TDM', 'ENDLESS_SNIPER'].forEach(mode => {
                if (!this.profile.unlockedModes.includes(mode)) this.profile.unlockedModes.push(mode);
            });
        }

        const multiplier = MODE_MULTIPLIERS[this.selectedMode] || 1;
        const completionBonus = this.isTimedMode() ? 35 : 20;
        const gained = Math.max(20, Math.round(this.kills * multiplier * 25 - this.deaths * 8 + completionBonus));
        const rewards = [];
        this.profile.xp += gained;

        while (this.profile.level < MAX_LEVEL && this.profile.xp >= this.xpNeeded(this.profile.level)) {
            this.profile.xp -= this.xpNeeded(this.profile.level);
            this.profile.level++;
            const reward = this.unlockReward(this.profile.level);
            if (reward) rewards.push(reward);
        }

        this.profile._appliedMatchId = this.matchEndTime || Date.now();
        this.saveProfile();
        this.updateModeLocks();
        this.showXpAnimation(before, gained, rewards);
    }

    applyPracticeProgress() {
        const gained = Math.max(0, this.practiceXpPending || 0);
        if (!gained) return;
        const before = { level: this.profile.level, xp: this.profile.xp };
        const rewards = [];
        this.profile.xp += gained;

        while (this.profile.level < MAX_LEVEL && this.profile.xp >= this.xpNeeded(this.profile.level)) {
            this.profile.xp -= this.xpNeeded(this.profile.level);
            this.profile.level++;
            const reward = this.unlockReward(this.profile.level);
            if (reward) rewards.push(reward);
        }

        this.practiceXpPending = 0;
        this.saveProfile();
        this.updateModeLocks();
        this.showXpAnimation(before, gained, rewards);
    }

    unlockReward(level) {
        const reward = LEVEL_REWARDS[level];
        if (!reward) return null;
        const addUnique = (list, value) => {
            if (!list.includes(value)) list.push(value);
        };
        if (reward.type === 'weapon') addUnique(this.profile.unlockedWeapons, reward.key);
        if (reward.type === 'mode') addUnique(this.profile.unlockedModes, reward.key);
        if (reward.type === 'hat') addUnique(this.profile.unlockedHats, reward.key);
        if (reward.type === 'glasses') addUnique(this.profile.unlockedGlasses, reward.key);
        if (reward.type === 'color') addUnique(this.profile.unlockedColors, reward.key);
        if (reward.type === 'badge') this.profile.badge = reward.key;
        return { ...reward, level };
    }

    rewardTypeLabel(type) {
        return {
            weapon: 'New Weapon',
            mode: 'New Mode',
            hat: 'New Hat',
            glasses: 'New Glasses',
            color: 'New Color',
            badge: 'New Badge'
        }[type] || 'New Reward';
    }

    formatRewardLabel(reward) {
        if (typeof reward === 'string') return reward;
        if (!reward) return '';
        return `${this.rewardTypeLabel(reward.type)}: ${reward.label}`;
    }

    queueAchievementNotices(rewards) {
        const unlocks = rewards.filter(reward => reward && typeof reward !== 'string');
        if (!unlocks.length) return;
        this.achievementNoticeQueue.push(...unlocks);
        if (!this.achievementNoticeActive) this.showNextAchievementNotice();
    }

    showNextAchievementNotice() {
        const reward = this.achievementNoticeQueue.shift();
        if (!reward) {
            this.achievementNoticeActive = false;
            return;
        }

        this.achievementNoticeActive = true;
        let notice = document.getElementById('achievement-notice');
        if (!notice) {
            notice = document.createElement('div');
            notice.id = 'achievement-notice';
            notice.setAttribute('role', 'status');
            notice.setAttribute('aria-live', 'polite');
            notice.innerHTML = `
                <div class="achievement-shine"></div>
                <div class="achievement-rank">ACHIEVEMENT UNLOCKED</div>
                <div class="achievement-name"></div>
                <div class="achievement-meta"></div>
                <div class="achievement-spark achievement-spark-a"></div>
                <div class="achievement-spark achievement-spark-b"></div>
                <div class="achievement-spark achievement-spark-c"></div>
            `;
            document.body.appendChild(notice);
        }

        notice.querySelector('.achievement-name').innerText = reward.label;
        notice.querySelector('.achievement-meta').innerText = `Level ${reward.level} | ${this.rewardTypeLabel(reward.type)}`;
        notice.classList.remove('show');
        void notice.offsetWidth;
        notice.classList.add('show');
        this.playAchievementSound();

        window.setTimeout(() => {
            notice.classList.remove('show');
            window.setTimeout(() => this.showNextAchievementNotice(), 260);
        }, 2300);
    }

    playAchievementSound() {
        const ctx = this.weaponSystem?.ctx;
        if (!ctx) return;
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});

        const now = ctx.currentTime;
        const master = ctx.createGain();
        master.gain.setValueAtTime(0.0001, now);
        master.gain.exponentialRampToValueAtTime(0.18, now + 0.025);
        master.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
        master.connect(ctx.destination);

        const notes = [
            { freq: 523.25, start: 0, duration: 0.16 },
            { freq: 659.25, start: 0.12, duration: 0.16 },
            { freq: 783.99, start: 0.24, duration: 0.18 },
            { freq: 1046.5, start: 0.42, duration: 0.28 }
        ];

        notes.forEach(note => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(note.freq, now + note.start);
            osc.frequency.exponentialRampToValueAtTime(note.freq * 1.012, now + note.start + note.duration);
            gain.gain.setValueAtTime(0.0001, now + note.start);
            gain.gain.exponentialRampToValueAtTime(0.34, now + note.start + 0.018);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.duration);
            osc.connect(gain);
            gain.connect(master);
            osc.start(now + note.start);
            osc.stop(now + note.start + note.duration + 0.04);
        });

        [261.63, 329.63, 392, 523.25].forEach(freq => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + 0.56);
            gain.gain.setValueAtTime(0.0001, now + 0.56);
            gain.gain.exponentialRampToValueAtTime(0.12, now + 0.6);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
            osc.connect(gain);
            gain.connect(master);
            osc.start(now + 0.56);
            osc.stop(now + 1.08);
        });
    }

    showXpAnimation(before, gained, rewards, titleOverride = null) {
        const modal = document.getElementById('xp-modal');
        const title = document.getElementById('xp-title');
        const levelLabel = document.getElementById('xp-level-label');
        const fill = document.getElementById('xp-fill');
        const count = document.getElementById('xp-count');
        const unlockList = document.getElementById('unlock-list');
        modal.style.display = 'block';
        unlockList.innerHTML = '';
        title.innerText = titleOverride || `+${gained} XP`;

        const duration = 900;
        const start = performance.now();
        const startXp = before.xp;
        const targetLevel = this.profile.level;
        const targetXp = this.profile.xp;
        const targetNeed = this.xpNeeded(targetLevel);
        const endDisplayXp = before.level === targetLevel ? targetXp : targetNeed;

        const animate = (now) => {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const displayLevel = t < 1 ? before.level : targetLevel;
            const need = this.xpNeeded(displayLevel);
            const displayXp = Math.round(startXp + (endDisplayXp - startXp) * eased);
            levelLabel.innerText = `${displayLevel === 0 ? 'Rookie' : `Level ${displayLevel}`} -> Level ${targetLevel}`;
            count.innerText = `${Math.min(displayXp, need)} / ${need} XP`;
            fill.style.width = `${Math.min(100, (Math.min(displayXp, need) / need) * 100)}%`;
            if (t < 1) requestAnimationFrame(animate);
            else {
                count.innerText = `${targetXp} / ${targetNeed} XP`;
                fill.style.width = `${Math.min(100, (targetXp / targetNeed) * 100)}%`;
                rewards.forEach((reward, index) => {
                    const row = document.createElement('div');
                    row.style.animationDelay = `${index * 90}ms`;
                    row.innerText = `Unlocked: ${this.formatRewardLabel(reward)}`;
                    unlockList.appendChild(row);
                });
                this.queueAchievementNotices(rewards);
            }
        };
        requestAnimationFrame(animate);
    }

    showHitMarker() {
        const el = document.getElementById('hit-marker');
        if (!el) return;
        el.classList.remove('show');
        void el.offsetWidth;
        el.classList.add('show');
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        if (this.world) this.world.step();
        if (!this.isDead) this.updatePlayer(delta);
        this.botManager?.update(delta);
        this.updateTargetedPlayer();
        this.botManager?.updateOverlays();
        if (this.networkManager) this.networkManager.update(delta);
        this.renderer.render(this.scene, this.camera);
    }

    damageBotFromObject(object, damage) {
        if (!this.isPracticeMode || !this.botManager) return false;
        return this.botManager.damageBotByObject(object, damage);
    }

    damageBotsInRadius(point, radius, damage) {
        if (!this.isPracticeMode || !this.botManager) return false;
        return this.botManager.damageBotInRadius(point, radius, damage);
    }

    updateTargetedPlayer() {
        this.targetedPlayerId = null;
        if (!this.gameStarted) return;
        this.targetRaycaster.setFromCamera(this.centerPoint, this.camera);
        const nm = this.networkManager;
        const remoteObjects = Object.values(nm?.remotePlayers || {}).flatMap(group => group.children);
        if (this.isPracticeMode && this.botManager) {
            this.botManager.bots
                .filter(bot => bot.alive)
                .forEach(bot => remoteObjects.push(...bot.group.children));
        }
        const hits = this.targetRaycaster.intersectObjects(remoteObjects, true);
        if (!hits.length) return;
        if (this.isPracticeMode && this.botManager) {
            const bot = this.botManager.findBotByObject(hits[0].object);
            if (bot) {
                this.targetedPlayerId = bot.id;
                return;
            }
        }
        Object.entries(nm?.remotePlayers || {}).some(([id, group]) => {
            let found = false;
            group.traverse(child => {
                if (child === hits[0].object) found = true;
            });
            if (found) {
                this.targetedPlayerId = id;
                return true;
            }
            return false;
        });
    }
}

new Game();
