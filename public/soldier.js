import * as THREE from 'three';
import { audioSystem } from './audio.js';

// Guard types: 'ak47', 'rpg', 'sniper'
export class Soldier {
    constructor(scene, position, type = 'ak47') {
        this.scene = scene;
        this.type = type;
        this.isDead = false;

        // Stats per type
        const stats = {
            ak47: { health: 250, fireRate: 0.18, damage: 22, range: 28, color: 0x4a5a3a, accent: 0x6b7b4a, name: 'ASSAULT' },
            rpg: { health: 350, fireRate: 2.5, damage: 120, range: 35, color: 0x5a4a3a, accent: 0x8b6b4a, name: 'HEAVY' },
            sniper: { health: 180, fireRate: 1.8, damage: 80, range: 60, color: 0x3a4a5a, accent: 0x4a6a8a, name: 'MARKSMAN' }
        };
        const s = stats[type] || stats.ak47;
        this.health = s.health;
        this.maxHealth = s.health;
        this.fireRate = s.fireRate;
        this.damage = s.damage;
        this.detectionRange = s.range;
        this.guardName = s.name;

        this.group = new THREE.Group();
        this.group.position.copy(position);

        const bodyColor = s.color;
        const accentColor = s.accent;
        const skinColor = 0xc4956a;
        const bootColor = 0x222222;
        const vestColor = 0x333333;

        const bodyMat = new THREE.MeshStandardMaterial({ color: bodyColor, roughness: 0.7 });
        const accentMat = new THREE.MeshStandardMaterial({ color: accentColor, roughness: 0.6 });
        const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8 });
        const bootMat = new THREE.MeshStandardMaterial({ color: bootColor, roughness: 0.9 });
        const vestMat = new THREE.MeshStandardMaterial({ color: vestColor, metalness: 0.3, roughness: 0.5 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 });
        const gunMetalMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, metalness: 0.9, roughness: 0.2 });

        // === BOOTS ===
        const bootGeo = new THREE.BoxGeometry(0.22, 0.35, 0.35);
        const lBoot = new THREE.Mesh(bootGeo, bootMat);
        lBoot.position.set(-0.15, 0.18, 0);
        lBoot.castShadow = true;
        this.group.add(lBoot);
        const rBoot = new THREE.Mesh(bootGeo, bootMat);
        rBoot.position.set(0.15, 0.18, 0);
        rBoot.castShadow = true;
        this.group.add(rBoot);

        // === LEGS ===
        const legGeo = new THREE.BoxGeometry(0.2, 0.55, 0.22);
        const lLeg = new THREE.Mesh(legGeo, bodyMat);
        lLeg.position.set(-0.15, 0.63, 0);
        lLeg.castShadow = true;
        this.group.add(lLeg);
        const rLeg = new THREE.Mesh(legGeo, bodyMat);
        rLeg.position.set(0.15, 0.63, 0);
        rLeg.castShadow = true;
        this.group.add(rLeg);

        // === TORSO ===
        const torsoGeo = new THREE.BoxGeometry(0.55, 0.7, 0.32);
        const torso = new THREE.Mesh(torsoGeo, bodyMat);
        torso.position.set(0, 1.25, 0);
        torso.castShadow = true;
        this.group.add(torso);

        // === TACTICAL VEST ===
        const vestGeo = new THREE.BoxGeometry(0.58, 0.5, 0.36);
        const vest = new THREE.Mesh(vestGeo, vestMat);
        vest.position.set(0, 1.3, 0);
        vest.castShadow = true;
        this.group.add(vest);

        // Vest pouches
        for (let px = -0.2; px <= 0.2; px += 0.2) {
            const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.08), accentMat);
            pouch.position.set(px, 1.15, 0.2);
            this.group.add(pouch);
        }

        // === SHOULDERS / PADS ===
        const padGeo = new THREE.BoxGeometry(0.18, 0.12, 0.25);
        const lPad = new THREE.Mesh(padGeo, accentMat);
        lPad.position.set(-0.35, 1.5, 0);
        this.group.add(lPad);
        const rPad = new THREE.Mesh(padGeo, accentMat);
        rPad.position.set(0.35, 1.5, 0);
        this.group.add(rPad);

        // === ARMS ===
        const armGeo = new THREE.BoxGeometry(0.15, 0.55, 0.15);
        const lArm = new THREE.Mesh(armGeo, bodyMat);
        lArm.position.set(-0.38, 1.1, 0.05);
        lArm.castShadow = true;
        this.group.add(lArm);
        const rArm = new THREE.Mesh(armGeo, bodyMat);
        rArm.position.set(0.38, 1.1, 0.05);
        rArm.castShadow = true;
        this.group.add(rArm);

        // === HANDS (skin) ===
        const handGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
        const lHand = new THREE.Mesh(handGeo, skinMat);
        lHand.position.set(-0.38, 0.78, 0.1);
        this.group.add(lHand);
        const rHand = new THREE.Mesh(handGeo, skinMat);
        rHand.position.set(0.38, 0.78, 0.1);
        this.group.add(rHand);

        // === HEAD ===
        const headGeo = new THREE.BoxGeometry(0.32, 0.32, 0.3);
        const head = new THREE.Mesh(headGeo, skinMat);
        head.position.set(0, 1.78, 0);
        head.castShadow = true;
        this.group.add(head);

        // === HELMET ===
        let helmetColor = type === 'sniper' ? 0x2a3a4a : (type === 'rpg' ? 0x4a3a2a : 0x2a3a2a);
        const helmetMat = new THREE.MeshStandardMaterial({ color: helmetColor, roughness: 0.6 });
        const helmetGeo = new THREE.BoxGeometry(0.38, 0.2, 0.36);
        const helmet = new THREE.Mesh(helmetGeo, helmetMat);
        helmet.position.set(0, 1.97, -0.01);
        this.group.add(helmet);

        // Helmet visor
        const visorGeo = new THREE.BoxGeometry(0.34, 0.08, 0.05);
        const visorMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.5, roughness: 0.3 });
        const visor = new THREE.Mesh(visorGeo, visorMat);
        visor.position.set(0, 1.88, 0.17);
        this.group.add(visor);

        // === EYES (small glowing dots behind visor) ===
        const eyeGeo = new THREE.SphereGeometry(0.025, 6, 6);
        const eyeMat = new THREE.MeshBasicMaterial({ color: type === 'sniper' ? 0x00aaff : 0x44ff44 });
        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-0.08, 1.82, 0.16);
        this.group.add(lEye);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat);
        rEye.position.set(0.08, 1.82, 0.16);
        this.group.add(rEye);

        // === WEAPON (type-specific) ===
        this.weaponGroup = new THREE.Group();

        if (type === 'ak47') {
            // AK47 — compact assault rifle
            const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.9), gunMetalMat);
            barrel.position.set(0, 0, 0.45);
            this.weaponGroup.add(barrel);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.5), new THREE.MeshStandardMaterial({ color: 0x4a3320 }));
            body.position.set(0, -0.02, 0.1);
            this.weaponGroup.add(body);
            const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.08), metalMat);
            mag.position.set(0, -0.15, 0.15);
            this.weaponGroup.add(mag);
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.3), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
            stock.position.set(0, 0, -0.25);
            this.weaponGroup.add(stock);
        } else if (type === 'rpg') {
            // RPG — large tube launcher
            const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.2, 8), new THREE.MeshStandardMaterial({ color: 0x3a5a3a, metalness: 0.4 }));
            tube.rotation.x = Math.PI / 2;
            tube.position.set(0, 0, 0.3);
            this.weaponGroup.add(tube);
            const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.18, 0.06), metalMat);
            grip.position.set(0, -0.12, 0);
            this.weaponGroup.add(grip);
            // Warhead
            const warhead = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.2, 6), new THREE.MeshStandardMaterial({ color: 0x886633 }));
            warhead.rotation.x = -Math.PI / 2;
            warhead.position.set(0, 0, 0.95);
            this.weaponGroup.add(warhead);
        } else if (type === 'sniper') {
            // Sniper — long rifle with scope
            const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 1.3), gunMetalMat);
            barrel.position.set(0, 0, 0.65);
            this.weaponGroup.add(barrel);
            const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x2a2a2a }));
            body.position.set(0, -0.01, 0.2);
            this.weaponGroup.add(body);
            // Scope
            const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 8), metalMat);
            scope.rotation.x = Math.PI / 2;
            scope.position.set(0, 0.08, 0.3);
            this.weaponGroup.add(scope);
            const scopeLens = new THREE.Mesh(new THREE.CircleGeometry(0.035, 8), new THREE.MeshBasicMaterial({ color: 0x3366ff }));
            scopeLens.position.set(0, 0.08, 0.43);
            this.weaponGroup.add(scopeLens);
            const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.35), new THREE.MeshStandardMaterial({ color: 0x3a2a18 }));
            stock.position.set(0, 0, -0.28);
            this.weaponGroup.add(stock);
        }

        this.weaponGroup.position.set(0.3, 1.0, 0.3);
        this.group.add(this.weaponGroup);

        // === HEALTH BAR (above head) ===
        const barBg = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.08), new THREE.MeshBasicMaterial({ color: 0x333333 }));
        barBg.position.set(0, 2.2, 0);
        barBg.rotation.order = 'YXZ';
        this.group.add(barBg);
        this.healthBar = new THREE.Mesh(new THREE.PlaneGeometry(0.58, 0.06), new THREE.MeshBasicMaterial({ color: 0x44cc44 }));
        this.healthBar.position.set(0, 2.2, 0.01);
        this.healthBar.rotation.order = 'YXZ';
        this.group.add(this.healthBar);
        this.healthBarBg = barBg;

        this.scene.add(this.group);

        // AI Logic
        this.target = null;
        this.fireTimer = 0;
        this.idleRotSpeed = 0.3 + Math.random() * 0.3;
    }

    update(delta, zombies, scene, camera) {
        if (this.isDead) return;

        // Billboard health bar toward camera
        if (camera) {
            const camDir = new THREE.Vector3();
            camera.getWorldDirection(camDir);
            this.healthBar.lookAt(camera.position);
            this.healthBarBg.lookAt(camera.position);
        }

        // Find closest zombie
        let closestDist = this.detectionRange;
        this.target = null;

        for (let zombie of zombies) {
            if (zombie.isDead) continue;
            const dist = this.group.position.distanceTo(zombie.mesh.position);
            if (dist < closestDist) {
                closestDist = dist;
                this.target = zombie;
            }
        }

        if (this.target) {
            // Face target
            const targetPos = this.target.mesh.position.clone();
            targetPos.y = this.group.position.y;
            this.group.lookAt(targetPos);

            // Fire
            this.fireTimer += delta;
            if (this.fireTimer >= this.fireRate) {
                this.fireTimer = 0;
                this.shoot(scene);
            }
        } else {
            // Idle rotation
            this.group.rotation.y += delta * this.idleRotSpeed;
        }
    }

    shoot(scene) {
        if (!this.target) return;

        // Sound based on type
        if (this.type === 'sniper') {
            audioSystem.playShootSniper?.() || audioSystem.playShootAK();
        } else {
            audioSystem.playShootAK();
        }

        // Muzzle Flash
        const flashColor = this.type === 'rpg' ? 0xff6600 : 0xffaa00;
        const flashIntensity = this.type === 'rpg' ? 8 : 5;
        const flash = new THREE.PointLight(flashColor, flashIntensity, this.type === 'rpg' ? 5 : 2);
        const fwd = new THREE.Vector3(0, 1, 1.2).applyEuler(this.group.rotation);
        flash.position.copy(this.group.position).add(fwd);
        scene.add(flash);
        setTimeout(() => scene.remove(flash), this.type === 'rpg' ? 100 : 50);

        // RPG: area damage
        if (this.type === 'rpg') {
            const targetPos = this.target.mesh.position.clone();
            // Create explosion effect
            const explosion = new THREE.PointLight(0xff4400, 10, 8);
            explosion.position.copy(targetPos);
            explosion.position.y = 1;
            scene.add(explosion);
            setTimeout(() => scene.remove(explosion), 200);

            // Damage all zombies in radius
            const blastRadius = 5;
            for (let z of this.target.scene ? [this.target] : []) {
                // Just hit the target for now
                if (z && z.takeDamage) z.takeDamage(this.damage);
            }
            // Direct hit
            if (this.target && this.target.takeDamage) {
                this.target.takeDamage(this.damage);
            }
        } else {
            // Direct damage
            if (this.target && this.target.takeDamage) {
                this.target.takeDamage(this.damage);
            }
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        // Update health bar
        const ratio = Math.max(0, this.health / this.maxHealth);
        this.healthBar.scale.x = ratio;
        this.healthBar.position.x = -(1 - ratio) * 0.29;
        if (ratio < 0.3) {
            this.healthBar.material.color.setHex(0xff4444);
        } else if (ratio < 0.6) {
            this.healthBar.material.color.setHex(0xffaa44);
        }

        // Flash red on hit
        this.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.set(0x330000); });
        setTimeout(() => {
            this.group.traverse(o => { if (o.material && o.material.emissive) o.material.emissive.set(0x000000); });
        }, 100);

        if (this.health <= 0 && !this.isDead) {
            this.isDead = true;
            this.group.rotation.x = Math.PI / 2;
            setTimeout(() => this.scene.remove(this.group), 5000);
        }
    }
}
