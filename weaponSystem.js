import { 
    Group, 
    BoxGeometry, 
    MeshStandardMaterial, 
    Mesh, 
    Vector3,
    Vector2,
    Raycaster,    Quaternion, 
    Euler,
    Object3D,
    Points,
    BufferGeometry,
    Float32BufferAttribute,
    PointsMaterial,
    AudioListener,
    MeshBasicMaterial,
    SphereGeometry,
    MathUtils
} from 'three';

export const WEAPON_DATA = {
    RIFLE: { name: 'Rifle', fireRate: 0.1, damage: 20, clip: 30, maxAmmo: 90, type: 'hitscan', spread: 0.02, zoom: 0, reloadTime: 1.5, size: [0.06, 0.08, 0.4] },
    SNIPER: { name: 'Sniper', fireRate: 1.5, damage: 100, clip: 5, maxAmmo: 20, type: 'hitscan', spread: 0, zoom: 15, reloadTime: 2.5, size: [0.06, 0.08, 0.7] },
    DEAGLE: { name: 'Deagle', fireRate: 0.5, damage: 50, clip: 7, maxAmmo: 35, type: 'hitscan', spread: 0.01, zoom: 0, reloadTime: 1.8, size: [0.07, 0.12, 0.25] },
    PISTOL: { name: 'Silenced Pistol', fireRate: 0.2, damage: 15, clip: 12, maxAmmo: 60, type: 'hitscan', spread: 0.015, zoom: 0, reloadTime: 1.2, size: [0.04, 0.08, 0.2] },
    SHOTGUN: { name: 'Shotgun', fireRate: 1.0, damage: 15, clip: 6, maxAmmo: 24, type: 'hitscan', pellets: 8, spread: 0.1, zoom: 0, reloadTime: 2.0, size: [0.08, 0.1, 0.5], needsPump: true },
    GRENADE: { name: 'Grenade Launcher', fireRate: 1.2, damage: 80, clip: 4, maxAmmo: 12, type: 'projectile', zoom: 0, reloadTime: 2.2, size: [0.1, 0.12, 0.4] },
    SWORD: { name: 'Sword', fireRate: 0.5, damage: 60, type: 'melee', range: 4, zoom: 0, size: [0.02, 0.5, 0.05] }
};

export class WeaponSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.currentWeaponKey = 'RIFLE';
        this.isZoomed = false;
        this.isReloading = false;
        this.lastFireTime = 0;
        this.projectiles = [];
        
        this.ammoStates = {};
        Object.keys(WEAPON_DATA).forEach(key => {
            const data = WEAPON_DATA[key];
            if (data.clip) {
                this.ammoStates[key] = { clip: data.clip, reserve: data.maxAmmo };
            }
        });

        this.initAudio();
        this.initViewmodel();
    }

    initAudio() {
        this.listener = new AudioListener();
        this.camera.add(this.listener);
        this.ctx = this.listener.context;
    }

    playSound(freq, type, duration, volume) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        gain.gain.setValueAtTime(volume, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playShootSound() {
        const data = WEAPON_DATA[this.currentWeaponKey];
        if (this.currentWeaponKey === 'SWORD') this.playSound(400, 'sine', 0.2, 0.1);
        else if (this.currentWeaponKey === 'SNIPER') this.playSound(100, 'square', 0.4, 0.2);
        else if (this.currentWeaponKey === 'SHOTGUN') this.playSound(80, 'sawtooth', 0.3, 0.2);
        else this.playSound(200, 'square', 0.1, 0.1);
    }

    playReloadSound() { this.playSound(300, 'sine', 0.5, 0.05); }
    playFootstepSound() { this.playSound(50, 'sine', 0.05, 0.02); }
    playJumpSound() { this.playSound(150, 'sine', 0.2, 0.05); }

    initViewmodel() {
        this.viewmodelGroup = new Group();
        this.camera.add(this.viewmodelGroup);
        this.initToolbar();
        this.updateViewmodelMesh();
    }

    initToolbar() {
        const toolbar = document.getElementById('weapon-toolbar');
        if (!toolbar) return;
        toolbar.innerHTML = '';
        Object.keys(WEAPON_DATA).forEach((key, index) => {
            const slot = document.createElement('div');
            slot.className = `weapon-slot ${key === this.currentWeaponKey ? 'active' : ''}`;
            slot.id = `slot-${key}`;
            slot.innerHTML = index + 1;
            toolbar.appendChild(slot);
        });
    }

    updateViewmodelMesh() {
        if (this.gunMesh) this.viewmodelGroup.remove(this.gunMesh);
        const data = WEAPON_DATA[this.currentWeaponKey];
        const geo = new BoxGeometry(...data.size);
        const mat = new MeshStandardMaterial({ color: this.currentWeaponKey === 'SWORD' ? 0xcccccc : 0x222222 });
        this.gunMesh = new Mesh(geo, mat);
        
        if (this.currentWeaponKey === 'SWORD') {
            this.gunMesh.position.set(0.4, -0.4, -0.6);
            this.gunMesh.rotation.set(Math.PI/4, 0, 0);
        } else {
            this.gunMesh.position.set(0.25, -0.25, -0.5);
        }
        
        this.viewmodelGroup.add(this.gunMesh);
        this.originalGunPos = this.gunMesh.position.clone();
        this.originalGunRot = this.gunMesh.rotation.clone();
    }

    switchWeapon(key) {
        if (!WEAPON_DATA[key] || this.isReloading) return;
        
        const oldSlot = document.getElementById(`slot-${this.currentWeaponKey}`);
        if (oldSlot) oldSlot.classList.remove('active');
        
        this.currentWeaponKey = key;
        const newSlot = document.getElementById(`slot-${this.currentWeaponKey}`);
        if (newSlot) newSlot.classList.add('active');

        this.setZoom(false);
        this.updateViewmodelMesh();
        this.updateHUD();
    }

    updateHUD() {
        const data = WEAPON_DATA[this.currentWeaponKey];
        const state = this.ammoStates[this.currentWeaponKey];
        document.getElementById('weapon-name').innerText = data.name;
        if (state) {
            document.getElementById('ammo').innerText = `${state.clip} / ${state.reserve}`;
            document.getElementById('reload-msg').style.display = (state.clip === 0 && state.reserve > 0) ? 'block' : 'none';
        } else {
            document.getElementById('ammo').innerText = '∞';
            document.getElementById('reload-msg').style.display = 'none';
        }
    }

    setZoom(active) {
        const data = WEAPON_DATA[this.currentWeaponKey];
        if (data.zoom > 0) {
            this.isZoomed = active;
            this.camera.fov = active ? data.zoom : 75;
            this.camera.updateProjectionMatrix();
            document.getElementById('scope').style.display = active ? 'block' : 'none';
            document.getElementById('crosshair').style.display = active ? 'none' : 'block';
            this.viewmodelGroup.visible = !active;
        }
    }

    reload() {
        const data = WEAPON_DATA[this.currentWeaponKey];
        const state = this.ammoStates[this.currentWeaponKey];
        if (!state || this.isReloading || state.clip === data.clip || state.reserve <= 0) return;

        this.isReloading = true;
        this.setZoom(false);
        this.playReloadSound();
        
        const reloadDuration = data.reloadTime * 1000;
        const startTime = performance.now();

        const animateReload = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / reloadDuration, 1);
            this.gunMesh.rotation.x = this.originalGunRot.x + Math.sin(progress * Math.PI) * 1.5;

            if (progress < 1) requestAnimationFrame(animateReload);
            else {
                this.isReloading = false;
                const needed = data.clip - state.clip;
                const transfer = Math.min(needed, state.reserve);
                state.clip += transfer;
                state.reserve -= transfer;
                this.updateHUD();
                this.gunMesh.rotation.copy(this.originalGunRot);
            }
        };
        requestAnimationFrame(animateReload);
    }

    shoot() {
        if (this.isReloading) return null;
        const now = performance.now();
        const data = WEAPON_DATA[this.currentWeaponKey];
        const state = this.ammoStates[this.currentWeaponKey];

        if (now - this.lastFireTime < data.fireRate * 1000) return null;
        if (state && state.clip <= 0) return null;

        this.lastFireTime = now;
        if (state) state.clip--;
        this.updateHUD();
        this.playShootSound();

        // Animation
        this.gunMesh.position.z += 0.1;
        setTimeout(() => {
            this.gunMesh.position.z -= 0.1;
            if (data.needsPump) {
                this.gunMesh.rotation.x -= 0.5;
                setTimeout(() => this.gunMesh.rotation.x += 0.5, 200);
            }
        }, 50);

        let hitPoint = null;
        if (data.type === 'hitscan') hitPoint = this.fireHitscan(data);
        else if (data.type === 'melee') hitPoint = this.fireMelee(data);
        else if (data.type === 'projectile') hitPoint = this.fireProjectile(data);

        return hitPoint;
    }

    fireHitscan(data) {
        const raycaster = new Raycaster();
        const count = data.pellets || 1;
        let lastHit = null;
        for(let i=0; i<count; i++) {
            raycaster.setFromCamera(new Vector2(0,0), this.camera);
            if (data.spread > 0) {
                raycaster.ray.direction.x += (Math.random() - 0.5) * data.spread;
                raycaster.ray.direction.y += (Math.random() - 0.5) * data.spread;
            }
            const intersects = raycaster.intersectObjects(this.scene.children, true);
            if (intersects.length > 0) {
                this.createImpactEffect(intersects[0].point, 0xffff00);
                lastHit = intersects[0].point;

                // Check for player hits
                this.checkPlayerHit(intersects[0].object, data.damage);
            }
        }
        return lastHit;
    }

    checkPlayerHit(object, damage) {
        // Find if this object belongs to a remote player
        const nm = window.gameInstance.networkManager;
        if (!nm) return;

        Object.keys(nm.remotePlayers).forEach(id => {
            const group = nm.remotePlayers[id];
            let isHit = false;
            group.traverse(child => {
                if (child === object) isHit = true;
            });

            if (isHit) {
                nm.broadcast({ type: 'hit', target: id, damage: damage });
            }
        });
    }

    fireMelee(data) {
        // Sword Swing Animation
        const startTime = performance.now();
        const animateSwing = (now) => {
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / 200, 1);
            this.gunMesh.rotation.y = Math.sin(progress * Math.PI) * 2;
            if (progress < 1) requestAnimationFrame(animateSwing);
            else this.gunMesh.rotation.copy(this.originalGunRot);
        };
        requestAnimationFrame(animateSwing);

        const raycaster = new Raycaster();
        raycaster.setFromCamera(new Vector2(0,0), this.camera);
        const intersects = raycaster.intersectObjects(this.scene.children, true);
        if (intersects.length > 0 && intersects[0].distance < data.range) {
            this.createImpactEffect(intersects[0].point, 0xff0000);
            this.checkPlayerHit(intersects[0].object, data.damage);
            return intersects[0].point;
        }
        return null;
    }

    fireProjectile(data) {
        const geo = new SphereGeometry(0.1);
        const mat = new MeshBasicMaterial({ color: 0xff4400 });
        const mesh = new Mesh(geo, mat);
        
        const pos = new Vector3();
        this.camera.getWorldPosition(pos);
        const dir = new Vector3();
        this.camera.getWorldDirection(dir);
        
        mesh.position.copy(pos).add(dir.clone().multiplyScalar(0.5));
        this.scene.add(mesh);
        this.projectiles.push({ mesh, velocity: dir.multiplyScalar(20), life: 2.0, damage: data.damage });
    }

    createImpactEffect(point, color, size = 0.05) {
        const geo = new SphereGeometry(size, 4, 4);
        const mat = new MeshBasicMaterial({ color });
        const mesh = new Mesh(geo, mat);
        mesh.position.copy(point);
        this.scene.add(mesh);
        setTimeout(() => this.scene.remove(mesh), 200);
    }

    explode(point, damage) {
        this.playSound(50, 'sawtooth', 0.5, 0.3);
        for(let i=0; i<10; i++) {
            const p = point.clone().add(new Vector3((Math.random()-0.5)*2, (Math.random()-0.5)*2, (Math.random()-0.5)*2));
            this.createImpactEffect(p, 0xffaa00, 0.3);
        }

        // Area of effect damage
        const nm = window.gameInstance.networkManager;
        if (!nm) return;
        Object.keys(nm.remotePlayers).forEach(id => {
            const mesh = nm.remotePlayers[id];
            if (mesh.position.distanceTo(point) < 5) {
                nm.broadcast({ type: 'hit', target: id, damage: damage });
            }
        });
    }

    update(delta, time, isMoving) {
        // Projectiles
        for(let i = this.projectiles.length-1; i>=0; i--) {
            const p = this.projectiles[i];
            const moveStep = p.velocity.clone().multiplyScalar(delta);
            
            // Raycast for collision check before moving
            const ray = new Raycaster(p.mesh.position, moveStep.clone().normalize(), 0, moveStep.length() + 0.1);
            const intersects = ray.intersectObjects(this.scene.children, true);

            if (intersects.length > 0 || p.mesh.position.y < -0.1 || p.life <= 0) {
                this.explode(intersects.length > 0 ? intersects[0].point : p.mesh.position, p.damage);
                this.scene.remove(p.mesh);
                this.projectiles.splice(i, 1);
            } else {
                p.mesh.position.add(moveStep);
                p.life -= delta;
            }
        }

        // Bobbing
        if (isMoving && !this.isZoomed) {
            const bobSpeed = 12;
            const bobAmount = 0.015;
            this.gunMesh.position.y = this.originalGunPos.y + Math.sin(time * bobSpeed) * bobAmount;
            this.gunMesh.position.x = this.originalGunPos.x + Math.cos(time * bobSpeed * 0.5) * bobAmount;
        } else {
            this.gunMesh.position.y = MathUtils.lerp(this.gunMesh.position.y, this.originalGunPos.y, 0.1);
            this.gunMesh.position.x = MathUtils.lerp(this.gunMesh.position.x, this.originalGunPos.x, 0.1);
        }
    }
}
