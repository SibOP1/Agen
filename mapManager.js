import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';

export class MapManager {
    constructor(scene, world) {
        this.scene = scene;
        this.world = world;
        this.meshes = [];
        this.colliders = [];
        this.currentTheme = 'URBAN';
        
        this.themes = {
            URBAN: { floor: 0x555555, accent: 0x888888, obstacle: 0x444444, sky: 0x8899aa, treeColor: 0x224422, grassColor: 0x334433 },
            SCIFI: { floor: 0x000511, accent: 0x00ffff, obstacle: 0x112244, sky: 0x000205, treeColor: 0x00ff88, grassColor: 0x003322 },
            DESERT: { floor: 0xd2b48c, accent: 0xffcc00, obstacle: 0xa0522d, sky: 0xffccaa, treeColor: 0x664422, grassColor: 0x8b4513 }
        };
    }

    clear() {
        this.meshes.forEach(m => this.scene.remove(m));
        this.colliders.forEach(c => this.world.removeCollider(c));
        this.meshes = [];
        this.colliders = [];
    }

    createBox(w, h, d, x, y, z, color, rotX = 0, rotY = 0, rotZ = 0, noPhysics = false) {
        const geo = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshStandardMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotX, rotY, rotZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);

        if (!noPhysics) {
            const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
                .setTranslation(x, y, z)
                .setRotation(new THREE.Quaternion().setFromEuler(new THREE.Euler(rotX, rotY, rotZ)));
            const collider = this.world.createCollider(desc);
            this.colliders.push(collider);
        }
        return mesh;
    }

    createTree(x, z, theme) {
        // Trunk
        const trunkH = 1 + Math.random() * 2;
        this.createBox(0.4, trunkH, 0.4, x, trunkH / 2, z, 0x4d2902);
        
        // Foliage
        const foliageH = 2 + Math.random() * 2;
        const foliageW = 1.5 + Math.random();
        this.createBox(foliageW, foliageH, foliageW, x, trunkH + foliageH / 2, z, theme.treeColor);
    }

    createGrass(x, z, theme) {
        const h = 0.2 + Math.random() * 0.5;
        this.createBox(0.1, h, 0.1, x, h / 2, z, theme.grassColor, 0, 0, 0, true);
    }

    loadMap(themeName) {
        this.clear();
        this.currentTheme = themeName;
        const theme = this.themes[themeName];

        this.scene.background = new THREE.Color(theme.sky);
        this.scene.fog = new THREE.FogExp2(theme.sky, 0.015);

        // Floor
        this.createBox(200, 0.2, 200, 0, -0.1, 0, theme.floor);

        // Add Trees & Grass
        for(let i=0; i<30; i++) {
            const tx = (Math.random()-0.5)*150;
            const tz = (Math.random()-0.5)*150;
            if (Math.abs(tx) > 10 || Math.abs(tz) > 10) this.createTree(tx, tz, theme);
        }
        for(let i=0; i<200; i++) {
            const gx = (Math.random()-0.5)*180;
            const gz = (Math.random()-0.5)*180;
            this.createGrass(gx, gz, theme);
        }

        if (themeName === 'URBAN') this.buildUrban(theme);
        else if (themeName === 'SCIFI') this.buildSciFi(theme);
        else if (themeName === 'DESERT') this.buildDesert(theme);
    }

    buildUrban(theme) {
        for(let i=0; i<20; i++) {
            const x = (Math.random()-0.5)*100;
            const z = (Math.random()-0.5)*100;
            const h = 1 + Math.random()*3;
            this.createBox(2, h, 4, x, h/2, z, theme.obstacle);
        }
        this.createBox(10, 0.2, 10, 0, 1.5, -20, theme.accent, 0.3, 0, 0);
        this.createBox(10, 3, 10, 0, 1.5, -30, theme.obstacle);
    }

    buildSciFi(theme) {
        for(let i=0; i<15; i++) {
            const x = (Math.random()-0.5)*100;
            const z = (Math.random()-0.5)*100;
            this.createBox(1, 15, 1, x, 7.5, z, theme.accent);
        }
        this.createBox(15, 0.5, 15, 0, 5, 0, theme.obstacle);
        this.createBox(15, 0.2, 5, 0, 2.5, 10, theme.accent, -0.4, 0, 0);
    }

    buildDesert(theme) {
        for(let i=0; i<25; i++) {
            const x = (Math.random()-0.5)*120;
            const z = (Math.random()-0.5)*120;
            const h = 2 + Math.random()*8;
            this.createBox(3, h, 3, x, h/2, z, theme.obstacle);
        }
        this.createBox(20, 0.2, 30, 30, 4, 30, theme.accent, -0.3, 0.5, 0);
    }
}
