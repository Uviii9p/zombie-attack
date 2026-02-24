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

        const houseSize = 12;

        // ===== GROUND FLOOR (Level 0) =====
        // Floor
        addPart(new THREE.BoxGeometry(houseSize, 0.4, houseSize), floorMat, 0, 0, 0, 0, 'floor');

        // Walls - Ground Floor (4 units tall)
        const wallH = 4;
        const wallT = 0.4;

        // South wall with WIDE doorway (5 units gap)
        const gap = 5;
        const sideW = (houseSize - gap) / 2;
        addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, -(gap / 2 + sideW / 2), 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(sideW, wallH, wallT), wallMat, (gap / 2 + sideW / 2), 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(gap, 0.8, wallT), wallMat, 0, 3.6, houseSize / 2); // Door top frame

        // North wall
        addPart(new THREE.BoxGeometry(houseSize, wallH, wallT), wallMat, 0, 2, -houseSize / 2);
        // East wall
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, houseSize / 2, 2, 0);
        // West wall
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, -houseSize / 2, 2, 0);

        // Ground floor ceiling with stair hole on east side
        const ceilT = 0.3;
        // Main ceiling (covers most of floor)
        addPart(new THREE.BoxGeometry(houseSize * 0.6, ceilT, houseSize), floorMat, -houseSize * 0.2, 4, 0, 0, 'floor');
        // Small ceiling piece north-east
        addPart(new THREE.BoxGeometry(houseSize * 0.4, ceilT, houseSize * 0.4), floorMat, houseSize * 0.3, 4, -houseSize * 0.3, 0, 'floor');
        // Stair hole is at east side, south half (approx x: 2-6, z: 0-6)

        // ===== FIRST FLOOR (Level 1) =====
        // Walls - First Floor
        const floorOneY = 4;
        // South wall with window openings
        const winGap = 2.0;
        const winSideW = (houseSize - winGap) / 2;
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, -(winGap / 2 + winSideW / 2), floorOneY + 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, (winGap / 2 + winSideW / 2), floorOneY + 2, houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.2, wallT), wallMat, 0, floorOneY + 3.4, houseSize / 2); // Top of window
        addPart(new THREE.BoxGeometry(winGap, 1.0, wallT), wallMat, 0, floorOneY + 0.5, houseSize / 2); // Bottom of window

        // North wall with window
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, -(winGap / 2 + winSideW / 2), floorOneY + 2, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winSideW, wallH, wallT), wallMat, (winGap / 2 + winSideW / 2), floorOneY + 2, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.2, wallT), wallMat, 0, floorOneY + 3.4, -houseSize / 2);
        addPart(new THREE.BoxGeometry(winGap, 1.0, wallT), wallMat, 0, floorOneY + 0.5, -houseSize / 2);

        // East wall
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, houseSize / 2, floorOneY + 2, 0);
        // West wall
        addPart(new THREE.BoxGeometry(wallT, wallH, houseSize), wallMat, -houseSize / 2, floorOneY + 2, 0);

        // ===== STAIRS (Ground to First Floor) — SOLID RAMP =====
        const stepCount = 10;
        const stepH = 4 / stepCount;
        const stepW = 3.5;
        const stepD = 1.2;
        for (let i = 0; i < stepCount; i++) {
            // Each step is a thick box that overlaps with the next for solid footing
            const totalHeight = (i + 1) * stepH;
            addPart(
                new THREE.BoxGeometry(stepW, totalHeight, stepD),
                trimMat,
                4.0,
                totalHeight / 2,
                -5 + (i * (houseSize * 0.6 / stepCount)),
                0,
                'floor'
            );
        }

        // ===== OPEN TERRACE / ROOF (Level 2) =====
        const topY = 8;
        // Terrace floor
        addPart(new THREE.BoxGeometry(houseSize, 0.3, houseSize), floorMat, 0, topY, 0, 0, 'floor');

        // Stairs from first floor to terrace (west side) — SOLID RAMP
        for (let i = 0; i < stepCount; i++) {
            const totalHeight = (i + 1) * stepH;
            addPart(
                new THREE.BoxGeometry(stepW, totalHeight, stepD),
                trimMat,
                -4.0,
                floorOneY + totalHeight / 2,
                -5 + (i * (houseSize * 0.6 / stepCount)),
                0,
                'floor'
            );
        }

        // Stair hole in first floor ceiling for terrace access
        // Already open since we don't add a ceiling to level 1

        // Protective railing around terrace (waist-height, player can shoot over)
        const railH = 1.0;
        const railMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.6, roughness: 0.4 });

        // Rail posts at corners
        const postGeo = new THREE.CylinderGeometry(0.08, 0.08, railH, 6);
        const railPositions = [
            [houseSize / 2 - 0.1, topY + railH / 2, houseSize / 2 - 0.1],
            [-houseSize / 2 + 0.1, topY + railH / 2, houseSize / 2 - 0.1],
            [houseSize / 2 - 0.1, topY + railH / 2, -houseSize / 2 + 0.1],
            [-houseSize / 2 + 0.1, topY + railH / 2, -houseSize / 2 + 0.1],
        ];
        railPositions.forEach(p => {
            const post = new THREE.Mesh(postGeo, railMat);
            post.position.set(p[0], p[1], p[2]);
            post.castShadow = true;
            this.house.add(post);
        });

        // Horizontal rails (thin bars you can shoot through)
        const hRailGeoNS = new THREE.BoxGeometry(houseSize, 0.08, 0.08);
        const hRailGeoEW = new THREE.BoxGeometry(0.08, 0.08, houseSize);

        // Top rail
        addPart(hRailGeoNS, railMat, 0, topY + railH, houseSize / 2 - 0.1);
        addPart(hRailGeoNS, railMat, 0, topY + railH, -houseSize / 2 + 0.1);
        addPart(hRailGeoEW, railMat, houseSize / 2 - 0.1, topY + railH, 0);
        addPart(hRailGeoEW, railMat, -houseSize / 2 + 0.1, topY + railH, 0);

        // Mid rail
        addPart(hRailGeoNS, railMat, 0, topY + railH * 0.5, houseSize / 2 - 0.1);
        addPart(hRailGeoNS, railMat, 0, topY + railH * 0.5, -houseSize / 2 + 0.1);
        addPart(hRailGeoEW, railMat, houseSize / 2 - 0.1, topY + railH * 0.5, 0);
        addPart(hRailGeoEW, railMat, -houseSize / 2 + 0.1, topY + railH * 0.5, 0);

        // Windows (glowing panes on first floor)
        const wGeo = new THREE.PlaneGeometry(1.8, 1.5);
        // South windows
        const sw1 = new THREE.Mesh(wGeo, windowMat); sw1.position.set(0, floorOneY + 2, houseSize / 2 + 0.05); this.house.add(sw1);
        // North windows
        const nw1 = new THREE.Mesh(wGeo, windowMat); nw1.position.set(0, floorOneY + 2, -houseSize / 2 - 0.05); this.house.add(nw1);

        // Interior lights for both floors
        for (let l = 0; l < 2; l++) {
            const light = new THREE.PointLight(0xffaa00, 0, 15);
            light.position.set(0, l * 4 + 2.5, 0);
            this.house.add(light);
            this.houseLights.push(light);
        }

        // Searchlight on terrace
        const searchlightGroup = new THREE.Group();
        const sBase = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.4), trimMat);
        searchlightGroup.add(sBase);
        const sHead = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 0.8), roofMat);
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

        // Crates for survival look (ground floor inside)
        const crateGeo = new THREE.BoxGeometry(1, 1, 1);
        const crateMat = new THREE.MeshStandardMaterial({ color: 0x5d4037 });
        for (let i = 0; i < 4; i++) {
            const crate = new THREE.Mesh(crateGeo, crateMat);
            crate.position.set(-3 + Math.random() * 4, 0.5, -3 + Math.random() * 4);
            crate.rotation.y = Math.random() * Math.PI;
            crate.castShadow = true;
            this.house.add(crate);
            this.houseColliders.push(crate);
        }

        // Sandbags on terrace for cover
        const sandbagGeo = new THREE.BoxGeometry(2, 0.5, 0.6);
        const sandbagMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 1.0 });
        const sandbagPositions = [
            [3, topY + 0.25, 5.5], [-3, topY + 0.25, 5.5],
            [5.5, topY + 0.25, 0], [-5.5, topY + 0.25, 0],
        ];
        sandbagPositions.forEach(p => {
            const sb = new THREE.Mesh(sandbagGeo, sandbagMat);
            sb.position.set(p[0], p[1], p[2]);
            sb.castShadow = true;
            this.house.add(sb);
        });

        this.scene.add(this.house);
    }

    createFence() {
        if (this.fence.mesh) this.scene.remove(this.fence.mesh);
        this.fence.mesh = new THREE.Group();
        this.fenceColliders = []; // Collision array for fence
        const rad = 13, count = 32;
        const level = this.fence.level || 1;

        // Gate opening: skip posts near angle ~PI/2 (south side, z positive)
        const gateAngle = Math.PI / 2; // South
        const gateWidth = 0.2; // ~0.2 radians gap = ~2.5 unit gap at radius 13

        // Visual upgrades per level
        let color, height, metalness, roughness;
        if (level >= 4) {
            color = 0x666666; height = 4.0; metalness = 0.9; roughness = 0.2;
        } else if (level >= 3) {
            color = 0x555555; height = 3.5; metalness = 0.7; roughness = 0.3;
        } else if (level >= 2) {
            color = 0x444444; height = 3.0; metalness = 0.4; roughness = 0.5;
        } else {
            color = 0x3a2510; height = 2.5; metalness = 0.0; roughness = 0.9;
        }

        const postMat = new THREE.MeshStandardMaterial({ color, metalness, roughness });

        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            // Skip posts in the gate area
            const angleDiff = Math.abs(a - gateAngle);
            if (angleDiff < gateWidth || angleDiff > (Math.PI * 2 - gateWidth)) continue;

            const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, height, 0.4), postMat);
            p.position.set(Math.cos(a) * rad, height / 2, Math.sin(a) * rad);
            p.castShadow = true;
            p.userData.type = 'wall';
            this.fence.mesh.add(p);
            this.fenceColliders.push(p);
        }

        // Gate frame (two thick posts on either side of the opening)
        const gateMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, metalness: 0.3, roughness: 0.7 });
        const gateA1 = gateAngle - gateWidth;
        const gateA2 = gateAngle + gateWidth;
        const gatePost1 = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 0.5, 0.5), gateMat);
        gatePost1.position.set(Math.cos(gateA1) * rad, (height + 0.5) / 2, Math.sin(gateA1) * rad);
        gatePost1.castShadow = true;
        gatePost1.userData.type = 'wall';
        this.fence.mesh.add(gatePost1);
        this.fenceColliders.push(gatePost1);

        const gatePost2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, height + 0.5, 0.5), gateMat);
        gatePost2.position.set(Math.cos(gateA2) * rad, (height + 0.5) / 2, Math.sin(gateA2) * rad);
        gatePost2.castShadow = true;
        gatePost2.userData.type = 'wall';
        this.fence.mesh.add(gatePost2);
        this.fenceColliders.push(gatePost2);

        // Gate top beam
        const beamLen = Math.sqrt(
            Math.pow(Math.cos(gateA2) * rad - Math.cos(gateA1) * rad, 2) +
            Math.pow(Math.sin(gateA2) * rad - Math.sin(gateA1) * rad, 2)
        );
        const beamMidA = gateAngle;
        const gateBeam = new THREE.Mesh(new THREE.BoxGeometry(beamLen, 0.3, 0.3), gateMat);
        gateBeam.position.set(Math.cos(beamMidA) * rad, height + 0.2, Math.sin(beamMidA) * rad);
        gateBeam.rotation.y = -(beamMidA) + Math.PI / 2;
        this.fence.mesh.add(gateBeam);

        // Horizontal connecting panels between posts (solid wall sections)
        if (level >= 2) {
            const barMat = new THREE.MeshStandardMaterial({ color, metalness: metalness + 0.1, roughness });
            for (let i = 0; i < count; i++) {
                const a1 = (i / count) * Math.PI * 2;
                const a2 = ((i + 1) / count) * Math.PI * 2;
                // Skip gate area
                const midA = (a1 + a2) / 2;
                const angleDiff = Math.abs(midA - gateAngle);
                if (angleDiff < gateWidth + 0.1 || angleDiff > (Math.PI * 2 - gateWidth - 0.1)) continue;

                const barLen = 2 * rad * Math.sin(Math.PI / count);

                const bar = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.1, 0.1), barMat);
                bar.position.set(Math.cos(midA) * rad, height * 0.85, Math.sin(midA) * rad);
                bar.rotation.y = -midA + Math.PI / 2;
                this.fence.mesh.add(bar);

                const bar2 = new THREE.Mesh(new THREE.BoxGeometry(barLen, 0.1, 0.1), barMat);
                bar2.position.set(Math.cos(midA) * rad, height * 0.45, Math.sin(midA) * rad);
                bar2.rotation.y = -midA + Math.PI / 2;
                this.fence.mesh.add(bar2);
            }
        }

        // Barbed wire at level 4+
        if (level >= 4) {
            const wireMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.1 });
            for (let i = 0; i < count; i++) {
                const a = (i / count) * Math.PI * 2;
                const angleDiff = Math.abs(a - gateAngle);
                if (angleDiff < gateWidth || angleDiff > (Math.PI * 2 - gateWidth)) continue;
                const wire = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.03, 4, 6), wireMat);
                wire.position.set(Math.cos(a) * rad, height + 0.2, Math.sin(a) * rad);
                wire.rotation.x = Math.PI / 2;
                this.fence.mesh.add(wire);
            }
        }

        this.scene.add(this.fence.mesh);
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
            } else if (type === 'npc' && id === 'bodyguard') {
                const pos = this.player.group.position.clone().add(new THREE.Vector3(2, 0, 2));
                const s = new Soldier(this.scene, pos);
                this.soldiers.push(s);
                this.createUpgradeSparkles(pos, 0x00ff00);
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

        this.zombieManager.update(d, this.player.group, this.house, this.fence, (t, a) => this.damage(t, a), () => { }, (type, amt) => {
            this.player.collectLoot(type, amt);
            this.ui.updateCoins(this.player.coins);
            const cur = this.weaponSystem.currentWeaponKey;
            this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[cur]);
            if (this.isBackpackOpen) this.ui.renderInventory(this.player);
        });

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
