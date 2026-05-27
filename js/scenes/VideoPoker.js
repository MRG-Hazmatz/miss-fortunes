import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import { Card, Deck } from '../cards.js';
import { evalPokerHand, HAND_TIERS } from '../poker/handRank.js';

// VideoPoker.js — Jacks-or-Better, single-player against the machine.
// Bet → DEAL 5 cards → toggle HOLD on any → DRAW replaces non-held → evaluate.
// The paytable strip up top glows on the row that matches the current hand.

const BET_OPTIONS = [1, 5, 10, 25];
const CARD_X       = [428, 534, 640, 746, 852];   // 5 slots, 66+40 apart, centered on 640
const CARD_Y       = 405;
const HELD_LIFT    = 20;                          // how far a held card lifts
const DECK_X       = 1080;                        // virtual deck position (off to the right)
const DECK_Y       = 200;

export class VideoPoker extends Phaser.Scene {
  constructor() {
    super('VideoPoker');
  }

  create() {
    // Persistent-scene defensive resets — everything the scene mutates.
    this.state = 'BETTING';
    this.deck = Deck.shuffle(Deck.build());
    this.hand = [];
    this.handData = [];
    this.held = [false, false, false, false, false];
    this.selectedBet = BET_OPTIONS[0];
    this.currentBet = 0;          // locked once DEAL fires
    this.lastTier = null;
    this.betButtons = [];
    this.heldLabels = [];         // text refs above each card
    this.cardHits = [];           // hit zones for HOLD toggle
    this.actionBtn = null;
    this.paytableCells = [];      // one per HAND_TIERS entry (minus no_win)
    this.handTierText = null;
    this.resultText = null;
    this.lastResultText = null;
    this._hudListeners = null;

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createHeader();
    this.createPaytable();
    this.createCardSlots();
    this.createBetSelector();
    this.createActionButton();
    this.createTierLabel();
    this.createResultText();
    this.createHUD();
    this.createBackButton();
  }

  // ============================================================
  // BACKGROUND — same dim-amber smoky room as the Poker hub
  // ============================================================
  createBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 0, 1280, 720);

    // Vignette top + bottom
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.06);
      g.fillRect(0, 0, 1280, 50 + i * 10);
      g.fillRect(0, 720 - (50 + i * 10), 1280, 50 + i * 10);
    }
    // Lamp pool over the playfield
    const lamp = this.add.graphics();
    lamp.fillStyle(0xc9a961, 0.04);
    lamp.fillCircle(640, 420, 360);
    lamp.fillStyle(0xc9a961, 0.06);
    lamp.fillCircle(640, 420, 240);

    // Felt strip behind the cards
    const felt = this.add.graphics();
    felt.fillStyle(0x4a1010, 0.7);
    felt.fillRoundedRect(360, 350, 560, 130, 10);
    felt.lineStyle(2, 0xc9a961, 0.5);
    felt.strokeRoundedRect(360, 350, 560, 130, 10);

    // Dust motes
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.04);
      g.fillCircle(Math.random() * 1280, Math.random() * 720, 1 + Math.random() * 2);
    }
  }

  createHeader() {
    this.add.text(640, 48, 'VIDEO POKER', {
      fontFamily: '"Courier New", monospace', fontSize: '24px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 10, fill: true }
    }).setOrigin(0.5);
    this.add.text(640, 76, '— jacks or better —', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
  }

  // ============================================================
  // PAYTABLE — 9 cells in 2 rows. Active cell glows when the
  // current hand matches that tier.
  // ============================================================
  createPaytable() {
    // 5 cells in row 1, 4 cells in row 2 (no_win is hidden)
    const tiers = HAND_TIERS.filter(t => t.rank !== 'no_win');
    const rowY = [120, 175];
    const cellW = 200, cellH = 42;
    const margin = 8;

    const layout = [
      { count: 5, offset: 0 },   // row 1: 5 cells
      { count: 4, offset: 5 }    // row 2: 4 cells (offset by 5 to skip first row's tiers)
    ];

    for (let r = 0; r < 2; r++) {
      const row = layout[r];
      const totalW = row.count * cellW + (row.count - 1) * margin;
      const startX = 640 - totalW / 2 + cellW / 2;
      for (let i = 0; i < row.count; i++) {
        const tier = tiers[row.offset + i];
        const cx = startX + i * (cellW + margin);
        const cy = rowY[r];
        const cell = this.makePaytableCell(cx, cy, cellW, cellH, tier);
        this.paytableCells.push({ tier, ...cell });
      }
    }
  }

  makePaytableCell(cx, cy, w, h, tier) {
    const bg = this.add.graphics();
    this.drawPaytableCell(bg, cx, cy, w, h, false);
    const name = this.add.text(cx, cy - 8, tier.name, {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'bold', color: '#8b6f47', letterSpacing: 1
    }).setOrigin(0.5);
    const mult = this.add.text(cx, cy + 9, `${tier.multiplier}×`, {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 1
    }).setOrigin(0.5);
    return { bg, name, mult, w, h, cx, cy };
  }

  drawPaytableCell(g, cx, cy, w, h, active) {
    g.clear();
    g.fillStyle(active ? 0x3d2817 : 0x1a0d08, active ? 1 : 0.85);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
    g.lineStyle(active ? 2 : 1, active ? 0xe8c547 : 0x6a5030, active ? 1 : 0.6);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 5);
  }

  // Light up the cell matching `tierRank` (string like 'royal_flush'). Pass
  // null to clear all highlights.
  highlightPaytable(tierRank) {
    for (const c of this.paytableCells) {
      const active = c.tier.rank === tierRank;
      this.drawPaytableCell(c.bg, c.cx, c.cy, c.w, c.h, active);
      c.name.setColor(active ? '#ffd8a0' : '#8b6f47');
      c.mult.setColor(active ? '#e8c547' : '#c9a961');
    }
  }

  // ============================================================
  // CARD SLOTS — 5 empty slot indicators. Real Card objects
  // are dealt over them on DEAL / DRAW.
  // ============================================================
  createCardSlots() {
    // Slot outlines visible before deal
    for (let i = 0; i < 5; i++) {
      const slot = this.add.graphics();
      slot.lineStyle(1, 0x3d2817, 0.6);
      slot.strokeRoundedRect(CARD_X[i] - 33, CARD_Y - 46, 66, 92, 5);
    }

    // HELD labels live above each card slot — hidden until that card is held
    for (let i = 0; i < 5; i++) {
      const label = this.add.text(CARD_X[i], CARD_Y - 65, 'HELD', {
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        fontStyle: 'bold', color: '#e8c547', letterSpacing: 2,
        shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 6, fill: true }
      }).setOrigin(0.5).setVisible(false);
      this.heldLabels.push(label);
    }

    // Hit zones for HOLD toggle — created here, attached to cards on deal
    for (let i = 0; i < 5; i++) {
      const hit = this.add.zone(CARD_X[i], CARD_Y, 80, 110)
        .setOrigin(0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => this.toggleHold(i));
      this.cardHits.push(hit);
    }
  }

  toggleHold(idx) {
    if (this.state !== 'DEALT') return;
    if (!this.hand[idx]) return;
    this.held[idx] = !this.held[idx];
    const targetY = CARD_Y - (this.held[idx] ? HELD_LIFT : 0);
    this.tweens.add({
      targets: this.hand[idx].container,
      y: targetY,
      duration: 180,
      ease: 'Sine.easeOut'
    });
    this.heldLabels[idx].setVisible(this.held[idx]);
    if (SFX.chipPlace) SFX.chipPlace();
  }

  // ============================================================
  // BET SELECTOR + ACTION BUTTON
  // ============================================================
  createBetSelector() {
    const baseX = 220;
    const y = 600;
    this.add.text(baseX - 40, y - 30, 'BET', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0, 0.5);

    BET_OPTIONS.forEach((amt, i) => {
      const x = baseX + i * 60;
      const btn = this.add.container(x, y);
      const bg = this.add.graphics();
      const txt = this.add.text(0, 0, amt, {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(0.5);
      btn.add([bg, txt]);
      const hit = this.add.zone(0, 0, 50, 42).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.add(hit);
      hit.on('pointerdown', () => this.selectBet(amt));
      this.betButtons.push({ amt, bg, txt });
    });
    this.styleBetButtons();
  }

  selectBet(amt) {
    if (this.state !== 'BETTING') return;
    if (this.registry.get('chips') < amt) return;
    this.selectedBet = amt;
    this.styleBetButtons();
  }

  styleBetButtons() {
    for (const b of this.betButtons) {
      const active = b.amt === this.selectedBet;
      b.bg.clear();
      b.bg.fillStyle(active ? 0x3d2817 : 0x1a0d08, 0.95);
      b.bg.fillRoundedRect(-25, -21, 50, 42, 5);
      b.bg.lineStyle(active ? 2 : 1, active ? 0xc9a961 : 0xa89050, active ? 1 : 0.7);
      b.bg.strokeRoundedRect(-25, -21, 50, 42, 5);
      b.txt.setColor(active ? '#ffd8a0' : '#c9a961');
    }
  }

  createActionButton() {
    // Single button that changes label/handler based on state.
    const x = 1010, y = 600;
    const w = 180, h = 52;
    const btn = this.add.container(x, y);

    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, 'DEAL', {
      fontFamily: '"Courier New", monospace', fontSize: '20px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 5
    }).setOrigin(0.5);
    btn.add([bg, txt]);

    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.add(hit);

    const draw = (hovered) => {
      bg.clear();
      bg.fillStyle(hovered ? 0x3d2817 : 0x2a1810, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
      bg.lineStyle(2, hovered ? 0xffd8a0 : 0xc9a961, hovered ? 1 : 0.85);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
      txt.setColor(hovered ? '#ffd8a0' : '#c9a961');
    };
    draw(false);

    hit.on('pointerover', () => draw(true));
    hit.on('pointerout',  () => draw(false));
    hit.on('pointerdown', () => this.onAction());

    this.actionBtn = { bg, txt, draw };
  }

  setActionLabel(label) {
    if (this.actionBtn) this.actionBtn.txt.setText(label);
  }

  onAction() {
    if (this.state === 'BETTING')      this.dealHand();
    else if (this.state === 'DEALT')   this.drawHand();
    // DRAWING / RESULT phases ignore — animation is in progress or banner is up
  }

  // ============================================================
  // TIER LABEL (live hand description) + RESULT TEXT (banner)
  // ============================================================
  createTierLabel() {
    this.handTierText = this.add.text(640, 540, '', {
      fontFamily: '"Courier New", monospace', fontSize: '16px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
  }

  createResultText() {
    this.resultText = this.add.text(640, 280, '', {
      fontFamily: '"Courier New", monospace', fontSize: '32px',
      fontStyle: 'bold', color: '#e8c547', letterSpacing: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 14, fill: true }
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    this.lastResultText = this.add.text(30, 110, 'LAST: —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    });
  }

  // ============================================================
  // DEAL / DRAW / RESOLUTION
  // ============================================================
  async dealHand() {
    if (this.state !== 'BETTING') return;
    if (this.registry.get('chips') < this.selectedBet) {
      this.flashTier('not enough chips', '#c24f2a');
      return;
    }

    this.state = 'DEALING';
    this.currentBet = this.selectedBet;
    this.registry.set('chips', this.registry.get('chips') - this.currentBet);
    this.held = [false, false, false, false, false];
    this.hand.forEach(c => c.destroy());
    this.hand = [];
    this.handData = [];
    this.heldLabels.forEach(l => l.setVisible(false));
    this.resultText.setAlpha(0);
    this.handTierText.setText('');
    this.highlightPaytable(null);

    // Reshuffle if deck thin
    if (this.deck.length < 12) this.deck = Deck.shuffle(Deck.build());

    // Deal 5 cards from the virtual deck, arcing into each slot
    for (let i = 0; i < 5; i++) {
      await this.dealOne(i, 60);
    }

    // Evaluate the dealt (5-card) hand → highlight that paytable cell.
    // Players use this to decide what to hold.
    const tier = evalPokerHand(this.handData);
    this.lastTier = tier;
    this.handTierText.setText(`dealt: ${tier.rank === 'no_win' ? 'nothing yet — choose what to hold' : tier.name}`);
    if (tier.rank !== 'no_win') this.highlightPaytable(tier.rank);

    this.state = 'DEALT';
    this.setActionLabel('DRAW');
  }

  async dealOne(slotIdx, delayMs) {
    const cardData = this.deck.pop();
    this.handData[slotIdx] = cardData;
    const card = new Card(this, cardData.suit, cardData.rank, DECK_X, DECK_Y);
    this.hand[slotIdx] = card;
    await card.arcTo(CARD_X[slotIdx], CARD_Y, 320, 26, delayMs);
    await card.landPop();
    await card.flip(240);
  }

  async drawHand() {
    if (this.state !== 'DEALT') return;
    this.state = 'DRAWING';
    this.handTierText.setText('');
    this.highlightPaytable(null);

    // Replace each non-held card
    for (let i = 0; i < 5; i++) {
      if (this.held[i]) continue;
      // Tween the old card off-screen to the right, then destroy
      const old = this.hand[i];
      await new Promise(resolve => {
        this.tweens.add({
          targets: old.container,
          x: 1320, y: CARD_Y - 100,
          rotation: 0.4,
          alpha: 0,
          duration: 280,
          ease: 'Sine.easeIn',
          onComplete: () => { old.destroy(); resolve(); }
        });
      });
      // Deal a fresh card into the slot
      await this.dealOne(i, 30);
    }

    // Reset any lifted positions (held cards stay lifted only during decision)
    for (let i = 0; i < 5; i++) {
      if (this.held[i]) {
        this.tweens.add({
          targets: this.hand[i].container,
          y: CARD_Y,
          duration: 200,
          ease: 'Sine.easeOut'
        });
        this.heldLabels[i].setVisible(false);
      }
    }

    this.resolveHand();
  }

  resolveHand() {
    const tier = evalPokerHand(this.handData);
    const payout = this.currentBet * tier.multiplier;

    if (payout > 0) {
      this.registry.set('chips', this.registry.get('chips') + payout);
      this.highlightPaytable(tier.rank);
      this.flashBanner(`${tier.name} — +${payout}`, '#e8c547');
      if (SFX.slotWinTier) SFX.slotWinTier(Math.min(10, tier.multiplier / 10 + 1));
    } else {
      this.flashBanner('—  no win  —', '#8b6f47');
    }

    const net = payout - this.currentBet;
    const sign = net >= 0 ? '+' : '';
    this.lastResultText.setText(`LAST: ${tier.name} / ${sign}${net}`);
    this.lastResultText.setColor(net > 0 ? '#c9a961' : net < 0 ? '#c24f2a' : '#8b6f47');

    this.state = 'RESULT';
    this.setActionLabel('DEAL');

    // Auto-reset to BETTING after a beat
    this.time.delayedCall(2600, () => {
      if (this.state !== 'RESULT') return;
      this.resultText.setAlpha(0);
      this.handTierText.setText('');
      this.highlightPaytable(null);
      this.state = 'BETTING';
    });
  }

  flashBanner(text, color) {
    this.resultText.setText(text);
    this.resultText.setColor(color);
    this.resultText.setShadow(0, 0, color, 14, true);
    this.resultText.setScale(1.2);
    this.resultText.setAlpha(0);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 350, ease: 'Sine.easeOut'
    });
  }

  flashTier(text, color) {
    this.handTierText.setText(text);
    this.handTierText.setColor(color);
  }

  // ============================================================
  // HUD — chips + marrow top-right
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

    const onChip = () => { if (this.chipText) this.chipText.setText(`chips: ${this.registry.get('chips')}`); };
    const onMarrow = () => { if (this.marrowText) this.marrowText.setText(`marrow: ${this.registry.get('marrow')}`); };
    this.registry.events.on('changedata-chips', onChip);
    this.registry.events.on('changedata-marrow', onMarrow);
    this._hudListeners = { onChip, onMarrow };

    this.events.once('shutdown', () => {
      if (this._hudListeners) {
        this.registry.events.off('changedata-chips',  this._hudListeners.onChip);
        this.registry.events.off('changedata-marrow', this._hudListeners.onMarrow);
        this._hudListeners = null;
      }
    });
  }

  // ============================================================
  // BACK TO POKER HUB (not all the way to the parlor — keep the
  // sub-room frame tight so players bounce between variants easily)
  // ============================================================
  createBackButton() {
    const back = this.add.text(30, 24, '< back to poker room', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.state === 'DEALING' || this.state === 'DRAWING') return;
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Poker'));
    });
  }
}
