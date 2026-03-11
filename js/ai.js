// ============================================================
// ai.js - Enemy AI system
// State machine: idle, patrol, suspicious, alert, attack,
// cover, search, pushBomb, defuse
// ============================================================

import * as THREE from 'three';
import {
    clamp, rand, dist2D, ENEMY_RADIUS, ENEMY_HEIGHT,
    moveWithCollision, hasLineOfSight, waypointGraph, checkCollision
} from './utils.js';
import { playEnemyGunshot } from './audio.js';

// AI tuning constants
const DETECTION_RANGE = 28;
const CLOSE_DETECTION_RANGE = 6;  // auto-detect within this range
const FIRE_RANGE = 25;
const ALERT_SPREAD_RANGE = 15;    // other enemies alert within this range
const REACTION_DELAY_MIN = 0.3;
const REACTION_DELAY_MAX = 0.8;
const PATROL_SPEED = 1.5;
const ALERT_SPEED = 2.8;
const RUSH_SPEED = 3.5;

// Enemy visual representation using simple geometry
const enemyBodyGeo = new THREE.BoxGeometry(0.5, 1.2, 0.4);
const enemyHeadGeo = new THREE.SphereGeometry(0.2, 6, 6);
const enemyHealthBarGeo = new THREE.PlaneGeometry(0.6, 0.08);
const enemyHealthFillGeo = new THREE.PlaneGeometry(0.58, 0.06);

const matEnemy = new THREE.MeshLambertMaterial({ color: 0xcc4444 });
const matEnemyAlerted = new THREE.MeshLambertMaterial({ color: 0xff6644 });
const matEnemyHead = new THREE.MeshLambertMaterial({ color: 0xddaa88 });
const matHealthBg = new THREE.MeshBasicMaterial({ color: 0x333333, side: THREE.DoubleSide });
const matHealthFill = new THREE.MeshBasicMaterial({ color: 0x44ff66, side: THREE.DoubleSide });

export class Enemy {
    constructor(x, y, z, role, scene) {
        this.x = x;
        this.y = y;
        this.z = z;
        this.role = role;
        this.scene = scene;

        // Stats based on role
        this.maxHealth = role === 'heavy' ? 120 : role === 'hardpoint' ? 90 : 70;
        this.health = this.maxHealth;
        this.alive = true;
        this.speed = this.getSpeedForRole();
        this.aimAccuracy = this.getAccuracyForRole();
        this.fireInterval = this.getFireIntervalForRole();
        this.reactionDelay = 0;

        // State machine
        this.state = this.getInitialState();
        this.stateTimer = 0;
        this.alertLevel = 0;          // 0 = unaware, 1 = suspicious, 2 = alerted
        this.lastKnownPlayerX = 0;
        this.lastKnownPlayerZ = 0;
        this.lastSeenTimer = 0;
        this.fireCooldown = rand(0.5, 1.5);
        this.searchTimer = 0;
        this.defusing = false;

        // Patrol data
        this.patrolPoints = this.generatePatrolPoints();
        this.patrolIndex = 0;
        this.homeX = x;
        this.homeZ = z;

        // Pathfinding
        this.currentPath = [];
        this.pathIndex = 0;
        this.pathRefreshTimer = 0;

        // Visual representation
        this.mesh = this.createMesh();
        this.mesh.position.set(x, y + 0.6, z);
        scene.add(this.mesh);
    }

    createMesh() {
        const group = new THREE.Group();

        // Body
        this.bodyMesh = new THREE.Mesh(enemyBodyGeo, matEnemy);
        this.bodyMesh.position.y = 0;
        this.bodyMesh.castShadow = true;
        group.add(this.bodyMesh);

        // Head
        this.headMesh = new THREE.Mesh(enemyHeadGeo, matEnemyHead);
        this.headMesh.position.y = 0.75;
        this.headMesh.castShadow = true;
        group.add(this.headMesh);

        // Health bar background
        this.healthBarBg = new THREE.Mesh(enemyHealthBarGeo, matHealthBg);
        this.healthBarBg.position.y = 1.15;
        group.add(this.healthBarBg);

        // Health bar fill
        this.healthBarFill = new THREE.Mesh(enemyHealthFillGeo, matHealthFill.clone());
        this.healthBarFill.position.y = 1.15;
        group.add(this.healthBarFill);

        return group;
    }

    getSpeedForRole() {
        switch (this.role) {
            case 'patrol': return PATROL_SPEED + rand(-0.2, 0.3);
            case 'sentry': return PATROL_SPEED * 0.8;
            case 'interior': return ALERT_SPEED * 0.9;
            case 'overwatch': return PATROL_SPEED * 0.7;
            case 'heavy': return PATROL_SPEED * 0.6;
            case 'hardpoint': return ALERT_SPEED;
            case 'reinforcement': return RUSH_SPEED;
            default: return PATROL_SPEED;
        }
    }

    getAccuracyForRole() {
        // Lower = more accurate (spread in radians)
        switch (this.role) {
            case 'overwatch': return 0.035;
            case 'interior': return 0.05;
            case 'hardpoint': return 0.04;
            case 'heavy': return 0.06;
            case 'reinforcement': return 0.055;
            default: return 0.065;
        }
    }

    getFireIntervalForRole() {
        switch (this.role) {
            case 'overwatch': return [0.8, 1.4];   // slow, precise
            case 'interior': return [0.4, 0.8];     // faster
            case 'hardpoint': return [0.5, 0.9];
            case 'heavy': return [0.3, 0.6];        // suppressive
            case 'reinforcement': return [0.4, 0.7];
            default: return [0.6, 1.0];
        }
    }

    getInitialState() {
        switch (this.role) {
            case 'patrol': return 'patrol';
            case 'sentry': return 'guard';
            case 'overwatch': return 'guard';
            case 'reinforcement': return 'pushBomb';
            default: return 'guard';
        }
    }

    generatePatrolPoints() {
        if (this.role !== 'patrol') return [];
        const points = [{ x: this.x, z: this.z }];
        for (let i = 0; i < 3; i++) {
            const px = this.x + rand(-6, 6);
            const pz = this.z + rand(-6, 6);
            if (!checkCollision(px, this.y, pz, ENEMY_RADIUS, ENEMY_HEIGHT)) {
                points.push({ x: px, z: pz });
            }
        }
        return points;
    }

    // ============================================================
    // MAIN UPDATE
    // ============================================================
    update(dt, player, enemies, bombState) {
        if (!this.alive) return;

        this.stateTimer += dt;
        this.fireCooldown -= dt;
        if (this.lastSeenTimer > 0) this.lastSeenTimer -= dt;
        if (this.reactionDelay > 0) this.reactionDelay -= dt;
        this.pathRefreshTimer -= dt;

        // Detection: check if player is visible
        const playerPos = player.getPosition();
        const d = dist2D(this.x, this.z, playerPos.x, playerPos.z);
        const yDiff = Math.abs(this.y - player.y);
        const sameFloor = yDiff < 4;

        let canSeePlayer = false;
        if (sameFloor && d < DETECTION_RANGE) {
            canSeePlayer = hasLineOfSight(
                this.x, this.y + 1.0, this.z,
                playerPos.x, playerPos.y, playerPos.z
            );
        }

        // Auto-detect at close range even without LOS initially
        if (sameFloor && d < CLOSE_DETECTION_RANGE && this.alertLevel < 2) {
            this.alertLevel = 1;
            this.reactionDelay = rand(REACTION_DELAY_MIN, REACTION_DELAY_MAX);
        }

        // Player detected
        if (canSeePlayer && d < DETECTION_RANGE) {
            this.lastKnownPlayerX = playerPos.x;
            this.lastKnownPlayerZ = playerPos.z;
            this.lastSeenTimer = 5;

            if (this.alertLevel < 2) {
                this.alertLevel = 2;
                this.reactionDelay = rand(REACTION_DELAY_MIN, REACTION_DELAY_MAX);
                // Alert nearby enemies
                this.alertNearby(enemies);
            }

            if (this.reactionDelay <= 0) {
                this.state = 'attack';
            }
        } else if (this.lastSeenTimer <= 0 && this.alertLevel >= 2) {
            // Lost sight of player
            if (bombState.planted) {
                this.state = 'pushBomb';
            } else {
                this.state = 'search';
                this.searchTimer = rand(4, 8);
            }
        }

        // Post-plant behavior override
        if (bombState.planted && this.state !== 'attack' && this.state !== 'defuse') {
            if (d < 3 && sameFloor && !canSeePlayer) {
                this.state = 'defuse';
            } else {
                this.state = 'pushBomb';
            }
        }

        // Execute current state
        switch (this.state) {
            case 'guard': this.doGuard(dt); break;
            case 'patrol': this.doPatrol(dt); break;
            case 'search': this.doSearch(dt, player); break;
            case 'attack': this.doAttack(dt, player, canSeePlayer); break;
            case 'pushBomb': this.doPushBomb(dt, player, bombState, canSeePlayer); break;
            case 'defuse': this.doDefuse(dt, bombState, player, canSeePlayer); break;
        }

        // Update visual
        this.updateVisual(player);
    }

    // ============================================================
    // STATE BEHAVIORS
    // ============================================================

    doGuard(dt) {
        // Slowly rotate, watching area
        const t = performance.now() * 0.0005;
        this.mesh.rotation.y = Math.sin(t + this.homeX) * 0.5;
    }

    doPatrol(dt) {
        if (this.patrolPoints.length === 0) {
            this.doGuard(dt);
            return;
        }

        const target = this.patrolPoints[this.patrolIndex];
        const d = dist2D(this.x, this.z, target.x, target.z);

        if (d < 0.5) {
            this.patrolIndex = (this.patrolIndex + 1) % this.patrolPoints.length;
            this.stateTimer = 0;
        } else {
            this.moveToward(target.x, target.z, PATROL_SPEED, dt);
        }
    }

    doSearch(dt, player) {
        this.searchTimer -= dt;
        if (this.searchTimer <= 0) {
            this.alertLevel = 0;
            this.state = this.getInitialState();
            return;
        }

        // Move toward last known position with some randomness
        const d = dist2D(this.x, this.z, this.lastKnownPlayerX, this.lastKnownPlayerZ);
        if (d > 1.5) {
            this.moveToward(this.lastKnownPlayerX, this.lastKnownPlayerZ, ALERT_SPEED * 0.7, dt);
        } else {
            // Wander near last known position
            if (this.stateTimer > 2) {
                this.lastKnownPlayerX += rand(-3, 3);
                this.lastKnownPlayerZ += rand(-3, 3);
                this.stateTimer = 0;
            }
        }
    }

    doAttack(dt, player, canSee) {
        const playerPos = player.getPosition();
        const d = dist2D(this.x, this.z, playerPos.x, playerPos.z);

        // Movement behavior varies by distance
        if (d > 12) {
            // Advance toward player
            this.moveToward(playerPos.x, playerPos.z, this.speed, dt);
        } else if (d > 5) {
            // Strafe while engaging
            const ang = Math.atan2(playerPos.x - this.x, playerPos.z - this.z);
            const strafeDir = Math.sin(performance.now() * 0.002 + this.homeX) > 0 ? 1 : -1;
            const strafeX = this.x + Math.cos(ang) * strafeDir * 2;
            const strafeZ = this.z - Math.sin(ang) * strafeDir * 2;
            this.moveToward(strafeX, strafeZ, this.speed * 0.6, dt);
        } else if (d < 3) {
            // Back up if too close
            const ang = Math.atan2(this.x - playerPos.x, this.z - playerPos.z);
            this.moveToward(this.x + Math.sin(ang) * 3, this.z + Math.cos(ang) * 3, this.speed * 0.8, dt);
        }

        // Face player
        this.mesh.rotation.y = Math.atan2(playerPos.x - this.x, playerPos.z - this.z);

        // Shoot at player
        if (canSee && this.fireCooldown <= 0 && this.reactionDelay <= 0 && d < FIRE_RANGE) {
            this.fireAtPlayer(player);
        }
    }

    doPushBomb(dt, player, bombState, canSee) {
        const bombX = bombState.position.x;
        const bombZ = bombState.position.z;
        const d = dist2D(this.x, this.z, bombX, bombZ);
        const playerPos = player.getPosition();

        // Navigate toward bomb site
        if (d > 2) {
            this.navigateToward(bombX, this.y, bombZ, dt);
        }

        // Attack player if visible while pushing
        if (canSee && this.fireCooldown <= 0 && this.reactionDelay <= 0) {
            const pd = dist2D(this.x, this.z, playerPos.x, playerPos.z);
            if (pd < FIRE_RANGE) {
                this.fireAtPlayer(player);
            }
        }

        // If close to bomb and can't see player, try defuse
        if (d < 2 && !canSee && bombState.planted) {
            this.state = 'defuse';
        }

        this.mesh.rotation.y = Math.atan2(bombX - this.x, bombZ - this.z);
    }

    doDefuse(dt, bombState, player, canSee) {
        if (!bombState.planted) {
            this.defusing = false;
            this.state = this.getInitialState();
            return;
        }

        // If player attacks, fight back
        if (canSee) {
            this.defusing = false;
            this.state = 'attack';
            return;
        }

        const d = dist2D(this.x, this.z, bombState.position.x, bombState.position.z);
        if (d > 1.0) {
            this.moveToward(bombState.position.x, bombState.position.z, ALERT_SPEED, dt);
            return;
        }

        // Start/continue defusing
        this.defusing = true;
    }

    // ============================================================
    // COMBAT
    // ============================================================

    fireAtPlayer(player) {
        const playerPos = player.getPosition();
        const dx = playerPos.x - this.x;
        const dy = playerPos.y - (this.y + 1.0);
        const dz = playerPos.z - this.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);

        // Accuracy affected by distance
        const distFactor = clamp(d / 20, 0.5, 2.0);
        const spread = this.aimAccuracy * distFactor;

        const hitAngleH = Math.atan2(dx, dz) + rand(-spread, spread);
        const hitAngleV = Math.atan2(dy, Math.sqrt(dx * dx + dz * dz)) + rand(-spread * 0.5, spread * 0.5);

        // Check if bullet would hit
        const hitDirX = Math.sin(hitAngleH) * Math.cos(hitAngleV);
        const hitDirY = Math.sin(hitAngleV);
        const hitDirZ = Math.cos(hitAngleH) * Math.cos(hitAngleV);

        // Simple hit check: if angle is close enough, it's a hit
        const aimError = Math.abs(Math.atan2(dx, dz) - hitAngleH);
        const damage = this.role === 'overwatch' ? rand(14, 22) :
                       this.role === 'heavy' ? rand(10, 16) :
                       rand(8, 15);

        if (aimError < 0.08 && d < FIRE_RANGE) {
            // Check if wall blocks the shot
            if (hasLineOfSight(this.x, this.y + 1.0, this.z, playerPos.x, playerPos.y, playerPos.z)) {
                player.takeDamage(damage);
            }
        }

        playEnemyGunshot();
        const [minInterval, maxInterval] = this.fireInterval;
        this.fireCooldown = rand(minInterval, maxInterval);
    }

    // ============================================================
    // MOVEMENT & NAVIGATION
    // ============================================================

    moveToward(tx, tz, speed, dt) {
        const ang = Math.atan2(tx - this.x, tz - this.z);
        const dx = Math.sin(ang) * speed * dt;
        const dz = Math.cos(ang) * speed * dt;

        const result = moveWithCollision(
            this.x, this.y, this.z,
            dx, dz,
            ENEMY_RADIUS, ENEMY_HEIGHT
        );

        // If completely blocked, try perpendicular
        if (result.x === this.x && result.z === this.z) {
            const perpAng = ang + (Math.random() > 0.5 ? Math.PI / 2 : -Math.PI / 2);
            const pdx = Math.sin(perpAng) * speed * dt;
            const pdz = Math.cos(perpAng) * speed * dt;
            const perpResult = moveWithCollision(
                this.x, this.y, this.z,
                pdx, pdz,
                ENEMY_RADIUS, ENEMY_HEIGHT
            );
            this.x = perpResult.x;
            this.z = perpResult.z;
        } else {
            this.x = result.x;
            this.z = result.z;
        }
    }

    navigateToward(tx, ty, tz, dt) {
        // Use waypoint navigation for longer distances
        const d = dist2D(this.x, this.z, tx, tz);
        if (d < 3) {
            this.moveToward(tx, tz, this.speed, dt);
            return;
        }

        // Refresh path periodically
        if (this.pathRefreshTimer <= 0 || this.currentPath.length === 0) {
            this.pathRefreshTimer = 2 + rand(0, 1);
            const startNode = waypointGraph.nearest(this.x, this.y, this.z);
            const endNode = waypointGraph.nearest(tx, ty, tz);
            this.currentPath = waypointGraph.findPath(startNode, endNode);
            this.pathIndex = 0;
        }

        // Follow path
        if (this.pathIndex < this.currentPath.length) {
            const nodeId = this.currentPath[this.pathIndex];
            const node = waypointGraph.nodes[nodeId];
            const nd = dist2D(this.x, this.z, node.x, node.z);

            if (nd < 1.5) {
                this.pathIndex++;
            } else {
                this.moveToward(node.x, node.z, this.speed, dt);
            }
        } else {
            // Path complete, move directly
            this.moveToward(tx, tz, this.speed, dt);
        }
    }

    // Alert nearby enemies
    alertNearby(enemies) {
        for (const e of enemies) {
            if (e === this || !e.alive) continue;
            const d = dist2D(this.x, this.z, e.x, e.z);
            if (d < ALERT_SPREAD_RANGE && e.alertLevel < 2) {
                e.alertLevel = 2;
                e.lastKnownPlayerX = this.lastKnownPlayerX;
                e.lastKnownPlayerZ = this.lastKnownPlayerZ;
                e.lastSeenTimer = 3;
                e.reactionDelay = rand(REACTION_DELAY_MIN + 0.3, REACTION_DELAY_MAX + 0.5);
                if (e.state === 'guard' || e.state === 'patrol') {
                    e.state = 'search';
                    e.searchTimer = rand(5, 10);
                }
            }
        }
    }

    // ============================================================
    // DAMAGE & DEATH
    // ============================================================

    takeDamage(amount) {
        if (!this.alive) return;
        this.health -= amount;
        this.alertLevel = 2;
        this.lastSeenTimer = 5;

        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
            this.defusing = false;
            this.mesh.visible = false;
        }
    }

    // ============================================================
    // VISUAL UPDATE
    // ============================================================

    updateVisual(player) {
        if (!this.alive) return;

        this.mesh.position.set(this.x, this.y + 0.6, this.z);

        // Color based on alert state
        const mat = this.alertLevel >= 2 ? matEnemyAlerted : matEnemy;
        if (this.bodyMesh.material !== mat) {
            this.bodyMesh.material = mat;
        }

        // Health bar
        const hpPercent = this.health / this.maxHealth;
        this.healthBarFill.scale.x = hpPercent;
        this.healthBarFill.position.x = (hpPercent - 1) * 0.29;

        // Health bar color
        if (hpPercent < 0.3) {
            this.healthBarFill.material.color.setHex(0xff4444);
        } else if (hpPercent < 0.6) {
            this.healthBarFill.material.color.setHex(0xffaa44);
        } else {
            this.healthBarFill.material.color.setHex(0x44ff66);
        }

        // Make health bar face camera
        const camPos = player.getPosition();
        this.healthBarBg.lookAt(camPos);
        this.healthBarFill.lookAt(camPos);
    }

    dispose() {
        this.scene.remove(this.mesh);
    }
}

// ============================================================
// EnemyManager - Manages all enemies
// ============================================================
export class EnemyManager {
    constructor(scene) {
        this.scene = scene;
        this.enemies = [];
        this.reinforcementsSpawned = false;
    }

    spawnInitialEnemies(spawns) {
        for (const spawn of spawns) {
            const enemy = new Enemy(spawn.x, spawn.y || 0, spawn.z, spawn.role, this.scene);
            this.enemies.push(enemy);
        }
    }

    spawnReinforcements(spawns) {
        if (this.reinforcementsSpawned) return;
        this.reinforcementsSpawned = true;

        // Spawn 4-6 reinforcements from random spawn points
        const count = 4 + Math.floor(Math.random() * 3);
        const shuffled = [...spawns].sort(() => Math.random() - 0.5);

        for (let i = 0; i < count && i < shuffled.length; i++) {
            const sp = shuffled[i];
            const enemy = new Enemy(
                sp.x + rand(-2, 2), 0, sp.z + rand(-2, 2),
                'reinforcement', this.scene
            );
            this.enemies.push(enemy);
        }
    }

    update(dt, player, bombState) {
        for (const enemy of this.enemies) {
            enemy.update(dt, player, this.enemies, bombState);
        }
    }

    getAliveCount() {
        return this.enemies.filter(e => e.alive).length;
    }

    getAliveEnemies() {
        return this.enemies.filter(e => e.alive);
    }

    // Check if any alive enemy is defusing
    getDefusingEnemy() {
        return this.enemies.find(e => e.alive && e.defusing) || null;
    }

    dispose() {
        for (const e of this.enemies) e.dispose();
        this.enemies = [];
    }
}
