// symbols.js — programmatic symbol rendering for the slot reels.
// Each symbol is rendered once via Phaser.Graphics → generateTexture (key
// `symbol_<id>`) and then placed as Image instances on each reel cell.

export const SYMBOL_SIZE = 64;

// IDs double as parts of the texture keys.
export const SYMBOLS = {
  CANDLE:    'candle',
  COIN:      'coin',
  RAVEN:     'raven',
  EYE:       'eye',
  SNAKE:     'snake',
  CHALICE:   'chalice',
  MIRROR:    'mirror',
  SKULL:     'skull',
  TAROT:     'tarot',
  WITCHMARK: 'witchmark'
};

// Symbol pool with weights, tier, and color identity.
// Tier drives the paytable; weight drives reel-strip frequency.
// Total weight = 28 → commons each ≈ 14%, mids ≈ 7%, wild/scatter ≈ 3.6%.
export const SYMBOL_POOL = [
  { id: SYMBOLS.CANDLE,    tier: 'common',  weight: 4, color: 0xc9a961, name: 'candle' },
  { id: SYMBOLS.COIN,      tier: 'common',  weight: 4, color: 0xa89050, name: 'coin' },
  { id: SYMBOLS.RAVEN,     tier: 'common',  weight: 4, color: 0x4a3a2a, name: 'raven' },
  { id: SYMBOLS.EYE,       tier: 'common',  weight: 4, color: 0xd4a574, name: 'eye' },
  { id: SYMBOLS.SNAKE,     tier: 'common',  weight: 4, color: 0x6a7a4a, name: 'snake' },
  { id: SYMBOLS.CHALICE,   tier: 'mid',     weight: 2, color: 0xc9a961, name: 'chalice' },
  { id: SYMBOLS.MIRROR,    tier: 'mid',     weight: 2, color: 0xb0a890, name: 'mirror' },
  { id: SYMBOLS.SKULL,     tier: 'mid',     weight: 2, color: 0xc9a880, name: 'skull' },
  { id: SYMBOLS.TAROT,     tier: 'wild',    weight: 1, color: 0x8a5aa0, name: 'tarot' },
  { id: SYMBOLS.WITCHMARK, tier: 'scatter', weight: 1, color: 0xff6b35, name: "witch's mark" }
];

// Idempotent — safe to call on every scene mount.
export function buildSymbolTextures(scene) {
  for (const sym of SYMBOL_POOL) {
    const key = `symbol_${sym.id}`;
    if (scene.textures.exists(key)) continue;
    const gfx = scene.make.graphics({ add: false });
    drawSymbol(gfx, sym.id, sym.color);
    gfx.generateTexture(key, SYMBOL_SIZE, SYMBOL_SIZE);
    gfx.destroy();
  }
}

// Weighted random pick. Used both for reel strips and to seed the
// pre-determined spin result before the visual spin starts.
export function pickSymbol() {
  const total = SYMBOL_POOL.reduce((s, sym) => s + sym.weight, 0);
  let r = Math.random() * total;
  for (const sym of SYMBOL_POOL) {
    r -= sym.weight;
    if (r <= 0) return sym;
  }
  return SYMBOL_POOL[SYMBOL_POOL.length - 1];
}

export function symbolById(id) {
  return SYMBOL_POOL.find(s => s.id === id);
}

// ============================================================
// Drawing primitives — each symbol renders centered at (32, 32)
// inside a SYMBOL_SIZE × SYMBOL_SIZE canvas.
// Color = primary hue; secondary tints derived inline so all 10
// share a coherent warm-occult palette.
// ============================================================
function drawSymbol(g, id, color) {
  const cx = SYMBOL_SIZE / 2;
  const cy = SYMBOL_SIZE / 2;
  switch (id) {
    case SYMBOLS.CANDLE:    return drawCandle(g, cx, cy, color);
    case SYMBOLS.COIN:      return drawCoin(g, cx, cy, color);
    case SYMBOLS.RAVEN:     return drawRaven(g, cx, cy, color);
    case SYMBOLS.EYE:       return drawEye(g, cx, cy, color);
    case SYMBOLS.SNAKE:     return drawSnake(g, cx, cy, color);
    case SYMBOLS.CHALICE:   return drawChalice(g, cx, cy, color);
    case SYMBOLS.MIRROR:    return drawMirror(g, cx, cy, color);
    case SYMBOLS.SKULL:     return drawSkull(g, cx, cy, color);
    case SYMBOLS.TAROT:     return drawTarot(g, cx, cy, color);
    case SYMBOLS.WITCHMARK: return drawWitchMark(g, cx, cy, color);
  }
}

function drawCandle(g, cx, cy, color) {
  // Wax pillar
  g.fillStyle(color, 0.95);
  g.fillRect(cx - 8, cy - 4, 16, 26);
  g.lineStyle(1, 0x6a5030, 0.7);
  g.strokeRect(cx - 8, cy - 4, 16, 26);
  // Wax drip on side
  g.fillStyle(color, 0.7);
  g.fillRect(cx + 6, cy + 8, 3, 9);
  // Wick
  g.fillStyle(0x2a1810, 1);
  g.fillRect(cx - 1, cy - 10, 2, 6);
  // Outer flame
  g.fillStyle(0xff6b35, 0.9);
  g.fillTriangle(cx, cy - 24, cx - 5, cy - 10, cx + 5, cy - 10);
  // Inner flame
  g.fillStyle(0xffd8a0, 0.95);
  g.fillTriangle(cx, cy - 20, cx - 3, cy - 11, cx + 3, cy - 11);
}

function drawCoin(g, cx, cy, color) {
  // Outer rim — darker
  g.fillStyle(0x6a5030, 1);
  g.fillCircle(cx, cy, 22);
  // Face
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, 20);
  // Inner ring
  g.lineStyle(1, 0x6a5030, 0.85);
  g.strokeCircle(cx, cy, 14);
  // Ankh-ish glyph in the center
  g.fillStyle(0x6a5030, 1);
  g.fillCircle(cx, cy - 4, 4);
  g.fillRect(cx - 1, cy, 2, 8);
  g.fillRect(cx - 5, cy + 2, 10, 2);
}

function drawRaven(g, cx, cy, color) {
  // Body — oval
  g.fillStyle(color, 1);
  g.fillEllipse(cx, cy + 2, 18, 22);
  // Wings — left & right
  g.fillTriangle(cx - 4, cy - 8, cx - 22, cy + 2, cx - 8, cy + 4);
  g.fillTriangle(cx + 4, cy - 8, cx + 22, cy + 2, cx + 8, cy + 4);
  // Head
  g.fillCircle(cx + 6, cy - 10, 7);
  // Beak
  g.fillStyle(0xc9a961, 1);
  g.fillTriangle(cx + 11, cy - 12, cx + 18, cy - 10, cx + 11, cy - 8);
  // Glinting eye
  g.fillStyle(0xff6b35, 0.95);
  g.fillCircle(cx + 7, cy - 11, 1.5);
}

function drawEye(g, cx, cy, color) {
  // Almond eye outline — two arcs
  g.lineStyle(2, color, 1);
  g.beginPath();
  g.arc(cx, cy - 6, 22, 0.25, Math.PI - 0.25);
  g.strokePath();
  g.beginPath();
  g.arc(cx, cy + 6, 22, Math.PI + 0.25, Math.PI * 2 - 0.25);
  g.strokePath();
  // Iris
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, 10);
  // Pupil
  g.fillStyle(0x8b2020, 1);
  g.fillCircle(cx, cy, 5);
  // Highlight
  g.fillStyle(0xffd8a0, 0.85);
  g.fillCircle(cx - 2, cy - 2, 1.5);
}

function drawSnake(g, cx, cy, color) {
  // Sine-wave body — connected circles, tapered tail
  g.fillStyle(color, 1);
  const segments = 8;
  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const x = cx - 22 + t * 44;
    const y = cy + Math.sin(t * Math.PI * 2.2) * 6;
    g.fillCircle(x, y, 5 - i * 0.35);
  }
  // Head — larger at the leftmost end
  g.fillCircle(cx - 22, cy, 7);
  // Eye
  g.fillStyle(0x2a1810, 1);
  g.fillCircle(cx - 24, cy - 2, 1.5);
  // Forked tongue
  g.fillStyle(0x8b2020, 1);
  g.fillTriangle(cx - 32, cy, cx - 27, cy - 1, cx - 27, cy + 1);
}

function drawChalice(g, cx, cy, color) {
  // Cup walls
  g.fillStyle(color, 1);
  g.fillTriangle(cx - 14, cy - 14, cx + 14, cy - 14, cx + 10, cy + 2);
  g.fillTriangle(cx - 14, cy - 14, cx + 10, cy + 2, cx - 10, cy + 2);
  g.lineStyle(1, 0x6a5030, 0.85);
  g.strokeTriangle(cx - 14, cy - 14, cx + 14, cy - 14, cx + 10, cy + 2);
  g.strokeTriangle(cx - 14, cy - 14, cx + 10, cy + 2, cx - 10, cy + 2);
  // Liquid — deep red
  g.fillStyle(0x8b2020, 0.9);
  g.fillTriangle(cx - 12, cy - 12, cx + 12, cy - 12, cx + 9, cy);
  g.fillTriangle(cx - 12, cy - 12, cx + 9, cy, cx - 9, cy);
  // Stem + base
  g.fillStyle(color, 1);
  g.fillRect(cx - 2, cy + 2, 4, 12);
  g.fillRect(cx - 10, cy + 14, 20, 4);
  g.lineStyle(1, 0x6a5030, 0.85);
  g.strokeRect(cx - 10, cy + 14, 20, 4);
}

function drawMirror(g, cx, cy, color) {
  // Frame — outer oval
  g.fillStyle(0xc9a961, 1);
  g.fillEllipse(cx, cy - 4, 30, 36);
  // Mirror surface — primary color
  g.fillStyle(color, 0.85);
  g.fillEllipse(cx, cy - 4, 22, 28);
  // Sheen reflection
  g.fillStyle(0xffd8a0, 0.45);
  g.fillEllipse(cx - 5, cy - 8, 8, 16);
  // Handle + knob
  g.fillStyle(0xc9a961, 1);
  g.fillRect(cx - 2, cy + 14, 4, 12);
  g.fillCircle(cx, cy + 26, 4);
}

function drawSkull(g, cx, cy, color) {
  // Cranium
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy - 6, 18);
  // Jaw box (with rounded corners via circles)
  g.fillRect(cx - 14, cy + 4, 28, 12);
  g.fillCircle(cx - 14, cy + 16, 4);
  g.fillCircle(cx + 14, cy + 16, 4);
  // Eye sockets
  g.fillStyle(0x0a0605, 1);
  g.fillCircle(cx - 7, cy - 4, 5);
  g.fillCircle(cx + 7, cy - 4, 5);
  // Nose triangle
  g.fillTriangle(cx, cy + 2, cx - 3, cy + 6, cx + 3, cy + 6);
  // Teeth row
  g.fillRect(cx - 10, cy + 12, 20, 1);
  g.fillRect(cx - 4, cy + 8, 1, 6);
  g.fillRect(cx,     cy + 8, 1, 6);
  g.fillRect(cx + 4, cy + 8, 1, 6);
}

function drawTarot(g, cx, cy, color) {
  // Card body — purple
  g.fillStyle(color, 1);
  g.fillRoundedRect(cx - 16, cy - 22, 32, 44, 3);
  g.lineStyle(2, 0xc9a961, 0.9);
  g.strokeRoundedRect(cx - 16, cy - 22, 32, 44, 3);
  // Inner brass frame
  g.lineStyle(1, 0xc9a961, 0.55);
  g.strokeRoundedRect(cx - 13, cy - 19, 26, 38, 2);
  // Central star
  g.fillStyle(0xc9a961, 1);
  const star = starPoints(cx, cy, 8, 4, 5);
  g.fillPoints(star, true);
  // Corner moons
  g.fillStyle(0xc9a961, 0.75);
  g.fillCircle(cx - 9, cy - 14, 1.6);
  g.fillCircle(cx + 9, cy - 14, 1.6);
  g.fillCircle(cx - 9, cy + 14, 1.6);
  g.fillCircle(cx + 9, cy + 14, 1.6);
}

function drawWitchMark(g, cx, cy, color) {
  // Dark backing disc so the sigil reads against any reel cell
  g.fillStyle(0x0a0605, 0.95);
  g.fillCircle(cx, cy, 24);
  g.lineStyle(2, color, 0.55);
  g.strokeCircle(cx, cy, 24);
  // Pentagram
  g.lineStyle(2.5, color, 1);
  const star = starPoints(cx, cy, 18, 7, 5);
  g.strokePoints(star, true);
  // Center dot
  g.fillStyle(color, 1);
  g.fillCircle(cx, cy, 2);
}

// 5-point star helper — alternating outer/inner radii.
function starPoints(cx, cy, outerR, innerR, points) {
  const pts = [];
  const step = Math.PI / points;
  for (let i = 0; i < points * 2; i++) {
    const r = (i % 2 === 0) ? outerR : innerR;
    const a = i * step - Math.PI / 2;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return pts;
}
