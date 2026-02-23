import * as THREE from 'three';

// Renders remote players' 3D models in the scene
export class MultiplayerManager {
    constructor(scene) {
        this.scene = scene;
        this.remotePlayers = new Map(); // id -> { group, nameTag, lastUpdate, data }
        this.socket = null;
        this.isActive = false;
        this.localPlayerName = '';
        this.localAvatar = 0;
        this.sendRate = 50; // ms between position updates (20 per second)
        this.lastSendTime = 0;
    }

    init(socket, playerName, avatar, zombieManager) {
        this.socket = socket;
        this.localPlayerName = playerName;
        this.localAvatar = avatar;
        this.zombieManager = zombieManager;
        this.isActive = true;

        // Listen for remote player updates
        this.socket.on('player-moved', (data) => this.onPlayerMoved(data));
        this.socket.on('player-left', (data) => this.onPlayerLeft(data));
        this.socket.on('player-shot', (data) => this.onPlayerShot(data));

        // Zombie Sync
        this.socket.on('zombie-hit-sync', (data) => {
            if (this.zombieManager) {
                const zombie = this.zombieManager.zombies[data.zombieIndex];
                if (zombie && !zombie.isDead) {
                    // Only apply damage if it's NOT from the local player
                    if (data.id !== this.socket.id) {
                        zombie.takeDamage(data.damage);
                        zombie.showHitEffect(); // Show local visual/audio effect
                    }
                }
            }
        });

        // Wave Sync
        this.socket.on('wave-cleared-sync', (wave) => {
            if (this.zombieManager) {
                this.zombieManager.forceClearWave(wave);
            }
        });

        this.socket.on('wave-start-sync', (wave) => {
            if (this.zombieManager) {
                this.zombieManager.forceStartWave(wave);
            }
        });

        console.log('[Multiplayer] Sync active');
    }

    sendZombieHit(index, damage) {
        if (!this.isActive || !this.socket) return;
        this.socket.emit('player-hit-zombie', { zombieIndex: index, damage: damage });
    }

    sendWaveCleared(wave) {
        if (!this.isActive || !this.socket) return;
        this.socket.emit('wave-cleared-sync', wave);
    }

    sendWaveStart(wave) {
        if (!this.isActive || !this.socket) return;
        this.socket.emit('wave-start-sync', wave);
    }

    // Send local player's position to server
    sendPosition(player, weaponKey) {
        if (!this.isActive || !this.socket) return;

        const now = performance.now();
        if (now - this.lastSendTime < this.sendRate) return;
        this.lastSendTime = now;

        const pos = player.group.position;
        this.socket.emit('player-move', {
            x: Math.round(pos.x * 100) / 100,
            y: Math.round(pos.y * 100) / 100,
            z: Math.round(pos.z * 100) / 100,
            ry: Math.round(player.mouseRotation.y * 100) / 100,
            name: this.localPlayerName,
            avatar: this.localAvatar,
            health: player.health,
            weapon: weaponKey,
            isDriving: player.isDriving
        });
    }

    // Send shoot event
    sendShoot(weaponKey, camera) {
        if (!this.isActive || !this.socket) return;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        this.socket.emit('player-shoot', {
            weapon: weaponKey,
            x: camera.position.x, y: camera.position.y, z: camera.position.z,
            dx: dir.x, dy: dir.y, dz: dir.z
        });
    }

    onPlayerMoved(data) {
        let remote = this.remotePlayers.get(data.id);
        if (!remote) {
            remote = this.createRemotePlayer(data);
            this.remotePlayers.set(data.id, remote);
        }
        // Store target for interpolation
        remote.targetPos = new THREE.Vector3(data.x, data.y, data.z);
        remote.targetRotY = data.ry;
        remote.data = data;
        remote.lastUpdate = performance.now();

        // Update name tag
        if (remote.nameSprite) {
            // Already created
        }
    }

    onPlayerLeft(data) {
        const remote = this.remotePlayers.get(data.id);
        if (remote) {
            this.scene.remove(remote.group);
            this.remotePlayers.delete(data.id);
            console.log('[Multiplayer] Player left:', data.id);
        }
    }

    onPlayerShot(data) {
        // Create a muzzle flash at remote player's position
        const remote = this.remotePlayers.get(data.id);
        if (!remote) return;

        const flashGeo = new THREE.SphereGeometry(0.15, 6, 6);
        const flashMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
        const flash = new THREE.Mesh(flashGeo, flashMat);
        flash.position.set(data.x, data.y, data.z);
        this.scene.add(flash);

        // Quick light 
        const light = new THREE.PointLight(0xffaa00, 2, 8);
        light.position.copy(flash.position);
        this.scene.add(light);

        setTimeout(() => {
            this.scene.remove(flash);
            this.scene.remove(light);
            flashGeo.dispose();
            flashMat.dispose();
        }, 60);
    }

    createRemotePlayer(data) {
        const group = new THREE.Group();

        // Body
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27, roughness: 0.8 });
        const torso = new THREE.Mesh(
            new THREE.BoxGeometry(0.6, 1.0, 0.4),
            bodyMat
        );
        torso.position.y = 1.2;
        torso.castShadow = true;
        group.add(torso);

        // Vest overlay
        const vest = new THREE.Mesh(
            new THREE.BoxGeometry(0.65, 0.6, 0.45),
            new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.7 })
        );
        vest.position.y = 1.3;
        group.add(vest);

        // Head (helmet)
        const helmet = new THREE.Mesh(
            new THREE.SphereGeometry(0.25, 8, 8),
            new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.6 })
        );
        helmet.position.y = 2.0;
        helmet.scale.set(1, 0.85, 1);
        helmet.castShadow = true;
        group.add(helmet);

        // Visor glow
        const visor = new THREE.Mesh(
            new THREE.BoxGeometry(0.35, 0.08, 0.28),
            new THREE.MeshBasicMaterial({ color: 0x00ffaa })
        );
        visor.position.set(0, 1.95, 0.15);
        group.add(visor);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.2, 0.7, 0.2);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e });
        const leftLeg = new THREE.Mesh(legGeo, legMat);
        leftLeg.position.set(-0.15, 0.35, 0);
        leftLeg.castShadow = true;
        const rightLeg = new THREE.Mesh(legGeo, legMat);
        rightLeg.position.set(0.15, 0.35, 0);
        rightLeg.castShadow = true;
        group.add(leftLeg, rightLeg);

        // Arms
        const armGeo = new THREE.BoxGeometry(0.15, 0.6, 0.15);
        const leftArm = new THREE.Mesh(armGeo, bodyMat);
        leftArm.position.set(-0.4, 1.2, 0.1);
        leftArm.rotation.x = -0.5;
        const rightArm = new THREE.Mesh(armGeo, bodyMat);
        rightArm.position.set(0.4, 1.2, 0.1);
        rightArm.rotation.x = -0.5;
        group.add(leftArm, rightArm);

        // Gun
        const gun = new THREE.Mesh(
            new THREE.BoxGeometry(0.08, 0.08, 0.6),
            new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 })
        );
        gun.position.set(0.3, 1.1, 0.4);
        group.add(gun);

        // Name tag (using a sprite)
        const nameSprite = this.createNameSprite(data.name);
        nameSprite.position.y = 2.6;
        group.add(nameSprite);

        // Health bar
        const healthBarBg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x333333 })
        );
        healthBarBg.position.y = 2.4;
        group.add(healthBarBg);

        const healthBarFg = new THREE.Mesh(
            new THREE.PlaneGeometry(0.8, 0.08),
            new THREE.MeshBasicMaterial({ color: 0x2ed573 })
        );
        healthBarFg.position.y = 2.4;
        healthBarFg.position.z = 0.001;
        group.add(healthBarFg);

        group.position.set(data.x, data.y, data.z);
        this.scene.add(group);

        return {
            group,
            nameSprite,
            healthBarFg,
            leftLeg,
            rightLeg,
            targetPos: new THREE.Vector3(data.x, data.y, data.z),
            targetRotY: data.ry || 0,
            data,
            lastUpdate: performance.now()
        };
    }

    createNameSprite(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.roundRect(4, 4, 248, 56, 10);
        ctx.fill();

        // Text
        ctx.fillStyle = '#f1c40f';
        ctx.font = 'bold 28px Orbitron, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name.substring(0, 12), 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(1.5, 0.4, 1);
        return sprite;
    }

    // Called every frame to interpolate remote players
    update(delta, camera) {
        const now = performance.now();

        for (const [id, remote] of this.remotePlayers) {
            // Smooth interpolation toward target position
            remote.group.position.lerp(remote.targetPos, 0.15);

            // Smooth rotation
            const currentY = remote.group.rotation.y;
            let targetY = remote.targetRotY;
            // Handle angle wrapping
            let diff = targetY - currentY;
            if (diff > Math.PI) diff -= Math.PI * 2;
            if (diff < -Math.PI) diff += Math.PI * 2;
            remote.group.rotation.y += diff * 0.15;

            // Animate legs based on movement
            const speed = remote.targetPos.distanceTo(remote.group.position);
            if (speed > 0.01) {
                const time = now * 0.006;
                remote.leftLeg.rotation.x = Math.sin(time) * 0.6;
                remote.rightLeg.rotation.x = -Math.sin(time) * 0.6;
            } else {
                remote.leftLeg.rotation.x *= 0.9;
                remote.rightLeg.rotation.x *= 0.9;
            }

            // Update health bar
            if (remote.data.health !== undefined) {
                const hpRatio = Math.max(0, remote.data.health / 100);
                remote.healthBarFg.scale.x = hpRatio;
                remote.healthBarFg.position.x = -(0.4 * (1 - hpRatio));
                if (hpRatio < 0.3) {
                    remote.healthBarFg.material.color.setHex(0xff4757);
                } else if (hpRatio < 0.6) {
                    remote.healthBarFg.material.color.setHex(0xffa502);
                } else {
                    remote.healthBarFg.material.color.setHex(0x2ed573);
                }
            }

            // Face name tag towards camera (billboard)
            if (remote.nameSprite && camera) {
                remote.nameSprite.lookAt(camera.position);
            }
        }
    }

    destroy() {
        for (const [id, remote] of this.remotePlayers) {
            this.scene.remove(remote.group);
        }
        this.remotePlayers.clear();
        this.isActive = false;
    }
}
