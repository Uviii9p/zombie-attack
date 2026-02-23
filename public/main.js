import * as THREE from 'three';
import { Player } from './player.js';
import { ZombieManager } from './zombie.js';
import { WeaponSystem } from './weapons.js';
import { GameUI } from './ui.js';

class Game {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.renderer = new THREE.WebGLRenderer({ antialias: true });

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

        this.init().catch(e => console.error("Game Init Error:", e));
    }

    async init() {
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.shadowMap.enabled = true;
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const container = document.getElementById('game-container');
        if (container) container.prepend(this.renderer.domElement);

        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const sun = new THREE.DirectionalLight(0xfff5e1, 1.2);
        sun.position.set(50, 100, 50);
        sun.castShadow = true;
        this.scene.add(sun);

        this.scene.background = new THREE.Color(0xd2b48c);
        this.scene.fog = new THREE.FogExp2(0xd2b48c, 0.01);

        const ground = new THREE.Mesh(
            new THREE.PlaneGeometry(1000, 1000),
            new THREE.MeshStandardMaterial({ color: 0xc2a47c, roughness: 1 })
        );
        ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true;
        this.scene.add(ground);

        this.createHouse();
        this.createFence();

        this.player = new Player(this.scene, this.camera);
        this.zombieManager = new ZombieManager(this.scene);
        this.weaponSystem = new WeaponSystem(this.scene, this.camera);

        // Attach UI listeners immediately
        this.ui.startBtn.onclick = () => this.start();
        this.ui.restartBtn.onclick = () => location.reload();
        this.ui.closeShopBtn.onclick = () => this.toggleShop(false);
        this.ui.closeBackpackBtn.onclick = () => this.toggleBackpack(false);
        this.ui.buyButtons.forEach(btn => btn.onclick = (e) => this.buy(e));

        // Start loop immediately
        this.loop();

        // Sync stats in background
        this.syncStats().catch(e => console.warn("Stats sync skipped:", e));

        window.addEventListener('resize', () => this.onResize());
        window.addEventListener('keydown', (e) => this.onKey(e));
    }

    start() {
        this.gameStarted = true;
        this.ui.hideMenu();
        try {
            document.body.requestPointerLock();
        } catch (e) { }
    }

    createHouse() {
        this.house = new THREE.Group();
        const b = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 6), new THREE.MeshStandardMaterial({ color: 0x5d4037 }));
        b.position.y = 2; this.house.add(b);
        const r = new THREE.Mesh(new THREE.ConeGeometry(5, 3, 4), new THREE.MeshStandardMaterial({ color: 0x111111 }));
        r.position.y = 5.5; r.rotation.y = Math.PI / 4; this.house.add(r);
        this.scene.add(this.house);
    }

    createFence() {
        if (this.fence.mesh) this.scene.remove(this.fence.mesh);
        this.fence.mesh = new THREE.Group();
        const rad = 13, count = 28;
        const color = this.fence.level > 1 ? 0x888888 : 0x4e342e;
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2;
            const p = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2, 0.3), new THREE.MeshStandardMaterial({ color }));
            p.position.set(Math.cos(a) * rad, 1, Math.sin(a) * rad);
            this.fence.mesh.add(p);
            if (i % 2 === 0) {
                const beam = new THREE.Mesh(new THREE.BoxGeometry(3, 0.15, 0.1), new THREE.MeshStandardMaterial({ color }));
                beam.position.set(Math.cos(a + 0.1) * rad, 1.5, Math.sin(a + 0.1) * rad);
                beam.rotation.y = -a;
                this.fence.mesh.add(beam);
            }
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
        if (e.code === 'KeyV') this.player.toggleView();
        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen) return;
        if (e.code === 'KeyG') { // Give coins for testing
            this.updateCoins(100);
        }
        if (e.code === 'KeyR') {
            const w = this.weaponSystem.currentWeapon;
            const res = this.player.ammoReserves[this.weaponSystem.currentWeaponKey];
            if (res > 0 && w.ammo < w.maxAmmo) {
                this.weaponSystem.reload();
                setTimeout(() => {
                    const need = w.maxAmmo - w.ammo;
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

    toggleShop(s) { this.isShopOpen = s; if (s) this.toggleBackpack(false); this.ui.toggleShop(s); }
    toggleBackpack(s) { this.isBackpackOpen = s; if (s) this.toggleShop(false); this.ui.toggleBackpack(s, this.player); }
    onResize() { this.camera.aspect = window.innerWidth / window.innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(window.innerWidth, window.innerHeight); }

    damage(t, a) {
        if (t === 'player') {
            if (this.player.takeDamage(a)) this.gameOver();
            this.ui.updatePlayerHealth((this.player.health / this.player.maxHealth) * 100);
        } else if (t === 'fence') {
            this.fence.health -= a; this.ui.updateFenceHealth((this.fence.health / this.fence.maxHealth) * 100);
            if (this.fence.health <= 0) this.scene.remove(this.fence.mesh);
        } else if (t === 'house') {
            this.houseHealth -= a; this.ui.updateHouseHealth((this.houseHealth / this.maxHouseHealth) * 100);
            if (this.houseHealth <= 0) this.gameOver();
        }
    }

    gameOver() { this.isGameOver = true; this.ui.showGameOver(this.player.coins); }

    loop() {
        requestAnimationFrame(() => this.loop());
        if (!this.gameStarted || this.isGameOver || this.isShopOpen || this.isBackpackOpen) return;
        const d = 0.016; this.player.update(d, [this.houseHealth > 0 ? this.house : null]);
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
