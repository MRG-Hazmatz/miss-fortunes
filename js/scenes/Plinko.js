import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';

export class Plinko extends Phaser.Scene {
  constructor() {
    super('Plinko');

    // === Physics & layout tuning knobs ===
    this.BOARD_X = 730;
    this.PEG_ROWS = 10;
    this.PEG_SPACING_X = 50;
    this.PEG_SPACING_Y = 48;
    this.PEG_RADIUS = 6;
    this.BALL_RADIUS = 9;
    this.FIRST_ROW_Y = 90;
    this.SLOT_Y = 570;
    this.BALL_DROP_Y = 55;
    this.BALL_RESTITUTION = 0.5;
    this.BALL_FRICTION = 0.01;
    this.BALL_DENSITY = 0.01;
    this.PEG_RESTITUTION = 0.5;
    this.PEG_FRICTION = 0.1;
    this.DROP_X_JITTER = 1.0;

    // === Multi-ball tuning ===
    this.GHOST_DURATION = 200;     // ms: ball ignores other balls on spawn
    this.STAGGER_MS = 150;         // ms between balls in a stream
    this.OVERLOAD_BALLS = 25;      // ≥ this → reduce particle counts

    // Matter collision category bits — ghost balls collide with pegs/walls
    // only; once promoted to live they also collide with other live balls.
    this.CAT_PEG = 0x0001;
    this.CAT_WALL = 0x0002;
    this.CAT_BALL = 0x0004;
    this.CAT_GHOST = 0x0008;

    this.multipliers = [10, 5, 2, 1.2, 0.6, 0.3, 0.2, 0.3, 0.6, 1.2, 2, 5, 10];
    this.betOptions = [1, 5, 10, 25];
    this.currentBet = 1;

    // ─── Board catalog ───
    // Each board defines its peg-grid shape and the multiplier curve that
    // hangs beneath it. Slot count is fixed at 13 across all boards so the
    // payout layout reads consistently; the peg-field width per row is what
    // varies. With `bottomPegs = slotCount - 1 = 12` always, the formula
    // for row r is: pegCount = (12 - rows + 1) + r — so SHALLOW GRAVE's
    // 12-row stack starts with 1 peg up top and ends with 12, while
    // MARROW DEEP's 7-row stack starts with 6 and ends with 12. The
    // narrower top-row layouts (like MD) leave outer slots un-pegged →
    // ball "wall slides" into the edge jackpots (25× / 25×).
    //
    // Border `style`: 'static' | 'pulse' | 'cycle'.
    this.BOARDS = {
      SHALLOW_GRAVE: {
        id: 'SHALLOW_GRAVE',
        label: 'SHALLOW GRAVE',
        rows: 12, pegSpacingX: 40, pegSpacingY: 40,
        multipliers: [3, 1.5, 1.2, 1, 0.8, 0.5, 0.4, 0.5, 0.8, 1, 1.2, 1.5, 3],
        // Without these, balls drifting past the outermost regular peg
        // wall-slide unobstructed into the edge 3x slots, heavily biasing
        // the board toward edges. The guards sit above the outer slot
        // centers so wide balls bounce inward instead of through.
        bottomGuardPegs: true,
        border: { color: 0x8b6f47, style: 'static', alpha: 0.5 }
      },
      CROSSROADS: {
        id: 'CROSSROADS',
        label: 'CROSSROADS',
        rows: 10, pegSpacingX: 50, pegSpacingY: 48,
        multipliers: [10, 5, 2, 1.2, 0.6, 0.3, 0.2, 0.3, 0.6, 1.2, 2, 5, 10],
        border: { color: 0xc9a961, style: 'static', alpha: 0.55 }
      },
      MARROW_DEEP: {
        id: 'MARROW_DEEP',
        label: 'MARROW DEEP',
        rows: 7, pegSpacingX: 60, pegSpacingY: 60,
        multipliers: [25, 8, 3, 0.5, 0.2, 0.1, 0.1, 0.1, 0.2, 0.5, 3, 8, 25],
        border: { color: 0x8b2020, style: 'pulse', alpha: 0.65 }
      },
      VOID: {
        id: 'VOID',
        label: 'VOID',
        procedural: true,
        // Filled in by generateVoidBoard() at scene mount
        rows: 10, pegSpacingX: 50, pegSpacingY: 48,
        multipliers: null, removedPegs: null, bumperPeg: null,
        border: { color: 'cycle', style: 'cycle', alpha: 0.7 }
      }
    };
    this.BOARD_ORDER = ['SHALLOW_GRAVE', 'CROSSROADS', 'MARROW_DEEP', 'VOID'];
    this.VOID_UNLOCK_COST = 100; // marrow
    this.SLOT_COUNT = 13;        // fixed across all boards
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(600, 10, 6, 5);

    // Per-scene state (constructor doesn't fire on restart). Phaser scene
    // instances are persistent — every property we set sticks across shutdown
    // and points at destroyed GameObjects. Null out anything iterated by
    // styleX() helpers BEFORE running createUI; otherwise updateChipDisplay
    // will try to setColor on a destroyed multiButton text and throw.
    this.pegMap = new Map();
    this.slotRects = [];
    this.balls = [];
    this.ballMap = new Map();
    this.session = { won: 0, wagered: 0 };
    this.lastDisplayLockUntil = 0;
    this.displayedChips = this.registry.get('chips');
    this.shakeBudget = 0;
    this._chipTween = null;
    this._lastPegSfx = 0;

    // UI references — wiped so style helpers' truthy guards catch them.
    this.multiButtons   = null;
    this.boardButtons   = null;
    this.betButtons     = null;
    this.dropRect       = null;
    this.dropLabel      = null;
    this.dropPulseTween = null;
    this.chipText       = null;
    this.lastWinText    = null;
    this.sessionText    = null;
    this._voidModal     = null;
    this._switchingBoard = false;

    // Board state. `boardObjects` holds every GameObject + Matter body
    // created for the active board so tearDownBoard() can iterate one list.
    this.currentBoardId = 'CROSSROADS';
    this.boardObjects = [];
    this._borderTween = null;

    // Generate a fresh Void layout for this Plinko visit (regenerates each
    // entry, not per drop). If the player switches to Void this is what
    // they get.
    this.BOARDS.VOID = { ...this.BOARDS.VOID, ...this.generateVoidBoard() };

    this.createTextures();
    this.buildBoardForCurrent();
    this.createUI();
    this.setupCollisions();

    // Shared emitters — we manually emit trail particles per live ball each
    // frame, rather than startFollow, so a single emitter serves every ball.
    this.trailEmitter = this.add.particles(0, 0, 'plinko_ball', {
      lifespan: 250,
      alpha: { start: 0.2, end: 0 },
      scale: { start: 0.5, end: 0.1 },
      blendMode: 'ADD',
      emitting: false
    });

    this.sparkEmitter = this.add.particles(0, 0, 'spark', {
      speed: { min: 30, max: 80 },
      lifespan: 220,
      alpha: { start: 0.5, end: 0 },
      scale: { start: 0.4, end: 0 },
      blendMode: 'ADD',
      emitting: false
    });

    // No manual collision cleanup — Phaser tears down the Matter world on
    // scene shutdown, which destroys its listeners. Trying to call
    // matter.world.off() after shutdown throws (world is null by then).
  }

  createTextures() {
    if (this.textures.exists('peg')) return;
    const gfx = this.make.graphics({ add: false });

    gfx.fillStyle(0xc9a961, 0.7);
    gfx.fillCircle(this.PEG_RADIUS, this.PEG_RADIUS, this.PEG_RADIUS);
    gfx.generateTexture('peg', this.PEG_RADIUS * 2, this.PEG_RADIUS * 2);
    gfx.clear();

    // Bumper peg — Void board's bonus high-restitution peg. Brighter so
    // the player notices it ("oh, that one's gonna throw the ball harder").
    const bumperR = this.PEG_RADIUS + 1;
    gfx.fillStyle(0xff6b35, 0.9);
    gfx.fillCircle(bumperR, bumperR, bumperR);
    gfx.fillStyle(0xffd8a0, 0.6);
    gfx.fillCircle(bumperR, bumperR, bumperR - 2);
    gfx.generateTexture('peg_bumper', bumperR * 2, bumperR * 2);
    gfx.clear();

    gfx.fillStyle(0xc9a961, 1);
    gfx.fillCircle(this.BALL_RADIUS, this.BALL_RADIUS, this.BALL_RADIUS);
    gfx.generateTexture('plinko_ball', this.BALL_RADIUS * 2, this.BALL_RADIUS * 2);
    gfx.clear();

    gfx.fillStyle(0xe8c547, 1);
    gfx.fillCircle(2, 2, 2);
    gfx.generateTexture('spark', 4, 4);

    gfx.destroy();
  }

  // ─── Board lifecycle ───
  // tearDownBoard() destroys everything created by buildBoardForCurrent().
  // buildBoardForCurrent() reads this.currentBoardId and re-creates pegs +
  // slots + border according to that board's config.
  //
  // The peg-grid formula is: pegs in row r = (slotCount - rows) + r — so
  // bottom row always has slotCount-1 pegs (= 12 for our 13-slot layout)
  // and top row has slotCount-rows pegs.

  tearDownBoard() {
    if (!this.boardObjects) return;
    this.boardObjects.forEach(o => {
      if (!o) return;
      if (o.type === 'matter-body') {
        // Phaser-attached Matter body — remove from world
        try { this.matter.world.remove(o.body); } catch (e) {}
      } else if (o.destroy) {
        o.destroy();
      }
    });
    this.boardObjects = [];
    this.pegMap.clear();
    this.slotRects = [];
    if (this._borderTween) {
      this._borderTween.remove();
      this._borderTween = null;
    }
    this.boardBorder = null;
    this.boardBorderState = null;
  }

  buildBoardForCurrent() {
    const cfg = this.BOARDS[this.currentBoardId];
    // Update active multipliers for the rest of the scene (slot color logic,
    // payout calc, etc. all read from this.multipliers).
    this.multipliers = cfg.multipliers;

    this.buildPegs(cfg);
    this.buildSlots(cfg);
    this.buildBoardBorder(cfg);
  }

  buildPegs(cfg) {
    const { BOARD_X, PEG_RADIUS } = this;
    const rows = cfg.rows;
    const spacingX = cfg.pegSpacingX;
    const spacingY = cfg.pegSpacingY;
    const bottomPegs = this.SLOT_COUNT - 1;          // 12
    const topPegs = bottomPegs - rows + 1;           // varies per board
    // Anchor the last peg row a little above SLOT_Y so balls have room to
    // settle into the slots.
    const firstRowY = this.SLOT_Y - 50 - (rows - 1) * spacingY;

    // Drop-point indicator (re-drawn per board so its color matches if needed)
    const dropGfx = this.add.graphics();
    dropGfx.fillStyle(0xc9a961, 0.4);
    dropGfx.fillTriangle(
      BOARD_X - 8, this.BALL_DROP_Y - 12,
      BOARD_X + 8, this.BALL_DROP_Y - 12,
      BOARD_X, this.BALL_DROP_Y + 2
    );
    this.boardObjects.push(dropGfx);

    const pegFilter = {
      category: this.CAT_PEG,
      mask: this.CAT_BALL | this.CAT_GHOST
    };

    // For Void: removed pegs are referenced by (row, col) tuple from the
    // base Crossroads grid. Skip those positions.
    // Bumper peg gets higher restitution + brighter color tint.
    const removed = (cfg.removedPegs instanceof Set) ? cfg.removedPegs : null;
    const bumper = cfg.bumperPeg || null;

    for (let row = 0; row < rows; row++) {
      const count = topPegs + row;
      const y = firstRowY + row * spacingY;
      const startX = BOARD_X - (count - 1) * spacingX / 2;
      for (let col = 0; col < count; col++) {
        if (removed && removed.has(`${row},${col}`)) continue;
        const x = startX + col * spacingX;
        const isBumper = bumper && bumper.row === row && bumper.col === col;
        const img = this.add.image(x, y, isBumper ? 'peg_bumper' : 'peg').setAlpha(0.7);
        const body = this.matter.add.circle(x, y, PEG_RADIUS, {
          isStatic: true,
          restitution: isBumper ? 1.0 : this.PEG_RESTITUTION,
          friction: this.PEG_FRICTION,
          label: isBumper ? 'peg_bumper' : 'peg',
          collisionFilter: pegFilter
        });
        this.pegMap.set(body.id, img);
        this.boardObjects.push(img);
        this.boardObjects.push({ type: 'matter-body', body });
      }
    }

    // Optional: extra deflector pegs at the bottom-row corners (Shallow Grave
    // today; flag any board with bottomGuardPegs: true). Catches balls that
    // would otherwise wall-slide into the outermost slots.
    if (cfg.bottomGuardPegs) {
      const guardY = firstRowY + (rows - 1) * spacingY;
      const guardL = BOARD_X - (this.SLOT_COUNT - 1) * cfg.pegSpacingX / 2;
      const guardR = BOARD_X + (this.SLOT_COUNT - 1) * cfg.pegSpacingX / 2;
      for (const gx of [guardL, guardR]) {
        const img = this.add.image(gx, guardY, 'peg').setAlpha(0.7);
        const body = this.matter.add.circle(gx, guardY, PEG_RADIUS, {
          isStatic: true,
          restitution: this.PEG_RESTITUTION,
          friction: this.PEG_FRICTION,
          label: 'peg',
          collisionFilter: pegFilter
        });
        this.pegMap.set(body.id, img);
        this.boardObjects.push(img);
        this.boardObjects.push({ type: 'matter-body', body });
      }
    }

    // Floor — safety net below slots
    const slotStartX = BOARD_X - (this.SLOT_COUNT - 1) * cfg.pegSpacingX / 2;
    const boardL = slotStartX - cfg.pegSpacingX / 2;
    const boardR = slotStartX + this.SLOT_COUNT * cfg.pegSpacingX - cfg.pegSpacingX / 2;
    const floor = this.matter.add.rectangle(BOARD_X, this.SLOT_Y + 35, boardR - boardL + 8, 10, {
      isStatic: true,
      label: 'floor',
      collisionFilter: {
        category: this.CAT_WALL,
        mask: this.CAT_BALL | this.CAT_GHOST
      }
    });
    this.boardObjects.push({ type: 'matter-body', body: floor });
  }

  buildSlots(cfg) {
    const { BOARD_X, SLOT_Y } = this;
    const slotW = cfg.pegSpacingX;
    const slotH = 60;
    const multipliers = cfg.multipliers;
    const startX = BOARD_X - (multipliers.length - 1) * slotW / 2;

    const gfx = this.add.graphics();
    this.boardObjects.push(gfx);

    const wallFilter = {
      category: this.CAT_WALL,
      mask: this.CAT_BALL | this.CAT_GHOST
    };

    multipliers.forEach((mult, i) => {
      const x = startX + i * slotW;
      const color = this.getSlotColor(mult);
      const textColor = this.getSlotTextColor(mult);

      // Slot floor — tier-colored fill at readable alpha (was 0.07, basically invisible)
      gfx.fillStyle(color, 0.28);
      gfx.fillRect(x - slotW / 2 + 2, SLOT_Y - slotH / 2, slotW - 4, slotH);
      // Top rim — beefier glowing band at the slot lip (was 3px @ 0.45)
      gfx.fillStyle(color, 0.7);
      gfx.fillRect(x - slotW / 2 + 2, SLOT_Y - slotH / 2, slotW - 4, 5);
      // Brass border so each slot reads as a discrete pocket
      gfx.lineStyle(1, 0x3d2817, 0.6);
      gfx.strokeRect(x - slotW / 2 + 2, SLOT_Y - slotH / 2, slotW - 4, slotH);

      const txt = this.add.text(x, SLOT_Y + 8, `${mult}x`, {
        fontFamily: '"Courier New", monospace',
        fontSize: mult >= 5 ? '14px' : '11px',
        fontStyle: mult >= 5 ? 'bold' : 'normal',
        color: textColor
      }).setOrigin(0.5);
      this.boardObjects.push(txt);

      const flashRect = this.add.rectangle(x, SLOT_Y, slotW - 4, slotH);
      flashRect.setFillStyle(color, 1);
      flashRect.setAlpha(0);
      this.slotRects.push(flashRect);
      this.boardObjects.push(flashRect);

      const sensor = this.matter.add.rectangle(x, SLOT_Y + 18, slotW - 10, 14, {
        isStatic: true,
        isSensor: true,
        label: `slot_${i}`,
        collisionFilter: wallFilter
      });
      this.boardObjects.push({ type: 'matter-body', body: sensor });
    });

    // Dividers + outer walls
    for (let i = 0; i <= multipliers.length; i++) {
      const dx = startX - slotW / 2 + i * slotW;
      const isWall = (i === 0 || i === multipliers.length);

      gfx.fillStyle(0x2a1810, 0.6);
      gfx.fillRect(dx - 2, SLOT_Y - slotH / 2, 4, slotH);

      const h = isWall ? 560 : 75;
      const cy = isWall ? 320 : SLOT_Y;
      const body = this.matter.add.rectangle(dx, cy, 4, h, {
        isStatic: true,
        restitution: 0.2,
        label: isWall ? 'wall' : 'divider',
        collisionFilter: wallFilter
      });
      this.boardObjects.push({ type: 'matter-body', body });
    }
  }

  // Per-board border with optional pulse/cycle behavior. Drawn on its own
  // graphics object so we can re-draw and re-style without touching pegs.
  buildBoardBorder(cfg) {
    const { BOARD_X, SLOT_Y } = this;
    const slotW = cfg.pegSpacingX;
    const startX = BOARD_X - (cfg.multipliers.length - 1) * slotW / 2;
    const x = startX - slotW / 2;
    const y = 50;
    const w = slotW * cfg.multipliers.length;
    const h = SLOT_Y + 30 - 50;

    const border = this.add.graphics();
    this.boardBorder = border;
    this.boardObjects.push(border);

    const drawAt = (color, alpha) => {
      border.clear();
      border.lineStyle(2, color, alpha);
      border.strokeRect(x, y, w, h);
    };

    if (cfg.border.style === 'static') {
      drawAt(cfg.border.color, cfg.border.alpha);
    } else if (cfg.border.style === 'pulse') {
      drawAt(cfg.border.color, cfg.border.alpha);
      this.boardBorderState = { alpha: cfg.border.alpha };
      this._borderTween = this.tweens.add({
        targets: this.boardBorderState,
        alpha: { from: cfg.border.alpha * 0.6, to: cfg.border.alpha },
        duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
        onUpdate: () => drawAt(cfg.border.color, this.boardBorderState.alpha)
      });
    } else if (cfg.border.style === 'cycle') {
      // Hue cycle: violet → green → tarnished gold over ~10s.
      const palette = [0x5a3a6a, 0x4a7a4a, 0xa89050];
      this.boardBorderState = { t: 0 };
      this._borderTween = this.tweens.add({
        targets: this.boardBorderState,
        t: { from: 0, to: palette.length },
        duration: 10000, repeat: -1, ease: 'Linear',
        onUpdate: () => {
          const t = this.boardBorderState.t % palette.length;
          const i = Math.floor(t);
          const j = (i + 1) % palette.length;
          const f = t - i;
          // Lerp RGB channels
          const a = palette[i], b = palette[j];
          const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
          const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
          const r = Math.round(ar + (br - ar) * f);
          const g = Math.round(ag + (bg - ag) * f);
          const bl = Math.round(ab + (bb - ab) * f);
          const color = (r << 16) | (g << 8) | bl;
          drawAt(color, cfg.border.alpha);
        }
      });
    }
  }

  // ─── Void procedural generator ───
  // Generates a procedurally-modified Crossroads board:
  //  • starts with a 10-row, 75-peg base grid
  //  • removes pegs randomly until 60–90% of base peg count remains
  //  • optional bumper peg (30% chance, restitution 1.0, brighter)
  //  • samples 13 multipliers from a pool, sorts descending, alternates
  //    fill outside-in (high at edges, low in center) for stable EV,
  //    then injects 3 random adjacent swaps for chaos
  //  • validates via 5000-drop Monte Carlo: every slot must be reachable
  //    AND total expected value must land in [0.85, 1.15] of bet
  //  • up to 50 attempts; falls back to a Crossroads-shape with shuffled
  //    multipliers if no valid layout is found.
  generateVoidBoard() {
    const rows = 10;
    const slotCount = this.SLOT_COUNT;
    const bottomPegs = slotCount - 1;            // 12
    const topPegs = bottomPegs - rows + 1;       // 3 — same as Crossroads
    const basePegCount = (() => {
      let s = 0;
      for (let r = 0; r < rows; r++) s += topPegs + r;
      return s;
    })();
    const pool = [25, 10, 8, 5, 3, 2, 1.2, 0.5, 0.3, 0.1, 0.1];

    for (let attempt = 0; attempt < 50; attempt++) {
      const targetPegs = Math.floor(basePegCount * (0.6 + Math.random() * 0.3));
      const removeCount = basePegCount - targetPegs;

      // Build the full peg list, shuffle, mark first `removeCount` as removed.
      const pegs = [];
      for (let r = 0; r < rows; r++) {
        const count = topPegs + r;
        for (let c = 0; c < count; c++) pegs.push({ row: r, col: c });
      }
      // Fisher-Yates shuffle
      for (let i = pegs.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [pegs[i], pegs[j]] = [pegs[j], pegs[i]];
      }
      const removedPegs = new Set(
        pegs.slice(0, removeCount).map(p => `${p.row},${p.col}`)
      );

      // Optional bumper (30% chance) — pick one surviving peg
      let bumperPeg = null;
      if (Math.random() < 0.3) {
        const survivors = pegs.slice(removeCount);
        if (survivors.length > 0) {
          bumperPeg = survivors[Math.floor(Math.random() * survivors.length)];
        }
      }

      // Sample 13 multipliers from the pool (with replacement)
      const sampled = [];
      for (let i = 0; i < slotCount; i++) {
        sampled.push(pool[Math.floor(Math.random() * pool.length)]);
      }
      sampled.sort((a, b) => b - a);

      // Alternating fill from outside-in: sampled is descending, so
      // sampled[0] (highest) lands at slot 0, sampled[1] at slot 12,
      // sampled[2] at slot 1, etc. → highs at edges, lows in center.
      // Keeps EV stable while the visual chaos still hits.
      const placed = new Array(slotCount);
      let outerL = 0, outerR = slotCount - 1;
      for (let i = 0; i < slotCount; i++) {
        if (i % 2 === 0) placed[outerL++] = sampled[i];
        else             placed[outerR--] = sampled[i];
      }
      // 3 random adjacent swaps for chaos
      for (let s = 0; s < 3; s++) {
        const i = Math.floor(Math.random() * (slotCount - 1));
        [placed[i], placed[i + 1]] = [placed[i + 1], placed[i]];
      }

      // Validate via Monte Carlo
      const result = this.simulateVoidBoard(rows, topPegs, bottomPegs, removedPegs, placed);
      if (!result.allReachable) continue;
      if (result.ev < 0.85 || result.ev > 1.15) continue;

      // Accepted!
      return {
        rows, pegSpacingX: 50, pegSpacingY: 48,
        multipliers: placed,
        removedPegs,
        bumperPeg,
        _ev: result.ev,
        _attempts: attempt + 1
      };
    }

    // Fallback after 50 attempts — full Crossroads grid with shuffled multipliers
    const fallback = [10, 5, 2, 1.2, 0.6, 0.3, 0.2, 0.3, 0.6, 1.2, 2, 5, 10];
    return {
      rows, pegSpacingX: 50, pegSpacingY: 48,
      multipliers: fallback,
      removedPegs: new Set(),
      bumperPeg: null,
      _ev: null,
      _attempts: 50
    };
  }

  // Simplified Monte Carlo — drops `samples` virtual balls and tracks slot
  // distribution. Ball travels in slot-coord space [0..bottomPegs]:
  //   • Each row: if a peg sits at the ball's column, deflect ±0.75 (wider
  //     than pure binomial; real plinko has bounce-off-multiple-pegs chaos
  //     that smears the distribution toward the edges).
  //   • Gap rows still wobble ±0.25 — momentum carry-over from prior bounces.
  //   • Walls bounce the ball back so edge slots are reachable instead of
  //     truncated. Without this, slot 0 and 12 are essentially impossible.
  // Final x is clamped + rounded into a slot index 0..(slotCount-1).
  //
  // Returns { ev, allReachable, hits } where hits[i] is the per-slot count.
  simulateVoidBoard(rows, topPegs, bottomPegs, removedPegs, multipliers) {
    const samples = 8000;
    const slotCount = multipliers.length;
    const hits = new Array(slotCount).fill(0);
    const deflectMag = 0.75;
    const gapWobble = 0.25;

    for (let s = 0; s < samples; s++) {
      // Tiny entry jitter so the ball doesn't always start exactly center
      let x = bottomPegs / 2 + (Math.random() - 0.5) * 0.4;

      for (let r = 0; r < rows; r++) {
        const rowPegCount = topPegs + r;
        const pegStart = (bottomPegs - rowPegCount) / 2;
        const localCol = Math.round(x - pegStart);
        const hasPeg = localCol >= 0 && localCol < rowPegCount
          && !removedPegs.has(`${r},${localCol}`);

        if (hasPeg) {
          x += (Math.random() < 0.5 ? -deflectMag : deflectMag);
        } else {
          x += (Math.random() - 0.5) * gapWobble;
        }
        // Wall bounce — ball pushed back into the play field
        if (x < 0) x = -x;
        if (x > bottomPegs) x = 2 * bottomPegs - x;
      }

      let slot = Math.round(x);
      if (slot < 0) slot = 0;
      if (slot >= slotCount) slot = slotCount - 1;
      hits[slot]++;
    }

    let ev = 0;
    for (let i = 0; i < slotCount; i++) {
      ev += (hits[i] / samples) * multipliers[i];
    }
    const allReachable = hits.every(h => h > 0);
    return { ev, allReachable, hits };
  }

  createUI() {
    // Back button
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout', () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      this.cameras.main.fadeOut(600, 10, 6, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });

    // ─── Board selector — 4 buttons centered above the board ───
    this.createBoardSelector();

    // Chip counter (ticker-animated)
    this.chipText = this.add.text(30, 78, '', {
      fontFamily: '"Courier New", monospace', fontSize: '22px', color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    });
    this.updateChipDisplay(0);

    // LAST — most recent single-ball payout
    this.lastWinText = this.add.text(30, 114, 'LAST: —', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#8b6f47'
    });

    // SESSION — cumulative for this Plinko visit (resets on entry)
    this.sessionText = this.add.text(30, 138, 'SESSION: 0 / 0', {
      fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#6a5030'
    });

    // Bet label
    this.add.text(30, 180, '─── BET ───', {
      fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#6a5030'
    });

    // Bet buttons (2x2)
    this.betButtons = [];
    this.betOptions.forEach((amt, i) => {
      const bx = 78 + (i % 2) * 110;
      const by = 225 + Math.floor(i / 2) * 52;
      const rect = this.add.rectangle(bx, by, 95, 40);
      const lbl = this.add.text(bx, by, `${amt}`, {
        fontFamily: '"Courier New", monospace', fontSize: '18px', fontStyle: 'bold'
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        this.currentBet = amt;
        this.updateBetButtons();
        this.styleDropButton();
        this.styleMultiButtons();
      });
      this.betButtons.push({ rect, lbl, amt });
    });
    this.updateBetButtons();

    // DROP — single ball, classic mode. Locked while ANY ball is in flight.
    // This is the patience button: one ball at a time, wait, breathe, drop again.
    this.dropRect = this.add.rectangle(130, 362, 220, 50);
    this.dropRect.setStrokeStyle(2, 0xc9a961);
    this.dropRect.setFillStyle(0xc9a961, 0.06);
    this.dropLabel = this.add.text(130, 362, 'DROP', {
      fontFamily: '"Courier New", monospace', fontSize: '26px', fontStyle: 'bold', color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 10, fill: true }
    }).setOrigin(0.5);
    this.dropRect.setInteractive({ useHandCursor: true });
    this.dropRect.on('pointerover', () => {
      if (this.isBoardBusy() || !this.canAffordBet()) return;
      this.dropRect.setStrokeStyle(3, 0xe8c547);
      this.dropLabel.setColor('#e8c547');
    });
    this.dropRect.on('pointerout', () => this.styleDropButton());
    this.dropRect.on('pointerdown', () => {
      if (this.isBoardBusy() || !this.canAffordBet()) return;
      this.dropBall();
      // Quick press feedback — a spam-clicker wants to feel each click
      this.tweens.add({
        targets: [this.dropRect, this.dropLabel],
        scaleX: { from: 0.96, to: 1 }, scaleY: { from: 0.96, to: 1 },
        duration: 110, ease: 'Sine.easeOut'
      });
    });

    // Idle pulse on DROP — draws the eye. Paused while locked.
    this.dropPulseTween = this.tweens.add({
      targets: [this.dropRect, this.dropLabel],
      alpha: { from: 1, to: 0.75 },
      duration: 1500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // ─── Divider between SINGLE and MULTI-DROP sections ───
    const divider = this.add.graphics();
    divider.lineStyle(1, 0x2a1810, 0.8);
    divider.lineBetween(40, 412, 220, 412);

    this.add.text(130, 428, 'MULTI-DROP', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#6a5030', letterSpacing: 3
    }).setOrigin(0.5);

    // Multi-drop row (×5 ×10 ×15) — separate section, same lock as DROP.
    // Chaos mode: stake all up front, balls drop staggered with ball-to-ball
    // collisions enabled once ghost window expires.
    this.multiButtons = [];
    [5, 10, 15].forEach((count, i) => {
      const bx = 60 + i * 75;
      const by = 468;
      const rect = this.add.rectangle(bx, by, 65, 38);
      const lbl = this.add.text(bx, by, `×${count}`, {
        fontFamily: '"Courier New", monospace', fontSize: '16px', fontStyle: 'bold'
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        if (this.isBoardBusy()) return;
        // Strict gate: must afford the full stake. The disabled visual
        // tells the player this; the click handler enforces it.
        if (this.registry.get('chips') < count * this.currentBet) return;
        this.dropStream(count);
        this.tweens.add({
          targets: [rect, lbl],
          scaleX: { from: 0.92, to: 1 }, scaleY: { from: 0.92, to: 1 },
          duration: 120, ease: 'Sine.easeOut'
        });
      });
      rect.on('pointerover', () => {
        if (this.isBoardBusy()) return;
        if (this.registry.get('chips') >= count * this.currentBet) {
          rect.setStrokeStyle(2, 0xe8c547);
          lbl.setColor('#e8c547');
        }
      });
      rect.on('pointerout', () => this.styleMultiButtons());
      this.multiButtons.push({ rect, lbl, count });
    });
    this.styleMultiButtons();
  }

  // True whenever anything is still on the board. Both DROP and MULTI-DROP
  // respect this lock — patience is the price of playing either mode.
  isBoardBusy() {
    return this.balls.length > 0;
  }

  // ─── Board selector ───
  // Vertical stack in the right gutter (between the widest play field and
  // the canvas right edge). Sits in the empty wood-paneling area mirroring
  // the parlor's "old signs in a hallway" aesthetic — same layout pattern
  // as the Bookie bet-type column, for visual continuity across rooms.
  // Locked Void shows "?" with "100 marrow / unlock" stacked beneath it.
  createBoardSelector() {
    const bx = 1205;            // right-gutter center column
    const startY = 150;          // first button y
    const stepY  = 56;           // pitch between buttons
    const btnW = 130, btnH = 40;

    // Header above the stack
    this.boardHeader = this.add.text(bx, startY - 38, '─ BOARD ─', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#6a5030', letterSpacing: 2
    }).setOrigin(0.5);

    this.boardButtons = [];
    this.BOARD_ORDER.forEach((id, i) => {
      const y = startY + i * stepY;
      const cfg = this.BOARDS[id];

      const rect = this.add.rectangle(bx, y, btnW, btnH);
      const label = this.add.text(bx, y, cfg.label, {
        fontFamily: '"Courier New", monospace', fontSize: '12px', fontStyle: 'bold'
      }).setOrigin(0.5);

      // Sub-label sits just below this button — used only for locked Void
      // ("100 marrow / unlock"). Two lines for breathing room.
      const sub = this.add.text(bx, y + btnH / 2 + 11, '', {
        fontFamily: '"Courier New", monospace', fontSize: '9px',
        color: '#6a5030', align: 'center', lineSpacing: 2
      }).setOrigin(0.5);

      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.onBoardButtonClick(id));
      rect.on('pointerover', () => {
        if (this.isBoardBusy()) return;
        if (id === this.currentBoardId) return;
        if (id === 'VOID' && !GameState.isUnlocked(this.game, 'voidPlinko')) {
          label.setColor('#d4a574');
        } else {
          label.setColor('#e8c547');
        }
      });
      rect.on('pointerout', () => this.styleBoardButtons());
      this.boardButtons.push({ id, rect, label, sub });
    });

    // Small italic flavor line below the entire stack — describes the
    // currently-selected board so the player has a one-glance personality
    // tag for each option. Updated by styleBoardButtons.
    const lastBtnY = startY + (this.BOARD_ORDER.length - 1) * stepY;
    this.boardFlavor = this.add.text(bx, lastBtnY + btnH / 2 + 38, '', {
      fontFamily: '"Courier New", monospace', fontSize: '10px',
      fontStyle: 'italic', color: '#5a4530', align: 'center',
      wordWrap: { width: btnW + 24 }, lineSpacing: 2
    }).setOrigin(0.5, 0);

    this.styleBoardButtons();
  }

  styleBoardButtons() {
    if (!this.boardButtons) return;
    const busy = this.isBoardBusy();
    this.boardButtons.forEach(({ id, rect, label, sub }) => {
      const cfg = this.BOARDS[id];
      const isCurrent = id === this.currentBoardId;
      const isLockedVoid = id === 'VOID'
        && !GameState.isUnlocked(this.game, 'voidPlinko');

      // Button label text — "?" for locked Void, otherwise the board name
      label.setText(isLockedVoid ? '?' : cfg.label);
      // Sub-label for locked Void only — 2 lines for legibility
      sub.setText(isLockedVoid ? '100 marrow\nunlock' : '');

      // Pick a border color for the button:
      //   selected → board's own accent color (matches play-field border)
      //   locked   → cool grey
      //   else     → dim amber
      let borderColor;
      if (isCurrent) {
        borderColor = (typeof cfg.border.color === 'number')
          ? cfg.border.color : 0xc9a961;
      } else if (isLockedVoid) {
        borderColor = 0x3d2817;
      } else {
        borderColor = 0x6a5030;
      }

      rect.setStrokeStyle(isCurrent ? 2 : 1, borderColor);
      rect.setFillStyle(borderColor, isCurrent ? 0.12 : 0);

      // Text color
      if (isCurrent) {
        label.setColor('#ffd8a0');
      } else if (isLockedVoid) {
        label.setColor('#6a5030');
      } else {
        label.setColor('#8b6f47');
      }

      // Dim everything during balls-in-flight to signal the lock
      const a = busy ? 0.55 : 1;
      rect.setAlpha(a);
      label.setAlpha(a);
      sub.setAlpha(a * 0.85);
    });

    // Flavor line — one-glance personality for the active board.
    if (this.boardFlavor) {
      const FLAVOR = {
        SHALLOW_GRAVE: 'safe water.\nyou rarely lose much,\nyou rarely win much.',
        CROSSROADS:    'the classic curve.\nthe house standard.',
        MARROW_DEEP:   'death trap center.\njackpot edges.',
        VOID:          'chaos.\nfresh layout each visit.'
      };
      this.boardFlavor.setText(FLAVOR[this.currentBoardId] || '');
      this.boardFlavor.setAlpha(busy ? 0.35 : 0.85);
    }
  }

  onBoardButtonClick(id) {
    if (this.isBoardBusy()) return;
    if (id === this.currentBoardId) return;

    if (id === 'VOID' && !GameState.isUnlocked(this.game, 'voidPlinko')) {
      this.showVoidUnlockModal();
      return;
    }
    this.switchBoard(id);
  }

  // Brief peg fade-out → tear down → build new → fade-in. Resets session.
  // Uses delayedCall instead of nested tween.onComplete because Phaser's
  // tween onComplete can silently drop when targets are destroyed mid-flight
  // (which is exactly what tearDownBoard does), leaving _switchingBoard
  // stuck at true. delayedCall doesn't care about target lifecycles.
  switchBoard(newId) {
    if (this.isBoardBusy()) return;
    if (this._switchingBoard) return;
    this._switchingBoard = true;

    // Phase 1: fade existing pegs/slots out (visual only)
    const fadeTargets = this.boardObjects.filter(o => o && o.setAlpha);
    if (fadeTargets.length > 0) {
      this.tweens.add({
        targets: fadeTargets,
        alpha: 0, duration: 250, ease: 'Sine.easeIn'
      });
    }

    // Phase 2: tear down + rebuild after fade-out finishes
    this.time.delayedCall(260, () => {
      this.tearDownBoard();
      this.currentBoardId = newId;
      // Roll a fresh Void layout on each switch INTO Void, not just on scene
      // mount — keeps the board feeling chaotic within a single Plinko visit.
      if (newId === 'VOID') {
        this.BOARDS.VOID = { ...this.BOARDS.VOID, ...this.generateVoidBoard() };
      }
      this.buildBoardForCurrent();

      // Fresh session per board
      this.session = { won: 0, wagered: 0 };
      this.updateSessionDisplay();
      if (this.lastWinText) this.lastWinText.setText('LAST: —');

      // Phase 3: fade newly-built peg/slot graphics in from 0
      const newTargets = this.boardObjects.filter(o => o && o.setAlpha);
      newTargets.forEach(o => o.setAlpha(0));
      if (newTargets.length > 0) {
        this.tweens.add({
          targets: newTargets,
          alpha: 1, duration: 250, ease: 'Sine.easeOut'
        });
      }

      this.styleBoardButtons();
      this.styleDropButton();
      this.styleMultiButtons();
    });

    // Phase 4: clear the lock independent of any tween's lifecycle
    this.time.delayedCall(560, () => { this._switchingBoard = false; });
  }

  showVoidUnlockModal() {
    if (this._voidModal) return;
    const marrow = this.registry.get('marrow');
    const canAfford = marrow >= this.VOID_UNLOCK_COST;

    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.78);
    dim.fillRect(0, 0, 1280, 720);
    dim.setDepth(9999);

    const box = this.add.container(640, 360);
    box.setDepth(10000);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f0906, 0.98);
    bg.fillRoundedRect(-280, -120, 560, 240, 8);
    bg.lineStyle(2, 0x5a3a6a, 0.85);
    bg.strokeRoundedRect(-280, -120, 560, 240, 8);
    box.add(bg);

    box.add(this.add.text(0, -85, 'THE VOID', {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      color: '#aa00ff', letterSpacing: 4
    }).setOrigin(0.5));

    box.add(this.add.text(0, -35,
      canAfford
        ? `Spend ${this.VOID_UNLOCK_COST} marrow to unlock The Void?\nThe board generates fresh on every Plinko visit.`
        : `The Void wants ${this.VOID_UNLOCK_COST} marrow.\nYou have ${marrow}. Come back richer.`,
      {
        fontFamily: '"Courier New", monospace', fontSize: '13px',
        color: '#c9a961', align: 'center', lineSpacing: 5
      }).setOrigin(0.5));

    const mkBtn = (x, label, color, onClick, enabled = true) => {
      const c = this.add.container(x, 60);
      const r = this.add.rectangle(0, 0, 150, 40);
      r.setStrokeStyle(2, color, enabled ? 0.9 : 0.4);
      r.setFillStyle(color, enabled ? 0.08 : 0);
      const t = this.add.text(0, 0, label, {
        fontFamily: '"Courier New", monospace', fontSize: '13px',
        fontStyle: 'bold', color: '#' + color.toString(16).padStart(6, '0')
      }).setOrigin(0.5);
      if (!enabled) t.setAlpha(0.4);
      c.add([r, t]);
      r.setInteractive({ useHandCursor: true });
      r.on('pointerdown', () => { if (enabled) onClick(); });
      return c;
    };

    box.add(mkBtn(-90, 'CANCEL', 0x8b6f47, () => this.closeVoidUnlockModal()));
    box.add(mkBtn( 90, canAfford ? 'UNLOCK' : 'NOT YET',
      canAfford ? 0xa89050 : 0x4a3a25,
      () => this.confirmVoidUnlock(),
      canAfford
    ));

    this._voidModal = { dim, box };
  }

  closeVoidUnlockModal() {
    if (!this._voidModal) return;
    this._voidModal.dim.destroy();
    this._voidModal.box.destroy();
    this._voidModal = null;
  }

  confirmVoidUnlock() {
    const marrow = this.registry.get('marrow');
    if (marrow < this.VOID_UNLOCK_COST) return;
    this.registry.set('marrow', marrow - this.VOID_UNLOCK_COST);
    GameState.unlock(this.game, 'voidPlinko');
    this.closeVoidUnlockModal();
    this.styleBoardButtons();
    // Auto-switch into the freshly-unlocked Void
    this.switchBoard('VOID');
  }

  updateBetButtons() {
    this.betButtons.forEach(({ rect, lbl, amt }) => {
      const sel = amt === this.currentBet;
      rect.setStrokeStyle(sel ? 2 : 1, sel ? 0xc9a961 : 0x3d2817);
      rect.setFillStyle(0xc9a961, sel ? 0.08 : 0);
      lbl.setColor(sel ? '#c9a961' : '#6a5030');
    });
  }

  // ─── Three explicit visual states ───
  //
  //   idle     — interactive, gold border, hover brightens
  //   busy     — balls in flight, warm-dim gold, alpha 0.55
  //   disabled — can't afford, cool grey, alpha 0.6
  //
  // The two locked states deliberately look different so the player reads
  // "wait your turn" vs "you can't afford this" at a glance.
  styleMultiButtons() {
    if (!this.multiButtons) return;
    const chips = this.registry.get('chips');
    const busy = this.isBoardBusy();
    this.multiButtons.forEach(({ rect, lbl, count }) => {
      const stake = count * this.currentBet;
      const canAfford = chips >= stake;
      const state = busy ? 'busy' : canAfford ? 'idle' : 'disabled';

      if (state === 'idle') {
        rect.setStrokeStyle(2, 0xc9a961);
        rect.setFillStyle(0xc9a961, 0.04);
        lbl.setColor('#c9a961');
        rect.setAlpha(1); lbl.setAlpha(1);
      } else if (state === 'busy') {
        // Warm dim — same hue as idle, just locked
        rect.setStrokeStyle(1, 0x6a5030);
        rect.setFillStyle(0xc9a961, 0);
        lbl.setColor('#8b6f47');
        rect.setAlpha(0.55); lbl.setAlpha(0.55);
      } else {
        // Cool grey — distinctly NOT gold, so it reads as unaffordable
        rect.setStrokeStyle(1, 0x2a2418);
        rect.setFillStyle(0x000000, 0);
        lbl.setColor('#3a3225');
        rect.setAlpha(0.6); lbl.setAlpha(0.6);
      }
    });
  }

  // Chip counter ticker — duration should match how long the stake takes
  // to visually drain (×25 stream = ~3.75s, single drop = fast).
  updateChipDisplay(duration) {
    const target = this.registry.get('chips');
    const dur = duration !== undefined ? duration : 220;
    if (this._chipTween) { this._chipTween.remove(); this._chipTween = null; }
    if (dur <= 0 || this.displayedChips === target) {
      this.displayedChips = target;
      this.chipText.setText(`CHIPS: ${target}`);
      if (this.multiButtons) this.styleMultiButtons();
      if (this.dropRect) this.styleDropButton();
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
        if (this.multiButtons) this.styleMultiButtons();
        if (this.dropRect) this.styleDropButton();
      }
    });
  }

  updateSessionDisplay() {
    const net = this.session.won - this.session.wagered;
    const color = net > 0 ? '#c9a961' : net < 0 ? '#8b6f47' : '#6a5030';
    this.sessionText.setText(`SESSION: ${this.session.won} / ${this.session.wagered}`);
    this.sessionText.setColor(color);
  }

  canAffordBet() {
    return this.registry.get('chips') >= this.currentBet;
  }

  // Same three-state model as styleMultiButtons. Pulse runs only in 'idle'.
  styleDropButton() {
    const busy = this.isBoardBusy();
    const canAfford = this.canAffordBet();
    const state = busy ? 'busy' : canAfford ? 'idle' : 'disabled';

    if (state === 'idle') {
      this.dropRect.setStrokeStyle(2, 0xc9a961);
      this.dropLabel.setColor('#c9a961');
      if (this.dropPulseTween && this.dropPulseTween.isPaused()) this.dropPulseTween.resume();
    } else if (state === 'busy') {
      // Warm-dim gold — "wait your turn"
      this.dropRect.setStrokeStyle(2, 0x6a5030);
      this.dropLabel.setColor('#8b6f47');
      if (this.dropPulseTween && !this.dropPulseTween.isPaused()) this.dropPulseTween.pause();
      this.dropRect.setAlpha(0.55);
      this.dropLabel.setAlpha(0.55);
    } else {
      // Cool grey — "you can't afford this." Visually distinct from busy.
      this.dropRect.setStrokeStyle(2, 0x2a2418);
      this.dropLabel.setColor('#3a3225');
      if (this.dropPulseTween && !this.dropPulseTween.isPaused()) this.dropPulseTween.pause();
      this.dropRect.setAlpha(0.6);
      this.dropLabel.setAlpha(0.6);
    }
  }

  // Single click → one ball, stake comes out now, chip ticker is quick.
  // Board must be empty — single DROP is the patience mode.
  dropBall() {
    if (this.isBoardBusy()) return;
    if (!this.canAffordBet()) return;

    const chips = this.registry.get('chips');
    this.registry.set('chips', chips - this.currentBet);
    this.session.wagered += this.currentBet;
    this.updateChipDisplay(220);
    this.updateSessionDisplay();

    this.spawnBall(this.currentBet);
    // Refresh styles now so the lock visual kicks in immediately
    this.styleDropButton();
    this.styleMultiButtons();
    this.styleBoardButtons && this.styleBoardButtons();
  }

  // Multi-drop click → stake everything up front, balls drop staggered.
  // Chip ticker duration syncs to the stream length so the drain looks
  // like the stream is consuming it in real time.
  // Also blocked while board is busy — no stacking a multi on top of a single.
  dropStream(count) {
    if (this.isBoardBusy()) return;
    const bet = this.currentBet;
    const chips = this.registry.get('chips');
    const affordable = Math.min(count, Math.floor(chips / bet));
    if (affordable === 0) return;

    this.registry.set('chips', chips - affordable * bet);
    this.session.wagered += affordable * bet;

    const totalMs = Math.max(400, affordable * this.STAGGER_MS);
    this.updateChipDisplay(totalMs);
    this.updateSessionDisplay();

    // Spawn the first ball synchronously so isBoardBusy() flips true
    // before any other input event can fire. Rest follow on the stagger.
    for (let i = 0; i < affordable; i++) {
      if (i === 0) this.spawnBall(bet);
      else this.time.delayedCall(i * this.STAGGER_MS, () => this.spawnBall(bet));
    }
    this.styleDropButton();
    this.styleMultiButtons();
    this.styleBoardButtons && this.styleBoardButtons();
  }

  // Low-level spawn — chips already deducted by the caller. Bakes in a
  // ghost window so rapid drops don't clump at the spawn point.
  spawnBall(bet) {
    const ball = this.matter.add.image(
      this.BOARD_X + Phaser.Math.FloatBetween(-1, 1),
      this.BALL_DROP_Y,
      'plinko_ball',
      null,
      {
        circleRadius: this.BALL_RADIUS,
        restitution: this.BALL_RESTITUTION,
        friction: this.BALL_FRICTION,
        density: this.BALL_DENSITY,
        label: 'ball',
        collisionFilter: {
          category: this.CAT_GHOST,
          mask: this.CAT_PEG | this.CAT_WALL
        }
      }
    );
    ball.setVelocity(Phaser.Math.FloatBetween(-this.DROP_X_JITTER, this.DROP_X_JITTER), 1);
    ball.setAlpha(0.4);  // ghost visual — materializes at 200ms

    const record = {
      image: ball,
      id: ball.body.id,
      active: true,
      ghost: true,
      bet
    };
    this.balls.push(record);
    this.ballMap.set(ball.body.id, record);

    this.time.delayedCall(this.GHOST_DURATION, () => this.makeBallLive(record));
  }

  // Ghost → live: flip collision category to BALL, fade to full opacity.
  makeBallLive(record) {
    if (!record.image || !record.image.body) return;  // already destroyed
    record.ghost = false;
    // Use Phaser's Matter collision component methods — more portable than
    // mutating body.collisionFilter directly across engine versions.
    if (record.image.setCollisionCategory) {
      record.image.setCollisionCategory(this.CAT_BALL);
      record.image.setCollidesWith(this.CAT_PEG | this.CAT_WALL | this.CAT_BALL);
    } else {
      record.image.body.collisionFilter.category = this.CAT_BALL;
      record.image.body.collisionFilter.mask = this.CAT_PEG | this.CAT_WALL | this.CAT_BALL;
    }
    this.tweens.add({
      targets: record.image,
      alpha: 1, duration: 120, ease: 'Sine.easeOut'
    });
  }

  setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      event.pairs.forEach(({ bodyA, bodyB }) => {
        // Ball vs. peg
        let ballBody = null, pegBody = null;
        if (bodyA.label === 'ball' && bodyB.label === 'peg') { ballBody = bodyA; pegBody = bodyB; }
        else if (bodyB.label === 'ball' && bodyA.label === 'peg') { ballBody = bodyB; pegBody = bodyA; }
        if (ballBody && pegBody) {
          this.onPegHit(pegBody, this.ballMap.get(ballBody.id));
        }

        // Ball vs. slot sensor
        let slotBallBody = null, slotBody = null;
        if (bodyA.label === 'ball' && bodyB.label && bodyB.label.startsWith('slot_')) {
          slotBallBody = bodyA; slotBody = bodyB;
        } else if (bodyB.label === 'ball' && bodyA.label && bodyA.label.startsWith('slot_')) {
          slotBallBody = bodyB; slotBody = bodyA;
        }
        if (slotBallBody && slotBody) {
          const ball = this.ballMap.get(slotBallBody.id);
          if (ball && ball.active) {
            this.onSlotHit(parseInt(slotBody.label.split('_')[1]), ball);
          }
        }
      });
    });
  }

  onPegHit(pegBody, ball) {
    const img = this.pegMap.get(pegBody.id);
    if (!img) return;

    // Glow stacks — each hit bumps the peg's hit level, brightening it.
    // A single tween per peg handles the decay; stacking hits cancel the
    // previous tween and start a new one from a higher peak.
    img._hits = Math.min(5, (img._hits || 0) + 1);
    const peakScale = 1 + 0.12 * img._hits;
    const peakAlpha = Math.min(1, 0.68 + 0.08 * img._hits);

    this.tweens.killTweensOf(img);
    img.setScale(peakScale);
    img.setAlpha(peakAlpha);
    this.tweens.add({
      targets: img,
      scale: 1, alpha: 0.7,
      duration: 240, delay: 140,
      ease: 'Sine.easeOut',
      onComplete: () => { img._hits = 0; }
    });

    // Particle budget — cut sparks first under ball overload
    const n = this.balls.length;
    const sparkCount = n >= this.OVERLOAD_BALLS ? 1 : n >= 15 ? 2 : 3;
    this.sparkEmitter.setPosition(img.x, img.y);
    this.sparkEmitter.explode(sparkCount);

    // Throttle peg SFX — with 20 balls hitting pegs, dozens of plays/sec
    // would crush the mix. Cap to one every ~18ms.
    const now = this.time.now;
    if (now - this._lastPegSfx > 18) {
      SFX.pegHit();
      this._lastPegSfx = now;
    }
  }

  onSlotHit(index, ball) {
    if (!ball || !ball.active) return;
    ball.active = false;

    const mult = this.multipliers[index];
    const won = Math.round(ball.bet * mult);
    const chips = this.registry.get('chips');
    this.registry.set('chips', chips + won);
    this.session.won += won;
    this.updateChipDisplay(360);
    this.updateSessionDisplay();

    // LAST display — big wins (≥2x) lock the slot for 800ms so they don't
    // flicker past unnoticed in a multi-drop stream. Small wins overwrite
    // any non-locked display freely.
    const now = Date.now();
    if (mult >= 2 || now >= this.lastDisplayLockUntil) {
      const net = won - ball.bet;
      const prefix = net >= 0 ? '+' : '';
      this.lastWinText.setText(`LAST: ${mult}x / ${prefix}${net}`);
      this.lastWinText.setColor(
        mult >= 10 ? '#ff6b35' : mult >= 5 ? '#e8c547' : mult >= 2 ? '#c9a961' : '#8b6f47'
      );
      this.tweens.killTweensOf(this.lastWinText);
      this.lastWinText.setScale(1);
      this.tweens.add({
        targets: this.lastWinText,
        scaleX: { from: 1.15, to: 1 }, scaleY: { from: 1.15, to: 1 },
        duration: 350, ease: 'Sine.easeOut'
      });
      if (mult >= 2) this.lastDisplayLockUntil = now + 800;
    }

    // Slot flash — stacking additively (concurrent hits feel brighter)
    const slotRect = this.slotRects[index];
    slotRect.setAlpha(Math.min(1, slotRect.alpha + 0.5));
    this.tweens.killTweensOf(slotRect);
    this.tweens.add({ targets: slotRect, alpha: 0, duration: 600, ease: 'Sine.easeOut' });

    // Particle burst at the slot — cut roughly in half under overload
    const slotStartX = this.BOARD_X - (this.multipliers.length - 1) * this.PEG_SPACING_X / 2;
    const slotX = slotStartX + index * this.PEG_SPACING_X;
    const overload = this.balls.length >= this.OVERLOAD_BALLS;
    const sparkCount = overload
      ? (mult >= 10 ? 9 : mult >= 5 ? 6 : 3)
      : (mult >= 10 ? 18 : mult >= 5 ? 12 : 6);
    this.sparkEmitter.setPosition(slotX, this.SLOT_Y - 10);
    this.sparkEmitter.explode(sparkCount);

    // Floating multiplier text — per-ball, so 5 simultaneous hits produce
    // 5 floating numbers that drift up and fade independently.
    const txtColor = mult >= 10 ? '#ff6b35' : mult >= 5 ? '#e8c547' : '#c9a961';
    const floatText = this.add.text(slotX, this.SLOT_Y - 15, `${mult}x`, {
      fontFamily: '"Courier New", monospace', fontSize: mult >= 5 ? '32px' : '24px',
      fontStyle: 'bold', color: txtColor,
      shadow: { offsetX: 0, offsetY: 0, color: txtColor, blur: 14, fill: true }
    }).setOrigin(0.5);
    this.tweens.add({
      targets: floatText, y: this.SLOT_Y - 80,
      alpha: { from: 1, to: 0 }, duration: 1200,
      ease: 'Sine.easeOut', onComplete: () => floatText.destroy()
    });

    // Screen shake — stacks within a capped budget so a flurry of 10x
    // hits doesn't fly the screen offscreen. The budget decays each frame.
    if (mult >= 10) this.shakeBudget = Math.min(0.025, this.shakeBudget + 0.012);
    else if (mult >= 5) this.shakeBudget = Math.min(0.025, this.shakeBudget + 0.006);
    if (this.shakeBudget > 0.001) this.cameras.main.shake(220, this.shakeBudget);

    SFX.slotHit(mult);

    // Freeze in place, then clean up after the player sees the result.
    if (ball.image) ball.image.setStatic(true);
    this.time.delayedCall(1200, () => this.destroyBall(ball));
  }

  destroyBall(ball) {
    if (!ball) return;
    this.ballMap.delete(ball.id);
    const idx = this.balls.indexOf(ball);
    if (idx >= 0) this.balls.splice(idx, 1);
    if (ball.image) {
      ball.image.destroy();
      ball.image = null;
    }
    // Board cleared — unlock DROP, MULTI-DROP, and the board selector.
    if (this.balls.length === 0) {
      this.styleDropButton();
      this.styleMultiButtons();
      this.styleBoardButtons && this.styleBoardButtons();
    }
  }

  update() {
    // Trail particles — emit at each live ball's position sparsely. Under
    // overload we cut trails entirely; physics integrity matters more.
    const n = this.balls.length;
    const overload = n >= this.OVERLOAD_BALLS;
    if (!overload && this.trailEmitter) {
      const emitChance = Math.max(0.08, 0.4 - n * 0.012);
      for (const ball of this.balls) {
        if (ball.active && ball.image && ball.image.body && Math.random() < emitChance) {
          this.trailEmitter.emitParticle(1, ball.image.x, ball.image.y);
        }
      }
    }

    // Shake budget decay — so the shake subsides once hits stop coming
    if (this.shakeBudget > 0) {
      this.shakeBudget *= 0.9;
      if (this.shakeBudget < 0.001) this.shakeBudget = 0;
    }

    // Safety: any ball that escaped the board — refund and clean up
    for (let i = this.balls.length - 1; i >= 0; i--) {
      const ball = this.balls[i];
      if (ball.active && ball.image && ball.image.y > 720) {
        ball.active = false;
        this.registry.set('chips', this.registry.get('chips') + ball.bet);
        this.session.wagered -= ball.bet;
        this.updateChipDisplay(180);
        this.updateSessionDisplay();
        this.destroyBall(ball);
      }
    }
  }

  getSlotColor(mult) {
    if (mult >= 10) return 0xff6b35;
    if (mult >= 5) return 0xe8c547;
    if (mult >= 2) return 0xc9a961;
    if (mult >= 1) return 0x8b6f47;
    if (mult >= 0.5) return 0x6a5030;
    return 0x2a1810;
  }

  getSlotTextColor(mult) {
    if (mult >= 10) return '#ff6b35';
    if (mult >= 5) return '#e8c547';
    if (mult >= 2) return '#c9a961';
    if (mult >= 1) return '#8b6f47';
    return '#6a5030';
  }
}
