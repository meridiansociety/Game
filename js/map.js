// ============================================================
// map.js - Procedural 3D map generation
// Creates the forest, compound perimeter, courtyard, and
// 3-floor safehouse with detailed interior rooms.
// ============================================================

import * as THREE from 'three';
import {
    AABB, collisionBoxes, waypointGraph, makeMat, rand, randInt,
    WALL_HEIGHT, FLOOR_THICKNESS, WALL_THICKNESS
} from './utils.js';

// Shared geometry for instancing-like reuse
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const cylGeo = new THREE.CylinderGeometry(1, 1, 1, 8);
const coneGeo = new THREE.ConeGeometry(1, 1, 6);

// Materials
const matWallExt = makeMat(0x8a9080);
const matWallExtDark = makeMat(0x6a7565);
const matWallInt = makeMat(0xc4b89a);
const matWallIntDark = makeMat(0xa09478);
const matFloorWood = makeMat(0x8b6f47);
const matFloorConcrete = makeMat(0x909090);
const matFloorBasement = makeMat(0x606870);
const matCeiling = makeMat(0xb8b0a0);
const matRoof = makeMat(0x5a4a3a);
const matGround = makeMat(0x3a5a32);
const matDirt = makeMat(0x6a5a40);
const matFence = makeMat(0x555555);
const matTrunk = makeMat(0x5a3a20);
const matLeaves = makeMat(0x2a6a22);
const matLeavesDark = makeMat(0x1a5a12);
const matRock = makeMat(0x777777);
const matCrate = makeMat(0x8a7a50);
const matMetal = makeMat(0x606868);
const matFurniture = makeMat(0x705030);
const matFurnitureDark = makeMat(0x503820);
const matSandbag = makeMat(0x8a8060);
const matVehicle = makeMat(0x404840);
const matBombSite = new THREE.MeshLambertMaterial({ color: 0xffcc44, emissive: 0xffaa00, emissiveIntensity: 0.15 });

// Helper to create a box mesh and add collision
function addWall(scene, x, y, z, w, h, d, material, addCollision = true) {
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.scale.set(w, h, d);
    mesh.position.set(x, y + h / 2, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (addCollision) {
        collisionBoxes.push(new AABB(
            x - w / 2, y, z - d / 2,
            x + w / 2, y + h, z + d / 2
        ));
    }
    return mesh;
}

// Floor/ceiling plane (no collision needed vertically for now)
function addFloor(scene, x, y, z, w, d, material) {
    const mesh = new THREE.Mesh(boxGeo, material);
    mesh.scale.set(w, FLOOR_THICKNESS, d);
    mesh.position.set(x, y, z);
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
}

// Tree (trunk cylinder + cone/sphere canopy)
function addTree(scene, x, z) {
    const trunkH = rand(3, 5);
    const canopyR = rand(1.5, 3);
    const canopyH = rand(3, 5);

    const trunk = new THREE.Mesh(cylGeo, matTrunk);
    trunk.scale.set(0.2, trunkH, 0.2);
    trunk.position.set(x, trunkH / 2, z);
    trunk.castShadow = true;
    scene.add(trunk);

    const mat = Math.random() > 0.5 ? matLeaves : matLeavesDark;
    const canopy = new THREE.Mesh(coneGeo, mat);
    canopy.scale.set(canopyR, canopyH, canopyR);
    canopy.position.set(x, trunkH + canopyH / 2 - 0.5, z);
    canopy.castShadow = true;
    scene.add(canopy);

    // Tree trunks are collidable
    collisionBoxes.push(new AABB(x - 0.3, 0, z - 0.3, x + 0.3, trunkH, z + 0.3));
}

// Rock
function addRock(scene, x, z) {
    const s = rand(0.4, 1.2);
    const h = rand(0.3, 0.8);
    const mesh = new THREE.Mesh(boxGeo, matRock);
    mesh.scale.set(s, h, s * rand(0.7, 1.3));
    mesh.position.set(x, h / 2, z);
    mesh.rotation.y = rand(0, Math.PI);
    mesh.castShadow = true;
    scene.add(mesh);
    collisionBoxes.push(new AABB(x - s / 2, 0, z - s / 2, x + s / 2, h, z + s / 2));
}

// ============================================================
// BUILD THE ENTIRE MAP
// ============================================================
export function buildMap(scene) {

    // -------- GROUND --------
    // Large forest ground
    const groundGeo = new THREE.PlaneGeometry(200, 200);
    const ground = new THREE.Mesh(groundGeo, matGround);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.01;
    ground.receiveShadow = true;
    scene.add(ground);

    // Compound dirt area
    const dirtGround = new THREE.Mesh(new THREE.PlaneGeometry(56, 48), matDirt);
    dirtGround.rotation.x = -Math.PI / 2;
    dirtGround.position.set(0, 0.01, 0);
    dirtGround.receiveShadow = true;
    scene.add(dirtGround);

    // -------- FOREST TREES --------
    const treePositions = [];
    for (let i = 0; i < 200; i++) {
        let x, z;
        do {
            x = rand(-90, 90);
            z = rand(-90, 90);
        } while (Math.abs(x) < 30 && Math.abs(z) < 26); // keep clear of compound
        treePositions.push([x, z]);
        addTree(scene, x, z);
    }

    // Sparse trees near compound approaches
    for (let i = 0; i < 30; i++) {
        const angle = rand(0, Math.PI * 2);
        const dist = rand(28, 42);
        const x = Math.cos(angle) * dist;
        const z = Math.sin(angle) * dist;
        if (Math.abs(x) < 26 && Math.abs(z) < 22) continue;
        addTree(scene, x, z);
    }

    // Rocks scattered in forest
    for (let i = 0; i < 40; i++) {
        const x = rand(-80, 80);
        const z = rand(-80, 80);
        if (Math.abs(x) < 28 && Math.abs(z) < 24) continue;
        addRock(scene, x, z);
    }

    // -------- PERIMETER FENCE --------
    buildFence(scene);

    // -------- COURTYARD OBJECTS --------
    buildCourtyard(scene);

    // -------- SAFEHOUSE --------
    buildHouse(scene);

    // -------- WAYPOINTS --------
    buildWaypoints();

    // -------- LIGHTS --------
    buildLighting(scene);
}

// ============================================================
// PERIMETER FENCE - Surrounds the compound
// ============================================================
function buildFence(scene) {
    const fenceH = 2.5;
    const fenceT = 0.12;
    const halfW = 26;
    const halfD = 22;

    // North fence
    addWall(scene, 0, 0, -halfD, halfW * 2, fenceH, fenceT, matFence);
    // South fence (with gate opening in center)
    addWall(scene, -halfW / 2 - 2, 0, halfD, halfW - 4, fenceH, fenceT, matFence);
    addWall(scene, halfW / 2 + 2, 0, halfD, halfW - 4, fenceH, fenceT, matFence);
    // East fence
    addWall(scene, halfW, 0, 0, fenceT, fenceH, halfD * 2, matFence);
    // West fence (with breach opening)
    addWall(scene, -halfW, 0, -halfD / 2, fenceT, fenceH, halfD, matFence);
    addWall(scene, -halfW, 0, halfD / 2 + 4, fenceT, fenceH, halfD - 8, matFence);

    // Fence posts
    const postPositions = [
        [-halfW, -halfD], [halfW, -halfD], [-halfW, halfD], [halfW, halfD],
        [0, -halfD], [0, halfD], [-halfW, 0], [halfW, 0],
        [-halfW / 2, -halfD], [halfW / 2, -halfD],
        [-halfW / 2, halfD], [halfW / 2, halfD],
    ];
    for (const [px, pz] of postPositions) {
        const post = new THREE.Mesh(cylGeo, matFence);
        post.scale.set(0.12, fenceH + 0.3, 0.12);
        post.position.set(px, (fenceH + 0.3) / 2, pz);
        scene.add(post);
    }
}

// ============================================================
// COURTYARD - Cover objects between fence and house
// ============================================================
function buildCourtyard(scene) {
    // Sandbag positions
    addWall(scene, -16, 0, 10, 3, 0.9, 0.8, matSandbag);
    addWall(scene, 16, 0, -10, 2.5, 0.9, 0.8, matSandbag);
    addWall(scene, -8, 0, -16, 0.8, 0.9, 2.5, matSandbag);
    addWall(scene, 12, 0, 14, 2.5, 0.9, 0.8, matSandbag);

    // Crate stacks
    addWall(scene, -18, 0, -6, 1.5, 1.5, 1.5, matCrate);
    addWall(scene, -18, 1.5, -6, 1.2, 1.2, 1.2, matCrate);
    addWall(scene, 20, 0, 6, 1.5, 1.5, 1.5, matCrate);
    addWall(scene, 15, 0, -15, 1.8, 1.2, 1.0, matCrate);

    // Vehicle (simplified SUV shape)
    addWall(scene, 14, 0, 8, 4.5, 1.5, 2.2, matVehicle);
    addWall(scene, 14.3, 1.5, 8, 2.8, 1.2, 2.0, matVehicle);

    // Second vehicle
    addWall(scene, -14, 0, 16, 2.2, 1.4, 4.2, matVehicle);
    addWall(scene, -14, 1.4, 16.3, 2.0, 1.0, 2.4, matVehicle);

    // Generator / utility box
    addWall(scene, 12, 0, -4, 1.2, 1.4, 0.8, matMetal);

    // Small shed structure (east side)
    addWall(scene, 22, 0, 0, 4, 2.5, 0.2, matWallExtDark); // back wall
    addWall(scene, 20, 0, 0, 0.2, 2.5, 4, matWallExtDark); // side
    addWall(scene, 24, 0, 0, 0.2, 2.5, 4, matWallExtDark); // side
    addFloor(scene, 22, 2.5, 0, 4.4, 4.4, matRoof);

    // Guard outpost (NW area) - small sandbag + elevated platform
    addWall(scene, -20, 0, -14, 3, 0.9, 3, matSandbag);
    addFloor(scene, -20, 1.8, -14, 3.5, 3.5, matCrate);

    // Barriers near house entrances
    addWall(scene, -4, 0, 12, 0.6, 1.0, 2.0, matSandbag);
    addWall(scene, 4, 0, 12, 0.6, 1.0, 2.0, matSandbag);
    addWall(scene, -11, 0, 3, 2.0, 1.0, 0.6, matSandbag);
}

// ============================================================
// SAFEHOUSE - 3-floor building with detailed interior
// ============================================================
function buildHouse(scene) {
    // House dimensions
    const hx = 10; // half-width (X)
    const hz = 8;  // half-depth (Z)
    const wt = WALL_THICKNESS;
    const wh = WALL_HEIGHT;

    // =====================
    // MAIN FLOOR (y = 0)
    // =====================
    const y0 = 0;

    // -- Exterior walls --
    // South wall (front) - with front door opening (center 3m gap)
    addWall(scene, -hx + (hx - 1.5) / 2, y0, hz, hx - 1.5, wh, wt, matWallExt);  // left section
    addWall(scene, hx - (hx - 1.5) / 2, y0, hz, hx - 1.5, wh, wt, matWallExt);   // right section
    // Above door
    addWall(scene, 0, y0 + 2.2, hz, 3, wh - 2.2, wt, matWallExt);

    // North wall (back) - with back door opening (offset right)
    addWall(scene, -hx / 2 - 1, y0, -hz, hx - 2, wh, wt, matWallExt);
    addWall(scene, hx - 2, y0, -hz, 4, wh, wt, matWallExt);
    addWall(scene, 4, y0 + 2.2, -hz, 2, wh - 2.2, wt, matWallExt);

    // West wall - with side door opening
    addWall(scene, -hx, y0, -hz / 2 - 1, wt, wh, hz - 2, matWallExt);
    addWall(scene, -hx, y0, hz / 2 + 2, wt, wh, hz - 4, matWallExt);
    addWall(scene, -hx, y0 + 2.2, hz / 2 - 1, wt, wh - 2.2, 2, matWallExt);

    // East wall (solid with windows represented by thinner sections)
    addWall(scene, hx, y0, 0, wt, wh, hz * 2, matWallExt);

    // -- Main floor interior --
    addFloor(scene, 0, -FLOOR_THICKNESS / 2, 0, hx * 2, hz * 2, matFloorWood);

    // Interior walls creating rooms:

    // Living room / main room: south-center area (x: -5 to 5, z: 2 to 8)
    // Office: NW corner (x: -10 to -4, z: -8 to -1)
    // Kitchen: NE area (x: 3 to 10, z: -8 to -1)
    // Hallway: runs E-W at z = -1 to z = 2
    // Storage/utility: SW area (x: -10 to -5, z: 2 to 8)

    // Hallway south wall (z = 2, from x -10 to 10 with doorways)
    addWall(scene, -7.5, y0, 2, 5, wh, wt, matWallInt); // left section
    addWall(scene, 7.5, y0, 2, 5, wh, wt, matWallInt);  // right section
    // Gap at center (x: -5 to 5) for living room entry

    // Hallway north wall (z = -1, with doorways)
    addWall(scene, -7, y0, -1, 3, wh, wt, matWallInt);  // left
    addWall(scene, 0, y0, -1, 3, wh, wt, matWallInt);   // center
    addWall(scene, 7, y0, -1, 3, wh, wt, matWallInt);   // right
    // Gaps for doorways to office and kitchen

    // Office west wall (already exterior)
    // Office east wall (x = -4, z: -8 to -1)
    addWall(scene, -4, y0, -4.5, wt, wh, 7, matWallInt);

    // Kitchen west wall (x = 3, z: -8 to -1)
    addWall(scene, 3, y0, -4.5, wt, wh, 7, matWallInt);

    // Stair room walls (x: 6 to 10, z: -1 to 2) - stairs going up
    addWall(scene, 6, y0, 0.5, wt, wh, 3, matWallInt);

    // Utility room wall (x = -5, z: 2 to 8)
    addWall(scene, -5, y0, 5, wt, wh, 6, matWallInt);

    // -- Ceiling / second floor --
    addFloor(scene, 0, y0 + wh, 0, hx * 2, hz * 2, matCeiling);

    // -- Furniture (main floor) --
    // Living room: tables, couch shapes
    addWall(scene, -2, y0, 5, 2.5, 0.75, 1.0, matFurniture);     // coffee table
    addWall(scene, -3.5, y0, 6.5, 3.0, 0.8, 0.7, matFurnitureDark);  // couch
    addWall(scene, 2, y0, 4, 1.0, 0.8, 1.0, matFurniture);        // side table
    addWall(scene, 3.5, y0, 6, 0.7, 1.5, 0.7, matFurnitureDark);  // cabinet

    // Kitchen: counter, table
    addWall(scene, 8.5, y0, -6, 2.5, 0.9, 0.7, matMetal);   // counter
    addWall(scene, 5, y0, -4, 1.5, 0.75, 1.5, matFurniture); // kitchen table

    // Office: desk, shelves
    addWall(scene, -7, y0, -5, 2.0, 0.75, 1.0, matFurniture);   // desk
    addWall(scene, -9, y0, -3, 0.5, 2.0, 1.5, matFurnitureDark); // bookshelf
    addWall(scene, -5.5, y0, -7, 1.0, 0.5, 0.6, matFurniture);  // filing cabinet

    // Utility room: shelving, crates
    addWall(scene, -8, y0, 5, 1.2, 1.5, 0.6, matMetal);  // shelving
    addWall(scene, -7, y0, 7, 1.0, 1.0, 1.0, matCrate);  // crate

    // Hallway: small table
    addWall(scene, 0, y0, 0.5, 0.8, 0.7, 0.5, matFurniture);

    // =====================
    // TOP FLOOR (y = WALL_HEIGHT)
    // =====================
    const y1 = wh;

    // Exterior walls (top floor)
    // South wall
    addWall(scene, 0, y1, hz, hx * 2, wh, wt, matWallExt);
    // North wall
    addWall(scene, 0, y1, -hz, hx * 2, wh, wt, matWallExt);
    // West wall
    addWall(scene, -hx, y1, 0, wt, wh, hz * 2, matWallExt);
    // East wall
    addWall(scene, hx, y1, 0, wt, wh, hz * 2, matWallExt);

    // Windows (visual gaps - cut away portions of walls for visual effect)
    // We'll add window frames as thin elements
    // South windows
    addWindowFrame(scene, -5, y1 + 1.0, hz + 0.05, 1.5, 1.5);
    addWindowFrame(scene, 5, y1 + 1.0, hz + 0.05, 1.5, 1.5);
    // North windows
    addWindowFrame(scene, -5, y1 + 1.0, -hz - 0.05, 1.5, 1.5);
    addWindowFrame(scene, 5, y1 + 1.0, -hz - 0.05, 1.5, 1.5);

    // Top floor ceiling
    addFloor(scene, 0, y1 + wh, 0, hx * 2, hz * 2, matCeiling);

    // Interior walls (top floor)
    // Bedroom 1: NW (x: -10 to -2, z: -8 to 0)
    addWall(scene, -2, y1, -4, wt, wh, 8, matWallInt);
    // Bedroom 2: NE (x: 2 to 10, z: -8 to 0)
    addWall(scene, 2, y1, -4, wt, wh, 8, matWallInt);
    // Central hallway gap between bedrooms
    // Security room: SW (x: -10 to -3, z: 0 to 8)
    addWall(scene, -3, y1, 4, wt, wh, 8, matWallInt);
    // Open area / stair landing: SE

    // Top floor hallway wall (z = 0, with doors)
    addWall(scene, -6, y1, 0, 5, wh, wt, matWallInt);
    addWall(scene, 6, y1, 0, 5, wh, wt, matWallInt);
    // center gap for hallway access

    // Furniture (top floor)
    // Bedroom 1: bed, nightstand
    addWall(scene, -7, y1, -5, 2.0, 0.6, 1.2, matFurnitureDark); // bed
    addWall(scene, -5.5, y1, -6.5, 0.5, 0.5, 0.5, matFurniture);  // nightstand

    // Bedroom 2: bed, wardrobe
    addWall(scene, 6, y1, -5, 2.0, 0.6, 1.2, matFurnitureDark); // bed
    addWall(scene, 8.5, y1, -7, 1.5, 2.0, 0.6, matFurnitureDark); // wardrobe

    // Security room: desk, equipment
    addWall(scene, -7, y1, 3, 2.5, 0.75, 1.0, matFurniture); // desk
    addWall(scene, -9, y1, 6, 0.6, 1.8, 1.2, matMetal);      // equipment rack

    // Balcony / overlook positions marked by low walls at windows
    addWall(scene, -5, y1, 7.3, 2.0, 0.8, 0.4, matWallExt); // balcony railing

    // =====================
    // BASEMENT (y = -WALL_HEIGHT)
    // =====================
    const yB = -wh;

    // Basement exterior walls
    addWall(scene, 0, yB, hz, hx * 2, wh, wt, matWallExtDark);
    addWall(scene, 0, yB, -hz, hx * 2, wh, wt, matWallExtDark);
    addWall(scene, -hx, yB, 0, wt, wh, hz * 2, matWallExtDark);
    addWall(scene, hx, yB, 0, wt, wh, hz * 2, matWallExtDark);

    // Basement floor
    addFloor(scene, 0, yB - FLOOR_THICKNESS / 2, 0, hx * 2, hz * 2, matFloorBasement);

    // Ceiling is main floor (already added)

    // Basement interior walls
    // Storage: NW area
    addWall(scene, -3, yB, -4, wt, wh, 8, matWallIntDark);
    // Bunker room: NE area
    addWall(scene, 3, yB, -4, wt, wh, 8, matWallIntDark);
    // Hallway wall (z = 0)
    addWall(scene, -6, yB, 0, 5, wh, wt, matWallIntDark);
    addWall(scene, 6, yB, 0, 5, wh, wt, matWallIntDark);

    // Basement furniture
    addWall(scene, -7, yB, -5, 2.0, 1.5, 1.0, matCrate);   // storage crates
    addWall(scene, -6, yB, -6, 1.5, 1.0, 1.0, matCrate);
    addWall(scene, 6, yB, -5, 1.2, 2.0, 0.5, matMetal);    // shelving
    addWall(scene, 8, yB, -3, 0.8, 0.9, 0.8, matMetal);    // utility box
    addWall(scene, 0, yB, 5, 2.0, 1.0, 1.5, matCrate);     // center crates
    addWall(scene, -7, yB, 5, 1.5, 0.5, 3.0, matFurnitureDark); // workbench

    // Basement hatch access from outside (NW corner exterior)
    // Stairs marker only - no physical door
    const basementAccessMarker = new THREE.Mesh(boxGeo, matMetal);
    basementAccessMarker.scale.set(2, 0.1, 2);
    basementAccessMarker.position.set(-hx - 2, 0.05, -hz + 2);
    scene.add(basementAccessMarker);

    // =====================
    // STAIRS
    // =====================
    buildStairs(scene, y0, y1, yB, hx, hz);

    // =====================
    // BOMB SITE MARKER
    // =====================
    // Bomb site in the living room area, main floor
    const bombMarker = new THREE.Mesh(boxGeo, matBombSite);
    bombMarker.scale.set(1.5, 0.08, 1.5);
    bombMarker.position.set(0, 0.04, 5);
    scene.add(bombMarker);

    // Glowing ring around bomb site
    const ringGeo = new THREE.RingGeometry(0.8, 1.0, 24);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(0, 0.06, 5);
    scene.add(ring);

    // =====================
    // ROOF
    // =====================
    addFloor(scene, 0, y1 + wh + 0.1, 0, hx * 2 + 1, hz * 2 + 1, matRoof);
    // Slight roof overhang
}

// Staircase geometry
function buildStairs(scene, y0, y1, yB, hx, hz) {
    const stairW = 1.5;
    const steps = 10;
    const stepH = WALL_HEIGHT / steps;
    const stepD = 3.0 / steps;

    // Stairs from main floor to top floor (east side, z: -1 to 2)
    for (let i = 0; i < steps; i++) {
        const sy = y0 + stepH * i;
        const sz = -1 + stepD * i;
        addWall(scene, hx - 1.5, sy, sz, stairW, stepH, stepD, matFloorWood);
    }

    // Stairs from main floor down to basement (west side, z: -6 to -3)
    for (let i = 0; i < steps; i++) {
        const sy = y0 - stepH * (i + 1);
        const sz = -6 + stepD * i;
        addWall(scene, -hx + 1.5, sy, sz, stairW, stepH, stepD, matFloorConcrete);
    }
}

// Window frame decoration
function addWindowFrame(scene, x, y, z, w, h) {
    const frameMat = makeMat(0x404040);
    const t = 0.06;
    // Top
    const top = new THREE.Mesh(boxGeo, frameMat);
    top.scale.set(w + 0.1, t, t);
    top.position.set(x, y + h / 2, z);
    scene.add(top);
    // Bottom
    const bot = new THREE.Mesh(boxGeo, frameMat);
    bot.scale.set(w + 0.1, t, t);
    bot.position.set(x, y - h / 2, z);
    scene.add(bot);
    // Left
    const left = new THREE.Mesh(boxGeo, frameMat);
    left.scale.set(t, h, t);
    left.position.set(x - w / 2, y, z);
    scene.add(left);
    // Right
    const right = new THREE.Mesh(boxGeo, frameMat);
    right.scale.set(t, h, t);
    right.position.set(x + w / 2, y, z);
    scene.add(right);
}

// ============================================================
// WAYPOINTS - Navigation nodes for AI pathfinding
// ============================================================
function buildWaypoints() {
    const g = waypointGraph;

    // Outdoor waypoints
    const o0 = g.addNode(0, 0, 18);      // south approach (gate)
    const o1 = g.addNode(-22, 0, 12);    // west approach
    const o2 = g.addNode(-22, 0, -12);   // west far
    const o3 = g.addNode(22, 0, 12);     // east approach
    const o4 = g.addNode(22, 0, -12);    // east far
    const o5 = g.addNode(0, 0, -18);     // north approach
    const o6 = g.addNode(-12, 0, 14);    // SW yard
    const o7 = g.addNode(12, 0, 14);     // SE yard
    const o8 = g.addNode(-12, 0, -14);   // NW yard
    const o9 = g.addNode(12, 0, -14);    // NE yard
    const o10 = g.addNode(0, 0, 12);     // front of house
    const o11 = g.addNode(-12, 0, 0);    // west of house
    const o12 = g.addNode(12, 0, 0);     // east of house
    const o13 = g.addNode(0, 0, -12);    // north of house

    // Connect outdoor nodes
    g.connect(o0, o6); g.connect(o0, o7); g.connect(o0, o10);
    g.connect(o1, o6); g.connect(o1, o2); g.connect(o1, o11);
    g.connect(o2, o8); g.connect(o2, o11);
    g.connect(o3, o7); g.connect(o3, o4); g.connect(o3, o12);
    g.connect(o4, o9); g.connect(o4, o12);
    g.connect(o5, o8); g.connect(o5, o9); g.connect(o5, o13);
    g.connect(o6, o10); g.connect(o6, o11);
    g.connect(o7, o10); g.connect(o7, o12);
    g.connect(o8, o13); g.connect(o8, o11);
    g.connect(o9, o13); g.connect(o9, o12);
    g.connect(o10, o11); g.connect(o10, o12);
    g.connect(o11, o13); g.connect(o12, o13);

    // Main floor waypoints
    const m0 = g.addNode(0, 0.5, 7);     // front door entry / living room south
    const m1 = g.addNode(0, 0.5, 5);     // bomb site area
    const m2 = g.addNode(0, 0.5, 3);     // living room north
    const m3 = g.addNode(0, 0.5, 0.5);   // hallway center
    const m4 = g.addNode(-7, 0.5, 0.5);  // hallway west
    const m5 = g.addNode(7, 0.5, 0.5);   // hallway east
    const m6 = g.addNode(-7, 0.5, -4);   // office
    const m7 = g.addNode(6, 0.5, -4);    // kitchen
    const m8 = g.addNode(-7, 0.5, 5);    // utility room
    const m9 = g.addNode(8, 0.5, 0);     // stair landing (up)
    const m10 = g.addNode(-8.5, 0.5, -4.5);  // stair landing (down)
    const m11 = g.addNode(4, 0.5, -7);   // back door area

    g.connect(o10, m0); // exterior to front door
    g.connect(o11, m8); // exterior to side door
    g.connect(o13, m11); // exterior to back door
    g.connect(m0, m1); g.connect(m1, m2); g.connect(m2, m3);
    g.connect(m3, m4); g.connect(m3, m5);
    g.connect(m4, m6); g.connect(m4, m8);
    g.connect(m5, m7); g.connect(m5, m9);
    g.connect(m6, m10); g.connect(m7, m11);
    g.connect(m0, m8); // living room to utility

    // Top floor waypoints
    const t0 = g.addNode(8, WALL_HEIGHT + 0.5, 1);     // stair top
    const t1 = g.addNode(0, WALL_HEIGHT + 0.5, 1);     // hallway center
    const t2 = g.addNode(-6, WALL_HEIGHT + 0.5, -4);   // bedroom 1
    const t3 = g.addNode(6, WALL_HEIGHT + 0.5, -4);    // bedroom 2
    const t4 = g.addNode(-6, WALL_HEIGHT + 0.5, 4);    // security room
    const t5 = g.addNode(4, WALL_HEIGHT + 0.5, 5);     // open area

    g.connect(m9, t0); // stairs connection
    g.connect(t0, t1); g.connect(t0, t5);
    g.connect(t1, t2); g.connect(t1, t3); g.connect(t1, t4);
    g.connect(t4, t5);

    // Basement waypoints
    const b0 = g.addNode(-8.5, -WALL_HEIGHT + 0.5, -4.5);  // stair bottom
    const b1 = g.addNode(0, -WALL_HEIGHT + 0.5, -4);    // basement center north
    const b2 = g.addNode(-6, -WALL_HEIGHT + 0.5, -5);   // storage
    const b3 = g.addNode(6, -WALL_HEIGHT + 0.5, -5);    // bunker
    const b4 = g.addNode(0, -WALL_HEIGHT + 0.5, 4);     // basement south
    const b5 = g.addNode(-6, -WALL_HEIGHT + 0.5, 4);    // basement SW

    g.connect(m10, b0); // stairs connection
    g.connect(b0, b2); g.connect(b0, b1);
    g.connect(b1, b3); g.connect(b1, b4);
    g.connect(b2, b5); g.connect(b4, b5);
}

// ============================================================
// LIGHTING
// ============================================================
function buildLighting(scene) {
    // Ambient light (soft overall illumination)
    const ambient = new THREE.AmbientLight(0x556677, 0.6);
    scene.add(ambient);

    // Directional sunlight
    const sun = new THREE.DirectionalLight(0xffeedd, 1.0);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -50;
    sun.shadow.camera.right = 50;
    sun.shadow.camera.top = 50;
    sun.shadow.camera.bottom = -50;
    scene.add(sun);

    // Hemisphere light for sky/ground color blend
    const hemi = new THREE.HemisphereLight(0x88aacc, 0x445533, 0.4);
    scene.add(hemi);

    // Point lights inside the house for interior ambiance
    const interiorLight1 = new THREE.PointLight(0xffe8cc, 0.6, 15);
    interiorLight1.position.set(0, 2.5, 5);
    scene.add(interiorLight1);

    const interiorLight2 = new THREE.PointLight(0xffe8cc, 0.4, 12);
    interiorLight2.position.set(-6, 2.5, -4);
    scene.add(interiorLight2);

    const interiorLight3 = new THREE.PointLight(0xffe8cc, 0.4, 12);
    interiorLight3.position.set(6, 2.5, -4);
    scene.add(interiorLight3);

    // Basement dim light
    const basementLight = new THREE.PointLight(0xaabbcc, 0.3, 16);
    basementLight.position.set(0, -WALL_HEIGHT + 2.5, 0);
    scene.add(basementLight);

    // Top floor lights
    const topLight = new THREE.PointLight(0xffe8cc, 0.4, 14);
    topLight.position.set(0, WALL_HEIGHT + 2.5, 0);
    scene.add(topLight);

    // Fog for atmosphere
    scene.fog = new THREE.FogExp2(0x445544, 0.012);
}

// ============================================================
// BOMB SITE POSITION (exported for objective system)
// ============================================================
export const BOMB_SITE = { x: 0, y: 0.5, z: 5 };

// ============================================================
// PICKUP SPAWN POSITIONS
// ============================================================
export const PICKUP_SPAWNS = [
    // Outdoor
    { x: -18, y: 0.3, z: -6, type: 'ammo', amount: 30 },
    { x: 20, y: 0.3, z: 6, type: 'armor', amount: 25 },
    { x: -16, y: 0.3, z: 10, type: 'med', amount: 35 },
    { x: 15, y: 0.3, z: -15, type: 'ammo', amount: 20 },
    // Main floor
    { x: -7, y: 0.3, z: 7, type: 'ammo', amount: 24 },
    { x: 5, y: 0.3, z: -4, type: 'med', amount: 30 },
    { x: -7, y: 0.3, z: -5, type: 'armor', amount: 20 },
    // Top floor
    { x: -6, y: WALL_HEIGHT + 0.3, z: 4, type: 'ammo', amount: 18 },
    { x: 6, y: WALL_HEIGHT + 0.3, z: -5, type: 'med', amount: 25 },
    // Basement
    { x: -7, y: -WALL_HEIGHT + 0.3, z: -5, type: 'armor', amount: 30 },
    { x: 0, y: -WALL_HEIGHT + 0.3, z: 5, type: 'ammo', amount: 20 },
];

// ============================================================
// ENEMY SPAWN POSITIONS
// ============================================================
export const ENEMY_SPAWNS = [
    // Outdoor patrols
    { x: -15, y: 0, z: 12, role: 'patrol' },
    { x: 18, y: 0, z: -10, role: 'patrol' },
    { x: 10, y: 0, z: 16, role: 'patrol' },
    // Perimeter guards
    { x: -20, y: 0, z: -14, role: 'sentry' },
    { x: 20, y: 0, z: 6, role: 'sentry' },
    { x: 0, y: 0, z: 18, role: 'sentry' },
    // Interior defenders (main floor)
    { x: 0, y: 0.5, z: 4, role: 'interior' },
    { x: -7, y: 0.5, z: 0.5, role: 'interior' },
    { x: 6, y: 0.5, z: -4, role: 'interior' },
    // Top floor overwatch
    { x: -5, y: WALL_HEIGHT + 0.5, z: 4, role: 'overwatch' },
    { x: 6, y: WALL_HEIGHT + 0.5, z: -4, role: 'overwatch' },
    // Basement defender
    { x: 0, y: -WALL_HEIGHT + 0.5, z: 0, role: 'heavy' },
    // Hardpoint defender
    { x: 1, y: 0.5, z: 6, role: 'hardpoint' },
];

// Post-plant reinforcement spawns (from outside compound)
export const REINFORCEMENT_SPAWNS = [
    { x: 0, y: 0, z: 24 },       // south gate
    { x: -28, y: 0, z: 0 },      // west breach
    { x: 28, y: 0, z: -10 },     // east side
    { x: 0, y: 0, z: -24 },      // north
    { x: -20, y: 0, z: 18 },     // SW corner
    { x: 20, y: 0, z: 18 },      // SE corner
];

// Player spawn position
export const PLAYER_SPAWN = { x: 0, y: 0, z: 50 };
