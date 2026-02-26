import { audioSystem } from './audio.js';

export class GameUI {
    constructor() {
        this.playerHealthFill = document.getElementById('player-health-fill');
        this.houseHealthFill = document.getElementById('house-health-fill');
        this.fenceHealthFill = document.getElementById('fence-health-fill');
        this.ammoCount = document.getElementById('ammo-count');
        this.weaponName = document.getElementById('weapon-name');
        this.coinBalance = document.getElementById('coin-balance');
        this.respawnCount = document.getElementById('respawn-count');
        this.respawnStat = document.getElementById('respawn-stat');
        this.medkitCount = document.getElementById('medkit-count');
        this.gameOverScreen = document.getElementById('game-over-screen');
        this.finalCoins = document.getElementById('final-coins');
        this.menuScreen = document.getElementById('menu-screen');
        this.gameTitle = document.getElementById('game-title-text'); // Added ID to the H1
        this.startBtn = document.getElementById('start-btn');
        this.restartBtn = document.getElementById('restart-btn');
        this.adminPanel = document.getElementById('admin-panel');
        this.closeAdminBtn = document.getElementById('close-admin-btn');
        this.waveAnnounceText = document.getElementById('wave-announcement');

        this.titleClicks = 0;
        this.isAdmin = false;

        // Settings
        this.settingsBtn = document.getElementById('settings-btn');
        this.settingsScreen = document.getElementById('settings-screen');
        this.viewSelect = document.getElementById('view-select');
        this.graphicsSelect = document.getElementById('graphics-select');
        this.saveSettingsBtn = document.getElementById('save-settings');
        this.leaveGameBtn = document.getElementById('leave-game-btn');
        this.crosshair = document.getElementById('crosshair');

        // Panels
        this.shopScreen = document.getElementById('shop-screen');
        this.backpackScreen = document.getElementById('backpack-screen');
        this.inventoryList = document.getElementById('inventory-list');

        // Ammo stash
        this.ammoDisplay = {
            'AK47': document.getElementById('ak47-ammo'),
            'Sniper': document.getElementById('sniper-ammo'),
            'RPG': document.getElementById('rpg-ammo'),
            'Grenade': document.getElementById('grenade-ammo')
        };

        this.closeShopBtn = document.getElementById('close-shop');
        this.closeBackpackBtn = document.getElementById('close-backpack');
        this.buyButtons = document.querySelectorAll('.buy-btn');
        this.hudShopBtn = document.getElementById('hud-shop-btn');
        this.hitmarker = document.getElementById('hitmarker');
        this.mobileControls = document.getElementById('mobile-controls');
        this.mobileMedkitCount = document.getElementById('mobile-medkit-count');
        this.mobileShootCooldown = document.getElementById('mobile-shoot-cooldown');
        this.rageBtn = document.getElementById('rage-btn');
        this.mobileRageBtn = document.getElementById('mobile-rage-btn');
        this.xpFill = document.getElementById('xp-fill');
        this.xpLevel = document.getElementById('xp-level');
        this.skillPoints = document.getElementById('skill-points');
        this.comboPanel = document.getElementById('combo-panel');
        this.comboCountText = document.getElementById('combo-count');
        this._hitTimeout = null;

        window.addEventListener('hit-marker', (e) => this.showHitmarker(e.detail?.isHeadshot));
    }

    showHitmarker(isHeadshot = false) {
        if (!this.hitmarker) return;
        this.hitmarker.classList.remove('hidden');
        this.hitmarker.classList.remove('hit-shake');
        this.hitmarker.style.borderColor = isHeadshot ? '#ff2222' : '#ffffff';
        this.hitmarker.style.transform = isHeadshot ? 'translate(-50%, -50%) scale(1.5)' : 'translate(-50%, -50%) scale(1)';

        void this.hitmarker.offsetWidth; // Trigger reflow
        this.hitmarker.classList.add('hit-shake');
        audioSystem.playHitMarker();

        if (this._hitTimeout) clearTimeout(this._hitTimeout);
        this._hitTimeout = setTimeout(() => {
            this.hitmarker.classList.add('hidden');
            this.hitmarker.style.transform = '';
        }, 150);
    }

    setMobileMode(isMobile) {
        if (this.mobileControls) this.mobileControls.classList.toggle('hidden', !isMobile);
        if (this.crosshair) this.crosshair.classList.toggle('mobile-crosshair', isMobile);
        if (this.hitmarker) this.hitmarker.classList.toggle('mobile-hitmarker', isMobile);
    }

    updatePlayerHealth(percent) {
        if (this.playerHealthFill) {
            this.playerHealthFill.style.width = `${percent}%`;
            this.playerHealthFill.classList.toggle('health-low', percent < 30);
        }
    }

    updateFenceHealth(percent) {
        if (this.fenceHealthFill) {
            this.fenceHealthFill.style.width = `${Math.max(0, percent)}%`;
            this.fenceHealthFill.style.backgroundColor = percent < 30 ? '#e74c3c' : '#2ecc71';
        }
    }

    updateHouseHealth(percent) {
        if (this.houseHealthFill) this.houseHealthFill.style.width = `${Math.max(0, percent)}%`;
    }

    updateAmmo(current, reserve) {
        if (this.ammoCount) this.ammoCount.textContent = `${current} / ${reserve}`;
    }

    updateWeapon(name) {
        if (this.weaponName) this.weaponName.textContent = name;
    }

    updateCoins(amount) {
        if (this.coinBalance) this.coinBalance.textContent = amount;
    }

    updateRespawns(count, visible = true) {
        if (this.respawnStat) this.respawnStat.style.display = visible ? 'flex' : 'none';
        if (this.respawnCount) this.respawnCount.textContent = count;
    }

    updateMedkits(count) {
        if (this.medkitCount) this.medkitCount.textContent = count;
        if (this.mobileMedkitCount) this.mobileMedkitCount.textContent = count;
    }

    triggerShootCooldown(seconds) {
        if (!this.mobileShootCooldown || !seconds || seconds <= 0) return;
        this.mobileShootCooldown.style.transition = 'none';
        this.mobileShootCooldown.style.transform = 'scaleY(1)';
        this.mobileShootCooldown.offsetHeight;
        this.mobileShootCooldown.style.transition = `transform ${seconds}s linear`;
        this.mobileShootCooldown.style.transform = 'scaleY(0)';
    }

    updateXP(level, percent, points) {
        if (this.xpFill) this.xpFill.style.width = `${percent}%`;
        if (this.xpLevel) this.xpLevel.textContent = `LVL ${level}`;
        if (this.skillPoints) this.skillPoints.textContent = `SP ${points}`;
    }

    updateCombo(count) {
        if (!this.comboPanel || !this.comboCountText) return;
        if (count > 0) {
            this.comboCountText.textContent = count;
            this.comboPanel.classList.add('active');

            // Pop animation
            this.comboCountText.style.transform = 'scale(1.4)';
            setTimeout(() => { if (this.comboCountText) this.comboCountText.style.transform = 'scale(1)'; }, 100);
        } else {
            this.comboPanel.classList.remove('active');
        }
    }

    updateRage(active, cooldown, duration) {
        const label = active ? `RAGE ${duration.toFixed(1)}s` : (cooldown > 0 ? `RAGE ${cooldown.toFixed(0)}s` : 'RAGE [Q]');
        if (this.rageBtn) {
            this.rageBtn.textContent = label;
            this.rageBtn.classList.toggle('active-rage', active);
        }
        if (this.mobileRageBtn) {
            this.mobileRageBtn.textContent = active ? '🔥' : (cooldown > 0 ? '⏳' : '🔥');
            this.mobileRageBtn.classList.toggle('active-rage', active);
        }
    }

    toggleShop(show) {
        this.shopScreen.classList.toggle('hidden', !show);
        if (show) document.exitPointerLock();
        else if (!document.body.classList.contains('mobile-mode')) {
            const c = document.querySelector('canvas'); if (c) c.requestPointerLock();
        }
    }

    toggleBackpack(show, player) {
        this.backpackScreen.classList.toggle('hidden', !show);
        if (show) {
            document.exitPointerLock();
            this.renderInventory(player);
        } else {
            if (!document.body.classList.contains('mobile-mode')) {
                const c = document.querySelector('canvas'); if (c) c.requestPointerLock();
            }
        }
    }

    toggleSettings(show) {
        this.settingsScreen.classList.toggle('hidden', !show);
    }

    renderInventory(player) {
        this.inventoryList.innerHTML = '';
        player.inventory.forEach(item => {
            const div = document.createElement('div');
            div.className = 'inventory-item';
            div.innerHTML = `<span>${item}</span><span>Collected</span>`;
            this.inventoryList.appendChild(div);
        });

        for (const [key, val] of Object.entries(player.ammoReserves)) {
            if (this.ammoDisplay[key]) this.ammoDisplay[key].textContent = val;
        }
    }

    showGameOver(coins) {
        if (this.finalCoins) this.finalCoins.textContent = coins;
        this.gameOverScreen.classList.remove('hidden');
        document.exitPointerLock();
    }

    announceWave(text, color = '#ff4757') {
        if (!this.waveAnnounceText) return;
        this.waveAnnounceText.textContent = text;
        this.waveAnnounceText.style.textShadow = `0 0 20px ${color}, 0 0 40px ${color}, 0 0 80px ${color}`;
        this.waveAnnounceText.classList.remove('hidden');

        // Hide after 4 seconds
        setTimeout(() => {
            this.waveAnnounceText.classList.add('hidden');
        }, 4000);
    }

    updateViewMode(mode) {
        if (this.viewSelect) this.viewSelect.value = mode;
    }

    hideMenu() {
        this.menuScreen.classList.add('hidden');
    }
}
