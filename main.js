import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MapManager } from './mapManager.js';
import { WeaponSystem, WEAPON_DATA } from './weaponSystem.js';
import { NetworkManager } from './networkManager.js';

class Game {
    constructor() {
        window.gameInstance = this;
        window.startGame = () => this.startGame();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        document.body.appendChild(this.renderer.domElement);

        this.clock = new THREE.Clock();
        this.keys = {};
        this.isLocked = false;
        this.gameStarted = false;
        this.isDead = false;
        
        // Stats
        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.leaderboard = {}; // {id: {kills, deaths}}
        this.selectedMap = 'URBAN';
        this.selectedMode = 'ENDLESS_FFA';
        this.timeRemaining = 300; // 5 minutes

        // Default Keybinds
        this.keybinds = {
            forward: 'KeyW',
            backward: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            jump: 'Space',
            reload: 'KeyR',
            sprint: 'ShiftLeft'
        };

        this.initPhysics().then(() => {
            this.mapManager = new MapManager(this.scene, this.world);
            this.weaponSystem = new WeaponSystem(this.scene, this.camera);
            this.networkManager = new NetworkManager(this);
            this.initLights();
            this.initPlayer();
            this.setupEvents();
            this.initSettings();
            this.animate();
        });
    }

    onPlatformSelect(platform) {
        this.platform = platform;
        document.getElementById('platform-screen').classList.remove('active');
        
        const urlParams = new URLSearchParams(window.location.search);
        const isJoining = urlParams.get('join');

        if (isJoining) {
            document.getElementById('join-screen').classList.add('active');
            if (platform === 'MOBILE') {
                document.getElementById('mobile-controls').style.display = 'block';
            }
        } else {
            document.getElementById('map-screen').classList.add('active');
            if (platform === 'MOBILE') {
                document.getElementById('mobile-controls').style.display = 'block';
            }
        }
    }

    onMapSelect(map) {
        this.selectedMap = map;
        document.getElementById('map-screen').classList.remove('active');
        document.getElementById('mode-screen').classList.add('active');
    }

    onModeSelect(mode) {
        this.selectedMode = mode;
        document.getElementById('menu-container').style.display = 'none';
        this.startGame();
    }

    startGame() {
        this.gameStarted = true;
        this.mapManager.loadMap(this.selectedMap);
        
        // Handle Mode specific setup
        if (this.selectedMode.includes('SNIPER')) {
            this.weaponSystem.switchWeapon('SNIPER');
            // In a real game, you'd disable other slots, but for now we just switch
        }

        if (this.selectedMode.startsWith('TIME')) {
            this.startTimer();
        }

        if (this.platform === 'PC') {
            this.renderer.domElement.requestPointerLock();
        }
    }

    startTimer() {
        const timerEl = document.getElementById('timer');
        const interval = setInterval(() => {
            if (this.timeRemaining <= 0) {
                clearInterval(interval);
                this.gameStarted = false;
                this.showLeaderboard();
                return;
            }
            this.timeRemaining--;
            const mins = Math.floor(this.timeRemaining / 60);
            const secs = this.timeRemaining % 60;
            timerEl.innerText = `${mins}:${secs.toString().padStart(2, '0')}`;
        }, 1000);
    }

    initSettings() {
        const modal = document.getElementById('settings-modal');
        const btn = document.getElementById('settings-btn');
        const list = document.getElementById('bind-list');
        const close = document.getElementById('close-settings');
        const endBtn = document.getElementById('end-game-btn');

        btn.onclick = () => {
            modal.style.display = 'block';
            if (this.platform === 'PC') document.exitPointerLock();
        };

        close.onclick = () => {
            modal.style.display = 'none';
        };

        endBtn.onclick = () => {
            // Clear URL and reload to fully reset state
            window.history.replaceState({}, document.title, window.location.pathname);
            location.reload(); 
        };

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
    }

    async initPhysics() {
        await RAPIER.init();
        this.world = new RAPIER.World({ x: 0.0, y: -9.81, z: 0.0 });
    }

    initLights() {
        const ambient = new THREE.AmbientLight(0xffffff, 0.4);
        this.scene.add(ambient);

        const sun = new THREE.DirectionalLight(0xffffff, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.camera.left = -100;
        sun.shadow.camera.right = 100;
        sun.shadow.camera.top = 100;
        sun.shadow.camera.bottom = -100;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        const hemi = new THREE.HemisphereLight(0xeeeeff, 0xaa9988, 0.5);
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

        this.playerRotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.camera.position.set(0, 0.6, 0); 
        this.scene.add(this.camera);
    }

    setupEvents() {
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Backquote') {
                if (document.pointerLockElement === this.renderer.domElement) {
                    document.exitPointerLock();
                } else if (this.gameStarted && this.platform === 'PC') {
                    this.renderer.domElement.requestPointerLock();
                }
            }
            if (e.code === 'Digit1') this.weaponSystem.switchWeapon('RIFLE');
            if (e.code === 'Digit2') this.weaponSystem.switchWeapon('SNIPER');
            if (e.code === 'Digit3') this.weaponSystem.switchWeapon('DEAGLE');
            if (e.code === 'Digit4') this.weaponSystem.switchWeapon('PISTOL');
            if (e.code === 'Digit5') this.weaponSystem.switchWeapon('SHOTGUN');
            if (e.code === 'Digit6') this.weaponSystem.switchWeapon('GRENADE');
            if (e.code === 'Digit7') this.weaponSystem.switchWeapon('SWORD');
            if (e.code === this.keybinds.reload) this.weaponSystem.reload();
        });
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        window.addEventListener('mousedown', (e) => {
            if (!this.isLocked && this.platform === 'PC') return;
            if (e.button === 0) this.isShooting = true;
            if (e.button === 2) this.weaponSystem.setZoom(true);
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.isShooting = false;
            if (e.button === 2) this.weaponSystem.setZoom(false);
        });

        window.addEventListener('contextmenu', (e) => e.preventDefault());

        document.addEventListener('pointerlockchange', () => {
            this.isLocked = document.pointerLockElement === this.renderer.domElement;
            // No longer forcing menu show here. 
            // The menu only shows on game end or manual exit.
        });

        window.addEventListener('mousemove', (e) => {
            if (!this.isLocked || this.platform !== 'PC') return;
            const sensitivity = this.weaponSystem.isZoomed ? 0.0005 : 0.002;
            this.playerRotation.y -= e.movementX * sensitivity;
            this.playerRotation.x -= e.movementY * sensitivity;
            this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
        });

        window.addEventListener('mousedown', (e) => {
            if (this.gameStarted && !this.isLocked && this.platform === 'PC' && e.target === this.renderer.domElement) {
                this.renderer.domElement.requestPointerLock();
            }
            if (!this.isLocked && this.platform === 'PC') return;
            if (e.button === 0) this.isShooting = true;
            if (e.button === 2) this.weaponSystem.setZoom(true);
        });

        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Scroll Wheel Weapon Switching
        window.addEventListener('wheel', (e) => {
            if (this.platform === 'PC' && !this.isLocked) return;
            const weaponKeys = Object.keys(WEAPON_DATA);
            let currentIndex = weaponKeys.indexOf(this.weaponSystem.currentWeaponKey);
            
            if (e.deltaY > 0) {
                currentIndex = (currentIndex + 1) % weaponKeys.length;
            } else {
                currentIndex = (currentIndex - 1 + weaponKeys.length) % weaponKeys.length;
            }
            this.weaponSystem.switchWeapon(weaponKeys[currentIndex]);
        });

        this.lastTouchPos = {};
        this.setupMobileEvents();
    }

    setupMobileEvents() {
        const joyContainer = document.getElementById('joystick-container');
        const joyStick = document.getElementById('joystick-stick');
        let joyActive = false;
        let joyStart = { x: 0, y: 0 };

        const handleTouch = (e, callback) => {
            for (let i = 0; i < e.changedTouches.length; i++) {
                callback(e.changedTouches[i]);
            }
        };

        joyContainer.addEventListener('touchstart', (e) => {
            joyActive = true;
            joyStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
        });

        window.addEventListener('touchmove', (e) => {
            if (!this.gameStarted) return;
            
            handleTouch(e, (touch) => {
                // Joystick logic
                if (joyActive && touch.target.closest('#joystick-container')) {
                    const dx = touch.clientX - joyStart.x;
                    const dy = touch.clientY - joyStart.y;
                    const dist = Math.sqrt(dx*dx + dy*dy);
                    const maxDist = 50;
                    const angle = Math.atan2(dy, dx);
                    
                    const moveX = Math.cos(angle) * Math.min(dist, maxDist);
                    const moveY = Math.sin(angle) * Math.min(dist, maxDist);
                    
                    joyStick.style.transform = `translate(calc(-50% + ${moveX}px), calc(-50% + ${moveY}px))`;
                    
                    this.keys[this.keybinds.forward] = dy < -20;
                    this.keys[this.keybinds.backward] = dy > 20;
                    this.keys[this.keybinds.left] = dx < -20;
                    this.keys[this.keybinds.right] = dx > 20;
                } else if (touch.clientX > window.innerWidth / 2) {
                    // Look logic (right side of screen)
                    const sensitivity = 0.005;
                    // We need to track movement across frames for touch
                    if (touch.identifier in this.lastTouchPos) {
                        const movementX = touch.clientX - this.lastTouchPos[touch.identifier].x;
                        const movementY = touch.clientY - this.lastTouchPos[touch.identifier].y;
                        this.playerRotation.y -= movementX * sensitivity;
                        this.playerRotation.x -= movementY * sensitivity;
                        this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
                    }
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
            });
        });

        this.lastTouchPos = {};

        window.addEventListener('touchend', (e) => {
            handleTouch(e, (touch) => {
                if (joyActive) {
                    joyActive = false;
                    joyStick.style.transform = `translate(-50%, -50%)`;
                    this.keys[this.keybinds.forward] = false;
                    this.keys[this.keybinds.backward] = false;
                    this.keys[this.keybinds.left] = false;
                    this.keys[this.keybinds.right] = false;
                }
                delete this.lastTouchPos[touch.identifier];
            });
        });

        // Mobile Buttons
        const btnShoot = document.getElementById('btn-shoot');
        btnShoot.addEventListener('touchstart', (e) => { e.preventDefault(); this.isShooting = true; });
        btnShoot.addEventListener('touchend', () => this.isShooting = false);

        const btnJump = document.getElementById('btn-jump');
        btnJump.addEventListener('touchstart', (e) => { e.preventDefault(); this.keys[this.keybinds.jump] = true; });
        btnJump.addEventListener('touchend', () => this.keys[this.keybinds.jump] = false);

        document.getElementById('btn-reload').addEventListener('touchstart', (e) => { e.preventDefault(); this.weaponSystem.reload(); });
        document.getElementById('btn-scope').addEventListener('touchstart', (e) => { 
            e.preventDefault(); 
            this.weaponSystem.setZoom(!this.weaponSystem.isZoomed); 
        });
        document.getElementById('btn-switch').addEventListener('touchstart', (e) => {
            e.preventDefault();
            const weaponKeys = Object.keys(WEAPON_DATA);
            let currentIndex = weaponKeys.indexOf(this.weaponSystem.currentWeaponKey);
            currentIndex = (currentIndex + 1) % weaponKeys.length;
            this.weaponSystem.switchWeapon(weaponKeys[currentIndex]);
        });
    }

    updatePlayer(delta) {
        if (!this.gameStarted) return;

        if (this.isShooting) {
            const hitPoint = this.weaponSystem.shoot();
            if (hitPoint && this.networkManager) {
                this.networkManager.sendShoot(hitPoint);
            }
            // For mobile, we might want to auto-release if not a continuous fire weapon
            if (WEAPON_DATA[this.weaponSystem.currentWeaponKey].fireRate > 0.5 && this.platform === 'MOBILE') {
                this.isShooting = false;
            }
        }

        const isMoving = this.keys[this.keybinds.forward] || this.keys[this.keybinds.backward] || 
                         this.keys[this.keybinds.left] || this.keys[this.keybinds.right];
        this.weaponSystem.update(delta, performance.now() / 1000, isMoving);

        const isSprinting = this.keys[this.keybinds.sprint] || this.keys['ShiftRight'];
        const speed = isSprinting ? 8 : 4;
        const movement = new THREE.Vector3(0, 0, 0);
        
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.playerRotation.y, 0)));
        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, this.playerRotation.y, 0)));

        if (this.keys[this.keybinds.forward]) movement.add(forward);
        if (this.keys[this.keybinds.backward]) movement.sub(forward);
        if (this.keys[this.keybinds.left]) movement.sub(right);
        if (this.keys[this.keybinds.right]) movement.add(right);

        movement.normalize().multiplyScalar(speed * delta);

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

        if (this.networkManager) {
            this.networkManager.sendUpdate(nextPos, this.playerRotation.y);
        }

        this.onGround = this.characterController.computedGrounded();
        if (this.onGround) this.verticalVelocity = Math.max(0, this.verticalVelocity);

        this.camera.position.set(nextPos.x, nextPos.y + 0.6, nextPos.z);
        this.camera.quaternion.setFromEuler(this.playerRotation);
    }

    takeDamage(amount, attackerId) {
        if (this.isDead || !this.gameStarted) return;
        this.health -= amount;
        
        // Update local health bar
        const healthFill = document.getElementById('local-health-fill');
        if (healthFill) {
            healthFill.style.width = `${this.health}%`;
            if (this.health < 30) healthFill.style.backgroundColor = '#ff4444';
            else if (this.health < 60) healthFill.style.backgroundColor = '#ffff44';
            else healthFill.style.backgroundColor = '#00ff00';
        }

        if (this.networkManager) {
            this.networkManager.broadcast({ type: 'health', value: this.health });
        }
        if (this.health <= 0) {
            this.die(attackerId);
        }
    }

    die(attackerId) {
        this.isDead = true;
        this.deaths++;
        this.updateHUDStats();
        document.getElementById('death-screen').style.display = 'flex';
        
        if (this.networkManager) {
            this.networkManager.broadcast({ type: 'death', attacker: attackerId });
        }

        setTimeout(() => {
            this.respawn();
        }, 2000);
    }

    respawn() {
        this.isDead = false;
        this.health = 100;
        document.getElementById('death-screen').style.display = 'none';
        this.playerBody.setTranslation({ x: (Math.random()-0.5)*20, y: 5, z: (Math.random()-0.5)*20 }, true);
    }

    updateHUDStats() {
        document.getElementById('kill-count').innerText = this.kills;
        document.getElementById('death-count').innerText = this.deaths;
    }

    showLeaderboard() {
        const modal = document.getElementById('leaderboard-modal');
        const list = document.getElementById('leaderboard-list');
        list.innerHTML = '';
        
        // Add self to leaderboard
        const players = [{ id: 'YOU', kills: this.kills, deaths: this.deaths }, ...Object.values(this.networkManager.remotePlayerData || {})];
        players.sort((a, b) => b.kills - a.kills);

        players.forEach(p => {
            const row = document.createElement('div');
            row.className = 'leaderboard-row';
            row.innerHTML = `<span>Player ${p.id.slice(0,4)}</span> <span>K: ${p.kills} | D: ${p.deaths}</span>`;
            list.appendChild(row);
        });

        modal.style.display = 'block';
        document.exitPointerLock();
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        if (this.world) this.world.step();
        
        if (!this.isDead) this.updatePlayer(delta);
        
        this.renderer.render(this.scene, this.camera);
        this.updateHealthBars();
    }

    updateHealthBars() {
        if (!this.networkManager) return;
        Object.keys(this.networkManager.remotePlayers).forEach(id => {
            const mesh = this.networkManager.remotePlayers[id];
            const data = this.networkManager.remotePlayerData[id];
            if (!data || !data.healthBar) return;

            const vector = new THREE.Vector3();
            mesh.getWorldPosition(vector);
            vector.y += 1.2; // Above head
            vector.project(this.camera);

            if (vector.z > 1) {
                data.healthBar.style.display = 'none';
            } else {
                data.healthBar.style.display = 'block';
                const x = (vector.x * .5 + .5) * window.innerWidth;
                const y = (vector.y * -.5 + .5) * window.innerHeight;
                data.healthBar.style.left = `${x}px`;
                data.healthBar.style.top = `${y}px`;
                data.healthBar.querySelector('.health-bar-fill').style.width = `${data.health}%`;
            }
        });
    }
}

new Game();

