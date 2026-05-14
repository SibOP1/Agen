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
    HemisphereLight
} from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { MapManager } from './mapManager.js';
import { WeaponSystem, WEAPON_DATA } from './weaponSystem.js';
import { NetworkManager } from './networkManager.js';

const MODE_LABELS = {
    ENDLESS_FFA: 'Endless FFA',
    ENDLESS_TDM: 'Endless TDM',
    ENDLESS_SNIPER: 'Endless Sniper',
    TIME_FFA: 'Timed FFA',
    TIME_GUNGAME: 'Gun Game',
    TIME_TDM: 'Timed TDM',
    TIME_SNIPER: 'Timed Sniper'
};
const ALL_WEAPONS = Object.keys(WEAPON_DATA);
const GUNGAME_LADDER = ['PISTOL', 'DEAGLE', 'SHOTGUN', 'RIFLE', 'SNIPER', 'SWORD'];

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
        this.playerName = localStorage.getItem('player_name') || `Player-${Math.floor(Math.random() * 9000 + 1000)}`;
        localStorage.setItem('player_name', this.playerName);
        this.normalSensitivity = Number(localStorage.getItem('normal_sensitivity') || 1);
        this.scopedSensitivity = Number(localStorage.getItem('scoped_sensitivity') || 0.55);

        this.health = 100;
        this.kills = 0;
        this.deaths = 0;
        this.gunGameLevel = 0;
        this.selectedMap = 'URBAN';
        this.selectedMode = 'ENDLESS_FFA';
        this.timeRemaining = 300;
        this.isSliding = false;
        this.slideTimer = 0;
        this.slideCooldown = 0;
        this.slideDirection = new Vector3(0, 0, -1);

        this.keybinds = {
            forward: 'KeyW',
            backward: 'KeyS',
            left: 'KeyA',
            right: 'KeyD',
            jump: 'Space',
            reload: 'KeyR',
            sprint: 'ShiftLeft',
            slide: 'ControlLeft'
        };

        this.initPhysics().then(() => {
            this.mapManager = new MapManager(this.scene, this.world);
            this.weaponSystem = new WeaponSystem(this.scene, this.camera);
            this.networkManager = new NetworkManager(this);
            this.initLights();
            this.initPlayer();
            this.setupEvents();
            this.initSettings();
            this.updateHUDStats();
            this.animate();
        });
    }

    onPlatformSelect(platform) {
        this.platform = platform;
        const menuNameInput = document.getElementById('menu-player-name-input');
        if (menuNameInput?.value.trim()) {
            this.playerName = menuNameInput.value.trim().slice(0, 16);
            localStorage.setItem('player_name', this.playerName);
        }
        document.getElementById('platform-screen').classList.remove('active');
        document.getElementById('mobile-controls').style.display = platform === 'MOBILE' ? 'block' : 'none';

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('join')) {
            document.getElementById('join-screen').classList.add('active');
        } else {
            document.getElementById('map-screen').classList.add('active');
        }
    }

    onMapSelect(map) {
        this.selectedMap = map;
        document.getElementById('map-screen').classList.remove('active');
        document.getElementById('mode-screen').classList.add('active');
        if (this.networkManager?.isHost) this.networkManager.sendSettings();
    }

    onModeSelect(mode) {
        this.selectedMode = mode;
        this.startGame();
    }

    startGame(fromNetwork = false) {
        if (this.gameStarted) return;
        this.gameStarted = true;
        this.matchEnded = false;
        this.isDead = false;
        this.health = 100;
        this.teamScores = { RED: 0, BLUE: 0 };
        this.gunGameLevel = 0;
        this.timeRemaining = 300;
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
        this.updateHUDStats();
    }

    applyModeRules() {
        if (this.isSniperMode()) {
            this.weaponSystem.setAllowedWeapons(['SNIPER']);
        } else if (this.isGunGameMode()) {
            this.weaponSystem.setAllowedWeapons([GUNGAME_LADDER[this.gunGameLevel]]);
        } else {
            this.weaponSystem.setAllowedWeapons(ALL_WEAPONS);
        }
    }

    isTimedMode() {
        return this.selectedMode.startsWith('TIME');
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
        this.matchEnded = true;
        this.gameStarted = false;
        this.isShooting = false;
        clearInterval(this.timerInterval);
        this.showLeaderboard();
        if (announce && this.networkManager) this.networkManager.broadcast({ type: 'end-match' });
    }

    initSettings() {
        const modal = document.getElementById('settings-modal');
        const btn = document.getElementById('settings-btn');
        const list = document.getElementById('bind-list');
        const close = document.getElementById('close-settings');
        const endBtn = document.getElementById('end-game-btn');
        const nameInput = document.getElementById('player-name-input');
        const normalSens = document.getElementById('normal-sens');
        const scopedSens = document.getElementById('scoped-sens');
        const normalValue = document.getElementById('normal-sens-value');
        const scopedValue = document.getElementById('scoped-sens-value');
        const menuNameInput = document.getElementById('menu-player-name-input');

        nameInput.value = this.playerName;
        if (menuNameInput) menuNameInput.value = this.playerName;
        normalSens.value = this.normalSensitivity;
        scopedSens.value = this.scopedSensitivity;
        normalValue.innerText = this.normalSensitivity.toFixed(2);
        scopedValue.innerText = this.scopedSensitivity.toFixed(2);

        nameInput.oninput = () => {
            const cleaned = nameInput.value.trim().slice(0, 16);
            this.playerName = cleaned || 'Player';
            if (menuNameInput) menuNameInput.value = this.playerName;
            localStorage.setItem('player_name', this.playerName);
            if (this.networkManager) this.networkManager.sendStats();
        };

        if (menuNameInput) {
            menuNameInput.oninput = () => {
                const cleaned = menuNameInput.value.trim().slice(0, 16);
                this.playerName = cleaned || 'Player';
                nameInput.value = this.playerName;
                localStorage.setItem('player_name', this.playerName);
                if (this.networkManager) this.networkManager.sendStats();
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

        btn.onclick = () => {
            modal.style.display = 'block';
            if (this.platform === 'PC') document.exitPointerLock();
        };

        close.onclick = () => {
            modal.style.display = 'none';
            if (this.gameStarted && !this.isDead && this.platform === 'PC') {
                this.renderer.domElement.requestPointerLock();
            }
        };

        endBtn.onclick = () => {
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
        });

        window.addEventListener('wheel', (e) => {
            if (this.platform === 'PC' && !this.isLocked) return;
            e.preventDefault();
            this.weaponSystem.cycleWeapon(e.deltaY > 0 ? 1 : -1);
        }, { passive: false });

        this.lastTouchPos = {};
        this.setupMobileEvents();
    }

    setupMobileEvents() {
        const joyContainer = document.getElementById('joystick-container');
        const joyStick = document.getElementById('joystick-stick');
        let joystickId = null;
        let joyStart = { x: 0, y: 0 };
        const touchOptions = { passive: false };

        const clearJoystick = () => {
            joystickId = null;
            joyStick.style.transform = 'translate(-50%, -50%)';
            this.keys[this.keybinds.forward] = false;
            this.keys[this.keybinds.backward] = false;
            this.keys[this.keybinds.left] = false;
            this.keys[this.keybinds.right] = false;
        };

        joyContainer.addEventListener('touchstart', (e) => {
            e.preventDefault();
            const touch = e.changedTouches[0];
            joystickId = touch.identifier;
            joyStart = { x: touch.clientX, y: touch.clientY };
        }, touchOptions);

        window.addEventListener('touchstart', (e) => {
            if (!this.gameStarted) return;
            for (const touch of e.changedTouches) {
                const target = document.elementFromPoint(touch.clientX, touch.clientY);
                if (target?.closest('.mobile-btn') || target?.closest('#joystick-container')) continue;
                if (touch.clientX > window.innerWidth / 2) {
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, touchOptions);

        window.addEventListener('touchmove', (e) => {
            if (!this.gameStarted) return;
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (touch.identifier === joystickId) {
                    const dx = touch.clientX - joyStart.x;
                    const dy = touch.clientY - joyStart.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    const maxDist = 50;
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
                    const sensitivity = this.getLookSensitivity('touch');
                    const movementX = touch.clientX - this.lastTouchPos[touch.identifier].x;
                    const movementY = touch.clientY - this.lastTouchPos[touch.identifier].y;
                    this.playerRotation.y -= movementX * sensitivity;
                    this.playerRotation.x -= movementY * sensitivity;
                    this.playerRotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.playerRotation.x));
                    this.lastTouchPos[touch.identifier] = { x: touch.clientX, y: touch.clientY };
                }
            }
        }, touchOptions);

        const endTouch = (e) => {
            for (const touch of e.changedTouches) {
                if (touch.identifier === joystickId) clearJoystick();
                delete this.lastTouchPos[touch.identifier];
            }
        };
        window.addEventListener('touchend', endTouch, touchOptions);
        window.addEventListener('touchcancel', endTouch, touchOptions);

        const bindTouchButton = (id, start, end = null) => {
            const el = document.getElementById(id);
            el.addEventListener('touchstart', (e) => {
                e.preventDefault();
                start();
            }, touchOptions);
            if (end) {
                el.addEventListener('touchend', (e) => {
                    e.preventDefault();
                    end();
                }, touchOptions);
                el.addEventListener('touchcancel', (e) => {
                    e.preventDefault();
                    end();
                }, touchOptions);
            }
        };

        bindTouchButton('btn-shoot', () => this.isShooting = true, () => this.isShooting = false);
        bindTouchButton('btn-jump', () => this.keys[this.keybinds.jump] = true, () => this.keys[this.keybinds.jump] = false);
        bindTouchButton('btn-reload', () => this.weaponSystem.reload());
        bindTouchButton('btn-scope', () => this.weaponSystem.setZoom(!this.weaponSystem.isZoomed));
        bindTouchButton('btn-switch', () => this.weaponSystem.cycleWeapon(1));
        bindTouchButton('btn-slide', () => this.slideRequested = true);
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

    updatePlayer(delta) {
        if (!this.gameStarted) return;

        if (this.isShooting) {
            const hitPoint = this.weaponSystem.shoot();
            if (hitPoint && this.networkManager) this.networkManager.sendShoot(hitPoint);
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
        if (this.networkManager) this.networkManager.sendUpdate(nextPos, this.playerRotation.y);

        this.onGround = this.characterController.computedGrounded();
        if (this.onGround) this.verticalVelocity = Math.max(0, this.verticalVelocity);

        const cameraHeight = this.isSliding ? 0.32 : 0.6;
        this.camera.position.set(nextPos.x, nextPos.y + cameraHeight, nextPos.z);
        this.camera.quaternion.setFromEuler(this.playerRotation);
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
        if (this.networkManager) this.networkManager.broadcast({ type: 'health', value: this.health });
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

        if (this.networkManager) {
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

    handleLocalKill() {
        this.kills++;
        if (this.isTeamMode() && this.team) this.teamScores[this.team] = (this.teamScores[this.team] || 0) + 1;
        if (this.isGunGameMode()) this.advanceGunGame();
        this.weaponSystem.playSound(800, 'sine', 0.1, 0.2);
        this.updateHUDStats();
        if (this.networkManager) this.networkManager.sendStats();
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
        document.getElementById('death-screen').style.display = 'none';

        const playerOffset = Object.keys(this.networkManager?.remotePlayerData || {}).length;
        const spawnPos = this.mapManager.getSpawnPoint(this.spawnIndex++ + playerOffset);
        this.playerBody.setTranslation(spawnPos, true);

        if (this.gameStarted && this.platform === 'PC' && !initial) {
            this.renderer.domElement.requestPointerLock();
        }

        if (this.networkManager) {
            this.networkManager.broadcast({ type: 'health', value: 100 });
            this.networkManager.sendUpdate(spawnPos, this.playerRotation.y, true);
            this.networkManager.broadcast({ type: 'protection', value: true });
            this.networkManager.sendStats();
        }

        setTimeout(() => {
            this.isSpawnProtected = false;
            if (this.networkManager) this.networkManager.broadcast({ type: 'protection', value: false });
        }, 2000);
    }

    updateHUDStats() {
        document.getElementById('kill-count').innerText = this.kills;
        document.getElementById('death-count').innerText = this.deaths;
        document.getElementById('mode-label').innerText = MODE_LABELS[this.selectedMode] || this.selectedMode;
        document.getElementById('team-label').innerText = this.isTeamMode() ? this.team : '-';
        document.getElementById('team-score').innerText = this.isTeamMode() ? `R ${this.teamScores.RED || 0} / B ${this.teamScores.BLUE || 0}` : '-';
        document.getElementById('player-count').innerText = 1 + Object.keys(this.networkManager?.remotePlayerData || {}).length;
    }

    getLocalPlayerInfo() {
        return {
            id: this.networkManager?.myId,
            name: this.playerName,
            team: this.team,
            health: this.health,
            kills: this.kills,
            deaths: this.deaths,
            gunGameLevel: this.gunGameLevel
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

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();
        if (this.world) this.world.step();
        if (!this.isDead) this.updatePlayer(delta);
        if (this.networkManager) this.networkManager.update(delta);
        this.renderer.render(this.scene, this.camera);
    }
}

new Game();
