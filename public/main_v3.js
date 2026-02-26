import * as THREE from 'three';
import { Player } from './player_v3.js';
import { MultiplayerManager } from './multiplayer.js';
import { ZombieManager } from './zombie.js';
import { Vehicle } from './vehicle.js';
import { audioSystem } from './audio.js';
import { WeaponSystem } from './weapons.js';
import { GameUI } from './ui.js';
import { Soldier } from './soldier.js';
import { MinHeap, MaxHeap } from './heap.js';

class Game {
    constructor() {
        this.isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (this.isMobile) document.body.classList.add('mobile-mode');

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(this.isMobile ? 78 : 70, window.innerWidth / window.innerHeight, 0.1, 1500);
        this.renderer = new THREE.WebGLRenderer({ antialias: !this.isMobile, powerPreference: "high-performance" });

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
        this.lookTouchState = new Map();
        this.mobileLookSensitivity = this.isMobile ? 0.9 : 1.0;
        this.mobileShootHeld = false;
        this.joystickDeadZone = 18;
        this.joystickRadius = 58;
        this.mobileMoveInput = new THREE.Vector2(0, 0);
        this.aimRaycaster = new THREE.Raycaster();
        this.touchBindings = { joystickId: null, aimId: null, shootId: null };
        this.lastLookTouchTime = 0;
        this.mobileFrameSkip = 0;
        this.aimDeadZone = 12;
        this.aimRadius = 58;
        this.mobileTapShoot = true;
        this.mobileTapShotQueued = false;
        this.mobileTapLast = 0;
        this.nearestZombieHeap = new MinHeap((a, b) => a.distSq - b.distSq);
        this.threatZombieHeap = new MaxHeap((a, b) => a.threat - b.threat);
        this._tmpZombieCandidates = [];
        this.timeScale = 1;
        this.xp = 0;
        this.level = 1;
        this.skillPoints = 0;
        this.playerDamageMultiplier = 1;
        this.rage = { active: false, cooldown: 0, duration: 0 };
        this.lightningTimer = 0;
        this.achievements = new Set(JSON.parse(localStorage.getItem('ds_achievements') || '[]'));
        this.skillLevels = { damage: 0, reload: 0, vitality: 0 };

        this.clock = new THREE.Clock();
        this.combo = 0;
        this.comboTimer = 0;

        this.init().catch(e => console.error("Game Init Error:", e));
    }

    async init() {
        this.updateLoadingProgress(10, 'Booting renderer...');

        // Cinematic Renderer Settings (LAG FREE)
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = !this.isMobile;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.25;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.1 : 1.5));
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        const container = document.getElementById('game-container');
        if (container) container.prepend(this.renderer.domElement);

        // Cinematic Environment (Fog + Glow)
        this.scene.background = new THREE.Color(0x05070a);
        this.scene.fog = new THREE.FogExp2(0x05070a, 0.015);

        this.updateLoadingProgress(30, 'Preparing world...');
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.3);
        this.scene.add(this.ambientLight);

        this.hemiLight = new THREE.HemisphereLight(0xffffff, 0x111122, 0.4);
        this.scene.add(this.hemiLight);

        this.sun = new THREE.DirectionalLight(0x7df9ff, 1.2); // Cyan moon light
        this.sun.position.set(20, 50, 20);
        this.sun.castShadow = !this.isMobile;
        this.sun.shadow.mapSize.width = 1024;
        this.sun.shadow.mapSize.height = 1024;
        this.sun.shadow.camera.left = -50;
        this.sun.shadow.camera.right = 50;
        this.sun.shadow.camera.top = 50;
        this.sun.shadow.camera.bottom = -50;
        this.scene.add(this.sun);

        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x554433, roughness: 1, metalness: 0, side: THREE.DoubleSide }); // Brighter ground
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        ground.castShadow = false;
        ground.userData.isGround = true;
        this.groundMesh = ground;
        this.scene.add(ground);

        this.updateLoadingProgress(48, 'Building defenses...');
        this.createHouse();
        this.createWatchtowers();
        this.createFence();
        this.createEnvironment();
        this.createWeather();
        this.createStars();
        this.createAtmosphereFX();

        // Shake properties
        // Shake properties
        this.shakeTime = 0;
        this.shakeIntensity = 0;
        this.cinematicDustTrails = null;
        this.dustParticles = [];

        // Initialize Systems
        this.updateLoadingProgress(64, 'Spawning systems...');
        this.player = new Player(this.scene, this.camera);
        this.player.setLookSensitivity(this.mobileLookSensitivity);
        this.zombieManager = new ZombieManager(this.scene, { isMobile: this.isMobile, groundMesh: this.groundMesh });
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
                if (btn) {
                    this.ui.shopScreen.querySelectorAll('.shop-item').forEach(i => i.classList.remove('selected-item'));
                    btn.closest('.shop-item')?.classList.add('selected-item');
                    this.buy({ target: btn });
                }
            });
        }
        this.decorateShopItems();

        if (this.ui.hudShopBtn) this.ui.hudShopBtn.onclick = () => { audioSystem.playClick(); this.toggleShop(!this.isShopOpen); };
        document.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('mouseenter', () => audioSystem.playUiHover());
            btn.addEventListener('click', () => {
                btn.classList.remove('btn-click');
                btn.offsetHeight;
                btn.classList.add('btn-click');
            });
        });

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

        this.ui.setMobileMode(this.isMobile);
        if (this.isMobile) {
            const hint = document.getElementById('shop-hint');
            if (hint) hint.textContent = 'Left joystick: Move | Right aim pad: Look | Buttons: Fire / Reload / Heal';
            const menuHint = document.querySelector('.controls-hint');
            if (menuHint) menuHint.innerHTML = 'Touch controls enabled.<br>Left joystick: Move | Right aim pad: Look | Fire + Reload buttons';
        }
        this.setupMobileControls();
        this.enforceMobileSafetyGuards();
        this.bindDesktopRageControl();
        this.ui.updateXP(this.level, 0, this.skillPoints);
        this.ui.updateRage(false, 0, 0);
        this.applyDailyReward();

        this.loop();
        this.syncStats().catch(() => { });

        // Day/Night Cycle Properties
        this.cycleTime = 0;
        this.cycleDuration = 120; // 2 minutes (60s day, 60s night)

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('orientationchange', () => setTimeout(() => this.onResize(), 60));
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', () => this.onResize());
        }
        window.addEventListener('keydown', (e) => this.onKey(e));
        this.onResize();

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

                // Listen for shop upgrade sync
                window.lobbySocket.on('lobby-shop-upgrade-sync', (syncData) => {
                    this.processRemoteUpgrade(syncData);
                });
            }
            audioSystem.init();
            audioSystem.playClick();
            this.start();
        });

        document.addEventListener('pointerlockchange', () => {
            if (this.isMobile) return;
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
            audioSystem.playWaveMusicIntensity(wave, false);
            if (wave >= 10) this.unlockAchievement('Wave 10 Survivor', 1200);
            if (wave >= 20) this.unlockAchievement('Wave 20 Slayer', 2600);

            // Sync with others if host
            if (this.multiplayer.isActive && window.isLobbyHost) {
                this.multiplayer.sendWaveStart(wave);
            }
        });
        window.addEventListener('wave-cleared', (e) => {
            this.ui.announceWave('WAVE CLEARED', '#2ed573');
            this.player.playVictoryPose();

            // Sync with others if host
            if (this.multiplayer.isActive && window.isLobbyHost) {
                this.multiplayer.sendWaveCleared(e.detail);
            }
        });

        // Boss events
        window.addEventListener('boss-spawn', (e) => {
            const { name } = e.detail;
            audioSystem.playBossRoar();
            audioSystem.playWaveMusicIntensity(this.zombieManager.currentWave, true);
            const crack = new THREE.Mesh(
                new THREE.RingGeometry(1.8, 3.6, 24),
                new THREE.MeshBasicMaterial({ color: 0x552222, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
            );
            crack.rotation.x = -Math.PI / 2;
            crack.position.set(0, 0.05, 0);
            this.scene.add(crack);
            setTimeout(() => {
                this.scene.remove(crack);
                crack.geometry.dispose();
                crack.material.dispose();
            }, 2200);
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
            this.unlockAchievement('Boss Breaker', 900);
        });

        window.addEventListener('boss-enrage', () => {
            this.ui.announceWave('BOSS ENRAGED', '#ff2222');
            window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.8, duration: 0.5 } }));
        });
        window.addEventListener('boss-summon', (e) => {
            const count = e.detail?.count || 2;
            const wave = e.detail?.wave || this.zombieManager.currentWave;
            for (let i = 0; i < count; i++) this.zombieManager.spawnZombie(wave);
            this.ui.announceWave('MINIONS SUMMONED', '#ff8844');
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
            const { intensity = 0.5, duration = 0.3 } = e.detail || {};
            this.shakeIntensity = intensity;
            this.shakeTime = duration;
            const container = document.getElementById('game-container');
            if (container) {
                container.classList.add('screen-shake');
                setTimeout(() => container.classList.remove('screen-shake'), duration * 1000);
            }
        });

        window.addEventListener('game-won', (e) => {
            this.isGameOver = true;
            this.ui.announceWave('MAP CLEARED! LOADING NEXT AREA...', '#00ff00');
            setTimeout(() => {
                alert('Congratulations! You survived all 10 Waves! Preparing next map...');
                location.reload();
            }, 3000);
        });

        window.addEventListener('gate-broken', () => {
            if (window.isGateBroken) return;
            window.isGateBroken = true;
            this.ui.announceWave('GATE BREACHED!', '#ff4444');
            window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.6, duration: 0.5 } }));
            audioSystem.playExplosion();

            if (this.gateDoor) {
                const idx = this.fenceColliders.indexOf(this.gateDoorCollider);
                if (idx !== -1) this.fenceColliders.splice(idx, 1);

                const startRot = this.gateDoor.rotation.x;
                const targetRot = Math.PI / 2.2;
                let t = 0;
                const animateBreak = () => {
                    t += 0.05;
                    this.gateDoor.rotation.x = THREE.MathUtils.lerp(startRot, targetRot, Math.min(t, 1));
                    if (t < 1) requestAnimationFrame(animateBreak);
                };
                animateBreak();
            }
        });

        window.addEventListener('player-run-dust', (e) => {
            if (!this.gameStarted || this.isGameOver) return;
            if (this.isMobile && this.dustParticles.length > 28) return;
            const pos = e.detail;
            const dustGeo = new THREE.PlaneGeometry(0.5, 0.5);
            const dustMat = new THREE.MeshBasicMaterial({ color: 0x887766, transparent: true, opacity: 0.6, depthWrite: false });
            const dust = new THREE.Mesh(dustGeo, dustMat);
            dust.position.set(pos.x + (Math.random() - 0.5) * 0.5, 0.1, pos.z + (Math.random() - 0.5) * 0.5);
            dust.rotation.x = -Math.PI / 2;
            this.scene.add(dust);
            this.dustParticles.push({
                mesh: dust,
                life: 1.0,
                vy: 0.01 + Math.random() * 0.02,
                vx: (Math.random() - 0.5) * 0.02,
                vz: (Math.random() - 0.5) * 0.02
            });
        });

        // ======= ZOMBIE BULLET HIT EVENT =======
        window.addEventListener('zombie-bullet-hit', (e) => {
            const { damage } = e.detail || {};
            if (damage && this.gameStarted && !this.isGameOver) {
                this.damage('player', damage);
            }
        });

        // ======= POISON DOT SYSTEM =======
        this._poisonActive = false;
        this._poisonTimer = 0;
        this._poisonDuration = 0;
        this._poisonDamage = 0;
        this._poisonTickTimer = 0;

        window.addEventListener('player-poisoned', (e) => {
            const { damage = 5, duration = 5 } = e.detail || {};
            this._poisonActive = true;
            this._poisonDuration = duration;
            this._poisonTimer = 0;
            this._poisonDamage = damage;
            this._poisonTickTimer = 0;
            // Green poison screen tint
            document.body.classList.add('poisoned');
        });

        this.updateLoadingProgress(100, 'Ready');
        setTimeout(() => document.getElementById('loading-screen')?.classList.add('hidden'), 180);
    }

    updateLoadingProgress(percent, label) {
        const fill = document.getElementById('loading-progress');
        const text = document.getElementById('loading-label');
        if (fill) fill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
        if (text && label) text.textContent = label;
    }

    addCombo() {
        this.combo++;
        this.comboTimer = 3.5;
        this.ui.updateCombo(this.combo);
    }

    enforceMobileSafetyGuards() {
        const killScroll = (e) => e.preventDefault();
        document.body.style.overscrollBehavior = 'none';
        document.documentElement.style.overscrollBehavior = 'none';
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 1) e.preventDefault();
        }, { passive: false });
        document.addEventListener('gesturestart', killScroll, { passive: false });
        document.addEventListener('gesturechange', killScroll, { passive: false });
        document.addEventListener('gestureend', killScroll, { passive: false });

        window.addEventListener('beforeunload', (e) => {
            if (!this.gameStarted || this.isGameOver) return;
            e.preventDefault();
            e.returnValue = '';
        });
    }

    setupMobileControls() {
        if (!this.isMobile) return;

        const canvas = this.renderer.domElement;
        const uiLayer = document.getElementById('ui-layer');
        const joystickZone = document.getElementById('mobile-joystick-zone');
        const joystickBase = document.getElementById('mobile-joystick-base');
        const joystickStick = document.getElementById('mobile-joystick-stick');
        const aimZone = document.getElementById('mobile-aim-zone');
        const aimBase = document.getElementById('mobile-aim-base');
        const aimStick = document.getElementById('mobile-aim-stick');
        const shootBtn = document.getElementById('mobile-shoot-btn');
        const reloadBtn = document.getElementById('mobile-reload-btn');
        const healBtn = document.getElementById('mobile-heal-btn');
        const shopBtn = document.getElementById('mobile-shop-btn');
        const viewBtn = document.getElementById('mobile-view-btn');
        const backpackBtn = document.getElementById('mobile-backpack-btn');
        const flashlightBtn = document.getElementById('mobile-flashlight-btn');
        const gateBtn = document.getElementById('mobile-gate-btn');
        const rageBtn = document.getElementById('mobile-rage-btn');

        const action = (e, fn) => {
            e.preventDefault();
            e.stopPropagation();
            if (navigator.vibrate) navigator.vibrate(10);
            fn();
        };

        healBtn?.addEventListener('touchstart', (e) => action(e, () => this.performHeal()));
        shopBtn?.addEventListener('touchstart', (e) => action(e, () => this.toggleShop(!this.isShopOpen)));
        viewBtn?.addEventListener('touchstart', (e) => action(e, () => {
            this.player.toggleView();
            this.ui.updateViewMode(this.player.viewMode);
        }));
        backpackBtn?.addEventListener('touchstart', (e) => action(e, () => this.toggleBackpack(!this.isBackpackOpen)));
        flashlightBtn?.addEventListener('touchstart', (e) => action(e, () => this.player.toggleFlashlight()));
        gateBtn?.addEventListener('touchstart', (e) => action(e, () => this.toggleGateDoor()));
        rageBtn?.addEventListener('touchstart', (e) => action(e, () => this.activateRageMode()));
        reloadBtn?.addEventListener('touchstart', (e) => action(e, () => this.triggerReload()));

        const releaseShoot = () => {
            this.mobileShootHeld = false;
            if (shootBtn) shootBtn.classList.remove('pressed');
        };

        shootBtn?.addEventListener('touchstart', (e) => {
            e.preventDefault();
            this.mobileShootHeld = true;
            shootBtn.classList.add('pressed');
            this.touchBindings.shootId = e.changedTouches[0]?.identifier ?? null;
            if (navigator.vibrate) navigator.vibrate(12);
        }, { passive: false });
        shootBtn?.addEventListener('touchend', (e) => { e.preventDefault(); releaseShoot(); }, { passive: false });
        shootBtn?.addEventListener('touchcancel', (e) => { e.preventDefault(); releaseShoot(); }, { passive: false });

        const setJoystickVisual = (active, dx = 0, dy = 0) => {
            joystickZone?.classList.toggle('active', active);
            if (joystickBase) joystickBase.style.opacity = active ? '1' : '0.45';
            if (joystickStick) joystickStick.style.transform = `translate(${dx}px, ${dy}px)`;
        };
        const setAimVisual = (active, dx = 0, dy = 0) => {
            aimZone?.classList.toggle('active', active);
            if (aimBase) aimBase.style.opacity = active ? '1' : '0.45';
            if (aimStick) aimStick.style.transform = `translate(${dx}px, ${dy}px)`;
        };

        const inLeftControl = (x, y) => x < window.innerWidth * 0.45 && y > window.innerHeight * 0.36;
        const inRightControl = (x, y) => x > window.innerWidth * 0.55 && y > window.innerHeight * 0.25;
        const queueTapShot = () => {
            this.mobileTapShotQueued = true;
            if (navigator.vibrate) navigator.vibrate(6);
        };

        const handleTouchStart = (e) => {
            e.preventDefault();
            if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) return;

            for (const touch of e.changedTouches) {
                const x = touch.clientX;
                const y = touch.clientY;
                if (!this.touchBindings.joystickId && inLeftControl(x, y)) {
                    this.touchBindings.joystickId = touch.identifier;
                    this.lookTouchState.set(touch.identifier, { x, y, startX: x, startY: y });
                    joystickZone?.classList.add('fade-in');
                    continue;
                }

                if (!this.touchBindings.aimId && inRightControl(x, y)) {
                    this.touchBindings.aimId = touch.identifier;
                    this.lookTouchState.set(touch.identifier, { x, y, startX: x, startY: y });
                    const now = performance.now();
                    if (this.mobileTapShoot && now - this.mobileTapLast < 260) queueTapShot();
                    this.mobileTapLast = now;
                    continue;
                }

                if (this.mobileTapShoot && x > window.innerWidth * 0.5) {
                    const now = performance.now();
                    if (now - this.mobileTapLast < 280) queueTapShot();
                    this.mobileTapLast = now;
                }
            }
        };

        const handleTouchMove = (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                const state = this.lookTouchState.get(touch.identifier);
                if (!state) continue;

                if (touch.identifier === this.touchBindings.joystickId) {
                    const dx = touch.clientX - state.startX;
                    const dy = touch.clientY - state.startY;
                    const dist = Math.hypot(dx, dy);
                    const limited = Math.min(dist, this.joystickRadius);
                    const nx = dist > 0 ? dx / dist : 0;
                    const ny = dist > 0 ? dy / dist : 0;
                    const vizX = nx * limited;
                    const vizY = ny * limited;
                    setJoystickVisual(true, vizX, vizY);

                    if (dist > this.joystickDeadZone) {
                        const n = (dist - this.joystickDeadZone) / (this.joystickRadius - this.joystickDeadZone);
                        this.mobileMoveInput.set(nx * Math.min(1, n), ny * Math.min(1, n));
                    } else {
                        this.mobileMoveInput.set(0, 0);
                    }
                } else if (touch.identifier === this.touchBindings.aimId) {
                    const dx = touch.clientX - state.x;
                    const dy = touch.clientY - state.y;
                    this.lastLookTouchTime = performance.now();
                    this.player.applyLookDelta(dx, dy, 0.003);

                    const ax = touch.clientX - state.startX;
                    const ay = touch.clientY - state.startY;
                    const ad = Math.hypot(ax, ay);
                    const lim = Math.min(ad, this.aimRadius);
                    const anx = ad > 0 ? ax / ad : 0;
                    const any = ad > 0 ? ay / ad : 0;
                    const vx = anx * lim;
                    const vy = any * lim;
                    setAimVisual(true, vx, vy);
                }
                state.x = touch.clientX;
                state.y = touch.clientY;
            }
        };

        const handleTouchEnd = (e) => {
            e.preventDefault();
            for (const touch of e.changedTouches) {
                if (touch.identifier === this.touchBindings.joystickId) {
                    this.touchBindings.joystickId = null;
                    this.mobileMoveInput.set(0, 0);
                    this.player.clearTouchMove();
                    joystickZone?.classList.remove('fade-in');
                    setJoystickVisual(false, 0, 0);
                }
                if (touch.identifier === this.touchBindings.aimId) {
                    this.touchBindings.aimId = null;
                    setAimVisual(false, 0, 0);
                }
                if (touch.identifier === this.touchBindings.shootId) releaseShoot();
                this.lookTouchState.delete(touch.identifier);
            }
        };

        canvas.style.touchAction = 'none';
        canvas.addEventListener('touchstart', handleTouchStart, { passive: false });
        canvas.addEventListener('touchmove', handleTouchMove, { passive: false });
        canvas.addEventListener('touchend', handleTouchEnd, { passive: false });
        canvas.addEventListener('touchcancel', handleTouchEnd, { passive: false });
        uiLayer?.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
        uiLayer?.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    }

    createWeather() {
        this.rainGeo = new THREE.BufferGeometry();
        const rainCount = this.isMobile ? 6000 : 15000;
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
        const starCount = this.isMobile ? 2200 : 5000;
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

    createAtmosphereFX() {
        const count = this.isMobile ? 80 : 150;
        const geom = new THREE.BufferGeometry();
        const pos = [];
        for (let i = 0; i < count; i++) {
            pos.push((Math.random() - 0.5) * 180, 1 + Math.random() * 14, (Math.random() - 0.5) * 180);
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = new THREE.PointsMaterial({ color: 0xff6633, size: this.isMobile ? 0.45 : 0.6, transparent: true, opacity: 0.6 });
        this.fireParticles = new THREE.Points(geom, mat);
        this.scene.add(this.fireParticles);
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
        if (!this.isMobile) {
            this.renderer.domElement.requestPointerLock();
        } else {
            document.documentElement.requestFullscreen?.().catch(() => { });
            if (screen.orientation?.lock) {
                screen.orientation.lock('landscape').catch(() => { });
            }
        }
    }

    toggleSettings(show) {
        this.isSettingsOpen = show;
        this.ui.toggleSettings(show);
    }

    saveSettings() {
        const view = this.ui.viewSelect.value;
        const graphics = this.ui.graphicsSelect?.value || 'high';
        this.player.viewMode = view;
        const useLow = graphics === 'low' || this.isMobile;
        this.renderer.shadowMap.enabled = !useLow;
        if (this.sun) this.sun.castShadow = !useLow;
        if (this.rain?.material) this.rain.material.size = useLow ? 0.08 : 0.1;
        if (this.stars?.material) this.stars.material.size = useLow ? 0.55 : 0.8;
        this.mobileLookSensitivity = useLow ? 0.78 : 1.0;
        this.player.setLookSensitivity(this.mobileLookSensitivity);
        this.toggleSettings(false);
        if (!this.isMobile) this.renderer.domElement.requestPointerLock();
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
        if (this.house) this.scene.remove(this.house);
        this.house = new THREE.Group();
        this.houseColliders = [];
        this.houseLights = [];

        const level = this.houseLevel || 1;
        let wallColor = 0x8c7b64;
        let floorColor = 0x4a4339;
        let wallMetalness = 0.1;
        let trimColor = 0x3e3427;
        let trimEmissive = 0x000000;
        let trimIntensity = 0;

        if (level >= 4) {
            wallColor = 0xddddf0; floorColor = 0x1a1a24; wallMetalness = 0.8;
            trimColor = 0x00ffff; trimEmissive = 0x00ffff; trimIntensity = 1.0;
        } // Neon Sci-fi Cyberpunk
        else if (level >= 3) {
            wallColor = 0x555566; floorColor = 0x333333; wallMetalness = 0.5;
            trimColor = 0x2222ff; trimEmissive = 0x0000ff; trimIntensity = 0.5;
        } // Tech bunker
        else if (level >= 2) {
            wallColor = 0x7a6550; floorColor = 0x40372d; wallMetalness = 0.2;
            trimColor = 0xffaa00; trimEmissive = 0x442200; trimIntensity = 0.5;
        } // Bronze reinforced

        // ===== MATERIALS =====
        const wallMat = new THREE.MeshStandardMaterial({ color: wallColor, roughness: 0.8, metalness: wallMetalness });
        const wallInnerMat = new THREE.MeshStandardMaterial({ color: 0x6b5544, roughness: 0.9 });
        const floorMat = new THREE.MeshStandardMaterial({ color: floorColor, roughness: 0.9 });
        const floorPlankMat = new THREE.MeshStandardMaterial({ color: 0x4a3520, roughness: 0.85 });
        const roofMat = new THREE.MeshStandardMaterial({ color: 0x3d352b, roughness: 0.9 });
        const trimMat = new THREE.MeshStandardMaterial({ color: trimColor, metalness: 0.5, roughness: 0.2, emissive: trimEmissive, emissiveIntensity: trimIntensity });
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
        let color, height, metalness, roughness, emissive = 0x000000, emissiveIntensity = 0;
        if (level >= 4) { color = 0xeeeeff; height = 4.0; metalness = 1.0; roughness = 0.1; emissive = 0x00ffff; emissiveIntensity = 0.8; } // Neon Cyberpunk Fence
        else if (level >= 3) { color = 0x888899; height = 3.5; metalness = 0.8; roughness = 0.2; emissive = 0x0055ff; emissiveIntensity = 0.4; } // High Tech Electric
        else if (level >= 2) { color = 0x554444; height = 3.0; metalness = 0.4; roughness = 0.5; }
        else { color = 0x3a2510; height = 2.5; metalness = 0.0; roughness = 0.9; }

        const postMat = new THREE.MeshStandardMaterial({ color, metalness, roughness, emissive, emissiveIntensity });
        const wireMat = new THREE.MeshStandardMaterial({
            color: level >= 3 ? 0x00ffff : 0x888888,
            metalness: 0.7, roughness: 0.3,
            emissive: level >= 3 ? 0x00ffff : 0x000000,
            emissiveIntensity: level >= 3 ? 1.5 : 0.0,
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
        const count = this.isMobile ? 16 : 30;
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
        const bushCount = this.isMobile ? 55 : 100;
        const bushGeo = new THREE.SphereGeometry(1.2, 7, 7);
        const bushMat = new THREE.MeshStandardMaterial({ color: 0x474a38, roughness: 1.0 });

        for (let i = 0; i < bushCount; i++) {
            const bush = new THREE.Mesh(bushGeo, bushMat);
            const x = (Math.random() - 0.5) * 400; const z = (Math.random() - 0.5) * 400;
            if (new THREE.Vector2(x, z).length() < 25) continue; // Keep clear of house

            bush.position.set(x, 0.4, z);
            bush.scale.set(1, 0.6 + Math.random() * 0.4, 1);
            bush.rotation.y = Math.random() * Math.PI;
            bush.castShadow = !this.isMobile; bush.receiveShadow = true;
            envGroup.add(bush);
        }

        // Cacti
        const cactiCount = this.isMobile ? 45 : 80;
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

            cactus.castShadow = !this.isMobile; cactus.receiveShadow = true;
            envGroup.add(cactus);
        }

        // Leafless Creepy Trees
        const treeCount = this.isMobile ? 40 : 80;
        const trunkGeo = new THREE.CylinderGeometry(0.5, 0.8, 6, 6);
        const branchGeo = new THREE.CylinderGeometry(0.2, 0.4, 4, 5);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x221a14, roughness: 0.9, metalness: 0 }); // Dark dead wood

        for (let i = 0; i < treeCount; i++) {
            const x = (Math.random() - 0.5) * 450;
            const z = (Math.random() - 0.5) * 450;
            // Keep well clear of the player base
            if (new THREE.Vector2(x, z).length() < 35) continue;

            const tree = new THREE.Group();
            tree.position.set(x, 0, z);

            // Main trunk
            const trunk = new THREE.Mesh(trunkGeo, treeMat);
            trunk.position.y = 3;
            // Slight random tilt
            trunk.rotation.x = (Math.random() - 0.5) * 0.2;
            trunk.rotation.z = (Math.random() - 0.5) * 0.2;
            trunk.castShadow = !this.isMobile;
            trunk.receiveShadow = true;
            tree.add(trunk);

            // Random branches
            const numBranches = 2 + Math.floor(Math.random() * 3);
            for (let b = 0; b < numBranches; b++) {
                const branch = new THREE.Mesh(branchGeo, treeMat);
                // Attach high up on trunk
                branch.position.y = 3 + Math.random() * 2.5;

                // Angle outward and slightly upward
                const angleY = Math.random() * Math.PI * 2;
                const angleOut = Math.PI / 4 + Math.random() * 0.4;

                branch.rotation.set(0, angleY, 0); // Point in direction
                branch.rotateX(angleOut); // Tilt outward

                // Move out slightly so they don't clip entirely inside trunk center
                branch.translateY(1.5);

                branch.castShadow = !this.isMobile;
                tree.add(branch);
            }

            envGroup.add(tree);
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
            let syncData = null;
            if (type === 'weapon') {
                const unlockReq = { Sniper: 2, Grenade: 3, RPG: 4 };
                const neededLevel = unlockReq[id] || 1;
                if (this.level < neededLevel) {
                    this.ui.announceWave(`UNLOCKS AT LEVEL ${neededLevel}`, '#ff6666');
                    audioSystem.playError();
                    return;
                }
                if (this.weaponSystem.switchWeapon(id)) { ok = true; this.ui.updateWeapon(id); }
            } else if (type === 'upgrade') {
                if (id === 'armor') {
                    if (this.player.upgradeArmor()) {
                        syncData = { type, id };
                        const armorNames = ['Light', 'Medium', 'Heavy', 'Max'];
                        if (this.ui) this.ui.announceWave(`${armorNames[this.player.armor - 1] || 'Armor'} Equipped`, '#3498db');
                        ok = true;
                    }
                } else if (id === 'medkit') {
                    this.player.medkits++;
                    if (this.ui) {
                        this.ui.updateMedkits(this.player.medkits);
                        this.ui.announceWave('MEDKIT PURCHASED', '#2ecc71');
                    }
                    ok = true;
                } else if (id === 'fence' || id === 'house') {
                    ok = true;
                    syncData = { type, id };
                    this.processRemoteUpgrade({ type, id }); // Local process
                }
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
                syncData = { type: 'npc', id, guardType, pos: { x: pos.x, y: pos.y, z: pos.z } };
            } else if (type === 'ammo') {
                const ammoAmounts = { 'AK47': 30, 'Sniper': 10, 'RPG': 5, 'Grenade': 3 };
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
                if (syncData && window.lobbySocket && this.multiplayer && this.multiplayer.isActive) {
                    window.lobbySocket.emit('shop-upgrade-sync', syncData);
                }
            } else {
                audioSystem.playError();
            }
        } else {
            audioSystem.playError();
        }
    }

    processRemoteUpgrade(data) {
        if (!data) return;
        const { type, id } = data;

        if (id === 'fence') {
            this.fence.level++;
            this.fence.health = this.fence.maxHealth = 300 + (this.fence.level * 200);
            this.createFence();
            this.ui.updateFenceHealth(100);
            this.createUpgradeSparkles(new THREE.Vector3(0, 2, 13), 0x00ffff);
            // Log remote fence upgrade
            const fenceNames = ['reinforced', 'metal', 'electric'];
            const fenceName = fenceNames[Math.min(this.fence.level - 1, 2)] || 'upgraded';
            if (this.ui) this.ui.announceWave(`FENCE UPGRADED`, '#00ffff');
        } else if (id === 'house') {
            this.houseLevel = (this.houseLevel || 1) + 1;
            this.maxHouseHealth = 500 + (this.houseLevel * 300);
            this.houseHealth = this.maxHouseHealth;
            this.createHouse();
            this.ui.updateHouseHealth(100);
            this.createUpgradeSparkles(new THREE.Vector3(0, 5, 0), 0xffff00);
            if (this.ui) this.ui.announceWave(`HOUSE UPGRADED`, '#ffff00');
        } else if (type === 'npc') {
            const { guardType, pos } = data;
            if (!guardType || !pos) return;
            const p = new THREE.Vector3(pos.x, pos.y, pos.z);
            const s = new Soldier(this.scene, p, guardType);
            this.soldiers.push(s);
            this.createUpgradeSparkles(p, guardType === 'sniper' ? 0x3366ff : (guardType === 'rpg' ? 0xff6600 : 0x00ff00));
            if (this.ui) this.ui.announceWave(`GUARD DEPLOYED`, '#00ff00');
        }
    }

    onKey(e) {
        if (e.code === 'KeyB') { audioSystem.playClick(); this.toggleShop(!this.isShopOpen); }
        if (e.code === 'Tab') { e.preventDefault(); audioSystem.playClick(); this.toggleBackpack(!this.isBackpackOpen); }
        if (e.code === 'Escape' && this.isSettingsOpen) { audioSystem.playClick(); this.toggleSettings(false); }
        if (e.code === 'KeyH') {
            this.performHeal();
        }
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
        if (['Digit1', 'Digit2', 'Digit3', 'Digit4'].includes(e.code)) {
            const m = { 'Digit1': 'AK47', 'Digit2': 'Sniper', 'Digit3': 'RPG', 'Digit4': 'Grenade' };
            if (this.weaponSystem.switchWeapon(m[e.code])) {
                this.ui.updateWeapon(m[e.code]);
                this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.ui.isAdmin ? '∞' : this.player.ammoReserves[m[e.code]]);
                this.player.switchWeaponModel(m[e.code]);
            }
        }
        if (e.code === 'KeyF') { audioSystem.playClick(); this.player.toggleFlashlight(); }
        if (e.code === 'KeyX') { this.toggleGateDoor(); }
        if (e.code === 'KeyQ') { this.activateRageMode(); }
        if (e.code === 'KeyK') { this.openSkillTree(); }
    }

    performHeal() {
        if (!(this.player && this.player.tryHeal())) return false;
        if (this.ui) {
            this.ui.updateMedkits(this.player.medkits);
            this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
            document.body.classList.toggle('critical-health', (this.player.health / this.player.maxHealth) < 0.28);
            this.startHealCooldown();

            const floatText = document.createElement('div');
            floatText.textContent = '+50 HP';
            floatText.style.position = 'absolute';
            floatText.style.left = '50%'; floatText.style.top = '40%';
            floatText.style.transform = 'translate(-50%, -50%)';
            floatText.style.color = '#2ecc71';
            floatText.style.fontWeight = '900';
            floatText.style.fontFamily = `'Orbitron', sans-serif`;
            floatText.style.fontSize = '3rem';
            floatText.style.textShadow = '0 0 20px #2ecc71, 0 0 40px #2ecc71';
            floatText.style.zIndex = '2000';
            floatText.style.pointerEvents = 'none';
            floatText.style.transition = 'all 1s ease-out';
            document.body.appendChild(floatText);
            setTimeout(() => {
                floatText.style.transform = 'translate(-50%, -150%) scale(1.5)';
                floatText.style.opacity = '0';
            }, 50);
            setTimeout(() => floatText.remove(), 1050);
        }
        return true;
    }

    startHealCooldown() {
        const healBtn = document.getElementById('mobile-heal-btn');
        if (!healBtn) return;
        healBtn.classList.remove('cooldown');
        healBtn.offsetHeight;
        healBtn.classList.add('cooldown');
        setTimeout(() => healBtn.classList.remove('cooldown'), 3050);
    }

    bindDesktopRageControl() {
        const rageBtn = document.getElementById('rage-btn');
        if (!rageBtn) return;
        rageBtn.addEventListener('click', () => this.activateRageMode());
    }

    activateRageMode() {
        if (this.rage.active || this.rage.cooldown > 0) return false;
        this.rage.active = true;
        this.rage.duration = 8;
        this.rage.cooldown = 25;
        this.playerDamageMultiplier = 1.8;
        this.ui.announceWave('RAGE MODE ACTIVATED', '#ff3333');
        window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.35, duration: 0.3 } }));
        return true;
    }

    showDamageNumber(worldPos, amount, headshot = false) {
        if (!worldPos) return;
        const v = worldPos.clone().project(this.camera);
        if (v.z > 1) return;
        const x = (v.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
        const el = document.createElement('div');
        el.className = 'damage-number';
        el.textContent = `${Math.round(amount)}`;
        if (headshot) el.classList.add('headshot');
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('float'), 0);
        setTimeout(() => el.remove(), 650);
    }

    addXP(amount) {
        if (!amount) return;
        this.xp += amount;
        let need = 100 + (this.level - 1) * 45;
        while (this.xp >= need) {
            this.xp -= need;
            this.level += 1;
            this.skillPoints += 1;
            this.ui.announceWave(`LEVEL UP ${this.level}!`, '#33d6ff');
            need = 100 + (this.level - 1) * 45;
        }
        const pct = Math.max(0, Math.min(100, (this.xp / need) * 100));
        this.ui.updateXP(this.level, pct, this.skillPoints);
    }

    openSkillTree() {
        if (this.skillPoints <= 0) {
            this.ui.announceWave('NO SKILL POINTS', '#ff6666');
            return;
        }
        const pick = prompt('Skill Tree: 1 Damage, 2 Reload Speed, 3 Health');
        if (!pick) return;
        if (pick === '1') {
            this.skillLevels.damage += 1;
            this.playerDamageMultiplier += 0.08;
        } else if (pick === '2') {
            this.skillLevels.reload += 1;
            Object.values(this.weaponSystem.weapons).forEach(w => w.reloadTime = Math.max(0.45, w.reloadTime * 0.95));
        } else if (pick === '3') {
            this.skillLevels.vitality += 1;
            this.player.maxHealth += 10;
            this.player.health = Math.min(this.player.maxHealth, this.player.health + 10);
            this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
        } else {
            return;
        }
        this.skillPoints -= 1;
        this.ui.announceWave('SKILL UPGRADED', '#66e0ff');
        const need = 100 + (this.level - 1) * 45;
        const pct = Math.max(0, Math.min(100, (this.xp / need) * 100));
        this.ui.updateXP(this.level, pct, this.skillPoints);
    }

    unlockAchievement(name, coinReward = 0) {
        if (this.achievements.has(name)) return;
        this.achievements.add(name);
        localStorage.setItem('ds_achievements', JSON.stringify([...this.achievements]));
        this.ui.announceWave(`ACHIEVEMENT: ${name}`, '#66e0ff');
        if (coinReward > 0) this.updateCoins(coinReward);
        this.addXP(120);
    }

    applyDailyReward() {
        const key = 'ds_daily_reward';
        const today = new Date().toISOString().slice(0, 10);
        const last = localStorage.getItem(key);
        if (last === today) return;
        localStorage.setItem(key, today);
        this.updateCoins(500);
        this.addXP(80);
        this.ui.announceWave('DAILY REWARD +500 COINS', '#2ed573');
    }

    decorateShopItems() {
        if (!this.ui.shopScreen) return;
        const profiles = {
            AK47: { dmg: 55, spd: 70, acc: 62, rarity: 'common' },
            Sniper: { dmg: 95, spd: 28, acc: 98, rarity: 'epic' },
            RPG: { dmg: 100, spd: 18, acc: 45, rarity: 'legendary' },
            Grenade: { dmg: 88, spd: 25, acc: 40, rarity: 'rare' },
            armor: { dmg: 10, spd: 0, acc: 0, rarity: 'rare' },
            fence: { dmg: 0, spd: 0, acc: 0, rarity: 'common' },
            house: { dmg: 0, spd: 0, acc: 0, rarity: 'common' }
        };

        this.ui.shopScreen.querySelectorAll('.shop-item').forEach((item) => {
            if (item.querySelector('.rarity-chip')) return;
            const id = item.dataset.id;
            const p = profiles[id] || { dmg: 20, spd: 20, acc: 20, rarity: 'common' };
            const unlockReq = { Sniper: 2, Grenade: 3, RPG: 4 };
            const chip = document.createElement('div');
            chip.className = `rarity-chip rarity-${p.rarity}`;
            chip.textContent = p.rarity.toUpperCase();
            item.prepend(chip);
            if (unlockReq[id]) {
                const lock = document.createElement('div');
                lock.className = 'unlock-req';
                lock.textContent = `UNLOCK L${unlockReq[id]}`;
                item.appendChild(lock);
            }
            if (item.dataset.type === 'weapon') {
                const bars = document.createElement('div');
                bars.className = 'stat-bars';
                bars.innerHTML = `
                    <div class="stat-bar"><span>Dmg</span><i style="width:${p.dmg}%"></i></div>
                    <div class="stat-bar"><span>Spd</span><i style="width:${p.spd}%"></i></div>
                    <div class="stat-bar"><span>Acc</span><i style="width:${p.acc}%"></i></div>
                `;
                item.appendChild(bars);
            }
        });
    }

    buildZombiePriorityHeaps(zombies) {
        this.nearestZombieHeap.clear();
        this.threatZombieHeap.clear();
        const p = this.player.group.position;
        for (let i = 0; i < zombies.length; i++) {
            const z = zombies[i];
            if (!z || z.isDead || !z.mesh?.visible) continue;
            const dx = z.mesh.position.x - p.x;
            const dy = z.mesh.position.y - p.y;
            const dz = z.mesh.position.z - p.z;
            const distSq = (dx * dx) + (dy * dy) + (dz * dz);
            const threat = z.health / Math.max(4, distSq);
            const entry = { zombie: z, distSq, threat };
            this.nearestZombieHeap.push(entry);
            this.threatZombieHeap.push(entry);
        }
    }

    getZombieCandidates(limit = 10) {
        this._tmpZombieCandidates.length = 0;
        const seen = new Set();
        const nearTake = Math.max(4, Math.floor(limit * 0.65));
        let count = 0;
        while (!this.nearestZombieHeap.isEmpty() && count < nearTake) {
            const z = this.nearestZombieHeap.pop().zombie;
            if (!seen.has(z)) {
                seen.add(z);
                this._tmpZombieCandidates.push(z);
                count++;
            }
        }
        while (!this.threatZombieHeap.isEmpty() && count < limit) {
            const z = this.threatZombieHeap.pop().zombie;
            if (!seen.has(z)) {
                seen.add(z);
                this._tmpZombieCandidates.push(z);
                count++;
            }
        }
        return this._tmpZombieCandidates;
    }

    isAimingAtZombie(zombies) {
        if (!this.isMobile || !zombies || zombies.length === 0) return false;
        const candidates = this.getZombieCandidates(9);
        const meshes = [];
        candidates.forEach((z) => {
            z.mesh.traverse((child) => {
                if (child.isMesh) meshes.push(child);
            });
        });
        if (meshes.length === 0) return false;
        this.aimRaycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        const hit = this.aimRaycaster.intersectObjects(meshes, false);
        return hit.length > 0;
    }

    applyMobileAimAssist(zombies, delta) {
        if (!this.isMobile || !zombies || zombies.length === 0) return;
        const candidates = this.getZombieCandidates(14);
        const forward = new THREE.Vector3();
        this.camera.getWorldDirection(forward);
        let best = null;
        let bestScore = Infinity;

        candidates.forEach((z) => {
            if (!z || z.isDead || !z.mesh?.visible) return;
            const target = z.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
            const toTarget = target.sub(this.camera.position);
            const dist = toTarget.length();
            if (dist < 1 || dist > 65) return;
            const dir = toTarget.normalize();
            const dot = forward.dot(dir);
            if (dot < 0.86) return;
            const score = (1 - dot) + dist * 0.0025;
            if (score < bestScore) {
                bestScore = score;
                best = dir;
            }
        });

        if (!best) return;
        const desiredYaw = Math.atan2(best.x, -best.z);
        const desiredPitch = Math.asin(THREE.MathUtils.clamp(best.y, -0.95, 0.95));

        const yawDelta = THREE.MathUtils.euclideanModulo(desiredYaw - this.player.mouseRotation.y + Math.PI, Math.PI * 2) - Math.PI;
        const pitchDelta = desiredPitch - this.player.mouseRotation.x;

        const assistStrength = Math.min(1, delta * 4.5);
        this.player.mouseRotation.y += yawDelta * assistStrength;
        this.player.mouseRotation.x += pitchDelta * assistStrength;
        this.player.mouseRotation.x = THREE.MathUtils.clamp(this.player.mouseRotation.x, -1.25, 1.25);
    }

    triggerReload() {
        const w = this.weaponSystem.currentWeapon;
        const key = this.weaponSystem.currentWeaponKey;
        const res = this.player.ammoReserves[key];

        if (!this.weaponSystem.isReloading && (res > 0 || this.ui.isAdmin) && w.ammo < w.maxAmmo) {
            this.weaponSystem.reload();
            this.player.playReloadAnimation();
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
    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight, false);

        const portrait = window.innerHeight > window.innerWidth;
        document.body.classList.toggle('portrait-mode', portrait);
        if (this.isMobile) {
            const mobilePixelRatio = portrait ? 1.05 : 1.25;
            this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobilePixelRatio));
        }

        const shortEdge = Math.min(window.innerWidth, window.innerHeight);
        const uiScale = this.isMobile ? Math.max(0.86, Math.min(1.35, shortEdge / 520)) : 1;
        document.documentElement.style.setProperty('--ui-scale', uiScale.toFixed(2));
    }

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
            const critical = (this.player.health / this.player.maxHealth) < 0.28;
            document.body.classList.toggle('critical-health', critical);

            // AAA Damage Feedback
            document.body.classList.add('damage-flash');
            setTimeout(() => document.body.classList.remove('damage-flash'), 150);
            window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.4 * (a / 20), duration: 0.2 } }));

            if (critical && this.isMobile && navigator.vibrate) navigator.vibrate([8, 30, 8]);
        } else if (t === 'fence') {
            this.fence.health -= a; this.ui.updateFenceHealth((this.fence.health / this.fence.maxHealth) * 100);
            if (this.fence.health <= 0 && this.fence.mesh.parent) this.scene.remove(this.fence.mesh);
        } else if (t === 'house') {
            this.houseHealth -= a; this.ui.updateHouseHealth((this.houseHealth / this.maxHouseHealth) * 100);
            if (this.houseHealth <= 0) this.gameOver();
        }
    }

    gameOver() {
        this.isGameOver = true;
        this.player.playDeathAnimation();
        this.ui.showGameOver(this.player.coins);
    }

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
        this.ambientLight.intensity = 0.2 + (progress * 0.8);

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

        // AAA Slow-Motion Recovery
        if (this.timeScale < 1.0) {
            this.timeScale = Math.min(1.0, this.timeScale + 0.015);
        }

        const d = Math.min(0.05, this.clock.getDelta() * this.timeScale);

        if (this.comboTimer > 0) {
            this.comboTimer -= d;
            if (this.comboTimer <= 0) {
                this.combo = 0;
                this.ui.updateCombo(0);
            }
        }

        if (this.rage.cooldown > 0) this.rage.cooldown = Math.max(0, this.rage.cooldown - d);
        if (this.rage.active) {
            this.rage.duration -= d;
            if (this.rage.duration <= 0) {
                this.rage.active = false;
                this.playerDamageMultiplier = 1;
            }
        }
        this.ui.updateRage(this.rage.active, this.rage.cooldown, this.rage.duration);
        this.updateDayNight(d);
        if (this.player?.health < 30 && Math.random() < 0.08) audioSystem.playHeartbeatLowHp();
        if (Math.random() < 0.003) audioSystem.playNoise(0.5, 'pink', 0.05); // wind gust
        if (Math.random() < 0.002) audioSystem.playZombieGroan(); // distant scream

        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) {
            this.renderer.render(this.scene, this.camera);
            return;
        }

        if (this.rain && this.rain.visible) {
            if (!this.isMobile || (this.mobileFrameSkip++ % 2 === 0)) {
                const positions = this.rain.geometry.attributes.position.array;
                for (let i = 1; i < positions.length; i += 3) {
                    positions[i] -= 2.5; // drop speed
                    if (positions[i] < 0) {
                        positions[i] = 200;
                    }
                }
                this.rain.geometry.attributes.position.needsUpdate = true;
            }
        }

        if (this.fireParticles) {
            const arr = this.fireParticles.geometry.attributes.position.array;
            for (let i = 1; i < arr.length; i += 3) {
                arr[i] += 0.05;
                if (arr[i] > 18) arr[i] = 1;
            }
            this.fireParticles.geometry.attributes.position.needsUpdate = true;
            this.fireParticles.material.opacity = 0.35 + Math.sin(Date.now() * 0.006) * 0.25;
        }
        if (this.cinematicDustTrails && this.cinematicDustTrails.geometry && this.cinematicDustTrails.geometry.attributes.position) {
            const arr = this.cinematicDustTrails.geometry.attributes.position.array;
            const time = Date.now() * 0.0005;
            for (let i = 0; i < arr.length; i += 3) {
                arr[i] += Math.sin(time + i) * 0.02; // slow drift
                arr[i + 1] += 0.005; // tiny rise
                if (arr[i + 1] > 15) arr[i + 1] = 0;
            }
            this.cinematicDustTrails.geometry.attributes.position.needsUpdate = true;
        }

        this.lightningTimer -= d;
        if (this.lightningTimer <= 0 && Math.random() < 0.02) {
            this.lightningTimer = 5 + Math.random() * 8;
            const prev = this.ambientLight.intensity;
            this.ambientLight.intensity = prev + 0.8;
            setTimeout(() => { this.ambientLight.intensity = prev; }, 120);
        }
        this.vehicle.update(d, this.player);
        this.vehicle.checkCollisions(this.zombieManager.zombies, this.zombieManager.bloodParticles);
        const zombiesInPlay = this.zombieManager.zombies.filter(z => !z.isDead);
        this.weaponSystem.update(d, zombiesInPlay, (z, dmg, hitInfo) => {
            const idx = this.zombieManager.zombies.indexOf(z);
            const finalDmg = dmg * this.playerDamageMultiplier;
            this.zombieManager.hitZombie(z, finalDmg, () => {
                this.addXP(18);
            }, hitInfo);

            // AAA Slow-Motion on Headshot
            if (hitInfo?.isHeadshot && z.health <= 0) {
                this.timeScale = 0.15; // Trigger dramatic slow-mo
                window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.8, duration: 0.4 } }));
            }

            if (hitInfo?.point) this.showDamageNumber(hitInfo.point, finalDmg, false);
            if (this.multiplayer.isActive) this.multiplayer.sendZombieHit(idx, dmg);
        }, () => {
            if (this.ui) this.ui.showHitmarker();
            if (this.isMobile && navigator.vibrate) navigator.vibrate(6);
        });

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
        if (this.isMobile) this.player.setTouchMove(this.mobileMoveInput.x, this.mobileMoveInput.y);
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

            () => { this.addXP(12); this.addCombo(); },
            (type, amt) => {
                this.player.collectLoot(type, amt);
                this.ui.updateCoins(this.player.coins);
                const cur = this.weaponSystem.currentWeaponKey;
                this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[cur]);
                if (this.isBackpackOpen) this.ui.renderInventory(this.player);
            },
            [...houseParts, ...fenceParts]
        );

        // ======= POISON DOT TICK PROCESSING =======
        if (this._poisonActive) {
            this._poisonTimer += d;
            this._poisonTickTimer += d;

            // Tick damage every 1 second
            if (this._poisonTickTimer >= 1.0) {
                this._poisonTickTimer -= 1.0;
                this.damage('player', this._poisonDamage);
            }

            // Poison expired
            if (this._poisonTimer >= this._poisonDuration) {
                this._poisonActive = false;
                this._poisonTimer = 0;
                this._poisonDuration = 0;
                this._poisonDamage = 0;
                document.body.classList.remove('poisoned');
            }
        }

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

        // Update Dust Particles
        if (this.dustParticles) {
            for (let i = this.dustParticles.length - 1; i >= 0; i--) {
                let p = this.dustParticles[i];
                p.mesh.position.y += p.vy;
                p.mesh.position.x += p.vx;
                p.mesh.position.z += p.vz;
                p.mesh.scale.x += 0.02;
                p.mesh.scale.y += 0.02;
                p.life -= d * 1.5;
                p.mesh.material.opacity = p.life * 0.6;
                if (p.life <= 0) {
                    this.scene.remove(p.mesh);
                    p.mesh.geometry.dispose();
                    p.mesh.material.dispose();
                    this.dustParticles.splice(i, 1);
                }
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
        this.player.isADS = isADS; // Sync state to player for internal positioning

        if (isADS && isSniper) {
            if (this.ui.crosshair) this.ui.crosshair.classList.add('hidden');
            if (this.player.gunMesh) this.player.gunMesh.visible = false;
            if (scopeUi) scopeUi.classList.remove('hidden');
        } else {
            if (this.ui.crosshair) this.ui.crosshair.classList.remove('hidden');
            if (scopeUi) scopeUi.classList.add('hidden');
            // visibility handled inside player.update/switchWeaponModel
        }
        this.camera.updateProjectionMatrix();

        if (this.mobileTapShotQueued && (performance.now() - this.mobileTapLast > 320)) {
            this.mobileTapShotQueued = false;
        }
        const canAutoShoot = this.isMobile && this.isAimingAtZombie(zombiesInPlay);
        const wantsShoot = isMouseDown || this.mobileShootHeld || this.mobileTapShotQueued || canAutoShoot;
        if (this.isMobile) {
            this.buildZombiePriorityHeaps(zombiesInPlay);
            this.applyMobileAimAssist(zombiesInPlay, d);
        }

        if (wantsShoot && this.weaponSystem.canFire()) {
            const indexedZombies = this.zombieManager.zombies.map((z, i) => ({ z, i })).filter(item => !item.z.isDead);

            const w = this.weaponSystem.fire(indexedZombies.map(item => item.z), (z, dmg, hitInfo) => {
                // Find index of this zombie to sync
                const idx = this.zombieManager.zombies.indexOf(z);
                const finalDmg = dmg * this.playerDamageMultiplier * (hitInfo?.isHeadshot ? 1.7 : 1);
                this.zombieManager.hitZombie(z, finalDmg, () => {
                    this.addXP(hitInfo?.isHeadshot ? 25 : 14);
                }, hitInfo);
                if (hitInfo?.point) this.showDamageNumber(hitInfo.point, finalDmg, !!hitInfo?.isHeadshot);
                if (hitInfo?.isHeadshot) {
                    this.timeScale = 0.45;
                    this.ui.announceWave('HEADSHOT', '#ffef66');
                }
                audioSystem.playImpactVariation();
                if (this.multiplayer.isActive) {
                    this.multiplayer.sendZombieHit(idx, dmg);
                }
            }, () => {
                this.ui.showHitmarker();
            });

            if (w) {
                this.ui.updateAmmo(w.ammo, this.player.ammoReserves[this.weaponSystem.currentWeaponKey]);
                if (this.isMobile) this.ui.triggerShootCooldown(this.weaponSystem.currentWeapon.fireRate);
                if (this.isMobile && navigator.vibrate) navigator.vibrate(8);
                this.mobileTapShotQueued = false;
                // Add recoil shake
                this.shakeIntensity = w.recoil;
                this.shakeTime = 0.15;
                this.player.fireRecoil(); // Physical recoil

                if (this.multiplayer.isActive) {
                    this.multiplayer.sendShoot(this.weaponSystem.currentWeaponKey, this.camera);
                }
            }
        }

        // Camera Shake Processing
        if (this.shakeTime > 0) {
            this.shakeTime -= d;
            const s = this.isMobile ? this.shakeIntensity * 0.55 : this.shakeIntensity;
            this.camera.position.x += (Math.random() - 0.5) * s;
            this.camera.position.y += (Math.random() - 0.5) * s;
            this.camera.rotation.x += s * 0.5; // Recoil kick up
            this.shakeIntensity *= 0.9;
        }

        // Multiplayer Updates
        if (this.multiplayer.isActive) {
            this.multiplayer.sendPosition(this.player, this.weaponSystem.currentWeaponKey);
            this.multiplayer.update(d, this.camera);
            if (window.isLobbyHost) {
                this.multiplayer.sendZombieStates(this.zombieManager.zombies, this.zombieManager.currentWave);
            }
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
