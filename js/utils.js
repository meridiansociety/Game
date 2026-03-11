// ============================================================
// utils.js - Math utilities, collision helpers, constants
// ============================================================

import * as THREE from 'three';

// --------------- Constants ---------------
export const WALL_HEIGHT = 3.2;
export const FLOOR_THICKNESS = 0.3;
export const WALL_THICKNESS = 0.3;
export const GRAVITY = 20;
export const PLAYER_HEIGHT = 1.7;
export const PLAYER_RADIUS = 0.35;
export const ENEMY_RADIUS = 0.4;
export const ENEMY_HEIGHT = 1.8;

// --------------- Math helpers ---------------
export function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function rand(min, max) {
    return min + Math.random() * (max - min);
}

export function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
}

export function dist2D(ax, az, bx, bz) {
    return Math.hypot(ax - bx, az - bz);
}

export function angleBetween(ax, az, bx, bz) {
    return Math.atan2(bx - ax, bz - az);
}

export function formatTime(seconds) {
    seconds = Math.max(0, Math.floor(seconds));
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// --------------- AABB Collision System ---------------
// All collidable geometry stored as axis-aligned bounding boxes
export class AABB {
    constructor(minX, minY, minZ, maxX, maxY, maxZ) {
        this.minX = minX; this.minY = minY; this.minZ = minZ;
        this.maxX = maxX; this.maxY = maxY; this.maxZ = maxZ;
    }

    containsPoint(x, y, z) {
        return x >= this.minX && x <= this.maxX &&
               y >= this.minY && y <= this.maxY &&
               z >= this.minZ && z <= this.maxZ;
    }

    intersectsCircleXZ(cx, cz, cr, yMin, yMax) {
        // Check if a vertical cylinder (circle in XZ, range in Y) intersects this box
        if (yMax < this.minY || yMin > this.maxY) return false;
        const closestX = clamp(cx, this.minX, this.maxX);
        const closestZ = clamp(cz, this.minZ, this.maxZ);
        const dx = cx - closestX;
        const dz = cz - closestZ;
        return (dx * dx + dz * dz) < (cr * cr);
    }
}

// Global collision boxes list - populated by map.js
export const collisionBoxes = [];

// Check if a position (cylinder) collides with any wall
export function checkCollision(x, y, z, radius, height) {
    const yMin = y;
    const yMax = y + height;
    for (let i = 0; i < collisionBoxes.length; i++) {
        const box = collisionBoxes[i];
        if (box.intersectsCircleXZ(x, z, radius, yMin, yMax)) {
            return true;
        }
    }
    return false;
}

// Slide-based movement: try to move, slide along walls if blocked
export function moveWithCollision(x, y, z, dx, dz, radius, height) {
    let newX = x + dx;
    let newZ = z + dz;

    // Try full movement
    if (!checkCollision(newX, y, newZ, radius, height)) {
        return { x: newX, z: newZ };
    }
    // Try X only
    if (!checkCollision(newX, y, z, radius, height)) {
        return { x: newX, z: z };
    }
    // Try Z only
    if (!checkCollision(x, y, newZ, radius, height)) {
        return { x: x, z: newZ };
    }
    // Fully blocked
    return { x, z };
}

// Raycast against collision boxes for line-of-sight / bullet hits
export function raycastWalls(origin, direction, maxDist) {
    let closest = maxDist;
    const ray = new THREE.Ray(origin, direction);
    const boxMin = new THREE.Vector3();
    const boxMax = new THREE.Vector3();

    for (let i = 0; i < collisionBoxes.length; i++) {
        const box = collisionBoxes[i];
        boxMin.set(box.minX, box.minY, box.minZ);
        boxMax.set(box.maxX, box.maxY, box.maxZ);
        const aabb = new THREE.Box3(boxMin, boxMax);
        const hit = new THREE.Vector3();
        if (ray.intersectBox(aabb, hit)) {
            const d = origin.distanceTo(hit);
            if (d < closest) closest = d;
        }
    }
    return closest;
}

// Line-of-sight check between two points (XZ plane, checks wall occlusion)
export function hasLineOfSight(x1, y1, z1, x2, y2, z2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const dz = z2 - z1;
    const totalDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (totalDist < 0.1) return true;

    const dir = new THREE.Vector3(dx, dy, dz).normalize();
    const origin = new THREE.Vector3(x1, y1, z1);
    const wallDist = raycastWalls(origin, dir, totalDist);
    return wallDist >= totalDist - 0.1;
}

// --------------- Waypoint navigation ---------------
export class WaypointGraph {
    constructor() {
        this.nodes = []; // { id, x, y, z, neighbors: [id, ...] }
    }

    addNode(x, y, z) {
        const id = this.nodes.length;
        this.nodes.push({ id, x, y, z, neighbors: [] });
        return id;
    }

    connect(a, b) {
        if (!this.nodes[a].neighbors.includes(b)) this.nodes[a].neighbors.push(b);
        if (!this.nodes[b].neighbors.includes(a)) this.nodes[b].neighbors.push(a);
    }

    // Find nearest node to a position
    nearest(x, y, z) {
        let best = -1;
        let bestDist = Infinity;
        for (let i = 0; i < this.nodes.length; i++) {
            const n = this.nodes[i];
            const d = Math.abs(n.y - y) * 5 + dist2D(n.x, n.z, x, z);
            if (d < bestDist) {
                bestDist = d;
                best = i;
            }
        }
        return best;
    }

    // Simple BFS pathfinding
    findPath(startId, endId) {
        if (startId === endId) return [startId];
        const visited = new Set();
        const queue = [[startId]];
        visited.add(startId);

        while (queue.length > 0) {
            const path = queue.shift();
            const current = path[path.length - 1];

            for (const neighbor of this.nodes[current].neighbors) {
                if (neighbor === endId) return [...path, neighbor];
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push([...path, neighbor]);
                }
            }
        }
        return [startId]; // no path found, stay put
    }
}

// Global waypoint graph - populated by map.js
export const waypointGraph = new WaypointGraph();

// --------------- Material helpers ---------------
export function makeMat(color, roughness = 0.85) {
    return new THREE.MeshLambertMaterial({ color });
}

export function makeEmissiveMat(color, emissive, intensity = 0.3) {
    return new THREE.MeshLambertMaterial({ color, emissive, emissiveIntensity: intensity });
}
