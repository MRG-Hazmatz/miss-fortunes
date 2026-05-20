// cards.js — shared card rendering + helpers.
// Card is a Phaser Container with a face side and a back side, flippable and
// movable. Deck is a simple 52-card data array with shuffle. handValue is
// Blackjack-specific scoring (ace = 11 or 1, face cards = 10).
// This module is reused across Blackjack and (later) Video Poker.

const CARD_W = 66;
const CARD_H = 92;
const CARD_RADIUS = 6;

const SUITS = [
  { sym: '\u2660', name: 'spades',   color: '#c9a961' }, // ♠
  { sym: '\u2663', name: 'clubs',    color: '#c9a961' }, // ♣
  { sym: '\u2665', name: 'hearts',   color: '#c24f2a' }, // ♥
  { sym: '\u2666', name: 'diamonds', color: '#c24f2a' }  // ♦
];

const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

class Card {
  constructor(scene, suit, rank, x, y) {
    this.scene = scene;
    this.suit = suit;  // SUITS entry
    this.rank = rank;  // string
    this.faceUp = false;

    this.container = scene.add.container(x, y);

    this.back = this._buildBack();
    this.face = this._buildFace();
    this.face.setVisible(false);

    this.container.add([this.back, this.face]);
  }

  _buildBack() {
    const gfx = this.scene.add.graphics();
    // Dark fill, brass border, double-frame, small center eye
    gfx.fillStyle(0x2a1810, 1);
    gfx.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    gfx.lineStyle(1, 0xc9a961, 0.7);
    gfx.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    gfx.lineStyle(1, 0xc9a961, 0.25);
    gfx.strokeRoundedRect(-CARD_W / 2 + 5, -CARD_H / 2 + 5, CARD_W - 10, CARD_H - 10, CARD_RADIUS - 2);
    // Center brass eye
    gfx.fillStyle(0xc9a961, 0.5);
    gfx.fillCircle(0, 0, 7);
    gfx.fillStyle(0x2a1810, 1);
    gfx.fillCircle(0, 0, 3);
    return gfx;
  }

  _buildFace() {
    const c = this.scene.add.container(0, 0);

    // Background with brass border
    const bg = this.scene.add.graphics();
    bg.fillStyle(0x1a0d08, 1);
    bg.fillRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    bg.lineStyle(1, 0xc9a961, 0.8);
    bg.strokeRoundedRect(-CARD_W / 2, -CARD_H / 2, CARD_W, CARD_H, CARD_RADIUS);
    c.add(bg);

    const labelStyle = {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: this.suit.color,
      align: 'center',
      lineSpacing: -3
    };

    // Top-left rank + suit
    const tl = this.scene.add.text(-CARD_W / 2 + 5, -CARD_H / 2 + 4, `${this.rank}\n${this.suit.sym}`, labelStyle);
    tl.setOrigin(0, 0);
    c.add(tl);

    // Large center suit symbol
    const center = this.scene.add.text(0, 2, this.suit.sym, {
      fontFamily: '"Courier New", monospace',
      fontSize: '34px',
      color: this.suit.color
    }).setOrigin(0.5);
    c.add(center);

    // Bottom-right rank + suit (rotated 180 for symmetry)
    const br = this.scene.add.text(CARD_W / 2 - 5, CARD_H / 2 - 4, `${this.rank}\n${this.suit.sym}`, labelStyle);
    br.setOrigin(1, 1);
    br.setRotation(Math.PI);
    c.add(br);

    return c;
  }

  // Flip from back to face. Returns a promise that resolves when animation ends.
  flip(duration = 300) {
    if (this.faceUp) return Promise.resolve();
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 0,
        duration: duration / 2,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.back.setVisible(false);
          this.face.setVisible(true);
          this.faceUp = true;
          this.scene.tweens.add({
            targets: this.container,
            scaleX: 1,
            duration: duration / 2,
            ease: 'Sine.easeOut',
            onComplete: resolve
          });
        }
      });
    });
  }

  moveTo(x, y, duration = 400, delay = 0) {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.container,
        x, y,
        duration,
        delay,
        ease: 'Cubic.easeOut',
        onComplete: resolve
      });
    });
  }

  // Curved deal path via quadratic Bezier. Card arcs up (peakDelta px above the
  // higher of start/end) then settles at the target. Feels like a hand tossing
  // the card — closer to Uno Mobile than a straight slide.
  arcTo(x, y, duration = 420, peakDelta = 32, delay = 0) {
    return new Promise(resolve => {
      const start = () => {
        const startX = this.container.x;
        const startY = this.container.y;
        const peakY = Math.min(startY, y) - peakDelta;
        this.scene.tweens.addCounter({
          from: 0,
          to: 1,
          duration,
          ease: 'Cubic.easeOut',
          onUpdate: (tween, counter) => {
            const t = counter.value;
            const mt = 1 - t;
            const px = mt * mt * startX + 2 * mt * t * ((startX + x) / 2) + t * t * x;
            const py = mt * mt * startY + 2 * mt * t * peakY + t * t * y;
            this.container.setPosition(px, py);
          },
          onComplete: resolve
        });
      };
      if (delay > 0) this.scene.time.delayedCall(delay, start);
      else start();
    });
  }

  // Quick scale pop on landing — sells the weight of the card hitting felt.
  landPop() {
    return new Promise(resolve => {
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 85,
        yoyo: true,
        ease: 'Sine.easeOut',
        onComplete: resolve
      });
    });
  }

  setPosition(x, y) {
    this.container.setPosition(x, y);
  }

  destroy() {
    if (this.container) {
      this.container.destroy();
      this.container = null;
    }
  }
}

// Build + shuffle helpers
const Deck = {
  build() {
    const cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        cards.push({ suit, rank });
      }
    }
    return cards;
  },

  shuffle(cards) {
    // Fisher-Yates
    for (let i = cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [cards[i], cards[j]] = [cards[j], cards[i]];
    }
    return cards;
  }
};

// Blackjack hand scoring. Cards array of {suit, rank}.
// Ace is 11 unless that would bust, then 1. Face cards are 10.
function handValue(cards) {
  let value = 0;
  let aces = 0;
  for (const c of cards) {
    if (c.rank === 'A') { aces++; value += 11; }
    else if (c.rank === 'J' || c.rank === 'Q' || c.rank === 'K') value += 10;
    else value += parseInt(c.rank, 10);
  }
  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }
  return {
    value,
    isSoft: aces > 0 && value <= 21,
    isBust: value > 21,
    isBlackjack: cards.length === 2 && value === 21
  };
}
