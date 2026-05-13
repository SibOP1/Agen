# Project Plan: Game Expansion & Mobile Support

## Objective
Implement a multi-stage startup menu (Platform -> Map -> Mode), add native mobile support with virtual controls, and fix the scroll wheel weapon switching.

## Key Files & Context
- `index.html`: UI for menus and mobile controls.
- `main.js`: Input handling (PC/Mobile), game initialization, and scroll wheel fix.
- `weaponSystem.js`: Mode-based weapon restrictions.
- `networkManager.js`: Syncing map/mode settings with peers.

## Implementation Steps

### Phase 1: Multi-Step Menu & Map Selection
1.  **Refactor `index.html`**:
    *   Create a `#start-menu` overlay with three screens: `platform-select`, `map-select`, and `mode-select`.
    *   Style screens as centered cards with large buttons.
2.  **Update `main.js`**:
    *   Modify `constructor` to show the first menu screen instead of requesting pointer lock immediately.
    *   Add event listeners for menu buttons to advance through the selection.
    *   Remove keys 8, 9, 0 to prevent in-game map switching.

### Phase 2: Mobile Support & Virtual Controls
1.  **UI Updates (`index.html`)**:
    *   Add a `#mobile-controls` div containing:
        *   `#joystick-container`: For movement.
        *   Action buttons: `Shoot`, `Jump`, `Reload`, `Switch`.
2.  **Input Logic (`main.js`)**:
    *   If "Mobile" is selected:
        *   Enable `touchstart`, `touchmove`, `touchend` listeners.
        *   Implement a virtual joystick that updates `this.keys` based on thumb position.
        *   Implement touch-swipe camera rotation (right side of screen).
    *   Adjust responsiveness in CSS to ensure the UI fits small screens.

### Phase 3: Game Modes & UI Polish
1.  **Mode Logic**:
    *   Store `selectedMode` in the `Game` class.
    *   **Time-Based**: Add a 5-minute countdown display in the HUD.
    *   **Sniper Deathmatch**: Automatically switch to Sniper and lock weapon switching.
2.  **Scroll Wheel Fix**:
    *   Debug and re-implement the `wheel` event listener to ensure it works correctly when the game is locked.

### Phase 4: Networking & Deployment Preparation
1.  **Sync Settings**: Update `NetworkManager` to broadcast the current map and mode so joining players load into the correct session.
2.  **Final Polish**: Ensure the toolbar is animated and correctly positioned on mobile.

## Verification & Testing
- **PC Test**: 
    - Full menu flow (PC -> Sci-Fi -> Endless FFA).
    - Verify WASD and Mouse Look.
    - Verify Scroll Wheel weapon switching.
- **Mobile Simulation**: 
    - Full menu flow (Mobile -> Desert -> Sniper Deathmatch).
    - Verify Joystick movement.
    - Verify Touch-swipe camera.
    - Verify buttons (Shoot, Jump).
- **Network Test**: 
    - Open two tabs, host a game on one, join with the other. 
    - Verify they are on the same map.
