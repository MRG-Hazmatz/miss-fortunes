import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import { Card, Deck } from '../cards.js';
import { evalThreeCardHand, compareThreeCard, THREE_CARD_TIERS } from '../poker/handRank.js';

// ThreeCardPoker.js — ante + optional Pair Plus side bet vs. dealer's 3 cards.
// Dealer qualifies on Queen-high or better. Ante Bonus pays on straights+.
// Pair Plus pays independently on the player's hand alone.

const BET_OPTIONS = [1, 5, 10, 25];

// 3-card slots, centered on x=640, 90px apart
const DEALER_X = [550, 640, 730];
const PLAYER_X = [550, 640, 730];
const DEALER_Y = 210;
const PLAYER_Y = 470;

// Virtual deck position the cards arc from
const DECK_X = 1100;
const DECK_Y = 110;

// Bet circles (ANTE / PLAY / PAIR PLUS) along the bottom
const CIRCLE_Y = 605;
const ANTE_X      = 250;
const PLAY_X      = 410;
const PAIRPLUS_X  = 570;

export class ThreeCardPoker extends Phaser.Scene {
  constructor() {
    super('ThreeCardPoker');
  }

  create() {
    // Defensive resets
    this.state         = 'BETTING';
    this.deck          = Deck.shuffle(Deck.build());
    this.playerHand    = [];          // array of 3 Card objects
    this.dealerHand    = [];          // array of 3 Card objects
    this.playerData    = [];
    this.dealerData    = [];
    this.selectedBet   = BET_OPTIONS[0];
    this.anteStake     = 0;           // locked once ANTE is pressed
    this.playStake     = 0;           // = anteStake if PLAY, 0 if FOLD
    this.pairPlusOn    = false;       // whether the side bet is active for this round
    this.pairPlusStake = 0;
    this.betButtons    = [];
    this.anteBtn       = null;
    this.foldBtn       = null;
    this.playBtn       = null;
    this.pairPlusToggle = null;
    this.resultText    = null;
    this.lastResultText= null;
    this.playerHandText = null;
    this.dealerHandText = null;
    this.anteChip      = null;
    this.playChip      = null;
    this.ppChip        = null;
    this._hudListeners = null;

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createHeader();
    this.createPairPlusBoard();
    this.createCardSlots();
    this.createLabelsAndResult();
    this.createBetCircles();
    this.createBetSelector();
    this.createActionButtons();
    this.createPairPlusToggle();
    this.createHUD();
    this.createBackButton();
  }

  // ============================================================
  // BACKGROUND — dim parlor with green-tinted felt
  // ============================================================
  createBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 0, 1280, 720);

    // Vignette
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.06);
      g.fillRect(0, 0, 1280, 50 + i * 10);
      g.fillRect(0, 720 - (50 + i * 10), 1280, 50 + i * 10);
    }

    // Lamp pool centered above the table
    const lamp = this.add.graphics();
    lamp.fillStyle(0xc9a961, 0.04);
    lamp.fillCircle(640, 340, 380);
    lamp.fillStyle(0xc9a961, 0.05);
    lamp.fillCircle(640, 340, 260);
    lamp.fillStyle(0xc9a961, 0.06);
    lamp.fillCircle(640, 340, 160);

    // Felt panel
    const felt = this.add.graphics();
    felt.fillStyle(0x0a3a1a, 0.55);
    felt.fillRoundedRect(420, 160, 440, 380, 12);
    felt.lineStyle(2, 0xc9a961, 0.45);
    felt.strokeRoundedRect(420, 160, 440, 380, 12);
    felt.lineStyle(1, 0x6a5030, 0.35);
    felt.strokeRoundedRect(430, 170, 420, 360, 10);

    // Dust motes
    for (let i = 0; i < 60; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.04);
      g.fillCircle(Math.random() * 1280, Math.random() * 720, 1 + Math.random() * 2);
    }
  }

  createHeader() {
    this.add.text(640, 48, 'THREE-CARD POKER', {
      fontFamily: '"Courier New", monospace', fontSize: '22px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 8,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    }).setOrigin(0.5);
    this.add.text(640, 74, '— against the house —', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
  }

  // ============================================================
  // PAIR PLUS PAYTABLE — reference panel on the right
  // ============================================================
  createPairPlusBoard() {
    const x = 1080, y = 220, w = 200, h = 200;
    const g = this.add.graphics();
    g.fillStyle(0x1a0d08, 0.92);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 6);
    g.lineStyle(1, 0xc9a961, 0.6);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 6);

    this.add.text(x, y - h / 2 + 18, 'PAIR PLUS PAYS', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 2
    }).setOrigin(0.5);

    const tiers = THREE_CARD_TIERS.filter(t => t.pairPlus > 0);
    const rowH = 22;
    const startY = y - h / 2 + 40;
    tiers.forEach((t, i) => {
      const ry = startY + i * rowH;
      this.add.text(x - w / 2 + 14, ry, t.name, {
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        color: '#8b6f47', letterSpacing: 1
      }).setOrigin(0, 0.5);
      this.add.text(x + w / 2 - 14, ry, `${t.pairPlus}×`, {
        fontFamily: '"Courier New", monospace', fontSize: '12px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(1, 0.5);
    });
  }

  // ============================================================
  // CARD SLOTS — 3 outlines for dealer + 3 for player
  // ============================================================
  createCardSlots() {
    const drawSlot = (x, y) => {
      const g = this.add.graphics();
      g.lineStyle(1, 0x3d2817, 0.55);
      g.strokeRoundedRect(x - 33, y - 46, 66, 92, 5);
    };
    for (const x of DEALER_X) drawSlot(x, DEALER_Y);
    for (const x of PLAYER_X) drawSlot(x, PLAYER_Y);
  }

  createLabelsAndResult() {
    this.add.text(440, DEALER_Y, 'DEALER', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47', letterSpacing: 3
    }).setOrigin(0.5);
    this.add.text(440, PLAYER_Y, 'PLAYER', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#c9a961', letterSpacing: 3
    }).setOrigin(0.5);

    // Dealer / player hand-name text below their row of cards
    this.dealerHandText = this.add.text(640, DEALER_Y + 70, '', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 1
    }).setOrigin(0.5);
    this.playerHandText = this.add.text(640, PLAYER_Y - 70, '', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'italic', color: '#c9a961', letterSpacing: 1
    }).setOrigin(0.5);

    // Center result banner
    this.resultText = this.add.text(640, 350, '', {
      fontFamily: '"Courier New", monospace', fontSize: '28px',
      fontStyle: 'bold', color: '#e8c547', letterSpacing: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 14, fill: true }
    }).setOrigin(0.5).setAlpha(0).setDepth(20);

    this.lastResultText = this.add.text(30, 110, 'LAST: —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    });
  }

  // ============================================================
  // BET CIRCLES — ANTE / PLAY / PAIR PLUS along the bottom
  // ============================================================
  createBetCircles() {
    this.anteChip = this.makeCircle(ANTE_X, CIRCLE_Y, 'ANTE');
    this.playChip = this.makeCircle(PLAY_X, CIRCLE_Y, 'PLAY');
    this.ppChip   = this.makeCircle(PAIRPLUS_X, CIRCLE_Y, 'PAIR+');
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
    if (this.playChip) this.playChip.value.setText(`${this.playStake}`);
    if (this.ppChip)   this.ppChip.value.setText(`${this.pairPlusStake || (this.pairPlusOn ? this.selectedBet : 0)}`);

    // Dim circles when their amount is 0 (not yet active)
    const dim = (chip, active) => chip.value.setColor(active ? '#ffd8a0' : '#5a4530');
    dim(this.anteChip, this.state !== 'BETTING' || this.anteStake > 0);
    dim(this.playChip, this.playStake > 0);
    dim(this.ppChip,   this.pairPlusOn || this.pairPlusStake > 0);
  }

  // ============================================================
  // BET SELECTOR — chip-amount ladder, used for the ANTE
  // ============================================================
  createBetSelector() {
    const baseX = 770;
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
  // PAIR PLUS toggle — click to add a side bet equal to ante
  // ============================================================
  createPairPlusToggle() {
    const x = PAIRPLUS_X, y = CIRCLE_Y + 65;
    const btn = this.add.container(x, y);
    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, 'pair+ off', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
    btn.add([bg, txt]);
    const hit = this.add.zone(0, 0, 110, 26).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.add(hit);

    const draw = () => {
      bg.clear();
      bg.fillStyle(this.pairPlusOn ? 0x3d2817 : 0x1a0d08, 0.95);
      bg.fillRoundedRect(-55, -13, 110, 26, 4);
      bg.lineStyle(1, this.pairPlusOn ? 0xc9a961 : 0x6a5030, this.pairPlusOn ? 1 : 0.6);
      bg.strokeRoundedRect(-55, -13, 110, 26, 4);
      txt.setText(this.pairPlusOn ? 'pair+ on' : 'pair+ off');
      txt.setColor(this.pairPlusOn ? '#ffd8a0' : '#8b6f47');
    };
    draw();
    hit.on('pointerdown', () => {
      if (this.state !== 'BETTING') return;
      // Need enough chips to cover ante + pair plus if turning on
      if (!this.pairPlusOn) {
        if (this.registry.get('chips') < this.selectedBet * 2) return;
      }
      this.pairPlusOn = !this.pairPlusOn;
      draw();
      this.updateChipDisplays();
    });
    this.pairPlusToggle = { draw };
  }

  // ============================================================
  // ACTION BUTTONS — ANTE (initial), or FOLD + PLAY (after deal)
  // ============================================================
  createActionButtons() {
    this.anteBtn = this.makeBigBtn(1080, CIRCLE_Y - 18, 'ANTE', () => this.placeAnte(),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0 });

    this.foldBtn = this.makeBigBtn(1040, CIRCLE_Y - 18, 'FOLD', () => this.fold(),
      { idleColor: '#8b6f47', hoverColor: '#c9a961', borderIdle: 0x6a5030, borderHover: 0xa89050, w: 130 });
    this.playBtn = this.makeBigBtn(1180, CIRCLE_Y - 18, 'PLAY', () => this.placePlay(),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0, w: 130 });

    this.foldBtn.setVisible(false);
    this.playBtn.setVisible(false);
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

    c.setVisible = (v) => { c.visible = v; };  // explicit method (Phaser containers have visible already; redundant but safe)
    return c;
  }

  // ============================================================
  // DEAL / FOLD / PLAY / RESOLVE
  // ============================================================
  async placeAnte() {
    if (this.state !== 'BETTING') return;
    const cost = this.selectedBet * (this.pairPlusOn ? 2 : 1);
    if (this.registry.get('chips') < cost) {
      this.flashResult('not enough chips', '#c24f2a');
      return;
    }

    this.state = 'DEALING';
    this.anteStake     = this.selectedBet;
    this.pairPlusStake = this.pairPlusOn ? this.selectedBet : 0;
    this.registry.set('chips', this.registry.get('chips') - cost);
    if (SFX.chipPlace) SFX.chipPlace();

    this.anteBtn.visible = false;
    this.dealerHandText.setText('');
    this.playerHandText.setText('');
    this.resultText.setAlpha(0);
    this.updateChipDisplays();

    // Reshuffle if low
    if (this.deck.length < 12) this.deck = Deck.shuffle(Deck.build());

    // Deal: alternate dealer, player, dealer, player, dealer, player
    // For 3-card poker the order doesn't matter (no peeking), so just deal
    // player face-up + dealer face-down, both 3 cards.
    this.playerHand = [];
    this.dealerHand = [];
    this.playerData = [];
    this.dealerData = [];

    for (let i = 0; i < 3; i++) {
      await this.dealCardTo('player', i, 60);
    }
    for (let i = 0; i < 3; i++) {
      await this.dealCardTo('dealer', i, 60);
    }

    // Show player's hand name as flavor (they don't see dealer's name yet)
    const peval = evalThreeCardHand(this.playerData);
    this.playerHandText.setText(peval.name.toLowerCase());

    this.state = 'DEALT';
    this.foldBtn.visible = true;
    this.playBtn.visible = true;
  }

  async dealCardTo(who, slotIdx, delayMs) {
    const cardData = this.deck.pop();
    const x = (who === 'dealer' ? DEALER_X : PLAYER_X)[slotIdx];
    const y =  who === 'dealer' ? DEALER_Y : PLAYER_Y;
    const card = new Card(this, cardData.suit, cardData.rank, DECK_X, DECK_Y);
    if (who === 'dealer') {
      this.dealerHand[slotIdx] = card;
      this.dealerData[slotIdx] = cardData;
    } else {
      this.playerHand[slotIdx] = card;
      this.playerData[slotIdx] = cardData;
    }
    await card.arcTo(x, y, 320, 26, delayMs);
    await card.landPop();
    if (who === 'player') await card.flip(240);
  }

  fold() {
    if (this.state !== 'DEALT') return;
    this.state = 'RESOLVING';
    this.foldBtn.visible = false;
    this.playBtn.visible = false;
    // Pair plus still resolves on a fold!
    this.resolve(false);
  }

  async placePlay() {
    if (this.state !== 'DEALT') return;
    if (this.registry.get('chips') < this.anteStake) {
      this.flashResult('not enough chips for play bet', '#c24f2a');
      return;
    }
    this.state = 'RESOLVING';
    this.playStake = this.anteStake;
    this.registry.set('chips', this.registry.get('chips') - this.playStake);
    this.updateChipDisplays();
    if (SFX.chipPlace) SFX.chipPlace();
    this.foldBtn.visible = false;
    this.playBtn.visible = false;
    await this.revealDealer();
    this.resolve(true);
  }

  async revealDealer() {
    for (const c of this.dealerHand) {
      await c.flip(220);
    }
  }

  resolve(played) {
    const pEval = evalThreeCardHand(this.playerData);
    const dEval = evalThreeCardHand(this.dealerData);

    let totalReturn = 0;
    let lines = [];

    // ---- Pair Plus (independent of main game; pays even on fold) ----
    if (this.pairPlusStake > 0) {
      const ppMul = pEval.pairPlus;
      if (ppMul > 0) {
        const ppPay = this.pairPlusStake + this.pairPlusStake * ppMul;
        totalReturn += ppPay;
        lines.push(`PAIR PLUS — ${pEval.name} pays ${ppMul}× (+${ppPay - this.pairPlusStake})`);
      } else {
        lines.push(`pair plus loses (${pEval.name})`);
      }
    }

    let bannerColor = '#8b6f47';
    let bannerText = '';

    if (!played) {
      // Folded — lose ante, pair plus already resolved above
      bannerText = 'FOLD';
      bannerColor = '#c24f2a';
      lines.push(`ante lost (—${this.anteStake})`);
      // Don't reveal dealer's hand on fold (standard rule — they don't show)
      this.dealerHandText.setText('— dealer mucks —');
    } else {
      // Show dealer's hand name
      this.dealerHandText.setText(dEval.name.toLowerCase());

      // Ante Bonus is paid regardless of dealer's qualification (extra prize on big hands)
      if (pEval.anteBonus > 0) {
        const bonusPay = this.anteStake * pEval.anteBonus;
        totalReturn += bonusPay;
        lines.push(`ante bonus — ${pEval.name} pays ${pEval.anteBonus}× (+${bonusPay})`);
      }

      if (!dEval.qualifies) {
        // Dealer doesn't qualify (less than Q-high)
        // Ante pays 1:1, Play pushes
        totalReturn += this.anteStake + this.anteStake;       // ante × 2 (stake back + 1× win)
        totalReturn += this.playStake;                        // play stake returned
        bannerText  = "DEALER DOESN'T QUALIFY";
        bannerColor = '#c9a961';
        lines.push(`ante pays 1:1 (+${this.anteStake})`);
        lines.push(`play pushes (+0)`);
      } else {
        const cmp = compareThreeCard(pEval, dEval);
        if (cmp > 0) {
          // Player wins
          totalReturn += this.anteStake * 2 + this.playStake * 2;
          bannerText  = `WIN — ${pEval.name} vs ${dEval.name}`;
          bannerColor = '#e8c547';
        } else if (cmp < 0) {
          // Dealer wins
          bannerText  = `LOSS — ${pEval.name} vs ${dEval.name}`;
          bannerColor = '#c24f2a';
        } else {
          // Push
          totalReturn += this.anteStake + this.playStake;
          bannerText  = `PUSH — ${pEval.name} both sides`;
          bannerColor = '#8b6f47';
        }
      }
    }

    // Apply chip return
    if (totalReturn > 0) {
      this.registry.set('chips', this.registry.get('chips') + totalReturn);
      if (SFX.slotWinTier) SFX.slotWinTier(Math.min(10, totalReturn / Math.max(1, this.anteStake)));
    }

    this.flashResult(bannerText, bannerColor);
    const net = totalReturn - (this.anteStake + this.playStake + this.pairPlusStake);
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
    // Tween cards off-screen + destroy
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
      this.anteStake = 0; this.playStake = 0; this.pairPlusStake = 0;
      this.pairPlusOn = false;
      if (this.pairPlusToggle) this.pairPlusToggle.draw();
      this.resultText.setAlpha(0);
      this.dealerHandText.setText('');
      this.playerHandText.setText('');
      this.updateChipDisplays();
      this.state = 'BETTING';
      this.anteBtn.visible = true;
    });
  }

  // ============================================================
  // HUD
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
