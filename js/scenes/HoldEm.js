import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import { Card, Deck } from '../cards.js';
import { evalBestOfSeven, compareCaribbean } from '../poker/handRank.js';
import { botDecision, BOT_PERSONAS } from '../poker/bots.js';

// HoldEm.js — 3-handed fixed-limit Texas Hold'em vs two occult bots.
// You (seat 0) vs THE WIDOW (seat 1) + THE GRAVEDIGGER (seat 2).
//
// Simplifications (fake-currency parlor MVP, noted honestly):
//  - Fixed-limit betting: bet/raise increment = the big blind, capped at
//    1 bet + 3 raises per street. Keeps per-hand exposure bounded.
//  - No side pots. If the player goes all-in for less than a full call
//    (rare at sane stakes — bots hold deep notional stacks), the whole pot
//    is still contested normally. Negligible inaccuracy for this context.
//  - Bot stacks are notional and refill between hands so the table never
//    empties; only the player's chips touch the save.

const BET_OPTIONS = [1, 5, 10, 25];

// Community card row + deck origin
const COMMUNITY_X = [492, 566, 640, 714, 788];
const COMMUNITY_Y = 330;
const DECK_X = 1130;
const DECK_Y = 80;

// Seat layouts: hole-card positions + where the info block sits
const SEATS_LAYOUT = [
  { holeX: [600, 680], holeY: 560, infoX: 640, infoY: 632, btnX: 748, btnY: 560 },  // player
  { holeX: [180, 258], holeY: 150, infoX: 219, infoY: 92,  btnX: 300, btnY: 150 },  // widow (top-left)
  { holeX: [1022, 1100], holeY: 150, infoX: 1061, infoY: 92, btnX: 980, btnY: 150 }  // gravedigger (top-right)
];

export class HoldEm extends Phaser.Scene {
  constructor() {
    super('HoldEm');
  }

  create() {
    this.state       = 'IDLE';
    this.deck        = [];
    this.community   = [];       // Card objects
    this.communityData = [];     // card-data
    this.selectedBet = BET_OPTIONS[0];
    this.button      = Math.floor(Math.random() * 3);  // dealer button seat
    this.pot         = 0;
    this.currentBet  = 0;
    this.betIncrement = 0;
    this.raiseCount  = 0;
    this.raiseCap    = 4;        // 1 bet + 3 raises
    this.actor       = 0;
    this.street      = 'idle';
    this.playerStartChips = 0;
    this.betButtons  = [];
    this.actionBtns  = {};
    this._hudListeners = null;
    this._resolvePlayerTurn = null;

    // Seats — bot stacks persist across the session but refill if short.
    this.seats = [
      { id: 0, name: 'YOU',             isBot: false, persona: null,                     stack: 0,   folded: false, allIn: false, hasActed: false, contributed: 0, totalContributed: 0, hole: [], holeData: [], actionLabel: '', infoText: null, betText: null, dealerDisc: null },
      { id: 1, name: BOT_PERSONAS.widow.name,       isBot: true, persona: BOT_PERSONAS.widow,       stack: 600, folded: false, allIn: false, hasActed: false, contributed: 0, totalContributed: 0, hole: [], holeData: [], actionLabel: '', infoText: null, betText: null, dealerDisc: null },
      { id: 2, name: BOT_PERSONAS.gravedigger.name, isBot: true, persona: BOT_PERSONAS.gravedigger, stack: 600, folded: false, allIn: false, hasActed: false, contributed: 0, totalContributed: 0, hole: [], holeData: [], actionLabel: '', infoText: null, betText: null, dealerDisc: null }
    ];

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createHeader();
    this.createCommunitySlots();
    this.createSeatInfo();
    this.createPotDisplay();
    this.createResultText();
    this.createBetSelector();
    this.createActionButtons();
    this.createDealButton();
    this.createHUD();
    this.createBackButton();
    this.refreshUIForState();
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
    // Big oval table
    const felt = this.add.graphics();
    felt.fillStyle(0x0a3a1a, 0.5);
    felt.fillEllipse(640, 360, 900, 460);
    felt.lineStyle(3, 0xc9a961, 0.4);
    felt.strokeEllipse(640, 360, 900, 460);
    felt.lineStyle(1, 0x6a5030, 0.3);
    felt.strokeEllipse(640, 360, 860, 420);
    // Lamp glow center
    const lamp = this.add.graphics();
    lamp.fillStyle(0xc9a961, 0.05);
    lamp.fillCircle(640, 330, 280);
    lamp.fillStyle(0xc9a961, 0.05);
    lamp.fillCircle(640, 330, 160);
    for (let i = 0; i < 50; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.03);
      g.fillCircle(Math.random() * 1280, Math.random() * 720, 1 + Math.random() * 2);
    }
  }

  createHeader() {
    this.add.text(640, 30, "TEXAS HOLD'EM", {
      fontFamily: '"Courier New", monospace', fontSize: '20px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    }).setOrigin(0.5);
    this.add.text(640, 54, '— fixed limit · the widow & the gravedigger are watching —', {
      fontFamily: '"Courier New", monospace', fontSize: '10px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 1
    }).setOrigin(0.5);
  }

  createCommunitySlots() {
    for (const x of COMMUNITY_X) {
      const g = this.add.graphics();
      g.lineStyle(1, 0x3d2817, 0.5);
      g.strokeRoundedRect(x - 33, COMMUNITY_Y - 46, 66, 92, 5);
    }
  }

  createSeatInfo() {
    for (const seat of this.seats) {
      const L = SEATS_LAYOUT[seat.id];
      // Name + stack
      seat.infoText = this.add.text(L.infoX, L.infoY, '', {
        fontFamily: '"Courier New", monospace', fontSize: '13px',
        fontStyle: 'bold', color: seat.isBot ? '#8b6f47' : '#c9a961',
        align: 'center', lineSpacing: 3
      }).setOrigin(0.5);
      // Current-street bet + action label (below/above the info block)
      const betY = seat.id === 0 ? L.infoY + 26 : L.infoY + 26;
      seat.betText = this.add.text(L.infoX, betY, '', {
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        color: '#e8c547', align: 'center'
      }).setOrigin(0.5);
      // Dealer button disc
      seat.dealerDisc = this.add.container(L.btnX, L.btnY);
      const disc = this.add.graphics();
      disc.fillStyle(0xc9a961, 0.9);
      disc.fillCircle(0, 0, 12);
      disc.lineStyle(1, 0x2a1810, 0.8);
      disc.strokeCircle(0, 0, 12);
      const dtxt = this.add.text(0, 0, 'D', {
        fontFamily: '"Courier New", monospace', fontSize: '12px',
        fontStyle: 'bold', color: '#1a0d08'
      }).setOrigin(0.5);
      seat.dealerDisc.add([disc, dtxt]);
      seat.dealerDisc.setVisible(false);
    }
    this.updateSeatInfo();
  }

  updateSeatInfo() {
    for (const seat of this.seats) {
      const eff = this.effectiveStack(seat);
      let nameLine = seat.name;
      if (seat.folded) nameLine += ' (out)';
      seat.infoText.setText(`${nameLine}\n${eff} chips`);
      seat.infoText.setColor(
        seat.folded ? '#5a4530' : seat.isBot ? '#8b6f47' : '#c9a961'
      );
      // Bet / action label
      let bl = '';
      if (seat.actionLabel) bl = seat.actionLabel;
      if (seat.contributed > 0) bl = `${seat.actionLabel || 'bet'} ${seat.contributed}`;
      seat.betText.setText(bl);
      seat.dealerDisc.setVisible(seat.id === this.button);
    }
  }

  createPotDisplay() {
    this.potText = this.add.text(640, 250, '', {
      fontFamily: '"Courier New", monospace', fontSize: '16px',
      fontStyle: 'bold', color: '#e8c547', letterSpacing: 2,
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 8, fill: true }
    }).setOrigin(0.5);
  }

  updatePotDisplay() {
    this.potText.setText(this.pot > 0 ? `POT: ${this.pot}` : '');
  }

  createResultText() {
    this.resultText = this.add.text(640, 400, '', {
      fontFamily: '"Courier New", monospace', fontSize: '24px',
      fontStyle: 'bold', color: '#e8c547', letterSpacing: 4,
      align: 'center', lineSpacing: 6,
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 14, fill: true }
    }).setOrigin(0.5);
    this.resultText.setAlpha(0).setDepth(30);

    this.lastResultText = this.add.text(30, 110, 'LAST: —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    });
  }

  // ============================================================
  // BET SELECTOR (stake unit = big blind) + DEAL
  // ============================================================
  createBetSelector() {
    const baseX = 470, y = 665;
    this.betLabel = this.add.text(baseX - 60, y, 'STAKE', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0, 0.5);
    BET_OPTIONS.forEach((amt, i) => {
      const x = baseX + i * 52;
      const btn = this.add.container(x, y);
      const bg = this.add.graphics();
      const txt = this.add.text(0, 0, amt, {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        fontStyle: 'bold', color: '#c9a961'
      }).setOrigin(0.5);
      btn.add([bg, txt]);
      const hit = this.add.zone(0, 0, 44, 38).setOrigin(0.5).setInteractive({ useHandCursor: true });
      btn.add(hit);
      hit.on('pointerdown', () => this.selectBet(amt));
      this.betButtons.push({ amt, bg, txt, container: btn });
    });
    this.styleBetButtons();
  }

  selectBet(amt) {
    if (this.state !== 'IDLE') return;
    this.selectedBet = amt;
    this.styleBetButtons();
  }

  styleBetButtons() {
    for (const b of this.betButtons) {
      const active = b.amt === this.selectedBet;
      b.bg.clear();
      b.bg.fillStyle(active ? 0x3d2817 : 0x1a0d08, 0.95);
      b.bg.fillRoundedRect(-21, -19, 42, 38, 5);
      b.bg.lineStyle(active ? 2 : 1, active ? 0xc9a961 : 0xa89050, active ? 1 : 0.7);
      b.bg.strokeRoundedRect(-21, -19, 42, 38, 5);
      b.txt.setColor(active ? '#ffd8a0' : '#c9a961');
    }
  }

  createDealButton() {
    this.dealBtn = this.makeBtn(870, 665, 'DEAL', 150, () => this.startHand(),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0 });
  }

  // ============================================================
  // ACTION BUTTONS — FOLD / CHECK-or-CALL / RAISE
  // ============================================================
  createActionButtons() {
    this.actionBtns.fold = this.makeBtn(430, 665, 'FOLD', 120, () => this.playerAct('fold'),
      { idleColor: '#8b6f47', hoverColor: '#c9a961', borderIdle: 0x6a5030, borderHover: 0xa89050 });
    this.actionBtns.call = this.makeBtn(565, 665, 'CALL', 150, () => this.playerAct('call'),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0 });
    this.actionBtns.raise = this.makeBtn(730, 665, 'RAISE', 150, () => this.playerAct('raise'),
      { idleColor: '#c9a961', hoverColor: '#ffd8a0', borderIdle: 0xc9a961, borderHover: 0xffd8a0 });
    for (const k of Object.keys(this.actionBtns)) this.actionBtns[k].container.setVisible(false);
  }

  makeBtn(x, y, label, w, onClick, style = {}) {
    const h = 44;
    const idleColor   = style.idleColor   || '#c9a961';
    const hoverColor  = style.hoverColor  || '#ffd8a0';
    const borderIdle  = style.borderIdle  !== undefined ? style.borderIdle  : 0xc9a961;
    const borderHover = style.borderHover !== undefined ? style.borderHover : 0xffd8a0;

    const container = this.add.container(x, y);
    const bg = this.add.graphics();
    const txt = this.add.text(0, 0, label, {
      fontFamily: '"Courier New", monospace', fontSize: '17px',
      fontStyle: 'bold', color: idleColor, letterSpacing: 3
    }).setOrigin(0.5);
    container.add([bg, txt]);
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
    container.add(hit);
    hit.on('pointerover', () => draw(true));
    hit.on('pointerout',  () => draw(false));
    hit.on('pointerdown', () => { if (container.visible) onClick(); });
    return { container, txt, draw, setLabel: (l) => txt.setText(l) };
  }

  refreshUIForState() {
    const idle = this.state === 'IDLE';
    this.dealBtn.container.setVisible(idle);
    for (const b of this.betButtons) b.container.setVisible(idle);
    this.betLabel.setVisible(idle);
    if (idle) {
      for (const k of Object.keys(this.actionBtns)) this.actionBtns[k].container.setVisible(false);
    }
  }

  // ============================================================
  // HAND LIFECYCLE
  // ============================================================
  async startHand() {
    if (this.state !== 'IDLE') return;
    const bb = this.selectedBet;
    // Player must be able to cover a couple of big blinds to sit
    if (this.registry.get('chips') < bb * 2) {
      this.flashResult('not enough chips to post blinds', '#c24f2a');
      return;
    }

    this.state = 'DEALING';
    this.refreshUIForState();
    this.resultText.setAlpha(0);

    // Reset hand state
    this.pot = 0;
    this.currentBet = 0;
    this.betIncrement = bb;
    this.raiseCount = 0;
    this.playerStartChips = this.registry.get('chips');

    // Clear old cards
    this.community.forEach(c => c.destroy());
    this.community = [];
    this.communityData = [];
    for (const seat of this.seats) {
      seat.hole.forEach(c => c.destroy());
      seat.hole = [];
      seat.holeData = [];
      seat.folded = false;
      seat.allIn = false;
      seat.hasActed = false;
      seat.contributed = 0;
      seat.totalContributed = 0;
      seat.actionLabel = '';
      // Player stack mirrors registry; bots refill if short
      if (seat.isBot && seat.stack < bb * 8) seat.stack = 600;
      if (!seat.isBot) seat.stack = this.playerStartChips;
    }

    this.deck = Deck.shuffle(Deck.build());

    // Post blinds. 3-handed: SB = button+1, BB = button+2.
    const sbSeat = this.seats[(this.button + 1) % 3];
    const bbSeat = this.seats[(this.button + 2) % 3];
    const sb = Math.max(1, Math.floor(bb / 2));
    this.postBlind(sbSeat, sb, 'sb');
    this.postBlind(bbSeat, bb, 'bb');
    this.currentBet = bb;
    this.raiseCount = 1;  // the big blind counts as the opening bet

    this.updateSeatInfo();
    this.updatePotDisplay();

    // Deal 2 hole cards to each seat, player face-up, bots face-down
    for (let round = 0; round < 2; round++) {
      for (let s = 0; s < 3; s++) {
        await this.dealHole(this.seats[s], round);
      }
    }

    // Pre-flop action starts left of BB = the button seat (3-handed UTG).
    // findNextActor() steps to actor+1 first, so seed actor to the seat
    // BEFORE the button (the BB) → +1 lands on the button.
    this.street = 'preflop';
    this.actor = (this.button + 2) % 3;   // BB seat
    this.state = 'BETTING';
    this.processNextAction();
  }

  postBlind(seat, amount, label) {
    const pay = Math.min(amount, this.effectiveStack(seat));
    seat.contributed += pay;
    seat.totalContributed += pay;
    this.pot += pay;
    seat.actionLabel = label === 'sb' ? 'small blind' : 'big blind';
    if (pay < amount) seat.allIn = true;
  }

  async dealHole(seat, idx) {
    const cardData = this.deck.pop();
    seat.holeData[idx] = cardData;
    const L = SEATS_LAYOUT[seat.id];
    const card = new Card(this, cardData.suit, cardData.rank, DECK_X, DECK_Y);
    seat.hole[idx] = card;
    await card.arcTo(L.holeX[idx], L.holeY, 240, 20, 20);
    if (!seat.isBot) await card.flip(180);
  }

  effectiveStack(seat) {
    return seat.stack - seat.totalContributed;
  }

  // Core turn dispatcher — recursive, delay-driven for bots.
  processNextAction() {
    // Only one player left → they win uncontested
    const live = this.seats.filter(s => !s.folded);
    if (live.length === 1) {
      this.awardUncontested(live[0]);
      return;
    }

    const actor = this.findNextActor();
    if (actor === null) {
      // Betting round complete → next street
      this.advanceStreet();
      return;
    }

    this.actor = actor.id;
    if (actor.isBot) {
      this.time.delayedCall(700 + Math.random() * 500, () => this.botTurn(actor));
    } else {
      this.showPlayerButtons(actor);
    }
  }

  // Next seat (clockwise from current actor) that still needs to act.
  // step 1..3 covers all three seats (step 3 wraps back to the current
  // actor), so the actor who just moved is only re-served if a later raise
  // reset their hasActed flag.
  findNextActor() {
    for (let step = 1; step <= 3; step++) {
      const idx = (this.actor + step) % 3;
      const seat = this.seats[idx];
      if (this.seatNeedsAction(seat)) return seat;
    }
    return null;
  }

  seatNeedsAction(seat) {
    if (seat.folded || seat.allIn) return false;
    if (!seat.hasActed) return true;
    if (seat.contributed < this.currentBet) return true;
    return false;
  }

  botTurn(seat) {
    if (this.state !== 'BETTING') return;
    const toCall = this.currentBet - seat.contributed;
    const canRaise = this.raiseCount < this.raiseCap && this.effectiveStack(seat) > toCall;
    const decision = botDecision({
      hole: seat.holeData,
      community: this.communityData,
      persona: seat.persona,
      toCall, pot: this.pot, bigBlind: this.betIncrement,
      canRaise, street: this.street
    });
    this.applyAction(seat, decision.action);
    this.updateSeatInfo();
    this.updatePotDisplay();
    this.processNextAction();
  }

  showPlayerButtons(seat) {
    const toCall = this.currentBet - seat.contributed;
    this.actionBtns.fold.container.setVisible(true);
    this.actionBtns.call.container.setVisible(true);
    this.actionBtns.call.setLabel(toCall > 0 ? `CALL ${toCall}` : 'CHECK');
    const canRaise = this.raiseCount < this.raiseCap &&
                     this.effectiveStack(seat) > toCall;
    this.actionBtns.raise.container.setVisible(canRaise);
    this.actionBtns.raise.setLabel(`RAISE ${this.betIncrement}`);
  }

  hidePlayerButtons() {
    for (const k of Object.keys(this.actionBtns)) this.actionBtns[k].container.setVisible(false);
  }

  playerAct(action) {
    const seat = this.seats[0];
    if (this.state !== 'BETTING' || this.actor !== 0) return;
    // Guard: can't check when facing a bet (button shows CALL then anyway)
    this.hidePlayerButtons();
    this.applyAction(seat, action);
    this.updateSeatInfo();
    this.updatePotDisplay();
    this.processNextAction();
  }

  applyAction(seat, action) {
    const toCall = this.currentBet - seat.contributed;
    if (action === 'fold') {
      // Folding with nothing to call is silly; treat as check instead.
      if (toCall <= 0) {
        seat.actionLabel = 'checks';
      } else {
        seat.folded = true;
        seat.actionLabel = 'folds';
        seat.hole.forEach(c => c.container.setAlpha(0.3));
      }
    } else if (action === 'raise') {
      const raiseTo = this.currentBet + this.betIncrement;
      const need = raiseTo - seat.contributed;
      const pay = Math.min(need, this.effectiveStack(seat));
      seat.contributed += pay;
      seat.totalContributed += pay;
      this.pot += pay;
      if (seat.contributed > this.currentBet) this.currentBet = seat.contributed;
      this.raiseCount++;
      seat.actionLabel = toCall > 0 ? 'raises' : 'bets';
      if (this.effectiveStack(seat) <= 0) seat.allIn = true;
      if (SFX.chipPlace) SFX.chipPlace();
      // Everyone else must respond again
      for (const other of this.seats) {
        if (other !== seat && !other.folded && !other.allIn) other.hasActed = false;
      }
    } else {
      // call / check
      if (toCall <= 0) {
        seat.actionLabel = 'checks';
      } else {
        const pay = Math.min(toCall, this.effectiveStack(seat));
        seat.contributed += pay;
        seat.totalContributed += pay;
        this.pot += pay;
        seat.actionLabel = 'calls';
        if (this.effectiveStack(seat) <= 0) seat.allIn = true;
        if (SFX.chipPlace) SFX.chipPlace();
      }
    }
    seat.hasActed = true;
  }

  // ============================================================
  // STREETS
  // ============================================================
  advanceStreet() {
    // Reset per-street betting state
    for (const seat of this.seats) {
      seat.contributed = 0;
      if (!seat.folded) { seat.hasActed = false; seat.actionLabel = ''; }
    }
    this.currentBet = 0;
    this.raiseCount = 0;

    // If <=1 can still act (rest all-in/folded), deal the rest + showdown
    const canAct = this.seats.filter(s => !s.folded && !s.allIn);

    if (this.street === 'preflop') {
      this.street = 'flop';
      this.dealCommunity(3).then(() => this.postDealBetting(canAct));
    } else if (this.street === 'flop') {
      this.street = 'turn';
      this.dealCommunity(1).then(() => this.postDealBetting(canAct));
    } else if (this.street === 'turn') {
      this.street = 'river';
      this.dealCommunity(1).then(() => this.postDealBetting(canAct));
    } else {
      this.showdown();
    }
  }

  postDealBetting(canActBefore) {
    this.updateSeatInfo();
    this.updatePotDisplay();
    // If nobody can voluntarily act, roll straight through to the next street
    const canAct = this.seats.filter(s => !s.folded && !s.allIn);
    if (canAct.length <= 1 && this.everyoneMatched()) {
      this.time.delayedCall(600, () => this.advanceStreet());
      return;
    }
    // Post-flop first actor = first live seat left of the button (SB seat)
    this.actor = (this.button) % 3;   // findNextActor steps to button+1 first
    this.processNextAction();
  }

  everyoneMatched() {
    const live = this.seats.filter(s => !s.folded);
    return live.every(s => s.contributed === this.currentBet || s.allIn);
  }

  async dealCommunity(n) {
    for (let i = 0; i < n; i++) {
      const idx = this.communityData.length;
      const cardData = this.deck.pop();
      this.communityData.push(cardData);
      const card = new Card(this, cardData.suit, cardData.rank, DECK_X, DECK_Y);
      this.community.push(card);
      await card.arcTo(COMMUNITY_X[idx], COMMUNITY_Y, 260, 22, 30);
      await card.flip(200);
    }
  }

  // ============================================================
  // RESOLUTION
  // ============================================================
  awardUncontested(seat) {
    this.state = 'RESOLVING';
    this.hidePlayerButtons();
    this.settlePot([seat]);
    const who = seat.isBot ? seat.name : 'YOU';
    this.flashResult(`${who} take${seat.isBot ? 's' : ''} the pot\n(everyone folded)`,
      seat.isBot ? '#c24f2a' : '#e8c547');
    this.endHand(this.playerNetThisHand([seat]));
  }

  async showdown() {
    this.state = 'RESOLVING';
    this.hidePlayerButtons();

    // Reveal bot holes
    for (const seat of this.seats) {
      if (seat.isBot && !seat.folded) {
        for (const c of seat.hole) await c.flip(180);
      }
    }

    // Evaluate each live seat's best 5 of 7
    const live = this.seats.filter(s => !s.folded);
    for (const seat of live) {
      seat.eval = evalBestOfSeven([...seat.holeData, ...this.communityData]);
    }
    // Best score wins; ties split
    let best = null;
    for (const seat of live) {
      if (!best || seat.eval.score > best.score) best = seat.eval;
    }
    const winners = live.filter(s => s.eval.score === best.score);

    this.settlePot(winners);

    const names = winners.map(w => (w.isBot ? w.name : 'YOU')).join(' & ');
    const handName = best.name;
    const playerWon = winners.some(w => !w.isBot);
    this.flashResult(`${names} win\n${handName}`, playerWon ? '#e8c547' : '#c24f2a');

    const playerNet = this.playerNetThisHand(winners);
    this.endHand(playerNet);
  }

  // Split the pot among winners; credit player via registry, bots notionally.
  settlePot(winners) {
    const share = Math.floor(this.pot / winners.length);
    let remainder = this.pot - share * winners.length;
    for (const w of winners) {
      let amt = share;
      if (remainder > 0) { amt += 1; remainder--; }  // odd chip to first winner
      w.wonThisHand = (w.wonThisHand || 0) + amt;
      if (w.isBot) {
        w.stack = w.stack - w.totalContributed + amt;
      }
    }
    // Losing bots lose their contribution
    for (const seat of this.seats) {
      if (seat.isBot && !winners.includes(seat)) {
        seat.stack -= seat.totalContributed;
      }
    }
  }

  playerNetThisHand(winners) {
    const player = this.seats[0];
    const won = winners.includes(player) ? (player.wonThisHand || 0) : 0;
    return won - player.totalContributed;
  }

  endHand(playerNet) {
    // Settle the player's chips against the registry
    const finalChips = this.playerStartChips + playerNet;
    this.registry.set('chips', Math.max(0, finalChips));

    const sign = playerNet >= 0 ? '+' : '';
    this.lastResultText.setText(`LAST: ${sign}${playerNet} chips`);
    this.lastResultText.setColor(playerNet > 0 ? '#c9a961' : playerNet < 0 ? '#c24f2a' : '#8b6f47');

    // Reset winner markers
    for (const seat of this.seats) seat.wonThisHand = 0;

    // Rotate the button for the next hand
    this.button = (this.button + 1) % 3;

    this.time.delayedCall(3200, () => {
      this.resultText.setAlpha(0);
      // Clear cards
      this.community.forEach(c => c.destroy());
      this.community = [];
      this.communityData = [];
      for (const seat of this.seats) {
        seat.hole.forEach(c => c.destroy());
        seat.hole = [];
        seat.holeData = [];
        seat.contributed = 0;
        seat.totalContributed = 0;
        seat.actionLabel = '';
        seat.folded = false;
      }
      this.pot = 0;
      this.currentBet = 0;
      this.updateSeatInfo();
      this.updatePotDisplay();
      this.state = 'IDLE';
      this.refreshUIForState();
    });
  }

  flashResult(text, color) {
    this.resultText.setText(text);
    this.resultText.setColor(color);
    this.resultText.setShadow(0, 0, color, 14, true);
    this.resultText.setScale(1.15);
    this.resultText.setAlpha(0);
    this.tweens.add({
      targets: this.resultText, alpha: 1, scaleX: 1, scaleY: 1,
      duration: 350, ease: 'Sine.easeOut'
    });
    if (color === '#e8c547' && SFX.slotWinTier) SFX.slotWinTier(5);
  }

  // ============================================================
  // HUD + BACK
  // ============================================================
  createHUD() {
    const chips = this.registry.get('chips');
    const marrow = this.registry.get('marrow');
    this.chipText = this.add.text(1250, 24, `chips: ${chips}`, {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(1, 0);
    this.marrowText = this.add.text(1250, 44, `marrow: ${marrow}`, {
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
      if (this.state === 'BETTING' || this.state === 'DEALING' || this.state === 'RESOLVING') return;
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Poker'));
    });
  }
}
