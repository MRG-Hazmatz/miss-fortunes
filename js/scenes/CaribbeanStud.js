import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import { Card, Deck } from '../cards.js';
import { evalCaribbeanHand, compareCaribbean, CARIBBEAN_TIERS } from '../poker/handRank.js';

// CaribbeanStud.js — ante + (2x ante) CALL vs. dealer's 5-card hand.
// Dealer needs pair-or-better OR Ace-King-high to qualify.
// Dealer's 5th card flips face-up after the deal so the player has
// info to decide CALL vs FOLD.

const BET_OPTIONS = [1, 5, 10, 25];

// 5-card row, 90px apart, centered on 640
const CARD_X = [460, 550, 640, 730, 820];
const DEALER_Y = 210;
const PLAYER_Y = 470;

const DECK_X = 1100;
const DECK_Y = 110;

const CIRCLE_Y = 605;
const ANTE_X   = 270;
const CALL_X   = 450;

export class CaribbeanStud extends Phaser.Scene {
  constructor() {
    super('CaribbeanStud');
  }

  create() {
    this.state         = 'BETTING';
    this.deck          = Deck.shuffle(Deck.build());
    this.playerHand    = [];
    this.dealerHand    = [];
    this.playerData    = [];
    this.dealerData    = [];
    this.selectedBet   = BET_OPTIONS[0];
    this.anteStake     = 0;
    this.callStake     = 0;          // = 2 × ante if CALL, 0 if FOLD
    this.betButtons    = [];
    this.anteBtn       = null;
    this.foldBtn       = null;
    this.callBtn       = null;
    this.resultText    = null;
    this.lastResultText= null;
    this.playerHandText = null;
    this.dealerHandText = null;
    this.anteChip      = null;
    this.callChip      = null;
    this._hudListeners = null;

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createHeader();
    this.createCallPaytable();
    this.createCardSlots();
    this.createLabelsAndResult();
    this.createBetCircles();
    this.createBetSelector();
    this.createActionButtons();
    this.createHUD();
    this.createBackButton();
  }

  // ============================================================
  // BACKGROUND
  // ============================================================
  createBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 0, 1280, 720);

    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.06);
      g.fillRect(0, 0, 1280, 50 + i * 10);
      g.fillRect(0, 720 - (50 + i * 10), 1280, 50 + i * 10);
    }

    const lamp = this.add.graphics();
    lamp.fillStyle(0xc9a961, 0.04);
    lamp.fillCircle(640, 340, 420);
    lamp.fillStyle(0xc9a961, 0.05);
    lamp.fillCircle(640, 340, 300);
    lamp.fillStyle(0xc9a961, 0.06);
    lamp.fillCircle(640, 340, 200);

    // Felt — wider than 3-card to accommodate 5 cards
    const felt = this.add.graphics();
    felt.fillStyle(0x0a3a1a, 0.55);
    felt.fillRoundedRect(380, 160, 520, 380, 12);
    felt.lineStyle(2, 0xc9a961, 0.45);
    felt.strokeRoundedRect(380, 160, 520, 380, 12);
    felt.lineStyle(1, 0x6a5030, 0.35);
    felt.strokeRoundedRect(390, 170, 500, 360, 10);

    for (let i = 0; i < 60; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.04);
      g.fillCircle(Math.random() * 1280, Math.random() * 720, 1 + Math.random() * 2);
    }
  }

  createHeader() {
    this.add.text(640, 48, 'CARIBBEAN STUD', {
      fontFamily: '"Courier New", monospace', fontSize: '22px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    }).setOrigin(0.5);
    this.add.text(640, 74, '— dealer needs A-K to play —', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
  }

  // ============================================================
  // CALL PAYS PAYTABLE — reference panel on the right
  // ============================================================
  createCallPaytable() {
    const x = 1090, y = 280, w = 200, h = 290;
    const g = this.add.graphics();
    g.fillStyle(0x1a0d08, 0.92);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    g.lineStyle(1, 0xc9a961, 0.6);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);

    this.add.text(x, y - h / 2 + 18, 'CALL PAYS', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 2
    }).setOrigin(0.5);

    // Show all tiers (pair + high card share the same payout in display)
    const rows = CARIBBEAN_TIERS.slice();
    const rowH = 24;
    const startY = y - h / 2 + 42;
    rows.forEach((t, i) => {
      const ry = startY + i * rowH;
      const label = t.rank === 'high_card' ? 'PAIR / HIGH' : t.name;
      // Skip displaying the pair row separately — fold it into the joint row
      if (t.rank === 'pair') return;
      this.add.text(x - w / 2 + 14, ry, label, {
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        color: '#8b6f47', letterSpacing: 1
      }).setOrigin(0, 0.5);
      this.add.text(x + w / 2 - 14, ry, `${t.callMult}×`, {
        fontFamily: '"Courier New", monospace', fontSize: '12px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(1, 0.5);
    });

    // Note below
    this.add.text(x, y + h / 2 - 14, 'ante pays 1× on win', {
      fontFamily: '"Courier New", monospace', fontSize: '9px',
      fontStyle: 'italic', color: '#6a5030'
    }).setOrigin(0.5);
  }

  // ============================================================
  // CARD SLOTS + LABELS
  // ============================================================
  createCardSlots() {
    const drawSlot = (x, y) => {
      const g = this.add.graphics();
      g.lineStyle(1, 0x3d2817, 0.55);
      g.strokeRoundedRect(x - 33, y - 46, 66, 92, 5);
    };
    for (const x of CARD_X) drawSlot(x, DEALER_Y);
    for (const x of CARD_X) drawSlot(x, PLAYER_Y);
  }

  createLabelsAndResult() {
    this.add.text(410, DEALER_Y, 'DEALER', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0.5);
    this.add.text(410, PLAYER_Y, 'PLAYER', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#c9a961', letterSpacing: 3
    }).setOrigin(0.5);

    this.dealerHandText = this.add.text(640, DEALER_Y + 70, '', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 1
    }).setOrigin(0.5);
    this.playerHandText = this.add.text(640, PLAYER_Y - 70, '', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'italic', color: '#c9a961', letterSpacing: 1
    }).setOrigin(0.5);

    this.resultText = this.add.text(640, 350, '', {
      fontFamily: '"Courier New", monospace', fontSize: '26px',
      fontStyle: 'bold', color: '#e8c547', letterSpacing: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 14, fill: true }
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    this.lastResultText = this.add.text(30, 110, 'LAST: —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    });
  }

  // ============================================================
  // BET CIRCLES — ANTE + CALL
  // ============================================================
  createBetCircles() {
    this.anteChip = this.makeCircle(ANTE_X, CIRCLE_Y, 'ANTE');
    this.callChip = this.makeCircle(CALL_X, CIRCLE_Y, 'CALL (2×)');
    this.updateChipDisplays();
  }

  makeCircle(x, y, label) {
    const g = this.add.graphics();
    g.lineStyle(2, 0xc9a961, 0.7);
    g.strokeCircle(x, y, 36);
    g.lineStyle(1, 0x6a5030, 0.5);
    g.strokeCircle(x, y, 30);
    this.add.text(x, y - 50, label, {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0.5);
    const value = this.add.text(x, y, '0', {
      fontFamily: '"Courier New", monospace', fontSize: '18px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(0.5);
    return { value };
  }

  updateChipDisplays() {
    if (this.anteChip) this.anteChip.value.setText(`${this.anteStake || this.selectedBet}`);
    if (this.callChip) this.callChip.value.setText(`${this.callStake}`);
    const dim = (chip, active) => chip && chip.value.setColor(active ? '#ffd8a0' : '#5a4530');
    dim(this.anteChip, this.state !== 'BETTING' || this.anteStake > 0);
    dim(this.callChip, this.callStake > 0);
  }

  // ============================================================
  // BET SELECTOR (chip-amount ladder for ANTE)
  // ============================================================
  createBetSelector() {
    const baseX = 660;
    const y = CIRCLE_Y;
    this.add.text(baseX - 40, y - 38, 'BET', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0, 0.5);
    BET_OPTIONS.forEach((amt, i) => {
      const x = baseX + i * 56;
      const btn = this.add.container(x, y);
      const bg = this.add.graphics();
      const txt = this.add.text(0, 0, amt, {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(0.5);
      btn.add([bg, txt]);
      const hit = this.add.zone(0, 0, 48, 42).setOrigin(0.5).setInteractive({ useHandCursor: true });
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
    this.updateChipDisplays();
  }

  styleBetButtons() {
    for (const b of this.betButtons) {
      const active = b.amt === this.selectedBet;
      b.bg.clear();
      b.bg.fillStyle(active ? 0x3d2817 : 0x1a0d08, 0.95);
      b.bg.fillRoundedRect(-23, -21, 46, 42, 5);
      b.bg.lineStyle(active ? 2 : 1, active ? 0xc9a961 : 0xa89050, active ? 1 : 0.7);
      b.bg.strokeRoundedRect(-23, -21, 46, 42, 5);
      b.txt.setColor(active ? '#ffd8a0' : '#c9a961');
    }
  }

  // ============================================================
  // ACTION BUTTONS — ANTE (initial), FOLD + CALL after deal
  // ============================================================
  createActionButtons() {
    this.anteBtn = this.makeBigBtn(940, CIRCLE_Y, 'ANTE', () => this.placeAnte(),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0 });
    this.foldBtn = this.makeBigBtn(900, CIRCLE_Y, 'FOLD', () => this.fold(),
      { idleColor: '#8b6f47', hoverColor: '#c9a961', borderIdle: 0x6a5030, borderHover: 0xa89050, w: 140 });
    this.callBtn = this.makeBigBtn(1050, CIRCLE_Y, 'CALL', () => this.placeCall(),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0, w: 140 });

    this.foldBtn.visible = false;
    this.callBtn.visible = false;
  }

  makeBigBtn(x, y, label, onClick, style = {}) {
    const w = style.w || 160;
    const h = 46;
    const idleColor   = style.idleColor   || '#c9a961';
    const hoverColor  = style.hoverColor  || '#ffd8a0';
    const borderIdle  = style.borderIdle  !== undefined ? style.borderIdle  : 0xc9a961;
    const borderHover = style.borderHover !== undefined ? style.borderHover : 0xffd8a0;

    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, label, {
      fontFamily: '"Courier New", monospace', fontSize: '18px',
      fontStyle: 'bold', color: idleColor, letterSpacing: 4
    }).setOrigin(0.5);
    c.add([bg, txt]);

    const draw = (hovered) => {
      bg.clear();
      bg.fillStyle(hovered ? 0x3d2817 : 0x2a1810, 1);
      bg.fillRoundedRect(-w / 2, -h / 2, w, h, 7);
      bg.lineStyle(2, hovered ? borderHover : borderIdle, hovered ? 1 : 0.85);
      bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 7);
      txt.setColor(hovered ? hoverColor : idleColor);
    };
    draw(false);

    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout',  () => draw(false));
    hit.on('pointerdown', () => { if (c.visible) onClick(); });
    return c;
  }

  // ============================================================
  // DEAL / FOLD / CALL / RESOLVE
  // ============================================================
  async placeAnte() {
    if (this.state !== 'BETTING') return;
    if (this.registry.get('chips') < this.selectedBet) {
      this.flashResult('not enough chips', '#c24f2a');
      return;
    }

    this.state = 'DEALING';
    this.anteStake = this.selectedBet;
    this.registry.set('chips', this.registry.get('chips') - this.anteStake);
    if (SFX.chipPlace) SFX.chipPlace();

    this.anteBtn.visible = false;
    this.dealerHandText.setText('');
    this.playerHandText.setText('');
    this.resultText.setAlpha(0);
    this.updateChipDisplays();

    if (this.deck.length < 12) this.deck = Deck.shuffle(Deck.build());

    this.playerHand = [];
    this.dealerHand = [];
    this.playerData = [];
    this.dealerData = [];

    // Deal player 5 face-up, dealer 5 face-down (except last visible)
    for (let i = 0; i < 5; i++) {
      await this.dealCardTo('player', i, 50);
    }
    for (let i = 0; i < 5; i++) {
      // Dealer's 5th card flips face-up immediately as the up-card info
      const faceUp = (i === 4);
      await this.dealCardTo('dealer', i, 50, faceUp);
    }

    // Show player hand name + dealer's visible card hint
    const peval = evalCaribbeanHand(this.playerData);
    this.playerHandText.setText(peval.name.toLowerCase());
    this.dealerHandText.setText(`dealer shows ${this.dealerData[4].rank}${this.dealerData[4].suit.sym}`);

    this.state = 'DEALT';
    this.foldBtn.visible = true;
    this.callBtn.visible = true;
  }

  async dealCardTo(who, slotIdx, delayMs, faceUp = null) {
    const cardData = this.deck.pop();
    const x = CARD_X[slotIdx];
    const y = who === 'dealer' ? DEALER_Y : PLAYER_Y;
    const card = new Card(this, cardData.suit, cardData.rank, DECK_X, DECK_Y);
    if (who === 'dealer') {
      this.dealerHand[slotIdx] = card;
      this.dealerData[slotIdx] = cardData;
    } else {
      this.playerHand[slotIdx] = card;
      this.playerData[slotIdx] = cardData;
    }
    await card.arcTo(x, y, 300, 24, delayMs);
    await card.landPop();
    // Player always face-up; dealer only if explicitly true
    const shouldFlip = who === 'player' || faceUp === true;
    if (shouldFlip) await card.flip(220);
  }

  fold() {
    if (this.state !== 'DEALT') return;
    this.state = 'RESOLVING';
    this.foldBtn.visible = false;
    this.callBtn.visible = false;
    this.resolve(false);
  }

  async placeCall() {
    if (this.state !== 'DEALT') return;
    const callAmt = this.anteStake * 2;
    if (this.registry.get('chips') < callAmt) {
      this.flashResult('not enough chips for the call', '#c24f2a');
      return;
    }
    this.state = 'RESOLVING';
    this.callStake = callAmt;
    this.registry.set('chips', this.registry.get('chips') - callAmt);
    this.updateChipDisplays();
    if (SFX.chipPlace) SFX.chipPlace();
    this.foldBtn.visible = false;
    this.callBtn.visible = false;
    await this.revealDealer();
    this.resolve(true);
  }

  async revealDealer() {
    // Flip dealer cards 0-3 (4 is already face-up)
    for (let i = 0; i < 4; i++) {
      await this.dealerHand[i].flip(180);
    }
  }

  resolve(called) {
    const pEval = evalCaribbeanHand(this.playerData);
    const dEval = evalCaribbeanHand(this.dealerData);

    let totalReturn = 0;
    let bannerText = '';
    let bannerColor = '#8b6f47';

    if (!called) {
      // Folded — lose ante, no call placed
      bannerText  = 'FOLD';
      bannerColor = '#c24f2a';
      this.dealerHandText.setText('— dealer mucks —');
    } else {
      // Show dealer hand name now (cards already revealed)
      this.dealerHandText.setText(dEval.name.toLowerCase());

      if (!dEval.qualifies) {
        // Dealer doesn't qualify — ante 1:1, call pushes
        totalReturn += this.anteStake * 2;     // stake back + 1× win
        totalReturn += this.callStake;         // call returned
        bannerText  = "DEALER DOESN'T QUALIFY";
        bannerColor = '#c9a961';
      } else {
        const cmp = compareCaribbean(pEval, dEval);
        if (cmp > 0) {
          // Player wins — ante 1:1, call × callMult
          totalReturn += this.anteStake * 2;
          totalReturn += this.callStake + this.callStake * pEval.callMult;
          bannerText  = `WIN — ${pEval.name} vs ${dEval.name}`;
          bannerColor = '#e8c547';
        } else if (cmp < 0) {
          bannerText  = `LOSS — ${pEval.name} vs ${dEval.name}`;
          bannerColor = '#c24f2a';
        } else {
          // Push — both returned
          totalReturn += this.anteStake + this.callStake;
          bannerText  = `PUSH — ${pEval.name} both sides`;
          bannerColor = '#8b6f47';
        }
      }
    }

    if (totalReturn > 0) {
      this.registry.set('chips', this.registry.get('chips') + totalReturn);
      if (SFX.slotWinTier) {
        SFX.slotWinTier(Math.min(10, totalReturn / Math.max(1, this.anteStake)));
      }
    }

    this.flashResult(bannerText, bannerColor);
    const net = totalReturn - (this.anteStake + this.callStake);
    const sign = net >= 0 ? '+' : '';
    this.lastResultText.setText(`LAST: ${bannerText.split(' — ')[0]} / ${sign}${net}`);
    this.lastResultText.setColor(net > 0 ? '#c9a961' : net < 0 ? '#c24f2a' : '#8b6f47');

    this.time.delayedCall(2800, () => this.resetForNextHand());
  }

  flashResult(text, color) {
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

  resetForNextHand() {
    const allCards = [...this.playerHand, ...this.dealerHand];
    for (const c of allCards) {
      this.tweens.add({
        targets: c.container,
        x: c.container.x, y: c.container.y - 60,
        alpha: 0,
        duration: 400,
        ease: 'Sine.easeIn',
        onComplete: () => c.destroy()
      });
    }
    this.time.delayedCall(420, () => {
      this.playerHand = []; this.dealerHand = [];
      this.playerData = []; this.dealerData = [];
      this.anteStake = 0; this.callStake = 0;
      this.resultText.setAlpha(0);
      this.dealerHandText.setText('');
      this.playerHandText.setText('');
      this.updateChipDisplays();
      this.state = 'BETTING';
      this.anteBtn.visible = true;
    });
  }

  // ============================================================
  // HUD + BACK
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

  createBackButton() {
    const back = this.add.text(30, 24, '< back to poker room', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.state === 'DEALING' || this.state === 'RESOLVING') return;
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Poker'));
    });
  }
}
