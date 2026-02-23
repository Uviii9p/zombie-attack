import * as THREE from 'three';

export class Player {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.health = 100;
        this.maxHealth = 100;
        this.coins = 0;
        this.armor = 0;

        // Inventory system
        this.inventory = [];
        this.ammoReserves = {
            'AK47': 90,
            'Sniper': 15,
            'RPG': 3
        };

        // Player Model
        this.group = new THREE.Group();

        // Body
        const bodyGeo = new THREE.BoxGeometry(0.6, 1.8, 0.4);
        const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50 });
        this.bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        this.bodyMesh.position.y = 0.9;
        this.bodyMesh.castShadow = true;
        this.group.add(this.bodyMesh);

        // Head (for TPP)
        const headGeo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
        const headMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 });
        this.headMesh = new THREE.Mesh(headGeo, headMat);
        this.headMesh.position.y = 2.0;
        this.group.add(this.headMesh);

        this.scene.add(this.group);

        // Movement & View (Initialize BEFORE respawn)
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();
        this.speed = 0.12;
        this.sprintMultiplier = 1.7;
        this.isGrounded = true;
        this.viewMode = 'TPP'; // 'FPP' or 'TPP'

        this.respawn();

        // Hands & Gun
        this.handGroup = new THREE.Group();
        const handGeo = new THREE.BoxGeometry(0.1, 0.1, 0.3);
        const handMat = new THREE.MeshStandardMaterial({ color: 0xecf0f1 });
        this.leftHand = new THREE.Mesh(handGeo, handMat);
        this.leftHand.position.set(-0.3, -0.2, -0.4);
        this.rightHand = new THREE.Mesh(handGeo, handMat);
        this.rightHand.position.set(0.3, -0.2, -0.4);
        this.handGroup.add(this.leftHand, this.rightHand);

        this.gunMesh = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.15, 0.7), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        this.gunMesh.position.set(0.3, -0.15, -0.6);
        this.handGroup.add(this.gunMesh);

        this.camera.add(this.handGroup);
        this.scene.add(this.camera);

        this.keys = {};
        window.addEventListener('keydown', (e) => this.keys[e.code] = true);
        window.addEventListener('keyup', (e) => this.keys[e.code] = false);

        this.mouseRotation = new THREE.Euler(0, 0, 0, 'YXZ');
        window.addEventListener('mousemove', (e) => {
            if (document.pointerLockElement === document.body) {
                this.mouseRotation.y -= e.movementX * 0.002;
                this.mouseRotation.x -= e.movementY * 0.002;
                this.mouseRotation.x = Math.max(-1.2, Math.min(1.2, this.mouseRotation.x));
            }
        });
    }

    respawn() {
        // Inside fence (fence radius ~12)
        this.group.position.set(5, 0, 5);
        this.health = 100;
        this.velocity.set(0, 0, 0);
    }

    update(delta, collidables) {
        this.updateMovement(delta, collidables);
        this.updateCamera();

        // Anim hands
        const time = Date.now() * 0.005;
        this.handGroup.position.y = Math.sin(time) * 0.01;
        if (this.direction.length() > 0) {
            this.handGroup.position.y += Math.sin(time * 2) * 0.03;
            this.handGroup.position.x = Math.cos(time) * 0.02;
        }

        // Hide body in FPP
        this.bodyMesh.visible = (this.viewMode === 'TPP');
        this.headMesh.visible = (this.viewMode === 'TPP');
    }

    updateMovement(delta, collidables) {
        const moveSpeed = this.speed * (this.keys['ShiftLeft'] ? this.sprintMultiplier : 1);
        this.direction.set(0, 0, 0);

        // Movement relative to world axes but facing mouse rotation
        const forward = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(0, this.mouseRotation.y, 0));
        const right = new THREE.Vector3(1, 0, 0).applyEuler(new THREE.Euler(0, this.mouseRotation.y, 0));

        if (this.keys['KeyW']) this.direction.add(forward);
        if (this.keys['KeyS']) this.direction.sub(forward);
        if (this.keys['KeyA']) this.direction.sub(right);
        if (this.keys['KeyD']) this.direction.add(right);

        if (this.direction.length() > 0) {
            this.direction.normalize();
            const newPos = this.group.position.clone().add(this.direction.clone().multiplyScalar(moveSpeed));

            let collision = false;
            for (let obj of collidables) {
                if (obj && obj.position) {
                    const dist = new THREE.Vector2(newPos.x - obj.position.x, newPos.z - obj.position.z).length();
                    if (dist < 3.5) { collision = true; break; }
                }
            }
            if (!collision) {
                this.group.position.copy(newPos);
            }
        }

        this.group.rotation.y = this.mouseRotation.y;

        if (!this.isGrounded) this.velocity.y -= 0.01;
        else this.velocity.y = 0;

        if (this.keys['Space'] && this.isGrounded) {
            this.velocity.y = 0.15;
            this.isGrounded = false;
        }

        this.group.position.y += this.velocity.y;
        if (this.group.position.y <= 0) {
            this.group.position.y = 0;
            this.isGrounded = true;
        }
    }

    updateCamera() {
        if (this.viewMode === 'FPP') {
            this.camera.position.copy(this.group.position).add(new THREE.Vector3(0, 1.7, 0));
            this.camera.rotation.copy(this.mouseRotation);
            this.handGroup.position.set(0, 0, 0);
        } else {
            const offset = new THREE.Vector3(1.2, 0.5, 4);
            offset.applyEuler(this.mouseRotation);
            const target = this.group.position.clone().add(new THREE.Vector3(0, 1.8, 0));
            this.camera.position.lerp(target.clone().add(offset), 0.15);
            this.camera.rotation.copy(this.mouseRotation);
            this.handGroup.position.set(0.2, -0.1, -0.5);
        }
    }

    toggleView() {
        this.viewMode = this.viewMode === 'FPP' ? 'TPP' : 'FPP';
    }

    takeDamage(amount) {
        this.health -= amount * (1 - (this.armor * 0.15));
        return this.health <= 0;
    }

    upgradeArmor() {
        if (this.armor < 4) { this.armor++; return true; }
        return false;
    }

    collectLoot(type, amount) {
        if (type === 'coins') this.coins += amount;
        else if (this.ammoReserves[type] !== undefined) this.ammoReserves[type] += amount;
        else this.inventory.push(type);
    }
}
