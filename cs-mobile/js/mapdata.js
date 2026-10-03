// Layout of "沙城 Dust" — a Dust2-inspired, enlarged desert map.
// Units are meters. x = east, z = south. Terrorists spawn south (+z), CTs north (-z).
// Everything that is not covered by a FLOOR rect becomes solid building mass.

export const MAP_SIZE = 168;          // full square, centered on 0
export const CELL = 2;                // raster resolution for buildings + nav

// [x0, z0, x1, z1, floorMaterial, zoneName]
export const FLOORS = [
  // ---- T side ----
  [-24, 50, 24, 76, 'ground', 'T出生点'],
  [24, 56, 44, 66, 'ground', 'T出生点'],          // exit to outside long
  [40, 34, 60, 66, 'ground', 'A大外'],             // outside long
  [46, 24, 54, 34, 'concrete', 'A大门'],           // long doors corridor
  [42, -36, 60, 24, 'ground', 'A大道'],            // long A
  [60, -50, 70, -30, 'ground', 'A坑'],             // pit
  [-14, 30, -2, 50, 'cobble', '中路上'],           // top mid (offset so T spawn can't see down mid)
  [-10, -18, 10, 30, 'cobble', '中路'],            // mid
  [-26, 58, -24, 66, 'ground', 'T出生点'],
  [-56, 56, -24, 66, 'ground', 'B洞外'],           // path to upper tunnels
  [-70, 26, -54, 56, 'ground', 'B洞外'],           // outside tunnels
  [-60, -38, -50, 30, 'concrete', 'B洞'],          // upper tunnel (covered)
  [-50, 16, -10, 24, 'concrete', '下B洞'],         // lower tunnels -> mid
  // ---- Catwalk / short ----
  [10, -6, 26, 4, 'cobble', '小道'],               // catwalk (raised part is a platform)
  [22, -42, 32, -6, 'cobble', 'A小'],              // short A
  // ---- CT side ----
  [-10, -46, 10, -18, 'cobble', 'CT中路'],         // CT mid
  [-30, -76, 24, -46, 'ground', 'CT出生点'],       // CT spawn
  [24, -66, 66, -36, 'cobble', 'A点'],             // A site
  [-40, -44, -10, -36, 'concrete', 'B门'],         // B doors corridor from CT mid
  [-38, -64, -30, -50, 'ground', 'B窗'],           // CT -> B
  [-72, -72, -38, -38, 'tiles', 'B点'],            // B site
];

// Raised walkable platforms: [x0,z0,x1,z1, topY, material]
export const PLATFORMS = [
  [12, -6, 26, 0, 1.5, 'old_sand'],        // catwalk
  [22, -42, 32, -6, 1.5, 'old_sand'],      // short A walkway
  [32, -60, 50, -46, 1.5, 'old_sand'],     // A site platform
  [-70, -72, -58, -62, 1.2, 'old_sand'],   // B back platform
];

// Stairs: [x0,z0,x1,z1, direction of ascent ('n','s','e','w'), fromY, toY]
export const STAIRS = [
  [10, -6, 12, 0, 'e', 0, 1.5],            // mid -> catwalk  (west end)
  [22, 0, 26, 4, 'n', 0, 1.5],             // catwalk ledge back down
  [24, -46, 32, -42, 's', 0, 1.5],         // A site -> short (north end)
  [44, -46, 50, -42, 'n', 0, 1.5],         // A site lower -> platform
  [50, -60, 54, -52, 'w', 0, 1.5],         // long side -> platform
  [-58, -70, -54, -64, 'w', 0, 1.2],       // B platform
];

// Covered sections (roof slabs): [x0,z0,x1,z1, y]
export const ROOFS = [
  [-60, -36, -50, 28, 4.6],                // upper tunnel roof
  [-48, 16, -12, 24, 4.4],                 // lower tunnel roof
  [44, 24, 56, 34, 5.0],                   // long doors archway
  [-38, -44, -12, -36, 4.8],               // B doors passage
];

// Thin walls with door gaps: [x0,z0,x1,z1, height, material]
export const WALLS = [
  // mid doors (gap in the middle)
  [-10, -19.4, 2, -18.6, 4.2, 'plaster'],
  [6, -19.4, 10, -18.6, 4.2, 'plaster'],
  // CT spawn kiosk: breaks the CT spawn <-> mid sightline
  [-7, -54, 7, -49, 3.6, 'plaster'],
  // long A low walls / cover
  [42, -8, 46, -6, 1.1, 'old_sand'],
  [54, 6, 60, 8, 1.1, 'old_sand'],
  // A site cover walls
  [56, -48, 66, -46, 1.2, 'old_sand'],
  [24, -54, 28, -52, 1.2, 'old_sand'],
  // B site low walls
  [-48, -50, -38, -48, 1.2, 'old_sand'],
  [-72, -50, -62, -48, 1.0, 'old_sand'],
  // T spawn cover
  [-8, 59.6, 8, 60.4, 1.0, 'old_sand'],
];

// Decorative + colliding props: [type, x, z, rotY(deg), scale, stack]
export const PROPS = [
  // mid
  ['crate', 2, 8, 0, 1.4, 1],              // "xbox"
  ['crate', -7.5, -10, 10, 1.1, 1],
  ['barrel', 8, 26, 0, 1, 1],
  ['barrel', 8.6, 27.2, 0, 1, 1],
  // T spawn
  ['car', -12, 66, 80, 1, 1],
  ['crate', 16, 70, 0, 1.2, 2],
  ['crate', 18, 72, 15, 1.2, 1],
  ['barrier', 4, 54, 90, 1, 1],
  ['jerry', -18, 54, 0, 1, 1],
  // outside long / long
  ['crate', 56, 50, 0, 1.3, 2],
  ['crate', 57.5, 47.5, 20, 1.1, 1],
  ['barrel', 42, 40, 0, 1, 1],
  ['barrel', 43, 41, 0, 1, 1],
  ['crate', 44, 12, 0, 1.2, 1],
  ['crate', 58, -14, 0, 1.4, 2],
  ['barrier', 50, -24, 0, 1, 1],
  ['tyre', 59, 20, 0, 1, 1],
  ['crate', 66, -44, 0, 1.4, 2],          // pit boxes
  // A site
  ['crate', 40, -50, 0, 1.4, 2],           // default plant box on platform
  ['crate', 36, -56, 30, 1.1, 1],
  ['crate', 60, -60, 0, 1.4, 1],
  ['crate', 62, -58, 10, 1.1, 1],
  ['barrel', 28, -62, 0, 1, 1],
  ['propane', 46, -64, 0, 1, 1],
  ['crate', 28, -38, 0, 1.2, 1],
  // short / catwalk
  ['barrel', 25, -24, 0, 1, 1],
  ['crate', 14, 2, 0, 1.1, 1],
  // CT
  ['car', 0, -58, 0, 1, 1],
  ['crate', -6, -40, 0, 1.2, 1],
  ['barrier', 14, -52, 90, 1, 1],
  ['crate', 18, -70, 0, 1.2, 2],
  // B site
  ['car', -52, -60, 35, 1, 1],
  ['crate', -66, -46, 0, 1.4, 2],
  ['crate', -44, -68, 0, 1.4, 1],
  ['crate', -42, -66, 20, 1.1, 1],
  ['crate', -62, -66, 0, 1.2, 1],
  ['barrel', -40, -40, 0, 1, 1],
  ['barrel', -70, -40, 0, 1, 1],
  ['jerry', -50, -46, 0, 1, 1],
  // tunnels
  ['crate', -56, 40, 0, 1.2, 1],
  ['barrel', -66, 50, 0, 1, 1],
  ['barrel', -65, 48.6, 0, 1, 1],
  ['crate', -52, -20, 0, 1.0, 1],
  ['cement', -58, 6, 0, 1, 1],
  ['cement', -26, 22, 0, 1, 1],
  ['tyre', -36, 18, 0, 1, 1],
];

// Wall-mounted / non-colliding decoration
export const DECOR = [
  ['lamp', -12, 34, 0], ['lamp', 50, 0, 90], ['lamp', -50, -50, 0], ['lamp', 30, -64, 0], ['lamp', -20, 56, 0],
  ['aircon', 9.6, 14, -90], ['aircon', -9.6, -30, 90], ['aircon', 41.6, -20, 90], ['aircon', 23.6, 60, -90],
  ['trash', 6, 46, 0], ['trash', -36, -42, 0], ['trash', 58, 30, 0],
];

export const SPAWNS = {
  T: [[-12, 70], [-6, 68], [0, 70], [6, 68], [12, 70], [-16, 58], [16, 58], [0, 56]],
  CT: [[-12, -66], [-6, -64], [0, -70], [6, -64], [12, -66], [-20, -56], [20, -56], [0, -50]],
};

export const SITES = {
  A: { x0: 30, z0: -62, x1: 54, z1: -44, label: 'A' },
  B: { x0: -70, z0: -70, x1: -46, z1: -46, label: 'B' },
};

// Strategic positions used by bots: [x, z, lookX, lookZ]
export const HOLDS = {
  A: [[38, -54, 50, 0], [60, -58, 50, -20], [30, -48, 27, -20], [46, -62, 50, -36], [26, -60, 50, -20]],
  B: [[-64, -66, -55, -36], [-46, -66, -55, -36], [-68, -46, -55, -30], [-42, -45, -40, -40], [-60, -54, -55, -36]],
  MID: [[2, -40, 4, 10], [8, -30, 4, 10], [-6, -44, 4, 10]],
  LONG: [[50, -30, 50, 24], [58, -34, 50, 24]],
  TUN: [[-55, -32, -55, 20]],
};

// T attack routes: lists of waypoints (x,z) ending at site
export const ROUTES = {
  A: [
    [[30, 60], [50, 50], [50, 30], [50, 0], [52, -30], [44, -50]],                 // long A
    [[-8, 44], [0, 10], [16, -2], [27, -20], [32, -44], [40, -54]],                 // short/cat
  ],
  B: [
    [[-36, 60], [-62, 40], [-55, 10], [-55, -30], [-58, -50], [-56, -60]],         // B tunnels
    [[-8, 44], [-6, 26], [-20, 20], [-55, 18], [-55, -30], [-56, -58]],              // mid -> lower tun
    [[-8, 40], [0, -10], [4, -24], [-4, -34], [-20, -40], [-48, -46], [-56, -58]],  // mid -> CT mid -> B doors
  ],
};
