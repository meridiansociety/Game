// ============================================================
// weapon.js - Weapon system: rifle, pistol, shooting, reloading
// ============================================================

import * as THREE from 'three';
import { clamp, rand } from './utils.js';
import { playGunshot, playReload, playHitMarker } from './audio.js';

// Weapon configuration presets
const WEAPON_CONFIGS = {
    rifle: {
        name: 'M4 Rifle',
        magSize: 30,
        reserveAmmo: 90,
        damage: 24,
        fireRate: 9,          // rounds per second
        reloadTime: 2.0,      // seconds
        spread: 0.025,        // base spread in radians
        sprintSpread: 0.06,
        recoilKick: 0.012,    // visual recoil per shot
        range: 80,
        headshotMult: 1.8,
        isAuto: true,
    },
    pistol: {
        name: 'P226 Pistol',
        magSize: 12,
        reserveAmmo: 48,
        damage: 18,
        fireRate: 4.5,
        reloadTime: 1.4,
        spread: 0.015,
        sprintSpread: 0.04,
        recoilKick: 0.018,
        range: 50,
        headshotMult: 2.0,
        isAuto: false,
    }
};

export class Weapon {
    constructor(type) {
        const cfg = WEAPON_CONFIGS[type];
        this.type = type;
        this.name = cfg.name;
        this.magSize = cfg.magSize;
        this.mag = cfg.magSize;
        this.reserveAmmo = cfg.reserveAmmo;
        this.damage = cfg.damage;
        this.fireRate = cfg.fireRate;
        this.reloadTime = cfg.reloadTime;
        this.spread = cfg.spread;
        this.sprintSpread = cfg.sprintSpread;
        this.recoilKick = cfg.recoilKick;
        this.range = cfg.range;
        this.headshotMult = cfg.headshotMult;
        this.isAuto = cfg.isAuto;

        this.cooldown = 0;
        this.reloading = false;
        this.reloadTimer = 0;
        this.recoilOffset = 0;     // current visual recoil
        this.lastFired = false;
    }

    update(dt) {
        if (this.cooldown > 0) this.cooldown -= dt;

        // Recoil recovery
        this.recoilOffset *= Math.pow(0.05, dt);
        if (this.recoilOffset < 0.001) this.recoilOffset = 0;

        // Reload progress
        if (this.reloading) {
            this.reloadTimer -= dt;
            if (this.reloadTimer <= 0) {
                const needed = this.magSize - this.mag;
                const take = Math.min(needed, this.reserveAmmo);
                this.mag += take;
                this.reserveAmmo -= take;
                this.reloading = false;
            }
        }
    }

    canFire() {
        return !this.reloading && this.cooldown <= 0 && this.mag > 0;
    }

    fire(isSprinting) {
        if (!this.canFire()) return null;

        this.mag--;
        this.cooldown = 1 / this.fireRate;
        this.recoilOffset += this.recoilKick;
        this.lastFired = true;

        const currentSpread = isSprinting ? this.sprintSpread : this.spread;
        const spreadX = rand(-currentSpread, currentSpread);
        const spreadY = rand(-currentSpread, currentSpread);

        playGunshot(this.type === 'rifle');

        return {
            spreadX,
            spreadY,
            damage: this.damage,
            range: this.range,
            headshotMult: this.headshotMult,
        };
    }

    startReload() {
        if (this.reloading) return;
        if (this.mag >= this.magSize) return;
        if (this.reserveAmmo <= 0) return;

        this.reloading = true;
        this.reloadTimer = this.reloadTime;
        playReload();
    }

    addAmmo(amount) {
        this.reserveAmmo += amount;
    }

    get ammoDisplay() {
        return `${this.mag} / ${this.reserveAmmo}`;
    }

    get isEmpty() {
        return this.mag <= 0 && this.reserveAmmo <= 0;
    }
}

// ============================================================
// WeaponManager - Handles weapon switching and viewmodel
// ============================================================
export class WeaponManager {
    constructor(scene, camera) {
        this.weapons = {
            rifle: new Weapon('rifle'),
            pistol: new Weapon('pistol'),
        };
        this.currentKey = 'rifle';
        this.switchCooldown = 0;
        this.muzzleFlashTimer = 0;

        // Viewmodel group (attached to camera)
        this.viewmodel = new THREE.Group();
        camera.add(this.viewmodel);

        // Build weapon viewmodel meshes
        this.buildViewmodel();

        // Muzzle flash light
        this.muzzleLight = new THREE.PointLight(0xffaa44, 0, 8);
        this.muzzleLight.position.set(0.3, -0.15, -1.5);
        this.viewmodel.add(this.muzzleLight);

        // Muzzle flash sprite
        const flashGeo = new THREE.PlaneGeometry(0.3, 0.3);
        const flashMat = new THREE.MeshBasicMaterial({
            color: 0xffcc66,
            transparent: true,
            opacity: 0,
            side: THREE.DoubleSide,
            depthTest: false,
        });
        this.muzzleFlash = new THREE.Mesh(flashGeo, flashMat);
        this.muzzleFlash.position.set(0.3, -0.12, -1.6);
        this.viewmodel.add(this.muzzleFlash);
    }

    buildViewmodel() {
        const gunMat = new THREE.MeshLambertMaterial({ color: 0x2a2e33 });
        const gunMatLight = new THREE.MeshLambertMaterial({ color: 0x555b63 });
        const woodMat = new THREE.MeshLambertMaterial({ color: 0x6a4a2a });

        // Rifle viewmodel
        this.rifleModel = new THREE.Group();
        // Barrel
        const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 1.0), gunMatLight);
        barrel.position.set(0.3, -0.2, -1.0);
        this.rifleModel.add(barrel);
        // Body
        const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.6), gunMat);
        body.position.set(0.3, -0.22, -0.4);
        this.rifleModel.add(body);
        // Stock
        const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.3), woodMat);
        stock.position.set(0.3, -0.22, -0.0);
        this.rifleModel.add(stock);
        // Magazine
        const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.15, 0.08), gunMat);
        mag.position.set(0.3, -0.35, -0.45);
        this.rifleModel.add(mag);
        // Grip
        const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.04), gunMat);
        grip.position.set(0.3, -0.32, -0.25);
        this.rifleModel.add(grip);

        this.viewmodel.add(this.rifleModel);

        // Pistol viewmodel
        this.pistolModel = new THREE.Group();
        const pBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.4), gunMatLight);
        pBarrel.position.set(0.25, -0.18, -0.6);
        this.pistolModel.add(pBarrel);
        const pBody = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.25), gunMat);
        pBody.position.set(0.25, -0.2, -0.35);
        this.pistolModel.add(pBody);
        const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.06), woodMat);
        pGrip.position.set(0.25, -0.3, -0.24);
        this.pistolModel.add(pGrip);

        this.pistolModel.visible = false;
        this.viewmodel.add(this.pistolModel);
    }

    get current() {
        return this.weapons[this.currentKey];
    }

    switchTo(key) {
        if (key === this.currentKey || this.switchCooldown > 0) return;
        if (!this.weapons[key]) return;

        this.currentKey = key;
        this.switchCooldown = 0.3;

        this.rifleModel.visible = key === 'rifle';
        this.pistolModel.visible = key === 'pistol';
    }

    update(dt, isSprinting, isMoving, bobPhase) {
        if (this.switchCooldown > 0) this.switchCooldown -= dt;

        this.weapons.rifle.update(dt);
        this.weapons.pistol.update(dt);

        // Muzzle flash decay
        if (this.muzzleFlashTimer > 0) {
            this.muzzleFlashTimer -= dt;
            const intensity = clamp(this.muzzleFlashTimer / 0.05, 0, 1);
            this.muzzleLight.intensity = intensity * 2;
            this.muzzleFlash.material.opacity = intensity;
        } else {
            this.muzzleLight.intensity = 0;
            this.muzzleFlash.material.opacity = 0;
        }

        // Weapon bob
        const bobAmount = isMoving ? (isSprinting ? 0.025 : 0.015) : 0.003;
        const bobSpeed = isMoving ? (isSprinting ? 12 : 8) : 2;
        const bobY = Math.sin(bobPhase * bobSpeed) * bobAmount;
        const bobX = Math.cos(bobPhase * bobSpeed * 0.5) * bobAmount * 0.5;

        // Recoil animation
        const recoil = this.current.recoilOffset;
        this.viewmodel.position.set(bobX, bobY - recoil * 2, -recoil * 5);
        this.viewmodel.rotation.x = recoil * 1.5;
    }

    tryFire(isSprinting) {
        if (this.switchCooldown > 0) return null;
        const result = this.current.fire(isSprinting);
        if (result) {
            this.muzzleFlashTimer = 0.06;
        }
        return result;
    }
}
