class Blackjack extends Phaser.Scene {
  constructor() {
    super('Blackjack');

    this.betOptions = [1, 5, 10, 25];
    this.currentBet = 5;

    // Deck sits ON the table upper-right — like a real dealer's shoe.
    this.DECK_X = 920;
    this.DECK_Y = 180;

    // Hand row anchors
    this.DEALER_Y = 210;
    this.PLAYER_Y = 520;

    // Fan geometry
    this.FAN_CENTER_X = 640;
    this.FAN_STEP = 46;
    this.FAN_ROT_PER_CARD = 0.045;
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(600, 10, 6, 5);

    // Reset instance state (constructor doesn't fire on scene restart)
    this.state = 'BETTING';
    this.deck = Deck.shuffle(Deck.build());
    this.playerHand = [];
    this.dealerHand = [];
    this.playerData = [];
    this.dealerData = [];
    this.doubledDown = false;
    this.firstDecision = true;
    this.insuranceBet = 0;
    this.surrendered = false;

    this.createEnvironment();
    this.createLayout();
    this.createUI();
    this.showBettingUI();
  }

  // ---------- the room (Buckshot Roulette vibe) ----------

  createEnvironment() {
    const W = 1280, H = 720;

    // Wall base
    const wall = this.add.graphics();
    wall.fillStyle(0x0a0605, 1);
    wall.fillRect(0, 0, W, H);

    // Crimson stains — old, dried, hinted not shouted
    for (let i = 0; i < 55; i++) {
      wall.fillStyle(0x3d0808, 0.16 + Math.random() * 0.14);
      wall.fillCircle(Math.random() * W, Math.random() * H, 3 + Math.random() * 9);
    }
    // Warm amber specks — dust catching lamp light
    for (let i = 0; i < 90; i++) {
      wall.fillStyle(0xc9a961, 0.03 + Math.random() * 0.04);
      wall.fillCircle(Math.random() * W, Math.random() * H, 1 + Math.random() * 2);
    }

    // Overhead beam
    const beam = this.add.graphics();
    beam.fillStyle(0x1a0d08, 1);
    beam.fillRect(0, 0, W, 22);
    beam.lineStyle(1, 0xc9a961, 0.3);
    beam.lineBetween(0, 22, W, 22);
    beam.fillStyle(0xc9a961, 0.5);
    for (let bx = 40; bx < W; bx += 80) beam.fillCircle(bx, 11, 1.5);

    // Lamp cone over the table
    const cone = this.add.graphics();
    cone.fillStyle(0xc9a961, 0.05);
    cone.fillTriangle(640, 22, 300, H, 980, H);

    // Lamp housing + cable
    const lamp = this.add.graphics();
    lamp.lineStyle(1, 0x0a0403, 1);
    lamp.lineBetween(640, 22, 640, 70);
    lamp.fillStyle(0x1a0d08, 1);
    lamp.fillRect(620, 68, 40, 12);
    lamp.lineStyle(1, 0xc9a961, 0.4);
    lamp.strokeRect(620, 68, 40, 12);
    lamp.fillStyle(0xc9a961, 0.35);
    lamp.fillRect(622, 78, 36, 2);

    // Extra ceiling wires
    const wires = this.add.graphics();
    wires.lineStyle(1, 0x0a0403, 1);
    wires.lineBetween(1140, 22, 1140, 115);
    wires.lineBetween(1200, 22, 1200, 88);
    wires.lineBetween(1070, 22, 1070, 60);

    // Right shelf — CRT monitor silhouette
    const shelfR = this.add.graphics();
    shelfR.fillStyle(0x1a0d08, 1);
    shelfR.fillRect(1050, 500, 230, 8);
    shelfR.fillStyle(0x0a0403, 1);
    shelfR.fillRect(1085, 410, 135, 90);
    shelfR.lineStyle(1, 0x3d2817, 0.8);
    shelfR.strokeRect(1085, 410, 135, 90);
    shelfR.fillStyle(0xc9a961, 0.09);
    shelfR.fillRect(1097, 422, 111, 66);
    for (let sy = 424; sy < 488; sy += 3) {
      shelfR.fillStyle(0x000000, 0.25);
      shelfR.fillRect(1097, sy, 111, 1);
    }
    shelfR.fillStyle(0xc9a961, 0.9);
    shelfR.fillCircle(1212, 497, 2);

    // Right shelf — speaker
    const boxR = this.add.graphics();
    boxR.fillStyle(0x0a0403, 1);
    boxR.fillRect(1055, 585, 62, 80);
    boxR.lineStyle(1, 0x3d2817, 0.6);
    boxR.strokeRect(1055, 585, 62, 80);
    boxR.fillStyle(0x1a0d08, 1);
    boxR.fillCircle(1086, 613, 14);
    boxR.fillCircle(1086, 645, 8);
    boxR.lineStyle(1, 0x2a1810, 0.8);
    boxR.strokeCircle(1086, 613, 14);
    boxR.strokeCircle(1086, 645, 8);

    // Stack of books
    const papersR = this.add.graphics();
    papersR.fillStyle(0x2a1810, 1);
    papersR.fillRect(1150, 592, 55, 10);
    papersR.fillStyle(0x3d2817, 1);
    papersR.fillRect(1155, 582, 45, 10);
    papersR.fillStyle(0x2a1810, 1);
    papersR.fillRect(1158, 572, 40, 10);

    // THE TABLE
    const tx = 300, ty = 120, tw = 680, th = 500;
    const table = this.add.graphics();
    table.fillStyle(0x3d2817, 1);
    table.fillRoundedRect(tx, ty, tw, th, 14);
    table.fillStyle(0x1a0a0a, 1);
    table.fillRoundedRect(tx + 10, ty + 10, tw - 20, th - 20, 10);
    for (let i = 0; i < 140; i++) {
      table.fillStyle(0x0a0403, 0.5);
      table.fillCircle(
        tx + 14 + Math.random() * (tw - 28),
        ty + 14 + Math.random() * (th - 28),
        1
      );
    }
    for (let i = 0; i < 40; i++) {
      table.fillStyle(0xc9a961, 0.06);
      table.fillCircle(
        tx + 14 + Math.random() * (tw - 28),
        ty + 14 + Math.random() * (th - 28),
        1
      );
    }
    table.lineStyle(1, 0xc9a961, 0.45);
    table.strokeRoundedRect(tx + 6, ty + 6, tw - 12, th - 12, 12);

    // Center dashed divider
    const midY = ty + th / 2;
    table.lineStyle(1, 0xc9a961, 0.25);
    for (let dx = tx + 40; dx < tx + tw - 40; dx += 16) {
      table.lineBetween(dx, midY, dx + 8, midY);
    }

    // Dealer & player arcs
    table.lineStyle(1, 0xc9a961, 0.1);
    table.strokeCircle(tx + tw / 2, ty + 140, 210);
    table.strokeCircle(tx + tw / 2, ty + th - 140, 210);

    // Sigil
    this.add.text(tx + tw / 2, ty + 42, '\u2756', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#c9a961'
    }).setOrigin(0.5).setAlpha(0.5);

    // Sidebar booth
    const sidebar = this.add.graphics();
    sidebar.fillStyle(0x0a0605, 0.95);
    sidebar.fillRect(0, 0, 280, H);
    sidebar.lineStyle(2, 0x2a1810, 1);
    sidebar.lineBetween(280, 0, 280, H);
    sidebar.lineStyle(1, 0xc9a961, 0.2);
    sidebar.lineBetween(278, 30, 278, H - 30);

    // Visible deck
    this.renderDeckStack();

    // Dust
    if (!this.textures.exists('dust')) {
      const gfx = this.make.graphics({ add: false });
      gfx.fillStyle(0xc9a961, 1);
      gfx.fillCircle(2, 2, 2);
      gfx.generateTexture('dust', 4, 4);
      gfx.destroy();
    }
    this.add.particles(0, 0, 'dust', {
      x: { min: 320, max: 960 },
      y: H + 10,
      quantity: 1,
      frequency: 1400,
      lifespan: 9000,
      alpha: { start: 0.09, end: 0 },
      scale: { min: 0.3, max: 0.7 },
      speedY: { min: -12, max: -5 },
      blendMode: 'ADD'
    });
  }

  renderDeckStack() {
    const deckG = this.add.graphics();
    [[-4, -3], [-2, -1], [0, 0]].forEach(([dx, dy]) => {
      const x = this.DECK_X + dx;
      const y = this.DECK_Y + dy;
      deckG.fillStyle(0x2a1810, 1);
      deckG.fillRoundedRect(x - 33, y - 46, 66, 92, 6);
      deckG.lineStyle(1, 0xc9a961, 0.5);
      deckG.strokeRoundedRect(x - 33, y - 46, 66, 92, 6);
    });
    const eye = this.add.graphics();
    eye.fillStyle(0xc9a961, 0.5);
    eye.fillCircle(this.DECK_X, this.DECK_Y, 6);
    eye.fillStyle(0x2a1810, 1);
    eye.fillCircle(this.DECK_X, this.DECK_Y, 3);
  }

  // ---------- labels, value readouts, result banner ----------

  createLayout() {
    this.add.text(640, 82, 'M I S S   F O R T U N E', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#6a5030'
    }).setOrigin(0.5);

    this.dealerValueText = this.add.text(640, 305, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#c9a961'
    }).setOrigin(0.5);

    this.playerValueText = this.add.text(640, 435, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#c9a961'
    }).setOrigin(0.5);

    this.add.text(640, 640, 'P L A Y E R', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#6a5030'
    }).setOrigin(0.5);

    this.resultText = this.add.text(640, 370, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '34px',
      fontStyle: 'bold',
      color: '#c9a961'
    }).setOrigin(0.5).setAlpha(0).setDepth(20);
  }

  // ---------- side UI ----------

  createUI() {
    // Back to parlor
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

    // Chip counter
    this.chipText = this.add.text(30, 78, '', {
      fontFamily: '"Courier New", monospace', fontSize: '22px', color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    });
    this.updateChipDisplay();

    // Last result
    this.lastResultText = this.add.text(30, 114, 'LAST: \u2014', {
      fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#8b6f47'
    });

    // BET label
    this.add.text(30, 170, '\u2500\u2500\u2500 BET \u2500\u2500\u2500', {
      fontFamily: '"Courier New", monospace', fontSize: '14px', color: '#6a5030'
    });

    // Bet buttons 2x2
    this.betButtons = [];
    this.betOptions.forEach((amt, i) => {
      const bx = 78 + (i % 2) * 110;
      const by = 215 + Math.floor(i / 2) * 52;
      const rect = this.add.rectangle(bx, by, 95, 40);
      const lbl = this.add.text(bx, by, `${amt}`, {
        fontFamily: '"Courier New", monospace', fontSize: '18px', fontStyle: 'bold'
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        if (this.state !== 'BETTING') return;
        this.currentBet = amt;
        this.updateBetButtons();
      });
      this.betButtons.push({ rect, lbl, amt });
    });
    this.updateBetButtons();

    // Action buttons
    // Row 1 — always-legal moves
    this.dealBtn  = this.makeActionBtn(140, 360, 220, 52, 'DEAL',  () => this.dealHand());
    this.hitBtn   = this.makeActionBtn( 85, 360, 100, 44, 'HIT',   () => this.playerHit());
    this.standBtn = this.makeActionBtn(195, 360, 100, 44, 'STAND', () => this.playerStand());
    // Row 2 — first-decision-only moves
    this.doubleBtn    = this.makeActionBtn(140, 412, 220, 44, 'DOUBLE',    () => this.playerDouble());
    this.surrenderBtn = this.makeActionBtn(140, 464, 220, 40, 'SURRENDER', () => this.playerSurrender(),
      { color: '#8b6f47', border: 0x6a5030, hoverColor: '#c9a961', hoverBorder: 0xc9a961, fontSize: '17px' });
  }

  makeActionBtn(x, y, w, h, label, handler, style = {}) {
    const color       = style.color       || '#c9a961';
    const border      = style.border      !== undefined ? style.border : 0xc9a961;
    const hoverColor  = style.hoverColor  || '#e8c547';
    const hoverBorder = style.hoverBorder !== undefined ? style.hoverBorder : 0xe8c547;
    const fontSize    = style.fontSize    || '20px';

    const rect = this.add.rectangle(x, y, w, h);
    rect.setStrokeStyle(2, border);
    rect.setFillStyle(border, 0.06);
    const text = this.add.text(x, y, label, {
      fontFamily: '"Courier New", monospace',
      fontSize,
      fontStyle: 'bold',
      color,
      shadow: { offsetX: 0, offsetY: 0, color, blur: 8, fill: true }
    }).setOrigin(0.5);
    rect.setInteractive({ useHandCursor: true });
    rect.on('pointerover', () => {
      if (!rect.visible) return;
      rect.setStrokeStyle(3, hoverBorder);
      text.setColor(hoverColor);
    });
    rect.on('pointerout', () => {
      rect.setStrokeStyle(2, border);
      text.setColor(color);
    });
    rect.on('pointerdown', () => {
      if (!rect.visible) return;
      handler();
    });
    const setVisible = (v) => { rect.setVisible(v); text.setVisible(v); };
    setVisible(false);
    return { rect, text, setVisible };
  }

  showBettingUI() {
    this.dealBtn.setVisible(true);
    this.hitBtn.setVisible(false);
    this.standBtn.setVisible(false);
    this.doubleBtn.setVisible(false);
    this.surrenderBtn.setVisible(false);
  }

  showPlayerTurnUI(firstDecision) {
    this.dealBtn.setVisible(false);
    this.hitBtn.setVisible(true);
    this.standBtn.setVisible(true);
    const canDouble = firstDecision && this.registry.get('chips') >= this.currentBet;
    this.doubleBtn.setVisible(canDouble);
    this.surrenderBtn.setVisible(firstDecision);
  }

  hideAllActions() {
    this.dealBtn.setVisible(false);
    this.hitBtn.setVisible(false);
    this.standBtn.setVisible(false);
    this.doubleBtn.setVisible(false);
    this.surrenderBtn.setVisible(false);
  }

  updateBetButtons() {
    this.betButtons.forEach(({ rect, lbl, amt }) => {
      const sel = amt === this.currentBet;
      rect.setStrokeStyle(sel ? 2 : 1, sel ? 0xc9a961 : 0x3d2817);
      rect.setFillStyle(0xc9a961, sel ? 0.08 : 0);
      lbl.setColor(sel ? '#c9a961' : '#6a5030');
    });
  }

  updateChipDisplay() {
    this.chipText.setText(`CHIPS: ${this.registry.get('chips')}`);
  }

  // ---------- fan geometry ----------

  fanPosition(who, index, total) {
    const y = who === 'player' ? this.PLAYER_Y : this.DEALER_Y;
    const mid = (total - 1) / 2;
    const x = this.FAN_CENTER_X + (index - mid) * this.FAN_STEP;
    const rot = (index - mid) * this.FAN_ROT_PER_CARD;
    return { x, y, rot };
  }

  isTenValue(card) {
    return card.rank === '10' || card.rank === 'J' || card.rank === 'Q' || card.rank === 'K';
  }

  isDealerBJ() {
    return handValue(this.dealerData).isBlackjack;
  }

  async revealAndResolve(delay = 500) {
    await this.dealerHand[1].flip();
    this.updateDealerValue(false);
    this.time.delayedCall(delay, () => this.resolveHand());
  }

  // ---------- dealing ----------

  async dealHand() {
    if (this.registry.get('chips') < this.currentBet) return;

    this.state = 'DEALING';
    this.hideAllActions();
    this.resultText.setAlpha(0);

    // Clear old hand
    this.playerHand.forEach(c => c.destroy());
    this.dealerHand.forEach(c => c.destroy());
    this.playerHand = [];
    this.dealerHand = [];
    this.playerData = [];
    this.dealerData = [];
    this.doubledDown = false;
    this.firstDecision = true;
    this.insuranceBet = 0;
    this.surrendered = false;
    this.playerValueText.setText('');
    this.dealerValueText.setText('');

    // Take the bet
    this.registry.set('chips', this.registry.get('chips') - this.currentBet);
    this.updateChipDisplay();

    // Reshuffle if deck thin
    if (this.deck.length < 15) this.deck = Deck.shuffle(Deck.build());

    // Deal
    await this.dealTo('player', true, 0);
    await this.dealTo('dealer', true, 60);
    await this.dealTo('player', true, 60);
    await this.dealTo('dealer', false, 60);

    this.updatePlayerValue();
    this.updateDealerValue(true);

    const pv = handValue(this.playerData);
    const upcard = this.dealerData[0];
    const half = Math.floor(this.currentBet / 2);

    // Player natural BJ — auto-resolve (covers both push & BJ win)
    if (pv.isBlackjack) {
      await this.revealAndResolve();
      return;
    }

    // Dealer Ace up + affordable → offer insurance
    if (upcard.rank === 'A' && half > 0 && this.registry.get('chips') >= half) {
      this.state = 'INSURANCE_OFFER';
      this.showInsuranceUI(half);
      return;
    }

    // Silent dealer peek on Ace (couldn't afford insurance) or 10-value up
    if (upcard.rank === 'A' || this.isTenValue(upcard)) {
      if (this.isDealerBJ()) {
        await this.revealAndResolve();
        return;
      }
    }

    this.state = 'PLAYER_TURN';
    this.showPlayerTurnUI(true);
  }

  async dealTo(who, faceUp, delay) {
    const cardData = this.deck.pop();
    const handArr = who === 'player' ? this.playerHand : this.dealerHand;
    const dataArr = who === 'player' ? this.playerData : this.dealerData;

    const newIndex = handArr.length;
    const newTotal = newIndex + 1;

    dataArr.push(cardData);
    const card = new Card(this, cardData.suit, cardData.rank, this.DECK_X, this.DECK_Y);
    handArr.push(card);

    for (let i = 0; i < newIndex; i++) {
      const p = this.fanPosition(who, i, newTotal);
      this.tweens.add({
        targets: handArr[i].container,
        x: p.x, y: p.y,
        rotation: p.rot,
        duration: 240,
        ease: 'Sine.easeOut'
      });
    }

    const target = this.fanPosition(who, newIndex, newTotal);
    await card.arcTo(target.x, target.y, 420, 28, delay);
    this.tweens.add({
      targets: card.container,
      rotation: target.rot,
      duration: 160,
      ease: 'Sine.easeOut'
    });
    await card.landPop();
    if (faceUp) await card.flip(260);
  }

  // ---------- insurance ----------

  showInsuranceUI(half) {
    this.insuranceObjects = [];

    // Dim strip over the divider — the moment pauses
    const backdrop = this.add.rectangle(640, 400, 680, 170, 0x000000, 0.65).setDepth(14);
    this.insuranceObjects.push(backdrop);

    // Prompt — Miss Fortune dares you
    const prompt = this.add.text(640, 340, 'DEALER SHOWS AN ACE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#c24f2a',
      shadow: { offsetX: 0, offsetY: 0, color: '#c24f2a', blur: 10, fill: true }
    }).setOrigin(0.5).setDepth(15);
    this.insuranceObjects.push(prompt);

    const sub = this.add.text(640, 368, 'insurance? \u2014 half your bet. pays 2:1 if she has it.', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#8b6f47',
      fontStyle: 'italic'
    }).setOrigin(0.5).setDepth(15);
    this.insuranceObjects.push(sub);

    // TAKE — the tempting button. Pulses.
    const takeRect = this.add.rectangle(560, 420, 160, 48).setDepth(15);
    takeRect.setStrokeStyle(2, 0xc9a961);
    takeRect.setFillStyle(0xc9a961, 0.1);
    const takeText = this.add.text(560, 420, `TAKE (${half})`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 12, fill: true }
    }).setOrigin(0.5).setDepth(16);
    takeRect.setInteractive({ useHandCursor: true });
    takeRect.on('pointerover', () => {
      takeRect.setStrokeStyle(3, 0xe8c547);
      takeText.setColor('#e8c547');
    });
    takeRect.on('pointerout', () => {
      takeRect.setStrokeStyle(2, 0xc9a961);
      takeText.setColor('#c9a961');
    });
    takeRect.on('pointerdown', () => {
      if (this.state !== 'INSURANCE_OFFER') return;
      this.takeInsurance(half);
    });
    this.insuranceObjects.push(takeRect, takeText);

    // Pulsing "come on, take it" animation
    this.insurancePulse = this.tweens.add({
      targets: [takeRect, takeText],
      alpha: { from: 1, to: 0.68 },
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // DECLINE — dim & small, the sensible choice
    const declineRect = this.add.rectangle(720, 420, 140, 40).setDepth(15);
    declineRect.setStrokeStyle(1, 0x3d2817);
    declineRect.setFillStyle(0xc9a961, 0);
    const declineText = this.add.text(720, 420, 'DECLINE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '14px',
      color: '#6a5030'
    }).setOrigin(0.5).setDepth(16);
    declineRect.setInteractive({ useHandCursor: true });
    declineRect.on('pointerover', () => {
      declineRect.setStrokeStyle(2, 0x6a5030);
      declineText.setColor('#8b6f47');
    });
    declineRect.on('pointerout', () => {
      declineRect.setStrokeStyle(1, 0x3d2817);
      declineText.setColor('#6a5030');
    });
    declineRect.on('pointerdown', () => {
      if (this.state !== 'INSURANCE_OFFER') return;
      this.declineInsurance();
    });
    this.insuranceObjects.push(declineRect, declineText);
  }

  hideInsuranceUI() {
    if (this.insurancePulse) {
      this.insurancePulse.stop();
      this.insurancePulse = null;
    }
    if (this.insuranceObjects) {
      this.insuranceObjects.forEach(o => o.destroy());
      this.insuranceObjects = null;
    }
  }

  takeInsurance(amt) {
    this.insuranceBet = amt;
    this.registry.set('chips', this.registry.get('chips') - amt);
    this.updateChipDisplay();
    this.hideInsuranceUI();
    this.afterInsurance();
  }

  declineInsurance() {
    this.insuranceBet = 0;
    this.hideInsuranceUI();
    this.afterInsurance();
  }

  async afterInsurance() {
    // Dealer peeks. If BJ, pay insurance and resolve main hand.
    if (this.isDealerBJ()) {
      if (this.insuranceBet > 0) {
        const payout = this.insuranceBet * 3; // 2:1 win + stake back
        this.registry.set('chips', this.registry.get('chips') + payout);
        this.updateChipDisplay();
        this.flashPayout(`INSURANCE +${this.insuranceBet * 2}`, '#c9a961');
      }
      await this.revealAndResolve(700);
      return;
    }
    // No dealer BJ. Insurance is lost if taken; otherwise nothing to flash.
    const hadInsurance = this.insuranceBet > 0;
    if (hadInsurance) {
      this.flashPayout(`INSURANCE LOST \u2014${this.insuranceBet}`, '#c24f2a');
      this.insuranceBet = 0;
    }
    this.time.delayedCall(hadInsurance ? 900 : 150, () => {
      this.state = 'PLAYER_TURN';
      this.showPlayerTurnUI(true);
    });
  }

  // ---------- value displays ----------

  updatePlayerValue() {
    const v = handValue(this.playerData);
    let t = `${v.value}`;
    if (v.isSoft && !v.isBlackjack) t = `SOFT ${v.value}`;
    if (v.isBlackjack) t = 'BLACKJACK';
    if (v.isBust) t = `BUST \u2014 ${v.value}`;
    this.playerValueText.setText(t);
    this.playerValueText.setColor(
      v.isBust ? '#c24f2a' : v.isBlackjack ? '#ff6b35' : '#c9a961'
    );
  }

  updateDealerValue(hiddenHole) {
    if (hiddenHole && this.dealerData.length >= 1) {
      const showing = handValue([this.dealerData[0]]);
      this.dealerValueText.setText(`SHOWING ${showing.value}`);
      this.dealerValueText.setColor('#c9a961');
      return;
    }
    const v = handValue(this.dealerData);
    let t = `${v.value}`;
    if (v.isBlackjack) t = 'BLACKJACK';
    if (v.isBust) t = `BUST \u2014 ${v.value}`;
    this.dealerValueText.setText(t);
    this.dealerValueText.setColor(
      v.isBust ? '#c9a961' : v.isBlackjack ? '#c24f2a' : '#c9a961'
    );
  }

  // ---------- player actions ----------

  async playerHit() {
    if (this.state !== 'PLAYER_TURN') return;
    this.firstDecision = false;
    this.hideAllActions();

    await this.dealTo('player', true, 0);
    this.updatePlayerValue();
    const v = handValue(this.playerData);

    if (v.isBust) {
      this.state = 'RESOLVING';
      this.time.delayedCall(600, () => this.resolveHand());
    } else if (v.value === 21) {
      await this.playerStand();
    } else {
      this.state = 'PLAYER_TURN';
      this.showPlayerTurnUI(false);
    }
  }

  async playerStand() {
    if (this.state !== 'PLAYER_TURN' && this.state !== 'DEALING') return;
    this.state = 'DEALER_TURN';
    this.hideAllActions();
    await this.dealerPlay();
  }

  async playerDouble() {
    if (this.state !== 'PLAYER_TURN' || !this.firstDecision) return;
    if (this.registry.get('chips') < this.currentBet) return;

    this.firstDecision = false;
    this.registry.set('chips', this.registry.get('chips') - this.currentBet);
    this.updateChipDisplay();
    this.doubledDown = true;
    this.hideAllActions();

    await this.dealTo('player', true, 0);
    this.updatePlayerValue();
    const v = handValue(this.playerData);

    if (v.isBust) {
      this.state = 'RESOLVING';
      this.time.delayedCall(600, () => this.resolveHand());
    } else {
      this.state = 'PLAYER_TURN';
      await this.playerStand();
    }
  }

  async playerSurrender() {
    if (this.state !== 'PLAYER_TURN' || !this.firstDecision) return;
    this.state = 'RESOLVING';
    this.surrendered = true;
    this.hideAllActions();

    // Half the stake comes back
    const halfBack = Math.floor(this.currentBet / 2);
    this.registry.set('chips', this.registry.get('chips') + halfBack);
    this.updateChipDisplay();

    // Reveal hole card quietly for closure, then banner
    await this.dealerHand[1].flip();
    this.updateDealerValue(false);
    this.time.delayedCall(300, () => this.resolveHand());
  }

  // ---------- dealer ----------

  async dealerPlay() {
    await this.dealerHand[1].flip();
    this.updateDealerValue(false);
    await this.wait(500);

    while (handValue(this.dealerData).value < 17) {
      await this.dealTo('dealer', true, 0);
      this.updateDealerValue(false);
      await this.wait(550);
    }

    this.state = 'RESOLVING';
    this.time.delayedCall(400, () => this.resolveHand());
  }

  wait(ms) {
    return new Promise(r => this.time.delayedCall(ms, r));
  }

  // ---------- flashes (payout / dealer reaction) ----------

  flashPayout(text, color = '#e8c547') {
    const flash = this.add.text(640, 330, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: '26px',
      fontStyle: 'bold',
      color,
      shadow: { offsetX: 0, offsetY: 0, color, blur: 16, fill: true }
    }).setOrigin(0.5).setAlpha(0).setDepth(21);

    this.tweens.add({
      targets: flash,
      alpha: 1,
      y: 315,
      duration: 280,
      ease: 'Sine.easeOut'
    });
    this.tweens.add({
      targets: flash,
      alpha: 0,
      y: 290,
      duration: 650,
      delay: 1400,
      ease: 'Sine.easeIn',
      onComplete: () => flash.destroy()
    });
  }

  flashDealerReaction(text) {
    const r = this.add.text(640, 100, text, {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px',
      color: '#c24f2a',
      fontStyle: 'italic',
      shadow: { offsetX: 0, offsetY: 0, color: '#c24f2a', blur: 6, fill: true }
    }).setOrigin(0.5).setAlpha(0).setDepth(21);

    this.tweens.add({
      targets: r,
      alpha: 0.85,
      duration: 280,
      yoyo: true,
      hold: 1200,
      onComplete: () => r.destroy()
    });
  }

  // ---------- resolution ----------

  resolveHand() {
    // Surrender is its own resolution path
    if (this.surrendered) {
      const halfBack = Math.floor(this.currentBet / 2);
      const net = halfBack - this.currentBet;
      this.resultText.setText('SURRENDER \u2014 HALF BACK');
      this.resultText.setColor('#8b6f47');
      this.resultText.setShadow(0, 0, '#8b6f47', 12, true);
      this.resultText.setScale(1.15);
      this.resultText.setAlpha(0);
      this.tweens.add({
        targets: this.resultText,
        alpha: 1, scaleX: 1, scaleY: 1,
        duration: 350, ease: 'Sine.easeOut'
      });
      this.lastResultText.setText(`LAST: SURRENDER / ${net}`);
      this.lastResultText.setColor('#8b6f47');
      this.fadeBannerAndReset(2000);
      return;
    }

    const pv = handValue(this.playerData);
    const dv = handValue(this.dealerData);
    const staked = this.currentBet * (this.doubledDown ? 2 : 1);

    let result, payout, color, banner, shake = 0;
    let flashWin = null;       // amount to flash in gold (naturals only)
    let dealerReaction = null;

    if (pv.isBust) {
      result = 'BUST'; payout = 0; color = '#c24f2a';
      banner = `BUST \u2014 ${pv.value}`;
    } else if (pv.isBlackjack && !dv.isBlackjack) {
      // NATURAL — 3:2 payout, bigger reaction
      result = 'BLACKJACK';
      payout = Math.round(staked * 2.5);
      color = '#ff6b35';
      banner = 'BLACKJACK \u2014 3:2';
      shake = 0.02;
      flashWin = payout - staked;      // profit in gold
      dealerReaction = 'miss fortune looks away';
    } else if (dv.isBlackjack && !pv.isBlackjack) {
      result = 'DEALER BJ'; payout = 0; color = '#c24f2a';
      banner = 'DEALER BLACKJACK';
    } else if (pv.isBlackjack && dv.isBlackjack) {
      // Both naturals → push (bet returned)
      result = 'PUSH'; payout = staked; color = '#8b6f47';
      banner = 'PUSH \u2014 BOTH 21';
    } else if (dv.isBust) {
      result = 'DEALER BUST'; payout = staked * 2; color = '#c9a961';
      banner = `DEALER BUSTS \u2014 ${dv.value}`;
    } else if (pv.value > dv.value) {
      // Regular win — 1:1 (stake back + 1x winnings)
      result = 'WIN'; payout = staked * 2; color = '#c9a961';
      banner = `${pv.value} vs ${dv.value}`;
    } else if (pv.value < dv.value) {
      result = 'LOSS'; payout = 0; color = '#c24f2a';
      if (pv.value >= 18 && dv.value - pv.value === 1) {
        banner = `${pv.value} VS ${dv.value} \u2014 BY ONE`;
      } else {
        banner = `${pv.value} vs ${dv.value}`;
      }
    } else {
      // Push — stake returned, muted amber
      result = 'PUSH'; payout = staked; color = '#8b6f47';
      banner = `PUSH \u2014 ${pv.value}`;
    }

    this.registry.set('chips', this.registry.get('chips') + payout);
    this.updateChipDisplay();

    this.resultText.setText(banner);
    this.resultText.setColor(color);
    this.resultText.setShadow(0, 0, color, 14, true);
    this.resultText.setScale(1.2);
    this.resultText.setAlpha(0);
    this.tweens.add({
      targets: this.resultText,
      alpha: 1, scaleX: 1, scaleY: 1,
      duration: 350, ease: 'Sine.easeOut'
    });

    if (shake) this.cameras.main.shake(300, shake);

    // Naturals get the gold payout flash + dealer reaction
    if (flashWin !== null && flashWin > 0) {
      this.time.delayedCall(350, () => this.flashPayout(`+${flashWin}`, '#e8c547'));
    }
    if (dealerReaction) {
      this.time.delayedCall(700, () => this.flashDealerReaction(dealerReaction));
    }

    const net = payout - staked;
    const sign = net > 0 ? '+' : '';
    this.lastResultText.setText(`LAST: ${result} / ${sign}${net}`);
    this.lastResultText.setColor(
      net > 0 ? '#c9a961' : net < 0 ? '#c24f2a' : '#8b6f47'
    );

    this.fadeBannerAndReset(2400);
  }

  fadeBannerAndReset(holdMs) {
    this.time.delayedCall(holdMs, () => {
      this.tweens.add({
        targets: this.resultText,
        alpha: 0,
        duration: 400,
        onComplete: () => {
          this.state = 'BETTING';
          this.showBettingUI();
        }
      });
    });
  }
}
