import * as THREE from 'three';
import { audioSystem } from './audio.js';

// ======= ZOMBIE TYPES SYSTEM =======
export const ZOMBIE_TYPES = {
    NORMAL: 'normal',
    RUNNER: 'runner',
    ARMORED: 'armored',
    SHOOTER: 'shooter',
    SPITTER: 'spitter',
    TANK: 'tank',
    GIANT: 'giant',
    PHANTOM: 'phantom',
    SPRINTER: 'sprinter',
    TOXIC: 'toxic',
    CRAWLER: 'crawler'
};

// Get a random zombie type based on weighted probability
export function getRandomZombieType(wave) {
    if (wave < 2) return ZOMBIE_TYPES.NORMAL;
    const rand = Math.random();
    if (wave >= 8 && rand < 0.05) return ZOMBIE_TYPES.GIANT;
    if (wave >= 6 && rand < 0.10) return ZOMBIE_TYPES.PHANTOM;
    if (wave >= 5 && rand < 0.18) return ZOMBIE_TYPES.RUNNER;
    if (wave >= 4 && rand < 0.28) return ZOMBIE_TYPES.SHOOTER;
    if (wave >= 4 && rand < 0.38) return ZOMBIE_TYPES.SPITTER;
    if (wave >= 4 && rand < 0.50) return ZOMBIE_TYPES.TANK;
    if (wave >= 5 && rand < 0.58) return ZOMBIE_TYPES.ARMORED;
    if (wave >= 3 && rand < 0.68) return ZOMBIE_TYPES.SPRINTER;
    if (wave >= 3 && rand < 0.78) return ZOMBIE_TYPES.CRAWLER;
    if (wave >= 4 && rand < 0.85) return ZOMBIE_TYPES.TOXIC;
    return ZOMBIE_TYPES.NORMAL;
}

export class Zombie {
    constructor(scene) {
        this.scene = scene;
        this.health = 75; // 3 bullets at 25 damage each
        this.maxHealth = 75;
        this.speed = 0.05 + Math.random() * 0.035; // Faster base speed
        this.damage = 12; // Slightly more damage
        this.attackRange = 2.2;
        this.lastAttack = 0;
        this.attackInterval = 1.6;
        this.isDead = false;
        this.isRising = false;
        this.riseTime = 0;
        this.dropProcessed = false;
        this.deathPosition = new THREE.Vector3();
        this.type = ZOMBIE_TYPES.NORMAL;
        this.armor = 0; // Armor damage reduction (0 to 1)
        this.staggerTime = 0;
        this.knockback = new THREE.Vector3();
        this.flankDir = Math.random() > 0.5 ? 1 : -1;
        this.pathSeed = Math.random() * Math.PI * 2;
        this.enraged = false;
        this.targetGroundY = 0;
        this.modelLiftOffset = 0;
        this.specialCooldown = 0;
        this.shootCooldown = 0; // For shooter zombies
        this.spitCooldown = 0; // For spitter zombies
        this.isClimbing = false;
        this.isPoisoned = false; // Tracks if this zombie applies poison
        this.isBoss = false;
        this.shockwaveGroup = null;

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
        // Step 1: High-fidelity Materials (Moist/Distressed Look)
        this.bodyMat = new THREE.MeshStandardMaterial({
            color: colorHex,
            roughness: 0.75, // Slightly moist/oily
            metalness: 0.1,
            emissive: 0x000000,
            emissiveIntensity: 0
        });

        this.skinMat = new THREE.MeshStandardMaterial({
            color: 0x556b4f, // Pale greenish skin
            roughness: 0.65, // More "wet" skin look
            metalness: 0.12,
        });

        // Torso with "Deep Wounds"
        const torsoGeo = new THREE.BoxGeometry(0.6 * widthMultiplier, 1.2 * heightMultiplier, 0.4 * widthMultiplier, 2, 2, 1);
        const torso = new THREE.Mesh(torsoGeo, this.bodyMat);
        torso.position.y = (1.2 * heightMultiplier) / 2 + 0.6;
        torso.castShadow = true;
        this.mesh.add(torso);

        // Procedural "Grit": Deep Flesh Wounds
        if (Math.random() > 0.4) {
            const wound = new THREE.Mesh(
                new THREE.BoxGeometry(0.15, 0.25, 0.05),
                new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0x330000, roughness: 0.3 })
            );
            wound.position.set((Math.random() - 0.5) * 0.4, 0.2, 0.21 * widthMultiplier);
            torso.add(wound);
        }

        // Legs (Pants / Ripped Fabric)
        const legGeo = new THREE.BoxGeometry(0.25 * widthMultiplier, 0.8 * heightMultiplier, 0.25 * widthMultiplier);
        legGeo.translate(0, - (0.4 * heightMultiplier), 0);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x1f2326, roughness: 0.95 });

        this.leftLeg = new THREE.Mesh(legGeo, legMat);
        this.leftLeg.position.set(-(0.15 * widthMultiplier), 0.8 * heightMultiplier, 0);
        this.leftLeg.castShadow = true;

        this.rightLeg = new THREE.Mesh(legGeo, legMat);
        this.rightLeg.position.set((0.15 * widthMultiplier), 0.8 * heightMultiplier, 0);
        this.rightLeg.castShadow = true;
        this.mesh.add(this.leftLeg, this.rightLeg);

        // Procedural "Exposed Bone" (on limbs)
        if (Math.random() > 0.7) {
            const bone = new THREE.Mesh(
                new THREE.BoxGeometry(0.08, 0.15, 0.08),
                new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.5 })
            );
            bone.position.set(0, -0.4, 0.1);
            this.rightLeg.add(bone);
        }

        // Head (Clouded Hero Eyes & Burst Capillaries)
        const headSize = 0.4 + Math.random() * 0.2;
        const headMat = new THREE.MeshStandardMaterial({ color: 0x2c3a25, roughness: 0.8 });
        const head = new THREE.Mesh(new THREE.BoxGeometry(headSize, headSize, headSize), headMat);
        head.position.y = (1.2 * heightMultiplier) + 0.6 + (headSize / 2);
        head.castShadow = true;
        head.userData.hitZone = 'head';
        head.name = 'zombieHead';
        this.mesh.add(head);

        // Eye Logic: RED GLOWING aggressive eyes
        const eyeColor = 0xff0000; // Always red glowing for aggression
        const eyeGeo = new THREE.SphereGeometry(headSize * 0.12, 12, 12);
        const eyeMat = new THREE.MeshStandardMaterial({
            color: eyeColor,
            emissive: eyeColor,
            emissiveIntensity: 1.5,
            transparent: true,
            opacity: 0.95
        });
        this.eyeMat = eyeMat;

        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat);
        rEye.position.set(headSize * 0.3, head.position.y + headSize * 0.1, headSize * 0.51);
        this.mesh.add(lEye, rEye);

        // Fungal Growths (Stunning Horror style)
        if (Math.random() > 0.6) {
            const growthGroup = new THREE.Group();
            const growthMat = new THREE.MeshStandardMaterial({ color: 0x827d4b, emissive: 0x4a4729, roughness: 0.4 });
            for (let i = 0; i < 4; i++) {
                const pod = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6), growthMat);
                pod.position.set((Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 0);
                pod.scale.set(1, 1, 0.6);
                growthGroup.add(pod);
            }
            growthGroup.position.set(headSize * 0.4, head.position.y + headSize * 0.3, 0);
            growthGroup.rotation.z = 0.5;
            this.mesh.add(growthGroup);
        }

        // Arms
        const armLength = 1.1 * heightMultiplier;
        const armGeo = new THREE.BoxGeometry(0.2 * widthMultiplier, armLength, 0.2 * widthMultiplier);

        this.lArm = new THREE.Mesh(armGeo, this.bodyMat);
        this.lArm.position.set(-(0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        this.lArm.rotation.x = -Math.PI / 1.8;
        this.lArm.castShadow = true;

        this.lHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.skinMat);
        this.lHand.position.y = -armLength / 2 - 0.1;
        this.lArm.add(this.lHand);

        this.rArm = new THREE.Mesh(armGeo, this.bodyMat);
        this.rArm.position.set((0.4 * widthMultiplier), (1.2 * heightMultiplier) + 0.3, 0.4);
        this.rArm.rotation.x = -Math.PI / 1.8;
        this.rArm.castShadow = true;

        this.rHand = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.2, 0.2), this.skinMat);
        this.rHand.position.y = -armLength / 2 - 0.1;
        this.rArm.add(this.rHand);
        this.mesh.add(this.lArm, this.rArm);

        // Claws
        const fingerGeo = new THREE.BoxGeometry(0.03, 0.18, 0.03); // Thinner, sharper claws
        const fingerMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2 });
        for (let i = 0; i < 3; i++) {
            const f1 = new THREE.Mesh(fingerGeo, fingerMat);
            f1.position.set((i - 1) * 0.06, -0.15, 0.08);
            this.lHand.add(f1);
            const f2 = new THREE.Mesh(fingerGeo, fingerMat);
            f2.position.set((i - 1) * 0.06, -0.15, 0.08);
            this.rHand.add(f2);
        }

        // Torn/Bloody Clothes details
        for (let i = 0; i < 8; i++) {
            const bloodColor = Math.random() > 0.5 ? 0x2c0000 : 0x5c2b29;
            const bloodMat = new THREE.MeshStandardMaterial({ color: bloodColor, roughness: 0.4 });
            const tear = new THREE.Mesh(new THREE.PlaneGeometry(0.15, 0.3), bloodMat);
            const side = Math.random() > 0.5 ? 0.21 * widthMultiplier : -0.21 * widthMultiplier;
            tear.position.set((Math.random() - 0.5) * 0.6 * widthMultiplier, 1.2 * heightMultiplier * Math.random() + 0.6, side);
            tear.rotation.z = Math.random() * Math.PI;
            tear.rotation.y = side > 0 ? 0 : Math.PI;
            this.mesh.add(tear);
        }

        this.scene.add(this.mesh);

        // AAA Performance: Frustum Culling & Shadows
        this.mesh.frustumCulled = true;
        this.mesh.traverse(o => {
            if (o.isMesh) {
                o.frustumCulled = true;
                // Only cast shadows from main body parts
                o.castShadow = true;
                o.receiveShadow = false;
            }
        });

        // Hide small details by default, will show based on LOD
        if (this.lHand) this.lHand.traverse(f => { if (f !== this.lHand) f.visible = false; });
        if (this.rHand) this.rHand.traverse(f => { if (f !== this.rHand) f.visible = false; });

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
        this.velocityY = 0; // Initialize gravity velocity
        this.enraged = false;
        this.attackRange = 2.2;
        this.armor = 0;
        this.shootCooldown = 0;
        this.spitCooldown = 0;
        this.weapon = null; // Reset weapon for recycled zombies
        this.mesh.scale.set(1, 1, 1); // Reset scale for recycled zombies
        this.speed = 0.05 + Math.random() * 0.035; // Reset base speed
        this.damage = 12; // Reset base damage

        // Reset emissive (spitter glow fix)
        this.bodyMat.emissive.setHex(0x000000);
        this.bodyMat.emissiveIntensity = 0;
        this.bodyMat.color.setHex(this.originalColor);

        // Apply Special Zombie Types using the new type system
        const assignedType = getRandomZombieType(wave);
        this.type = assignedType;
        this.isPhantom = false;
        this.bodyMat.transparent = false;
        this.bodyMat.opacity = 1.0;
        this.helmet.visible = false;

        if (assignedType === ZOMBIE_TYPES.GIANT) {
            // GIANT: Massive HP, very slow, huge size, high damage
            this.maxHealth = 1000 + (wave * 50);
            this.speed = 0.025; // was 0.015
            this.damage = 60;
            this.mesh.scale.set(3.5, 3.5, 3.5);
            this.bodyMat.color.setHex(0x2c0e0e);
        } else if (assignedType === ZOMBIE_TYPES.RUNNER) {
            // RUNNER: Fast, squishy, red — extra forward lunge
            this.maxHealth = 70 + (wave * 2);
            this.speed = 0.09 + Math.random() * 0.04; // was 0.06
            this.damage = 8;
            this.mesh.scale.set(0.9, 0.9, 0.9);
            this.bodyMat.color.setHex(0x8b0000);
        } else if (assignedType === ZOMBIE_TYPES.PHANTOM) {
            // PHANTOM: Translucent, fast, low damage
            this.maxHealth = 60 + (wave * 3);
            this.speed = 0.11 + Math.random() * 0.05; // was 0.07
            this.damage = 8;
            this.mesh.scale.set(1.1, 1.1, 1.1);
            this.bodyMat.color.setHex(0x88ffff);
            this.isPhantom = true;
            this.bodyMat.transparent = true;
            this.bodyMat.opacity = 0.4;
        } else if (assignedType === ZOMBIE_TYPES.SPRINTER) {
            // SPRINTER: Extremely aggressive & fast
            this.maxHealth = 35 + (wave * 2);
            this.speed = 0.22 + Math.random() * 0.06; // was 0.16
            this.damage = 6;
            this.mesh.scale.set(0.8, 0.9, 0.8);
            this.bodyMat.color.setHex(0xb22222);
        } else if (assignedType === ZOMBIE_TYPES.TANK) {
            // TANK: Huge, slow, high damage, massive HP
            this.maxHealth = 250 + (wave * 20);
            this.speed = 0.035 + Math.random() * 0.015; // was 0.02
            this.damage = 35;
            this.mesh.scale.set(1.6, 1.6, 1.6);
            this.bodyMat.color.setHex(0x1a1a1a);
        } else if (assignedType === ZOMBIE_TYPES.TOXIC) {
            // TOXIC: poison attacker
            this.maxHealth = 95 + (wave * 6);
            this.speed = 0.08 + Math.random() * 0.03; // was 0.05
            this.damage = 12 + Math.floor(wave * 0.8);
            this.mesh.scale.set(1.0, 1.0, 1.0);
            this.bodyMat.color.setHex(0x4fbf4f);
        } else if (assignedType === ZOMBIE_TYPES.CRAWLER) {
            // CRAWLER: low, harder to hit
            this.maxHealth = 60 + (wave * 4);
            this.speed = 0.09 + Math.random() * 0.03; // was 0.06
            this.damage = 9 + Math.floor(wave * 0.6);
            this.mesh.scale.set(1.1, 0.5, 1.1);
            this.bodyMat.color.setHex(0x5e5148);
            this.attackRange = 1.7;
        } else if (assignedType === ZOMBIE_TYPES.ARMORED) {
            // ARMORED: 50% damage reduction via armor property
            this.maxHealth = 250 + (wave * 12);
            this.speed = 0.055 + Math.random() * 0.02; // was 0.035
            this.damage = 25 + Math.floor(wave * 1.5);
            this.armor = 0.5; // 50% damage reduction
            this.mesh.scale.set(1.2, 1.2, 1.2);
            this.bodyMat.color.setHex(0x555555);
            this.helmet.visible = true;
        } else if (assignedType === ZOMBIE_TYPES.SHOOTER) {
            // SHOOTER: Has a gun, shoots bullets at player
            this.maxHealth = 120 + (wave * 8);
            this.speed = 0.05 + Math.random() * 0.015; // was 0.035
            this.damage = 18 + Math.floor(wave * 1.2);
            this.shootCooldown = 2.0;
            this.mesh.scale.set(1.05, 1.05, 1.05);
            this.bodyMat.color.setHex(0x2a2a3a); // Dark blue-grey
            this.weapon = 'gun'; // Force gun weapon
        } else if (assignedType === ZOMBIE_TYPES.SPITTER) {
            // SPITTER: Spits poison at player, applies poison DOT
            this.maxHealth = 90 + (wave * 5);
            this.speed = 0.06 + Math.random() * 0.02; // was 0.04
            this.damage = 10 + Math.floor(wave * 0.6);
            this.spitCooldown = 3.0;
            this.mesh.scale.set(1.0, 1.0, 1.0);
            this.bodyMat.color.setHex(0x33aa33); // Toxic green
            this.bodyMat.emissive.setHex(0x115511);
            this.bodyMat.emissiveIntensity = 0.4;
        } else {
            // NORMAL zombie
            this.maxHealth = 75;
            this.speed = 0.07 + Math.random() * 0.02; // increased base normal speed
            this.type = ZOMBIE_TYPES.NORMAL;
        }

        // ====== WAVE DIFFICULTY SCALING ======
        // Every wave: zombies get stronger
        this.maxHealth += wave * 20;
        this.speed += wave * 0.005; // increased from 0.002 to 0.005 per wave
        this.damage += wave * 2;

        this.health = this.maxHealth;
        this.specialCooldown = 0;
        this.isBoss = false;
        this.enraged = false;
        this.isDead = false;
        this.dropProcessed = false;
        this.targetGroundY = spawnPosition.y;

        // Force Three.js to update the matrix after scale/rotation resets
        // Without this, the bound box uses the old "dead" (lying down) rotation
        this.mesh.updateMatrixWorld(true);

        const box = new THREE.Box3().setFromObject(this.mesh);
        if (isFinite(box.min.y) && isFinite(box.max.y)) {
            // Cap the lift to prevent any ridiculous offsets from glitchy bounds
            const rawLift = Math.max(0, spawnPosition.y - box.min.y);
            const lift = Math.min(2.0, rawLift);

            this.modelLiftOffset = lift;
            this.mesh.position.y += lift;
            this.targetGroundY = spawnPosition.y + lift;
        }

        if (this.weaponMesh) {
            this.rHand.remove(this.weaponMesh);
            this.weaponMesh = null;
        }

        // Weapon assignment (only if not already assigned by type)
        if (!this.weapon) {
            if (wave >= 2) {
                const rand = Math.random();
                if (wave >= 5 && rand < 0.12) this.weapon = 'grenade';
                else if (wave >= 4 && rand < 0.28) this.weapon = 'gun';
                else if (wave >= 2 && rand < 0.4) this.weapon = 'pistol';

                // Armored zombies heavily prefer guns
                if (this.type === ZOMBIE_TYPES.ARMORED && Math.random() > 0.3) {
                    this.weapon = 'gun';
                }
            }
        }

        if (this.weapon === 'pistol' || this.weapon === 'gun') {
            const isPistol = this.weapon === 'pistol';
            const wLen = isPistol ? 0.3 : 0.6;
            this.weaponMesh = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, wLen), new THREE.MeshStandardMaterial({ color: isPistol ? 0x222222 : 0x111111 }));
            this.weaponMesh.position.set(0, -0.15, wLen / 2 - 0.1);
            if (this.rHand) this.rHand.add(this.weaponMesh);
            this.attackRange = isPistol ? 18 : 28;
            this.attackInterval = isPistol ? 3.0 : 1.5;
        } else if (this.weapon === 'grenade') {
            this.weaponMesh = new THREE.Mesh(new THREE.SphereGeometry(0.15), new THREE.MeshStandardMaterial({ color: 0x334433 }));
            this.weaponMesh.position.set(0, -0.2, 0.1);
            if (this.rHand) this.rHand.add(this.weaponMesh);
            this.attackRange = 22;
            this.attackInterval = 4.5;
        }

        // Toxic/Spitter spread
        if (this.type === ZOMBIE_TYPES.TOXIC) {
            this.attackRange = 14;
            this.attackInterval = 2.5;
        }
        if (this.type === ZOMBIE_TYPES.SPITTER) {
            this.attackRange = 16;
            this.attackInterval = 3.0;
        }
        // Shooter zombies use gun range
        if (this.type === ZOMBIE_TYPES.SHOOTER) {
            this.attackRange = 25;
            this.attackInterval = 2.0;
        }
    }
    takeDamage(amount, hitInfo = null) {
        if (this.isDead) return false;

        // Apply armor-based damage reduction
        let applied = amount * (1 - this.armor);

        // Additional type-based multipliers
        if (this.type === ZOMBIE_TYPES.ARMORED && hitInfo?.isHeadshot) applied *= 0.45;
        if (this.type === ZOMBIE_TYPES.ARMORED && !hitInfo?.isHeadshot) applied *= 0.8;
        if (this.type === ZOMBIE_TYPES.TANK) applied *= 0.85;

        this.health -= applied;

        // Knockback logic
        this.staggerTime = Math.min(0.25, 0.08 + applied / 450);
        if (hitInfo?.knockback) {
            this.knockback.copy(hitInfo.knockback).multiplyScalar(Math.min(0.22, applied / 900));
            this.knockback.y = 0;
        }

        // AAA Blood Burst
        if (hitInfo && hitInfo.point) {
            this.createBloodBurst(hitInfo.point, hitInfo.knockback);
        }

        // Rage Mode (Below 30% Health)
        if (!this.enraged && this.health < (this.maxHealth * 0.3) && this.health > 0) {
            this.enraged = true;
            this.speed *= 1.5;
            if (this.bodyMat) {
                this.bodyMat.emissive.setHex(0x330000);
                this.bodyMat.emissiveIntensity = 1.0;
            }
            if (this.isBoss) {
                window.dispatchEvent(new CustomEvent('boss-enrage'));
            }
        }

        if (this.health <= 0) {
            this.deathPosition.copy(this.mesh.position);
            this.die();
            return true;
        }
        return false;
    }

    createBloodBurst(point, direction) {
        if (!point || this.isDead) return;
        const count = this.isMobile ? 8 : 16;
        const mat = new THREE.MeshBasicMaterial({ color: 0x880000 });
        const geo = new THREE.BoxGeometry(0.12, 0.12, 0.12);

        for (let i = 0; i < count; i++) {
            const p = new THREE.Mesh(geo, mat);
            p.position.copy(point);
            this.scene.add(p);

            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.4, Math.random() * 0.4, (Math.random() - 0.5) * 0.4);
            if (direction) vel.add(direction.clone().multiplyScalar(0.2));

            const start = Date.now();
            const anim = () => {
                const age = Date.now() - start;
                if (age > 600) {
                    this.scene.remove(p); if (p.geometry) p.geometry.dispose(); if (p.material) p.material.dispose(); return;
                }
                p.position.add(vel);
                vel.y -= 0.015;
                requestAnimationFrame(anim);
            };
            anim();
        }
    }

    showHitEffect() {
        if (this.isDead) return;
        audioSystem.playZombieHit();
        // Emissive Flash
        this.mesh.traverse(o => {
            if (o.material) {
                o.material.emissive?.set(0x990000);
                o.material.emissiveIntensity = 1.5;
            }
        });
        setTimeout(() => {
            if (this.mesh) this.mesh.traverse(o => {
                if (o.material) {
                    o.material.emissive?.set(0x000000);
                    o.material.emissiveIntensity = 0;
                }
            });
        }, 80);
    }

    update(delta, player, house, fence, onAttack, obstacles = []) {
        if (this.specialCooldown > 0) this.specialCooldown -= delta;
        const obstaclesAndOthers = obstacles;

        const distToPlayer = player ? this.mesh.position.distanceTo(player.position) : 999;

        // ======= SHOOTER ZOMBIE COOLDOWN =======
        if (this.type === ZOMBIE_TYPES.SHOOTER && !this.isDead && player) {
            this.shootCooldown -= delta;
            if (this.shootCooldown <= 0 && distToPlayer < this.attackRange) {
                // Fire bullet at player
                this.shootBulletFromZombie(player);
                this.shootCooldown = 2.0;
            }
        }

        // ======= SPITTER ZOMBIE COOLDOWN =======
        if (this.type === ZOMBIE_TYPES.SPITTER && !this.isDead && player) {
            this.spitCooldown -= delta;
            if (this.spitCooldown <= 0 && distToPlayer < this.attackRange) {
                // Spit poison at player
                this.spitPoison(player);
                this.spitCooldown = 3.0;
            }
        }

        // Boss Special Attack (Shockwave)
        if (this.isBoss && this.specialCooldown <= 0 && !this.isDead && !this.isRising) {
            if (distToPlayer < 10) {
                this.bossSpecialAttack(player, onAttack);
            }
        }

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
            this.mesh.position.y = this.targetGroundY; // Strict lock
            this.knockback.multiplyScalar(0.85);
            return;
        }

        // Breathing Animation (Realistic 16K feel)
        const breathe = Math.sin(Date.now() * 0.002) * 0.015;
        this.mesh.position.y = this.targetGroundY + breathe;

        // AAA LOD Logic (Performance)
        if (this.mesh.visible && !this.isDead) {
            const lodDist = distToPlayer;
            const detailVisible = lodDist < 25;

            if (this.lHand) {
                this.lHand.children.forEach(c => c.visible = detailVisible);
            }
            if (this.rHand) {
                this.rHand.children.forEach(c => c.visible = detailVisible);
            }

            // Shadows optimization: stop casting shadows if very far away
            this.mesh.traverse(o => {
                if (o.isMesh) {
                    o.castShadow = lodDist < 45;
                }
            });
        }

        // Night-time Glowing Eyes Logic
        const hour = (Date.now() / 1000 % 120) / 120 * 24;
        const isNight = hour < 6 || hour > 18;

        // Realistic Proximity Growl
        if (player && distToPlayer < 10) {
            if (Math.random() < 0.005) {
                audioSystem.playZombieGroan();
            }
        }
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
        if (this.type === ZOMBIE_TYPES.CRAWLER && targetType === 'player') {
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
            // Smart movement logic (Obstacle Avoidance + Separation)
            const direction = new THREE.Vector3().subVectors(actualTargetPos, pos).normalize();
            direction.y = 0;

            // Separation Force (Avoid Overlapping)
            const separation = new THREE.Vector3();
            for (let other of obstaclesAndOthers) {
                if (other === this.mesh) continue;
                const otherPos = other.position;
                if (!otherPos) continue;

                const dist = pos.distanceTo(otherPos);
                if (dist < 2.0) {
                    const diff = new THREE.Vector3().subVectors(pos, otherPos).normalize();
                    separation.add(diff.multiplyScalar(0.1 / (dist + 0.1)));
                }
            }
            direction.add(separation).normalize();

            // Smart Steering (Raycast Forward)
            const forward = direction.clone();
            const raycaster = new THREE.Raycaster(pos.clone().add(new THREE.Vector3(0, 0.8, 0)), forward, 0, 3.5);
            const obsIntersects = raycaster.intersectObjects(obstacles);

            let steering = false;
            if (obsIntersects.length > 0) {
                const obstacle = obsIntersects[0].object;
                const distToObs = obsIntersects[0].distance;
                const obsHeight = obstacle.geometry?.parameters?.height || 2;

                // 🧗 CLIMBING SYSTEM
                if (obsHeight < 4 && distToObs < 1.0) {
                    this.isClimbing = true;
                    // Move position up, but GROUND detection will handle the rest in next frame
                    pos.y += 0.08 * (delta * 60);
                } else if (distToObs < 3.0) {
                    // Avoidance steering
                    direction.x += this.flankDir * 0.8;
                    direction.normalize();
                    steering = true;
                }
            } else {
                this.isClimbing = false;
            }

            if (!steering) {
                direction.x += Math.cos(Date.now() * 0.0015 + this.pathSeed) * 0.04;
                direction.z += Math.sin(Date.now() * 0.0015 + this.pathSeed) * 0.04;
                direction.normalize();
            }

            if (this.chargeTimer > 0) this.chargeTimer -= delta;
            const chargeMul = this.chargeTimer > 0 ? 2.4 : 1;
            // Runner forward lunge: 1.5x speed boost (applied safely before ground snap)
            const runnerMul = (this.type === ZOMBIE_TYPES.RUNNER) ? 2.5 : 1;
            const moveAmt = this.speed * chargeMul * runnerMul * delta * 60;
            const nextPos = pos.clone().add(direction.multiplyScalar(moveAmt));

            // Small obstacle jitter fix
            if (this.isClimbing) {
                pos.copy(nextPos);
            } else {
                // Wall Collision Check (Final safety)
                let hit = false;
                if (obstacles.length > 0) {
                    const zBox = new THREE.Box3().setFromCenterAndSize(
                        nextPos.clone().add(new THREE.Vector3(0, 0.8, 0)),
                        new THREE.Vector3(0.6, 1.6, 0.6)
                    );
                    for (let wall of obstacles) {
                        if (wall.userData.type === 'floor') continue;
                        const wallBox = new THREE.Box3().setFromObject(wall);
                        if (zBox.intersectsBox(wallBox)) {
                            hit = true;
                            break;
                        }
                    }
                }
                if (!hit) pos.copy(nextPos);
            }

            // Ground Snap Logic (Prevent Floating/Underground)
            if (this.groundMesh) {
                // Raycast from slightly above current position to find ground
                this.raycaster.set(pos.clone().add(new THREE.Vector3(0, 5, 0)), this.down);
                const groundInt = this.raycaster.intersectObject(this.groundMesh, true);
                if (groundInt.length > 0) {
                    const groundY = groundInt[0].point.y + (this.modelLiftOffset || 0);

                    if (this.isClimbing) {
                        // While climbing, allow Y to be higher than ground, but not lower
                        this.targetGroundY = Math.max(groundY, pos.y);
                    } else {
                        // Not climbing: Smoothly snap to true ground
                        this.targetGroundY = groundY;
                    }
                }
            }

            // ==== PHYSICS & GRAVITY ====
            const gravity = 20.0; // Gravity acceleration
            this.velocityY -= gravity * delta; // Accelerate downward
            this.mesh.position.y += this.velocityY * delta; // Apply velocity to position

            // Ground Collision
            if (this.mesh.position.y <= this.targetGroundY) {
                this.mesh.position.y = this.targetGroundY; // Snap to ground
                this.velocityY = 0; // Stop falling
            } else if (this.isClimbing) {
                // Climbing exception (allow them to move up over obstacles)
                this.velocityY = Math.max(0, this.velocityY);
            }

            // ======= AGGRESSIVE AI MOVEMENT =======
            // Look at player aggressively (lock Y rotation only)
            this.mesh.lookAt(actualTargetPos.x, this.mesh.position.y, actualTargetPos.z);

            // Shambling / Running animation
            const isRunning = this.type === ZOMBIE_TYPES.RUNNER || this.type === ZOMBIE_TYPES.SPRINTER || this.enraged;
            const animSpeed = isRunning ? 0.012 : 0.005;
            const time = Date.now() * animSpeed;

            // Bobbing motion
            this.mesh.position.y += Math.sin(time * 12) * 0.02;

            // 🔥 Aggressive wobble animation (makes them look menacing)
            this.mesh.rotation.z = Math.sin(Date.now() * 0.01) * 0.02;

            // ⚠️ FORCE GROUND LOCK (Only if they somehow clip)
            if (this.mesh.position.y < this.targetGroundY) {
                this.mesh.position.y = this.targetGroundY;
                this.velocityY = 0;
            }
            this.mesh.rotation.x = 0;

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

            // AAA Footsteps (Spatial)
            if (Math.abs(legSwing) > 0.5 && !this._lastStep) {
                this._lastStep = true;
                if (distToPlayer < 18) audioSystem.playZombieStep();
            } else if (Math.abs(legSwing) < 0.1) {
                this._lastStep = false;
            }
        } else {
            // Attack logic (includes gate breaking)
            if (targetType === 'gate' || targetType === 'fence') {
                const gateHealth = window.gateHealth || 300;
                if (!window.isGateBroken && pos.distanceTo(new THREE.Vector3(0, 0, 13.5)) < 3) {
                    window.dispatchEvent(new CustomEvent('attack-gate', { detail: { damage: this.damage * 0.1 } }));
                }
            }

            if (targetType === 'gate') {
                // Transition to house/player
                return;
            }

            const now = performance.now() / 1000;
            if (now - this.lastAttack > this.attackInterval) {
                if (this.type === ZOMBIE_TYPES.TOXIC && targetType === 'player') {
                    // Toxic Spit Attack
                    onAttack('player', this.damage * 0.4);
                    this.createToxicSpit(actualTargetPos);
                }

                // Spitter applies poison DOT on hit
                if (this.type === ZOMBIE_TYPES.SPITTER && targetType === 'player') {
                    onAttack('player', this.damage * 0.3);
                    this.spitPoison(player);
                    // Dispatch poison event to player
                    window.dispatchEvent(new CustomEvent('player-poisoned', { detail: { damage: 5, duration: 5 } }));
                }

                if (this.weapon === 'grenade') {
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.damage * 4);
                    this.weapon = null;
                    if (this.weaponMesh) { this.rHand.remove(this.weaponMesh); this.weaponMesh = null; }
                } else if (this.weapon === 'gun' || this.weapon === 'pistol') {
                    // Zombie fires gun
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.weapon === 'gun' ? this.damage * 1.5 : this.damage);
                    if (this.weaponMesh) this.showMuzzleFlash();
                } else {
                    // Melee attack
                    onAttack(targetType === 'fence' ? 'fence' : (targetType === 'house' ? 'house' : 'player'), this.damage);
                }

                this.lastAttack = now;
                this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x550000); });
                setTimeout(() => { if (this.mesh) this.mesh.traverse(o => { if (o.material) o.material.emissive?.set(0x000000); }); }, 300);
            }
            this.mesh.lookAt(actualTargetPos.x, this.mesh.position.y, actualTargetPos.z);

            // ⚠️ ANTI-FLY / ANTI-BUG PROTECTIONS
            if (this.mesh.position.y < this.targetGroundY - 0.01) {
                this.mesh.position.y = this.targetGroundY;
                this.velocityY = 0;
            }
            this.mesh.rotation.x = 0; // Prevent tilt forward/backward
            this.mesh.rotation.z = 0; // Prevent rotation glitches
        }

        // ======= ABSOLUTE GROUND FLOOR =======
        // Final safety: NEVER let any zombie go below ground Y=0
        if (!this.isDead && this.mesh.position.y < 0) {
            this.mesh.position.y = Math.max(0, this.targetGroundY);
            this.velocityY = 0;
        }
    }

    createToxicSpit(targetPos) {
        if (!this.mesh) return;
        const geo = new THREE.SphereGeometry(0.15);
        const mat = new THREE.MeshBasicMaterial({ color: 0x4fbf4f, transparent: true, opacity: 0.8 });
        const spit = new THREE.Mesh(geo, mat);
        spit.position.copy(this.mesh.position);
        spit.position.y += 1.5; // Start near mouth
        this.scene.add(spit);

        const dist = spit.position.distanceTo(targetPos);
        const timeToHit = Math.min(300, dist * 30);
        const startPos = spit.position.clone();

        const animStart = Date.now();
        const anim = () => {
            const age = Date.now() - animStart;
            if (age > timeToHit) {
                this.scene.remove(spit); spit.geometry.dispose(); spit.material.dispose();
                return;
            }
            const t = age / timeToHit;
            spit.position.lerpVectors(startPos, targetPos, t);
            // Parabola arch
            spit.position.y += Math.sin(t * Math.PI) * 1.5;
            requestAnimationFrame(anim);
        };
        anim();
    }

    // ======= SHOOTER ZOMBIE: Fire bullet at player =======
    shootBulletFromZombie(player) {
        if (!this.mesh || !player) return;
        const bulletGeo = new THREE.SphereGeometry(0.08, 6, 6);
        const bulletMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, emissive: 0xffaa00 });
        const bullet = new THREE.Mesh(bulletGeo, bulletMat);

        bullet.position.copy(this.mesh.position);
        bullet.position.y += 1.4; // Fire from chest height

        const direction = new THREE.Vector3()
            .subVectors(player.position, bullet.position)
            .normalize();
        direction.y = 0; // Flat trajectory

        this.scene.add(bullet);
        if (this.weaponMesh) this.showMuzzleFlash();
        audioSystem.playShootAK();

        const speed = 1.2;
        const startTime = Date.now();
        const animBullet = () => {
            const age = Date.now() - startTime;
            if (age > 2000) {
                this.scene.remove(bullet);
                bullet.geometry.dispose();
                bullet.material.dispose();
                return;
            }
            bullet.position.addScaledVector(direction, speed);
            bullet.position.y = Math.max(0.3, bullet.position.y); // Keep above ground

            // Hit detection against player
            if (player && bullet.position.distanceTo(player.position) < 1.5) {
                window.dispatchEvent(new CustomEvent('zombie-bullet-hit', { detail: { damage: this.damage * 0.8 } }));
                this.scene.remove(bullet);
                bullet.geometry.dispose();
                bullet.material.dispose();
                return;
            }
            requestAnimationFrame(animBullet);
        };
        animBullet();
    }

    // ======= SPITTER ZOMBIE: Spit poison at player =======
    spitPoison(player) {
        if (!this.mesh || !player) return;
        const poisonGeo = new THREE.SphereGeometry(0.2, 8, 8);
        const poisonMat = new THREE.MeshBasicMaterial({
            color: 0x33ff33,
            transparent: true,
            opacity: 0.7,
            emissive: 0x22aa22
        });
        const poison = new THREE.Mesh(poisonGeo, poisonMat);

        poison.position.copy(this.mesh.position);
        poison.position.y += 1.5; // Fire from mouth

        const targetPos = player.position.clone();
        const direction = new THREE.Vector3()
            .subVectors(targetPos, poison.position)
            .normalize();

        this.scene.add(poison);

        const dist = poison.position.distanceTo(targetPos);
        const timeToHit = Math.min(500, dist * 40);
        const startPos = poison.position.clone();
        const animStart = Date.now();

        const animPoison = () => {
            const age = Date.now() - animStart;
            if (age > timeToHit) {
                // Poison hit — apply DOT
                window.dispatchEvent(new CustomEvent('player-poisoned', { detail: { damage: 5, duration: 5 } }));
                this.scene.remove(poison);
                poison.geometry.dispose();
                poison.material.dispose();
                return;
            }
            const t = age / timeToHit;
            poison.position.lerpVectors(startPos, targetPos, t);
            // Parabolic arc
            poison.position.y += Math.sin(t * Math.PI) * 2.0;
            // Pulsing glow effect
            poison.scale.setScalar(1 + Math.sin(age * 0.02) * 0.2);
            requestAnimationFrame(animPoison);
        };
        animPoison();
    }

    showMuzzleFlash() {
        if (!this.weaponMesh) return;
        if (!this.muzzleFlashProxy) {
            this.muzzleFlashProxy = new THREE.PointLight(0xffaa55, 2, 8);
            this.weaponMesh.add(this.muzzleFlashProxy);
            this.muzzleFlashProxy.position.set(0, 0, 0.4);
        }
        this.muzzleFlashProxy.visible = true;
        audioSystem.playShootAK(); // Recycle AK sound for zombie gun
        setTimeout(() => { if (this.muzzleFlashProxy) this.muzzleFlashProxy.visible = false; }, 50);
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

        // AAA Blood Decal (Ground Splat)
        this.addBloodDecal();
    }

    addBloodDecal() {
        const decalGeo = new THREE.PlaneGeometry(1.5 + Math.random(), 1.5 + Math.random());
        const decalMat = new THREE.MeshBasicMaterial({
            color: 0x330000,
            transparent: true,
            opacity: 0.6,
            depthWrite: false
        });
        const decal = new THREE.Mesh(decalGeo, decalMat);
        decal.rotation.x = -Math.PI / 2;
        decal.position.copy(this.mesh.position);
        decal.position.y = 0.02; // Just above ground
        decal.rotation.z = Math.random() * Math.PI * 2;
        this.scene.add(decal);

        // Fading out over time
        setTimeout(() => {
            let op = 0.6;
            const fade = setInterval(() => {
                op -= 0.05;
                decal.material.opacity = op;
                if (op <= 0) {
                    clearInterval(fade);
                    this.scene.remove(decal);
                    decal.geometry.dispose();
                    decal.material.dispose();
                }
            }, 100);
        }, 10000);
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

    bossSpecialAttack(player, onAttack) {
        if (this.specialCooldown > 0) return;
        this.specialCooldown = 5.0; // 5 seconds cooldown

        // Attack logic
        const radius = 10;
        const dist = this.mesh.position.distanceTo(player.position);
        if (dist < radius) {
            onAttack('player', 30);
            window.dispatchEvent(new CustomEvent('screen-shake', { detail: { intensity: 1.0, duration: 0.6 } }));
        }

        this.createShockwaveEffect(this.mesh.position.clone());
        audioSystem.playExplosion();
    }

    createShockwaveEffect(position) {
        // Shockwave rings
        const ringGeo = new THREE.RingGeometry(0.1, 0.5, 32);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xff4400, transparent: true, opacity: 0.8, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.copy(position).add(new THREE.Vector3(0, 0.1, 0));
        this.scene.add(ring);

        let scale = 1;
        const animateRing = () => {
            scale += 0.8;
            ring.scale.set(scale, scale, 1);
            ring.material.opacity -= 0.02;
            if (ring.material.opacity > 0) {
                requestAnimationFrame(animateRing);
            } else {
                this.scene.remove(ring);
                ring.geometry.dispose();
                ring.material.dispose();
            }
        };
        animateRing();

        // Particle burst
        for (let i = 0; i < 20; i++) {
            const p = new THREE.Mesh(
                new THREE.BoxGeometry(0.2, 0.2, 0.2),
                new THREE.MeshBasicMaterial({ color: 0xffaa00 })
            );
            p.position.copy(position).add(new THREE.Vector3(0, 0.5, 0));
            const vel = new THREE.Vector3((Math.random() - 0.5) * 2, Math.random() * 2, (Math.random() - 0.5) * 2);
            this.scene.add(p);

            const life = 1000 + Math.random() * 500;
            const start = Date.now();
            const animP = () => {
                if (Date.now() - start > life) {
                    this.scene.remove(p);
                    p.geometry.dispose();
                    p.material.dispose();
                    return;
                }
                p.position.add(vel);
                vel.y -= 0.05; // Gravity
                p.rotation.x += 0.1;
                requestAnimationFrame(animP);
            };
            animP();
        }
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

    getWaveZombieCount(wave) {
        return Math.min(60, 5 + wave * 4);
    }

    getScaledHealth(wave) {
        return 50 + wave * 15;
    }

    getScaledDamage(wave) {
        return 10 + Math.floor(wave * 2);
    }

    getScaledSpeed(wave) {
        return 0.04 + wave * 0.003; // Faster scaling 
    }

    getBossHealth(wave) {
        return (50 + wave * 15) * 5; // 5x Health as requested
    }

    update(delta, player, house, fence, onAttack, onKill, onLoot, walls = []) {
        if (!window.hasOwnProperty('gateHealth')) {
            window.gateHealth = 300;
            window.isGateBroken = false;
            window.addEventListener('attack-gate', (e) => {
                const damage = e.detail.damage || 1;
                if (window.isGateBroken) return;
                window.gateHealth -= damage;
                if (window.gateHealth <= 0) {
                    window.dispatchEvent(new CustomEvent('gate-broken'));
                }
            });
        }

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

                // Wave cleared — trigger boss or next wave
                if (this.zombiesToSpawn === 0 && this.activeCount() === 0 && !this.bossSpawnPending) {
                    window.dispatchEvent(new CustomEvent('wave-cleared', { detail: this.currentWave }));

                    if (this.currentWave % 5 === 0) {
                        // Spawn boss after a short dramatic delay
                        this.bossSpawnPending = true;
                        this.bossSpawnDelay = 2.0;
                    } else {
                        // Start intermission for next wave
                        this.waveIntermission = true;
                        this.intermissionTimer = 6.0;
                    }
                }
            }
        }

        // Update all zombies (passing all zombie meshes for separation)
        const zombieMeshes = this.zombies.filter(z => !z.isDead).map(z => z.mesh).concat(walls);
        this.zombies.forEach(z => {
            z.update(delta, player, house, fence, onAttack, zombieMeshes);
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

