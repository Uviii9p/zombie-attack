import * as THREE from 'three';
import { Player } from './player_v3.js';
import { MultiplayerManager } from './multiplayer.js';
import { ZombieManager } from './zombie.js';
import { Vehicle } from './vehicle.js';
import { audioSystem } from './audio.js';
import { WeaponSystem } from './weapons.js';
import { GameUI } from './ui.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1500);
        this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });

        this.ui = new GameUI();
        this.player = null;
        this.zombieManager = null;
        this.weaponSystem = null;
        this.multiplayer = new MultiplayerManager(this.scene);
        window.multiplayer = this.multiplayer; // Expose for weapons.js
        this.house = null;

        this.fence = { health: 5000, maxHealth: 5000, level: 1, mesh: null };
        this.houseHealth = 1000;
        this.maxHouseHealth = 1000;
        this.houseLights = [];
        this.searchlight = null;
        this.gameStarted = false;
        this.isGameOver = false;
        this.isShopOpen = false;
        this.isBackpackOpen = false;
        this.isSettingsOpen = false;

        this.init().catch(e => console.error("Game Init Error:", e));
    }

    async init() {
        // High-end Renderer Settings
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        const container = document.getElementById('game-container');
        if (container) container.prepend(this.renderer.domElement);

        // Realistic Environment - Improved Visibility
        this.scene.background = new THREE.Color(0x0a0c10);
        this.scene.fog = new THREE.FogExp2(0x0a0c10, 0.005); // Reduced fog density

        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6); // Increased ambient light
        this.scene.add(this.ambientLight);
        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.4); // Add hemi light for ground
        this.scene.add(this.hemiLight);

        this.sun = new THREE.DirectionalLight(0xaabbff, 0.8); // Brighter moonlight
        this.sun.position.set(50, 100, 50);
        this.sun.castShadow = true;
        this.sun.shadow.mapSize.width = 2048; this.sun.shadow.mapSize.height = 2048;
        this.scene.add(this.sun);

        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 1, metalness: 0 }); // Brighter ground
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
        this.scene.add(ground);

        this.createHouse();
        this.createFence();
        this.createEnvironment();
        this.createWeather();
        this.createStars();

        // Shake properties
        this.shakeTime = 0;
        this.shakeIntensity = 0;
        this.baseCamPos = new THREE.Vector3();

        // Initialize Systems
        this.player = new Player(this.scene, this.camera);
        this.zombieManager = new ZombieManager(this.scene);
        this.vehicle = new Vehicle(this.scene);
        this.weaponSystem = new WeaponSystem(this.scene, this.camera);

        // UI Listeners
        this.ui.startBtn.onclick = () => { audioSystem.init(); audioSystem.playClick(); this.start(); };
        this.ui.settingsBtn.onclick = () => { audioSystem.playClick(); this.toggleSettings(true); };
        this.ui.saveSettingsBtn.onclick = () => { audioSystem.playClick(); this.saveSettings(); };
        this.ui.restartBtn.onclick = () => { audioSystem.playClick(); location.reload(); };
        this.ui.closeShopBtn.onclick = () => { audioSystem.playClick(); this.toggleShop(false); };
        if (this.ui.closeBackpackBtn) this.ui.closeBackpackBtn.onclick = () => { audioSystem.playClick(); this.toggleBackpack(false); };
        this.ui.buyButtons.forEach(btn => btn.onclick = (e) => this.buy(e));
        if (this.ui.hudShopBtn) this.ui.hudShopBtn.onclick = () => { audioSystem.playClick(); this.toggleShop(!this.isShopOpen); };

        // Admin Panel Activation
        this.ui.gameTitle.onclick = () => {
            if (this.ui.isAdmin) return;
            this.ui.titleClicks++;
            if (this.ui.titleClicks >= 10) {
                const pwd = prompt('Enter Admin Password:');
                if (pwd === 'sujal12') {
                    this.ui.isAdmin = true;
                    this.ui.adminPanel.classList.remove('hidden');
                    // Give unlimited coins explicitly through updateCoins to trigger server save
                    this.updateCoins(99999999);
                }
                this.ui.titleClicks = 0;
            }
        };

        this.ui.closeAdminBtn.onclick = () => {
            this.ui.adminPanel.classList.add('hidden');
        };

        this.loop();
        this.syncStats().catch(() => { });

        // Day/Night Cycle Properties
        this.cycleTime = 0;
        this.cycleDuration = 120; // 2 minutes (60s day, 60s night)

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.onKey(e));

        // Listen for multiplayer lobby game start
        window.addEventListener('lobby-start-game', (e) => {
            if (window.lobbySocket) {
                this.multiplayer.init(window.lobbySocket, window.lobbyPlayerName, window.lobbyAvatar, this.zombieManager);
                this.ui.updateRespawns(this.player.respawnsLeft, true);
            }
            audioSystem.init();
            audioSystem.playClick();
            this.start();
        });

        document.addEventListener('pointerlockchange', () => {
            if (this.gameStarted && !this.isGameOver) {
                if (document.pointerLockElement !== document.body) {
                    // Pause menu automatically applies if we lose pointer lock
                    if (!this.isShopOpen && !this.isBackpackOpen && !this.isSettingsOpen) {
                        this.toggleSettings(true);
                    }
                } else {
                    // If we got pointer lock back, close settings
                    this.toggleSettings(false);
                }
            }
        });

        if (this.ui.leaveGameBtn) {
            this.ui.leaveGameBtn.addEventListener('click', () => this.leaveGame());
        }

        // Listen for zombie wave system
        window.addEventListener('wave-start', (e) => {
            const wave = e.detail;
            this.ui.announceWave(`WAVE ${wave}`, '#ff4757');
            this.updateWeather(wave);

            // Sync with others if host
            if (this.multiplayer.isActive && window.isLobbyHost) {
                this.multiplayer.sendWaveStart(wave);
            }
        });
        window.addEventListener('wave-cleared', (e) => {
            this.ui.announceWave('WAVE CLEARED', '#2ed573');

            // Sync with others if host
            if (this.multiplayer.isActive && window.isLobbyHost) {
                this.multiplayer.sendWaveCleared(e.detail);
            }
        });
    }

    createWeather() {
        this.rainGeo = new THREE.BufferGeometry();
        const rainCount = 15000;
        const rainPos = [];
        for (let i = 0; i < rainCount; i++) {
            rainPos.push(
                Math.random() * 400 - 200,
                Math.random() * 200,
                Math.random() * 400 - 200
            );
        }
        this.rainGeo.setAttribute('position', new THREE.Float32BufferAttribute(rainPos, 3));
        const rainMat = new THREE.PointsMaterial({
            color: 0xaaaaaa,
            size: 0.1,
            transparent: true,
            opacity: 0.6
        });
        this.rain = new THREE.Points(this.rainGeo, rainMat);
        this.rain.visible = false;
        this.scene.add(this.rain);
    }

    createStars() {
        const starGeo = new THREE.BufferGeometry();
        const starCount = 5000;
        const starPos = [];
        for (let i = 0; i < starCount; i++) {
            const r = 400 + Math.random() * 400;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            starPos.push(
                r * Math.sin(phi) * Math.cos(theta),
                r * Math.sin(phi) * Math.sin(theta),
                r * Math.cos(phi)
            );
        }
        starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
        const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 0.8, transparent: true });
        this.stars = new THREE.Points(starGeo, starMat);
        this.scene.add(this.stars);
    }

    updateWeather(wave) {
        // Darkness scaling (darker every wave, caps at wave 10)
        let darkFactor = Math.min((wave - 1) * 0.1, 0.9);

        // Color transition to deep blood red / pitch black night
        const rColor = Math.min(10 + Math.floor(wave * 5), 40); // 0x0a -> 0x28 Red tint
        const hex = (rColor << 16) | 0x0c10;

        this.scene.background.setHex(hex);
        this.scene.fog.color.setHex(hex);

        // Thicken fog
        this.scene.fog.density = 0.005 + (wave * 0.001); // max ~ 0.015 at wave 10

        // Dim lights
        this.ambientLight.intensity = Math.max(0.6 - darkFactor * 0.4, 0.1);
        this.hemiLight.intensity = Math.max(0.4 - darkFactor * 0.3, 0.05);
        this.sun.intensity = Math.max(0.8 - darkFactor * 0.6, 0.1);

        // Turn on Rain at wave 3
        if (wave >= 3) {
            this.rain.visible = true;
        }
    }

    start() {
        this.gameStarted = true;
        this.ui.hideMenu();
        document.body.requestPointerLock();
    }

    toggleSettings(show) {
        this.isSettingsOpen = show;
        this.ui.toggleSettings(show);
    }

    saveSettings() {
        const view = this.ui.viewSelect.value;
        this.player.viewMode = view;
        this.toggleSettings(false);
        document.body.requestPointerLock();
    }

    leaveGame() {
        if (window.lobbySocket) {
            window.lobbySocket.emit('leave-room');
            localStorage.removeItem('ds_last_room');
            this.multiplayer.destroy();
        }
        window.location.reload(); // Hard reset back to Auth/Main menu state
    }

    createHouse() {
        this.house = new THREE.Group();
        this.houseColliders = []; // For player collision

        // Materials
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x4a3728, roughness: 0.9 });
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x2c1e14, roughness: 1.0 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x222222, emissive: 0xffaa00, emissiveIntensity: 1.0, transparent: true, opacity: 0.8 });

        const addPart = (geo, mat, x, y, z, rotY = 0, type = 'wall') => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.rotation.y = rotY;
            m.castShadow = m.receiveShadow = true;
            m.userData.type = type;
            this.house.add(m);
            this.houseColliders.push(m);
            return m;
        };

        const buildFloor = (level, size = 12) => {
            const y = level * 4;
            // Floor
            addPart(new THREE.BoxGeometry(size, 0.4, size), floorMat, 0, y, 0, 0, 'floor');

            // Walls (North, South, East, West)
            const wallH = 4;
            const wallW = size;
            const wallT = 0.4;

            // South (with WIDE Doorway on level 0)
            if (level === 0) {
                // Front walls with a much wider gap (4 units)
                const gap = 4;
                const sideW = (size - gap) / 2;
                addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, -(gap / 2 + sideW / 2), y + 2, size / 2);
                addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, (gap / 2 + sideW / 2), y + 2, size / 2);
                addPart(new THREE.BoxGeometry(gap, 1, wallT), wallMat, 0, y + 3.5, size / 2);
            } else {
                addPart(new THREE.BoxGeometry(wallW, wallH, wallT), wallMat, 0, y + 2, size / 2);
            }

            // North
            addPart(new THREE.BoxGeometry(wallW, wallH, wallT), wallMat, 0, y + 2, -size / 2);
            // East
            addPart(new THREE.BoxGeometry(wallT, wallH, size), wallMat, size / 2, y + 2, 0);
            // West
            addPart(new THREE.BoxGeometry(wallT, wallH, size), wallMat, -size / 2, y + 2, 0);

            // Ceiling (except for level 2 which is the roof)
            if (level < 2) {
                // Add ceiling with a hole for stairs (hole on one side)
                const ceilT = 0.2;
                addPart(new THREE.BoxGeometry(size, ceilT, size * 0.6), floorMat, 0, y + 4, size * 0.2, 0, 'floor');
                addPart(new THREE.BoxGeometry(size * 0.5, ceilT, size * 0.4), floorMat, -size * 0.25, y + 4, -size * 0.3, 0, 'floor');
            }
        };

        const buildStairs = (level) => {
            const baseY = level * 4;
            const stepCount = 12; // More steps for smoother climb
            const stepH = 4 / stepCount;
            const stepW = 3;
            const stepD = 1.8; // Deeper steps to prevent phasing

            for (let i = 0; i < stepCount; i++) {
                addPart(
                    new THREE.BoxGeometry(stepW, stepH, stepD),
                    trimMat,
                    3.5,
                    baseY + (i * stepH) + stepH / 2,
                    -4 + (i * 0.35), // Overlapping slightly
                    0,
                    'floor'
                );
            }
        };

        // Construction
        for (let i = 0; i < 3; i++) {
            buildFloor(i, 12 - i); // Slightly larger house base
            if (i < 2) buildStairs(i);
        }

        // Rooftop Railing
        const railH = 1.2;
        const topSize = 8;
        const topY = 12;
        addPart(new THREE.BoxGeometry(topSize, 0.2, topSize), floorMat, 0, topY, 0, 0, 'floor'); // Top floor surface

        const railGeoNS = new THREE.BoxGeometry(topSize, railH, 0.1);
        const railGeoEW = new THREE.BoxGeometry(0.1, railH, topSize);
        addPart(railGeoNS, trimMat, 0, topY + railH / 2, topSize / 2);
        addPart(railGeoNS, trimMat, 0, topY + railH / 2, -topSize / 2);
        addPart(railGeoEW, trimMat, topSize / 2, topY + railH / 2, 0);
        addPart(railGeoEW, trimMat, -topSize / 2, topY + railH / 2, 0);

        // Windows (Visual only)
        const winGeo = new THREE.PlaneGeometry(1.5, 1.5);
        for (let l = 0; l < 3; l++) {
            const y = l * 4 + 2.5;
            const z = (10 - l) / 2 + 0.05;
            const x = (10 - l) / 2 + 0.05;

            // Add some windows to front/sides
            const w1 = new THREE.Mesh(winGeo, windowMat); w1.position.set(2, y, z); this.house.add(w1);
            const w2 = new THREE.Mesh(winGeo, windowMat); w2.position.set(-2, y, z); this.house.add(w2);

            // Light for floors
            const light = new THREE.PointLight(0xffaa00, 0, 10);
            light.position.set(0, l * 4 + 2.5, 0);
            this.house.add(light);
            this.houseLights.push(light);
        }

        // BIG SEARCHLIGHT ON ROOF
        const searchlightGroup = new THREE.Group();
        const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4), trimMat);
        searchlightGroup.add(base);

        const head = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 0.8), roofMat);
        head.rotation.x = Math.PI / 2;
        head.position.y = 0.5;
        searchlightGroup.add(head);

        this.searchlight = new THREE.SpotLight(0xffffff, 0, 50, Math.PI / 6, 0.5);
        this.searchlight.position.set(0, 0.8, 0);
        this.searchlight.target.position.set(0, -10, 20); // Aiming down and away
        searchlightGroup.add(this.searchlight);
        searchlightGroup.add(this.searchlight.target);

        searchlightGroup.position.set(0, topY, 0);
        this.house.add(searchlightGroup);

        this.scene.add(this.house);
    }

    createFence() {
        if (this.fence.mesh) this.scene.remove(this.fence.mesh);
        this.fence.mesh = new THREE.Group();
        const rad = 13, count = 32;
        const color = this.fence.level > 1 ? 0x444444 : 0x221100;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.5, 0.3), new THREE.MeshStandardMaterial({ color }));
            p.position.set(Math.cos(a) * rad, 1.25, Math.sin(a) * rad);
            p.castShadow = true; this.fence.mesh.add(p);
        }
        this.scene.add(this.fence.mesh);
    }

    createEnvironment() {
        const envGroup = new THREE.Group();

        // Bushes
        const bushCount = 100;
        const bushGeo = new THREE.SphereGeometry(1.2, 7, 7);
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x474a38, roughness: 1.0 });

        for (let i = 0; i < bushCount; i++) {
            const bush = new THREE.Mesh(bushGeo, bushMat);
            const x = (Math.random() - 0.5) * 400; const z = (Math.random() - 0.5) * 400;
            if (new THREE.Vector2(x, z).length() < 25) continue; // Keep clear of house

            bush.position.set(x, 0.4, z);
            bush.scale.set(1, 0.6 + Math.random() * 0.4, 1);
            bush.rotation.y = Math.random() * Math.PI;
            bush.castShadow = true; bush.receiveShadow = true;
            envGroup.add(bush);
        }

        // Cacti
        const cactiCount = 80;
        const cactusGeo = new THREE.CylinderGeometry(0.3, 0.4, 2.5, 8);
        const cactusMat = new THREE.MeshStandardMaterial({ color: 0x2e3d1c, roughness: 0.8 });

        for (let i = 0; i < cactiCount; i++) {
            const cactus = new THREE.Mesh(cactusGeo, cactusMat);
            const x = (Math.random() - 0.5) * 400; const z = (Math.random() - 0.5) * 400;
            if (new THREE.Vector2(x, z).length() < 25) continue;

            cactus.position.set(x, 1.25, z);
            cactus.rotation.y = Math.random() * Math.PI;

            // Optional Cactus Arms
            if (Math.random() > 0.4) {
                const armGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 8);
                const arm1 = new THREE.Mesh(armGeo, cactusMat);
                arm1.position.set(0.4, 0.5, 0); arm1.rotation.z = Math.PI / 4;
                cactus.add(arm1);
            }
            if (Math.random() > 0.6) {
                const armGeo = new THREE.CylinderGeometry(0.2, 0.2, 1.0, 8);
                const arm2 = new THREE.Mesh(armGeo, cactusMat);
                arm2.position.set(-0.4, 0.2, 0); arm2.rotation.z = -Math.PI / 4;
                cactus.add(arm2);
            }

            cactus.castShadow = true; cactus.receiveShadow = true;
            envGroup.add(cactus);
        }

        this.scene.add(envGroup);
    }

    async syncStats() {
        const BACKEND_URL = window.location.hostname.includes('vercel.app')
            ? 'https://web-production-53a37.up.railway.app'
            : '';
        try {
            const r = await fetch(`${BACKEND_URL}/api/get-stats`);
            const d = await r.json();
            this.player.coins = d.coins || 0;
            this.ui.updateCoins(this.player.coins);
        } catch (e) { }
    }

    async updateCoins(amt) {
        this.player.coins += amt;
        if (this.player.coins < 0) this.player.coins = 0;
        this.ui.updateCoins(this.player.coins);

        const BACKEND_URL = window.location.hostname.includes('vercel.app')
            ? 'https://web-production-53a37.up.railway.app'
            : '';

        try {
            await fetch(`${BACKEND_URL}/api/update-coins`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: this.player.coins, absolute: true })
            });
        } catch (e) { }
    }

    buy(e) {
        const cost = parseInt(e.target.dataset.cost);
        const id = e.target.parentElement.dataset.id;
        const type = e.target.parentElement.dataset.type;
        if (this.player.coins >= cost) {
            let ok = false;
            if (type === 'weapon') {
                if (this.weaponSystem.switchWeapon(id)) { ok = true; this.ui.updateWeapon(id); }
            } else if (id === 'armor') ok = this.player.upgradeArmor();
            else if (id === 'fence') {
                this.fence.level++; this.fence.health = this.fence.maxHealth = 300 + (this.fence.level * 200);
                this.createFence(); this.ui.updateFenceHealth(100); ok = true;
            } else if (id === 'house') {
                this.houseHealth = this.maxHouseHealth; this.ui.updateHouseHealth(100); ok = true;
            }
            if (ok) {
                audioSystem.playBuy();
                this.updateCoins(-cost);
            } else {
                audioSystem.playError();
            }
        } else {
            audioSystem.playError();
        }
    }

    onKey(e) {
        if (e.code === 'KeyB') { audioSystem.playClick(); this.toggleShop(!this.isShopOpen); }
        if (e.code === 'Tab') { e.preventDefault(); audioSystem.playClick(); this.toggleBackpack(!this.isBackpackOpen); }
        if (e.code === 'Escape' && this.isSettingsOpen) { audioSystem.playClick(); this.toggleSettings(false); }
        if (e.code === 'KeyV') { audioSystem.playClick(); this.player.toggleView(); this.ui.updateViewMode(this.player.viewMode); }
        if (e.code === 'KeyE') {
            audioSystem.playClick();
            if (this.player.isDriving) {
                this.player.exitVehicle();
            } else {
                const dist = this.player.group.position.distanceTo(this.vehicle.mesh.position);
                if (dist < 5) this.player.enterVehicle(this.vehicle);
            }
        }
        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) return;

        if (e.code === 'KeyR') {
            this.triggerReload();
        }
        if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
            const m = { 'Digit1': 'AK47', 'Digit2': 'Sniper', 'Digit3': 'RPG' };
            if (this.weaponSystem.switchWeapon(m[e.code])) {
                this.ui.updateWeapon(m[e.code]);
                this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.ui.isAdmin ? '∞' : this.player.ammoReserves[m[e.code]]);
            }
        }
    }

    triggerReload() {
        const w = this.weaponSystem.currentWeapon;
        const key = this.weaponSystem.currentWeaponKey;
        const res = this.player.ammoReserves[key];

        if (!this.weaponSystem.isReloading && (res > 0 || this.ui.isAdmin) && w.ammo < w.maxAmmo) {
            this.weaponSystem.reload();
            setTimeout(() => {
                const need = w.maxAmmo - w.ammo;
                const fill = this.ui.isAdmin ? need : Math.min(need, this.player.ammoReserves[key]);
                w.ammo += fill;
                if (!this.ui.isAdmin) this.player.ammoReserves[key] -= fill;
                this.ui.updateAmmo(w.ammo, this.ui.isAdmin ? '∞' : this.player.ammoReserves[key]);
            }, w.reloadTime * 1000);
        }
    }

    toggleShop(s) { this.isShopOpen = s; this.ui.toggleShop(s); }
    toggleBackpack(s) { this.isBackpackOpen = s; this.ui.toggleBackpack(s, this.player); }
    onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }

    damage(t, a) {
        if (this.ui.isAdmin) return; // God Mode

        if (t === 'player') {
            if (this.player.takeDamage(a)) {
                if (this.multiplayer.isActive && this.player.respawnsLeft > 0) {
                    this.player.respawnsLeft--;
                    this.player.respawn();
                    this.ui.updateRespawns(this.player.respawnsLeft);
                    this.ui.announceWave(`RESPAWNING... (${this.player.respawnsLeft} LEFT)`, '#3498db');
                } else {
                    this.gameOver();
                }
            }
            this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
        } else if (t === 'fence') {
            this.fence.health -= a; this.ui.updateFenceHealth((this.fence.health / this.fence.maxHealth) * 100);
            if (this.fence.health <= 0 && this.fence.mesh.parent) this.scene.remove(this.fence.mesh);
        } else if (t === 'house') {
            this.houseHealth -= a; this.ui.updateHouseHealth((this.houseHealth / this.maxHouseHealth) * 100);
            if (this.houseHealth <= 0) this.gameOver();
        }
    }

    gameOver() { this.isGameOver = true; this.ui.showGameOver(this.player.coins); }

    updateDayNight(delta) {
        this.cycleTime = (this.cycleTime + delta) % this.cycleDuration;
        const progress = (Math.sin((this.cycleTime / this.cycleDuration) * Math.PI * 2) + 1) / 2; // 0 to 1

        // 0 = Night, 1 = Day
        const dayColor = new THREE.Color(0x87ceeb); // Sky blue
        const nightColor = new THREE.Color(0x0a0c10); // Dark blue/black
        const currentSkyColor = nightColor.clone().lerp(dayColor, progress);

        this.scene.background = currentSkyColor;
        this.scene.fog.color = currentSkyColor;

        // Sun/Moon Intensity
        this.sun.intensity = 0.2 + (progress * 1.5);
        this.sun.color.lerpColors(new THREE.Color(0xaabbff), new THREE.Color(0xffffee), progress);

        // Ambient Intensity
        this.hemiLight.intensity = 0.2 + (progress * 0.8);

        // Star visibility (only at night)
        if (this.stars) {
            this.stars.material.opacity = 1 - progress;
            this.stars.visible = progress < 0.8;
        }

        // House Lights (Night Logic)
        const nightFactor = 1 - progress; // 1 at night, 0 at day
        const lightThreshold = 0.7; // Start turning on after sunset
        const intensity = Math.max(0, (nightFactor - (1 - lightThreshold)) / lightThreshold);

        if (this.houseLights) {
            this.houseLights.forEach(l => l.intensity = intensity * 15);
        }
        if (this.searchlight) {
            this.searchlight.intensity = intensity * 100;
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        const d = 0.016;

        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.rain && this.rain.visible) {
            const positions = this.rain.geometry.attributes.position.array;
            for (let i = 1; i < positions.length; i += 3) {
                positions[i] -= 2.5; // drop speed
                if (positions[i] < 0) {
                    positions[i] = 200;
                }
            }
            this.rain.geometry.attributes.position.needsUpdate = true;
        }
        this.vehicle.update(d, this.player);
        this.vehicle.checkCollisions(this.zombieManager.zombies, this.zombieManager.bloodParticles);
        this.weaponSystem.update(d);

        const houseParts = (this.houseHealth > 0) ? (this.houseColliders || []) : [];
        this.player.update(d, [...houseParts]);

        // Follow vehicle with camera if driving
        if (this.player.isDriving) {
            const carPos = this.vehicle.mesh.position;
            const camOffset = new THREE.Vector3(0, 5, -10).applyEuler(this.vehicle.mesh.rotation);
            this.camera.position.lerp(carPos.clone().add(camOffset), 0.1);
            this.camera.lookAt(carPos);
        }

        this.zombieManager.update(d, this.player.group, this.house, this.fence, (t, a) => this.damage(t, a), () => { }, (type, amt) => {
            this.player.collectLoot(type, amt);
            this.ui.updateCoins(this.player.coins);
            const cur = this.weaponSystem.currentWeaponKey;
            this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[cur]);
            if (this.isBackpackOpen) this.ui.renderInventory(this.player);
        });

        // Auto Reload
        const currentWep = this.weaponSystem.currentWeapon;
        if (currentWep && currentWep.ammo === 0 && !this.weaponSystem.isReloading && this.player.ammoReserves[this.weaponSystem.currentWeaponKey] > 0) {
            this.triggerReload();
        }

        // Scope & ADS Logic
        const isSniper = this.weaponSystem.currentWeaponKey === 'Sniper';
        const scopeUi = document.getElementById('scope-overlay');

        // Auto-switch to FPP for ADS if holding Right Click
        if (isRightMouseDown && this.player.viewMode === 'TPP') {
            this._wasInTPP = true;
            this.player.toggleView('FPP');
            this.ui.updateViewMode('FPP');
        } else if (!isRightMouseDown && this._wasInTPP) {
            this._wasInTPP = false;
            this.player.toggleView('TPP');
            this.ui.updateViewMode('TPP');
        }

        const isADS = isRightMouseDown;

        if (isADS) {
            const targetFOV = isSniper ? 15 : 42;
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFOV, 0.2);

            if (isSniper) {
                if (this.ui.crosshair) this.ui.crosshair.classList.add('hidden');
                if (this.player.gunMesh) this.player.gunMesh.visible = false;
                if (scopeUi) scopeUi.classList.remove('hidden');
            } else {
                // Move gun to center for ADS
                if (this.player.gunMesh) {
                    this.player.gunMesh.position.lerp(new THREE.Vector3(0, -0.28, -0.4), 0.2);
                }
            }
        } else {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 70, 0.15);
            if (this.ui.crosshair) this.ui.crosshair.classList.remove('hidden');
            if (this.player.gunMesh) {
                this.player.gunMesh.visible = true;
                this.player.gunMesh.position.lerp(this.player.gunTargetPos || new THREE.Vector3(0.5, -0.5, -1), 0.15);
            }
            if (scopeUi) scopeUi.classList.add('hidden');
        }
        this.camera.updateProjectionMatrix();

        if (isMouseDown && this.weaponSystem.canFire()) {
            const zombiesInPlay = this.zombieManager.zombies.map((z, i) => ({ z, i })).filter(item => !item.z.isDead);

            const w = this.weaponSystem.fire(zombiesInPlay.map(item => item.z), (z, dmg) => {
                // Find index of this zombie to sync
                const idx = this.zombieManager.zombies.indexOf(z);
                this.zombieManager.hitZombie(z, dmg, () => { });
                if (this.multiplayer.isActive) {
                    this.multiplayer.sendZombieHit(idx, dmg);
                }
            }, () => {
                this.ui.showHitmarker();
            });

            if (w) {
                this.ui.updateAmmo(w.ammo, this.player.ammoReserves[this.weaponSystem.currentWeaponKey]);
                // Add recoil shake
                this.shakeIntensity = w.recoil;
                this.shakeTime = 0.15;

                if (this.multiplayer.isActive) {
                    this.multiplayer.sendShoot(this.weaponSystem.currentWeaponKey, this.camera);
                }
            }
        }

        // Camera Shake Processing
        if (this.shakeTime > 0) {
            this.shakeTime -= d;
            const s = this.shakeIntensity;
            this.camera.position.x += (Math.random() - 0.5) * s;
            this.camera.position.y += (Math.random() - 0.5) * s;
            this.camera.rotation.x += s * 0.5; // Recoil kick up
            this.shakeIntensity *= 0.9;
        }

        // Multiplayer Updates
        if (this.multiplayer.isActive) {
            this.multiplayer.sendPosition(this.player, this.weaponSystem.currentWeaponKey);
            this.multiplayer.update(d, this.camera);
        }

        this.renderer.render(this.scene, this.camera);
    }
}

let isMouseDown = false;
let isRightMouseDown = false;

window.addEventListener('mousedown', (e) => {
    if (e.button === 0) isMouseDown = true;
    if (e.button === 2) isRightMouseDown = true;
});
window.addEventListener('mouseup', (e) => {
    if (e.button === 0) isMouseDown = false;
    if (e.button === 2) isRightMouseDown = false;
});
window.addEventListener('contextmenu', e => e.preventDefault());

new Game();
