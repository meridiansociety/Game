// ============================================================
// objective.js - Bomb plant/defuse system and mission flow
// ============================================================

import { dist2D } from './utils.js';
import {
    playPlantStart, startBombBeep, stopBombBeep,
    playExplosion, playDefuseAlert, playVictory, playDefeat
} from './audio.js';

// Mission phases
export const PHASE = {
    INFILTRATE: 'infiltrate',
    ASSAULT: 'assault',
    PLANTING: 'planting',
    POST_PLANT: 'post_plant',
    VICTORY: 'victory',
    DEFEAT: 'defeat',
};

// Bomb constants
const PLANT_DURATION = 5.0;          // seconds to plant
const BOMB_TIMER = 60;               // seconds until detonation
const DEFUSE_DURATION = 7.0;         // seconds to defuse
const PLANT_INTERACT_RANGE = 2.5;    // how close player must be
const MISSION_TIME_LIMIT = 900;      // 15 minutes

export class ObjectiveManager {
    constructor(bombSitePosition) {
        this.bombPosition = bombSitePosition;

        // Bomb state
        this.planted = false;
        this.plantProgress = 0;       // 0 to 1
        this.bombTimer = 0;           // countdown after plant
        this.detonated = false;

        // Defuse state
        this.defuseProgress = 0;      // 0 to 1
        this.isBeingDefused = false;
        this.defuseAlertPlayed = false;

        // Mission state
        this.phase = PHASE.INFILTRATE;
        this.missionTimer = MISSION_TIME_LIMIT;
        this.resultReason = '';
        this.reinforcementsTriggered = false;
    }

    get position() {
        return this.bombPosition;
    }

    update(dt, player, enemyManager) {
        if (this.phase === PHASE.VICTORY || this.phase === PHASE.DEFEAT) return;

        // Mission timer
        this.missionTimer -= dt;
        if (this.missionTimer <= 0) {
            this.missionTimer = 0;
            this.lose('Mission timer expired - 15 minutes elapsed.');
            return;
        }

        // Check player alive
        if (!player.alive) {
            this.lose('You were killed in action.');
            return;
        }

        // Phase-specific updates
        if (!this.planted) {
            this.updatePrePlant(dt, player);
        } else if (!this.detonated) {
            this.updatePostPlant(dt, player, enemyManager);
        }
    }

    updatePrePlant(dt, player) {
        // Determine phase based on player position
        const insideCompound = Math.abs(player.x) < 26 && Math.abs(player.z) < 22;
        const insideHouse = Math.abs(player.x) < 10 && Math.abs(player.z) < 8;

        if (insideHouse) {
            this.phase = PHASE.ASSAULT;
        } else if (insideCompound) {
            this.phase = PHASE.ASSAULT;
        } else {
            this.phase = PHASE.INFILTRATE;
        }

        // Check if player is near bomb site and holding interact
        const d = dist2D(player.x, player.z, this.bombPosition.x, this.bombPosition.z);
        const sameFloor = Math.abs(player.y - this.bombPosition.y) < 2;

        if (d < PLANT_INTERACT_RANGE && sameFloor && player.interactHeld) {
            // Planting
            this.phase = PHASE.PLANTING;
            this.plantProgress += dt / PLANT_DURATION;

            if (this.plantProgress >= 1) {
                this.plantBomb();
            }
        } else {
            // Cancel plant if moved away or released key
            if (this.plantProgress > 0) {
                this.plantProgress = Math.max(0, this.plantProgress - dt * 0.5);
            }
        }
    }

    plantBomb() {
        this.planted = true;
        this.plantProgress = 1;
        this.bombTimer = BOMB_TIMER;
        this.phase = PHASE.POST_PLANT;
        this.reinforcementsTriggered = true;
        playPlantStart();
        startBombBeep();
    }

    updatePostPlant(dt, player, enemyManager) {
        this.phase = PHASE.POST_PLANT;

        // Bomb countdown
        this.bombTimer -= dt;
        if (this.bombTimer <= 0) {
            this.detonate(player);
            return;
        }

        // Check for defuse attempts
        const defuser = enemyManager.getDefusingEnemy();
        if (defuser) {
            this.isBeingDefused = true;
            this.defuseProgress += dt / DEFUSE_DURATION;

            if (!this.defuseAlertPlayed) {
                this.defuseAlertPlayed = true;
                playDefuseAlert();
            }

            if (this.defuseProgress >= 1) {
                // Bomb defused - player loses
                this.planted = false;
                this.defuseProgress = 0;
                stopBombBeep();
                this.lose('Enemy forces defused the bomb.');
                return;
            }
        } else {
            this.isBeingDefused = false;
            this.defuseProgress = Math.max(0, this.defuseProgress - dt * 0.3);
            this.defuseAlertPlayed = false;
        }
    }

    detonate(player) {
        this.detonated = true;
        stopBombBeep();
        playExplosion();

        if (player.alive) {
            this.win();
        } else {
            this.lose('You were killed before the bomb detonated.');
        }
    }

    win() {
        this.phase = PHASE.VICTORY;
        this.resultReason = 'Bomb detonated! Safehouse destroyed.';
        playVictory();
    }

    lose(reason) {
        this.phase = PHASE.DEFEAT;
        this.resultReason = reason;
        stopBombBeep();
        playDefeat();
    }

    // Check if player is near bomb site (for UI prompt)
    isNearBombSite(player) {
        const d = dist2D(player.x, player.z, this.bombPosition.x, this.bombPosition.z);
        const sameFloor = Math.abs(player.y - this.bombPosition.y) < 2;
        return d < PLANT_INTERACT_RANGE && sameFloor && !this.planted;
    }

    reset(bombSitePosition) {
        this.bombPosition = bombSitePosition;
        this.planted = false;
        this.plantProgress = 0;
        this.bombTimer = 0;
        this.detonated = false;
        this.defuseProgress = 0;
        this.isBeingDefused = false;
        this.defuseAlertPlayed = false;
        this.phase = PHASE.INFILTRATE;
        this.missionTimer = MISSION_TIME_LIMIT;
        this.resultReason = '';
        this.reinforcementsTriggered = false;
        stopBombBeep();
    }
}
