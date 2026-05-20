import Phaser from 'phaser';
import { SFX } from '../audio.js';
import { RouletteWheel } from './RouletteWheel.js';

// Roulette.js — European single-zero roulette.
// Pairs with RouletteWheel.js (visual wheel/ball animator).
//
// Layout (1280x720):
//   - Title bar at top, history strip just below.
//   - Felt occupies the left ~60% (x 40-780, y 180-580).
//     Zero is a tall cell on the left; 12x3 number grid; column 2:1 strip on
//     the right; dozens row beneath; even-money outside row at the bottom.
//   - Wheel + dealer occupy the right ~40% (centered around x=1000).
//   - Bet controls (chip selector, undo, clear, spin) at the bottom.
//
// Hit-zone layering (so clicks land on the right bet type):
//   cells          depth 100
//   splits/streets depth 200
//   corners        depth 300

export class Roulette extends Phaser.Scene {
  constructor() {
    super('Roulette');

    this.RED_NUMBERS   = [1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36];
    this.BLACK_NUMBERS = [2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35];

    // Number grid: row r, col c → number. Row 0 is the top (3,6,9,...,36).
    this.GRID_ROWS = [
      [3, 6, 9,12,15,18,21,24,27,30,33,36],
      [2, 5, 8,11,14,17,20,23,26,29,32,35],
      [1, 4, 7,10,13,16,19,22,25,28,31,34]
    ];

    // Felt geometry — single source of truth, used for both drawing & hit zones.
    this.FELT_X = 40;          this.FELT_Y = 180;
    this.FELT_W = 740;         this.FELT_H = 400;
    this.PAD    = 8;           // inner felt padding
    this.ZERO_W = 60;          this.NUM_CELL_W = 50;     this.NUM_CELL_H = 60;
    this.NUM_GRID_X = this.FELT_X + this.PAD + this.ZERO_W;          // 108
    this.NUM_GRID_Y = this.FELT_Y + this.PAD;                        // 188
    this.NUM_GRID_W = this.NUM_CELL_W * 12;                          // 600
    this.NUM_GRID_H = this.NUM_CELL_H * 3;                           // 180
    this.COL_BET_X  = this.NUM_GRID_X + this.NUM_GRID_W;             // 708
    this.COL_BET_W  = 60;
    this.OUTSIDE_Y  = this.NUM_GRID_Y + this.NUM_GRID_H;             // 368
    this.DOZEN_H    = 50;
    this.OUTSIDE_H  = 50;

    // Wheel geometry
    this.WHEEL_X = 1000; this.WHEEL_Y = 380; this.WHEEL_R = 130;

    // Chip denominations — matches Plinko / Blackjack / Bookie. Consistency
    // across rooms so the player doesn't have to relearn bet sizes every door.
    this.CHIP_VALUES = [1, 5, 10, 25];
    this.CHIP_COLORS = { 1: 0xc9c9c9, 5: 0xff5252, 10: 0x2196f3, 25: 0x2e7a3a };

    // Payout multipliers (NOT including stake — we return stake + stake*mult)
    this.PAYOUT = {
      STRAIGHT: 35,
      SPLIT:    17,
      CORNER:    8,
      COLUMN:    2,
      DOZEN:     2,
      OUTSIDE:   1
    };

    // Tarnished gold accent
    this.GOLD = 0xa89050;
    this.GOLD_HEX = '#a89050';
    this.GOLD_DIM = 0x6a5030;

    // State
    this.bets = [];                    // {type, target, amount, sprite, prisoned?}
    this.history = [];                 // last 10 winning numbers (newest first)
    this.selectedChip = 5;             // current chip denom
    this.isSpinning = false;
    this.imprisoned = [];              // even-money bets in la partage / en prison
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(600, 8, 5, 5);

    this.displayedChips = this.registry.get('chips');

    this.createBackground();
    this.createTitleBar();
    this.createBackButton();
    this.createHistoryStrip();
    this.createFelt();
    this.createBetHitZones();
    this.createDealer();
    this.createWheel();
    this.createBetControls();
    this.createMessageText();

    // Initial state
    this.setMessage('place your bets.', this.GOLD_HEX);
  }

  // ============================================================
  //  BACKGROUND — warm parlor wood, soft vignette
  // ============================================================

  createBackground() {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0605, 1);
    bg.fillRect(0, 0, 1280, 720);

    // Wood-grain accents — a few horizontal streaks
    bg.fillStyle(0x1a0f08, 0.5);
    for (let i = 0; i < 12; i++) {
      const y = Math.random() * 720;
      bg.fillRect(0, y, 1280, 1 + Math.random() * 2);
    }

    // Soft amber lamp glow centered roughly over the table
    const glow = this.add.graphics();
    glow.fillStyle(0xffc080, 0.04);
    glow.fillCircle(420, 380, 360);
    glow.fillStyle(0xffc080, 0.03);
    glow.fillCircle(420, 380, 520);

    // Vignette
    const v = this.add.graphics();
    v.fillStyle(0x000000, 0.35);
    v.fillRect(0, 0, 1280, 60);
    v.fillRect(0, 660, 1280, 60);
    v.fillRect(0, 0, 60, 720);
    v.fillRect(1220, 0, 60, 720);
  }

  // ============================================================
  //  TITLE + BACK + CHIPS
  // ============================================================

  createTitleBar() {
    this.add.text(640, 30, 'ROULETTE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      fontStyle: 'bold',
      color: this.GOLD_HEX,
      stroke: '#2a1810', strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: this.GOLD_HEX, blur: 8, fill: true }
    }).setOrigin(0.5);

    this.add.text(640, 52, '— rien ne va plus —', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px', color: '#8b6f47'
    }).setOrigin(0.5);

    this.chipText = this.add.text(1240, 28, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px', color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 6, fill: true }
    }).setOrigin(1, 0);
    this.updateChipDisplay(0);
  }

  createBackButton() {
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.isSpinning) return;
      this.cameras.main.fadeOut(500, 5, 8, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });
  }

  // ============================================================
  //  HISTORY STRIP — last 10 winning numbers as colored discs
  // ============================================================

  createHistoryStrip() {
    this.add.text(40, 90, 'last spins:', {
      fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#6a5030'
    }).setOrigin(0, 0.5);

    this.historyContainer = this.add.container(140, 90);
    this.streakBadge = this.add.text(640, 130, '', {
      fontFamily: '"Courier New", monospace', fontSize: '14px', fontStyle: 'bold',
      color: '#ff6b35'
    }).setOrigin(0.5);
  }

  drawHistory() {
    this.historyContainer.removeAll(true);
    const xStep = 32;
    this.history.slice(0, 10).forEach((n, i) => {
      const c = this.add.container(i * xStep, 0);
      const disc = this.add.graphics();
      const fillCol = n === 0
        ? 0x2e7a3a
        : (this.RED_NUMBERS.includes(n) ? 0x8a1a1a : 0x141414);
      disc.fillStyle(fillCol, 1);
      disc.fillCircle(0, 0, 12);
      disc.lineStyle(1, this.GOLD, 0.4);
      disc.strokeCircle(0, 0, 12);
      const t = this.add.text(0, 0, String(n), {
        fontFamily: '"Courier New", monospace', fontSize: '12px',
        fontStyle: 'bold', color: '#ffffff'
      }).setOrigin(0.5);
      c.add([disc, t]);
      // Newest fades in
      if (i === 0) {
        c.setAlpha(0); c.setScale(0.5);
        this.tweens.add({ targets: c, alpha: 1, scale: 1, duration: 320, ease: 'Back.out' });
      }
      this.historyContainer.add(c);
    });
  }

  // ============================================================
  //  FELT — green felt + zero cell + 12x3 number grid + outsides
  // ============================================================

  createFelt() {
    const g = this.add.graphics();
    // Outer felt — dark green, gold border
    g.fillStyle(0x103a20, 1);
    g.fillRoundedRect(this.FELT_X, this.FELT_Y, this.FELT_W, this.FELT_H + 50, 8);
    g.lineStyle(2, this.GOLD, 0.55);
    g.strokeRoundedRect(this.FELT_X, this.FELT_Y, this.FELT_W, this.FELT_H + 50, 8);

    // Zero cell — green wedge
    const zx = this.FELT_X + this.PAD;
    const zy = this.FELT_Y + this.PAD;
    g.fillStyle(0x2e7a3a, 1);
    g.fillRect(zx, zy, this.ZERO_W, this.NUM_GRID_H);
    g.lineStyle(1, this.GOLD, 0.5);
    g.strokeRect(zx, zy, this.ZERO_W, this.NUM_GRID_H);
    this.add.text(zx + this.ZERO_W / 2, zy + this.NUM_GRID_H / 2, '0', {
      fontFamily: '"Courier New", monospace', fontSize: '24px',
      fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);

    // 12x3 numbers
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 12; c++) {
        const n = this.GRID_ROWS[r][c];
        const x = this.NUM_GRID_X + c * this.NUM_CELL_W;
        const y = this.NUM_GRID_Y + r * this.NUM_CELL_H;
        const fill = this.RED_NUMBERS.includes(n) ? 0x8a1a1a : 0x141414;
        g.fillStyle(fill, 1);
        g.fillRect(x, y, this.NUM_CELL_W, this.NUM_CELL_H);
        g.lineStyle(1, this.GOLD, 0.35);
        g.strokeRect(x, y, this.NUM_CELL_W, this.NUM_CELL_H);
        this.add.text(x + this.NUM_CELL_W / 2, y + this.NUM_CELL_H / 2, String(n), {
          fontFamily: '"Courier New", monospace', fontSize: '18px',
          fontStyle: 'bold', color: '#ffffff'
        }).setOrigin(0.5);
      }
    }

    // Column 2:1 cells — right edge
    for (let r = 0; r < 3; r++) {
      const x = this.COL_BET_X;
      const y = this.NUM_GRID_Y + r * this.NUM_CELL_H;
      g.fillStyle(0x103a20, 1);
      g.fillRect(x, y, this.COL_BET_W, this.NUM_CELL_H);
      g.lineStyle(1, this.GOLD, 0.45);
      g.strokeRect(x, y, this.COL_BET_W, this.NUM_CELL_H);
      this.add.text(x + this.COL_BET_W / 2, y + this.NUM_CELL_H / 2, '2:1', {
        fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#d4a574'
      }).setOrigin(0.5);
    }

    // Dozens row — beneath the number grid (3 cells of width 200)
    for (let d = 0; d < 3; d++) {
      const x = this.NUM_GRID_X + d * (this.NUM_GRID_W / 3);
      const y = this.OUTSIDE_Y;
      const w = this.NUM_GRID_W / 3;
      g.fillStyle(0x103a20, 1);
      g.fillRect(x, y, w, this.DOZEN_H);
      g.lineStyle(1, this.GOLD, 0.45);
      g.strokeRect(x, y, w, this.DOZEN_H);
      const lbl = ['1st 12', '2nd 12', '3rd 12'][d];
      this.add.text(x + w / 2, y + this.DOZEN_H / 2, lbl, {
        fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#d4a574'
      }).setOrigin(0.5);
    }

    // Even-money outside row — beneath dozens (6 cells of width 100)
    const outsides = [
      { lbl: '1-18',  draw: 'text' },
      { lbl: 'EVEN',  draw: 'text' },
      { lbl: 'red',   draw: 'diamond', color: 0x8a1a1a },
      { lbl: 'black', draw: 'diamond', color: 0x141414 },
      { lbl: 'ODD',   draw: 'text' },
      { lbl: '19-36', draw: 'text' }
    ];
    outsides.forEach((o, i) => {
      const x = this.NUM_GRID_X + i * (this.NUM_GRID_W / 6);
      const y = this.OUTSIDE_Y + this.DOZEN_H;
      const w = this.NUM_GRID_W / 6;
      g.fillStyle(0x103a20, 1);
      g.fillRect(x, y, w, this.OUTSIDE_H);
      g.lineStyle(1, this.GOLD, 0.45);
      g.strokeRect(x, y, w, this.OUTSIDE_H);
      if (o.draw === 'diamond') {
        const dg = this.add.graphics();
        dg.fillStyle(o.color, 1);
        dg.lineStyle(1, this.GOLD, 0.7);
        const cx = x + w / 2, cy = y + this.OUTSIDE_H / 2;
        dg.fillTriangle(cx, cy - 12, cx + 12, cy, cx, cy + 12);
        dg.fillTriangle(cx, cy - 12, cx - 12, cy, cx, cy + 12);
        dg.strokeTriangle(cx, cy - 12, cx + 12, cy, cx, cy + 12);
        dg.strokeTriangle(cx, cy - 12, cx - 12, cy, cx, cy + 12);
      } else {
        this.add.text(x + w / 2, y + this.OUTSIDE_H / 2, o.lbl, {
          fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#d4a574'
        }).setOrigin(0.5);
      }
    });
  }

  // ============================================================
  //  HIT ZONES — clickable rectangles for every legal bet
  //  Depth ordering: cells 100 < splits 200 < corners 300
  // ============================================================

  createBetHitZones() {
    // Container we can re-use for hover highlights
    this.hoverGfx = this.add.graphics();
    this.hoverGfx.setDepth(50);

    // ---- CELLS (depth 100) ----
    // Zero
    this.makeZone(
      this.FELT_X + this.PAD + this.ZERO_W / 2,
      this.FELT_Y + this.PAD + this.NUM_GRID_H / 2,
      this.ZERO_W, this.NUM_GRID_H,
      { type: 'STRAIGHT', target: 0 }, 100
    );
    // Numbers 1-36
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 12; c++) {
        const n = this.GRID_ROWS[r][c];
        const x = this.NUM_GRID_X + c * this.NUM_CELL_W + this.NUM_CELL_W / 2;
        const y = this.NUM_GRID_Y + r * this.NUM_CELL_H + this.NUM_CELL_H / 2;
        this.makeZone(x, y, this.NUM_CELL_W, this.NUM_CELL_H,
          { type: 'STRAIGHT', target: n }, 100);
      }
    }

    // ---- COLUMN 2:1 (depth 100) ----
    for (let r = 0; r < 3; r++) {
      const x = this.COL_BET_X + this.COL_BET_W / 2;
      const y = this.NUM_GRID_Y + r * this.NUM_CELL_H + this.NUM_CELL_H / 2;
      this.makeZone(x, y, this.COL_BET_W, this.NUM_CELL_H,
        { type: 'COLUMN', target: r }, 100);
    }

    // ---- DOZENS (depth 100) ----
    for (let d = 0; d < 3; d++) {
      const w = this.NUM_GRID_W / 3;
      const x = this.NUM_GRID_X + d * w + w / 2;
      const y = this.OUTSIDE_Y + this.DOZEN_H / 2;
      this.makeZone(x, y, w, this.DOZEN_H, { type: 'DOZEN', target: d }, 100);
    }

    // ---- OUTSIDE EVEN-MONEY (depth 100) ----
    const outBets = ['LOW', 'EVEN', 'RED', 'BLACK', 'ODD', 'HIGH'];
    outBets.forEach((kind, i) => {
      const w = this.NUM_GRID_W / 6;
      const x = this.NUM_GRID_X + i * w + w / 2;
      const y = this.OUTSIDE_Y + this.DOZEN_H + this.OUTSIDE_H / 2;
      this.makeZone(x, y, w, this.OUTSIDE_H, { type: 'OUTSIDE', target: kind }, 100);
    });

    // ---- SPLITS (depth 200) ----
    // Horizontal-adjacent splits (between two cells in same row, adjacent cols)
    const splitW = 12, splitH = this.NUM_CELL_H * 0.7;
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 11; c++) {
        const n1 = this.GRID_ROWS[r][c];
        const n2 = this.GRID_ROWS[r][c + 1];
        const x = this.NUM_GRID_X + (c + 1) * this.NUM_CELL_W;
        const y = this.NUM_GRID_Y + r * this.NUM_CELL_H + this.NUM_CELL_H / 2;
        this.makeZone(x, y, splitW, splitH,
          { type: 'SPLIT', target: [n1, n2] }, 200);
      }
    }
    // Vertical-adjacent splits (same col, adjacent rows)
    const vsplitW = this.NUM_CELL_W * 0.7, vsplitH = 12;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 12; c++) {
        const n1 = this.GRID_ROWS[r][c];
        const n2 = this.GRID_ROWS[r + 1][c];
        const x = this.NUM_GRID_X + c * this.NUM_CELL_W + this.NUM_CELL_W / 2;
        const y = this.NUM_GRID_Y + (r + 1) * this.NUM_CELL_H;
        this.makeZone(x, y, vsplitW, vsplitH,
          { type: 'SPLIT', target: [n1, n2] }, 200);
      }
    }

    // ---- CORNERS (depth 300) ----
    const cornerSize = 14;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 11; c++) {
        const n1 = this.GRID_ROWS[r][c];
        const n2 = this.GRID_ROWS[r][c + 1];
        const n3 = this.GRID_ROWS[r + 1][c];
        const n4 = this.GRID_ROWS[r + 1][c + 1];
        const x = this.NUM_GRID_X + (c + 1) * this.NUM_CELL_W;
        const y = this.NUM_GRID_Y + (r + 1) * this.NUM_CELL_H;
        this.makeZone(x, y, cornerSize, cornerSize,
          { type: 'CORNER', target: [n1, n2, n3, n4] }, 300);
      }
    }
  }

  // Build a single hit zone with hover highlight + click handler.
  makeZone(cx, cy, w, h, betSpec, depth) {
    const z = this.add.zone(cx, cy, w, h)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setDepth(depth);
    z.on('pointerover', () => this.previewBet(betSpec));
    z.on('pointerout',  () => this.clearPreview());
    z.on('pointerdown', (pointer) => {
      if (pointer.rightButtonDown()) this.undoLast();
      else this.placeBet(betSpec);
    });
  }

  // Faint rectangle highlight over each cell the bet covers.
  previewBet(betSpec) {
    if (this.isSpinning) return;
    this.hoverGfx.clear();
    const cells = this.cellsForBet(betSpec);
    this.hoverGfx.fillStyle(this.GOLD, 0.18);
    cells.forEach(rect => this.hoverGfx.fillRect(rect.x, rect.y, rect.w, rect.h));
  }

  clearPreview() {
    this.hoverGfx.clear();
  }

  // Returns drawing rectangles (NOT hit zones) for hover preview.
  cellsForBet(betSpec) {
    const out = [];
    const cellRectForNumber = (n) => {
      if (n === 0) {
        return {
          x: this.FELT_X + this.PAD, y: this.FELT_Y + this.PAD,
          w: this.ZERO_W, h: this.NUM_GRID_H
        };
      }
      // Find (r, c) for n in GRID_ROWS
      for (let r = 0; r < 3; r++) {
        const c = this.GRID_ROWS[r].indexOf(n);
        if (c >= 0) return {
          x: this.NUM_GRID_X + c * this.NUM_CELL_W,
          y: this.NUM_GRID_Y + r * this.NUM_CELL_H,
          w: this.NUM_CELL_W, h: this.NUM_CELL_H
        };
      }
      return null;
    };
    if (betSpec.type === 'STRAIGHT') {
      out.push(cellRectForNumber(betSpec.target));
    } else if (betSpec.type === 'SPLIT' || betSpec.type === 'CORNER') {
      betSpec.target.forEach(n => out.push(cellRectForNumber(n)));
    } else if (betSpec.type === 'COLUMN') {
      const r = betSpec.target;
      for (let c = 0; c < 12; c++) out.push(cellRectForNumber(this.GRID_ROWS[r][c]));
    } else if (betSpec.type === 'DOZEN') {
      const start = betSpec.target * 12 + 1;
      for (let n = start; n < start + 12; n++) out.push(cellRectForNumber(n));
    } else if (betSpec.type === 'OUTSIDE') {
      // Use compact bar over the outside cell itself
      const i = ['LOW', 'EVEN', 'RED', 'BLACK', 'ODD', 'HIGH'].indexOf(betSpec.target);
      const w = this.NUM_GRID_W / 6;
      out.push({
        x: this.NUM_GRID_X + i * w,
        y: this.OUTSIDE_Y + this.DOZEN_H,
        w, h: this.OUTSIDE_H
      });
    }
    return out.filter(Boolean);
  }

  // ============================================================
  //  CHIP PLACEMENT — anchor for each bet type, stacked sprite
  // ============================================================

  // Returns world-space anchor for a bet (where the chip sprite sits).
  betAnchor(betSpec) {
    const cellCenter = (n) => {
      if (n === 0) return {
        x: this.FELT_X + this.PAD + this.ZERO_W / 2,
        y: this.FELT_Y + this.PAD + this.NUM_GRID_H / 2
      };
      for (let r = 0; r < 3; r++) {
        const c = this.GRID_ROWS[r].indexOf(n);
        if (c >= 0) return {
          x: this.NUM_GRID_X + c * this.NUM_CELL_W + this.NUM_CELL_W / 2,
          y: this.NUM_GRID_Y + r * this.NUM_CELL_H + this.NUM_CELL_H / 2
        };
      }
    };
    if (betSpec.type === 'STRAIGHT') return cellCenter(betSpec.target);
    if (betSpec.type === 'SPLIT') {
      const a = cellCenter(betSpec.target[0]);
      const b = cellCenter(betSpec.target[1]);
      return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
    if (betSpec.type === 'CORNER') {
      const cs = betSpec.target.map(cellCenter);
      const x = (cs[0].x + cs[1].x + cs[2].x + cs[3].x) / 4;
      const y = (cs[0].y + cs[1].y + cs[2].y + cs[3].y) / 4;
      return { x, y };
    }
    if (betSpec.type === 'COLUMN') {
      const r = betSpec.target;
      const y = this.NUM_GRID_Y + r * this.NUM_CELL_H + this.NUM_CELL_H / 2;
      return { x: this.COL_BET_X + this.COL_BET_W / 2, y };
    }
    if (betSpec.type === 'DOZEN') {
      const w = this.NUM_GRID_W / 3;
      return {
        x: this.NUM_GRID_X + betSpec.target * w + w / 2,
        y: this.OUTSIDE_Y + this.DOZEN_H / 2
      };
    }
    if (betSpec.type === 'OUTSIDE') {
      const i = ['LOW', 'EVEN', 'RED', 'BLACK', 'ODD', 'HIGH'].indexOf(betSpec.target);
      const w = this.NUM_GRID_W / 6;
      return {
        x: this.NUM_GRID_X + i * w + w / 2,
        y: this.OUTSIDE_Y + this.DOZEN_H + this.OUTSIDE_H / 2
      };
    }
  }

  // Two bets are "the same" iff same type + same target (order-insensitive for
  // arrays). Used to stack chips on identical positions.
  sameBet(a, b) {
    if (a.type !== b.type) return false;
    if (Array.isArray(a.target) && Array.isArray(b.target)) {
      if (a.target.length !== b.target.length) return false;
      const sa = [...a.target].sort((x, y) => x - y);
      const sb = [...b.target].sort((x, y) => x - y);
      return sa.every((v, i) => v === sb[i]);
    }
    return a.target === b.target;
  }

  placeBet(betSpec) {
    if (this.isSpinning) return;
    const chips = this.registry.get('chips');
    if (chips < this.selectedChip) {
      this.flashMessage('not enough chips.', '#ff6b35');
      return;
    }

    // Stack onto an existing identical bet if present; otherwise create new.
    let existing = this.bets.find(b => this.sameBet(b, betSpec));
    if (existing) {
      existing.amount += this.selectedChip;
      this.updateChipSprite(existing);
    } else {
      const anchor = this.betAnchor(betSpec);
      const sprite = this.makeChipSprite(anchor.x, anchor.y, this.selectedChip);
      const bet = { ...betSpec, amount: this.selectedChip, sprite };
      this.bets.push(bet);
      // Lift-in
      sprite.setScale(1.4); sprite.setAlpha(0);
      this.tweens.add({ targets: sprite, scale: 1, alpha: 1, duration: 180, ease: 'Back.out' });
    }

    // Deduct from bankroll
    this.registry.set('chips', chips - this.selectedChip);
    this.updateChipDisplay(180);
    if (SFX.chipPlace) SFX.chipPlace();

    this.styleSpinButton();
  }

  makeChipSprite(x, y, value) {
    const c = this.add.container(x, y);
    c.setDepth(400);
    const g = this.add.graphics();
    const col = this.CHIP_COLORS[value] || 0xc9c9c9;
    g.fillStyle(0x000000, 0.4); g.fillCircle(2, 3, 13); // shadow
    g.fillStyle(col, 1);        g.fillCircle(0, 0, 12);
    g.lineStyle(2, 0x000000, 0.5); g.strokeCircle(0, 0, 12);
    // Tick marks around rim — chip detail
    g.lineStyle(2, 0xffffff, 0.7);
    for (let i = 0; i < 4; i++) {
      const a = i * (Math.PI / 2);
      g.lineBetween(10 * Math.cos(a), 10 * Math.sin(a),
                    13 * Math.cos(a), 13 * Math.sin(a));
    }
    const t = this.add.text(0, 0, String(value), {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'bold', color: '#ffffff'
    }).setOrigin(0.5);
    c.add([g, t]);
    c._value = value;
    return c;
  }

  updateChipSprite(bet) {
    // When stacking, just bump the displayed value and pulse it.
    bet.sprite.list[1].setText(String(bet.amount));
    this.tweens.add({
      targets: bet.sprite, scale: { from: 1.25, to: 1 },
      duration: 200, ease: 'Cubic.out'
    });
  }

  // Imprisoned bets can't be undone/cleared — their chips are already locked
  // into la partage / en prison from a previous zero spin.
  freshBets() { return this.bets.filter(b => !b.prisoned); }

  undoLast() {
    if (this.isSpinning) return;
    const fresh = this.freshBets();
    if (fresh.length === 0) return;
    const last = fresh[fresh.length - 1];
    const idx = this.bets.indexOf(last);
    this.bets.splice(idx, 1);
    this.registry.set('chips', this.registry.get('chips') + last.amount);
    this.updateChipDisplay(180);
    this.tweens.add({
      targets: last.sprite, alpha: 0, scale: 0.6, duration: 180,
      onComplete: () => last.sprite.destroy()
    });
    this.styleSpinButton();
  }

  clearBets() {
    if (this.isSpinning) return;
    const fresh = this.freshBets();
    if (fresh.length === 0) return;
    let refund = 0;
    fresh.forEach(b => {
      refund += b.amount;
      this.tweens.add({
        targets: b.sprite, alpha: 0, scale: 0.6, duration: 180,
        onComplete: () => b.sprite.destroy()
      });
    });
    // Keep prisoned bets, drop the rest
    this.bets = this.bets.filter(b => b.prisoned);
    this.registry.set('chips', this.registry.get('chips') + refund);
    this.updateChipDisplay(220);
    this.styleSpinButton();
  }

  // ============================================================
  //  DEALER — silhouette + hand that flicks on spin
  // ============================================================

  createDealer() {
    const d = this.add.container(this.WHEEL_X, 130);
    // Head
    const head = this.add.graphics();
    head.fillStyle(0x140c08, 1); head.fillCircle(0, 0, 22);
    head.fillStyle(0x2a1810, 0.6); head.fillCircle(-6, -6, 8);
    // Hat brim
    head.fillStyle(0x0a0605, 1);
    head.fillRect(-26, -22, 52, 6);
    head.fillRect(-22, -28, 44, 8);
    // Shoulders
    const torso = this.add.graphics();
    torso.fillStyle(0x140c08, 1);
    torso.beginPath();
    torso.moveTo(-50, 80); torso.lineTo(-30, 25);
    torso.lineTo(30, 25); torso.lineTo(50, 80);
    torso.closePath(); torso.fillPath();
    // White collar accent
    torso.fillStyle(0xc9a961, 0.3);
    torso.fillRect(-3, 25, 6, 30);
    d.add([torso, head]);

    // Hand sprite — separate so we can flick it
    this.dealerHand = this.add.container(this.WHEEL_X + 80, 200);
    const handGfx = this.add.graphics();
    handGfx.fillStyle(0xb89070, 1); handGfx.fillCircle(0, 0, 7);
    handGfx.lineStyle(1, 0x6a4030, 0.6); handGfx.strokeCircle(0, 0, 7);
    this.dealerHand.add(handGfx);
    this.dealerHand.setAlpha(0); // hidden until spin
  }

  flickDealerHand() {
    this.dealerHand.setAlpha(1);
    this.dealerHand.setPosition(this.WHEEL_X + 30, 180);
    this.tweens.add({
      targets: this.dealerHand,
      x: this.WHEEL_X + 130, y: 240,
      duration: 280, ease: 'Cubic.in',
      onComplete: () => {
        this.tweens.add({
          targets: this.dealerHand, alpha: 0, duration: 400,
          delay: 200
        });
      }
    });
  }

  // ============================================================
  //  WHEEL
  // ============================================================

  createWheel() {
    this.wheel = new RouletteWheel(this, this.WHEEL_X, this.WHEEL_Y, this.WHEEL_R);
  }

  // ============================================================
  //  BET CONTROLS — chip selector + clear + undo + spin
  // ============================================================

  createBetControls() {
    // Chip stack selector
    const baseY = 640;
    this.add.text(60, baseY - 30, 'chip:', {
      fontFamily: '"Courier New", monospace', fontSize: '13px', color: '#8b6f47'
    });
    this.chipButtons = [];
    this.CHIP_VALUES.forEach((v, i) => {
      const x = 110 + i * 56;
      const btn = this.makeChipSprite(x, baseY, v);
      btn.setDepth(400);
      const hit = this.add.zone(x, baseY, 32, 32).setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        this.selectedChip = v;
        this.styleChipButtons();
      });
      this.chipButtons.push({ value: v, sprite: btn, hit });
    });
    this.styleChipButtons();

    // CLEAR
    this.clearBtn = this.makeTextButton(420, baseY, 'CLEAR', () => this.clearBets());
    // UNDO
    this.undoBtn  = this.makeTextButton(540, baseY, 'UNDO',  () => this.undoLast());

    // SPIN — bigger, under the wheel
    this.spinBtn = this.makeTextButton(this.WHEEL_X, 600, 'SPIN', () => this.spin(), true);
    this.styleSpinButton();
  }

  styleChipButtons() {
    this.chipButtons.forEach(b => {
      const isSel = b.value === this.selectedChip;
      b.sprite.setScale(isSel ? 1.2 : 1);
      b.sprite.list[0].setAlpha(isSel ? 1 : 0.55);
      b.sprite.list[1].setAlpha(isSel ? 1 : 0.7);
    });
  }

  makeTextButton(x, y, label, onClick, big = false) {
    const w = big ? 180 : 100;
    const h = big ? 50  : 36;
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1208, 0.95); bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, this.GOLD, 0.7); bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    const txt = this.add.text(0, 0, label, {
      fontFamily: '"Courier New", monospace',
      fontSize: big ? '20px' : '14px',
      fontStyle: 'bold',
      color: this.GOLD_HEX
    }).setOrigin(0.5);
    c.add([bg, txt]);
    c.setSize(w, h);
    c.setInteractive({ useHandCursor: true });
    c._bg = bg; c._txt = txt; c._w = w; c._h = h; c._enabled = true;

    c.on('pointerover', () => { if (c._enabled) txt.setColor('#ffd8a0'); });
    c.on('pointerout',  () => { if (c._enabled) txt.setColor(this.GOLD_HEX); });
    c.on('pointerdown', () => { if (c._enabled) onClick(); });
    return c;
  }

  setButtonEnabled(btn, enabled) {
    btn._enabled = enabled;
    btn.setAlpha(enabled ? 1 : 0.4);
    btn._txt.setColor(enabled ? this.GOLD_HEX : '#6a5030');
  }

  styleSpinButton() {
    const hasBets = this.bets.length > 0;
    const hasFreshBets = this.freshBets().length > 0;
    this.setButtonEnabled(this.spinBtn, hasBets && !this.isSpinning);
    this.setButtonEnabled(this.clearBtn, hasFreshBets && !this.isSpinning);
    this.setButtonEnabled(this.undoBtn,  hasFreshBets && !this.isSpinning);
    if (hasBets && !this.isSpinning && !this._spinPulseTween) {
      this._spinPulseTween = this.tweens.add({
        targets: this.spinBtn._txt,
        alpha: { from: 1, to: 0.55 },
        yoyo: true, repeat: -1, duration: 700, ease: 'Sine.inOut'
      });
    } else if ((!hasBets || this.isSpinning) && this._spinPulseTween) {
      this._spinPulseTween.remove(); this._spinPulseTween = null;
      this.spinBtn._txt.setAlpha(1);
    }
  }

  // ============================================================
  //  MESSAGE TEXT — status line above the wheel
  // ============================================================

  createMessageText() {
    this.messageText = this.add.text(this.WHEEL_X, 540, '', {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      color: this.GOLD_HEX, align: 'center'
    }).setOrigin(0.5);
  }

  setMessage(text, color) {
    this.messageText.setColor(color || this.GOLD_HEX);
    this.messageText.setText(text);
  }

  flashMessage(text, color) {
    this.setMessage(text, color);
    if (this._msgFade) this._msgFade.remove();
    this.messageText.setAlpha(1);
    this._msgFade = this.tweens.add({
      targets: this.messageText, alpha: 0.6,
      duration: 1400, delay: 600, ease: 'Sine.out'
    });
  }

  // ============================================================
  //  SPIN FLOW
  // ============================================================

  spin() {
    if (this.isSpinning || this.bets.length === 0) return;
    this.isSpinning = true;
    this.styleSpinButton();
    this.clearPreview();
    this.setMessage('no more bets.', '#ff6b35');

    this.flickDealerHand();

    // Predetermined winning number — 0..36 uniform.
    const winningNumber = Math.floor(Math.random() * 37);
    const duration = 5500;

    this.wheel.spin(winningNumber, duration, (n) => this.onWheelLand(n));
  }

  onWheelLand(winningNumber) {
    this.wheel.highlightWinner(winningNumber);
    this.history.unshift(winningNumber);
    if (this.history.length > 10) this.history.pop();
    this.drawHistory();

    const color = winningNumber === 0
      ? 'GREEN'
      : (this.RED_NUMBERS.includes(winningNumber) ? 'RED' : 'BLACK');
    const colorHex = winningNumber === 0
      ? '#6aff80'
      : (this.RED_NUMBERS.includes(winningNumber) ? '#ff6b6b' : '#e8e8e8');
    this.setMessage(`${color} ${winningNumber}`, colorHex);

    // Resolve after a brief beat so player can see the result land.
    this.time.delayedCall(700, () => this.resolveBets(winningNumber));
  }

  resolveBets(winningNumber) {
    let totalReturn = 0;
    let anyWin = false;
    const newImprisoned = [];

    this.bets.forEach((bet) => {
      const result = this.evaluateBet(bet, winningNumber);
      if (result.refunded) {
        // Imprisoned bet resolving — refund already queued in evaluateBet,
        // chip already flown. Nothing more to do here.
        totalReturn += result.refundAmount || 0;
      } else if (result.win) {
        anyWin = true;
        totalReturn += bet.amount + bet.amount * result.mult;
        this.flyChipsToBank(bet, /*winning*/ true);
      } else if (result.imprisoned) {
        // En Prison: bet stays on the table, outlined red. If next spin matches
        // its even-money condition, the original stake returns (no winnings).
        bet.prisoned = true;
        bet.sprite.list[0].lineStyle(2, 0x8a1a1a, 0.9);
        bet.sprite.list[0].strokeCircle(0, 0, 14);
        newImprisoned.push(bet);
      } else {
        // Loss — fly chip into the dealer's pocket (off-screen).
        this.flyChipsToBank(bet, /*winning*/ false);
      }
    });

    // Bets either won (paid + removed), lost (removed), or imprisoned (kept).
    this.bets = newImprisoned;
    this.imprisoned = newImprisoned;

    if (totalReturn > 0) {
      const chips = this.registry.get('chips');
      this.registry.set('chips', chips + totalReturn);
      this.updateChipDisplay(600);
    }

    this.checkStreaks(winningNumber);

    // Sound based on outcome
    if (anyWin) SFX.slotHit(totalReturn > 100 ? 5 : 2);

    // Re-enable controls for next spin
    this.time.delayedCall(900, () => {
      this.isSpinning = false;
      this.wheel.resetForNextSpin();
      if (this.imprisoned.length > 0) {
        this.flashMessage('your bet is in prison. spin again.', '#ff6b35');
      } else {
        this.setMessage('place your bets.', this.GOLD_HEX);
      }
      this.styleSpinButton();
    });
  }

  evaluateBet(bet, n) {
    // En Prison / La Partage handling for even-money bets: zero wipes them
    // unless they were already imprisoned, in which case they lose for good.
    if (n === 0 && bet.type === 'OUTSIDE' && !bet.prisoned) {
      return { win: false, imprisoned: true };
    }
    if (bet.prisoned) {
      // Resolve previously-imprisoned bet: returns iff this spin matches the
      // imprisoned bet's even-money condition. Either way the bet sprite
      // leaves the table now — a second zero in a row = it's gone for good.
      const wins = this.outsideHits(bet.target, n);
      this.flyChipsToBank(bet, wins);
      return { win: false, imprisoned: false, refunded: true, refundAmount: wins ? bet.amount : 0 };
    }

    switch (bet.type) {
      case 'STRAIGHT':
        return bet.target === n
          ? { win: true, mult: this.PAYOUT.STRAIGHT }
          : { win: false };
      case 'SPLIT':
        return bet.target.includes(n)
          ? { win: true, mult: this.PAYOUT.SPLIT }
          : { win: false };
      case 'CORNER':
        return bet.target.includes(n)
          ? { win: true, mult: this.PAYOUT.CORNER }
          : { win: false };
      case 'COLUMN': {
        if (n === 0) return { win: false };
        const row = 2 - ((n - 1) % 3);
        return row === bet.target
          ? { win: true, mult: this.PAYOUT.COLUMN }
          : { win: false };
      }
      case 'DOZEN': {
        if (n === 0) return { win: false };
        const dz = Math.floor((n - 1) / 12);
        return dz === bet.target
          ? { win: true, mult: this.PAYOUT.DOZEN }
          : { win: false };
      }
      case 'OUTSIDE':
        return this.outsideHits(bet.target, n)
          ? { win: true, mult: this.PAYOUT.OUTSIDE }
          : { win: false };
    }
    return { win: false };
  }

  outsideHits(kind, n) {
    if (n === 0) return false;
    switch (kind) {
      case 'RED':   return this.RED_NUMBERS.includes(n);
      case 'BLACK': return this.BLACK_NUMBERS.includes(n);
      case 'EVEN':  return n % 2 === 0;
      case 'ODD':   return n % 2 === 1;
      case 'LOW':   return n >= 1 && n <= 18;
      case 'HIGH':  return n >= 19 && n <= 36;
    }
    return false;
  }

  // Slide a bet's chip sprite either to the chip-counter (win) or off-screen
  // toward the dealer (loss).
  flyChipsToBank(bet, winning) {
    const target = winning
      ? { x: 1180, y: 28 }
      : { x: this.WHEEL_X, y: 100 };
    this.tweens.add({
      targets: bet.sprite,
      x: target.x, y: target.y,
      alpha: 0, scale: 0.5,
      duration: 520, ease: 'Cubic.in',
      onComplete: () => bet.sprite.destroy()
    });
  }

  // ============================================================
  //  STREAK DETECTION — flashes a chalkboard-style omen badge
  // ============================================================

  checkStreaks(n) {
    const recent = this.history.slice(0, 5);
    let badge = '';

    // Color streak (3+ in same color, ignoring zero)
    if (recent.length >= 3) {
      const col = (x) => x === 0 ? 'G' : (this.RED_NUMBERS.includes(x) ? 'R' : 'B');
      let streakLen = 1;
      for (let i = 1; i < recent.length; i++) {
        if (col(recent[i]) === col(recent[0]) && col(recent[0]) !== 'G') streakLen++;
        else break;
      }
      if (streakLen >= 3) {
        badge = col(recent[0]) === 'R' ? `RUN ON RED ×${streakLen}` : `RUN ON BLACK ×${streakLen}`;
      }
    }

    // Same number twice in a row
    if (!badge && this.history.length >= 2 && this.history[0] === this.history[1]) {
      badge = `${n} HIT TWICE`;
    }

    // Zero twice in last three
    if (!badge && this.history.slice(0, 3).filter(x => x === 0).length >= 2) {
      badge = 'ZERO TWICE — bad omen';
    }

    if (badge) {
      this.streakBadge.setText(badge);
      this.streakBadge.setAlpha(0).setScale(0.8);
      this.tweens.add({
        targets: this.streakBadge, alpha: 1, scale: 1,
        duration: 320, ease: 'Back.out'
      });
      this.tweens.add({
        targets: this.streakBadge, alpha: 0,
        delay: 4000, duration: 800
      });
    } else {
      this.streakBadge.setAlpha(0);
    }
  }

  // ============================================================
  //  CHIP COUNTER ROLL
  // ============================================================

  updateChipDisplay(duration) {
    const target = this.registry.get('chips');
    const dur = duration !== undefined ? duration : 220;
    if (this._chipTween) { this._chipTween.remove(); this._chipTween = null; }
    if (dur <= 0 || this.displayedChips === target) {
      this.displayedChips = target;
      this.chipText.setText(`CHIPS: ${target}`);
      return;
    }
    const from = { v: this.displayedChips };
    this._chipTween = this.tweens.add({
      targets: from, v: target, duration: dur, ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.displayedChips = Math.round(from.v);
        this.chipText.setText(`CHIPS: ${this.displayedChips}`);
      },
      onComplete: () => {
        this.displayedChips = target;
        this.chipText.setText(`CHIPS: ${target}`);
      }
    });
  }
}
