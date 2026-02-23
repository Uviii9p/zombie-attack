import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Zombie {
    constructor(scene) {
        this.scene = scene;
        this.health = 75; // 3 bullets at 25 damage each
        this.maxHealth = 75;
        this.speed = 0.04 + Math.random() * 0.02;
        this.damage = 10;
        this.attackRange = 2.2;
        this.lastAttack = 0;
        this.attackInterval = 1.6;
        this.isDead = false;
        this.dropProcessed = false;
        this.deathPosition = new THREE.Vector3();

        this.mesh = new THREE.Group();
        // Randomize Body Size
        const heightMultiplier = 0.8 + Math.random() * 0.5; // 0.8 to 1.3
        const widthMultiplier = 0.8 + Math.random() * 0.6; // 0.8 to 1.4

        // Randomize Skin/Clothing Color
        const hue = Math.random();
        let colorHex;
        if (hue < 0.3) colorHex = 0x3d4b36; // Classic Green
        else if (hue < 0.6) colorHex = 0x2d3047; // Dark Blue/Grey
        else if (hue < 0.85) colorHex = 0x5a4a42; // Muddy Brown
        else colorHex = 0x5c2b29; // Blood Red/Dark

        this.originalColor = colorHex;
        this.bodyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.9 });

        // Torso
        const torsoGeo = new THREE.BoxGeometry(0.6 * widthMultiplier, 1.2 * heightMultiplier, 0.4 * widthMultiplier);
        const torso = new THREE.Mesh(torsoGeo, this.bodyMat);
        torso.position.y = (1.2 * heightMultiplier) / 2 + 0.6;
        torso.castShadow = true;
        this.mesh.add(torso);

        // Legs (translate geometry to pivot from top/hips)
        const legGeo = new THREE.BoxGeometry(0.25 * widthMultiplier, 0.8 * heightMultiplier, 0.25 * widthMultiplier);
        legGeo.translate(0, - (0.4 * heightMultiplier), 0);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.9 }); // Dark pants

        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-(0.15 * widthMultiplier), 0.8 * heightMultiplier, 0);
        this.leftLeg.castShadow = true;

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set((0.15 * widthMultiplier), 0.8 * heightMultiplier, 0);
        this.rightLeg.castShadow = true;

        this.mesh.add(this.leftLeg, this.rightLeg);

        // Head
        const headSize = 0.4 + Math.random() * 0.2;
        const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), new THREE.MeshStandardMaterial({ color: 0x2c3a25 }));
        head.position.y = (1.2 * heightMultiplier) + 0.6 + (headSize / 2);
        head.castShadow = true;
        this.mesh.add(head);

        // Glowing Red/Yellow Eyes
        const eyeColor = Math.random() > 0.5 ? 0xff0000 : 0xffaa00;
        const eyeGeo = new THREE.SphereGeometry(headSize * 0.1, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        const lEye = new THREE.Mesh(eyeGeo, eyeMat); lEye.position.set(-headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat); rEye.position.set(headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        this.mesh.add(lEye, rEye);

        // Arms (outstretched)
        const armLength = 1.1 * heightMultiplier;
        const armGeo = new THREE.BoxGeometry(0.2 * widthMultiplier, armLength, 0.2 * widthMultiplier);
        const skinMat = new THREE.MeshStandardMaterial({ color: 0x556b4f }); // Pale greenish-grey skin
        this.skinMat = skinMat;

        const lArm = new THREE.Mesh(armGeo, this.bodyMat);
        lArm.position.set(-(0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        lArm.rotation.x = -Math.PI / 1.8;
        lArm.castShadow = true;

        const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.skinMat);
        lHand.position.y = -armLength / 2 - 0.1;
        lArm.add(lHand);

        const rArm = new THREE.Mesh(armGeo, this.bodyMat);
        rArm.position.set((0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        rArm.rotation.x = -Math.PI / 1.8;
        rArm.castShadow = true;

        const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skinMat);
        rHand.position.y = -armLength / 2 - 0.1;
        rArm.add(rHand);

        this.mesh.add(lArm, rArm);
        this.scene.add(this.mesh);
    }

    spawn(x, z, wave = 1) {
        this.mesh.position.set(x, 0, z);
        this.mesh.visible = true;
        this.mesh.rotation.x = 0;
        this.mesh.rotation.z = 0;
        this.mesh.rotation.y = Math.random() * Math.PI * 2;
        this.flingVelocity = null;
        this.deathAnimationTime = undefined;

        // Apply Special Zombie Types based on wave
        const typeRand = Math.random();
        if (wave >= 8 && typeRand < 0.15) {
            // GIANT: Massive HP, very slow, huge size, high damage
            this.maxHealth = 1000 + (wave * 50);
            this.speed = 0.015;
            this.damage = 60;
            this.mesh.scale.set(3.5, 3.5, 3.5);
            this.bodyMat.color.setHex(0x2c0e0e); // Dark bloody brown
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 5 && typeRand < 0.35) {
            // RUNNER: Fast, squishy, red
            this.maxHealth = 40 + (wave * 2);
            this.speed = 0.09 + Math.random() * 0.03;
            this.damage = 5;
            this.mesh.scale.set(0.85, 0.85, 0.85);
            this.bodyMat.color.setHex(0x8b0000); // Crimson
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 6 && typeRand > 0.85) {
            // PHANTOM: Translucent, fast, low damage
            this.maxHealth = 60 + (wave * 3);
            this.speed = 0.07 + Math.random() * 0.04;
            this.damage = 8;
            this.mesh.scale.set(1.1, 1.1, 1.1);
            this.bodyMat.color.setHex(0x88ffff); // Cyan ghost
            this.isPhantom = true;
            this.bodyMat.transparent = true;
            this.bodyMat.opacity = 0.4;
        } else if (wave >= 4 && typeRand < 0.5) {
            // TANK: Huge, slow, high damage, massive HP
            this.maxHealth = 250 + (wave * 20);
            this.speed = 0.02 + Math.random() * 0.01;
            this.damage = 35;
            this.mesh.scale.set(1.6, 1.6, 1.6);
            this.bodyMat.color.setHex(0x1a1a1a); // Charcoal black
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else {
            // NORMAL
            this.maxHealth = 75 + (wave * 5); // scales slowly
            this.speed = 0.04 + Math.random() * 0.02 + (wave * 0.002);
            this.damage = 10 + Math.floor(wave / 2);
            this.mesh.scale.set(1, 1, 1);
            this.bodyMat.color.setHex(this.originalColor);
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        }

        this.health = this.maxHealth;
        this.isDead = false;
        this.dropProcessed = false;
    }

    takeDamage(amount) {
        if (this.isDead) return false;
        this.health -= amount;
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    showHitEffect() {
        if (this.isDead) return;
        // Flash effect
        this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x330000); });
        setTimeout(() => { if (this.mesh) this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x000000); }); }, 100);
        audioSystem.playZombieHit();
    }

    update(delta, player, house, fence, onAttack) {
        if (this.isDead) {
            if (this.flingVelocity) {
                // Physics flying animation for roadkill
                this.mesh.position.add(this.flingVelocity);
                this.flingVelocity.y -= 0.015; // gravity
                this.flingVelocity.multiplyScalar(0.95);
                this.mesh.rotation.x += 0.2;
                this.mesh.rotation.y += 0.1;
                if (this.mesh.position.y < 0) {
                    this.mesh.position.y = 0;
                    this.flingVelocity = null;
                }
            } else if (this.deathAnimationTime !== undefined && this.deathAnimationTime < 1.0) {
                // Smooth collapsing death animation
                this.deathAnimationTime += delta;
                const progress = Math.min(this.deathAnimationTime / 0.6, 1.0); // 0.6s to hit ground

                // Tilt the whole zombie sideways and forward to "crumple"
                this.mesh.rotation.z = this.initialDeathRotZ + (Math.PI / 2.5) * progress;
                this.mesh.rotation.x = this.initialDeathRotX - 0.3 * progress;

                // Sink the whole mesh down to ground level
                this.mesh.position.y = this.deathStartY * (1 - progress);

                // Stop leg animations
                if (this.leftLeg) this.leftLeg.rotation.x = 0;
                if (this.rightLeg) this.rightLeg.rotation.x = 0;
            }
            return;
        }

        const pos = this.mesh.position;
        const distToPlayer = pos.distanceTo(player.position);
        const distToHouse = new THREE.Vector2(pos.x, pos.z).length(); // Distance from center (0,0)

        // Target Logic
        let targetType = 'house';
        let stopDist = 5.2; // House buffer

        if (fence.health > 0 && distToHouse < 15) {
            targetType = 'fence';
            stopDist = 14.0; // Fence buffer (rad 13 + small buffer)
        } else if (distToPlayer < 25) {
            targetType = 'player';
            stopDist = 1.8; // Player buffer
        }

        const targetPos = targetType === 'player' ? player.position.clone() : new THREE.Vector3(0, 0, 0);
        const distToTarget = targetType === 'player' ? distToPlayer : distToHouse;

        if (distToTarget > stopDist) {
            // Movement logic
            const dir = new THREE.Vector3().subVectors(targetPos, pos).normalize();
            dir.y = 0; // Keep movement on surface

            // Frame-rate independent speed
            const moveAmt = this.speed * delta * 60;
            pos.add(dir.multiplyScalar(moveAmt));

            this.mesh.lookAt(targetPos.x, 0, targetPos.z);

            // Shambling walking animation
            const time = Date.now() * 0.005;
            this.mesh.rotation.z = Math.sin(time * 1.5) * 0.05; // slight swaying

            // Random groans while shambling
            if (Math.random() < 0.005) audioSystem.playZombieGroan();

            // Uncoordinated zombie leg dragging
            const legSwing = Math.sin(time * 2.5) * 0.6;
            if (this.leftLeg && this.rightLeg) {
                this.leftLeg.rotation.x = -legSwing;
                this.rightLeg.rotation.x = legSwing;
            }
        } else {
            // Attack logic
            const now = performance.now() / 1000;
            if (now - this.lastAttack > this.attackInterval) {
                onAttack(targetType, this.damage);
                this.lastAttack = now;

                // Pulsing red effect when attacking
                this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x550000); });
                setTimeout(() => { if (this.mesh) this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x000000); }); }, 300);
            }

            // Subtle rotation even while attacking
            this.mesh.lookAt(targetPos.x, 0, targetPos.z);
            this.mesh.position.y = 0; // Flat on ground during attack
        }
    }

    die() {
        if (this.isDead) return;
        this.isDead = true;
        audioSystem.playZombieDeath();
        this.deathPosition.copy(this.mesh.position);
        if (!this.flingVelocity) {
            this.deathAnimationTime = 0;
            this.initialDeathRotX = this.mesh.rotation.x;
            this.initialDeathRotZ = this.mesh.rotation.z;
            this.deathStartY = this.mesh.position.y || 0;
        }
        setTimeout(() => { if (this.mesh) { this.mesh.visible = false; this.mesh.position.set(0, -100, 0); } }, 3000);
    }

    // Static variable equivalent for performance
    static bloodGeo = new THREE.BoxGeometry(0.2, 0.2, 0.2);
    static bloodMat = new THREE.MeshBasicMaterial({ color: 0x880000 });

    takeRoadkill(velocity, bloodParticlesArray) {
        if (this.isDead) return false;
        this.isDead = true;
        this.flingVelocity = velocity.clone().multiplyScalar(0.5);
        this.flingVelocity.y = 0.2; // Pop up slightly

        // Blood Splatter - pushing to an array to be updated in the main loop
        if (bloodParticlesArray) {
            for (let i = 0; i < 5; i++) {
                const b = new THREE.Mesh(Zombie.bloodGeo, Zombie.bloodMat);
                b.position.copy(this.mesh.position);
                this.scene.add(b);
                const bv = new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.2 + Math.random() * 0.2, (Math.random() - 0.5) * 0.2);
                bloodParticlesArray.push({ mesh: b, velocity: bv, life: 1.0 });
            }
        }
        return true;
    }
}

export class ZombieManager {
    constructor(scene) {
        this.scene = scene;
        this.zombies = []; this.loots = []; this.maxZombies = 50;
        this.spawnTimer = 0; this.spawnInterval = 4.0;
        this.lootGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.1, 12);
        this.boxGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        this.bloodParticles = [];
        this.lootMats = {
            'coins': new THREE.MeshStandardMaterial({ color: 0xffd700, emissive: 0xffd700, emissiveIntensity: 0.5 }),
            'weapons': new THREE.MeshStandardMaterial({ color: 0x3498db, emissive: 0x3498db, emissiveIntensity: 0.5 }),
            'sniper': new THREE.MeshStandardMaterial({ color: 0xe74c3c, emissive: 0xe74c3c, emissiveIntensity: 0.5 })
        };

        // Wave System
        this.currentWave = 1;
        this.zombiesToSpawn = 10;
        this.waveIntermission = false;
        this.intermissionTimer = 0;
    }

    update(delta, player, house, fence, onAttack, onKill, onLoot) {
        if (!this.firstWaveAnnounced) {
            this.firstWaveAnnounced = true;
            window.dispatchEvent(new CustomEvent('wave-start', { detail: this.currentWave }));
        }

        if (this.waveIntermission) {
            this.intermissionTimer -= delta;
            if (this.intermissionTimer <= 0) {
                this.waveIntermission = false;
                this.currentWave++;
                this.zombiesToSpawn = Math.floor(10 * Math.pow(1.2, this.currentWave - 1));
                window.dispatchEvent(new CustomEvent('wave-start', { detail: this.currentWave }));
            }
        } else {
            this.spawnTimer += delta;
            if (this.spawnTimer > this.spawnInterval && this.zombiesToSpawn > 0 && this.activeCount() < this.maxZombies) {
                this.spawnZombie(this.currentWave);
                this.zombiesToSpawn--;
                this.spawnTimer = 0;
                this.spawnInterval = Math.max(0.5, 4.0 - (this.currentWave * 0.15));
            }

            if (this.zombiesToSpawn === 0 && this.activeCount() === 0) {
                this.waveIntermission = true;
                this.intermissionTimer = 10.0;
                window.dispatchEvent(new CustomEvent('wave-cleared', { detail: this.currentWave }));
            }
        }

        this.zombies.forEach(z => {
            z.update(delta, player, house, fence, onAttack);
            if (z.isDead && !z.dropProcessed && !z.mesh.visible) {
                this.spawnLoot(z.deathPosition.x, z.deathPosition.z);
                z.dropProcessed = true;
            }
        });

        for (let i = this.loots.length - 1; i >= 0; i--) {
            const l = this.loots[i]; l.mesh.rotation.y += 0.05;
            l.mesh.position.y = 0.5 + Math.sin(Date.now() * 0.005) * 0.2;
            if (l.mesh.position.distanceTo(player.position) < 2.5) {
                this.scene.remove(l.mesh);
                onLoot(l.type, l.amount);
                this.loots.splice(i, 1);
                audioSystem.playCoin();
            }
        }

        // Handle blood particles without setInterval
        for (let i = this.bloodParticles.length - 1; i >= 0; i--) {
            const p = this.bloodParticles[i];
            p.mesh.position.add(p.velocity);
            p.velocity.y -= 0.01;
            p.life -= delta;
            if (p.mesh.position.y < 0 || p.life <= 0) {
                this.scene.remove(p.mesh);
                this.bloodParticles.splice(i, 1);
            }
        }
    }

    spawnZombie(wave = 1) {
        let z = this.zombies.find(z => z.isDead && !z.mesh.visible);
        if (!z) { if (this.zombies.length < this.maxZombies) { z = new Zombie(this.scene); this.zombies.push(z); } else return; }

        // Ensure zombies spawn at least 30 units away, up to 80 units
        const a = Math.random() * Math.PI * 2;
        const r = 35 + Math.random() * 45;
        z.spawn(Math.cos(a) * r, Math.sin(a) * r, wave);
    }

    spawnLoot(x, z) {
        const rand = Math.random();
        let type, amount, mat, geo;
        if (rand < 0.6) { type = 'coins'; amount = 100; mat = this.lootMats['coins']; geo = this.lootGeo; }
        else if (rand < 0.9) {
            const weps = ['AK47', 'Sniper', 'RPG']; type = weps[Math.floor(Math.random() * 3)];
            amount = type === 'AK47' ? 30 : (type === 'Sniper' ? 5 : 1);
            mat = this.lootMats['weapons']; geo = this.boxGeo;
        } else { type = 'Sniper'; amount = 1; mat = this.lootMats['sniper']; geo = new THREE.TorusGeometry(0.3, 0.1, 8, 16); }

        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.set(x, 0.5, z); this.scene.add(mesh);
        this.loots.push({ mesh, type, amount });
    }

    activeCount() { return this.zombies.filter(z => !z.isDead).length; }

    forceClearWave(wave) {
        if (this.currentWave !== wave) return;
        if (this.waveIntermission) return;

        console.log(`[WaveSync] Force Clearing Wave ${wave}`);
        this.zombiesToSpawn = 0;
        // Kill all active zombies instantly for sync
        this.zombies.forEach(z => {
            if (!z.isDead) z.die();
        });

        this.waveIntermission = true;
        this.intermissionTimer = 10.0;
        window.dispatchEvent(new CustomEvent('wave-cleared', { detail: wave }));
    }

    forceStartWave(wave) {
        if (this.currentWave === wave && !this.waveIntermission) return;

        console.log(`[WaveSync] Force Starting Wave ${wave}`);
        this.currentWave = wave;
        this.waveIntermission = false;
        this.zombiesToSpawn = Math.floor(10 * Math.pow(1.2, this.currentWave - 1));
        window.dispatchEvent(new CustomEvent('wave-start', { detail: wave }));
    }

    hitZombie(z, dmg, onKill) {
        if (z.takeDamage(dmg)) {
            if (onKill) onKill();
        } else {
            z.showHitEffect();
        }
    }
}
