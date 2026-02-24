import * as THREE from 'three';
import { Player } from './player_v3.js';
import { MultiplayerManager } from './multiplayer.js';
import { ZombieManager } from './zombie.js';
import { Vehicle } from './vehicle.js';
import { audioSystem } from './audio.js';
import { WeaponSystem } from './weapons.js';
import { GameUI } from './ui.js';
import { Soldier } from './soldier.js';

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
        this.fenceColliders = [];
        this.houseHealth = 1000;
        this.maxHouseHealth = 1000;
        this.houseLights = [];
        this.searchlight = null;
        this.gameStarted = false;
        this.isGameOver = false;
        this.isSettingsOpen = false;
        this.soldiers = [];
        this.sparkles = [];
        this.isGateOpen = false;
        window.isGateOpen = false;

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
        this.createWatchtowers();
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

        // Shop event delegation
        if (this.ui.shopScreen) {
            this.ui.shopScreen.addEventListener('click', (e) => {
                const btn = e.target.closest('.buy-btn');
                if (btn) this.buy({ target: btn });
            });
        }

        if (this.ui.hudShopBtn) this.ui.hudShopBtn.onclick = () => { audioSystem.playClick(); this.toggleShop(!this.isShopOpen); };

        // Admin Panel Activation — Click title 5x on menu OR press ` key 5x rapidly
        this.adminClickCount = 0;
        this.adminKeyCount = 0;
        this.adminKeyTimer = null;

        // Method 1: Click title text 5 times on menu screen
        if (this.ui.gameTitle) {
            this.ui.gameTitle.addEventListener('click', () => {
                if (this.ui.isAdmin) return;
                this.adminClickCount++;
                if (this.adminClickCount >= 5) {
                    this.adminClickCount = 0;
                    this.activateAdmin();
                }
                // Reset after 3 seconds of no clicks
                clearTimeout(this._adminClickTimer);
                this._adminClickTimer = setTimeout(() => { this.adminClickCount = 0; }, 3000);
            });
        }

        // Method 2: Press backtick/tilde key (`) 5 times rapidly
        window.addEventListener('keydown', (e) => {
            if (e.code === 'Backquote' && !this.ui.isAdmin) {
                this.adminKeyCount++;
                clearTimeout(this.adminKeyTimer);
                this.adminKeyTimer = setTimeout(() => { this.adminKeyCount = 0; }, 2000);
                if (this.adminKeyCount >= 5) {
                    this.adminKeyCount = 0;
                    this.activateAdmin();
                }
            }
        });

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
            const data = e.detail;
            if (window.lobbySocket) {
                this.multiplayer.init(window.lobbySocket, window.lobbyPlayerName, window.lobbyAvatar, this.zombieManager);
                this.ui.updateRespawns(this.player.respawnsLeft, true);

                // Set initial wave if rejoining
                if (data && data.currentWave > 1) {
                    this.zombieManager.forceStartWave(data.currentWave);
                }
            }
            audioSystem.init();
            audioSystem.playClick();
            this.start();
        });

        document.addEventListener('pointerlockchange', () => {
            if (this.gameStarted && !this.isGameOver) {
                if (!document.pointerLockElement) {
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

        // Boss events
        window.addEventListener('boss-spawn', (e) => {
            const { name } = e.detail;
            const bossAnnounce = document.getElementById('boss-announcement');
            if (bossAnnounce) {
                bossAnnounce.textContent = name;
                bossAnnounce.classList.remove('hidden');
                // Remove and re-add to restart animation
                bossAnnounce.style.animation = 'none';
                bossAnnounce.offsetHeight; // Trigger reflow
                bossAnnounce.style.animation = '';
                setTimeout(() => bossAnnounce.classList.add('hidden'), 2500);
            }
            const bossBar = document.getElementById('boss-health-bar');
            if (bossBar) bossBar.classList.remove('hidden');
        });

        window.addEventListener('boss-health', (e) => {
            const { ratio, name } = e.detail;
            const fill = document.getElementById('boss-health-fill');
            const nameEl = document.getElementById('boss-name-text');
            if (fill) fill.style.width = (ratio * 100) + '%';
            if (nameEl && name) nameEl.textContent = name;
            if (ratio <= 0) {
                const bossBar = document.getElementById('boss-health-bar');
                if (bossBar) setTimeout(() => bossBar.classList.add('hidden'), 1000);
            }
        });

        window.addEventListener('boss-defeated', (e) => {
            this.ui.announceWave('BOSS DEFEATED!', '#ffd700');
        });

        window.addEventListener('wave-countdown', (e) => {
            const num = e.detail;
            const cdEl = document.getElementById('wave-countdown');
            if (cdEl) {
                cdEl.textContent = num;
                cdEl.classList.remove('hidden');
                cdEl.style.animation = 'none';
                cdEl.offsetHeight;
                cdEl.style.animation = '';
                setTimeout(() => cdEl.classList.add('hidden'), 900);
            }
        });

        window.addEventListener('wave-start', (e) => {
            const wc = document.getElementById('wave-counter');
            if (wc) wc.textContent = 'WAVE ' + e.detail;
        });

        window.addEventListener('screen-shake', (e) => {
            const container = document.getElementById('game-container');
            if (container) {
                container.classList.add('screen-shake');
                setTimeout(() => container.classList.remove('screen-shake'), 500);
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

    activateAdmin() {
        const pwd = prompt('Enter Admin Password:');
        if (pwd === 'sujal12') {
            this.ui.isAdmin = true;
            this.ui.adminPanel.classList.remove('hidden');
            this.updateCoins(99999999);
        }
    }

    start() {
        this.gameStarted = true;
        this.ui.hideMenu();
        this.renderer.domElement.requestPointerLock();
    }

    toggleSettings(show) {
        this.isSettingsOpen = show;
        this.ui.toggleSettings(show);
    }

    saveSettings() {
        const view = this.ui.viewSelect.value;
        this.player.viewMode = view;
        this.toggleSettings(false);
        this.renderer.domElement.requestPointerLock();
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
        this.houseColliders = [];

        // ===== MATERIALS =====
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x5a4232, roughness: 0.85 });
        const wallInnerMat = new THREE.MeshStandardMaterial({ color: 0x6b5544, roughness: 0.9 });
        const floorMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 0.95 });
        const floorPlankMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
        const trimMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.3, roughness: 0.6 });
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x1a3355, emissive: 0xffaa44, emissiveIntensity: 0.8, transparent: true, opacity: 0.6 });
        const windowFrameMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.8 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, metalness: 0.8, roughness: 0.3 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.8 });
        const fabricMat = new THREE.MeshStandardMaterial({ color: 0x3a5a3a, roughness: 1.0 });
        const redFabricMat = new THREE.MeshStandardMaterial({ color: 0x6b2222, roughness: 0.9 });
        const paperMat = new THREE.MeshStandardMaterial({ color: 0xd4c9a8, roughness: 1.0 });
        const concreteMat = new THREE.MeshStandardMaterial({ color: 0x666666, roughness: 0.95 });

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

        // Non-collidable decorative helper
        const addDecor = (geo, mat, x, y, z, rotX = 0, rotY = 0, rotZ = 0) => {
            const m = new THREE.Mesh(geo, mat);
            m.position.set(x, y, z);
            m.rotation.set(rotX, rotY, rotZ);
            m.castShadow = m.receiveShadow = true;
            this.house.add(m);
            return m;
        };

        const houseSize = 12;
        const wallH = 4, wallT = 0.4;

        // ===== GROUND FLOOR =====
        // Main floor
        addPart(new THREE.BoxGeometry(houseSize, 0.4, houseSize), floorMat, 0, 0, 0, 0, 'floor');

        // Floor planks (decorative lines on the floor)
        for (let i = 0; i < 6; i++) {
            addDecor(new THREE.BoxGeometry(houseSize - 1, 0.02, 0.08), floorPlankMat, 0, 0.21, -5 + i * 2);
        }

        // South wall with doorway
        const gap = 5, sideW = (houseSize - gap) / 2;
        addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, -(gap / 2 + sideW / 2), 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, (gap / 2 + sideW / 2), 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(gap, 0.8, wallT), wallMat, 0, 3.6, houseSize / 2);

        // Door frame trim
        addDecor(new THREE.BoxGeometry(0.15, wallH, 0.15), windowFrameMat, -gap / 2, 2, houseSize / 2);
        addDecor(new THREE.BoxGeometry(0.15, wallH, 0.15), windowFrameMat, gap / 2, 2, houseSize / 2);

        // North, East, West walls
        addPart(new THREE.BoxGeometry(houseSize, wallH, wallT), wallMat, 0, 2, -houseSize / 2);
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, houseSize / 2, 2, 0);
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, -houseSize / 2, 2, 0);

        // Wall trim (baseboard)
        addDecor(new THREE.BoxGeometry(houseSize - 0.5, 0.15, 0.06), trimMat, 0, 0.28, -houseSize / 2 + 0.25);
        addDecor(new THREE.BoxGeometry(0.06, 0.15, houseSize - 0.5), trimMat, houseSize / 2 - 0.25, 0.28, 0);
        addDecor(new THREE.BoxGeometry(0.06, 0.15, houseSize - 0.5), trimMat, -houseSize / 2 + 0.25, 0.28, 0);

        // Ceiling with stair hole
        const ceilT = 0.3;
        addPart(new THREE.BoxGeometry(houseSize * 0.6, ceilT, houseSize), floorMat, -houseSize * 0.2, 4, 0, 0, 'floor');
        addPart(new THREE.BoxGeometry(houseSize * 0.4, ceilT, houseSize * 0.4), floorMat, houseSize * 0.3, 4, -houseSize * 0.3, 0, 'floor');

        // ===== GROUND FLOOR FURNITURE =====

        // TABLE (center of room)
        const tableTop = addDecor(new THREE.BoxGeometry(2.5, 0.1, 1.5), woodMat, -1, 1.0, 0);
        for (let lx = -1; lx <= 1; lx += 2) {
            for (let lz = -0.5; lz <= 0.5; lz += 1) {
                addDecor(new THREE.BoxGeometry(0.1, 1.0, 0.1), woodMat, -1 + lx * 1.1, 0.5, lz * 0.6);
            }
        }

        // Items on table: ammo boxes, lantern
        addDecor(new THREE.BoxGeometry(0.4, 0.25, 0.3), fabricMat, -1.5, 1.2, 0.2); // Ammo box
        addDecor(new THREE.BoxGeometry(0.3, 0.2, 0.25), fabricMat, -0.8, 1.15, -0.3); // Ammo box 2
        // Lantern on table
        addDecor(new THREE.CylinderGeometry(0.1, 0.12, 0.35, 8), metalMat, -0.3, 1.25, 0);
        const lanternGlow = new THREE.PointLight(0xffaa33, 0.5, 5);
        lanternGlow.position.set(-0.3, 1.4, 0);
        this.house.add(lanternGlow);

        // CHAIRS (around the table)
        const addChair = (cx, cz, ry) => {
            // Seat
            addDecor(new THREE.BoxGeometry(0.6, 0.08, 0.6), woodMat, cx, 0.65, cz, 0, ry);
            // Back
            addDecor(new THREE.BoxGeometry(0.6, 0.7, 0.08), woodMat, cx - Math.sin(ry) * 0.28, 1.0, cz - Math.cos(ry) * 0.28, 0, ry);
            // Legs
            for (let lx2 = -0.22; lx2 <= 0.22; lx2 += 0.44) {
                for (let lz2 = -0.22; lz2 <= 0.22; lz2 += 0.44) {
                    addDecor(new THREE.BoxGeometry(0.06, 0.65, 0.06), woodMat, cx + lx2, 0.32, cz + lz2);
                }
            }
        };
        addChair(-1, 1.2, 0);
        addChair(-1, -1.2, Math.PI);

        // SHELF on north wall (supply storage)
        addDecor(new THREE.BoxGeometry(3.0, 0.08, 0.6), woodMat, 0, 1.5, -5.5);
        addDecor(new THREE.BoxGeometry(3.0, 0.08, 0.6), woodMat, 0, 2.5, -5.5);
        // Shelf brackets
        addDecor(new THREE.BoxGeometry(0.08, 0.8, 0.5), metalMat, -1.3, 2.0, -5.5);
        addDecor(new THREE.BoxGeometry(0.08, 0.8, 0.5), metalMat, 1.3, 2.0, -5.5);
        // Items on shelves
        addDecor(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x996633 }), -0.8, 1.74, -5.4); // Crate
        addDecor(new THREE.BoxGeometry(0.5, 0.4, 0.4), new THREE.MeshStandardMaterial({ color: 0x8B4513 }), 0.2, 1.74, -5.4); // Crate 2
        addDecor(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 6), metalMat, 0.9, 1.79, -5.4); // Can
        addDecor(new THREE.BoxGeometry(0.6, 0.35, 0.35), fabricMat, -0.5, 2.72, -5.4); // Med kit
        addDecor(new THREE.BoxGeometry(0.4, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xcc8833 }), 0.5, 2.69, -5.4); // Supply box

        // WORKBENCH on west wall
        addDecor(new THREE.BoxGeometry(0.8, 1.0, 3.0), woodMat, -5.4, 0.5, -2);
        addDecor(new THREE.BoxGeometry(0.85, 0.08, 3.1), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }), -5.4, 1.04, -2);
        // Tools on workbench
        addDecor(new THREE.BoxGeometry(0.08, 0.08, 0.6), metalMat, -5.3, 1.12, -2.5); // Wrench
        addDecor(new THREE.BoxGeometry(0.5, 0.15, 0.3), new THREE.MeshStandardMaterial({ color: 0xaa3333 }), -5.3, 1.15, -1.5); // Toolbox
        addDecor(new THREE.CylinderGeometry(0.08, 0.08, 0.4, 6), metalMat, -5.3, 1.28, -3.0); // Standing tool

        // MAP on north wall (survival planning)
        addDecor(new THREE.PlaneGeometry(2.0, 1.4), paperMat, 0, 2.8, -5.75, 0, 0);

        // SUPPLY CRATES (east side, near stairs)
        for (let ci = 0; ci < 3; ci++) {
            const crateSize = 0.7 + Math.random() * 0.3;
            const crate = addDecor(
                new THREE.BoxGeometry(crateSize, crateSize, crateSize),
                new THREE.MeshStandardMaterial({ color: [0x5d4037, 0x4a3528, 0x6b5040][ci] }),
                4.5 + (ci % 2) * 0.8, crateSize / 2 + 0.2, 3 - ci * 1.2
            );
            crate.rotation.y = Math.random() * 0.5;
        }

        // ===== FIRST FLOOR =====
        const floorOneY = 4;
        const winGap = 2.0, winSideW = (houseSize - winGap) / 2;

        // South wall with window
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, -(winGap / 2 + winSideW / 2), floorOneY + 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, (winGap / 2 + winSideW / 2), floorOneY + 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.2, wallT), wallMat, 0, floorOneY + 3.4, houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.0, wallT), wallMat, 0, floorOneY + 0.5, houseSize / 2);

        // Window frame trim
        addDecor(new THREE.BoxGeometry(0.1, 1.8, 0.1), windowFrameMat, -winGap / 2, floorOneY + 2, houseSize / 2 + 0.05);
        addDecor(new THREE.BoxGeometry(0.1, 1.8, 0.1), windowFrameMat, winGap / 2, floorOneY + 2, houseSize / 2 + 0.05);
        addDecor(new THREE.BoxGeometry(winGap + 0.1, 0.1, 0.1), windowFrameMat, 0, floorOneY + 2, houseSize / 2 + 0.05);

        // North wall with window
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, -(winGap / 2 + winSideW / 2), floorOneY + 2, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, (winGap / 2 + winSideW / 2), floorOneY + 2, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.2, wallT), wallMat, 0, floorOneY + 3.4, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.0, wallT), wallMat, 0, floorOneY + 0.5, -houseSize / 2);

        // East, West walls
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, houseSize / 2, floorOneY + 2, 0);
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, -houseSize / 2, floorOneY + 2, 0);

        // ===== FIRST FLOOR FURNITURE =====

        // BED / Sleeping area (west side)
        // Bed frame
        addDecor(new THREE.BoxGeometry(2.2, 0.4, 3.5), woodMat, -4.0, 0.2 + floorOneY, -2);
        // Mattress
        addDecor(new THREE.BoxGeometry(2.0, 0.25, 3.3), redFabricMat, -4.0, 0.55 + floorOneY, -2);
        // Pillow
        addDecor(new THREE.BoxGeometry(1.2, 0.2, 0.5), new THREE.MeshStandardMaterial({ color: 0xccbb99 }), -4.0, 0.72 + floorOneY, -3.5);
        // Blanket (slightly displaced)
        addDecor(new THREE.BoxGeometry(1.8, 0.08, 2.0), fabricMat, -3.9, 0.7 + floorOneY, -1.5);

        // RADIO STATION (east side first floor)
        // Desk
        addDecor(new THREE.BoxGeometry(2.0, 0.9, 1.0), woodMat, 4.5, 0.45 + floorOneY, -4.5);
        addDecor(new THREE.BoxGeometry(2.1, 0.08, 1.1), new THREE.MeshStandardMaterial({ color: 0x5a4a3a }), 4.5, 0.94 + floorOneY, -4.5);
        // Radio equipment
        addDecor(new THREE.BoxGeometry(0.8, 0.4, 0.5), metalMat, 4.2, 1.2 + floorOneY, -4.5);
        // Antenna
        addDecor(new THREE.CylinderGeometry(0.02, 0.02, 1.0, 4), metalMat, 4.6, 1.6 + floorOneY, -4.5);
        // Small green light (radio active indicator)
        const radioLight = new THREE.PointLight(0x00ff44, 0.3, 3);
        radioLight.position.set(4.2, 1.5 + floorOneY, -4.5);
        this.house.add(radioLight);

        // Ammo crate on first floor
        addDecor(new THREE.BoxGeometry(1.0, 0.6, 0.8), fabricMat, 3.0, 0.3 + floorOneY + 0.2, 3.0);
        addDecor(new THREE.BoxGeometry(0.8, 0.5, 0.6), new THREE.MeshStandardMaterial({ color: 0x556b2f }), 1.5, 0.25 + floorOneY + 0.2, 4.0);

        // ===== STAIRS =====
        const stepCount = 10, stepH = 4 / stepCount, stepW = 3.5, stepD = 1.2;
        const stairMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.8 });

        // Ground to First Floor (east side)
        for (let i = 0; i < stepCount; i++) {
            const totalHeight = (i + 1) * stepH;
            addPart(new THREE.BoxGeometry(stepW, totalHeight, stepD), stairMat,
                4.0, totalHeight / 2, -5 + (i * (houseSize * 0.6 / stepCount)), 0, 'floor');
        }

        // First Floor to Terrace (west side)
        for (let i = 0; i < stepCount; i++) {
            const totalHeight = (i + 1) * stepH;
            addPart(new THREE.BoxGeometry(stepW, totalHeight, stepD), stairMat,
                -4.0, floorOneY + totalHeight / 2, -5 + (i * (houseSize * 0.6 / stepCount)), 0, 'floor');
        }

        // ===== TERRACE (Level 2) =====
        const topY = 8;
        addPart(new THREE.BoxGeometry(houseSize, 0.3, houseSize), concreteMat, 0, topY, 0, 0, 'floor');

        // Terrace railing
        const railH = 1.0;
        const railMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });

        const postGeo = new THREE.CylinderGeometry(0.08, 0.08, railH, 6);
        const railCorners = [
            [houseSize / 2 - 0.1, topY + railH / 2, houseSize / 2 - 0.1],
            [-houseSize / 2 + 0.1, topY + railH / 2, houseSize / 2 - 0.1],
            [houseSize / 2 - 0.1, topY + railH / 2, -houseSize / 2 + 0.1],
            [-houseSize / 2 + 0.1, topY + railH / 2, -houseSize / 2 + 0.1],
        ];
        railCorners.forEach(p => {
            const post = new THREE.Mesh(postGeo, railMat);
            post.position.set(p[0], p[1], p[2]);
            post.castShadow = true;
            this.house.add(post);
        });

        // Horizontal rails
        const hRailGeoNS = new THREE.BoxGeometry(houseSize, 0.08, 0.08);
        const hRailGeoEW = new THREE.BoxGeometry(0.08, 0.08, houseSize);
        addPart(hRailGeoNS, railMat, 0, topY + railH, houseSize / 2 - 0.1);
        addPart(hRailGeoNS, railMat, 0, topY + railH, -houseSize / 2 + 0.1);
        addPart(hRailGeoEW, railMat, houseSize / 2 - 0.1, topY + railH, 0);
        addPart(hRailGeoEW, railMat, -houseSize / 2 + 0.1, topY + railH, 0);
        addPart(hRailGeoNS, railMat, 0, topY + railH * 0.5, houseSize / 2 - 0.1);
        addPart(hRailGeoNS, railMat, 0, topY + railH * 0.5, -houseSize / 2 + 0.1);
        addPart(hRailGeoEW, railMat, houseSize / 2 - 0.1, topY + railH * 0.5, 0);
        addPart(hRailGeoEW, railMat, -houseSize / 2 + 0.1, topY + railH * 0.5, 0);

        // Sandbag cover positions on terrace
        const sandbagGeo = new THREE.BoxGeometry(2.5, 0.6, 0.7);
        const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 1.0 });
        [[3, topY + 0.3, 5.5], [-3, topY + 0.3, 5.5], [5.5, topY + 0.3, 0, Math.PI / 2], [-5.5, topY + 0.3, 0, Math.PI / 2],
        [3, topY + 0.3, -5.5], [-3, topY + 0.3, -5.5]].forEach(p => {
            const sb = new THREE.Mesh(sandbagGeo, sandbagMat);
            sb.position.set(p[0], p[1], p[2]);
            if (p[3]) sb.rotation.y = p[3];
            sb.castShadow = true;
            this.house.add(sb);
        });

        // ===== WINDOWS =====
        const wGeo = new THREE.PlaneGeometry(1.8, 1.5);
        const sw1 = new THREE.Mesh(wGeo, windowMat); sw1.position.set(0, floorOneY + 2, houseSize / 2 + 0.05); this.house.add(sw1);
        const nw1 = new THREE.Mesh(wGeo, windowMat); nw1.position.set(0, floorOneY + 2, -houseSize / 2 - 0.05); this.house.add(nw1);

        // ===== LIGHTING =====
        // Warm interior lights
        for (let l = 0; l < 2; l++) {
            const light = new THREE.PointLight(0xffaa44, 0, 15);
            light.position.set(0, l * 4 + 3.2, 0);
            this.house.add(light);
            this.houseLights.push(light);
        }

        // Hanging lamp fixtures (decorative)
        for (let l = 0; l < 2; l++) {
            // Chain
            addDecor(new THREE.CylinderGeometry(0.015, 0.015, 0.6, 4), metalMat, 0, l * 4 + 3.7, 0);
            // Lamp shade
            addDecor(new THREE.CylinderGeometry(0.3, 0.15, 0.2, 8), new THREE.MeshStandardMaterial({ color: 0x2a2a1a }), 0, l * 4 + 3.3, 0);
            // Bulb glow
            addDecor(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshStandardMaterial({ color: 0xffcc66, emissive: 0xffaa33, emissiveIntensity: 2.0 }), 0, l * 4 + 3.2, 0);
        }

        // Searchlight on terrace
        const searchlightGroup = new THREE.Group();
        const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4), trimMat);
        searchlightGroup.add(sBase);
        const sHead = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 0.8), new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 }));
        sHead.rotation.x = Math.PI / 2;
        sHead.position.y = 0.5;
        searchlightGroup.add(sHead);

        this.searchlight = new THREE.SpotLight(0xffffff, 0, 50, Math.PI / 6, 0.5);
        this.searchlight.position.set(0, 0.8, 0);
        this.searchlight.target.position.set(0, -10, 20);
        searchlightGroup.add(this.searchlight);
        searchlightGroup.add(this.searchlight.target);
        searchlightGroup.position.set(0, topY + 0.3, 0);
        this.house.add(searchlightGroup);

        this.scene.add(this.house);
    }

    createWatchtowers() {
        this.watchtowers = [];
        this.watchtowerPositions = [];
        // Concrete pillar base
        const towerGeo = new THREE.CylinderGeometry(1.5, 2.0, 5, 8);
        const towerMat = new THREE.MeshStandardMaterial({ color: 0x444444, roughness: 0.9 });
        // Wooden platform
        const platformGeo = new THREE.BoxGeometry(4, 0.4, 4);
        const platformMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1a, roughness: 1.0 });

        // Positions: 4 corners outside the fence radius (fence radius is 13)
        const offset = 16;
        const positions = [
            { x: -offset, z: -offset },
            { x: offset, z: -offset },
            { x: -offset, z: offset },
            { x: offset, z: offset }
        ];

        positions.forEach(pos => {
            const tower = new THREE.Group();

            // Base Pillar
            const base = new THREE.Mesh(towerGeo, towerMat);
            base.position.y = 2.5;
            base.castShadow = true;
            base.receiveShadow = true;
            base.userData.type = 'wall';
            tower.add(base);
            this.houseColliders.push(base);

            // Platform
            const platform = new THREE.Mesh(platformGeo, platformMat);
            platform.position.y = 5.2;
            platform.castShadow = true;
            platform.receiveShadow = true;
            platform.userData.type = 'floor';
            tower.add(platform);
            this.houseColliders.push(platform);

            // Railings
            const railGeoNS = new THREE.BoxGeometry(4, 1.2, 0.2);
            const railGeoEW = new THREE.BoxGeometry(0.2, 1.2, 4);
            const railMat = new THREE.MeshStandardMaterial({ color: 0x2a2218, roughness: 0.8 });

            const r1 = new THREE.Mesh(railGeoNS, railMat); r1.position.set(0, 6, -1.9); tower.add(r1);
            const r2 = new THREE.Mesh(railGeoNS, railMat); r2.position.set(0, 6, 1.9); tower.add(r2);
            const r3 = new THREE.Mesh(railGeoEW, railMat); r3.position.set(-1.9, 6, 0); tower.add(r3);
            const r4 = new THREE.Mesh(railGeoEW, railMat); r4.position.set(1.9, 6, 0); tower.add(r4);

            // Allow collision with railings
            r1.userData.type = 'wall'; r2.userData.type = 'wall';
            r3.userData.type = 'wall'; r4.userData.type = 'wall';
            this.houseColliders.push(r1, r2, r3, r4);

            tower.position.set(pos.x, 0, pos.z);
            this.scene.add(tower);
            this.watchtowers.push(tower);

            // Store safe spawn position for guards inside the tower
            this.watchtowerPositions.push(new THREE.Vector3(pos.x, 5.4, pos.z));
        });
    }

    createFence() {
        if (this.fence.mesh) this.scene.remove(this.fence.mesh);
        this.fence.mesh = new THREE.Group();
        this.fenceColliders = [];
        const rad = 13, count = 48;
        const level = this.fence.level || 1;

        // Visual upgrades per level
        let color, height, metalness, roughness;
        if (level >= 4) { color = 0x666666; height = 4.0; metalness = 0.9; roughness = 0.2; }
        else if (level >= 3) { color = 0x555555; height = 3.5; metalness = 0.7; roughness = 0.3; }
        else if (level >= 2) { color = 0x444444; height = 3.0; metalness = 0.4; roughness = 0.5; }
        else { color = 0x3a2510; height = 2.5; metalness = 0.0; roughness = 0.9; }

        const postMat = new THREE.MeshStandardMaterial({ color, metalness, roughness });
        const wireMat = new THREE.MeshStandardMaterial({
            color: 0x888888, metalness: 0.7, roughness: 0.3,
            transparent: true, opacity: 0.7, side: THREE.DoubleSide
        });

        // ===== GATE CONFIG =====
        // Gate is a straight 3-unit wide opening on the south side (+Z direction)
        const gateHalfWidth = 1.5;
        // Gate post positions (straight line, not curved)
        const gp1x = -gateHalfWidth, gp1z = rad;   // Left post
        const gp2x = gateHalfWidth, gp2z = rad;    // Right post
        const gateOpeningWidth = gateHalfWidth * 2; // 3 units

        // Helper: is this XZ position inside the gate gap?
        const isInGateGap = (x, z) => {
            return (z > rad - 0.5 && z < rad + 0.5 && x > -gateHalfWidth - 0.3 && x < gateHalfWidth + 0.3);
        };

        // ===== FENCE POSTS + WIRE PANELS =====
        const posts = [];
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const px = Math.cos(a) * rad, pz = Math.sin(a) * rad;

            // Skip posts that fall inside the gate gap
            if (isInGateGap(px, pz)) continue;

            const p = new THREE.Mesh(new THREE.BoxGeometry(0.25, height, 0.25), postMat);
            p.position.set(px, height / 2, pz);
            p.castShadow = true;
            p.userData.type = 'wall';
            this.fence.mesh.add(p);
            this.fenceColliders.push(p);
            posts.push({ x: px, z: pz, angle: a });
        }

        // Wire panels between consecutive posts
        for (let i = 0; i < posts.length; i++) {
            const cur = posts[i];
            const next = posts[(i + 1) % posts.length];

            // Skip if the segment would cross the gate gap
            if (isInGateGap((cur.x + next.x) / 2, (cur.z + next.z) / 2)) continue;

            const panelLen = Math.sqrt((next.x - cur.x) ** 2 + (next.z - cur.z) ** 2);
            if (panelLen > 3) continue; // Skip unreasonably long panels (across gate)
            const midX = (cur.x + next.x) / 2, midZ = (cur.z + next.z) / 2;
            const panelAngle = Math.atan2(next.z - cur.z, next.x - cur.x);

            // Invisible collision wall
            const wallPanel = new THREE.Mesh(
                new THREE.BoxGeometry(panelLen, height, 0.3),
                new THREE.MeshStandardMaterial({ visible: false })
            );
            wallPanel.position.set(midX, height / 2, midZ);
            wallPanel.rotation.y = -panelAngle;
            wallPanel.userData.type = 'wall';
            this.fence.mesh.add(wallPanel);
            this.fenceColliders.push(wallPanel);

            // Horizontal wires
            for (let h = 0; h < 4; h++) {
                const wireY = (h + 1) * (height / 5);
                const wire = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.03, 0.03), wireMat);
                wire.position.set(midX, wireY, midZ);
                wire.rotation.y = -panelAngle;
                this.fence.mesh.add(wire);
            }

            // Cross-wire X pattern
            const diagLen = Math.sqrt(panelLen ** 2 + (height * 0.7) ** 2);
            const crossGeo = new THREE.BoxGeometry(diagLen, 0.02, 0.02);
            const cross1 = new THREE.Mesh(crossGeo, wireMat);
            cross1.position.set(midX, height * 0.5, midZ);
            cross1.rotation.y = -panelAngle;
            cross1.rotation.z = Math.atan2(height * 0.7, panelLen);
            this.fence.mesh.add(cross1);

            const cross2 = new THREE.Mesh(crossGeo, wireMat);
            cross2.position.set(midX, height * 0.5, midZ);
            cross2.rotation.y = -panelAngle;
            cross2.rotation.z = -Math.atan2(height * 0.7, panelLen);
            this.fence.mesh.add(cross2);

            // Top rail
            const topRail = new THREE.Mesh(new THREE.BoxGeometry(panelLen, 0.08, 0.08), postMat);
            topRail.position.set(midX, height, midZ);
            topRail.rotation.y = -panelAngle;
            this.fence.mesh.add(topRail);
        }

        // ===== GATE FRAME (straight, not curved) =====
        const gateMat = new THREE.MeshStandardMaterial({ color: 0x5C4033, metalness: 0.5, roughness: 0.5 });

        // Left gate post
        const framePost1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 1.0, 0.5), gateMat);
        framePost1.position.set(gp1x, (height + 1.0) / 2, gp1z);
        framePost1.castShadow = true;
        framePost1.userData.type = 'wall';
        this.fence.mesh.add(framePost1);
        this.fenceColliders.push(framePost1);

        // Right gate post
        const framePost2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 1.0, 0.5), gateMat);
        framePost2.position.set(gp2x, (height + 1.0) / 2, gp2z);
        framePost2.castShadow = true;
        framePost2.userData.type = 'wall';
        this.fence.mesh.add(framePost2);
        this.fenceColliders.push(framePost2);

        // ===== CONNECTOR PANELS: bridge fence curve to gate frame posts =====
        // Find the nearest fence post to each gate post and fill the gap
        const addConnector = (fromX, fromZ, toX, toZ) => {
            const cLen = Math.sqrt((toX - fromX) ** 2 + (toZ - fromZ) ** 2);
            if (cLen < 0.1) return; // Already touching
            const cMidX = (fromX + toX) / 2, cMidZ = (fromZ + toZ) / 2;
            const cAngle = Math.atan2(toZ - fromZ, toX - fromX);

            // Collision wall
            const cWall = new THREE.Mesh(
                new THREE.BoxGeometry(cLen, height, 0.3),
                new THREE.MeshStandardMaterial({ visible: false })
            );
            cWall.position.set(cMidX, height / 2, cMidZ);
            cWall.rotation.y = -cAngle;
            cWall.userData.type = 'wall';
            this.fence.mesh.add(cWall);
            this.fenceColliders.push(cWall);

            // Visible wires
            for (let h = 0; h < 4; h++) {
                const wireY = (h + 1) * (height / 5);
                const wire = new THREE.Mesh(new THREE.BoxGeometry(cLen, 0.03, 0.03), wireMat);
                wire.position.set(cMidX, wireY, cMidZ);
                wire.rotation.y = -cAngle;
                this.fence.mesh.add(wire);
            }

            // Cross wires
            const dLen = Math.sqrt(cLen ** 2 + (height * 0.7) ** 2);
            const cGeo = new THREE.BoxGeometry(dLen, 0.02, 0.02);
            const c1 = new THREE.Mesh(cGeo, wireMat);
            c1.position.set(cMidX, height * 0.5, cMidZ);
            c1.rotation.y = -cAngle;
            c1.rotation.z = Math.atan2(height * 0.7, cLen);
            this.fence.mesh.add(c1);
            const c2 = new THREE.Mesh(cGeo, wireMat);
            c2.position.set(cMidX, height * 0.5, cMidZ);
            c2.rotation.y = -cAngle;
            c2.rotation.z = -Math.atan2(height * 0.7, cLen);
            this.fence.mesh.add(c2);

            // Top rail
            const cRail = new THREE.Mesh(new THREE.BoxGeometry(cLen, 0.08, 0.08), postMat);
            cRail.position.set(cMidX, height, cMidZ);
            cRail.rotation.y = -cAngle;
            this.fence.mesh.add(cRail);
        };

        // Find nearest posts to each gate post
        let nearLeft = null, nearRight = null;
        let minDistL = Infinity, minDistR = Infinity;
        for (const p of posts) {
            const dL = Math.sqrt((p.x - gp1x) ** 2 + (p.z - gp1z) ** 2);
            const dR = Math.sqrt((p.x - gp2x) ** 2 + (p.z - gp2z) ** 2);
            if (dL < minDistL) { minDistL = dL; nearLeft = p; }
            if (dR < minDistR) { minDistR = dR; nearRight = p; }
        }
        if (nearLeft) addConnector(nearLeft.x, nearLeft.z, gp1x, gp1z);
        if (nearRight) addConnector(gp2x, gp2z, nearRight.x, nearRight.z);

        // Top beam connecting the two gate posts
        const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(gateOpeningWidth + 0.5, 0.4, 0.4), gateMat);
        gateBeam.position.set(0, height + 0.8, rad);
        gateBeam.castShadow = true;
        this.fence.mesh.add(gateBeam);

        // "GATE" sign
        const signMat = new THREE.MeshStandardMaterial({ color: 0xcc3333, emissive: 0x331111, emissiveIntensity: 0.4 });
        const sign = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.5, 0.12), signMat);
        sign.position.set(0, height + 0.3, rad + 0.35);
        this.fence.mesh.add(sign);

        // ===== INTERACTIVE DOOR =====
        // The door is a single panel that swings inward on a hinge at the LEFT post
        const doorGroup = new THREE.Group();
        const doorWidth = gateOpeningWidth; // Exactly fills the gate opening
        const doorHeight = height - 0.2;
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x6B4226, roughness: 0.8, metalness: 0.1 });

        // Main door panel (offset X so it pivots from one edge)
        const doorPanel = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, doorHeight, 0.15), doorMat);
        doorPanel.position.set(doorWidth / 2, 0, 0);
        doorPanel.castShadow = true;
        doorGroup.add(doorPanel);

        // Door handle
        const handleMat = new THREE.MeshStandardMaterial({ color: 0xAA8844, metalness: 0.8, roughness: 0.2 });
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.4, 0.2), handleMat);
        handle.position.set(doorWidth - 0.3, 0, 0.15);
        doorGroup.add(handle);

        // Metal reinforcement strips
        const stripMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.9, roughness: 0.2 });
        for (let s = 0; s < 3; s++) {
            const strip = new THREE.Mesh(new THREE.BoxGeometry(doorWidth - 0.1, 0.08, 0.17), stripMat);
            strip.position.set(doorWidth / 2, -doorHeight * 0.3 + s * (doorHeight * 0.3), 0);
            doorGroup.add(strip);
        }

        // Frame border strips on door edges (make it look joined with the posts)
        const frameBorderMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.6, roughness: 0.4 });
        // Left edge
        const leftBorder = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorHeight, 0.18), frameBorderMat);
        leftBorder.position.set(0.05, 0, 0);
        doorGroup.add(leftBorder);
        // Right edge
        const rightBorder = new THREE.Mesh(new THREE.BoxGeometry(0.1, doorHeight, 0.18), frameBorderMat);
        rightBorder.position.set(doorWidth - 0.05, 0, 0);
        doorGroup.add(rightBorder);
        // Top edge
        const topBorder = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 0.1, 0.18), frameBorderMat);
        topBorder.position.set(doorWidth / 2, doorHeight / 2 - 0.05, 0);
        doorGroup.add(topBorder);
        // Bottom edge
        const bottomBorder = new THREE.Mesh(new THREE.BoxGeometry(doorWidth, 0.1, 0.18), frameBorderMat);
        bottomBorder.position.set(doorWidth / 2, -doorHeight / 2 + 0.05, 0);
        doorGroup.add(bottomBorder);

        // Door collision mesh
        this.gateDoorCollider = new THREE.Mesh(
            new THREE.BoxGeometry(doorWidth, doorHeight, 0.5),
            new THREE.MeshStandardMaterial({ visible: false })
        );
        this.gateDoorCollider.position.set(doorWidth / 2, 0, 0);
        this.gateDoorCollider.userData.type = 'wall';
        doorGroup.add(this.gateDoorCollider);

        // Place door group at left gate post, facing outward (+Z)
        doorGroup.position.set(gp1x, doorHeight / 2 + 0.1, gp1z);
        doorGroup.rotation.y = 0; // Door faces +Z (south), swings inward
        this.gateDoorBaseRotation = 0;

        this.gateDoor = doorGroup;
        this.gateDoorOpen = false;
        this.gateDoorAngle = 0;
        this.gateDoorTargetAngle = 0;
        this.fence.mesh.add(doorGroup);
        this.fenceColliders.push(this.gateDoorCollider);

        // Barbed wire on top (skip gate area)
        const barbedMat = new THREE.MeshStandardMaterial({ color: 0x999999, metalness: 0.8, roughness: 0.15 });
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const cx = Math.cos(a) * rad, cz = Math.sin(a) * rad;
            if (isInGateGap(cx, cz)) continue;
            const coil = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.025, 4, 8), barbedMat);
            coil.position.set(cx, height + 0.15, cz);
            coil.rotation.x = Math.PI / 2;
            coil.rotation.z = a;
            this.fence.mesh.add(coil);
        }

        this.scene.add(this.fence.mesh);
    }

    toggleGateDoor() {
        if (!this.gateDoor) return;
        // Check if player is close enough to the gate
        const gatePos = new THREE.Vector3();
        this.gateDoor.getWorldPosition(gatePos);
        const dist = this.player.group.position.distanceTo(gatePos);
        if (dist > 8) return; // Too far away

        this.gateDoorOpen = !this.gateDoorOpen;
        this.isGateOpen = this.gateDoorOpen;
        window.isGateOpen = this.gateDoorOpen;
        this.gateDoorTargetAngle = this.gateDoorOpen ? -Math.PI / 2 : 0;
        audioSystem.playClick();

        // Update collision
        if (this.gateDoorOpen) {
            // Remove door collider from fence colliders when open
            const idx = this.fenceColliders.indexOf(this.gateDoorCollider);
            if (idx !== -1) this.fenceColliders.splice(idx, 1);
        } else {
            // Add it back when closed
            if (!this.fenceColliders.includes(this.gateDoorCollider)) {
                this.fenceColliders.push(this.gateDoorCollider);
            }
        }
    }

    createUpgradeSparkles(pos, color) {
        const count = 30;
        const geo = new THREE.BufferGeometry();
        const posArray = [];
        for (let i = 0; i < count; i++) {
            posArray.push(pos.x, pos.y, pos.z);
        }
        geo.setAttribute('position', new THREE.Float32BufferAttribute(posArray, 3));
        const mat = new THREE.PointsMaterial({ color, size: 0.3, transparent: true, opacity: 1 });
        const points = new THREE.Points(geo, mat);

        points.userData = {
            life: 1.0,
            vels: Array.from({ length: count }, () => new THREE.Vector3((Math.random() - 0.5) * 0.5, Math.random() * 0.5, (Math.random() - 0.5) * 0.5))
        };

        this.scene.add(points);
        this.sparkles.push(points);
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
                this.createFence(); this.ui.updateFenceHealth(100);
                this.createUpgradeSparkles(new THREE.Vector3(0, 2, 13), 0x00ffff);
                ok = true;
            } else if (id === 'house') {
                this.houseHealth = this.maxHouseHealth; this.ui.updateHouseHealth(100);
                this.createUpgradeSparkles(new THREE.Vector3(0, 5, 0), 0xffff00);
                ok = true;
            } else if (type === 'npc') {
                let guardType = 'ak47';
                let pos;
                // Helper to get next uncrowded watchtower
                const getWatchtowerPos = () => {
                    if (!this.watchtowerPositions || this.watchtowerPositions.length === 0) return this.player.group.position.clone().add(new THREE.Vector3(2, 0, 2));
                    // Distribute them evenly
                    let count = this.soldiers.filter(s => s.type !== 'sniper').length;
                    return this.watchtowerPositions[count % this.watchtowerPositions.length].clone();
                };

                if (id === 'bodyguard_rpg' || id === 'bodyguard-rpg') {
                    guardType = 'rpg';
                    pos = getWatchtowerPos();
                } else if (id === 'bodyguard_sniper' || id === 'bodyguard-sniper') {
                    guardType = 'sniper';
                    // Sniper spawns on rooftop
                    const rx = -3 + Math.random() * 6;
                    const rz = -3 + Math.random() * 6;
                    pos = new THREE.Vector3(rx, 8.5, rz);
                } else {
                    // Default AK47 (Assault guard)
                    pos = getWatchtowerPos();
                }
                const s = new Soldier(this.scene, pos, guardType);
                this.soldiers.push(s);
                this.createUpgradeSparkles(pos, guardType === 'sniper' ? 0x3366ff : (guardType === 'rpg' ? 0xff6600 : 0x00ff00));
                ok = true;
            } else if (type === 'ammo') {
                const ammoAmounts = { 'AK47': 30, 'Sniper': 10, 'RPG': 5 };
                const amount = ammoAmounts[id] || 0;
                if (amount > 0) {
                    this.player.ammoReserves[id] += amount;
                    if (this.weaponSystem.currentWeaponKey === id) {
                        this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[id]);
                    }
                    ok = true;
                }
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
        if (e.code === 'KeyF') { audioSystem.playClick(); this.player.toggleFlashlight(); }
        if (e.code === 'KeyX') { this.toggleGateDoor(); }
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
            this.houseLights.forEach(l => l.intensity = intensity * 25);
        }
        if (this.searchlight) {
            this.searchlight.intensity = intensity * 150;
        }
    }

    loop() {
        requestAnimationFrame(() => this.loop());
        const d = 0.016;
        this.updateDayNight(d);

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

        // Animate gate door
        if (this.gateDoor && (this.gateDoorAngle !== this.gateDoorTargetAngle || this.gateDoor.rotation.y !== (this.gateDoorBaseRotation || 0) + this.gateDoorAngle)) {
            this.gateDoorAngle += (this.gateDoorTargetAngle - this.gateDoorAngle) * 0.1;
            if (Math.abs(this.gateDoorAngle - this.gateDoorTargetAngle) < 0.01) {
                this.gateDoorAngle = this.gateDoorTargetAngle;
            }
            this.gateDoor.rotation.y = (this.gateDoorBaseRotation || 0) + this.gateDoorAngle;
            if (this.gateDoorCollider) this.gateDoorCollider.updateMatrixWorld(true);
        }

        const houseParts = (this.houseHealth > 0) ? (this.houseColliders || []) : [];
        const fenceParts = (this.fence.health > 0 && this.fenceColliders) ? this.fenceColliders : [];
        this.player.update(d, [...houseParts, ...fenceParts]);

        // Follow vehicle with camera if driving
        if (this.player.isDriving) {
            const carPos = this.vehicle.mesh.position;
            const camOffset = new THREE.Vector3(0, 5, -10).applyEuler(this.vehicle.mesh.rotation);
            this.camera.position.lerp(carPos.clone().add(camOffset), 0.1);
            this.camera.lookAt(carPos);
        }

        this.zombieManager.update(d, this.player.group, this.house, this.fence,
            (t, a) => this.damage(t, a),

            () => { },
            (type, amt) => {
                this.player.collectLoot(type, amt);
                this.ui.updateCoins(this.player.coins);
                const cur = this.weaponSystem.currentWeaponKey;
                this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[cur]);
                if (this.isBackpackOpen) this.ui.renderInventory(this.player);
            },
            [...houseParts, ...fenceParts]
        );

        // Update Soldiers
        this.soldiers = this.soldiers.filter(s => !s.isDead);
        this.soldiers.forEach(s => s.update(d, this.zombieManager.zombies, this.scene));

        // Update Sparkles
        for (let i = this.sparkles.length - 1; i >= 0; i--) {
            const s = this.sparkles[i];
            s.userData.life -= d * 1.5;
            const pos = s.geometry.attributes.position.array;
            for (let j = 0; j < pos.length; j += 3) {
                const vel = s.userData.vels[j / 3];
                pos[j] += vel.x;
                pos[j + 1] += vel.y;
                pos[j + 2] += vel.z;
            }
            s.geometry.attributes.position.needsUpdate = true;
            s.material.opacity = s.userData.life;
            if (s.userData.life <= 0) {
                this.scene.remove(s);
                this.sparkles.splice(i, 1);
            }
        }

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

        // Voice Chat Implementation
        if (this.multiplayer.isActive && window.lobbySocket) {
            if (!this._voiceInit) {
                this._voiceInit = true;
                this.initVoiceChat();
            }
        }

        this.renderer.render(this.scene, this.camera);
    }

    async initVoiceChat() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const mediaRecorder = new MediaRecorder(stream);
            const statusUi = document.getElementById('voice-status');

            window.addEventListener('keydown', (e) => {
                if (e.code === 'KeyX' && mediaRecorder.state === 'inactive') {
                    mediaRecorder.start();
                    if (statusUi) statusUi.classList.remove('hidden');
                }
            });

            window.addEventListener('keyup', (e) => {
                if (e.code === 'KeyX' && mediaRecorder.state === 'recording') {
                    mediaRecorder.stop();
                    if (statusUi) statusUi.classList.add('hidden');
                }
            });

            mediaRecorder.ondataavailable = (e) => {
                if (window.lobbySocket) {
                    window.lobbySocket.emit('voice-data', e.data);
                }
            };

            window.lobbySocket.on('voice-data', async (data) => {
                const blob = new Blob([data.audio], { type: 'audio/webm' });
                const url = URL.createObjectURL(blob);
                const audio = new Audio(url);
                await audio.play();
            });
        } catch (err) {
            console.warn("Voice chat fail:", err);
        }
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
