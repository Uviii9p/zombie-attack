import * as THREE from 'three';
import { audioSystem } from './audio.js';

export class WeaponSystem {
    constructor(scene, camera) {
        this.scene = scene;
        this.camera = camera;
        this.weapons = {
            'AK47': {
                damage: 25,
                fireRate: 0.12,
                ammo: 30,
                maxAmmo: 30,
                reserve: 90,
                reloadTime: 1.0,
                range: 120,
                automatic: true,
                type: 'bullet',
                recoil: 0.05,
                muzzleIntensity: 2
            },
            'Sniper': {
                damage: 151,
                fireRate: 1.2,
                ammo: 5,
                maxAmmo: 5,
                reserve: 15,
                reloadTime: 1.0,
                range: 350,
                automatic: false,
                type: 'bullet',
                recoil: 0.2,
                muzzleIntensity: 5
            },
            'RPG': {
                damage: 300,
                fireRate: 2.2,
                ammo: 1,
                maxAmmo: 1,
                reserve: 3,
                reloadTime: 1.0,
                range: 150,
                automatic: false,
                type: 'explosive',
                recoil: 0.5,
                muzzleIntensity: 10
            },
            'Grenade': {
                damage: 250,
                fireRate: 1.5,
                ammo: 1,
                maxAmmo: 1,
                reserve: 5,
                reloadTime: 1.0,
                range: 30, // Throwing range
                automatic: false,
                type: 'throwable',
                recoil: 0.0,
                muzzleIntensity: 0
            }
        };

        this.currentWeaponKey = 'AK47';
        this.lastFireTime = 0;
        this.isReloading = false;

        // Realistic muzzle flash (Point Light + Mesh)
        this.muzzleLight = new THREE.PointLight(0xffaa00, 2, 5);
        this.muzzleLight.visible = false;
        this.scene.add(this.muzzleLight);

        this.muzzleFlash = new THREE.Group();
        this.scene.add(this.muzzleFlash);

        this.shells = [];
        this.shellGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.05, 8);
        this.shellMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.9, roughness: 0.2 });

        this.explosions = [];
        this.explosionGeo = new THREE.SphereGeometry(3, 16, 16);
        this.projectiles = [];
        this.projectilePool = [];
        this.tracers = [];
        this.grenadeGeo = new THREE.SphereGeometry(0.15, 8, 8);
        this.grenadeMat = new THREE.MeshStandardMaterial({ color: 0x223322, roughness: 0.8 });
    }

    update(delta, zombies, onHit, onHitAny) {
        for (let i = this.explosions.length - 1; i >= 0; i--) {
            const exp = this.explosions[i];
            exp.scale += 0.3 * (delta * 60);
            exp.mesh.scale.set(exp.scale, exp.scale, exp.scale);
            exp.mesh.material.opacity -= 0.1 * (delta * 60);
            if (exp.mesh.material.opacity <= 0) {
                this.scene.remove(exp.mesh);
                exp.mesh.material.dispose();
                this.explosions.splice(i, 1);
            }
        }

        for (let i = this.projectiles.length - 1; i >= 0; i--) {
            const p = this.projectiles[i];
            p.mesh.position.add(p.velocity.clone().multiplyScalar(delta));
            p.velocity.y -= 25.0 * delta; // gravity

            // basic bounce
            if (p.mesh.position.y <= 0.2) {
                p.mesh.position.y = 0.2;
                p.velocity.y *= -0.5;
                p.velocity.x *= 0.5;
                p.velocity.z *= 0.5;
            }

            p.life -= delta;
            if (p.life <= 0) {
                this.createExplosion(p.mesh.position);
                if (zombies && onHit) {
                    let hitAnything = false;
                    zombies.forEach(z => {
                        const dist = z.mesh.position.distanceTo(p.mesh.position);
                        if (dist < 15) {
                            onHit(z, p.weapon.damage * (1 - dist / 15), { isHeadshot: false, knockback: p.velocity, point: p.mesh.position.clone() });
                            hitAnything = true;
                        }
                    });
                    if (hitAnything && onHitAny) onHitAny();
                }

                this.scene.remove(p.mesh);
                p.mesh.visible = false;
                this.projectilePool.push(p.mesh);
                this.projectiles.splice(i, 1);
            }
        }

        for (let i = this.tracers.length - 1; i >= 0; i--) {
            const t = this.tracers[i];
            t.life -= delta * 5;
            t.line.material.opacity = Math.max(0, t.life);
            if (t.life <= 0) {
                this.scene.remove(t.line);
                if (t.line.geometry) t.line.geometry.dispose();
                if (t.line.material) t.line.material.dispose();
                this.tracers.splice(i, 1);
            }
        }
    }

    get currentWeapon() {
        return this.weapons[this.currentWeaponKey];
    }

    switchWeapon(key) {
        if (this.weapons[key] && !this.isReloading) {
            this.currentWeaponKey = key;
            return true;
        }
        return false;
    }

    canFire() {
        if (this.isReloading) return false;
        const weapon = this.currentWeapon;
        if (weapon.ammo <= 0) {
            // Throttled empty click (max once per 0.5s)
            const now = performance.now() / 1000;
            if (!this._lastEmptyClick || now - this._lastEmptyClick > 0.5) {
                audioSystem.playClick();
                this._lastEmptyClick = now;
            }
            return false;
        }

        const now = performance.now() / 1000;
        if (now - this.lastFireTime < weapon.fireRate) return false;

        return true;
    }

    fire(zombies, onHit, onHitAny) {
        if (!this.canFire()) return null;

        const weapon = this.currentWeapon;
        weapon.ammo--;
        this.lastFireTime = performance.now() / 1000;

        // Broadcast shot to multiplayer lobby
        if (window.multiplayer) window.multiplayer.sendShoot(this.currentWeaponKey, this.camera);

        if (this.currentWeaponKey === 'AK47') audioSystem.playShootAK();
        else if (this.currentWeaponKey === 'Sniper') audioSystem.playShootSniper();
        else if (this.currentWeaponKey === 'RPG') audioSystem.playShootRPG();

        // Position muzzle flash at gun tip (offset from camera)
        const direction = new THREE.Vector3();
        this.camera.getWorldDirection(direction);

        const flashPos = this.camera.position.clone()
            .add(direction.clone().multiplyScalar(1.2))
            .add(new THREE.Vector3(0.3, -0.2, 0).applyQuaternion(this.camera.quaternion));

        this.muzzleFlash.position.copy(flashPos);
        this.muzzleLight.position.copy(flashPos);
        this.muzzleLight.intensity = weapon.muzzleIntensity;
        this.muzzleFlash.visible = true;
        this.muzzleLight.visible = true;

        setTimeout(() => {
            this.muzzleFlash.visible = false;
            this.muzzleLight.visible = false;
        }, 50);

        // Shell Ejection
        if (this.currentWeaponKey !== 'RPG' && this.currentWeaponKey !== 'Grenade') {
            this.ejectShell(flashPos, direction);
        }

        // AAA Camera Recoil
        if (this.camera) {
            this.camera.rotation.x += (Math.random() + 0.5) * weapon.recoil;
            this.camera.rotation.y += (Math.random() - 0.5) * weapon.recoil * 0.5;
        }

        const tracerEnd = flashPos.clone().add(direction.clone().multiplyScalar(Math.min(weapon.range || 80, 70)));
        this.spawnTracer(flashPos, tracerEnd, this.currentWeaponKey === 'Sniper' ? 0xfff4aa : 0xffaa55);

        if (weapon.type === 'throwable') {
            const grenade = this.projectilePool.pop() || new THREE.Mesh(this.grenadeGeo, this.grenadeMat);
            grenade.visible = true;

            grenade.position.copy(this.camera.position).add(direction.clone().multiplyScalar(1.5));

            const velocity = direction.clone().multiplyScalar(25);
            velocity.y += 6;

            this.scene.add(grenade);
            this.projectiles.push({
                mesh: grenade,
                velocity: velocity,
                life: 2.0,
                weapon: weapon
            });
            return weapon;
        }

        // Raycasting for bullet hit detection
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

        if (weapon.type === 'explosive') {
            const intersects = raycaster.intersectObjects(this.scene.children, true);
            if (intersects.length > 0) {
                const hitPoint = intersects[0].point;
                this.createExplosion(hitPoint);
                let hitAnything = false;
                zombies.forEach(z => {
                    const dist = z.mesh.position.distanceTo(hitPoint);
                    if (dist < 10) {
                        onHit(z, weapon.damage * (1 - dist / 10), { isHeadshot: false, knockback: direction, point: hitPoint });
                        hitAnything = true;
                    }
                });
                if (hitAnything && onHitAny) onHitAny();
            }
        } else {
            // Precise hit detection for children meshes
            const zombieMeshes = [];
            const zombieMap = new Map();
            zombies.forEach(z => {
                z.mesh.traverse(child => {
                    if (child.isMesh) {
                        zombieMeshes.push(child);
                        zombieMap.set(child, z);
                    }
                });
            });

            const intersects = raycaster.intersectObjects(zombieMeshes, false);
            if (intersects.length > 0) {
                const zombie = zombieMap.get(intersects[0].object);
                if (zombie) {
                    const obj = intersects[0].object;
                    const isHeadshot = !!(obj.userData && obj.userData.hitZone === 'head');
                    onHit(zombie, weapon.damage, { isHeadshot, knockback: direction, point: intersects[0].point });

                    // Dispatch hitmarker event
                    window.dispatchEvent(new CustomEvent('hit-marker', { detail: { isHeadshot } }));

                    if (onHitAny) onHitAny();
                }
            } else {
                // Environment Hit (Ground / Walls)
                const envIntersects = raycaster.intersectObjects(this.scene.children, true);
                const firstEnv = envIntersects.find(i => !zombieMeshes.includes(i.object) && i.object !== this.muzzleFlash && i.object !== this.muzzleLight && i.object.userData.type !== 'zombie');

                if (firstEnv) {
                    this.createDustPuff(firstEnv.point);
                    audioSystem.playImpactVariation();
                }
            }
        }

        return weapon;
    }

    createDustPuff(point) {
        const count = 5;
        const mat = new THREE.MeshBasicMaterial({ color: 0x998877, transparent: true, opacity: 0.8 });
        const geo = new THREE.BoxGeometry(0.1, 0.1, 0.1);

        for (let i = 0; i < count; i++) {
            const p = new THREE.Mesh(geo, mat);
            p.position.copy(point);
            this.scene.add(p);

            const vel = new THREE.Vector3((Math.random() - 0.5) * 0.1, Math.random() * 0.2, (Math.random() - 0.5) * 0.1);
            const start = Date.now();
            const anim = () => {
                if (Date.now() - start > 600) {
                    this.scene.remove(p); p.geometry.dispose(); p.material.dispose(); return;
                }
                p.position.add(vel);
                p.scale.multiplyScalar(0.95);
                p.material.opacity -= 0.02;
                requestAnimationFrame(anim);
            };
            anim();
        }
    }

    reload() {
        const weapon = this.currentWeapon;
        if (this.isReloading || weapon.ammo === weapon.maxAmmo || weapon.reserve <= 0) return;
        this.isReloading = true;
        setTimeout(() => {
            const needed = weapon.maxAmmo - weapon.ammo;
            const transfer = Math.min(needed, weapon.reserve);
            weapon.ammo += transfer;
            weapon.reserve -= transfer;
            this.isReloading = false;
        }, weapon.reloadTime * 1000);
    }

    createExplosion(point) {
        audioSystem.playExplosion();
        const mat = new THREE.MeshStandardMaterial({
            color: 0xff4500,
            emissive: 0xff4500,
            emissiveIntensity: 2,
            transparent: true,
            opacity: 0.9
        });
        const mesh = new THREE.Mesh(this.explosionGeo, mat);
        mesh.position.copy(point);
        this.scene.add(mesh);
        this.explosions.push({ mesh, scale: 1 });
    }

    spawnTracer(from, to, color = 0xffaa55) {
        const geom = new THREE.BufferGeometry().setFromPoints([from, to]);
        const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.9 });
        const line = new THREE.Line(geom, mat);
        this.scene.add(line);
        this.tracers.push({ line, life: 1.0 });
    }

    ejectShell(pos, dir) {
        const shell = new THREE.Mesh(this.shellGeo, this.shellMat);
        shell.position.copy(pos);
        shell.rotation.set(Math.random(), Math.random(), Math.random());
        this.scene.add(shell);

        const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(this.camera.quaternion);

        const velocity = right.clone().multiplyScalar(0.12 + Math.random() * 0.08)
            .add(up.clone().multiplyScalar(0.15))
            .add(dir.clone().multiplyScalar(-0.05));

        const angularVel = new THREE.Vector3(Math.random() * 0.5, Math.random() * 0.5, Math.random() * 0.5);

        const start = Date.now();
        const anim = () => {
            const age = Date.now() - start;
            if (age > 2000) {
                this.scene.remove(shell);
                return;
            }
            shell.position.add(velocity);
            shell.rotation.x += angularVel.x;
            shell.rotation.y += angularVel.y;
            velocity.y -= 0.01; // Gravity

            if (shell.position.y < 0.05) {
                shell.position.y = 0.05;
                velocity.set(0, 0, 0);
                angularVel.set(0, 0, 0);
            } else {
                requestAnimationFrame(anim);
            }
        };
        anim();
    }
}
