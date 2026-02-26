import * as THREE from 'three';

export class MapManager {
    constructor(scene) {
        this.scene = scene;
        this.collidables = [];
        this.spawnZones = [];
    }

    createDesertMap() {
        // High quality ground with multiple textures (simulated with groups/colors)
        const groundGeo = new THREE.PlaneGeometry(1000, 1000, 10, 10);
        const groundMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.9,
            metalness: 0.0,
            flatShading: true
        });
        const ground = new THREE.Mesh(groundGeo, groundMat);
        ground.rotation.x = -Math.PI / 2;
        ground.receiveShadow = true;
        this.scene.add(ground);

        // Rocks/Obstacles
        for (let i = 0; i < 50; i++) {
            const size = 1 + Math.random() * 3;
            const rockGeo = new THREE.DodecahedronGeometry(size, 0);
            const rockMat = new THREE.MeshStandardMaterial({ color: 0x555555, roughness: 1.0 });
            const rock = new THREE.Mesh(rockGeo, rockMat);

            const angle = Math.random() * Math.PI * 2;
            const dist = 30 + Math.random() * 200;
            rock.position.set(Math.cos(angle) * dist, size * 0.5, Math.sin(angle) * dist);
            rock.rotation.set(Math.random(), Math.random(), Math.random());
            rock.castShadow = true;
            rock.receiveShadow = true;
            this.scene.add(rock);
            this.collidables.push(rock);
        }

        // Abandoned Structures
        this.createRuin(20, 0, 20);
        this.createRuin(-30, 0, 50);
        this.createRuin(40, 0, -60);

        // Atmospheric effects
        this.addCactus(10, 10);
        this.addCactus(-15, 25);
        this.addCactus(30, -10);
    }

    createRuin(x, y, z) {
        const wallMat = new THREE.MeshStandardMaterial({ color: 0x665544, roughness: 1.0 });
        const wall = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 1), wallMat);
        wall.position.set(x, 2.5, z);
        wall.castShadow = true;
        wall.receiveShadow = true;
        this.scene.add(wall);
        this.collidables.push(wall);
    }

    addCactus(x, z) {
        const cactusGroup = new THREE.Group();
        const mainMat = new THREE.MeshStandardMaterial({ color: 0x2d5a27 });

        const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 4), mainMat);
        trunk.position.y = 2;
        cactusGroup.add(trunk);

        const arm1 = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2), mainMat);
        arm1.position.set(0.8, 2.5, 0);
        arm1.rotation.z = Math.PI / 4;
        cactusGroup.add(arm1);

        cactusGroup.position.set(x, 0, z);
        cactusGroup.traverse(m => { if (m.isMesh) m.castShadow = true; });
        this.scene.add(cactusGroup);
    }
}
