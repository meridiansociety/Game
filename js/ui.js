// ============================================================
// ui.js - HUD, menus, crosshair, all UI state management
// ============================================================

import { formatTime, clamp } from './utils.js';
import { PHASE } from './objective.js';

export class UIManager {
    constructor() {
        // Cache DOM elements
        this.el = {
            hud: document.getElementById('hud'),
            healthText: document.getElementById('healthText'),
            healthBar: document.getElementById('healthBarFill'),
            armorText: document.getElementById('armorText'),
            armorBar: document.getElementById('armorBarFill'),
            weaponText: document.getElementById('weaponText'),
            ammoText: document.getElementById('ammoText'),
            enemyText: document.getElementById('enemyText'),
            statusText: document.getElementById('statusText'),
            missionTimerText: document.getElementById('missionTimerText'),
            bombText: document.getElementById('bombText'),
            defuseText: document.getElementById('defuseText'),
            centerMessage: document.getElementById('centerMessage'),
            progressWrap: document.getElementById('progressWrap'),
            progressBar: document.getElementById('progressBar'),
            damageOverlay: document.getElementById('damageOverlay'),
            hitMarker: document.getElementById('hitMarker'),
            crosshair: document.getElementById('crosshair'),
            menuOverlay: document.getElementById('menuOverlay'),
            menuTitle: document.getElementById('menuTitle'),
            menuDesc: document.getElementById('menuDesc'),
            startBtn: document.getElementById('startBtn'),
            restartBtn: document.getElementById('restartBtn'),
            compassDir: document.getElementById('compassDir'),
        };

        this.messageTimeout = null;
    }

    showMessage(msg, duration = 1500) {
        this.el.centerMessage.textContent = msg;
        this.el.centerMessage.style.display = 'block';
        clearTimeout(this.messageTimeout);
        this.messageTimeout = setTimeout(() => {
            this.el.centerMessage.style.display = 'none';
        }, duration);
    }

    hideMessage() {
        this.el.centerMessage.style.display = 'none';
    }

    update(player, objective, enemyCount) {
        if (!player) return;

        // Health
        const hp = Math.floor(player.health);
        this.el.healthText.textContent = hp;
        this.el.healthBar.style.width = `${hp}%`;
        this.el.healthBar.style.background = hp < 30 ? '#ff4444' : hp < 60 ? '#ffaa44' : '#44cc66';

        // Armor
        const armor = Math.floor(player.armor);
        this.el.armorText.textContent = armor;
        this.el.armorBar.style.width = `${armor}%`;

        // Weapon
        const wep = player.weaponManager.current;
        this.el.weaponText.textContent = wep.name + (wep.reloading ? ' [RELOADING]' : '');
        this.el.ammoText.textContent = wep.ammoDisplay;

        // Ammo color
        if (wep.mag <= 0) {
            this.el.ammoText.style.color = '#ff6666';
        } else if (wep.mag <= wep.magSize * 0.3) {
            this.el.ammoText.style.color = '#ffcc44';
        } else {
            this.el.ammoText.style.color = '#ffffff';
        }

        // Enemies
        this.el.enemyText.textContent = enemyCount;

        // Mission timer
        this.el.missionTimerText.textContent = formatTime(objective.missionTimer);
        if (objective.missionTimer < 60) {
            this.el.missionTimerText.style.color = '#ff6666';
        } else if (objective.missionTimer < 180) {
            this.el.missionTimerText.style.color = '#ffcc44';
        } else {
            this.el.missionTimerText.style.color = '#ffffff';
        }

        // Objective status
        this.updateObjectiveUI(objective, player);

        // Damage overlay
        if (player.damageFlashAlpha > 0) {
            this.el.damageOverlay.style.background = `rgba(255, 0, 0, ${player.damageFlashAlpha})`;
        } else {
            this.el.damageOverlay.style.background = 'transparent';
        }

        // Hit marker
        this.el.hitMarker.style.opacity = player.hitMarkerTimer > 0 ? '1' : '0';

        // Compass
        this.updateCompass(player.yaw);
    }

    updateObjectiveUI(objective, player) {
        // Status text
        switch (objective.phase) {
            case PHASE.INFILTRATE:
                this.el.statusText.textContent = 'Infiltrate the compound';
                this.el.statusText.style.color = '#aaccff';
                break;
            case PHASE.ASSAULT:
                this.el.statusText.textContent = 'Reach the bomb site and plant';
                this.el.statusText.style.color = '#ffcc44';
                break;
            case PHASE.PLANTING:
                this.el.statusText.textContent = 'PLANTING BOMB...';
                this.el.statusText.style.color = '#ff8844';
                break;
            case PHASE.POST_PLANT:
                this.el.statusText.textContent = 'Defend the bomb site!';
                this.el.statusText.style.color = '#ff4444';
                break;
            case PHASE.VICTORY:
                this.el.statusText.textContent = 'MISSION SUCCESS';
                this.el.statusText.style.color = '#44ff66';
                break;
            case PHASE.DEFEAT:
                this.el.statusText.textContent = 'MISSION FAILED';
                this.el.statusText.style.color = '#ff4444';
                break;
        }

        // Bomb text
        if (!objective.planted && !objective.detonated) {
            this.el.bombText.innerHTML = '<span style="color:#ffcc44">Not planted</span>';
        } else if (objective.planted && !objective.detonated) {
            const t = formatTime(objective.bombTimer);
            this.el.bombText.innerHTML = `<span style="color:#ff6644">DETONATION: ${t}</span>`;
        } else if (objective.detonated) {
            this.el.bombText.innerHTML = '<span style="color:#44ff66">DETONATED</span>';
        }

        // Defuse alert
        if (objective.isBeingDefused) {
            const pct = Math.floor(objective.defuseProgress * 100);
            this.el.defuseText.innerHTML = `<span style="color:#ff4444">ENEMY DEFUSING (${pct}%)</span>`;
        } else {
            this.el.defuseText.innerHTML = '<span style="color:#88ffaa">No defuse attempt</span>';
        }

        // Plant prompt and progress bar
        if (objective.isNearBombSite(player) && !objective.planted) {
            this.el.centerMessage.textContent = 'Hold [E] to plant bomb';
            this.el.centerMessage.style.display = 'block';
            this.el.progressWrap.style.display = 'block';
            this.el.progressBar.style.width = `${objective.plantProgress * 100}%`;
        } else if (objective.phase !== PHASE.PLANTING) {
            if (this.el.centerMessage.textContent === 'Hold [E] to plant bomb') {
                this.el.centerMessage.style.display = 'none';
            }
            this.el.progressWrap.style.display = 'none';
        }

        // Show planting progress even when planting
        if (objective.phase === PHASE.PLANTING) {
            this.el.progressWrap.style.display = 'block';
            this.el.progressBar.style.width = `${objective.plantProgress * 100}%`;
        }
    }

    updateCompass(yaw) {
        // Convert yaw to compass direction
        const deg = (((-yaw * 180 / Math.PI) % 360) + 360) % 360;
        const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        const index = Math.round(deg / 45) % 8;
        this.el.compassDir.textContent = `${directions[index]} ${Math.floor(deg)}°`;
    }

    showMenu(title, description, showStart, showRestart) {
        this.el.menuOverlay.style.display = 'flex';
        this.el.menuTitle.textContent = title;
        this.el.menuDesc.textContent = description;
        this.el.startBtn.style.display = showStart ? 'inline-block' : 'none';
        this.el.restartBtn.style.display = showRestart ? 'inline-block' : 'none';
    }

    hideMenu() {
        this.el.menuOverlay.style.display = 'none';
    }

    showHUD() {
        this.el.hud.style.display = 'block';
    }

    hideHUD() {
        this.el.hud.style.display = 'none';
    }
}
