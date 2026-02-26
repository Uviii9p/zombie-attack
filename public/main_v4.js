import * as THREE from 'three';
import { Player } from './player_v4.js';
import { ZombieManager } from './zombie_v4.js';
import { MapManager } from './map_v4.js';
import { MultiplayerManager } from './multiplayer.js';
import { audioSystem } from './audio.js';
import { GameUI } from './ui.js';

class Game {
    constructor() {
        this.setupRenderer();
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 2000);

        this.ui = new GameUI();
        this.player = new Player(this.scene, this.camera);
        this.zombieManager = new ZombieManager(this.scene);
        this.mapManager = new MapManager(this.scene);
        this.multiplayer = new MultiplayerManager(this.scene);
        this.socket = null; // Will be set by lobby/auth
        this.input = { keys: {}, mouse: { x: 0, y: 0, down: false } };

        this.wave = 1;
        this.waveInProgress = false;
        this.isGameOver = false;
        this.gameStarted = false;
        this.dayCycle = 0; // 0 to 1

        this.init();
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        document.getElementById('game-container').appendChild(this.renderer.domElement);
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    init() {
        this.mapManager.createDesertMap();
        this.setupLights();
        this.setupEvents();

        this.clock = new THREE.Clock();

        // Initial UI
        this.ui.updateCoins(this.player.coins);
        this.ui.updateXP(this.player.level, 0, this.player.skillPoints);

        // Hide Loading Screen
        setTimeout(() => {
            const ls = document.getElementById('loading-screen');
            if (ls) ls.classList.add('hidden');
        }, 500);

        window.addEventListener('resize', () => this.onResize());

        this.loop();
    }

    setupLights() {
        this.ambient = new THREE.AmbientLight(0x404040, 0.5);
        this.scene.add(this.ambient);

        this.sun = new THREE.DirectionalLight(0xffffff, 1.2);
        this.sun.position.set(50, 100, 50);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.set(2048, 2048);
        this.scene.add(this.sun);

        this.scene.fog = new THREE.FogExp2(0x1a1a2e, 0.01);
    }

    setupEvents() {
        window.addEventListener('keydown', e => {
            this.input.keys[e.code] = true;
            if (e.code === 'KeyB') this.ui.toggleShop(!this.ui.shopScreen.classList.contains('hidden'));
            if (e.code === 'Tab') this.ui.toggleBackpack(!this.ui.backpackScreen.classList.contains('hidden'), this.player);

            // Weapon switching
            const weaponKeys = ['Digit1', 'Digit2', 'Digit3'];
            const idx = weaponKeys.indexOf(e.code);
            if (idx !== -1 && this.player.inventory[idx]) {
                this.player.currentWeapon = this.player.inventory[idx];
                this.player.updateWeaponModel();
                audioSystem.play('ui_hover');
            }
        });
        window.addEventListener('keyup', e => this.input.keys[e.code] = false);
        window.addEventListener('mousedown', () => {
            if (!this.gameStarted || this.isGameOver) return;
            if (document.pointerLockElement) {
                this.input.mouse.down = true;
            } else {
                this.renderer.domElement.requestPointerLock()?.catch(e => {
                    console.warn("Pointer lock request failed:", e);
                });
            }
        });
        window.addEventListener('mouseup', () => this.input.mouse.down = false);
        window.addEventListener('mousemove', e => {
            if (document.pointerLockElement) {
                const sens = 0.002;
                this.player.group.rotation.y -= e.movementX * sens;
                if (this.player.pitch) {
                    this.player.pitch.rotation.x -= e.movementY * sens;
                    this.player.pitch.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, this.player.pitch.rotation.x));
                }
            }
        });

        document.getElementById('start-btn').onclick = () => this.start();
        document.querySelectorAll('.buy-btn').forEach(btn => {
            btn.onclick = () => this.handlePurchase(btn);
        });
    }

    handlePurchase(btn) {
        const cost = parseInt(btn.dataset.cost);
        const item = btn.parentElement;
        const id = item.dataset.id;
        const type = item.dataset.type;

        if (this.player.coins >= cost) {
            this.player.coins -= cost;
            this.ui.updateCoins(this.player.coins);
            this.applyUpgrade(id, type);
            audioSystem.play('buy');
        } else {
            audioSystem.play('error');
        }
    }

    applyUpgrade(id, type) {
        if (type === 'weapon') {
            if (!this.player.inventory.includes(id)) {
                this.player.inventory.push(id);
                this.player.currentWeapon = id;
                this.player.updateWeaponModel();
            }
        } else if (type === 'ammo') {
            if (this.player.weapons[id]) {
                const amount = id === 'Sniper' ? 10 : (id === 'RPG' ? 5 : (id === 'Grenade' ? 3 : 30));
                this.player.weapons[id].reserve += amount;
            }
        } else if (type === 'upgrade') {
            if (id === 'medkit') {
                this.player.health = Math.min(this.player.maxHealth, this.player.health + 50);
                this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
            }
        }
    }

    start() {
        this.gameStarted = true;
        audioSystem.init(); // Initialize audio on user interaction
        document.getElementById('menu-screen').classList.add('hidden');
        this.startWave();
    }

    startWave() {
        this.waveInProgress = true;
        this.ui.announceWave(`WAVE ${this.wave}`);
        const count = 5 + this.wave * 3;

        let spawned = 0;
        const interval = setInterval(() => {
            if (spawned >= count) {
                clearInterval(interval);
                return;
            }
            this.zombieManager.spawnZombie(this.wave);
            spawned++;
        }, 1000);
    }

    checkCollisions() {
        // Raycast shooting
        if (this.input.mouse.down && this.player.fire()) {
            const ray = new THREE.Raycaster();
            const dir = new THREE.Vector3();
            this.camera.getWorldDirection(dir);
            ray.set(this.camera.position, dir);

            const intersects = ray.intersectObjects(this.zombieManager.zombies.map(z => z.mesh), true);
            if (intersects.length > 0) {
                const hitMesh = intersects[0].object;
                // Find zombie owner
                let target = hitMesh;
                while (target.parent && !target.userData.zombie) {
                    target = target.parent;
                }
                const zombie = this.zombieManager.zombies.find(z => z.mesh === target || z.mesh.uuid === hitMesh.parent?.uuid || z.mesh.uuid === hitMesh.uuid);

                if (zombie && !zombie.isDead) {
                    const damage = this.player.weapons[this.player.currentWeapon]?.damage || 25;
                    zombie.takeDamage(damage);
                    this.multiplayer.sendZombieHit(this.zombieManager.zombies.indexOf(zombie), damage);
                    this.ui.showHitmarker();
                    if (zombie.isDead) {
                        this.player.coins += 50;
                        this.player.addXP(100);
                        this.ui.updateCoins(this.player.coins);
                        this.ui.updateXP(this.player.level, (this.player.xp / (this.player.level * 1000)) * 100, this.player.skillPoints);
                    }
                }
            }
        }
    }

    updateDayNight(delta) {
        this.dayCycle += delta * 0.01;
        if (this.dayCycle > 1) this.dayCycle = 0;

        const intensity = Math.sin(this.dayCycle * Math.PI);
        this.sun.intensity = Math.max(0.1, intensity * 1.5);
        this.ambient.intensity = Math.max(0.05, intensity * 0.5);

        const skyColor = new THREE.Color().setHSL(0.6, 0.5, intensity * 0.5 + 0.1);
        this.scene.fog.color.copy(skyColor);
        this.renderer.setClearColor(skyColor);
    }

    loop() {
        if (!this.clock) return;
        const delta = Math.min(this.clock.getDelta(), 0.1);

        if (!this.isGameOver) {
            this.player.update(delta, this.input, this.mapManager.collidables);
            this.zombieManager.update(delta, this.player, null, null, (dmg) => {
                this.player.takeDamage(dmg);
                this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
            });

            // Boss Health Update
            const boss = this.zombieManager.zombies.find(z => z.isBoss && !z.isDead);
            const bossUI = document.getElementById('boss-health-bar');
            if (boss) {
                bossUI.classList.remove('hidden');
                document.getElementById('boss-health-fill').style.width = `${(boss.health / boss.maxHealth) * 100}%`;
                document.getElementById('boss-name-text').innerText = boss.type.toUpperCase();
            } else {
                bossUI.classList.add('hidden');
            }

            this.checkCollisions();
            this.updateDayNight(delta);

            // UI Update
            const w = this.player.weapons[this.player.currentWeapon];
            this.ui.updateAmmo(w.ammo, w.reserve);
            this.ui.updateWeapon(this.player.currentWeapon);

            if (this.player.health <= 0) {
                this.isGameOver = true;
                this.ui.showGameOver(this.player.coins);
            }

            // Wave completion
            if (this.waveInProgress && this.zombieManager.zombies.every(z => z.isDead)) {
                this.waveInProgress = false;
                setTimeout(() => {
                    this.wave++;
                    this.startWave();
                }, 5000);
            }
            if (this.multiplayer.isActive) {
                this.multiplayer.sendPosition(this.player, this.player.currentWeapon);
                this.multiplayer.update(delta, this.camera);
                this.multiplayer.sendZombieStates(this.zombieManager.zombies, this.wave);
            }
        }

        this.renderer.render(this.scene, this.camera);
        requestAnimationFrame(() => this.loop());
    }
}

new Game();
