import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Soldier {
    constructor(scene, position) {
        this.scene = scene;
        this.health = 200;
        this.maxHealth = 200;
        this.isDead = false;

        this.group = new THREE.Group();
        this.group.position.copy(position);

        // Visuals (Soldier in Camo)
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.2, 0.4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3d4e3d }); // Camo Green
        this.mesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.mesh.position.y = 0.6;
        this.mesh.castShadow = true;
        this.group.add(this.mesh);

        // Helmet
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshStandardMaterial({ color: 0x1a241a });
        const head = new THREE.Mesh(headGeo, headMat);
        head.position.y = 1.4;
        this.group.add(head);

        // Gun Visual
        const gunGeo = new THREE.BoxGeometry(0.1, 0.1, 0.8);
        const gunMat = new THREE.MeshStandardMaterial({ color: 0x111111 });
        this.gun = new THREE.Mesh(gunGeo, gunMat);
        this.gun.position.set(0.3, 1.0, 0.4);
        this.group.add(this.gun);

        this.scene.add(this.group);

        // AI Logic
        this.target = null;
        this.fireTimer = 0;
        this.fireRate = 0.15; // Faster than player
    }

    update(delta, zombies, scene) {
        if (this.isDead) return;

        // Find closest zombie
        let closestDist = 25; // Detection range
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
            this.group.lookAt(this.target.mesh.position.x, this.group.position.y, this.target.mesh.position.z);

            // Fire
            this.fireTimer += delta;
            if (this.fireTimer >= this.fireRate) {
                this.fireTimer = 0;
                this.shoot(scene);
            }
        } else {
            // Idle rotation
            this.group.rotation.y += delta * 0.5;
        }
    }

    shoot(scene) {
        if (!this.target) return;

        audioSystem.playShootAK(); // Corrected method name

        // Muzzle Flash
        const flash = new THREE.PointLight(0xffaa00, 5, 2);
        flash.position.copy(this.group.position).add(new THREE.Vector3(0, 1, 1).applyEuler(this.group.rotation));
        scene.add(flash);
        setTimeout(() => scene.remove(flash), 50);

        // Damage target
        if (this.target && this.target.takeDamage) {
            this.target.takeDamage(25); // Elite damage
        }
    }

    takeDamage(amount) {
        this.health -= amount;
        if (this.health <= 0 && !this.isDead) {
            this.isDead = true;
            this.group.rotation.x = Math.PI / 2; // Fall over
            setTimeout(() => this.scene.remove(this.group), 5000);
        }
    }
}
