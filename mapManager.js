import {
    BoxGeometry,
    ConeGeometry,
    CylinderGeometry,
    MeshStandardMaterial,
    Mesh,
    Color,
    FogExp2,
    Quaternion,
    Euler
} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class MapManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.meshes = [];
        this.visuals = [];
        this.colliders = [];
        this.currentTheme = 'URBAN';

        this.themes = {
            URBAN: { floor: 0x4b4f55, accent: 0xf2c14e, obstacle: 0x343940, sky: 0x7f93a8, trim: 0x16191d },
            SCIFI: { floor: 0x04100f, accent: 0x39ff14, obstacle: 0x10273a, sky: 0x02070d, trim: 0x00d9ff },
            DESERT: { floor: 0xc89f6f, accent: 0xffcc44, obstacle: 0x9b633f, sky: 0xffc99b, trim: 0x6c452c }
        };

        this.spawnPoints = {
            URBAN: [
                { x: -42, y: 5, z: -40, yaw: Math.PI * 0.25 },
                { x: 42, y: 5, z: 40, yaw: -Math.PI * 0.75 },
                { x: -42, y: 5, z: 40, yaw: Math.PI * 0.75 },
                { x: 42, y: 5, z: -40, yaw: -Math.PI * 0.25 },
                { x: -8, y: 5, z: -48, yaw: 0 },
                { x: 8, y: 5, z: 48, yaw: Math.PI },
                { x: -48, y: 5, z: -8, yaw: Math.PI * 0.5 },
                { x: 48, y: 5, z: 8, yaw: -Math.PI * 0.5 },
                { x: -28, y: 5, z: -20, yaw: Math.PI * 0.2 },
                { x: 28, y: 5, z: 20, yaw: -Math.PI * 0.8 },
                { x: -28, y: 5, z: 20, yaw: Math.PI * 0.8 },
                { x: 28, y: 5, z: -20, yaw: -Math.PI * 0.2 }
            ],
            SCIFI: [
                { x: -44, y: 5, z: -38, yaw: Math.PI * 0.22 },
                { x: 44, y: 5, z: 38, yaw: -Math.PI * 0.78 },
                { x: -44, y: 5, z: 38, yaw: Math.PI * 0.78 },
                { x: 44, y: 5, z: -38, yaw: -Math.PI * 0.22 },
                { x: -16, y: 5, z: -48, yaw: 0 },
                { x: 16, y: 5, z: 48, yaw: Math.PI },
                { x: -48, y: 5, z: 16, yaw: Math.PI * 0.5 },
                { x: 48, y: 5, z: -16, yaw: -Math.PI * 0.5 },
                { x: -28, y: 5, z: 0, yaw: Math.PI * 0.5 },
                { x: 28, y: 5, z: 0, yaw: -Math.PI * 0.5 },
                { x: 0, y: 5, z: -30, yaw: 0 },
                { x: 0, y: 5, z: 30, yaw: Math.PI }
            ],
            DESERT: [
                { x: -46, y: 5, z: -44, yaw: Math.PI * 0.25 },
                { x: 46, y: 5, z: 44, yaw: -Math.PI * 0.75 },
                { x: -46, y: 5, z: 44, yaw: Math.PI * 0.75 },
                { x: 46, y: 5, z: -44, yaw: -Math.PI * 0.25 },
                { x: -14, y: 5, z: -54, yaw: 0 },
                { x: 14, y: 5, z: 54, yaw: Math.PI },
                { x: -54, y: 5, z: 14, yaw: Math.PI * 0.5 },
                { x: 54, y: 5, z: -14, yaw: -Math.PI * 0.5 },
                { x: -30, y: 5, z: -8, yaw: Math.PI * 0.5 },
                { x: 30, y: 5, z: 8, yaw: -Math.PI * 0.5 },
                { x: -10, y: 5, z: 28, yaw: Math.PI * 0.85 },
                { x: 10, y: 5, z: -28, yaw: -Math.PI * 0.15 }
            ]
        };

        this.waypoints = {
            URBAN: [
                { x: -34, y: 5, z: -34 }, { x: 0, y: 5, z: -34 }, { x: 34, y: 5, z: -34 },
                { x: 34, y: 5, z: 0 }, { x: 34, y: 5, z: 34 }, { x: 0, y: 5, z: 34 },
                { x: -34, y: 5, z: 34 }, { x: -34, y: 5, z: 0 }, { x: -12, y: 5, z: -10 },
                { x: 12, y: 5, z: 10 }, { x: 0, y: 5, z: 0 }
            ],
            SCIFI: [
                { x: -36, y: 5, z: -32 }, { x: 0, y: 5, z: -36 }, { x: 36, y: 5, z: -32 },
                { x: 42, y: 5, z: 0 }, { x: 36, y: 5, z: 32 }, { x: 0, y: 5, z: 36 },
                { x: -36, y: 5, z: 32 }, { x: -42, y: 5, z: 0 }, { x: -14, y: 5, z: 0 },
                { x: 14, y: 5, z: 0 }, { x: 0, y: 5, z: -12 }, { x: 0, y: 5, z: 12 }
            ],
            DESERT: [
                { x: -38, y: 5, z: -38 }, { x: -6, y: 5, z: -42 }, { x: 38, y: 5, z: -36 },
                { x: 44, y: 5, z: -4 }, { x: 36, y: 5, z: 38 }, { x: 4, y: 5, z: 42 },
                { x: -38, y: 5, z: 36 }, { x: -44, y: 5, z: 4 }, { x: -12, y: 5, z: -8 },
                { x: 14, y: 5, z: 10 }, { x: 0, y: 5, z: 0 }
            ]
        };
    }

    clear() {
        [...this.meshes, ...this.visuals].forEach(mesh => {
            this.scene.remove(mesh);
            mesh.geometry?.dispose?.();
            if (Array.isArray(mesh.material)) mesh.material.forEach(mat => mat.dispose?.());
            else mesh.material?.dispose?.();
        });
        this.colliders.forEach(collider => this.world.removeCollider(collider));
        this.meshes = [];
        this.visuals = [];
        this.colliders = [];
    }

    createBox(w, h, d, x, y, z, color, rotX = 0, rotY = 0, rotZ = 0, noPhysics = false, options = {}) {
        const geo = new BoxGeometry(w, h, d);
        const mat = new MeshStandardMaterial({
            color,
            emissive: options.emissive || 0x000000,
            emissiveIntensity: options.emissiveIntensity || 0
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotX, rotY, rotZ);
        mesh.castShadow = !options.noShadow;
        mesh.receiveShadow = true;
        mesh.userData.mapObject = true;
        this.scene.add(mesh);
        if (options.visualOnly) this.visuals.push(mesh);
        else this.meshes.push(mesh);

        if (!noPhysics) {
            const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
                .setTranslation(x, y, z)
                .setRotation(new Quaternion().setFromEuler(new Euler(rotX, rotY, rotZ)));
            const collider = this.world.createCollider(desc);
            this.colliders.push(collider);
        }
        return mesh;
    }

    createCylinder(radiusTop, radiusBottom, h, x, y, z, color, rotX = 0, rotY = 0, rotZ = 0, noPhysics = true, options = {}) {
        const geo = new CylinderGeometry(radiusTop, radiusBottom, h, options.segments || 16);
        const mat = new MeshStandardMaterial({
            color,
            emissive: options.emissive || 0x000000,
            emissiveIntensity: options.emissiveIntensity || 0
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotX, rotY, rotZ);
        mesh.castShadow = !options.noShadow;
        mesh.receiveShadow = true;
        mesh.userData.mapObject = true;
        this.scene.add(mesh);
        if (options.visualOnly) this.visuals.push(mesh);
        else this.meshes.push(mesh);

        if (!noPhysics) {
            const desc = RAPIER.ColliderDesc.cylinder(h / 2, Math.max(radiusTop, radiusBottom))
                .setTranslation(x, y, z)
                .setRotation(new Quaternion().setFromEuler(new Euler(rotX, rotY, rotZ)));
            const collider = this.world.createCollider(desc);
            this.colliders.push(collider);
        }
        return mesh;
    }

    createCone(radius, h, x, y, z, color, rotX = 0, rotY = 0, rotZ = 0, options = {}) {
        const geo = new ConeGeometry(radius, h, options.segments || 12);
        const mat = new MeshStandardMaterial({
            color,
            emissive: options.emissive || 0x000000,
            emissiveIntensity: options.emissiveIntensity || 0
        });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotX, rotY, rotZ);
        mesh.castShadow = !options.noShadow;
        mesh.receiveShadow = true;
        mesh.userData.mapObject = true;
        this.scene.add(mesh);
        this.visuals.push(mesh);
        return mesh;
    }

    createTree(x, z, scale = 1) {
        this.createCylinder(0.35 * scale, 0.48 * scale, 3.4 * scale, x, 1.7 * scale, z, 0x5a3924, 0, 0, 0, true, { visualOnly: true, segments: 8 });
        this.createCone(2.1 * scale, 4.4 * scale, x, 4.9 * scale, z, 0x2f7d46, 0, 0, 0, { visualOnly: true, segments: 10 });
        this.createCone(1.55 * scale, 3.3 * scale, x, 6.3 * scale, z, 0x3fa35b, 0, 0, 0, { visualOnly: true, segments: 10 });
    }

    createPalm(x, z, scale = 1) {
        this.createCylinder(0.42 * scale, 0.62 * scale, 5.6 * scale, x, 2.8 * scale, z, 0x805735, 0, 0, 0.12, true, { visualOnly: true, segments: 9 });
        for (let i = 0; i < 4; i++) {
            const angle = i * Math.PI * 0.5;
            this.createBox(1.1 * scale, 0.28 * scale, 5.2 * scale, x + Math.sin(angle) * 1.5 * scale, 5.9 * scale, z + Math.cos(angle) * 1.5 * scale, 0x2f8f55, 0.18, angle, 0, true, { visualOnly: true });
        }
    }

    createCactus(x, z, scale = 1) {
        this.createCylinder(0.55 * scale, 0.65 * scale, 4.2 * scale, x, 2.1 * scale, z, 0x3d8f4d, 0, 0, 0, true, { visualOnly: true, segments: 10 });
        this.createCylinder(0.28 * scale, 0.34 * scale, 2.2 * scale, x - 0.9 * scale, 2.3 * scale, z, 0x3d8f4d, 0, 0, Math.PI / 2, true, { visualOnly: true, segments: 8 });
        this.createCylinder(0.28 * scale, 0.34 * scale, 1.9 * scale, x + 0.9 * scale, 2.8 * scale, z, 0x3d8f4d, 0, 0, Math.PI / 2, true, { visualOnly: true, segments: 8 });
    }

    createLamp(x, z, color = 0xffdf8a) {
        this.createCylinder(0.16, 0.2, 5.2, x, 2.6, z, 0x20242a, 0, 0, 0, true, { visualOnly: true, segments: 8 });
        this.createBox(0.8, 0.5, 0.8, x, 5.45, z, color, 0, 0, 0, true, { visualOnly: true, emissive: color, emissiveIntensity: 0.75, noShadow: true });
    }

    seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    loadMap(themeName, seed = 12345) {
        this.clear();
        this.currentTheme = this.themes[themeName] ? themeName : 'URBAN';
        const theme = this.themes[this.currentTheme];
        const random = this.seededRandom(seed);

        this.scene.background = new Color(theme.sky);
        this.scene.fog = new FogExp2(theme.sky, this.currentTheme === 'DESERT' ? 0.011 : 0.014);

        this.createBox(200, 0.2, 200, 0, -0.1, 0, theme.floor);
        this.createArenaBounds(theme);

        if (this.currentTheme === 'URBAN') this.buildUrban(theme);
        else if (this.currentTheme === 'SCIFI') this.buildSciFi(theme);
        else if (this.currentTheme === 'DESERT') this.buildDesert(theme, random);
    }

    createArenaBounds(theme) {
        const wallColor = theme.trim || theme.obstacle;
        this.createBox(202, 5, 2, 0, 2.5, -101, wallColor);
        this.createBox(202, 5, 2, 0, 2.5, 101, wallColor);
        this.createBox(2, 5, 202, -101, 2.5, 0, wallColor);
        this.createBox(2, 5, 202, 101, 2.5, 0, wallColor);
    }

    getSpawnPoint(index = 0, avoidPositions = [], minDistance = 16) {
        const spawn = this.getSpawnTransform(index, avoidPositions, minDistance);
        return { x: spawn.x, y: spawn.y, z: spawn.z };
    }

    getSpawnTransform(index = 0, avoidPositions = [], minDistance = 16) {
        const spawns = this.spawnPoints[this.currentTheme] || this.spawnPoints.URBAN;
        const start = Math.abs(index) % spawns.length;
        const avoid = avoidPositions.filter(Boolean);

        for (let i = 0; i < spawns.length; i++) {
            const candidate = spawns[(start + i) % spawns.length];
            const safe = avoid.every(pos => {
                const dx = candidate.x - pos.x;
                const dz = candidate.z - pos.z;
                return Math.sqrt(dx * dx + dz * dz) >= minDistance;
            });
            if (safe) return { ...candidate };
        }
        return { ...spawns[start] };
    }

    getWaypoints() {
        return this.waypoints[this.currentTheme] || this.waypoints.URBAN;
    }

    buildUrban(theme) {
        // Dark street lanes make the city readable at speed.
        this.createBox(16, 0.04, 190, 0, 0.02, 0, 0x25282d, 0, 0, 0, true);
        this.createBox(190, 0.04, 16, 0, 0.03, 0, 0x25282d, 0, 0, 0, true);
        this.createBox(1.2, 0.06, 185, -9, 0.07, 0, 0xf2c14e, 0, 0, 0, true);
        this.createBox(1.2, 0.06, 185, 9, 0.07, 0, 0xf2c14e, 0, 0, 0, true);

        [-17, 17].forEach(x => this.createBox(4.5, 0.05, 190, x, 0.05, 0, 0x737b83, 0, 0, 0, true, { visualOnly: true }));
        [-17, 17].forEach(z => this.createBox(190, 0.05, 4.5, 0, 0.06, z, 0x737b83, 0, 0, 0, true, { visualOnly: true }));
        for (let i = -80; i <= 80; i += 20) {
            this.createBox(0.8, 0.07, 7, 0, 0.1, i, 0xe6d58a, 0, 0, 0, true, { visualOnly: true });
            this.createBox(7, 0.07, 0.8, i, 0.11, 0, 0xe6d58a, 0, 0, 0, true, { visualOnly: true });
        }
        [-12, -8, -4, 4, 8, 12].forEach(offset => {
            this.createBox(2, 0.08, 12, offset, 0.12, -17.2, 0xf4f0dd, 0, 0, 0, true, { visualOnly: true });
            this.createBox(2, 0.08, 12, offset, 0.12, 17.2, 0xf4f0dd, 0, 0, 0, true, { visualOnly: true });
            this.createBox(12, 0.08, 2, -17.2, 0.13, offset, 0xf4f0dd, 0, 0, 0, true, { visualOnly: true });
            this.createBox(12, 0.08, 2, 17.2, 0.13, offset, 0xf4f0dd, 0, 0, 0, true, { visualOnly: true });
        });

        const buildings = [
            [-58, -54, 18, 16, 18], [-30, -58, 16, 22, 16], [30, -58, 16, 20, 18], [58, -34, 18, 18, 22],
            [-58, 34, 18, 16, 22], [-30, 58, 16, 20, 18], [30, 58, 16, 22, 16], [58, 54, 18, 18, 18],
            [-26, -22, 12, 12, 12], [26, 22, 12, 12, 12], [-26, 24, 12, 12, 12], [26, -24, 12, 12, 12]
        ];
        buildings.forEach(([x, z, w, h, d], i) => {
            const color = i % 3 === 0 ? 0x2f343a : i % 3 === 1 ? 0x3c424a : theme.obstacle;
            this.createBox(w, h, d, x, h / 2, z, color);
            this.createBox(w * 0.55, 0.35, d * 0.55, x, h + 0.22, z, theme.accent, 0, 0, 0, true, { emissive: theme.accent, emissiveIntensity: 0.15 });
        });

        const billboards = [
            [-58, -43.7, 9, 3, 0.35, 0x2bd4ff], [30, -48.8, 10, 3, 0.35, 0xffdd66],
            [-30, 48.8, 10, 3, 0.35, 0x7cff8b], [58, 44.8, 9, 3, 0.35, 0xff8b42]
        ];
        billboards.forEach(([x, z, w, h, d, color]) => {
            this.createBox(w, h, d, x, 9.5, z, color, 0, 0, 0, true, { visualOnly: true, emissive: color, emissiveIntensity: 0.35, noShadow: true });
        });

        const parkPatches = [
            [-58, 0, 18, 28], [58, 0, 18, 28], [0, -58, 28, 18], [0, 58, 28, 18]
        ];
        parkPatches.forEach(([x, z, w, d], i) => {
            this.createBox(w, 0.06, d, x, 0.12, z, i % 2 ? 0x4f9b54 : 0x3e8b48, 0, 0, 0, true, { visualOnly: true });
            this.createBox(w + 1.2, 0.8, 1.2, x, 0.4, z - d / 2, 0x70766f);
            this.createBox(w + 1.2, 0.8, 1.2, x, 0.4, z + d / 2, 0x70766f);
            this.createBox(1.2, 0.8, d + 1.2, x - w / 2, 0.4, z, 0x70766f);
            this.createBox(1.2, 0.8, d + 1.2, x + w / 2, 0.4, z, 0x70766f);
        });
        [
            [-63, -8, 0.85], [-53, 8, 0.75], [53, -8, 0.75], [63, 8, 0.85],
            [-8, -63, 0.8], [8, -53, 0.7], [-8, 53, 0.7], [8, 63, 0.8]
        ].forEach(([x, z, scale]) => this.createTree(x, z, scale));

        const cover = [
            [-42, -34, 12, 2.4, 2], [-34, -42, 2, 2.4, 12], [42, 34, 12, 2.4, 2], [34, 42, 2, 2.4, 12],
            [-42, 34, 12, 2.4, 2], [-34, 42, 2, 2.4, 12], [42, -34, 12, 2.4, 2], [34, -42, 2, 2.4, 12],
            [0, -20, 10, 2.2, 2], [0, 20, 10, 2.2, 2], [-20, 0, 2, 2.2, 10], [20, 0, 2, 2.2, 10],
            [-10, -10, 5, 1.8, 5], [10, 10, 5, 1.8, 5]
        ];
        cover.forEach(([x, z, w, h, d]) => this.createBox(w, h, d, x, h / 2, z, 0x505861));

        const cars = [
            [-7, -66, 4.6, 1.1, 8, 0x1f6fb2], [7, 63, 4.6, 1.1, 8, 0xb23b2f],
            [-66, 7, 8, 1.1, 4.6, 0xe5b83f], [64, -7, 8, 1.1, 4.6, 0x2f9363]
        ];
        cars.forEach(([x, z, w, h, d, color]) => {
            this.createBox(w, h, d, x, h / 2, z, color);
            this.createBox(w * 0.62, 0.75, d * 0.48, x, h + 0.35, z, 0xbfd7e6, 0, 0, 0, true, { visualOnly: true, emissive: 0x14324a, emissiveIntensity: 0.08 });
        });

        [
            [-23, -23], [23, 23], [-23, 23], [23, -23],
            [-78, 18], [78, -18], [-18, 78], [18, -78]
        ].forEach(([x, z]) => this.createLamp(x, z));

        this.createBox(5, 12, 5, 0, 6, 0, 0x20242a);
        this.createBox(16, 0.35, 1.2, 0, 9.2, -2.9, theme.accent, 0, 0, 0, true, { emissive: theme.accent, emissiveIntensity: 0.35 });
    }

    buildSciFi(theme) {
        this.createBox(18, 0.05, 190, 0, 0.04, 0, 0x07152a, 0, 0, 0, true);
        this.createBox(190, 0.05, 18, 0, 0.05, 0, 0x07152a, 0, 0, 0, true);

        const glow = { emissive: theme.accent, emissiveIntensity: 0.65, noShadow: true };
        const cyanGlow = { emissive: theme.trim, emissiveIntensity: 0.55, noShadow: true };
        [-52, 52].forEach(x => {
            this.createBox(2, 9, 22, x, 4.5, -26, theme.accent, 0, 0, 0, true, glow);
            this.createBox(2, 9, 22, x, 4.5, 26, theme.trim, 0, 0, 0, true, cyanGlow);
        });
        [-52, 52].forEach(z => {
            this.createBox(22, 9, 2, -26, 4.5, z, theme.trim, 0, 0, 0, true, cyanGlow);
            this.createBox(22, 9, 2, 26, 4.5, z, theme.accent, 0, 0, 0, true, glow);
        });

        const structures = [
            [-28, -28, 10, 5, 10], [28, 28, 10, 5, 10], [-28, 28, 10, 5, 10], [28, -28, 10, 5, 10],
            [0, -18, 14, 3, 3], [0, 18, 14, 3, 3], [-18, 0, 3, 3, 14], [18, 0, 3, 3, 14],
            [-42, 0, 6, 3.2, 10], [42, 0, 6, 3.2, 10], [0, -42, 10, 3.2, 6], [0, 42, 10, 3.2, 6]
        ];
        structures.forEach(([x, z, w, h, d], i) => {
            this.createBox(w, h, d, x, h / 2, z, i < 4 ? 0x102040 : theme.obstacle);
        });

        this.createBox(8, 10, 8, 0, 5, 0, 0x08111f);
        this.createBox(13, 0.35, 13, 0, 10.4, 0, theme.accent, 0, Math.PI / 4, 0, true, glow);
        this.createBox(2.5, 13, 2.5, 0, 6.5, 0, theme.trim, 0, 0, 0, true, cyanGlow);

        const laneRails = [
            [-9, -62, 1, 0.5, 70], [9, -62, 1, 0.5, 70], [-9, 62, 1, 0.5, 70], [9, 62, 1, 0.5, 70],
            [-62, -9, 70, 0.5, 1], [-62, 9, 70, 0.5, 1], [62, -9, 70, 0.5, 1], [62, 9, 70, 0.5, 1]
        ];
        laneRails.forEach(([x, z, w, h, d], i) => {
            this.createBox(w, h, d, x, 0.35, z, i % 2 ? theme.trim : theme.accent, 0, 0, 0, true, i % 2 ? cyanGlow : glow);
        });

        for (let i = -72; i <= 72; i += 24) {
            this.createCylinder(3.4, 3.4, 0.08, i, 0.15, -9, theme.accent, 0, 0, 0, true, { visualOnly: true, emissive: theme.accent, emissiveIntensity: 0.5, noShadow: true, segments: 24 });
            this.createCylinder(3.4, 3.4, 0.08, i, 0.16, 9, theme.trim, 0, 0, 0, true, { visualOnly: true, emissive: theme.trim, emissiveIntensity: 0.45, noShadow: true, segments: 24 });
            this.createCylinder(3.4, 3.4, 0.08, -9, 0.17, i, theme.trim, 0, 0, 0, true, { visualOnly: true, emissive: theme.trim, emissiveIntensity: 0.45, noShadow: true, segments: 24 });
            this.createCylinder(3.4, 3.4, 0.08, 9, 0.18, i, theme.accent, 0, 0, 0, true, { visualOnly: true, emissive: theme.accent, emissiveIntensity: 0.5, noShadow: true, segments: 24 });
        }

        const dataTowers = [
            [-58, -58, theme.accent], [58, 58, theme.accent], [-58, 58, theme.trim], [58, -58, theme.trim],
            [-36, 14, theme.trim], [36, -14, theme.accent]
        ];
        dataTowers.forEach(([x, z, color], i) => {
            this.createCylinder(1.1, 1.4, 7.5, x, 3.75, z, 0x0b1824, 0, 0, 0, true, { visualOnly: true, segments: 10 });
            this.createBox(6, 0.22, 1.2, x, 7.8, z, color, 0, i * Math.PI / 3, 0, true, { visualOnly: true, emissive: color, emissiveIntensity: 0.7, noShadow: true });
            this.createBox(1.2, 0.22, 6, x, 8.35, z, color, 0, i * Math.PI / 3, 0, true, { visualOnly: true, emissive: color, emissiveIntensity: 0.55, noShadow: true });
        });

        const shieldArcs = [
            [-18, -40, 12, 0.45, 1.2, theme.trim], [18, 40, 12, 0.45, 1.2, theme.trim],
            [-40, 18, 1.2, 0.45, 12, theme.accent], [40, -18, 1.2, 0.45, 12, theme.accent]
        ];
        shieldArcs.forEach(([x, z, w, h, d, color]) => {
            this.createBox(w, h, d, x, 1.4, z, color, 0, 0, 0, true, { emissive: color, emissiveIntensity: 0.5, noShadow: true });
            this.createBox(w * 0.72, h, d * 0.72, x, 3.4, z, color, 0, 0, 0, true, { visualOnly: true, emissive: color, emissiveIntensity: 0.35, noShadow: true });
        });
    }

    buildDesert(theme, random) {
        this.createBox(54, 0.05, 54, 0, 0.04, 0, 0xb88452, 0, Math.PI / 4, 0, true);
        this.createBox(42, 0.04, 10, -45, 0.1, 25, 0x7aa36a, 0, -0.18, 0, true, { visualOnly: true });
        this.createBox(12, 0.04, 42, -62, 0.11, 14, 0x6f9b61, 0, 0.12, 0, true, { visualOnly: true });
        this.createBox(18, 0.05, 11, -58, 0.13, 18, 0x3d8faf, 0, 0.2, 0, true, { visualOnly: true, emissive: 0x0b5c7b, emissiveIntensity: 0.08 });

        const walls = [
            [-34, -34, 20, 3, 3], [34, 34, 20, 3, 3], [-34, 34, 20, 3, 3], [34, -34, 20, 3, 3],
            [-48, 0, 3, 3.5, 24], [48, 0, 3, 3.5, 24], [0, -48, 24, 3.5, 3], [0, 48, 24, 3.5, 3],
            [-16, -16, 16, 2.8, 3], [18, 16, 16, 2.8, 3], [-18, 16, 3, 2.8, 16], [16, -18, 3, 2.8, 16]
        ];
        walls.forEach(([x, z, w, h, d]) => this.createBox(w, h, d, x, h / 2, z, theme.obstacle));

        const crates = [
            [-42, -42], [-36, -48], [42, 42], [36, 48], [-42, 42], [-48, 36], [42, -42], [48, -36],
            [-8, -30], [8, 30], [-30, 8], [30, -8], [-8, 8], [10, -10]
        ];
        crates.forEach(([x, z], i) => {
            const h = i % 3 === 0 ? 2.4 : 1.6;
            this.createBox(4, h, 4, x, h / 2, z, i % 2 ? 0x7a5133 : 0x8f5c37);
        });

        const tents = [
            [-56, 48, 16, 7, 10, 0xc7533a], [56, -48, 16, 7, 10, 0x3e82a8],
            [52, 24, 14, 6, 9, 0xd9a647], [-52, -24, 14, 6, 9, 0x5e8a58]
        ];
        tents.forEach(([x, z, w, h, d, color], i) => {
            this.createBox(w, 0.5, d, x, h, z, color, 0, i % 2 ? 0.18 : -0.18, 0, true, { visualOnly: true });
            this.createBox(w + 1, 0.35, 1.2, x, h - 0.4, z - d / 2, theme.trim);
            this.createBox(w + 1, 0.35, 1.2, x, h - 0.4, z + d / 2, theme.trim);
            this.createCylinder(0.18, 0.24, h, x - w / 2, h / 2, z - d / 2, 0x5b3c27, 0, 0, 0, true, { visualOnly: true, segments: 8 });
            this.createCylinder(0.18, 0.24, h, x + w / 2, h / 2, z + d / 2, 0x5b3c27, 0, 0, 0, true, { visualOnly: true, segments: 8 });
        });

        const barrels = [
            [-18, -42], [-12, -42], [18, 42], [12, 42],
            [-42, 18], [-42, 12], [42, -18], [42, -12]
        ];
        barrels.forEach(([x, z], i) => {
            const color = i % 2 ? 0x6f4731 : 0x4d6170;
            this.createCylinder(1.2, 1.2, 2.2, x, 1.1, z, color, 0, 0, 0, false, { segments: 12 });
            this.createCylinder(1.26, 1.26, 0.16, x, 2.26, z, 0x2f2a25, 0, 0, 0, true, { visualOnly: true, segments: 12 });
        });

        this.createBox(18, 1.4, 8, -20, 0.7, 0, 0x8f6b44, 0, 0, -0.22);
        this.createBox(18, 1.4, 8, 20, 0.7, 0, 0x8f6b44, 0, 0, 0.22);
        this.createBox(8, 1.4, 18, 0, 0.7, -20, 0x8f6b44, 0.22, 0, 0);
        this.createBox(8, 1.4, 18, 0, 0.7, 20, 0x8f6b44, -0.22, 0, 0);

        this.createBox(8, 10, 8, 0, 5, 0, 0x6d4a31);
        this.createBox(14, 1, 14, 0, 10.7, 0, theme.accent, 0, Math.PI / 4, 0, true, { emissive: theme.accent, emissiveIntensity: 0.2 });

        [
            [-68, 15, 0.9], [-54, 28, 0.75], [-66, 32, 0.7],
            [58, 56, 0.7], [70, -30, 0.8], [-74, -54, 0.65]
        ].forEach(([x, z, scale]) => this.createPalm(x, z, scale));
        [
            [-72, -12, 0.8], [-56, -62, 0.65], [62, 16, 0.75],
            [74, 42, 0.6], [12, 72, 0.7], [-12, -72, 0.7]
        ].forEach(([x, z, scale]) => this.createCactus(x, z, scale));

        const scrub = [
            [-36, 52], [-26, 48], [38, -52], [28, -48], [-66, 4], [66, -4],
            [-6, 60], [6, -60], [58, 8], [-58, -8]
        ];
        scrub.forEach(([x, z], i) => {
            this.createBox(3 + (i % 3), 0.35, 1.2, x, 0.2, z, i % 2 ? 0x7a8d4d : 0x8f7f46, 0, random() * Math.PI, 0, true, { visualOnly: true });
        });

        for (let i = 0; i < 12; i++) {
            const x = (random() - 0.5) * 150;
            const z = (random() - 0.5) * 150;
            if (Math.abs(x) < 22 && Math.abs(z) < 22) continue;
            this.createBox(1.2, 1.2, 1.2, x, 0.6, z, 0x7d5a36, 0, random() * Math.PI, 0, true);
        }
    }
}
