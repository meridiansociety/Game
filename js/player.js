// ============================================================
// player.js - First-person player controller
// Movement (WASD, sprint, crouch, jump), health, armor,
// pointer lock camera, collision-based movement
// ============================================================

import * as THREE from 'three';
import {
    clamp, PLAYER_HEIGHT, PLAYER_RADIUS, GRAVITY,
    checkCollision, moveWithCollision
} from './utils.js';
import { WeaponManager } from './weapon.js';
import { playDamage, playFootstep } from './audio.js';

// Movement constants
const MOVE_SPEED = 6.0;
const SPRINT_MULT = 1.5;
const CROUCH_MULT = 0.5;
const CROUCH_HEIGHT = 1.0;
const JUMP_VELOCITY = 7.5;
const MOUSE_SENSITIVITY = 0.002;
const MAX_PITCH = Math.PI / 2 - 0.05;
const HEALTH_REGEN_RATE = 6;       // HP per second
const HEALTH_REGEN_DELAY = 4.0;    // seconds after last damage

export class Player {
    constructor(scene, camera, spawnPos) {
        this.camera = camera;
        this.scene = scene;

        // Position and physics
        this.x = spawnPos.x;
        this.y = spawnPos.y;
        this.z = spawnPos.z;
        this.yaw = Math.PI;    // facing north (toward house)
        this.pitch = 0;
        this.velocityY = 0;
        this.onGround = true;
        this.height = PLAYER_HEIGHT;
        this.radius = PLAYER_RADIUS;

        // Movement state
        this.isSprinting = false;
        this.isCrouching = false;
        this.isMoving = false;
        this.moveTime = 0;      // for weapon bob

        // Health and armor
        this.health = 100;
        this.maxHealth = 100;
        this.armor = 50;
        this.maxArmor = 100;
        this.regenDelay = 0;
        this.alive = true;

        // Weapon system
        this.weaponManager = new WeaponManager(scene, camera);

        // Input state
        this.keys = {};
        this.mouseDown = false;
        this.mouseLocked = false;
        this.interactPressed = false;
        this.interactHeld = false;

        // Damage feedback
        this.damageFlashAlpha = 0;
        this.hitMarkerTimer = 0;

        // Set up input listeners
        this.setupInput();
    }

    setupInput() {
        // Store bound handlers so they can be removed on cleanup
        this._onKeyDown = (e) => {
            this.keys[e.code] = true;
            if (e.code === 'Digit1') this.weaponManager.switchTo('rifle');
            if (e.code === 'Digit2') this.weaponManager.switchTo('pistol');
            if (e.code === 'KeyR') this.weaponManager.current.startReload();
            if (e.code === 'KeyE') this.interactPressed = true;
            if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR', 'KeyE', 'KeyC'].includes(e.code)) {
                e.preventDefault();
            }
        };
        this._onKeyUp = (e) => { this.keys[e.code] = false; };
        this._onMouseDown = (e) => { if (e.button === 0) this.mouseDown = true; };
        this._onMouseUp = (e) => { if (e.button === 0) this.mouseDown = false; };
        this._onMouseMove = (e) => {
            if (!this.mouseLocked || !this.alive) return;
            this.yaw -= e.movementX * MOUSE_SENSITIVITY;
            this.pitch -= e.movementY * MOUSE_SENSITIVITY;
            this.pitch = clamp(this.pitch, -MAX_PITCH, MAX_PITCH);
        };
        this._onPointerLock = () => {
            this.mouseLocked = document.pointerLockElement !== null;
        };

        document.addEventListener('keydown', this._onKeyDown);
        document.addEventListener('keyup', this._onKeyUp);
        document.addEventListener('mousedown', this._onMouseDown);
        document.addEventListener('mouseup', this._onMouseUp);
        document.addEventListener('mousemove', this._onMouseMove);
        document.addEventListener('pointerlockchange', this._onPointerLock);
    }

    // Remove all event listeners (call before creating a new Player)
    dispose() {
        document.removeEventListener('keydown', this._onKeyDown);
        document.removeEventListener('keyup', this._onKeyUp);
        document.removeEventListener('mousedown', this._onMouseDown);
        document.removeEventListener('mouseup', this._onMouseUp);
        document.removeEventListener('mousemove', this._onMouseMove);
        document.removeEventListener('pointerlockchange', this._onPointerLock);

        // Remove viewmodel from camera
        if (this.weaponManager && this.weaponManager.viewmodel) {
            this.camera.remove(this.weaponManager.viewmodel);
        }
    }

    requestPointerLock(canvas) {
        canvas.requestPointerLock();
    }

    update(dt, gameActive) {
        if (!this.alive || !gameActive) return;

        this.updateMovement(dt);
        this.updateHealth(dt);
        this.updateWeapons(dt);
        this.updateCamera();
        this.updateFeedback(dt);

        // Reset interact press (consumed each frame)
        this.interactPressed = false;
        this.interactHeld = this.keys['KeyE'] || false;
    }

    updateMovement(dt) {
        // Sprint and crouch state
        this.isSprinting = !!(this.keys['ShiftLeft'] || this.keys['ShiftRight']);
        this.isCrouching = !!(this.keys['KeyC']);
        const currentHeight = this.isCrouching ? CROUCH_HEIGHT : PLAYER_HEIGHT;
        this.height = currentHeight;

        // Movement direction from keys
        let moveX = 0, moveZ = 0;
        const sin = Math.sin(this.yaw);
        const cos = Math.cos(this.yaw);

        if (this.keys['KeyW']) { moveX += sin; moveZ += cos; }
        if (this.keys['KeyS']) { moveX -= sin; moveZ -= cos; }
        if (this.keys['KeyA']) { moveX += cos; moveZ -= sin; }
        if (this.keys['KeyD']) { moveX -= cos; moveZ += sin; }

        // Normalize diagonal movement
        const moveLen = Math.hypot(moveX, moveZ);
        this.isMoving = moveLen > 0.01;

        if (this.isMoving) {
            moveX /= moveLen;
            moveZ /= moveLen;

            let speed = MOVE_SPEED;
            if (this.isSprinting) speed *= SPRINT_MULT;
            if (this.isCrouching) speed *= CROUCH_MULT;

            const dx = moveX * speed * dt;
            const dz = moveZ * speed * dt;

            const result = moveWithCollision(
                this.x, this.y, this.z,
                dx, dz,
                this.radius, this.height
            );
            this.x = result.x;
            this.z = result.z;

            this.moveTime += dt;
            playFootstep();
        }

        // Jump
        if (this.keys['Space'] && this.onGround) {
            this.velocityY = JUMP_VELOCITY;
            this.onGround = false;
        }

        // Gravity
        this.velocityY -= GRAVITY * dt;
        const newY = this.y + this.velocityY * dt;

        // Floor collision (check which floor the player is on)
        const floorY = this.getFloorLevel();
        if (newY <= floorY) {
            this.y = floorY;
            this.velocityY = 0;
            this.onGround = true;
        } else {
            this.y = newY;
            this.onGround = false;
        }

        // Ceiling collision
        const ceilY = this.getCeilingLevel();
        if (this.y + this.height > ceilY) {
            this.y = ceilY - this.height;
            if (this.velocityY > 0) this.velocityY = 0;
        }
    }

    // Determine which floor level the player should be standing on
    getFloorLevel() {
        const WALL_HEIGHT = 3.2;

        // Check if on stairs (main to top)
        if (this.x > 7 && this.x < 11 && this.z > -1.5 && this.z < 2.5) {
            const t = clamp((this.z - (-1)) / 3.0, 0, 1);
            return t * WALL_HEIGHT;
        }

        // Check if on stairs (main to basement)
        if (this.x > -11 && this.x < -7 && this.z > -6.5 && this.z < -2.5) {
            const t = clamp((this.z - (-6)) / 3.0, 0, 1);
            return -WALL_HEIGHT + t * WALL_HEIGHT;
        }

        // Top floor
        if (this.y > WALL_HEIGHT * 0.5 &&
            this.x > -10.5 && this.x < 10.5 &&
            this.z > -8.5 && this.z < 8.5) {
            return WALL_HEIGHT;
        }

        // Basement
        if (this.y < -0.5 &&
            this.x > -10.5 && this.x < 10.5 &&
            this.z > -8.5 && this.z < 8.5) {
            return -WALL_HEIGHT;
        }

        // Ground level
        return 0;
    }

    getCeilingLevel() {
        const WALL_HEIGHT = 3.2;

        // Inside house, check floor level
        if (this.x > -10.5 && this.x < 10.5 && this.z > -8.5 && this.z < 8.5) {
            if (this.y < -0.5) return 0; // basement ceiling = main floor
            if (this.y < WALL_HEIGHT * 0.5) return WALL_HEIGHT; // main ceiling
            return WALL_HEIGHT * 2; // top floor ceiling
        }

        // Outside - no ceiling
        return 100;
    }

    updateHealth(dt) {
        // Regen delay countdown
        if (this.regenDelay > 0) {
            this.regenDelay -= dt;
        } else if (this.health < this.maxHealth) {
            this.health = Math.min(this.maxHealth, this.health + HEALTH_REGEN_RATE * dt);
        }
    }

    updateWeapons(dt) {
        this.weaponManager.update(dt, this.isSprinting, this.isMoving, this.moveTime);
    }

    updateCamera() {
        // Position camera at player eye level
        const eyeOffset = this.isCrouching ? 0.7 : 1.5;
        this.camera.position.set(this.x, this.y + eyeOffset, this.z);

        // Apply rotation
        this.camera.rotation.order = 'YXZ';
        this.camera.rotation.y = this.yaw;
        this.camera.rotation.x = this.pitch;
    }

    updateFeedback(dt) {
        // Damage flash decay
        if (this.damageFlashAlpha > 0) {
            this.damageFlashAlpha -= dt * 3;
            if (this.damageFlashAlpha < 0) this.damageFlashAlpha = 0;
        }

        // Hit marker decay
        if (this.hitMarkerTimer > 0) {
            this.hitMarkerTimer -= dt;
        }
    }

    takeDamage(amount) {
        if (!this.alive) return;

        this.regenDelay = HEALTH_REGEN_DELAY;

        // Armor absorbs 60% of damage
        if (this.armor > 0) {
            const absorb = Math.min(this.armor, amount * 0.6);
            this.armor -= absorb;
            amount -= absorb;
        }

        this.health -= amount;
        this.damageFlashAlpha = 0.4;
        playDamage();

        if (this.health <= 0) {
            this.health = 0;
            this.alive = false;
        }
    }

    showHitMarker() {
        this.hitMarkerTimer = 0.15;
    }

    heal(amount) {
        this.health = Math.min(this.maxHealth, this.health + amount);
    }

    addArmor(amount) {
        this.armor = Math.min(this.maxArmor, this.armor + amount);
    }

    // Get the world position of the player
    getPosition() {
        return new THREE.Vector3(this.x, this.y + (this.isCrouching ? 0.7 : 1.5), this.z);
    }

    // Get aim direction (forward vector from camera)
    getAimDirection() {
        const dir = new THREE.Vector3(0, 0, -1);
        dir.applyQuaternion(this.camera.quaternion);
        return dir.normalize();
    }

    // Floor the player is currently on (-1 = basement, 0 = main, 1 = top)
    getFloor() {
        if (this.y > 2.0) return 1;
        if (this.y < -1.0) return -1;
        return 0;
    }
}
