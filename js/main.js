// ============================================================
// main.js - Game initialization, loop, and state management
// Ties all systems together: renderer, player, AI, weapons,
// objectives, UI, and audio.
// ============================================================

import * as THREE from 'three';
import { raycastWalls, dist2D } from './utils.js';
import { buildMap, BOMB_SITE, PICKUP_SPAWNS, ENEMY_SPAWNS, REINFORCEMENT_SPAWNS, PLAYER_SPAWN } from './map.js';
import { Player } from './player.js';
import { EnemyManager } from './ai.js';
import { ObjectiveManager, PHASE } from './objective.js';
import { UIManager } from './ui.js';
import { initAudio, playPickup, playHitMarker } from './audio.js';

// ============================================================
// GAME CLASS
// ============================================================
class Game {
    constructor() {
        this.state = 'menu'; // menu, active, paused, victory, defeat
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.player = null;
        this.enemyManager = null;
        this.objective = null;
        this.ui = new UIManager();
        this.pickups = [];
        this.effects = [];       // visual effects (tracers, impacts)
        this.lastTime = 0;
        this.canvas = document.getElementById('game');

        this.init();
    }

    init() {
        // Three.js setup
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;

        // Camera
        this.camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 200);

        // Handle resize
        window.addEventListener('resize', () => {
            this.camera.aspect = window.innerWidth / window.innerHeight;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(window.innerWidth, window.innerHeight);
        });

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x667788);

        // Skybox gradient (simple upper hemisphere)
        const skyGeo = new THREE.SphereGeometry(150, 16, 16);
        const skyMat = new THREE.ShaderMaterial({
            uniforms: {
                topColor: { value: new THREE.Color(0x5588bb) },
                bottomColor: { value: new THREE.Color(0x99bbcc) },
            },
            vertexShader: `
                varying vec3 vWorldPosition;
                void main() {
                    vec4 worldPos = modelMatrix * vec4(position, 1.0);
                    vWorldPosition = worldPos.xyz;
                    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                }
            `,
            fragmentShader: `
                uniform vec3 topColor;
                uniform vec3 bottomColor;
                varying vec3 vWorldPosition;
                void main() {
                    float h = normalize(vWorldPosition).y;
                    gl_FragColor = vec4(mix(bottomColor, topColor, max(h, 0.0)), 1.0);
                }
            `,
            side: THREE.BackSide,
        });
        const sky = new THREE.Mesh(skyGeo, skyMat);
        this.scene.add(sky);

        // Build the map (populates collision boxes and waypoints)
        buildMap(this.scene);

        // Pointer lock on canvas click
        this.canvas.addEventListener('click', () => {
            if (this.state === 'active') {
                this.canvas.requestPointerLock();
            }
        });

        // Menu buttons
        this.ui.el.startBtn.addEventListener('click', () => {
            initAudio();
            this.startGame();
        });
        this.ui.el.restartBtn.addEventListener('click', () => {
            this.restartGame();
        });

        // Pause on escape (pointer lock release)
        document.addEventListener('pointerlockchange', () => {
            if (this.state === 'active' && !document.pointerLockElement) {
                // Player released pointer lock - show brief message
            }
        });

        // Show menu
        this.ui.showMenu(
            'SAFEHOUSE ASSAULT',
            'Assault a fortified forest safehouse. Eliminate defenders, breach the building, and plant the bomb on the hardpoint. Once planted, defend it from enemy reinforcements until detonation.',
            true, false
        );

        // Start render loop
        requestAnimationFrame((t) => this.loop(t));
    }

    startGame() {
        // Dispose old player if any (safety for direct startGame calls)
        if (this.player) this.player.dispose();

        // Create player
        this.player = new Player(this.scene, this.camera, PLAYER_SPAWN);

        // Create enemy manager and spawn enemies
        if (this.enemyManager) this.enemyManager.dispose();
        this.enemyManager = new EnemyManager(this.scene);
        this.enemyManager.spawnInitialEnemies(ENEMY_SPAWNS);

        // Create objective
        this.objective = new ObjectiveManager(BOMB_SITE);

        // Spawn pickups
        this.spawnPickups();

        // Game state
        this.state = 'active';
        this.ui.hideMenu();
        this.ui.showHUD();

        // Request pointer lock
        this.canvas.requestPointerLock();
    }

    restartGame() {
        // Clean up existing entities
        this.cleanupEffects();
        if (this.player) this.player.dispose();
        if (this.enemyManager) this.enemyManager.dispose();

        // Remove pickup meshes
        for (const p of this.pickups) {
            if (p.mesh) this.scene.remove(p.mesh);
        }
        this.pickups = [];

        this.startGame();
    }

    spawnPickups() {
        // Remove existing pickup meshes
        for (const p of this.pickups) {
            if (p.mesh) this.scene.remove(p.mesh);
        }
        this.pickups = [];

        for (const spawn of PICKUP_SPAWNS) {
            const pickup = { ...spawn, collected: false };

            // Create visual mesh
            const geo = new THREE.BoxGeometry(0.4, 0.4, 0.4);
            let color;
            switch (spawn.type) {
                case 'ammo': color = 0x44aaff; break;
                case 'med': color = 0x44ff66; break;
                case 'armor': color = 0xaaaaff; break;
                default: color = 0xffffff;
            }
            const mat = new THREE.MeshLambertMaterial({ color, emissive: color, emissiveIntensity: 0.2 });
            pickup.mesh = new THREE.Mesh(geo, mat);
            pickup.mesh.position.set(spawn.x, spawn.y, spawn.z);
            this.scene.add(pickup.mesh);

            this.pickups.push(pickup);
        }
    }

    // ============================================================
    // GAME LOOP
    // ============================================================
    loop(timestamp) {
        const dt = Math.min(0.05, (timestamp - this.lastTime) / 1000 || 0.016);
        this.lastTime = timestamp;

        if (this.state === 'active') {
            this.update(dt);
        }

        // Always render
        this.renderer.render(this.scene, this.camera);

        requestAnimationFrame((t) => this.loop(t));
    }

    update(dt) {
        // Update player
        this.player.update(dt, true);

        // Handle shooting
        if (this.player.mouseLocked && this.player.mouseDown && this.player.alive) {
            const wep = this.player.weaponManager.current;
            if (wep.isAuto || !wep.lastFired) {
                this.handleShooting();
            }
        }
        // Reset lastFired on mouse up
        if (!this.player.mouseDown) {
            this.player.weaponManager.weapons.rifle.lastFired = false;
            this.player.weaponManager.weapons.pistol.lastFired = false;
        }

        // Update enemies
        this.enemyManager.update(dt, this.player, this.objective);

        // Update objective
        this.objective.update(dt, this.player, this.enemyManager);

        // Spawn reinforcements when bomb is planted
        if (this.objective.reinforcementsTriggered && !this.enemyManager.reinforcementsSpawned) {
            this.enemyManager.spawnReinforcements(REINFORCEMENT_SPAWNS);
            this.ui.showMessage('Enemy reinforcements incoming!', 2000);
        }

        // Update pickups
        this.updatePickups();

        // Update visual effects
        this.updateEffects(dt);

        // Pickup floating animation
        for (const p of this.pickups) {
            if (!p.collected && p.mesh) {
                p.mesh.rotation.y += dt * 2;
                p.mesh.position.y = p.y + Math.sin(performance.now() * 0.003 + p.x) * 0.1;
            }
        }

        // Check game end conditions
        if (this.objective.phase === PHASE.VICTORY && this.state === 'active') {
            this.state = 'victory';
            document.exitPointerLock();
            this.ui.showMenu('MISSION SUCCESS',
                'The bomb detonated and the safehouse was destroyed. You survived the assault.',
                false, true);
        } else if (this.objective.phase === PHASE.DEFEAT && this.state === 'active') {
            this.state = 'defeat';
            document.exitPointerLock();
            this.ui.showMenu('MISSION FAILED',
                this.objective.resultReason,
                false, true);
        }

        // Update weapon slot indicators
        const slot1 = document.getElementById('slot1');
        const slot2 = document.getElementById('slot2');
        if (this.player.weaponManager.currentKey === 'rifle') {
            slot1.classList.add('active');
            slot2.classList.remove('active');
        } else {
            slot1.classList.remove('active');
            slot2.classList.add('active');
        }

        // Update UI
        this.ui.update(this.player, this.objective, this.enemyManager.getAliveCount());
    }

    // ============================================================
    // SHOOTING SYSTEM
    // ============================================================
    handleShooting() {
        const result = this.player.weaponManager.tryFire(this.player.isSprinting);
        if (!result) return;

        // Raycast from camera
        const origin = this.player.getPosition();
        const baseDir = this.player.getAimDirection();

        // Apply spread
        const spreadQuat = new THREE.Quaternion();
        const spreadEuler = new THREE.Euler(result.spreadY, result.spreadX, 0);
        spreadQuat.setFromEuler(spreadEuler);
        const dir = baseDir.clone().applyQuaternion(spreadQuat).normalize();

        // Check enemy hits
        let hitSomething = false;
        let closestHitDist = result.range;
        let closestEnemy = null;

        for (const enemy of this.enemyManager.getAliveEnemies()) {
            // Simple sphere intersection for enemy hitbox
            const enemyCenter = new THREE.Vector3(enemy.x, enemy.y + 0.8, enemy.z);
            const toEnemy = enemyCenter.clone().sub(origin);
            const proj = toEnemy.dot(dir);

            if (proj < 0 || proj > closestHitDist) continue;

            const closestPoint = origin.clone().add(dir.clone().multiplyScalar(proj));
            const dist = closestPoint.distanceTo(enemyCenter);

            if (dist < 0.6) { // hit radius
                closestHitDist = proj;
                closestEnemy = enemy;
                hitSomething = true;
            }
        }

        // Check wall hit distance
        const wallDist = raycastWalls(origin, dir, result.range);

        if (closestEnemy && closestHitDist < wallDist) {
            // Hit an enemy
            closestEnemy.takeDamage(result.damage);
            this.player.showHitMarker();
            playHitMarker();

            // Impact effect at hit point
            const hitPos = origin.clone().add(dir.clone().multiplyScalar(closestHitDist));
            this.spawnImpact(hitPos, 0xff6644);
        } else if (wallDist < result.range) {
            // Hit a wall - spawn impact
            const hitPos = origin.clone().add(dir.clone().multiplyScalar(wallDist - 0.05));
            this.spawnImpact(hitPos, 0xcccccc);
        }

        // Bullet tracer
        this.spawnTracer(origin, dir, Math.min(closestHitDist, wallDist, result.range));
    }

    // ============================================================
    // PICKUPS
    // ============================================================
    updatePickups() {
        // Don't show pickup prompts if near bomb site (bomb takes priority)
        if (this.objective.isNearBombSite(this.player)) return;

        for (const p of this.pickups) {
            if (p.collected) continue;

            const d = dist2D(this.player.x, this.player.z, p.x, p.z);
            const yDiff = Math.abs(this.player.y - p.y);
            if (d < 1.5 && yDiff < 2) {
                if (this.player.interactPressed) {
                    this.collectPickup(p);
                } else {
                    const name = p.type === 'ammo' ? 'Ammo' : p.type === 'med' ? 'Medkit' : 'Armor';
                    this.ui.showMessage(`Press [E] to pick up ${name}`, 500);
                }
            }
        }
    }

    collectPickup(pickup) {
        pickup.collected = true;
        if (pickup.mesh) {
            this.scene.remove(pickup.mesh);
        }

        switch (pickup.type) {
            case 'ammo':
                this.player.weaponManager.current.addAmmo(pickup.amount);
                this.ui.showMessage(`+${pickup.amount} ammo`);
                break;
            case 'med':
                this.player.heal(pickup.amount);
                this.ui.showMessage(`+${pickup.amount} health`);
                break;
            case 'armor':
                this.player.addArmor(pickup.amount);
                this.ui.showMessage(`+${pickup.amount} armor`);
                break;
        }
        playPickup();
    }

    // ============================================================
    // VISUAL EFFECTS
    // ============================================================
    spawnTracer(origin, dir, distance) {
        const geo = new THREE.BufferGeometry().setFromPoints([
            origin.clone(),
            origin.clone().add(dir.clone().multiplyScalar(distance))
        ]);
        const mat = new THREE.LineBasicMaterial({
            color: 0xffdd88,
            transparent: true,
            opacity: 0.6,
        });
        const line = new THREE.Line(geo, mat);
        this.scene.add(line);
        this.effects.push({ mesh: line, life: 0.08 });
    }

    spawnImpact(position, color) {
        const geo = new THREE.SphereGeometry(0.06, 4, 4);
        const mat = new THREE.MeshBasicMaterial({ color });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        this.scene.add(mesh);
        this.effects.push({ mesh, life: 0.2 });
    }

    updateEffects(dt) {
        for (let i = this.effects.length - 1; i >= 0; i--) {
            this.effects[i].life -= dt;
            if (this.effects[i].life <= 0) {
                this.scene.remove(this.effects[i].mesh);
                if (this.effects[i].mesh.geometry) this.effects[i].mesh.geometry.dispose();
                if (this.effects[i].mesh.material) this.effects[i].mesh.material.dispose();
                this.effects.splice(i, 1);
            }
        }
    }

    cleanupEffects() {
        for (const e of this.effects) {
            this.scene.remove(e.mesh);
            if (e.mesh.geometry) e.mesh.geometry.dispose();
            if (e.mesh.material) e.mesh.material.dispose();
        }
        this.effects = [];
    }
}

// ============================================================
// BOOTSTRAP
// ============================================================
window.addEventListener('DOMContentLoaded', () => {
    new Game();
});
