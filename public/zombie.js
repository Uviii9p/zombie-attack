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
        this.isRising = false;
        this.riseTime = 0;
        this.dropProcessed = false;
        this.deathPosition = new THREE.Vector3();
        this.type = 'normal';
        this.staggerTime = 0;
        this.knockback = new THREE.Vector3();
        this.flankDir = Math.random() > 0.5 ? 1 : -1;
        this.pathSeed = Math.random() * Math.PI * 2;
        this.enraged = false;
        this.targetGroundY = 0;
        this.modelLiftOffset = 0;

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
        head.userData.hitZone = 'head';
        head.name = 'zombieHead';
        this.mesh.add(head);

        // Glowing Red/Yellow Eyes
        const eyeColor = Math.random() > 0.5 ? 0xff0000 : 0xffaa00;
        const eyeGeo = new THREE.SphereGeometry(headSize * 0.1, 8, 8);
        const eyeMat = new THREE.MeshBasicMaterial({ color: eyeColor });
        this.eyeMat = eyeMat;
        const lEye = new THREE.Mesh(eyeGeo, eyeMat); lEye.position.set(-headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat); rEye.position.set(headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        this.mesh.add(lEye, rEye);

        // Arms (outstretched)
        const armLength = 1.1 * heightMultiplier;
        const armGeo = new THREE.BoxGeometry(0.2 * widthMultiplier, armLength, 0.2 * widthMultiplier);
        const skinMat = new THREE.MeshStandardMaterial({ color: 0x556b4f }); // Pale greenish-grey skin
        this.skinMat = skinMat;

        this.lArm = new THREE.Mesh(armGeo, this.bodyMat);
        this.lArm.position.set(-(0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        this.lArm.rotation.x = -Math.PI / 1.8;
        this.lArm.castShadow = true;

        const lHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.skinMat);
        lHand.position.y = -armLength / 2 - 0.1;
        this.lArm.add(lHand);

        this.rArm = new THREE.Mesh(armGeo, this.bodyMat);
        this.rArm.position.set((0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        this.rArm.rotation.x = -Math.PI / 1.8;
        this.rArm.castShadow = true;

        const rHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), skinMat);
        rHand.position.y = -armLength / 2 - 0.1;
        this.rHand = rHand;
        this.rArm.add(rHand);
        this.mesh.add(this.lArm, this.rArm); // Arms added here

        // Fingers / Claws
        const fingerGeo = new THREE.BoxGeometry(0.04, 0.15, 0.04);
        const fingerMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        for (let i = 0; i < 3; i++) {
            const f1 = new THREE.Mesh(fingerGeo, fingerMat);
            f1.position.set((i - 1) * 0.06, -0.15, 0.08);
            lHand.add(f1);
            const f2 = new THREE.Mesh(fingerGeo, fingerMat);
            f2.position.set((i - 1) * 0.06, -0.15, 0.08);
            rHand.add(f2);
        }

        // Add "Torn Clothes" details
        for (let i = 0; i < 6; i++) {
            const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 0.22), this.bodyMat);
            const side = Math.random() > 0.5 ? 0.21 * widthMultiplier : -0.21 * widthMultiplier;
            tear.position.set((Math.random() - 0.5) * 0.6 * widthMultiplier, 1.2 * heightMultiplier * Math.random() + 0.6, side);
            tear.rotation.z = Math.random() * Math.PI;
            tear.rotation.y = side > 0 ? 0 : Math.PI;
            this.mesh.add(tear);
        }

        this.mesh.add(this.lArm, this.rArm);
        this.scene.add(this.mesh);

        // Armor Mesh (for armored type - hidden by default)
        const armorMat = new THREE.MeshStandardMaterial({ color: 0x444444, metalness: 0.8, roughness: 0.2 });
        this.helmet = new THREE.Mesh(new THREE.BoxGeometry(headSize * 1.1, headSize * 0.5, headSize * 1.1), armorMat);
        this.helmet.position.copy(head.position);
        this.helmet.position.y += headSize * 0.3;
        this.helmet.visible = false;
        this.mesh.add(this.helmet);

        // Raycaster for ground clamping
        this.raycaster = new THREE.Raycaster();
        this.down = new THREE.Vector3(0, -1, 0);
    }

    spawn(x, z, wave = 1, groundMesh = null) {
        this.groundMesh = groundMesh; // Store groundMesh
        const spawnPosition = new THREE.Vector3(x, 0, z);
        if (groundMesh) {
            spawnPosition.y = 100;
            Zombie.spawnRaycaster.set(spawnPosition, Zombie.downVector);
            const intersects = Zombie.spawnRaycaster.intersectObject(groundMesh, true);
            if (intersects.length > 0) {
                spawnPosition.y = intersects[0].point.y;
            }
        }

        this.mesh.position.copy(spawnPosition);
        this.mesh.visible = true;
        this.isRising = false;
        this.riseTime = 0;
        this.mesh.rotation.x = 0;
        this.mesh.rotation.z = 0;
        this.mesh.rotation.y = Math.random() * Math.PI * 2;
        this.flingVelocity = null;
        this.deathAnimationTime = undefined;
        this.staggerTime = 0;
        this.knockback.set(0, 0, 0);
        this.enraged = false;
        this.attackRange = 2.2;

        // Apply Special Zombie Types based on wave
        const typeRand = Math.random();
        if (wave >= 8 && typeRand < 0.11) {
            // GIANT: Massive HP, very slow, huge size, high damage
            this.type = 'giant';
            this.maxHealth = 1000 + (wave * 50);
            this.speed = 0.015;
            this.damage = 60;
            this.mesh.scale.set(3.5, 3.5, 3.5);
            this.bodyMat.color.setHex(0x2c0e0e); // Dark bloody brown
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 5 && typeRand < 0.23) {
            // RUNNER: Fast, squishy, red
            this.type = 'runner';
            this.maxHealth = 40 + (wave * 2);
            this.speed = 0.09 + Math.random() * 0.03;
            this.damage = 5;
            this.mesh.scale.set(0.85, 0.85, 0.85);
            this.bodyMat.color.setHex(0x8b0000); // Crimson
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 6 && typeRand > 0.9) {
            // PHANTOM: Translucent, fast, low damage
            this.type = 'phantom';
            this.maxHealth = 60 + (wave * 3);
            this.speed = 0.07 + Math.random() * 0.04;
            this.damage = 8;
            this.mesh.scale.set(1.1, 1.1, 1.1);
            this.bodyMat.color.setHex(0x88ffff); // Cyan ghost
            this.isPhantom = true;
            this.bodyMat.transparent = true;
            this.bodyMat.opacity = 0.4;
        } else if (wave >= 4 && typeRand < 0.35) {
            // TANK: Huge, slow, high damage, massive HP
            this.type = 'tank';
            this.maxHealth = 250 + (wave * 20);
            this.speed = 0.02 + Math.random() * 0.01;
            this.damage = 35;
            this.mesh.scale.set(1.6, 1.6, 1.6);
            this.bodyMat.color.setHex(0x1a1a1a); // Charcoal black
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 4 && typeRand < 0.55) {
            // TOXIC: poison attacker
            this.type = 'toxic';
            this.maxHealth = 95 + (wave * 6);
            this.speed = 0.05 + Math.random() * 0.02;
            this.damage = 12 + Math.floor(wave * 0.8);
            this.mesh.scale.set(1.0, 1.0, 1.0);
            this.bodyMat.color.setHex(0x4fbf4f);
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
        } else if (wave >= 3 && typeRand < 0.72) {
            // CRAWLER: low, harder to hit
            this.type = 'crawler';
            this.maxHealth = 60 + (wave * 4);
            this.speed = 0.06 + Math.random() * 0.02;
            this.damage = 9 + Math.floor(wave * 0.6);
            this.mesh.scale.set(1.1, 0.5, 1.1);
            this.bodyMat.color.setHex(0x5e5148);
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
            this.attackRange = 1.7;
        } else if (wave >= 5 && typeRand < 0.82) {
            // ARMORED: reduced headshot damage
            this.type = 'armored';
            this.maxHealth = 180 + (wave * 10);
            this.speed = 0.032 + Math.random() * 0.01;
            this.damage = 18 + Math.floor(wave * 0.8);
            this.mesh.scale.set(1.2, 1.2, 1.2);
            this.bodyMat.color.setHex(0x6b7078);
            this.isPhantom = false;
            this.bodyMat.transparent = false;
            this.bodyMat.opacity = 1.0;
            this.helmet.visible = true; // Show helmet for armored
        } else {
            // NORMAL
            this.type = 'normal';
            this.maxHealth = 75 + (wave * 5); // scales slowly
            this.speed = 0.04 + Math.random() * 0.02 + (wave * 0.002);
            this.damage = 10 + Math.floor(wave / 2);
            this.mesh.scale.set(1, 1, 1);
            this.bodyMat.color.setHex(this.originalColor);
            this.isPhantom = false;
            this.bodyMat.transparent = false;
        }

        this.health = this.maxHealth;
        this.isDead = false;
        this.dropProcessed = false;
        this.modelLiftOffset = 0;
        this.targetGroundY = spawnPosition.y;

        const box = new THREE.Box3().setFromObject(this.mesh);
        if (isFinite(box.min.y) && isFinite(box.max.y)) {
            const lift = Math.max(0, spawnPosition.y - box.min.y);
            this.modelLiftOffset = lift;
            this.mesh.position.y += lift;
            this.targetGroundY = spawnPosition.y + lift;
        }

        if (this.weaponMesh) {
            this.rHand.remove(this.weaponMesh);
            this.weaponMesh = null;
        }

        this.weapon = null;
        if (wave >= 3) {
            const rand = Math.random();
            if (wave >= 5 && rand < 0.1) this.weapon = 'grenade';
            else if (wave >= 4 && rand < 0.2) this.weapon = 'gun';
            else if (rand < 0.25) this.weapon = 'pistol';
        }

        if (this.weapon === 'pistol' || this.weapon === 'gun') {
            const isPistol = this.weapon === 'pistol';
            const wLen = isPistol ? 0.3 : 0.6;
            this.weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, wLen), new THREE.MeshStandardMaterial({ color: isPistol ? 0x222222 : 0x111111 }));
            this.weaponMesh.position.set(0, -0.15, wLen / 2 - 0.1);
            if (this.rHand) this.rHand.add(this.weaponMesh);
        } else if (this.weapon === 'grenade') {
            this.weaponMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0x334433 }));
            this.weaponMesh.position.set(0, -0.2, 0.1);
            if (this.rHand) this.rHand.add(this.weaponMesh);
        }
    }

    takeDamage(amount, hitInfo = null) {
        if (this.isDead) return false;
        let applied = amount;
        if (this.type === 'armored' && hitInfo?.isHeadshot) applied *= 0.45;
        if (this.type === 'armored' && !hitInfo?.isHeadshot) applied *= 0.8;
        if (this.type === 'tank') applied *= 0.85;

        this.staggerTime = Math.min(0.25, 0.08 + applied / 450);
        if (hitInfo?.knockback) {
            this.knockback.copy(hitInfo.knockback).multiplyScalar(Math.min(0.22, applied / 900));
            this.knockback.y = 0;
        }

        this.health -= applied;
        if (this.health <= 0) {
            this.die();
            return true;
        }
        return false;
    }

    showHitEffect() {
        if (this.isDead) return;
        // Flash effect
        this.mesh.traverse(o => { if (o.material) { o.material.emissive?.set(0x990000); o.material.emissiveIntensity = 1.5; } });
        setTimeout(() => { if (this.mesh) this.mesh.traverse(o => { if (o.material) { o.material.emissive?.set(0x000000); o.material.emissiveIntensity = 0; } }); }, 80);

        // Use Particle system if possible, otherwise meshes
        for (let i = 0; i < 8; i++) {
            const blood = new THREE.Mesh(
                new THREE.SphereGeometry(0.08, 6, 6),
                new THREE.MeshBasicMaterial({ color: 0xcc0000, transparent: true, opacity: 0.9 })
            );
            const burstDir = new THREE.Vector3((Math.random() - 0.5), Math.random() * 0.5 + 0.5, (Math.random() - 0.5)).normalize();
            blood.position.copy(this.mesh.position).add(new THREE.Vector3(0, 1.5, 0));
            this.scene.add(blood);

            const life = 600 + Math.random() * 400;
            const startTime = Date.now();
            const animateBlood = () => {
                if (Date.now() - startTime > life) {
                    this.scene.remove(blood);
                    blood.geometry.dispose();
                    blood.material.dispose();
                    return;
                }
                blood.position.addScaledVector(burstDir, 0.1);
                burstDir.y -= 0.02; // Gravity for blood
                requestAnimationFrame(animateBlood);
            };
            animateBlood();
        }
        audioSystem.playZombieHit();
    }

    update(delta, player, house, fence, onAttack, walls = []) {
        // 🔒 HARD LOCK TO GROUND (Part 1 FIX)
        if (this.mesh.position.y < this.targetGroundY) {
            this.mesh.position.y = this.targetGroundY;
        }

        // ✅ Add Safety Kill (Extra Protection)
        if (this.mesh.position.y < -5) {
            this.health = 0;
            this.die();
            return;
        }

        if (this.isRising) {
            this.riseTime += delta;
            this.mesh.position.y += 0.05 * (delta * 60);
            if (this.mesh.position.y >= this.targetGroundY) {
                this.mesh.position.y = this.targetGroundY;
                this.isRising = false;
            }
            return;
        }

        if (this.staggerTime > 0) {
            this.staggerTime -= delta;
            this.mesh.rotation.z = Math.sin(Date.now() * 0.03) * 0.12;
            this.mesh.position.add(this.knockback);
            if (this.mesh.position.y < this.targetGroundY) this.mesh.position.y = this.targetGroundY;
            this.knockback.multiplyScalar(0.85);
            return;
        }

        // Night-time Glowing Eyes Logic
        const hour = (Date.now() / 1000 % 120) / 120 * 24;
        const isNight = hour < 6 || hour > 18;
        if (this.eyeMat) {
            this.eyeMat.opacity = isNight ? 1.0 : 0.2;
        }

        if (this.isDead) {
            if (this.flingVelocity) {
                // Physics flying animation for roadkill
                this.mesh.position.add(this.flingVelocity);
                this.flingVelocity.y -= 0.015; // gravity
                this.flingVelocity.multiplyScalar(0.95);
                this.mesh.rotation.x += 0.2;
                this.mesh.rotation.y += 0.1;
                if (this.mesh.position.y < this.targetGroundY) {
                    this.mesh.position.y = this.targetGroundY;
                    this.flingVelocity = null;
                }
            } else if (this.deathAnimationTime !== undefined && this.deathAnimationTime < 3.0) {
                // Smooth collapsing death animation
                this.deathAnimationTime += delta;

                if (this.deathAnimationTime < 0.6) {
                    const progress = Math.min(this.deathAnimationTime / 0.6, 1.0); // 0.6s to crumple
                    // Tilt the whole zombie sideways and forward to "crumple"
                    this.mesh.rotation.z = this.initialDeathRotZ + (Math.PI / 2.5) * progress;
                    this.mesh.rotation.x = this.initialDeathRotX - 0.3 * progress;
                    // Lower to ground level
                    this.mesh.position.y = this.deathStartY * (1 - progress);
                } else {
                    // Sink into ground for the remaining time
                    const sinkProgress = Math.min((this.deathAnimationTime - 0.6) / 2.4, 1.0);
                    this.mesh.position.y = -2 * sinkProgress;
                }

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

        // GATE PATHING LOGIC
        // Gate is now at (0, 0, 13) on the south side (straight, not curved)
        const gatePos = new THREE.Vector3(0, 0, 13.5);
        const gateIsOpen = window.isGateOpen;

        if (fence.health > 0 && distToHouse < 18) {
            // If inside the fence area
            if (distToHouse > 12.5) {
                // Near the fence line
                if (gateIsOpen && pos.distanceTo(gatePos) < 5) {
                    // If near the open gate, path to player/house normally
                    targetType = (distToPlayer < 20) ? 'player' : 'house';
                    stopDist = (targetType === 'player') ? 1.8 : 5.2;
                } else {
                    targetType = 'fence';
                    stopDist = 13.5;
                }
            } else {
                // Safely inside
                targetType = (distToPlayer < 20) ? 'player' : 'house';
                stopDist = (targetType === 'player') ? 1.8 : 5.2;
            }
        } else if (distToPlayer < 25) {
            targetType = 'player';
            stopDist = 1.8;
        }

        if (this.isBoss && this.bossName === 'THE FINAL DOOM') {
            targetType = 'player';
            stopDist = 3.5; // Big attack range for big boss
        }

        if (this.weapon && !this.isBoss && !this.isPhantom) {
            if (targetType === 'player' || targetType === 'house') {
                stopDist = (this.weapon === 'grenade') ? 14 : 12;
            } else if (targetType === 'fence') {
                stopDist = 14.5;
            }
        }
        if (this.type === 'crawler' && targetType === 'player') {
            stopDist = 1.25;
        }

        // Smarter pathing: If targeting house but fence is in the way and gate is open, head to gate
        if (targetType === 'house' && gateIsOpen && distToHouse > 14) {
            const distToGate = pos.distanceTo(gatePos);
            if (distToGate < 20) {
                // Head toward gate instead of blindly at center
                targetType = 'gate';
                stopDist = 0.5;
            }
        }

        const actualTargetPos = (targetType === 'player') ? player.position.clone() :
            (targetType === 'gate') ? gatePos : new THREE.Vector3(0, 0, 0);

        if (targetType === 'player' && !this.isBoss) {
            actualTargetPos.add(new THREE.Vector3(
                Math.cos(this.pathSeed + Date.now() * 0.0006 * this.flankDir) * 2.2,
                0,
                Math.sin(this.pathSeed + Date.now() * 0.0006 * this.flankDir) * 2.2
            ));
        }

        const distToTarget = targetType === 'player' ? distToPlayer :
            targetType === 'gate' ? pos.distanceTo(gatePos) : distToHouse;

        if (distToTarget > stopDist) {
            // Movement logic
            const dir = new THREE.Vector3().subVectors(actualTargetPos, pos).normalize();
            dir.y = 0;
            dir.x += Math.cos(Date.now() * 0.0015 + this.pathSeed) * 0.04;
            dir.z += Math.sin(Date.now() * 0.0015 + this.pathSeed) * 0.04;
            dir.normalize();

            if (this.chargeTimer > 0) this.chargeTimer -= delta;
            const chargeMul = this.chargeTimer > 0 ? 2.4 : 1;
            const moveAmt = this.speed * chargeMul * delta * 60;
            const nextPos = pos.clone().add(dir.clone().multiplyScalar(moveAmt));

            // Basic Wall Collision
            let hit = false;
            if (walls.length > 0) {
                const zBox = new THREE.Box3().setFromCenterAndSize(
                    nextPos.clone().add(new THREE.Vector3(0, 0.8, 0)),
                    new THREE.Vector3(0.6, 1.6, 0.6)
                );
                for (let wall of walls) {
                    if (wall.userData.type === 'floor') continue;
                    const wallBox = new THREE.Box3().setFromObject(wall);
                    if (zBox.intersectsBox(wallBox)) {
                        hit = true;
                        break;
                    }
                }
            }

            if (!hit) {
                pos.copy(nextPos);
            }

            // Strict Y-axis clamping to prevent underground clipping
            if (pos.y < this.targetGroundY) {
                pos.y = this.targetGroundY;
            }
            // Shambling / Running animation
            const isRunning = this.type === 'runner' || this.enraged;
            const animSpeed = isRunning ? 0.012 : 0.005;
            const time = Date.now() * animSpeed;

            // Bobbing motion
            this.mesh.position.y += Math.sin(time * 12) * 0.02;
            this.mesh.rotation.z = Math.sin(time * 8) * 0.08;
            this.mesh.rotation.x = Math.sin(time * 6) * 0.05;

            if (Math.random() < 0.005) audioSystem.playZombieGroan();
            const legFreq = isRunning ? 4.5 : 2.5;
            const legAmp = isRunning ? 0.8 : 0.6;
            const legSwing = Math.sin(time * 20) * legAmp;
            if (this.leftLeg && this.rightLeg) {
                this.leftLeg.rotation.x = -legSwing;
                this.rightLeg.rotation.x = legSwing;
            }

            // Arm Sway 
            if (this.lArm && this.rArm) {
                this.lArm.rotation.z = Math.sin(time * 10) * 0.1;
                this.rArm.rotation.z = -Math.sin(time * 10) * 0.1;
                this.lArm.rotation.x = -Math.PI / 1.8 + Math.cos(time * 10) * 0.2;
                this.rArm.rotation.x = -Math.PI / 1.8 - Math.cos(time * 10) * 0.2;
            }
        } else {
            // Attack logic
            // If we were just targeting the "gate" position, don't attack the gate position itself
            if (targetType === 'gate') {
                // Transition to house/player
                return;
            }

            const now = performance.now() / 1000;
            if (now - this.lastAttack > this.attackInterval) {
                if (this.type === 'toxic' && targetType === 'player') {
                    onAttack('player', this.damage * 0.4);
                }
                if (this.weapon === 'grenade') {
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.damage * 4);
                    this.weapon = null;
                    if (this.weaponMesh) { this.rHand.remove(this.weaponMesh); this.weaponMesh = null; }
                } else if (this.weapon === 'gun' || this.weapon === 'pistol') {
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.weapon === 'gun' ? this.damage * 1.5 : this.damage);
                } else {
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.damage);
                }

                this.lastAttack = now;
                this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x550000); });
                setTimeout(() => { if (this.mesh) this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x000000); }); }, 300);
            }
            this.mesh.lookAt(actualTargetPos.x, this.targetGroundY, actualTargetPos.z);
            this.mesh.position.y = this.targetGroundY;
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
    static spawnRaycaster = new THREE.Raycaster();
    static downVector = new THREE.Vector3(0, -1, 0);

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
    constructor(scene, options = {}) {
        this.scene = scene;
        this.isMobile = !!options.isMobile;
        this.groundMesh = options.groundMesh || null;
        this.zombies = []; this.loots = []; this.maxZombies = this.isMobile ? 42 : 60;
        this.minSpawnDistance = this.isMobile ? 18 : 20;
        this.lastPlayerPos = new THREE.Vector3(0, 0, 0);
        this.spawnPoints = [
            new THREE.Vector3(32, 0, -40),
            new THREE.Vector3(-26, 0, 36),
            new THREE.Vector3(52, 0, 22),
            new THREE.Vector3(-45, 0, -35),
            new THREE.Vector3(15, 0, 58)
        ];
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
        this.maxWave = 10;
        this.zombiesToSpawn = 10;
        this.zombiesSpawnedThisWave = 0;
        this.waveIntermission = false;
        this.intermissionTimer = 0;

        // Boss System
        this.boss = null;
        this.bossActive = false;
        this.bossSpawnPending = false;
        this.bossSpawnDelay = 0;
        this.bossNames = [
            'Mutant Ravager', 'Decay Lord', 'Plague Titan', 'Rot Colossus',
            'Death Monger', 'Blight King', 'Gore Behemoth', 'Doom Shaman',
            'Flesh Golem', 'Undead Warlord', 'Bone Crusher', 'Shadow Hulk'
        ];

        // Scaling caps
        this.maxWaveScale = 30; // Cap scaling at wave 30
    }

    getScaledHealth(wave) {
        const w = Math.min(wave, this.maxWaveScale);
        return Math.floor(75 * (1 + w * 0.2));
    }

    getScaledDamage(wave) {
        const w = Math.min(wave, this.maxWaveScale);
        return Math.floor(10 * (1 + w * 0.15));
    }

    getScaledSpeed(wave) {
        const w = Math.min(wave, this.maxWaveScale);
        return 0.04 + (w * 0.003);
    }

    getBossHealth(wave) {
        const w = Math.min(wave, this.maxWaveScale);
        return Math.floor(500 * (1 + w * 0.35));
    }

    getBossName(wave) {
        return this.bossNames[(wave - 1) % this.bossNames.length] + ' – Wave ' + wave;
    }

    update(delta, player, house, fence, onAttack, onKill, onLoot, walls = []) {
        if (player) this.lastPlayerPos.copy(player.position);
        if (!this.firstWaveAnnounced) {
            this.firstWaveAnnounced = true;
            window.dispatchEvent(new CustomEvent('wave-start', { detail: this.currentWave }));
        }

        const isHost = !window.lobbySocket || window.isLobbyHost;

        // Wave progression + Boss Spawning logic ONLY runs on the Host
        if (isHost) {
            // Boss spawn delay
            if (this.bossSpawnPending) {
                this.bossSpawnDelay -= delta;
                if (this.bossSpawnDelay <= 0) {
                    this.bossSpawnPending = false;
                    this.spawnBoss(this.currentWave);
                }
            }

            if (this.waveIntermission && !this.bossActive) {
                this.intermissionTimer -= delta;

                // Countdown events
                const remaining = Math.ceil(this.intermissionTimer);
                if (remaining > 0 && remaining <= 5) {
                    window.dispatchEvent(new CustomEvent('wave-countdown', { detail: remaining }));
                }

                if (this.intermissionTimer <= 0) {
                    this.waveIntermission = false;
                    this.currentWave++;

                    if (this.currentWave > this.maxWave) {
                        window.dispatchEvent(new CustomEvent('game-won'));
                        return;
                    }

                    this.zombiesToSpawn = this.getWaveZombieCount(this.currentWave);
                    this.zombiesSpawnedThisWave = 0;
                    window.dispatchEvent(new CustomEvent('wave-start', { detail: this.currentWave }));
                }
            } else if (!this.waveIntermission && !this.bossActive) {
                this.spawnTimer += delta;
                const spawnBatch = Math.min(5, Math.floor(this.currentWave / 3) + 1); // Spawn more per tick at higher waves

                if (this.spawnTimer > this.spawnInterval && this.zombiesToSpawn > 0 && this.activeCount() < this.maxZombies) {
                    const count = Math.min(spawnBatch, this.zombiesToSpawn);
                    for (let i = 0; i < count; i++) {
                        this.spawnZombie(this.currentWave);
                        this.zombiesToSpawn--;
                        this.zombiesSpawnedThisWave++;
                    }
                    this.spawnTimer = 0;
                    this.spawnInterval = Math.max(0.4, 4.0 - (this.currentWave * 0.18));
                }

                // Wave cleared — trigger boss
                if (this.zombiesToSpawn === 0 && this.activeCount() === 0 && !this.bossSpawnPending) {
                    window.dispatchEvent(new CustomEvent('wave-cleared', { detail: this.currentWave }));
                    // Spawn boss after a short dramatic delay
                    this.bossSpawnPending = true;
                    this.bossSpawnDelay = 2.0;
                }
            }
        }

        // Update all zombies
        this.zombies.forEach(z => {
            z.update(delta, player, house, fence, onAttack, walls);
            if (z.isDead && !z.dropProcessed && !z.mesh.visible) {
                this.spawnLoot(z.deathPosition.x, z.deathPosition.z);
                z.dropProcessed = true;
            }
        });

        // Update boss
        if (this.boss && this.bossActive) {
            this.boss.update(delta, player, house, fence, onAttack, walls);
            if (!this.boss.enraged && this.boss.health <= this.boss.maxHealth * 0.3) {
                this.boss.enraged = true;
                this.boss.speed *= 1.45;
                this.boss.damage = Math.floor(this.boss.damage * 1.5);
                window.dispatchEvent(new CustomEvent('boss-enrage'));
            }

            // Update boss health UI
            const bossRatio = Math.max(0, this.boss.health / this.boss.maxHealth);
            window.dispatchEvent(new CustomEvent('boss-health', { detail: { ratio: bossRatio, name: this.boss.bossName } }));

            if (!this.boss.lastGroundSmash) this.boss.lastGroundSmash = 0;
            if (!this.boss.lastSummon) this.boss.lastSummon = 0;
            if (!this.boss.lastCharge) this.boss.lastCharge = 0;
            const now = performance.now() / 1000;
            if (now - this.boss.lastGroundSmash > 7 && this.boss.mesh.position.distanceTo(player.position) < 8) {
                this.boss.lastGroundSmash = now;
                onAttack('player', this.boss.damage * 1.8);
                window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.7, duration: 0.4 } }));
            }
            if (now - this.boss.lastSummon > 11) {
                this.boss.lastSummon = now;
                window.dispatchEvent(new CustomEvent('boss-summon', { detail: { count: this.boss.enraged ? 4 : 2, wave: this.currentWave } }));
            }
            if (now - this.boss.lastCharge > 9 && this.boss.mesh.position.distanceTo(player.position) > 7) {
                this.boss.lastCharge = now;
                this.boss.chargeTimer = 1.0;
                window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.35, duration: 0.25 } }));
            }

            if (this.boss.isDead && !this.boss.dropProcessed) {
                this.boss.dropProcessed = true;
                this.bossActive = false;

                // Boss defeated — massive loot
                for (let i = 0; i < 5; i++) {
                    const ox = (Math.random() - 0.5) * 3;
                    const oz = (Math.random() - 0.5) * 3;
                    this.spawnLoot(this.boss.deathPosition.x + ox, this.boss.deathPosition.z + oz);
                }

                window.dispatchEvent(new CustomEvent('boss-defeated', { detail: this.currentWave }));
                window.dispatchEvent(new CustomEvent('boss-health', { detail: { ratio: 0, name: '' } }));

                // Start intermission for next wave
                this.waveIntermission = true;
                this.intermissionTimer = 8.0;
            }
        }

        // Loot pickup
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

        // Blood particles
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

    getWaveZombieCount(wave) {
        const cap = this.isMobile ? 36 : 50;
        const base = this.isMobile ? 7 : 8;
        const scale = this.isMobile ? 2.4 : 3;
        return Math.min(cap, Math.floor(base + wave * scale));
    }

    spawnBoss(wave) {
        const bossHealth = this.getBossHealth(wave);
        const bossName = this.getBossName(wave);
        const bossScale = Math.min(5.0, 2.5 + (wave * 0.15));

        // Create or recycle a zombie as boss
        let z = new Zombie(this.scene);
        this.zombies.push(z);

        // Spawn position: far south
        const spawnPos = this.pickSpawnPosition(true);
        z.spawn(spawnPos.x, spawnPos.z, wave, this.groundMesh);

        // Override to boss stats
        z.maxHealth = wave === this.maxWave ? 50000 : bossHealth;
        z.health = wave === this.maxWave ? 50000 : bossHealth;
        z.speed = Math.max(0.02, 0.035 - wave * 0.001);
        z.damage = Math.floor(30 * (1 + wave * 0.2));
        z.attackInterval = Math.max(0.8, 1.6 - wave * 0.05);
        z.mesh.scale.set(bossScale, bossScale, bossScale);
        const bossBox = new THREE.Box3().setFromObject(z.mesh);
        if (isFinite(bossBox.min.y)) {
            const lift = Math.max(0, z.targetGroundY - bossBox.min.y);
            z.mesh.position.y += lift;
            z.targetGroundY += lift;
        }
        z.bossName = wave === this.maxWave ? 'THE FINAL DOOM' : bossName;
        z.isBoss = true;

        // Boss visual: dark red with glowing
        z.bodyMat.color.setHex(0x440000);
        z.bodyMat.emissive = new THREE.Color(0x220000);
        z.bodyMat.emissiveIntensity = 0.5;

        // BOSS VISUAL EXTRAS: Crown / Spikes
        const bossSpikeGeo = new THREE.ConeGeometry(0.12, 0.4, 6);
        const bossSpikeMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 2 });
        for (let i = 0; i < 5; i++) {
            const spike = new THREE.Mesh(bossSpikeGeo, bossSpikeMat);
            const angle = (i / 5) * Math.PI * 2;
            spike.position.set(Math.cos(angle) * 0.25, 2.3, Math.sin(angle) * 0.25);
            spike.rotation.x = 0.2;
            z.mesh.add(spike);
        }

        // Glowing Aura
        const aura = new THREE.PointLight(0xff2222, 10, 8);
        aura.position.set(0, 1.5, 0);
        z.mesh.add(aura);

        this.boss = z;
        this.bossActive = true;

        // Dispatch boss spawn event for UI
        window.dispatchEvent(new CustomEvent('boss-spawn', { detail: { name: bossName, wave: wave } }));

        // Camera shake effect
        window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 0.5, duration: 1.0 } }));
    }

    spawnZombie(wave = 1) {
        let z = this.zombies.find(z => z.isDead && !z.mesh.visible && !z.isBoss);
        if (!z) { if (this.zombies.length < this.maxZombies) { z = new Zombie(this.scene); this.zombies.push(z); } else return; }

        const spawnPos = this.pickSpawnPosition(false);
        z.spawn(spawnPos.x, spawnPos.z, wave, this.groundMesh);
        z.isBoss = false;
    }

    pickSpawnPosition(preferFar = false) {
        const playerPos = this.lastPlayerPos || new THREE.Vector3(0, 0, 0);
        const minDist = preferFar ? this.minSpawnDistance + 12 : this.minSpawnDistance;
        const minDistSq = minDist * minDist;

        const indexed = this.spawnPoints.map((p, i) => ({ p, score: p.distanceToSquared(playerPos), i }));
        indexed.sort((a, b) => preferFar ? b.score - a.score : a.i - b.i);

        for (let i = 0; i < indexed.length; i++) {
            const candidate = indexed[i].p;
            if (candidate.distanceToSquared(playerPos) >= minDistSq) return candidate.clone();
        }

        for (let attempts = 0; attempts < 18; attempts++) {
            const a = Math.random() * Math.PI * 2;
            const r = 35 + Math.random() * 45;
            const pos = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            if (pos.distanceToSquared(playerPos) >= minDistSq) return pos;
        }

        return this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)].clone();
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
        this.zombiesToSpawn = 0;
        this.zombies.forEach(z => { if (!z.isDead) z.die(); });
        if (this.boss && this.bossActive) { this.boss.die(); this.bossActive = false; }
        this.waveIntermission = true;
        this.intermissionTimer = 8.0;
        window.dispatchEvent(new CustomEvent('wave-cleared', { detail: wave }));
    }

    forceStartWave(wave) {
        if (this.currentWave === wave && !this.waveIntermission) return;
        this.currentWave = wave;
        this.waveIntermission = false;
        this.bossActive = false;
        this.bossSpawnPending = false;
        this.zombiesToSpawn = this.getWaveZombieCount(wave);
        this.zombiesSpawnedThisWave = 0;
        window.dispatchEvent(new CustomEvent('wave-start', { detail: wave }));
    }

    hitZombie(z, dmg, onKill, hitInfo = null) {
        if (z.takeDamage(dmg, hitInfo)) {
            if (onKill) onKill();
        } else {
            z.showHitEffect();
        }
    }
}

