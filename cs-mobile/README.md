# 反恐行动：沙城（CS 风格网页手游）

A Counter-Strike–style mobile shooter that runs in the browser. It uses three.js with a touch-first control
scheme. Everything is static files, so open `index.html` from any web server; there is no build step.

```bash
cd cs-mobile
python3 -m http.server 8080      # then open http://<电脑IP>:8080 on your phone (landscape)
```

## 玩法 / Features

- **地图「沙城」**: an enlarged (≈160 m) Dust2-style desert map with Long A + pit, Catwalk/Short A, Mid with mid doors and "xbox",
  upper/lower B tunnels, B doors/window, and both bomb sites. Raised platforms, stairs, covered tunnels and penetrable doors/crates are included.
  Buildings use real PBR sandstone/plaster textures, Poly Haven props and a baked sun-shadow map.
- **模式**: 爆破模式 (5v5 bomb defusal, first to 8, freeze/buy time, C4 plant 3.2 s, defuse 10 s / 5 s with kit, 40 s bomb timer)
  and 团队竞技 (5v5 TDM, instant respawn, first to 50).
- **CS 枪械手感**: CS:GO stats for damage, armor penetration, RPM, magazine size, range falloff, movement speed and kill reward.
  Fixed spray patterns (AK goes up, then left, then right). Accuracy drops while moving or jumping, and counter-strafing restores it.
  Crouching tightens the spread. Headshots deal ×4, helmets reduce headshot damage, bullets penetrate walls with damage falloff,
  shotgun pellets add up, the AWP scope has 2 zoom levels, and knife backstabs do extra damage.
- **枪声**: real recorded firearm audio per weapon. Near and far recordings are crossfaded by distance. On top of that:
  low-frequency body layering, convolution reverb, wall-occlusion low-pass, stereo panning and a compressor bus.
- **人机 AI**:
  - **Perception**: real line of sight, which smoke blocks; spotting distant targets takes time; bots hear gunfire and footsteps.
  - **Aim**: reaction time scales with skill. Aim starts with a flick error, then settles and tracks; head or body is chosen by skill.
  - **Shooting**: recoil compensation; tap, burst or spray depending on distance; counter-strafing; strafing between bursts; crouch-spraying.
  - **Survival**: retreats to reload and when low on health.
  - **Tactics**: T site executes along real routes, with grouping, a lurker, smoke and flash utility and post-plant positions.
    CTs hold angles, rotate on information, retake and defuse, save when there isn't time, and throw HE at enemies they hear.
- **经济**: $800 start, win $3250/$3500, loss bonus $1400 + $500 per loss streak, per-weapon kill rewards. Weapons drop on death and can be picked up.
- **手游操作**:
  - Floating left joystick: a light push walks silently, pushing to the edge runs.
  - Swipe the right half of the screen to aim.
  - The fire button also aims while held, and there is an optional left-side fire button.
  - Buttons for scope, jump, crouch (toggle or hold), reload, walk, inspect, pickup, plant/defuse, buy, radio commands, scoreboard and weapon slots.
  - Optional auto-fire and gyroscope aiming.
  - Desktop: WASD, mouse with pointer lock, R, Space, Ctrl, Shift, E, B, Tab, F, G, Z, 1–5.
- **HUD**:
  - A rotating radar with spotted enemies and the bomb, plus zone callouts.
  - Killfeed with weapon silhouettes and headshot/wallbang/assist markers.
  - Dynamic crosshair, hit markers and damage-direction arcs.
  - Flashbang whiteout and low-HP vignette.
  - Round banners, MVP and multi-kill banners (双杀/三杀/四杀/ACE).
  - Buy menu, scoreboard, spectating and a death cam.
- **大厅**:
  - Profile with rank and level, and a cinematic 3D backdrop.
  - Inventory with a 3D skin preview, equip and sell.
  - **武器箱开箱** case-opening roulette with CS rarity tiers and drop rates.
  - Weapon skins use real CC0 material scans through a triplanar shader, with wear.
  - Career stats, settings, and coins earned from matches.

## 代码结构

| 文件 | 内容 |
|---|---|
| `js/mapdata.js` | map layout (floors, platforms, stairs, roofs, walls, props, spawns, sites, bot holds and routes) |
| `js/world.js` | geometry builder, AABB collision, grid raycast with penetration info, nav grid + A* |
| `js/agent.js` | CS movement physics (friction, accel, air-strafe, jump, crouch, stairs), inventory, firing, recoil |
| `js/weapons.js` | weapon stats, spray patterns, damage model |
| `js/bot.js` | bot brain + team planner |
| `js/game.js` | match logic, bullets, grenades, bomb, economy, camera |
| `js/viewmodel.js` / `js/character.js` | first-person arms animation / third-person IK rifle pose |
| `js/effects.js` | instanced GPU particles, decals, casings, smoke volumes |
| `js/audio.js` | WebAudio engine |
| `js/hud.js`, `js/input.js`, `js/ui.js`, `js/icons.js`, `js/main.js` | HUD, controls, lobby, icon renderer, bootstrap |

The asset licenses are listed in [CREDITS.md](CREDITS.md).
