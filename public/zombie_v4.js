import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class Zombie {
    constructor(scene) {
        this.scene = scene;
        this.health = 75;
        this.maxHealth = 75;
        this.speed = 0.04;
        this.damage = 10;
        this.isDead = false;
        this.isBoss = false;
        this.type = 'normal'; // normal, runner, tank, spitter, crawler, boss

        this.mesh = new THREE.Group();
        this.createModel();

        this.attackCooldown = 0;
        this.attackRange = 1.5;
        this.velocity = new THREE.Vector3();
    }

    createModel() {
        // High quality PBR Zombie Model
        const bodyMat = new THREE.MeshStandardMaterial({
            color: 0x4a5d23,
            roughness: 0.8,
            metalness: 0.1,
            emissive: 0x000000
        });

        const skinMat = new THREE.MeshStandardMaterial({
            color: 0x6b8e23,
            roughness: 0.9,
            metalness: 0.0
        });

        // Torso
        const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), bodyMat);
        torso.position.y = 1.35;
        torso.castShadow = true;
        this.mesh.add(torso);

        // Head
        const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.35, 0.35), skinMat);
        head.position.y = 2.0;
        head.castShadow = true;
        this.mesh.add(head);
        this.head = head;

        // Glowing Eyes
        const eyeGeo = new THREE.SphereGeometry(0.04, 4, 4);
        const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const lEye = new THREE.Mesh(eyeGeo, eyeMat);
        lEye.position.set(-0.1, 2.05, 0.18);
        const rEye = new THREE.Mesh(eyeGeo, eyeMat);
        rEye.position.set(0.1, 2.05, 0.18);
        this.mesh.add(lEye, rEye);

        // Arms (Jointed for animation)
        const armGeo = new THREE.BoxGeometry(0.15, 0.4, 0.15);

        this.lArm = new THREE.Group();
        const lUpperArm = new THREE.Mesh(armGeo, bodyMat);
        lUpperArm.position.y = -0.2;
        this.lArm.add(lUpperArm);
        this.lArm.position.set(-0.35, 1.7, 0);
        this.mesh.add(this.lArm);

        this.rArm = new THREE.Group();
        const rUpperArm = new THREE.Mesh(armGeo, bodyMat);
        rUpperArm.position.y = -0.2;
        this.rArm.add(rUpperArm);
        this.rArm.position.set(0.35, 1.7, 0);
        this.mesh.add(this.rArm);

        // Legs
        const legGeo = new THREE.BoxGeometry(0.2, 0.45, 0.2);
        this.lLeg = new THREE.Group();
        const lUpperLeg = new THREE.Mesh(legGeo, bodyMat);
        lUpperLeg.position.y = -0.22;
        this.lLeg.add(lUpperLeg);
        this.lLeg.position.set(-0.18, 0.9, 0);
        this.mesh.add(this.lLeg);

        this.rLeg = new THREE.Group();
        const rUpperLeg = new THREE.Mesh(legGeo, bodyMat);
        rUpperLeg.position.y = -0.22;
        this.rLeg.add(rUpperLeg);
        this.rLeg.position.set(0.18, 0.9, 0);
        this.mesh.add(this.rLeg);

        this.scene.add(this.mesh);
    }

    setType(type, wave) {
        this.type = type;
        const scaleFac = {
            'normal': 1.0,
            'runner': 0.85,
            'tank': 1.4,
            'spitter': 1.0,
            'crawler': 0.6,
            'boss': 3.5
        }[type] || 1.0;

        this.mesh.scale.set(scaleFac, scaleFac, scaleFac);

        // Adjust Health/Speed/Damage
        const waveMult = 1 + (wave * 0.15);
        if (type === 'runner') {
            this.health = 40 * waveMult;
            this.speed = 0.08;
            this.damage = 5;
            this.mesh.traverse(obj => { if (obj.isMesh) obj.material.color.setHex(0xbc8f8f); });
        } else if (type === 'tank') {
            this.health = 300 * waveMult;
            this.speed = 0.025;
            this.damage = 25;
            this.mesh.traverse(obj => { if (obj.isMesh) obj.material.color.setHex(0x483d8b); });
        } else if (type === 'spitter') {
            this.health = 60 * waveMult;
            this.speed = 0.045;
            this.damage = 15;
            this.mesh.traverse(obj => { if (obj.isMesh) obj.material.color.setHex(0x32cd32); });
        } else if (type === 'crawler') {
            this.health = 50 * waveMult;
            this.speed = 0.035;
            this.damage = 10;
            this.mesh.position.y -= 0.5;
        } else if (type === 'boss') {
            this.isBoss = true;
            this.health = 2000 * waveMult;
            this.speed = 0.03;
            this.damage = 40;
            this.mesh.traverse(obj => { if (obj.isMesh) obj.material.color.setHex(0x8b0000); });
        }
        this.maxHealth = this.health;
    }

    spawn(x, z, wave = 1) {
        this.mesh.position.set(x, 0, z);
        this.isDead = false;
        this.mesh.visible = true;

        // Randomize type
        const rand = Math.random();
        if (wave >= 10 && rand < 0.05) this.setType('tank', wave);
        else if (wave >= 5 && rand < 0.15) this.setType('runner', wave);
        else if (wave >= 8 && rand < 0.25) this.setType('spitter', wave);
        else this.setType('normal', wave);
    }

    takeDamage(amount, hitInfo = null) {
        if (this.isDead) return;
        this.health -= amount;

        // Stagger animation
        this.mesh.position.y += 0.05;
        setTimeout(() => { if (!this.isDead) this.mesh.position.y = 0; }, 100);

        if (this.health <= 0) {
            this.die();
        }

        this.showHitEffect(hitInfo);
    }

    showHitEffect(hitInfo) {
        // Blood particles
        const count = 8;
        const color = this.type === 'spitter' ? 0x00ff00 : 0xaa0000;
        const particleGeo = new THREE.BoxGeometry(0.05, 0.05, 0.05);
        const particleMat = new THREE.MeshBasicMaterial({ color: color });

        for (let i = 0; i < count; i++) {
            const p = new THREE.Mesh(particleGeo, particleMat);
            p.position.copy(this.mesh.position);
            p.position.y += 1.5;
            this.scene.add(p);

            const vel = new THREE.Vector3(
                (Math.random() - 0.5) * 0.2,
                Math.random() * 0.2,
                (Math.random() - 0.5) * 0.2
            );

            const animate = () => {
                p.position.add(vel);
                vel.y -= 0.01;
                p.scale.multiplyScalar(0.95);
                if (p.scale.x < 0.01) {
                    this.scene.remove(p);
                    particleGeo.dispose();
                    particleMat.dispose();
                } else {
                    requestAnimationFrame(animate);
                }
            };
            animate();
        }
    }

    die() {
        this.isDead = true;
        this.mesh.rotation.x = Math.PI / 2;
        this.mesh.position.y = 0.1;

        // Remove after some time
        setTimeout(() => {
            this.mesh.visible = false;
        }, 5000);

        audioSystem.play('zombie_death', this.mesh.position);
    }

    update(delta, player, house, fence, onAttack) {
        if (this.isDead) return;

        // Pathfinding: Simple Nav toward player or house
        const targetPos = player.group.position.clone();
        const distToPlayer = this.mesh.position.distanceTo(targetPos);

        // Determine target
        let actualTarget = targetPos;
        let dist = distToPlayer;

        // Check if fence or house is closer/in range
        if (fence && fence.health > 0) {
            const distToFence = this.mesh.position.length(); // Assuming fence is around 0,0
            if (distToFence < 40 && distToFence < distToPlayer) {
                actualTarget = new THREE.Vector3(0, 0, 0); // Simplified
                dist = distToFence;
            }
        }

        // Rotate toward target
        const angle = Math.atan2(actualTarget.x - this.mesh.position.x, actualTarget.z - this.mesh.position.z);
        this.mesh.rotation.y = angle;

        // Move
        const velocity = new THREE.Vector3(
            Math.sin(angle) * this.speed,
            0,
            Math.cos(angle) * this.speed
        );
        this.mesh.position.add(velocity);

        // Simple Obstacle Avoidance (Raycast)
        // TODO: NavMesh transition

        // Attack
        if (dist < this.attackRange && this.attackCooldown <= 0) {
            onAttack(this.damage);
            this.attackCooldown = 1.5; // seconds
            this.playAttackAnim();
        }

        if (this.attackCooldown > 0) {
            this.attackCooldown -= delta;
        }

        // Animations
        const time = performance.now() * 0.005;
        this.lArm.rotation.x = Math.sin(time) * 0.5 - 1.0;
        this.rArm.rotation.x = Math.cos(time) * 0.5 - 1.0;

        this.lLeg.rotation.x = Math.sin(time * 2) * 0.4;
        this.rLeg.rotation.x = -Math.sin(time * 2) * 0.4;
    }

    playAttackAnim() {
        this.lArm.rotation.x = -2.5;
        this.rArm.rotation.x = -2.5;
        setTimeout(() => {
            if (!this.isDead) {
                this.lArm.rotation.x = -1.0;
                this.rArm.rotation.x = -1.0;
            }
        }, 300);
    }
}

export class ZombieManager {
    constructor(scene) {
        this.scene = scene;
        this.zombies = [];
        this.poolSize = 50;
        this.initPool();
    }

    initPool() {
        for (let i = 0; i < this.poolSize; i++) {
            const z = new Zombie(this.scene);
            z.mesh.visible = false;
            z.isDead = true;
            this.zombies.push(z);
        }
    }

    spawnZombie(wave) {
        const inactive = this.zombies.find(z => z.isDead);
        if (inactive) {
            const radius = 60 + Math.random() * 20;
            const angle = Math.random() * Math.PI * 2;
            inactive.spawn(Math.cos(angle) * radius, Math.sin(angle) * radius, wave);
        }
    }

    update(delta, player, house, fence, onAttack) {
        this.zombies.forEach(z => {
            if (!z.isDead && z.mesh.visible) {
                z.update(delta, player, house, fence, onAttack);
            }
        });
    }
}
