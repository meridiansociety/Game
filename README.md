# Safehouse Assault - Browser Tactical FPS

A single-player first-person tactical shooter built entirely in the browser using Three.js. Assault a fortified forest safehouse, eliminate AI defenders, plant a bomb, and survive the detonation countdown.

## Quick Start

### Option 1: Local Server (Recommended)
```bash
# Python 3
python3 -m http.server 8000

# Node.js
npx serve .

# PHP
php -S localhost:8000
```
Then open `http://localhost:8000` in your browser.

### Option 2: GitHub Pages
Push to a GitHub repository and enable GitHub Pages in Settings. The game runs as a static site with no build step.

### Option 3: VS Code Live Server
Install the Live Server extension and click "Go Live" from the status bar.

> **Note:** The game uses ES modules, so it must be served over HTTP (not opened as a local file).

## Controls

| Key | Action |
|-----|--------|
| WASD | Move |
| Mouse | Aim |
| Left Click | Fire |
| Shift | Sprint |
| C | Crouch |
| Space | Jump |
| R | Reload |
| 1 / 2 | Switch weapon (Rifle / Pistol) |
| E | Interact / Plant bomb |

## Mission Flow

1. **Infiltrate** - Spawn outside the compound, approach through the forest
2. **Assault** - Fight through perimeter guards and breach the safehouse
3. **Plant** - Hold E at the bomb site (living room, main floor) for ~5 seconds
4. **Defend** - Survive 60 seconds while enemy reinforcements converge
5. **Win** - Bomb detonates while you're alive

## Lose Conditions
- Player killed
- Enemy defuses the bomb
- 15-minute mission timer expires

## Project Structure

```
/
├── index.html          # Entry point with HUD markup
├── style.css           # All UI styling
├── README.md           # This file
├── js/
│   ├── main.js         # Game init, loop, state management
│   ├── player.js       # First-person controller, health, armor
│   ├── weapon.js       # Rifle & pistol, shooting, reloading
│   ├── ai.js           # Enemy AI state machine, navigation
│   ├── map.js          # Procedural 3D map generation
│   ├── objective.js    # Bomb plant/defuse, mission phases
│   ├── ui.js           # HUD management
│   ├── audio.js        # Procedural Web Audio sounds
│   └── utils.js        # Math, collision, waypoint navigation
└── assets/             # Reserved for future asset files
```

## Architecture

- **Rendering**: Three.js with shadow mapping, fog, and hemisphere lighting
- **Collision**: Axis-aligned bounding boxes (AABB) with sliding movement
- **AI Navigation**: Waypoint graph with BFS pathfinding
- **AI Behavior**: State machine (guard, patrol, search, attack, push bomb, defuse)
- **Audio**: Procedural Web Audio API (no external sound files needed)
- **Physics**: Simple gravity with floor detection and stair slopes

## Expanding the Game

### Adding Real Assets
- Replace procedural geometry in `map.js` with loaded GLTF/GLB models
- Swap procedural audio in `audio.js` with real `.mp3`/`.ogg` files
- Add texture maps to materials

### Adding Weapons
- Add new weapon configs in `weapon.js` WEAPON_CONFIGS
- Register in WeaponManager constructor

### Tuning AI
- Adjust accuracy, fire rate, detection range in `ai.js` constants
- Modify waypoint graph in `map.js` buildWaypoints() for new patrol routes

### Adding Maps
- Create new map builder functions in `map.js`
- Rebuild collision boxes and waypoints for new layouts

## Browser Compatibility

Requires a modern browser with:
- WebGL 2.0
- ES Modules + Import Maps
- Pointer Lock API
- Web Audio API

Tested on Chrome 100+, Firefox 110+, Safari 16+, Edge 100+.
