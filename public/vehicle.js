import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Vehicle {
    constructor(scene) {
        this.scene = scene;
        this.mesh = new THREE.Group();
        this.velocity = new THREE.Vector3();
        this.speed = 0;
        this.maxSpeed = 0.6;
        this.acceleration = 0.015;
        this.deceleration = 0.96;
        this.steering = 0;
        this.maxSteering = 0.05;
        this.keys = {};
        this.isOccupied = false;

        this.createModel();
        this.scene.add(this.mesh);

        this.mesh.position.set(15, 0, 15); // Spawn near house but outside fence
    }

    createModel() {
        // Chassis / Main Body (Armored SUV / Buggy look)
        const chassisGroup = new THREE.Group();
        this.mesh.add(chassisGroup);

        // Lower Hull
        const lowerHullGeo = new THREE.BoxGeometry(2.6, 0.8, 5.0);
        const hullMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9, metalness: 0.6 });
        const lowerHull = new THREE.Mesh(lowerHullGeo, hullMat);
        lowerHull.position.y = 0.8;
        lowerHull.castShadow = true;
        chassisGroup.add(lowerHull);

        // Upper Cabin
        const cabinGeo = new THREE.BoxGeometry(2.4, 1.2, 3.2);
        const cabinMat = new THREE.MeshStandardMaterial({ color: 0x3d433b, roughness: 0.8, metalness: 0.2 }); // military green
        const cabin = new THREE.Mesh(cabinGeo, cabinMat);
        cabin.position.set(0, 1.8, -0.4);
        cabin.castShadow = true;
        chassisGroup.add(cabin);

        // Armored Details / Bullbar
        const bullbarGeo = new THREE.CylinderGeometry(0.1, 0.1, 2.6, 8);
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 0.4, metalness: 0.8 });

        const barTop = new THREE.Mesh(bullbarGeo, metalMat);
        barTop.rotation.z = Math.PI / 2;
        barTop.position.set(0, 1.2, 2.6);
        chassisGroup.add(barTop);

        const barBottom = new THREE.Mesh(bullbarGeo, metalMat);
        barBottom.rotation.z = Math.PI / 2;
        barBottom.position.set(0, 0.6, 2.6);
        chassisGroup.add(barBottom);

        // Glass / Windows
        const windowMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9, transparent: true, opacity: 0.8 });

        const frontWindshieldGeo = new THREE.BoxGeometry(2.2, 0.9, 0.1);
        const frontWindshield = new THREE.Mesh(frontWindshieldGeo, windowMat);
        frontWindshield.position.set(0, 1.8, 1.2);
        frontWindshield.rotation.x = -Math.PI / 8; // Slanted
        chassisGroup.add(frontWindshield);

        const sideWindowGeo = new THREE.BoxGeometry(0.1, 0.9, 2.8);
        const leftWindow = new THREE.Mesh(sideWindowGeo, windowMat);
        leftWindow.position.set(-1.18, 1.8, -0.4);
        const rightWindow = new THREE.Mesh(sideWindowGeo, windowMat);
        rightWindow.position.set(1.18, 1.8, -0.4);
        chassisGroup.add(leftWindow, rightWindow);

        // Large Off-road Wheels
        const wheelGeo = new THREE.CylinderGeometry(0.65, 0.65, 0.6, 16);
        const tireMat = new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 });
        const rimMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.8, roughness: 0.2 });
        this.wheels = [];

        const positions = [
            [-1.4, 0.65, 1.8], [1.4, 0.65, 1.8],   // Front
            [-1.4, 0.65, -1.8], [1.4, 0.65, -1.8]  // Back
        ];

        positions.forEach(p => {
            const wheelGroup = new THREE.Group();
            wheelGroup.position.set(p[0], p[1], p[2]);

            const tire = new THREE.Mesh(wheelGeo, tireMat);
            tire.rotation.z = Math.PI / 2;
            tire.castShadow = true;
            wheelGroup.add(tire);

            // Hubcap/Rim
            const rimGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.62, 8);
            const rim = new THREE.Mesh(rimGeo, rimMat);
            rim.rotation.z = Math.PI / 2;
            wheelGroup.add(rim);

            this.mesh.add(wheelGroup);
            this.wheels.push(wheelGroup);
        });

        // Headlights (Realistic)
        const headlightGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.1, 16);
        const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffee, emissiveIntensity: 2 });

        const lLight = new THREE.Mesh(headlightGeo, headlightMat);
        lLight.rotation.x = Math.PI / 2;
        lLight.position.set(-0.8, 1.0, 2.5);

        const rLight = new THREE.Mesh(headlightGeo, headlightMat);
        rLight.rotation.x = Math.PI / 2;
        rLight.position.set(0.8, 1.0, 2.5);

        chassisGroup.add(lLight, rLight);

        // Spotlights array on top
        for (let i = 0; i < 4; i++) {
            const spotLight = new THREE.Mesh(headlightGeo, headlightMat);
            spotLight.rotation.x = Math.PI / 2;
            spotLight.position.set(-0.9 + (i * 0.6), 2.45, 1.1);
            chassisGroup.add(spotLight);
        }
    }

    update(delta, player) {
        if (!this.isOccupied) {
            this.speed *= this.deceleration;
            this.applyMovement();
            audioSystem.updateEngineSpeed(0, false);
            return;
        }

        // Controls while driving
        if (player.keys['KeyW']) this.speed += this.acceleration;
        if (player.keys['KeyS']) this.speed -= this.acceleration;

        // Steering
        if (player.keys['KeyA']) this.steering = THREE.MathUtils.lerp(this.steering, this.maxSteering, 0.1);
        else if (player.keys['KeyD']) this.steering = THREE.MathUtils.lerp(this.steering, -this.maxSteering, 0.1);
        else this.steering = THREE.MathUtils.lerp(this.steering, 0, 0.1);

        // Limit speed
        this.speed = Math.max(-this.maxSpeed * 0.5, Math.min(this.maxSpeed, this.speed));

        // Apply friction
        if (!player.keys['KeyW'] && !player.keys['KeyS']) {
            this.speed *= this.deceleration;
        }

        // Rotate vehicle based on speed and steering
        if (Math.abs(this.speed) > 0.01) {
            this.mesh.rotation.y += this.steering * (this.speed / this.maxSpeed);
        }

        this.applyMovement();

        // Animate wheels
        this.wheels.forEach(w => {
            w.rotation.x += this.speed;
        });

        audioSystem.updateEngineSpeed(Math.abs(this.speed) / this.maxSpeed, this.isOccupied);
    }

    applyMovement() {
        const direction = new THREE.Vector3(0, 0, 1).applyEuler(this.mesh.rotation);
        this.mesh.position.add(direction.multiplyScalar(this.speed));
    }

    checkCollisions(zombies) {
        if (Math.abs(this.speed) < 0.1) return; // Need some speed for roadkill

        zombies.forEach(z => {
            if (!z.isDead) {
                const dist = this.mesh.position.distanceTo(z.mesh.position);
                if (dist < 3.0) {
                    const impactVel = new THREE.Vector3(0, 0, this.speed).applyEuler(this.mesh.rotation);
                    z.takeRoadkill(impactVel);
                }
            }
        });
    }

    getSeatPosition() {
        return this.mesh.position.clone().add(new THREE.Vector3(0, 1.2, 0));
    }
}
