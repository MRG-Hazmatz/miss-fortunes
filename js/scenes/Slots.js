import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import {
  SYMBOL_SIZE,
  SYMBOL_POOL,
  buildSymbolTextures,
  pickSymbol,
  symbolById
} from '../slots/symbols.js';

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
    // Lever stem + ornate knob on the right outer cabinet face
    const lx = 1145, lyKnob = 240, stemH = 200;
    const g = this.add.graphics();
    // Stem
    g.fillStyle(0x4a3320, 1);
    g.fillRect(lx - 3, lyKnob, 6, stemH);
    g.lineStyle(1, 0x2a1810, 0.8);
    g.strokeRect(lx - 3, lyKnob, 6, stemH);
    // Knob
    g.fillStyle(0xc9a961, 0.95);
    g.fillCircle(lx, lyKnob, 16);
    g.lineStyle(2, 0x6a5030, 0.85);
    g.strokeCircle(lx, lyKnob, 16);
    g.fillStyle(0xffd8a0, 0.5);
    g.fillCircle(lx - 4, lyKnob - 4, 4);

    // Tiny label
    this.add.text(lx, lyKnob + stemH + 18, 'pull', {
      fontFamily: '"Courier New", monospace', fontSize: '10px',
      color: '#6a5030', letterSpacing: 2
    }).setOrigin(0.5);
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

    // Pay the bet up front. Win calc + payout will land in the next chunk;
    // for this chunk the player gets a visible spin but no winnings yet.
    this.registry.set('chips', chips - this.selectedBet);
    this.spinning = true;
    this.lastWinText.setText('');

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

    // Stagger reel stops — reel 1 first, reel 5 last with extra anticipation.
    const stopTimes = [800, 1100, 1400, 1700, 2100];
    for (let r = 0; r < this.REELS; r++) {
      this.spinReel(r, stopTimes[r]);
    }
  }

  // Run a single reel's spin animation: rapid texture swaps until stopAfterMs,
  // then lock to the predetermined target symbols and pop each cell briefly.
  spinReel(reelIdx, stopAfterMs) {
    const swapEvent = this.time.addEvent({
      delay: 60,
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
      // Last reel stopped — clear the busy flag. Win/scatter detection ships
      // in the next chunk; for now the player can spin again immediately.
      if (reelIdx === this.REELS - 1) {
        this.spinning = false;
        this.lastWinText.setColor('#6a5030');
        this.lastWinText.setText('— spin again —');
      }
    });
  }

  // ============================================================
  // HUD — chips + marrow top-right (mirrors other scenes)
  // ============================================================
  createHUD() {
    const chips = this.registry.get('chips');
    const marrow = this.registry.get('marrow');
    this.chipText = this.add.text(1240, 24, `chips: ${chips}`, {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(1, 0);
    this.marrowText = this.add.text(1240, 44, `marrow: ${marrow}`, {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    }).setOrigin(1, 0);

    const onChip = () => {
      if (this.chipText) this.chipText.setText(`chips: ${this.registry.get('chips')}`);
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
