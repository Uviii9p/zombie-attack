import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.group = new THREE.Group();
        this.scene.add(this.group);

        // Stats
        this.health = 100;
        this.maxHealth = 100;
        this.coins = 500; // Starting money
        this.xp = 0;
        this.level = 1;
        this.skillPoints = 0;

        // Movement
        this.velocity = new THREE.Vector3();
        this.moveSpeed = 0.15;
        this.runSpeed = 0.25;
        this.isGrounded = true;

        // Combat
        this.weapons = {
            'AK47': { ammo: 30, maxAmmo: 30, reserve: 90, damage: 25, fireRate: 150, recoil: 0.05, adsFov: 45 },
            'Sniper': { ammo: 5, maxAmmo: 5, reserve: 20, damage: 150, fireRate: 1500, recoil: 0.2, adsFov: 20 },
            'RPG': { ammo: 1, maxAmmo: 1, reserve: 3, damage: 500, fireRate: 2000, recoil: 0.3, adsFov: 60 }
        };
        this.currentWeapon = 'AK47';
        this.lastFireTime = 0;
        this.isADS = false;

        this.inventory = ['AK47'];

        this.createModel();

        // Camera state
        this.pitch = new THREE.Group();
        this.group.add(this.pitch);
        this.pitch.add(this.camera);
        this.camera.position.set(0, 1.7, 0); // FPP default

        this.viewMode = 'TPP';
        this.tppOffset = new THREE.Vector3(0.5, 2.0, 4.0);
    }

    createModel() {
        const mat = new THREE.MeshStandardMaterial({ color: 0x334455 });
        this.mesh = new THREE.Group();

        const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1, 0.4), mat);
        body.position.y = 1.2;
        body.castShadow = true;
        this.mesh.add(body);

        const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.3), new THREE.MeshStandardMaterial({ color: 0xffdbac }));
        head.position.y = 1.85;
        this.mesh.add(head);

        this.group.add(this.mesh);

        // Weapon model
        this.weaponModel = new THREE.Group();
        this.weaponModel.position.set(0.3, 1.5, 0.4);
        this.mesh.add(this.weaponModel);
        this.updateWeaponModel();
    }

    updateWeaponModel() {
        this.weaponModel.clear();
        const w = this.weapons[this.currentWeapon];
        const g = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.6), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        this.weaponModel.add(g);
    }

    update(delta, input, collidables) {
        this.updateMovement(delta, input, collidables);
        this.updateCamera(delta);

        if (input.mouse.down) this.fire();
        this.isADS = !!input.keys['KeyV'];
    }

    updateMovement(delta, input, collidables) {
        const speed = input.keys['ShiftLeft'] ? this.runSpeed : this.moveSpeed;
        const dir = new THREE.Vector3();

        if (input.keys['KeyW']) dir.z -= 1;
        if (input.keys['KeyS']) dir.z += 1;
        if (input.keys['KeyA']) dir.x -= 1;
        if (input.keys['KeyD']) dir.x += 1;

        if (dir.length() > 0) {
            dir.normalize().applyQuaternion(this.group.quaternion);
            this.group.position.add(dir.multiplyScalar(speed));

            // Simple animation
            const t = performance.now() * 0.01;
            this.mesh.position.y = 0.1 * Math.abs(Math.sin(t));
        } else {
            this.mesh.position.y = 0;
        }

        if (input.keys['Space'] && this.isGrounded) {
            this.velocity.y = 0.2;
            this.isGrounded = false;
        }

        if (!this.isGrounded) {
            this.velocity.y -= 0.01;
            this.group.position.y += this.velocity.y;
            if (this.group.position.y <= 0) {
                this.group.position.y = 0;
                this.isGrounded = true;
            }
        }
    }

    updateCamera(delta) {
        if (this.viewMode === 'TPP') {
            const horizontalDist = 4.0;
            const verticalDist = 2.0;
            const sideOffset = 0.5;

            const tppPos = new THREE.Vector3(sideOffset, verticalDist, horizontalDist);
            tppPos.applyQuaternion(this.group.quaternion);
            const targetPos = this.group.position.clone().add(tppPos);

            this.camera.position.lerp(targetPos, 0.1);
            this.camera.lookAt(this.group.position.clone().add(new THREE.Vector3(0, 1.5, 0)));
        } else {
            // First Person: Reset camera to head position (inside pitch group)
            this.camera.position.set(0, 1.7, 0);
            this.camera.rotation.set(0, 0, 0);
        }

        if (this.isADS) {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, this.weapons[this.currentWeapon].adsFov, 0.2);
        } else {
            this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, 75, 0.1);
        }
        this.camera.updateProjectionMatrix();
    }

    fire() {
        const now = performance.now();
        const w = this.weapons[this.currentWeapon];
        if (now - this.lastFireTime < w.fireRate) return;
        if (w.ammo <= 0) {
            audioSystem.play('empty_click');
            return;
        }

        this.lastFireTime = now;
        w.ammo--;

        audioSystem.play('shoot_' + this.currentWeapon.toLowerCase(), this.group.position);

        // Recoil effect
        this.camera.position.y += w.recoil;

        // Raycast logic handled by Game
        return true;
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0) this.die();
        audioSystem.play('player_hurt');
    }

    die() {
        console.log("Player died");
        this.health = 0;
        // Ragdoll simulated by rotating mesh
        this.mesh.rotation.x = Math.PI / 2;
        this.mesh.position.y = 0.2;
    }

    updateWeaponModel() {
        if (!this.gun) return;
        // Simple visual differentiation for weapons
        switch (this.currentWeapon) {
            case 'Sniper':
                this.gun.scale.set(0.1, 0.1, 1.2);
                this.gun.material.color.setHex(0x333333);
                break;
            case 'RPG':
                this.gun.scale.set(0.25, 0.25, 0.8);
                this.gun.material.color.setHex(0x27ae60);
                break;
            case 'Grenade':
                this.gun.scale.set(0.3, 0.3, 0.3);
                this.gun.material.color.setHex(0x2c3e50);
                break;
            default: // AK47
                this.gun.scale.set(0.08, 0.08, 0.6);
                this.gun.material.color.setHex(0x1a1a1a);
        }
    }

    addXP(amount) {
        this.xp += amount;
        const xpToNext = this.level * 1000;
        if (this.xp >= xpToNext) {
            this.xp -= xpToNext;
            this.level++;
            this.skillPoints += 2;
            audioSystem.play('level_up');
        }
    }
}
