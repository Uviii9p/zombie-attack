import * as THREE from 'three';
import { Player } from './player.js';
import { ZombieManager } from './zombie.js';
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
        this.house = null;

        this.fence = { health: 300, maxHealth: 300, level: 1, mesh: null };
        this.houseHealth = 1000;
        this.maxHouseHealth = 1000;
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

        // Realistic Environment
        this.scene.background = new THREE.Color(0x050505); // Darker night desert
        this.scene.fog = new THREE.FogExp2(0x050505, 0.008);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.2));
        const sun = new THREE.DirectionalLight(0x556677, 0.6); // Moonlight
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048; sun.shadow.mapSize.height = 2048;
        this.scene.add(sun);

        const groundGeo = new THREE.PlaneGeometry(2000, 2000);
        const groundMat = new THREE.MeshStandardMaterial({ color: 0x443322, roughness: 1, metalness: 0 });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
        this.scene.add(ground);

        this.createHouse();
        this.createFence();

        // Initialize Systems
        this.player = new Player(this.scene, this.camera);
        this.zombieManager = new ZombieManager(this.scene);
        this.weaponSystem = new WeaponSystem(this.scene, this.camera);

        // UI Listeners
        this.ui.startBtn.onclick = () => this.start();
        this.ui.settingsBtn.onclick = () => this.toggleSettings(true);
        this.ui.saveSettingsBtn.onclick = () => this.saveSettings();
        this.ui.restartBtn.onclick = () => location.reload();
        this.ui.closeShopBtn.onclick = () => this.toggleShop(false);
        this.ui.closeBackpackBtn.onclick = () => this.toggleBackpack(false);
        this.ui.buyButtons.forEach(btn => btn.onclick = (e) => this.buy(e));

        this.loop();
        this.syncStats().catch(() => { });

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.onKey(e));
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
    }

    createHouse() {
        this.house = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: 0x221100, roughness: 1 }));
        b.position.y = 2; b.castShadow = b.receiveShadow = true;
        this.house.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        r.position.y = 5.5; r.rotation.y = Math.PI / 4; r.castShadow = true;
        this.house.add(r);
        this.scene.add(this.house);

        // House Interior Light
        const light = new THREE.PointLight(0xffaa00, 10, 15);
        light.position.set(0, 3, 0);
        this.scene.add(light);
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

    async syncStats() {
        try {
            const r = await fetch('http://localhost:5000/get-stats');
            const d = await r.json();
            this.player.coins = d.coins || 0;
            this.ui.updateCoins(this.player.coins);
        } catch (e) { }
    }

    async updateCoins(amt) {
        this.player.coins += amt;
        this.ui.updateCoins(this.player.coins);
        try {
            await fetch('http://localhost:5000/update-coins', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: amt })
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
            if (ok) this.updateCoins(-cost);
        }
    }

    onKey(e) {
        if (e.code === 'KeyB') this.toggleShop(!this.isShopOpen);
        if (e.code === 'Tab') { e.preventDefault(); this.toggleBackpack(!this.isBackpackOpen); }
        if (e.code === 'Escape' && this.isSettingsOpen) this.toggleSettings(false);

        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) return;

        if (e.code === 'KeyR') {
            const w = this.weaponSystem.currentWeapon;
            const res = this.player.ammoReserves[this.weaponSystem.currentWeaponKey];
            if (res > 0 && w.ammo < w.maxAmmo) {
                this.weaponSystem.reload();
                setTimeout(() => {
                    const need = w.maxAmmo - (w.ammo || 0);
                    const fill = Math.min(need, this.player.ammoReserves[this.weaponSystem.currentWeaponKey]);
                    w.ammo += fill;
                    this.player.ammoReserves[this.weaponSystem.currentWeaponKey] -= fill;
                    this.ui.updateAmmo(w.ammo, this.player.ammoReserves[this.weaponSystem.currentWeaponKey]);
                }, w.reloadTime * 1000);
            }
        }
        if (['Digit1', 'Digit2', 'Digit3'].includes(e.code)) {
            const m = { 'Digit1': 'AK47', 'Digit2': 'Sniper', 'Digit3': 'RPG' };
            if (this.weaponSystem.switchWeapon(m[e.code])) {
                this.ui.updateWeapon(m[e.code]);
                this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[m[e.code]]);
            }
        }
    }

    toggleShop(s) { this.isShopOpen = s; this.ui.toggleShop(s); }
    toggleBackpack(s) { this.isBackpackOpen = s; this.ui.toggleBackpack(s, this.player); }
    onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }

    damage(t, a) {
        if (t === 'player') {
            if (this.player.takeDamage(a)) this.gameOver();
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

    loop() {
        requestAnimationFrame(() => this.loop());
        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen || this.isSettingsOpen) {
            this.renderer.render(this.scene, this.camera);
            return;
        }
        const d = 0.016;
        this.player.update(d, [this.houseHealth > 0 ? this.house : null]);
        this.zombieManager.update(d, this.player.group, this.house, this.fence, (t, a) => this.damage(t, a), () => { }, (type, amt) => {
            this.player.collectLoot(type, amt);
            this.ui.updateCoins(this.player.coins);
            const cur = this.weaponSystem.currentWeaponKey;
            this.ui.updateAmmo(this.weaponSystem.currentWeapon.ammo, this.player.ammoReserves[cur]);
            if (this.isBackpackOpen) this.ui.renderInventory(this.player);
        });
        if (isMouseDown && this.weaponSystem.canFire()) {
            const w = this.weaponSystem.fire(this.zombieManager.zombies.filter(z => !z.isDead), (z, dmg) => this.zombieManager.hitZombie(z, dmg, () => { }));
            if (w) this.ui.updateAmmo(w.ammo, this.player.ammoReserves[this.weaponSystem.currentWeaponKey]);
        }
        this.renderer.render(this.scene, this.camera);
    }
}

let isMouseDown = false;
window.addEventListener('mousedown', () => isMouseDown = true);
window.addEventListener('mouseup', () => isMouseDown = false);
new Game();
