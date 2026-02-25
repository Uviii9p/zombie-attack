import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;

        // Stats
        this.health = 100;
        this.maxHealth = 100;
        this.coins = 0;
        this.armor = 0;
        this.respawnsLeft = 5;
        this.flashlight = null;

        // Base Props (Define everything BEFORE calling any methods like respawn)
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 0.12;
        this.sprintMultiplier = 1.7;
        this.isGrounded = true;
        this.viewMode = 'TPP';
        this.keys = {};
        this.mouseRotation = new THREE.Euler(0, 0, 0, 'YXZ');
        this.inventory = [];
        this.ammoReserves = { 'AK47': 90, 'Sniper': 15, 'RPG': 3, 'Grenade': 3 };
        this.isDriving = false;
        this.currentVehicle = null;
        this.flashlight = new THREE.SpotLight(0xffffff, 2, 25, Math.PI / 4, 0.4);
        this.flashlight.visible = true;
        this.scene.add(this.flashlight);
        this.scene.add(this.flashlight.target);

        // Model Base
        this.group = new THREE.Group();

        // High Quality PBR Materials
        const skinMat = new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.35, metalness: 0.05 });
        const shirtMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.8, metalness: 0.1 });
        const vestMat = new THREE.MeshStandardMaterial({ color: 0x1a241a, roughness: 0.9, metalness: 0.2 });
        const pantsMat = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.85 });
        const bootsMat = new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.6, metalness: 0.2 });
        const hairMat = new THREE.MeshStandardMaterial({ color: 0x211710, roughness: 0.9 });
        const beltMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.5, metalness: 0.3 });

        // === TORSO === (Athletic V-Taper Shape)
        this.torsoMesh = new THREE.Group();
        this.torsoMesh.position.y = 1.05;
        this.group.add(this.torsoMesh);

        // Chest / Upper Body
        const chestGeo = new THREE.BoxGeometry(0.65, 0.6, 0.35);
        const chest = new THREE.Mesh(chestGeo, shirtMat);
        chest.position.y = 0.25;
        chest.castShadow = true;
        this.torsoMesh.add(chest);

        // Abdomen (Tapered)
        const absGeo = new THREE.BoxGeometry(0.55, 0.45, 0.3);
        const abs = new THREE.Mesh(absGeo, shirtMat);
        abs.position.y = -0.25;
        abs.castShadow = true;
        this.torsoMesh.add(abs);

        // Tactical Armored Vest
        const vest = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.55, 0.4), vestMat);
        vest.position.y = 0.25;
        this.torsoMesh.add(vest);

        // Vest Pouches (Ammo/Utility details)
        for (let i = 0; i < 3; i++) {
            const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.2, 0.1), vestMat);
            pouch.position.set(-0.2 + (i * 0.2), 0.15, 0.25);
            this.torsoMesh.add(pouch);
        }

        // Utility Belt
        const belt = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.35), beltMat);
        belt.position.y = -0.45;
        this.torsoMesh.add(belt);

        // Grenades on belt
        for (let i = 0; i < 2; i++) {
            const gr = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), new THREE.MeshStandardMaterial({ color: 0x224422, roughness: 0.7, metalness: 0.3 }));
            gr.position.set(-0.2 + (i * 0.4), -0.45, 0.2);
            this.torsoMesh.add(gr);
        }

        // Tactical Backpack (Weapon Storage)
        const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.65, 0.25), vestMat);
        backpack.position.set(0, 0.2, -0.3);
        backpack.castShadow = true;
        this.torsoMesh.add(backpack);

        // === LEGS ===
        this.leftLeg = new THREE.Group();
        this.leftLeg.position.set(-0.18, 0.55, 0);
        this.group.add(this.leftLeg);

        const lThigh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.28), pantsMat);
        lThigh.position.y = -0.2; lThigh.castShadow = true;
        const lCalf = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.4, 0.25), pantsMat);
        lCalf.position.y = -0.6; lCalf.castShadow = true;
        const lKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.3), vestMat);
        lKneePad.position.y = -0.42;
        const lBoot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.2, 0.32), bootsMat);
        lBoot.position.set(0, -0.9, 0.05); lBoot.castShadow = true;
        this.leftLeg.add(lThigh, lCalf, lKneePad, lBoot);

        this.rightLeg = new THREE.Group();
        this.rightLeg.position.set(0.18, 0.55, 0);
        this.group.add(this.rightLeg);

        const rThigh = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.45, 0.28), pantsMat);
        rThigh.position.y = -0.2; rThigh.castShadow = true;
        const rCalf = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.4, 0.25), pantsMat);
        rCalf.position.y = -0.6; rCalf.castShadow = true;
        const rKneePad = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.15, 0.3), vestMat);
        rKneePad.position.y = -0.42;
        const rBoot = new THREE.Mesh(new THREE.BoxGeometry(0.23, 0.2, 0.32), bootsMat);
        rBoot.position.set(0, -0.9, 0.05); rBoot.castShadow = true;
        this.rightLeg.add(rThigh, rCalf, rKneePad, rBoot);

        // === HEAD & FACE === (High Quality)
        this.headMesh = new THREE.Group();
        this.headMesh.position.y = 1.7;
        this.group.add(this.headMesh);

        // Head Base
        const headGeo = new THREE.SphereGeometry(0.19, 16, 16);
        const headMain = new THREE.Mesh(headGeo, skinMat);
        headMain.castShadow = true;
        this.headMesh.add(headMain);

        // Jawline & Chin
        const jaw = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.18, 0.25), skinMat);
        jaw.position.set(0, -0.1, 0.05);
        this.headMesh.add(jaw);

        // Neck
        const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 0.15, 8), skinMat);
        neck.position.y = -0.25;
        this.headMesh.add(neck);

        // Short Military Fade Haircut
        const hairTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.1, 0.35), hairMat);
        hairTop.position.set(0, 0.16, -0.02);
        this.headMesh.add(hairTop);
        const hairBack = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.1), hairMat);
        hairBack.position.set(0, 0.05, -0.16);
        this.headMesh.add(hairBack);

        // Subtle Bead / Stubble Shadow
        const beard = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0x211710, roughness: 1.0, opacity: 0.8, transparent: true }));
        beard.position.set(0, -0.12, 0.06);
        this.headMesh.add(beard);

        this.scene.add(this.group);

        // Hands / First Person Arms
        this.handGroup = new THREE.Group();
        const armGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.4, 8);
        const gloveMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });

        this.leftArm = new THREE.Mesh(armGeo, gloveMat);
        this.leftArm.rotation.x = Math.PI / 2;
        this.leftArm.position.set(-0.35, -0.25, -0.35);
        this.leftArm.castShadow = true;

        this.rightArm = new THREE.Mesh(armGeo, gloveMat);
        this.rightArm.rotation.x = Math.PI / 2;
        this.rightArm.position.set(0.35, -0.25, -0.35);
        this.rightArm.castShadow = true;

        this.handGroup.add(this.leftArm, this.rightArm);

        // Advanced Gun Model Detail
        const gunGroup = new THREE.Group();
        const gunBodyGeo = new THREE.BoxGeometry(0.1, 0.15, 0.7);
        const gunMat = new THREE.MeshStandardMaterial({ color: 0x151515, metalness: 0.8, roughness: 0.3 });
        const gunBody = new THREE.Mesh(gunBodyGeo, gunMat);
        gunGroup.add(gunBody);

        const barrelGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.4, 8);
        const barrel = new THREE.Mesh(barrelGeo, gunMat);
        barrel.rotation.x = Math.PI / 2;
        barrel.position.set(0, 0.02, -0.5);
        gunGroup.add(barrel);

        const scopeGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.2, 8);
        const scope = new THREE.Mesh(scopeGeo, gunMat);
        scope.rotation.x = Math.PI / 2;
        scope.position.set(0, 0.11, -0.1);
        gunGroup.add(scope);

        this.gunMesh = gunGroup;
        this.gunTargetPos = new THREE.Vector3(0.35, -0.3, -0.6);
        this.gunMesh.position.copy(this.gunTargetPos);
        this.handGroup.add(this.gunMesh);

        // Grenade Model Detail
        const grenadeGeo = new THREE.SphereGeometry(0.12, 8, 8);
        const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x223322, roughness: 0.8 });
        this.grenadeHandMesh = new THREE.Mesh(grenadeGeo, grenadeMat);
        this.grenadeHandMesh.position.copy(this.gunTargetPos);
        this.grenadeHandMesh.position.y += 0.1; // Adjust position slightly for hand
        this.grenadeHandMesh.visible = false;
        this.handGroup.add(this.grenadeHandMesh);

        this.camera.add(this.handGroup);
        this.scene.add(this.camera);

        // Call methods AFTER properties are defined
        this.respawn();
        this.initControls();
    }

    switchWeaponModel(weaponName) {
        if (weaponName === 'Grenade') {
            this.gunMesh.visible = false;
            this.grenadeHandMesh.visible = true;
        } else {
            this.gunMesh.visible = true;
            this.grenadeHandMesh.visible = false;
        }
    }

    initControls() {
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);
        window.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement) {
                this.mouseRotation.y -= e.movementX * 0.002;
                this.mouseRotation.x -= e.movementY * 0.002;
                this.mouseRotation.x = Math.max(-1.4, Math.min(1.4, this.mouseRotation.x));
            }
        });
    }

    respawn() {
        this.group.position.set(5, 0, 5);
        this.health = 100;
        this.velocity.set(0, 0, 0);
    }

    update(delta, collidables) {
        if (this.isDriving && this.currentVehicle) {
            this.group.position.copy(this.currentVehicle.getSeatPosition());
            this.group.rotation.copy(this.currentVehicle.mesh.rotation);
            this.handGroup.visible = false;
            this.torsoMesh.visible = false;
            this.headMesh.visible = false;
            this.leftLeg.visible = false;
            this.rightLeg.visible = false;
            return;
        }

        this.handGroup.visible = true;
        this.updateMovement(delta, collidables);
        this.updateCamera();

        // Realistic hand bobbing & Idle breathing
        const time = Date.now() * 0.005;
        const isMoving = this.direction.length() > 0.01;
        const speedMult = this.keys['ShiftLeft'] ? 1.5 : 1.0;

        // Heavy breathing when low HP
        const breathSpeed = (this.health < 30) ? 0.008 : 0.003;
        const breathM = Math.sin(Date.now() * breathSpeed) * (this.health < 30 ? 0.04 : 0.01);

        const bobAmountY = isMoving ? 0.08 * speedMult : 0.01 + breathM;
        const bobAmountX = isMoving ? 0.04 * speedMult : 0.005;
        const walkSpeed = isMoving ? time * speedMult : time;

        this.handGroup.position.y = Math.sin(walkSpeed) * bobAmountY;
        this.handGroup.position.x = Math.cos(walkSpeed * 0.5) * bobAmountX;

        // Smooth Torso Breathing Animation
        if (this.torsoMesh) {
            this.torsoMesh.position.y = 1.05 + breathM;
            this.torsoMesh.rotation.z = Math.cos(walkSpeed * 0.5) * (isMoving ? 0.05 : 0.002);
            // Smoothly lerp towards target lean instead of instantly snapping
            const targetLean = isMoving ? 0.15 : 0;
            this.torsoMesh.rotation.x = THREE.MathUtils.lerp(this.torsoMesh.rotation.x, targetLean, 0.1);
        }

        // Animated Head looking around slightly when idle
        if (this.headMesh && !isMoving) {
            this.headMesh.rotation.y = Math.sin(Date.now() * 0.001) * 0.1;
            this.headMesh.rotation.z = Math.cos(Date.now() * 0.0015) * 0.02;
            this.headMesh.position.y = 1.7 + breathM;
        } else if (this.headMesh) {
            this.headMesh.rotation.y = 0;
            this.headMesh.rotation.z = 0;
            this.headMesh.position.y = 1.7 + Math.sin(walkSpeed) * 0.03; // Bob head when walking
        }

        // Hide body in FPP
        this.torsoMesh.visible = (this.viewMode === 'TPP');
        this.headMesh.visible = (this.viewMode === 'TPP');
        this.leftLeg.visible = (this.viewMode === 'TPP');
        this.rightLeg.visible = (this.viewMode === 'TPP');

        // Leg walk animation
        if (isMoving) {
            const legTime = Date.now() * 0.01 * speedMult;
            const legSwing = Math.sin(legTime) * 0.6;
            this.leftLeg.position.z = legSwing * 0.25;
            this.leftLeg.rotation.x = -legSwing * 0.9;
            this.rightLeg.position.z = -legSwing * 0.25;
            this.rightLeg.rotation.x = legSwing * 0.9;

            // Dust particles when running
            if (speedMult > 1.0 && Math.random() < 0.2) {
                const event = new CustomEvent('player-run-dust', { detail: this.group.position });
                window.dispatchEvent(event);
            }
        } else {
            // Smooth return to idle
            this.leftLeg.position.z = THREE.MathUtils.lerp(this.leftLeg.position.z, 0, 0.1);
            this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, 0.1);
            this.rightLeg.position.z = THREE.MathUtils.lerp(this.rightLeg.position.z, 0, 0.1);
            this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, 0.1);
        }
    }

    updateMovement(delta, collidables) {
        const isSprinting = this.keys['ShiftLeft'];
        const targetSpeed = this.speed * (isSprinting ? this.sprintMultiplier : 1);

        const wishDir = new THREE.Vector3(0, 0, 0);
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.mouseRotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.mouseRotation.y, 0));

        if (this.keys['KeyW']) wishDir.add(forward);
        if (this.keys['KeyS']) wishDir.sub(forward);
        if (this.keys['KeyA']) wishDir.sub(right);
        if (this.keys['KeyD']) wishDir.add(right);

        if (wishDir.length() > 0) {
            wishDir.normalize();
            const accel = 0.8;
            this.velocity.x += wishDir.x * accel * delta * 60;
            this.velocity.z += wishDir.z * accel * delta * 60;
        }

        // Friction
        const friction = 0.15;
        this.velocity.x *= (1 - friction);
        this.velocity.z *= (1 - friction);

        // Cap speed
        const speedSq = this.velocity.x * this.velocity.x + this.velocity.z * this.velocity.z;
        if (speedSq > targetSpeed * targetSpeed) {
            const ratio = targetSpeed / Math.sqrt(speedSq);
            this.velocity.x *= ratio;
            this.velocity.z *= ratio;
        }

        // --- COLLISION LOGIC ---
        // Separate walls and floors
        const walls = [];
        const floors = [];
        collidables.forEach(c => {
            if (!c) return;
            if (c.userData && c.userData.type === 'wall') walls.push(c);
            if (c.userData && c.userData.type === 'floor') floors.push(c);
        });

        const playerRadius = 0.4;
        const playerHeight = 1.8;

        // 1. Horizontal Collision (Sliding)
        // Check X axis
        let nextPosX = this.group.position.clone();
        nextPosX.x += this.velocity.x;
        let xHit = false;
        let playerBoxX = new THREE.Box3().setFromCenterAndSize(
            nextPosX.clone().add(new THREE.Vector3(0, 1, 0)),
            new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2)
        );

        for (let wall of walls) {
            const wallBox = new THREE.Box3().setFromObject(wall);
            // Ignore floors if we are moving horizontally, we'll handle vertical snap later
            if (wall.userData.type === 'floor' && wallBox.max.y < this.group.position.y + 0.8) continue;

            if (playerBoxX.intersectsBox(wallBox)) {
                xHit = true;
                break;
            }
        }
        if (!xHit) {
            this.group.position.x = nextPosX.x;
        } else {
            this.velocity.x = 0;
        }

        // Check Z axis
        let nextPosZ = this.group.position.clone();
        nextPosZ.z += this.velocity.z;
        let zHit = false;
        let playerBoxZ = new THREE.Box3().setFromCenterAndSize(
            nextPosZ.clone().add(new THREE.Vector3(0, 1, 0)),
            new THREE.Vector3(playerRadius * 2, playerHeight, playerRadius * 2)
        );

        for (let wall of walls) {
            const wallBox = new THREE.Box3().setFromObject(wall);
            // Ignore floors if we are moving horizontally
            if (wall.userData.type === 'floor' && wallBox.max.y < this.group.position.y + 0.8) continue;

            if (playerBoxZ.intersectsBox(wallBox)) {
                zHit = true;
                break;
            }
        }
        if (!zHit) {
            this.group.position.z = nextPosZ.z;
        } else {
            this.velocity.z = 0;
        }

        // 2. Vertical Collision & Grounding
        this.group.rotation.y = this.mouseRotation.y;

        if (!this.isGrounded) this.velocity.y -= 0.008;
        else this.velocity.y = 0;

        if (this.keys['Space'] && this.isGrounded) {
            this.velocity.y = 0.16;
            this.isGrounded = false;
        }

        let nextY = this.group.position.y + this.velocity.y;
        let groundedOnObject = false;

        const feetPos = this.group.position.clone();
        feetPos.y = nextY;

        for (let floor of floors) {
            const floorBox = new THREE.Box3().setFromObject(floor);
            // Check if player's horizontal bounding box overlaps floor bounds
            const buffer = 0.6; // Wider buffer for stairs
            if (feetPos.x >= floorBox.min.x - buffer && feetPos.x <= floorBox.max.x + buffer &&
                feetPos.z >= floorBox.min.z - buffer && feetPos.z <= floorBox.max.z + buffer) {

                // If dropping into floor OR walking up onto it (step-up height 0.8)
                if (nextY <= floorBox.max.y + 0.15 && nextY >= floorBox.max.y - 0.8) {
                    // Check if the change is a step-up (don't snap if too far below)
                    nextY = floorBox.max.y;
                    groundedOnObject = true;
                    this.velocity.y = 0;
                    break;
                }
            }
        }

        if (nextY <= 0) {
            nextY = 0;
            this.isGrounded = true;
            this.velocity.y = 0;
        } else if (groundedOnObject) {
            this.isGrounded = true;
        } else {
            this.isGrounded = false;
        }

        this.group.position.y = nextY;
        this.direction.set(this.velocity.x, 0, this.velocity.z);
        this.updateFlashlight();
    }

    updateCamera() {
        // Heavy breathing camera effect
        const breathM = Math.sin(Date.now() * ((this.health < 30) ? 0.008 : 0.003)) * ((this.health < 30) ? 0.008 : 0.002);

        if (this.viewMode === 'FPP') {
            const targetPos = this.group.position.clone().add(new THREE.Vector3(0, 1.7 + breathM, 0));
            this.camera.position.lerp(targetPos, 0.4); // Smooth follow slightly
            this.camera.rotation.copy(this.mouseRotation);
            this.handGroup.position.set(0, 0, 0);
        } else {
            // Improved TPP: Tactical Over-the-shoulder
            const offset = new THREE.Vector3(0.6, 0.4, 3.0); // True tactical TPS shoulder view
            offset.applyEuler(new THREE.Euler(this.mouseRotation.x * 0.5, this.mouseRotation.y, 0));
            const target = this.group.position.clone().add(new THREE.Vector3(0, 1.6 + breathM, 0));
            this.camera.position.lerp(target.clone().add(offset), 0.15); // Smooth camera follow

            // Aiming interpolations
            this.camera.rotation.copy(this.mouseRotation);

            // Adjust hands for TPP so they don't look disconnected
            this.handGroup.position.set(0.3, -0.3, -0.2);
        }
    }

    toggleView(forceMode) {
        if (forceMode) this.viewMode = forceMode;
        else this.viewMode = this.viewMode === 'FPP' ? 'TPP' : 'FPP';
    }

    damageEffect() {
        const overlay = document.getElementById('damage-overlay');
        if (overlay) {
            overlay.style.opacity = '0.7';
            setTimeout(() => overlay.style.opacity = '0', 200);
        }
    }

    toggleFlashlight() {
        if (this.flashlight) this.flashlight.visible = !this.flashlight.visible;
    }

    takeDamage(amount) {
        audioSystem.playPlayerHit();
        this.damageEffect();
        this.health -= amount * (1 - (this.armor * 0.15));

        // Reactive Hit Animation
        if (this.torsoMesh) this.torsoMesh.rotation.x = -0.5; // recoil back abruptly
        if (this.headMesh) this.headMesh.rotation.x = -0.3;

        // Voice grunts logic
        if (Math.random() < 0.4) {
            // We can reuse audio logic or simulate grunt internally
            const grunt = new Audio((Math.random() > 0.5) ? '/sounds/zombieHit.mp3' : '/sounds/zombieHit.mp3'); // Simulating pain hit until custom recorded
            grunt.volume = 0.4;
            grunt.playbackRate = 1.3;
            grunt.play().catch(e => e);
        }

        return this.health <= 0;
    }

    updateFlashlight() {
        if (this.flashlight) {
            this.flashlight.position.copy(this.camera.position);
            const dir = new THREE.Vector3(0, 0, -1).applyEuler(this.mouseRotation);
            this.flashlight.target.position.copy(this.camera.position).add(dir.multiplyScalar(10));
        }
    }

    upgradeArmor() {
        if (this.armor < 4) { this.armor++; return true; }
        return false;
    }

    enterVehicle(vehicle) {
        this.isDriving = true;
        this.currentVehicle = vehicle;
        vehicle.isOccupied = true;
    }

    exitVehicle() {
        if (!this.currentVehicle) return;
        this.isDriving = false;
        // Step out safely to the side
        const exitOffset = new THREE.Vector3(-2, 0, 0).applyEuler(this.currentVehicle.mesh.rotation);
        this.group.position.add(exitOffset);
        this.currentVehicle.isOccupied = false;
        this.currentVehicle = null;
    }

    collectLoot(type, amount) {
        if (type === 'coins') this.coins += amount;
        else if (this.ammoReserves[type] !== undefined) this.ammoReserves[type] += amount;
        else this.inventory.push(type);
    }
}
