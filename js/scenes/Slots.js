import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import {
  SYMBOL_SIZE,
  SYMBOLS,
  SYMBOL_POOL,
  buildSymbolTextures,
  pickSymbol,
  symbolById
} from '../slots/symbols.js';
import { PAYLINES, PAYTABLE, detectWins } from '../slots/paylines.js';

// Slots.js — 5-reel video slots with the "cursed urn" bonus round.
// Full-screen brass cabinet aesthetic, dust + candle wax, dim crimson velvet.
// Chip ladder matches Plinko/Bookie/Roulette so muscle memory carries over.
//
// First pass (this commit): cabinet drawn, UI shell, placeholder reel cells.
// Spin button is wired but stubbed — mechanics ship next.

export class Slots extends Phaser.Scene {
  constructor() {
    super('Slots');

    this.BET_OPTIONS = [1, 5, 10, 25];

    // Reel window — centered horizontally in the cabinet
    this.REEL_WINDOW_X = 320;
    this.REEL_WINDOW_Y = 210;
    this.REEL_WINDOW_W = 640;
    this.REEL_WINDOW_H = 240;
    this.REELS = 5;
    this.ROWS = 3;
    this.CELL_W = this.REEL_WINDOW_W / this.REELS;   // 128
    this.CELL_H = this.REEL_WINDOW_H / this.ROWS;    // 80
  }

  create() {
    // Persistent-scene defensive resets. Every property the scene mutates
    // gets nulled/initialized here so a re-entry never reads a stale ref.
    this.selectedBet  = this.BET_OPTIONS[0];
    this.spinning     = false;
    this.betButtons   = [];
    this.chipText     = null;
    this.marrowText   = null;
    this.lastWinText  = null;
    this.spinBg       = null;
    this.spinTxt      = null;
    this._hudListeners = null;
    this.cells        = [];        // 2D array [reelIdx][rowIdx] of Image refs
    this.targetSymbols = [];       // pre-determined final symbols per spin
    this._spinTimers  = [];        // Phaser TimerEvents for cleanup
    this.leverKnob    = null;      // graphics ref for pull-animation
    this._leverRestY  = 0;
    this._paytableModal = null;
    this.displayedChips = 0;
    this._chipTween   = null;

    // Build symbol textures once per scene mount. Idempotent — skips
    // already-existing keys.
    buildSymbolTextures(this);

    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createCabinet();
    this.createReelWindow();
    this.createPaytableHint();
    this.createBetSelector();
    this.createSpinButton();
    this.createPaytableLink();
    this.createHUD();
    this.createBackButton();
  }

  // ============================================================
  // BACKGROUND — dim parlor velvet so the cabinet sits in shadow
  // ============================================================
  createBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 0, 1280, 720);

    // Subtle radial vignette focusing on the cabinet
    const vg = this.add.graphics();
    for (let i = 0; i < 6; i++) {
      vg.fillStyle(0x000000, 0.08);
      vg.fillRect(0, 0, 1280, 60 + i * 12);
      vg.fillRect(0, 720 - (60 + i * 12), 1280, 60 + i * 12);
    }
  }

  // ============================================================
  // CABINET — ornate brass frame around a crimson velvet panel
  // ============================================================
  createCabinet() {
    const g = this.add.graphics();

    // Outer cabinet body — dark walnut
    g.fillStyle(0x1a0e07, 1);
    g.fillRoundedRect(70, 105, 1140, 580, 12);

    // Brass frame outline — tarnished gold
    g.lineStyle(4, 0xa89050, 0.85);
    g.strokeRoundedRect(70, 105, 1140, 580, 12);

    // Secondary thin highlight inside the brass
    g.lineStyle(1, 0xc9a961, 0.4);
    g.strokeRoundedRect(78, 113, 1124, 564, 10);

    // Inner velvet panel — deep crimson behind reel window
    g.fillStyle(0x2a0808, 1);
    g.fillRoundedRect(100, 135, 1080, 520, 8);
    g.lineStyle(1, 0x5a3020, 0.6);
    g.strokeRoundedRect(100, 135, 1080, 520, 8);

    // Subtle velvet noise — small dark specks
    g.fillStyle(0x0a0000, 0.5);
    for (let i = 0; i < 80; i++) {
      const x = 110 + Math.random() * 1060;
      const y = 145 + Math.random() * 500;
      g.fillRect(x, y, 1, 1);
    }

    this.drawCornerScrollwork();
    this.drawCandleWax();
    this.drawLever();
    this.drawTitlePlate();
  }

  drawCornerScrollwork() {
    const g = this.add.graphics();
    // Four corner scroll motifs — concentric brass rings + diagonal flourish
    const corners = [
      { x: 130,  y: 165, flip: 1 },
      { x: 1150, y: 165, flip: -1 },
      { x: 130,  y: 625, flip: 1 },
      { x: 1150, y: 625, flip: -1 }
    ];
    for (const c of corners) {
      g.lineStyle(2, 0xc9a961, 0.75);
      g.strokeCircle(c.x, c.y, 18);
      g.lineStyle(1, 0xa89050, 0.55);
      g.strokeCircle(c.x, c.y, 11);
      g.fillStyle(0xc9a961, 0.6);
      g.fillCircle(c.x, c.y, 3);
      // Diagonal flourish toward the cabinet interior
      g.lineStyle(1, 0xc9a961, 0.45);
      g.lineBetween(c.x + c.flip * 18, c.y, c.x + c.flip * 36, c.y);
    }
  }

  drawCandleWax() {
    const g = this.add.graphics();
    // Wax drips on inner left/right edges — uneven lengths for handmade feel
    const drips = [
      { x: 122,  top: 200, len: 70 },
      { x: 122,  top: 360, len: 120 },
      { x: 122,  top: 540, len: 55 },
      { x: 1158, top: 220, len: 60 },
      { x: 1158, top: 400, len: 95 },
      { x: 1158, top: 575, len: 45 }
    ];
    for (const d of drips) {
      g.fillStyle(0xc9a961, 0.35);
      g.fillRect(d.x - 2, d.top, 4, d.len);
      g.fillStyle(0xc9a961, 0.55);
      g.fillCircle(d.x, d.top + d.len, 5);
      // tiny highlight on the drip
      g.fillStyle(0xffd8a0, 0.3);
      g.fillCircle(d.x - 1, d.top + d.len - 1, 1.5);
    }
  }

  drawLever() {
    // Lever stem + ornate knob on the right outer cabinet face.
    // Knob is its own graphics object so the SPIN animation can tween it
    // downward and back without redrawing the stem.
    const lx = 1145, lyKnob = 240, stemH = 200;

    // Stem — fixed, never moves
    const stem = this.add.graphics();
    stem.fillStyle(0x4a3320, 1);
    stem.fillRect(lx - 3, lyKnob, 6, stemH);
    stem.lineStyle(1, 0x2a1810, 0.8);
    stem.strokeRect(lx - 3, lyKnob, 6, stemH);

    // Knob — drawn at origin (0, 0), positioned at (lx, lyKnob).
    // Tween this.leverKnob.y to animate the pull.
    this.leverKnob = this.add.graphics();
    this.leverKnob.setPosition(lx, lyKnob);
    this.leverKnob.fillStyle(0xc9a961, 0.95);
    this.leverKnob.fillCircle(0, 0, 16);
    this.leverKnob.lineStyle(2, 0x6a5030, 0.85);
    this.leverKnob.strokeCircle(0, 0, 16);
    this.leverKnob.fillStyle(0xffd8a0, 0.5);
    this.leverKnob.fillCircle(-4, -4, 4);
    this._leverRestY = lyKnob;

    // Tiny label
    this.add.text(lx, lyKnob + stemH + 18, 'pull', {
      fontFamily: '"Courier New", monospace', fontSize: '10px',
      color: '#6a5030', letterSpacing: 2
    }).setOrigin(0.5);
  }

  // Yank the lever knob downward then back — synced with the SPIN start.
  animateLeverPull() {
    if (!this.leverKnob) return;
    this.tweens.killTweensOf(this.leverKnob);
    this.tweens.add({
      targets: this.leverKnob,
      y: this._leverRestY + 55,
      duration: 180,
      yoyo: true,
      ease: 'Sine.easeOut'
    });
  }

  drawTitlePlate() {
    // Brass nameplate above the reel window
    const x = 640, y = 175;
    const w = 320, h = 36;
    const g = this.add.graphics();
    g.fillStyle(0x3d2817, 0.95);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    g.lineStyle(1, 0xc9a961, 0.85);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 4);
    this.add.text(x, y, "MISS FORTUNE'S SLOTS", {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 5
    }).setOrigin(0.5);
  }

  // ============================================================
  // REEL WINDOW — black inner pocket + 5×3 grid of symbol cells
  // ============================================================
  createReelWindow() {
    const g = this.add.graphics();

    // Window background — black inner pocket with a glowing brass border
    g.fillStyle(0x000000, 0.92);
    g.fillRect(this.REEL_WINDOW_X, this.REEL_WINDOW_Y, this.REEL_WINDOW_W, this.REEL_WINDOW_H);
    g.lineStyle(3, 0xc9a961, 0.9);
    g.strokeRect(this.REEL_WINDOW_X, this.REEL_WINDOW_Y, this.REEL_WINDOW_W, this.REEL_WINDOW_H);
    g.lineStyle(1, 0x6a5030, 0.6);
    g.strokeRect(this.REEL_WINDOW_X - 4, this.REEL_WINDOW_Y - 4, this.REEL_WINDOW_W + 8, this.REEL_WINDOW_H + 8);

    // Vertical reel dividers — faint brass lines
    g.lineStyle(1, 0xa89050, 0.4);
    for (let r = 1; r < this.REELS; r++) {
      const x = this.REEL_WINDOW_X + r * this.CELL_W;
      g.lineBetween(x, this.REEL_WINDOW_Y, x, this.REEL_WINDOW_Y + this.REEL_WINDOW_H);
    }

    // 5×3 grid of symbol images. Initialized with random symbols so the idle
    // reel isn't empty. Stored in this.cells[reelIdx][rowIdx] so spin code
    // can swap textures during the spin and lock them on stop.
    for (let r = 0; r < this.REELS; r++) {
      const reelCells = [];
      for (let row = 0; row < this.ROWS; row++) {
        const cx = this.REEL_WINDOW_X + r * this.CELL_W + this.CELL_W / 2;
        const cy = this.REEL_WINDOW_Y + row * this.CELL_H + this.CELL_H / 2;
        const sym = pickSymbol();
        const img = this.add.image(cx, cy, `symbol_${sym.id}`);
        reelCells.push(img);
      }
      this.cells.push(reelCells);
    }
  }

  createPaytableHint() {
    // Small italic line below reels — the spec, just hinted
    const y = this.REEL_WINDOW_Y + this.REEL_WINDOW_H + 28;
    this.add.text(640, y, 'three or more witch’s marks summon the urns', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      fontStyle: 'italic', color: '#6a5030', letterSpacing: 1
    }).setOrigin(0.5);
    this.lastWinText = this.add.text(640, y + 22, '', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      color: '#c9a961', letterSpacing: 1
    }).setOrigin(0.5);
  }

  // ============================================================
  // BET SELECTOR — 1/5/10/25, mirror Plinko/Bookie pattern
  // ============================================================
  createBetSelector() {
    const baseX = 180;
    const y = 565;
    this.add.text(baseX - 20, y - 36, 'BET', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0, 0.5);

    this.BET_OPTIONS.forEach((bet, i) => {
      const x = baseX + i * 62;
      const btn = this.add.container(x, y);
      const bg = this.add.graphics();
      const txt = this.add.text(0, 0, bet, {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(0.5);
      btn.add([bg, txt]);
      const hit = this.add.zone(0, 0, 50, 44).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.add(hit);
      hit.on('pointerdown', () => this.selectBet(bet));
      this.betButtons.push({ bet, bg, txt });
    });
    this.styleBetButtons();
  }

  selectBet(bet) {
    if (this.spinning) return;
    if (this.registry.get('chips') < bet) return;
    this.selectedBet = bet;
    this.styleBetButtons();
  }

  styleBetButtons() {
    for (const b of this.betButtons) {
      const isActive = b.bet === this.selectedBet;
      b.bg.clear();
      b.bg.fillStyle(isActive ? 0x3d2817 : 0x1a0d08, 0.95);
      b.bg.fillRoundedRect(-25, -22, 50, 44, 5);
      b.bg.lineStyle(isActive ? 2 : 1, isActive ? 0xc9a961 : 0xa89050, isActive ? 1 : 0.7);
      b.bg.strokeRoundedRect(-25, -22, 50, 44, 5);
      b.txt.setColor(isActive ? '#ffd8a0' : '#c9a961');
    }
  }

  // ============================================================
  // SPIN BUTTON — bottom right, big and amber
  // ============================================================
  createSpinButton() {
    const x = 1010, y = 565;
    const w = 180, h = 56;
    const btn = this.add.container(x, y);

    this.spinBg = this.add.graphics();
    this.spinTxt = this.add.text(0, 0, 'SPIN', {
      fontFamily: '"Courier New", monospace', fontSize: '22px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 5
    }).setOrigin(0.5);
    btn.add([this.spinBg, this.spinTxt]);

    this.drawSpinButton(false);

    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.add(hit);
    hit.on('pointerover', () => this.drawSpinButton(true));
    hit.on('pointerout',  () => this.drawSpinButton(false));
    hit.on('pointerdown', () => this.onSpin());
  }

  drawSpinButton(hovered) {
    const w = 180, h = 56;
    this.spinBg.clear();
    this.spinBg.fillStyle(hovered ? 0x3d2817 : 0x2a1810, 1);
    this.spinBg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    this.spinBg.lineStyle(2, hovered ? 0xffd8a0 : 0xc9a961, hovered ? 1 : 0.85);
    this.spinBg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    this.spinTxt.setColor(hovered ? '#ffd8a0' : '#c9a961');
  }

  onSpin() {
    if (this.spinning) return;
    const chips = this.registry.get('chips');
    if (chips < this.selectedBet) {
      this.lastWinText.setColor('#8b2020');
      this.lastWinText.setText('not enough chips');
      return;
    }

    // Pay the bet up front.
    this.registry.set('chips', chips - this.selectedBet);
    this.spinning = true;
    this.lastWinText.setText('');

    // Mechanical feel: yank the lever + crank up the lever-pull SFX in sync
    this.animateLeverPull();
    if (SFX.leverPull) SFX.leverPull();

    // Pre-determine the final 5×3 grid. Each call uses weighted random from
    // SYMBOL_POOL — wins / scatter detection will read these once all reels
    // have stopped.
    this.targetSymbols = [];
    for (let r = 0; r < this.REELS; r++) {
      const reel = [];
      for (let row = 0; row < this.ROWS; row++) {
        reel.push(pickSymbol().id);
      }
      this.targetSymbols.push(reel);
    }

    // If reels 1-4 already form a 4-of-a-kind on any payline, reel 5 enters
    // anticipation: slower symbol churn + delayed stop. Builds tension.
    const anticipating = this.shouldAnticipate(this.targetSymbols);
    const stopTimes = anticipating
      ? [800, 1100, 1400, 1700, 2900]   // reel 5 +800ms suspense
      : [800, 1100, 1400, 1700, 2100];

    for (let r = 0; r < this.REELS; r++) {
      const slow = anticipating && r === this.REELS - 1;
      this.spinReel(r, stopTimes[r], slow);
    }
  }

  // Check whether reels 1-4 of the predetermined grid form a 4-of-a-kind on
  // any payline (with wild substitution). If so, reel 5 will anticipate —
  // a single matching symbol there pays the 5-of-a-kind multiplier.
  shouldAnticipate(grid) {
    for (const payline of PAYLINES) {
      const cells = [
        grid[0][payline.rows[0]],
        grid[1][payline.rows[1]],
        grid[2][payline.rows[2]],
        grid[3][payline.rows[3]]
      ];
      // Scatter starts can't form a payline win — skip
      if (cells[0] === SYMBOLS.WITCHMARK) continue;
      // Find the primary (first non-wild)
      let primary = cells[0];
      if (primary === SYMBOLS.TAROT) {
        for (let i = 1; i < cells.length; i++) {
          if (cells[i] !== SYMBOLS.TAROT && cells[i] !== SYMBOLS.WITCHMARK) {
            primary = cells[i]; break;
          }
        }
      }
      // Count consecutive matches with wild substitution
      let count = 0;
      for (let i = 0; i < cells.length; i++) {
        if (cells[i] === primary) count++;
        else if (cells[i] === SYMBOLS.TAROT && primary !== SYMBOLS.TAROT) count++;
        else break;
      }
      if (count === 4) return true;
    }
    return false;
  }

  // Run a single reel's spin animation: rapid texture swaps until stopAfterMs,
  // then lock to the predetermined target symbols and pop each cell briefly.
  // slowSwap = true on reel 5 only when an anticipation is in progress.
  spinReel(reelIdx, stopAfterMs, slowSwap = false) {
    const swapEvent = this.time.addEvent({
      delay: slowSwap ? 150 : 60,
      loop: true,
      callback: () => {
        for (let row = 0; row < this.ROWS; row++) {
          const sym = pickSymbol();
          this.cells[reelIdx][row].setTexture(`symbol_${sym.id}`);
        }
      }
    });
    this._spinTimers.push(swapEvent);

    this.time.delayedCall(stopAfterMs, () => {
      swapEvent.remove();
      // Lock the final symbols + pop animation per cell
      for (let row = 0; row < this.ROWS; row++) {
        const symId = this.targetSymbols[reelIdx][row];
        const cell = this.cells[reelIdx][row];
        cell.setTexture(`symbol_${symId}`);
        this.tweens.add({
          targets: cell,
          scaleX: 1.15, scaleY: 1.15,
          yoyo: true,
          duration: 110,
          ease: 'Sine.easeOut'
        });
      }
      // Reel-stop clack — escalating weight per reel index (5th hits hardest)
      if (SFX.reelStop) SFX.reelStop(reelIdx);

      // Last reel stopped — hand off to win/scatter resolution
      if (reelIdx === this.REELS - 1) {
        this.resolveSpin();
      }
    });
  }

  // ============================================================
  // SPIN RESOLUTION — wins, paylines, scatter bonus
  // ============================================================
  resolveSpin() {
    const { wins, scatterCount } = detectWins(this.targetSymbols);

    // Sum chip return from winning paylines
    let totalReturn = 0;
    for (const w of wins) {
      totalReturn += this.selectedBet * w.multiplier;
    }

    if (totalReturn > 0) {
      const chips = this.registry.get('chips');
      this.registry.set('chips', chips + totalReturn);
      this.lastWinText.setColor('#e8c547');
      this.lastWinText.setText(`+${totalReturn} chips`);
      // Effective multiplier on the bet drives the chime tier
      const tier = Math.min(10, totalReturn / this.selectedBet);
      if (SFX.slotWinTier) SFX.slotWinTier(tier);
      this.highlightWins(wins);
      this.spawnFloatingWin(totalReturn, tier);
    } else if (scatterCount < 3) {
      this.lastWinText.setColor('#6a5030');
      this.lastWinText.setText('— spin again —');
    }

    // Scatter bonus — 3+ witch's marks anywhere on the grid → urns
    if (scatterCount >= 3) {
      // Delay so paying lines animate first (longer if there were wins)
      this.time.delayedCall(totalReturn > 0 ? 1500 : 500, () => this.showBonusRound(scatterCount));
    } else {
      this.spinning = false;
    }
  }

  // +N chips text that rises from the reel window and fades. Big tier = bigger.
  spawnFloatingWin(amount, tier) {
    const cx = this.REEL_WINDOW_X + this.REEL_WINDOW_W / 2;
    const cy = this.REEL_WINDOW_Y + this.REEL_WINDOW_H / 2;
    const size = tier >= 10 ? '38px' : tier >= 5 ? '32px' : tier >= 2 ? '26px' : '22px';
    const color = tier >= 10 ? '#ff6b35' : tier >= 5 ? '#e8c547' : '#c9a961';
    const txt = this.add.text(cx, cy, `+${amount}`, {
      fontFamily: '"Courier New", monospace', fontSize: size,
      fontStyle: 'bold', color, letterSpacing: 2,
      shadow: { offsetX: 0, offsetY: 0, color, blur: 14, fill: true }
    }).setOrigin(0.5).setDepth(50).setAlpha(0);
    this.tweens.add({
      targets: txt,
      alpha: 1, y: cy - 30,
      duration: 280, ease: 'Sine.easeOut'
    });
    this.tweens.add({
      targets: txt,
      alpha: 0, y: cy - 110,
      duration: 700, delay: 700,
      ease: 'Sine.easeIn',
      onComplete: () => txt.destroy()
    });
  }

  // Draw a glowing line connecting the winning cells + pulse each one.
  highlightWins(wins) {
    for (const w of wins) {
      const payline = PAYLINES[w.paylineIdx];
      const points = [];
      for (let r = 0; r < w.count; r++) {
        const row = payline.rows[r];
        const cx = this.REEL_WINDOW_X + r * this.CELL_W + this.CELL_W / 2;
        const cy = this.REEL_WINDOW_Y + row * this.CELL_H + this.CELL_H / 2;
        points.push({ x: cx, y: cy });

        // Pulse the winning cell
        const cell = this.cells[r][row];
        this.tweens.add({
          targets: cell,
          scaleX: 1.25, scaleY: 1.25,
          yoyo: true, duration: 220, repeat: 2,
          ease: 'Sine.easeInOut'
        });
      }

      // Connecting amber line with glow circles at each node
      const g = this.add.graphics();
      g.lineStyle(3, 0xe8c547, 0.9);
      for (let i = 0; i < points.length - 1; i++) {
        g.lineBetween(points[i].x, points[i].y, points[i + 1].x, points[i + 1].y);
      }
      g.fillStyle(0xe8c547, 0.45);
      for (const pt of points) g.fillCircle(pt.x, pt.y, 9);

      // Fade the highlight out after a beat
      this.tweens.add({
        targets: g,
        alpha: 0,
        delay: 1500,
        duration: 600,
        ease: 'Sine.easeOut',
        onComplete: () => g.destroy()
      });
    }
  }

  // ============================================================
  // BONUS ROUND — the cursed urns. 3+ scatters → modal overlay.
  // ============================================================
  showBonusRound(scatterCount) {
    // Pre-roll the 5 urn outcomes for this trigger:
    //   1 jackpot (10 marrow), 1 cursed (0), 3 small (1–3 marrow each)
    const outcomes = [
      { type: 'jackpot', marrow: 10 },
      { type: 'cursed',  marrow: 0 },
      { type: 'small',   marrow: 1 + Math.floor(Math.random() * 3) },
      { type: 'small',   marrow: 1 + Math.floor(Math.random() * 3) },
      { type: 'small',   marrow: 1 + Math.floor(Math.random() * 3) }
    ];
    // Fisher–Yates so the jackpot/cursed positions are random
    for (let i = outcomes.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [outcomes[i], outcomes[j]] = [outcomes[j], outcomes[i]];
    }

    const modal = this.add.container(0, 0);
    modal.setDepth(1000);

    // Dim background — full-screen veil
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.88);
    dim.fillRect(0, 0, 1280, 720);
    modal.add(dim);

    // Title — hot accent (the only place the parlor uses bright orange)
    const title = this.add.text(640, 130, 'THE URNS', {
      fontFamily: '"Courier New", monospace', fontSize: '38px',
      fontStyle: 'bold', color: '#ff6b35', letterSpacing: 10,
      shadow: { offsetX: 0, offsetY: 0, color: '#ff6b35', blur: 16, fill: true }
    }).setOrigin(0.5);
    modal.add(title);

    // Subtitle / instruction
    const sub = this.add.text(640, 200,
      `${scatterCount} witch's marks. the madame stirs.\nchoose one. she keeps the rest.`,
      {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        color: '#c9a961', align: 'center', lineSpacing: 8
      }
    ).setOrigin(0.5);
    modal.add(sub);

    // Scatter chord — diminished-triad sting + rumble
    if (SFX.scatterAwaken) SFX.scatterAwaken();

    // 5 urns in a row at y=410, centered, 200px apart
    const spacing = 200;
    const urnY = 410;
    const urnX0 = 640 - (5 - 1) * spacing / 2;
    const urnContainers = [];
    let picked = false;

    for (let i = 0; i < 5; i++) {
      const ux = urnX0 + i * spacing;
      const uc = this.add.container(ux, urnY);

      const urnG = this.add.graphics();
      this.drawUrn(urnG, 0, 0, 0x2a1810);
      uc.add(urnG);

      const hit = this.add.zone(0, 0, 110, 140).setOrigin(0.5).setInteractive({ useHandCursor: true });
      uc.add(hit);

      hit.on('pointerover', () => {
        if (picked) return;
        this.tweens.add({ targets: uc, y: urnY - 12, duration: 150, ease: 'Sine.easeOut' });
      });
      hit.on('pointerout', () => {
        if (picked) return;
        this.tweens.add({ targets: uc, y: urnY, duration: 150, ease: 'Sine.easeOut' });
      });
      hit.on('pointerdown', () => {
        if (picked) return;
        picked = true;
        this.revealUrns(urnContainers, outcomes, i, modal);
      });

      modal.add(uc);
      urnContainers.push({ container: uc, graphic: urnG, index: i });
    }
  }

  // Draw an urn silhouette at (cx, cy). Centered on its widest point.
  drawUrn(g, cx, cy, color) {
    // Body — bulbous bottom
    g.fillStyle(color, 1);
    g.fillEllipse(cx, cy + 16, 56, 64);
    // Neck
    g.fillRect(cx - 14, cy - 14, 28, 32);
    // Rim
    g.fillEllipse(cx, cy - 16, 34, 10);
    // Outlines
    g.lineStyle(2, 0x6a5030, 0.9);
    g.strokeEllipse(cx, cy + 16, 56, 64);
    g.strokeRect(cx - 14, cy - 14, 28, 32);
    g.strokeEllipse(cx, cy - 16, 34, 10);
    // Mouth shadow (depth in the opening)
    g.fillStyle(0x000000, 0.6);
    g.fillEllipse(cx, cy - 15, 26, 6);
    // Brass ornamental band
    g.fillStyle(0xc9a961, 0.55);
    g.fillRect(cx - 24, cy + 6, 48, 3);
    // Faint sigil scratch — tiny crescent
    g.lineStyle(1, 0xc9a961, 0.35);
    g.beginPath();
    g.arc(cx, cy + 22, 10, 0.4, Math.PI - 0.4);
    g.strokePath();
  }

  // Reveal all urns: selected pops bright with payout, others dim down.
  revealUrns(urnContainers, outcomes, selectedIdx, modal) {
    const selected = outcomes[selectedIdx];

    // Award marrow before any animation so HUD updates immediately
    if (selected.marrow > 0) {
      const m = this.registry.get('marrow');
      this.registry.set('marrow', m + selected.marrow);
    }

    // Outcome-specific sting — bespoke urn SFX
    if (SFX.urnReveal) SFX.urnReveal(selected.type);

    urnContainers.forEach((uc, i) => {
      const outcome = outcomes[i];
      const isSelected = i === selectedIdx;

      if (isSelected) {
        // Selected: scale up + recolor the urn glyph to a warmer hue
        this.tweens.add({
          targets: uc.container,
          scaleX: 1.3, scaleY: 1.3,
          duration: 320, ease: 'Back.easeOut'
        });
      } else {
        this.tweens.add({ targets: uc.container, alpha: 0.45, duration: 320 });
      }

      // Label floating above the urn
      const labelColor = outcome.type === 'jackpot' ? '#ff6b35' :
                         outcome.type === 'cursed'  ? '#5a4030' : '#c9a961';
      const labelText  = outcome.type === 'cursed' ? '—' : `+${outcome.marrow}`;
      const label = this.add.text(uc.container.x, uc.container.y - 95, labelText, {
        fontFamily: '"Courier New", monospace',
        fontSize: isSelected ? '34px' : '20px',
        fontStyle: 'bold',
        color: labelColor
      }).setOrigin(0.5).setAlpha(0).setDepth(1001);
      modal.add(label);
      this.tweens.add({
        targets: label,
        alpha: 1, y: label.y - 12,
        duration: 600, ease: 'Sine.easeOut'
      });
    });

    // After the reveal settles, fade everything out and return to reels
    this.time.delayedCall(2200, () => {
      const prompt = this.add.text(640, 630, '[ click to continue ]', {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        color: '#8b6f47', letterSpacing: 2
      }).setOrigin(0.5).setAlpha(0).setDepth(1001);
      modal.add(prompt);
      this.tweens.add({
        targets: prompt, alpha: 0.85, yoyo: true, repeat: -1,
        duration: 1200, ease: 'Sine.easeInOut'
      });

      // Full-screen invisible dismiss zone (above the urns)
      const dismiss = this.add.zone(640, 360, 1280, 720).setOrigin(0.5)
        .setInteractive({ useHandCursor: false }).setDepth(1002);
      modal.add(dismiss);
      dismiss.once('pointerdown', () => {
        this.tweens.add({
          targets: modal, alpha: 0, duration: 500,
          onComplete: () => {
            modal.destroy();
            this.spinning = false;
            this.lastWinText.setColor('#ff6b35');
            this.lastWinText.setText(
              selected.marrow > 0
                ? `+${selected.marrow} marrow`
                : 'cursed. she keeps yours.'
            );
          }
        });
      });
    });
  }

  // ============================================================
  // PAYTABLE LINK — small "what pays?" under the spin button.
  // Opens a modal showing each symbol tier and its 3/4/5-of-a-kind payouts.
  // ============================================================
  createPaytableLink() {
    const link = this.add.text(1010, 612, 'what pays?', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#6a5030', letterSpacing: 1
    }).setOrigin(0.5);
    link.setInteractive({ useHandCursor: true });
    link.on('pointerover', () => link.setColor('#c9a961'));
    link.on('pointerout',  () => link.setColor('#6a5030'));
    link.on('pointerdown', () => this.showPaytableModal());
  }

  showPaytableModal() {
    if (this._paytableModal) return;

    const modal = this.add.container(0, 0).setDepth(1500);

    // Dim background
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.88);
    dim.fillRect(0, 0, 1280, 720);
    modal.add(dim);

    // Title
    modal.add(this.add.text(640, 70, 'PAYTABLE', {
      fontFamily: '"Courier New", monospace', fontSize: '32px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 10,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 14, fill: true }
    }).setOrigin(0.5));

    modal.add(this.add.text(640, 110, '— five reels, nine paylines —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5));

    // Column headers
    const colX = { sym: 290, c3: 600, c4: 760, c5: 920, desc: 1080 };
    const headerY = 165;
    const headerStyle = { fontFamily: '"Courier New", monospace', fontSize: '13px', color: '#8b6f47', letterSpacing: 2 };
    modal.add(this.add.text(colX.sym, headerY, 'symbols',  headerStyle).setOrigin(0.5));
    modal.add(this.add.text(colX.c3,  headerY, '3-OF',     headerStyle).setOrigin(0.5));
    modal.add(this.add.text(colX.c4,  headerY, '4-OF',     headerStyle).setOrigin(0.5));
    modal.add(this.add.text(colX.c5,  headerY, '5-OF',     headerStyle).setOrigin(0.5));

    // Group symbols by tier
    const commons = SYMBOL_POOL.filter(s => s.tier === 'common');
    const mids    = SYMBOL_POOL.filter(s => s.tier === 'mid');
    const wild    = SYMBOL_POOL.find(s => s.tier === 'wild');
    const scatter = SYMBOL_POOL.find(s => s.tier === 'scatter');

    const rowY = [225, 320, 415, 520];
    const rowColor = '#c9a961';

    // Row 1: commons (5 icons in a strip)
    this.drawPaytableRow(modal, rowY[0], commons, PAYTABLE.common, colX, rowColor, null);

    // Row 2: mids (3 icons)
    this.drawPaytableRow(modal, rowY[1], mids, PAYTABLE.mid, colX, rowColor, null);

    // Row 3: wild (tarot) — note about substitution + double
    this.drawPaytableRow(modal, rowY[2], [wild], PAYTABLE.wild, colX, '#a76de0',
      'substitutes for any non-scatter symbol on a payline\nand doubles that line\'s winnings');

    // Row 4: scatter (witch's mark) — no payline pay, triggers bonus
    this.drawScatterRow(modal, rowY[3], scatter, colX);

    // Footer
    modal.add(this.add.text(640, 620, 'bets stake the total wager. wins return bet × multiplier per winning line, summed.', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'italic', color: '#6a5030', letterSpacing: 1
    }).setOrigin(0.5));

    // Close button
    const close = this.add.text(640, 670, '[ close ]', {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      color: '#a89050', letterSpacing: 3
    }).setOrigin(0.5);
    close.setInteractive({ useHandCursor: true });
    close.on('pointerover', () => close.setColor('#ffd8a0'));
    close.on('pointerout',  () => close.setColor('#a89050'));
    modal.add(close);

    // Full-screen invisible dismiss zone (catches outside-modal clicks too)
    const dismiss = this.add.zone(640, 360, 1280, 720).setOrigin(0.5)
      .setInteractive({ useHandCursor: false }).setDepth(1499);
    modal.add(dismiss);

    const closeModal = () => {
      this.tweens.add({
        targets: modal, alpha: 0, duration: 280,
        onComplete: () => { modal.destroy(); this._paytableModal = null; }
      });
    };
    close.on('pointerdown', closeModal);
    dismiss.on('pointerdown', closeModal);

    this._paytableModal = modal;
  }

  drawPaytableRow(modal, y, symbols, payouts, colX, color, note) {
    // Symbol icons stacked horizontally at colX.sym, each at SYMBOL_SIZE/1.4 scale
    const iconScale = 0.55;
    const iconStep = 50;
    const totalW = (symbols.length - 1) * iconStep;
    const startX = colX.sym - totalW / 2;
    for (let i = 0; i < symbols.length; i++) {
      const img = this.add.image(startX + i * iconStep, y, `symbol_${symbols[i].id}`)
        .setScale(iconScale).setDepth(1501);
      modal.add(img);
    }
    const mulStyle = { fontFamily: '"Courier New", monospace', fontSize: '20px', fontStyle: 'bold', color, letterSpacing: 1 };
    modal.add(this.add.text(colX.c3, y, `${payouts[3]}×`, mulStyle).setOrigin(0.5));
    modal.add(this.add.text(colX.c4, y, `${payouts[4]}×`, mulStyle).setOrigin(0.5));
    modal.add(this.add.text(colX.c5, y, `${payouts[5]}×`, mulStyle).setOrigin(0.5));
    if (note) {
      modal.add(this.add.text(colX.desc, y, note, {
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        fontStyle: 'italic', color: '#8b6f47', align: 'center', lineSpacing: 4,
        wordWrap: { width: 220 }
      }).setOrigin(0.5));
    }
  }

  drawScatterRow(modal, y, scatter, colX) {
    const img = this.add.image(colX.sym, y, `symbol_${scatter.id}`)
      .setScale(0.7).setDepth(1501);
    modal.add(img);
    modal.add(this.add.text((colX.c3 + colX.c5) / 2, y - 12, '3+ scatters anywhere', {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'bold', color: '#ff6b35', letterSpacing: 2
    }).setOrigin(0.5));
    modal.add(this.add.text((colX.c3 + colX.c5) / 2, y + 12, 'summons the urns — pick one for marrow', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'italic', color: '#c9a961', letterSpacing: 1
    }).setOrigin(0.5));
  }

  // ============================================================
  // HUD — chips + marrow top-right. Chip text animates UP on wins
  // and snaps DOWN instantly on bets (so the count-up doesn't lie).
  // ============================================================
  createHUD() {
    const chips = this.registry.get('chips');
    const marrow = this.registry.get('marrow');
    this.displayedChips = chips;
    this._chipTween = null;
    this.chipText = this.add.text(1240, 24, `chips: ${chips}`, {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(1, 0);
    this.marrowText = this.add.text(1240, 44, `marrow: ${marrow}`, {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    }).setOrigin(1, 0);

    const onChip = () => {
      if (!this.chipText) return;
      const actual = this.registry.get('chips');
      // Bets (chips decreased) snap; wins (chips increased) tween up
      if (actual < this.displayedChips) {
        if (this._chipTween) { this._chipTween.stop(); this._chipTween = null; }
        this.displayedChips = actual;
        this.chipText.setText(`chips: ${actual}`);
      } else if (actual > this.displayedChips) {
        if (this._chipTween) { this._chipTween.stop(); this._chipTween = null; }
        const startVal = this.displayedChips;
        this._chipTween = this.tweens.addCounter({
          from: startVal, to: actual,
          duration: 600,
          ease: 'Sine.easeOut',
          onUpdate: tween => {
            const v = Math.round(tween.getValue());
            this.displayedChips = v;
            if (this.chipText) this.chipText.setText(`chips: ${v}`);
          },
          onComplete: () => {
            this.displayedChips = actual;
            if (this.chipText) this.chipText.setText(`chips: ${actual}`);
            this._chipTween = null;
          }
        });
      }
    };
    const onMarrow = () => {
      if (this.marrowText) this.marrowText.setText(`marrow: ${this.registry.get('marrow')}`);
    };
    this.registry.events.on('changedata-chips', onChip);
    this.registry.events.on('changedata-marrow', onMarrow);
    this._hudListeners = { onChip, onMarrow };

    // Critical: deregister registry listeners on shutdown. Without this, an
    // exited-then-reentered scene throws on changedata (the inherited
    // black-screen-on-second-entry pattern).
    this.events.once('shutdown', () => {
      if (this._hudListeners) {
        this.registry.events.off('changedata-chips',  this._hudListeners.onChip);
        this.registry.events.off('changedata-marrow', this._hudListeners.onMarrow);
        this._hudListeners = null;
      }
      if (this._chipTween) { this._chipTween.stop(); this._chipTween = null; }
    });
  }

  // ============================================================
  // BACK TO PARLOR — top-left, same pattern as Bookie/Roulette
  // ============================================================
  createBackButton() {
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.spinning) return;
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });
  }
}
