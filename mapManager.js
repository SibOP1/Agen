import { 
    BoxGeometry, 
    MeshStandardMaterial, 
    Mesh, 
    Vector3, 
    SphereGeometry,
    PlaneGeometry,
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
        const geo = new BoxGeometry(w, h, d);
        const mat = new MeshStandardMaterial({ color });
        const mesh = new Mesh(geo, mat);
        mesh.position.set(x, y, z);
        mesh.rotation.set(rotX, rotY, rotZ);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.meshes.push(mesh);

        if (!noPhysics) {
            const desc = RAPIER.ColliderDesc.cuboid(w / 2, h / 2, d / 2)
                .setTranslation(x, y, z)
                .setRotation(new Quaternion().setFromEuler(new Euler(rotX, rotY, rotZ)));
            const collider = this.world.createCollider(desc);
            this.colliders.push(collider);
        }
        return mesh;
    }

    // Simple pseudo-random generator with a seed
    seededRandom(seed) {
        let s = seed;
        return function() {
            s = (s * 9301 + 49297) % 233280;
            return s / 233280;
        };
    }

    loadMap(themeName, seed = 12345) {
        this.clear();
        this.currentTheme = themeName;
        const theme = this.themes[themeName];
        const random = this.seededRandom(seed);

        this.scene.background = new Color(theme.sky);
        this.scene.fog = new FogExp2(theme.sky, 0.015);

        // Floor
        this.createBox(200, 0.2, 200, 0, -0.1, 0, theme.floor);

        // Add Trees & Grass (using seeded random)
        for(let i=0; i<30; i++) {
            const tx = (random()-0.5)*150;
            const tz = (random()-0.5)*150;
            if (Math.abs(tx) > 10 || Math.abs(tz) > 10) {
                // Trunk
                const trunkH = 1 + random() * 2;
                this.createBox(0.4, trunkH, 0.4, tx, trunkH / 2, tz, 0x4d2902);
                // Foliage
                const foliageH = 2 + random() * 2;
                const foliageW = 1.5 + random();
                this.createBox(foliageW, foliageH, foliageW, tx, trunkH + foliageH / 2, tz, theme.treeColor);
            }
        }

        if (themeName === 'URBAN') this.buildUrban(theme, random);
        else if (themeName === 'SCIFI') this.buildSciFi(theme, random);
        else if (themeName === 'DESERT') this.buildDesert(theme, random);
    }

    buildUrban(theme, random) {
        for(let i=0; i<20; i++) {
            const x = (random()-0.5)*100;
            const z = (random()-0.5)*100;
            const h = 1 + random()*3;
            this.createBox(2, h, 4, x, h/2, z, theme.obstacle);
        }
    }

    buildSciFi(theme, random) {
        for(let i=0; i<15; i++) {
            const x = (random()-0.5)*100;
            const z = (random()-0.5)*100;
            this.createBox(1, 15, 1, x, 7.5, z, theme.accent);
        }
    }

    buildDesert(theme, random) {
        for(let i=0; i<25; i++) {
            const x = (random()-0.5)*120;
            const z = (random()-0.5)*120;
            const h = 2 + random()*8;
            this.createBox(3, h, 3, x, h/2, z, theme.obstacle);
        }
    }
}
