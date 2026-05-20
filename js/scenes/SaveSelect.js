import Phaser from 'phaser';
import { GameState } from '../state.js';

// SaveSelect.js — three-slot profile picker shown after Boot.
//
// Visual: warm-amber/parchment cards arranged horizontally (a row of three
// "old playing cards on a felt table"), matching the parlor's aesthetic.
// Each slot is either filled (shows name + chips + marrow + SELECT + ×) or
// empty (shows "empty" + CREATE).
//
// Flow:
//   - SELECT a filled slot     → hydrate registry from slot, fade to Parlor.
//   - CREATE on an empty slot  → name-input modal; ENTER confirms, fades to Parlor.
//   - × on a filled slot       → confirmation modal, then deletes.

export class SaveSelect extends Phaser.Scene {
  constructor() {
    super('SaveSelect');

    this.CARD_W = 280;
    this.CARD_H = 360;
    this.GAP    = 30;
    this.CY     = 400;

    // Tarnished gold + warm amber palette (no neon — this is parlor furniture).
    this.GOLD     = 0xa89050;
    this.GOLD_HEX = '#a89050';
    this.AMBER    = 0xc9a961;
    this.AMBER_HEX = '#c9a961';
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 8, 5, 5);

    // Reset transient state from a previous mount (Phaser scene instances persist).
    this.cards = [];
    this._modal = null;
    this._nameInput = '';
    this._cursorTween = null;
    this._activeKeyHandler = null;

    this.createBackground();
    this.createHeader();
    this.createCards();
    this.createBackHint();
  }

  // ============================================================
  //  BACKGROUND — same parlor backdrop hue, slightly more felt-like
  // ============================================================

  createBackground() {
    const bg = this.add.graphics();
    bg.fillStyle(0x0a0605, 1);
    bg.fillRect(0, 0, 1280, 720);

    // Wood grain — a few horizontal warm streaks
    bg.fillStyle(0x1a0f08, 0.4);
    for (let i = 0; i < 14; i++) {
      bg.fillRect(0, Math.random() * 720, 1280, 1 + Math.random() * 2);
    }

    // Soft amber lamp pool centered over the table
    const glow = this.add.graphics();
    glow.fillStyle(0xffc080, 0.05);
    glow.fillCircle(640, 400, 460);
    glow.fillStyle(0xffc080, 0.03);
    glow.fillCircle(640, 400, 620);

    // Vignette frame
    const v = this.add.graphics();
    v.fillStyle(0x000000, 0.4);
    v.fillRect(0, 0, 1280, 60);
    v.fillRect(0, 660, 1280, 60);
    v.fillRect(0, 0, 60, 720);
    v.fillRect(1220, 0, 60, 720);
  }

  // ============================================================
  //  HEADER
  // ============================================================

  createHeader() {
    this.add.text(640, 60, "MISS FORTUNE'S", {
      fontFamily: '"Courier New", monospace',
      fontSize: '28px', fontStyle: 'bold',
      color: this.AMBER_HEX,
      stroke: '#2a1810', strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: this.AMBER_HEX, blur: 12, fill: true }
    }).setOrigin(0.5);

    this.add.text(640, 100, '— pick your seat at the table —', {
      fontFamily: '"Courier New", monospace',
      fontSize: '15px', color: '#8b6f47'
    }).setOrigin(0.5);

    // Hairline rule under the subtitle
    const line = this.add.graphics();
    line.lineStyle(1, 0x2a1810, 0.7);
    line.lineBetween(380, 130, 900, 130);
  }

  createBackHint() {
    this.add.text(40, 40, '', { /* placeholder — no back here, Boot is one-way */
      fontFamily: '"Courier New", monospace', fontSize: '12px', color: '#3a2a1a'
    });

    // Tiny help text bottom-center
    this.add.text(640, 690, 'click a slot to begin', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px', color: '#5a4030'
    }).setOrigin(0.5);
  }

  // ============================================================
  //  SLOT CARDS — three horizontal
  // ============================================================

  createCards() {
    const slots = GameState.getSlots();
    const startX = 640 - (3 * this.CARD_W + 2 * this.GAP) / 2 + this.CARD_W / 2;
    for (let i = 0; i < GameState.MAX_SLOTS; i++) {
      const x = startX + i * (this.CARD_W + this.GAP);
      const card = this.buildCard(x, this.CY, i, slots[i]);
      this.cards.push(card);
    }
  }

  // Build a single slot card and return its Container.
  buildCard(x, y, slotIdx, slotData) {
    const c = this.add.container(x, y);
    const w = this.CARD_W, h = this.CARD_H;

    // ----- Card slab — aged parchment tone with amber border -----
    const slab = this.add.graphics();
    slab.fillStyle(0x180f0a, 0.95);
    slab.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    slab.lineStyle(2, this.GOLD, 0.7);
    slab.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    c.add(slab);

    // Chipped accent — a few tiny dark streaks suggesting wear
    const wear = this.add.graphics();
    wear.lineStyle(1, 0x3a2a1a, 0.5);
    for (let s = 0; s < 4; s++) {
      const sx = -w / 2 + 10 + Math.random() * (w - 20);
      const sy = -h / 2 + 10 + Math.random() * (h - 20);
      wear.lineBetween(sx, sy, sx + 6, sy + 1);
    }
    c.add(wear);

    // ----- Top header strip — "PROFILE I/II/III" -----
    const headerY = -h / 2 + 30;
    const romanNumeral = ['I', 'II', 'III'][slotIdx] || String(slotIdx + 1);
    const hdr = this.add.text(0, headerY, `PROFILE ${romanNumeral}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);
    c.add(hdr);

    // Hairline under header
    const hr = this.add.graphics();
    hr.lineStyle(1, this.GOLD, 0.4);
    hr.lineBetween(-w / 2 + 24, headerY + 14, w / 2 - 24, headerY + 14);
    c.add(hr);

    if (slotData) {
      this.populateFilledCard(c, slotIdx, slotData);
    } else {
      this.populateEmptyCard(c, slotIdx);
    }

    // NOTE: do NOT add a card-level hit zone here. Phaser's input is
    // top-only — a full-card zone added after the inner buttons would sit
    // on top of them and swallow every click, even with no pointerdown
    // handler. The SELECT/CREATE/× buttons own their own input.

    return c;
  }

  // ----------- FILLED slot: name, stats, SELECT, × delete -----------
  populateFilledCard(c, slotIdx, slot) {
    const w = this.CARD_W, h = this.CARD_H;

    // Name — big, courier, gold
    const name = this.add.text(0, -h / 2 + 78, slot.name, {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px', fontStyle: 'bold',
      color: this.AMBER_HEX,
      shadow: { offsetX: 0, offsetY: 0, color: this.AMBER_HEX, blur: 8, fill: true }
    }).setOrigin(0.5);
    c.add(name);

    // Last-played sub-line
    const last = this.add.text(0, -h / 2 + 105, `last played ${GameState.relativeTime(slot.lastPlayedAt)}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px', color: '#6a5030', fontStyle: 'italic'
    }).setOrigin(0.5);
    c.add(last);

    // Stats block
    const chipLine = this.add.text(0, -10, `CHIPS: ${slot.chips}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '17px', color: this.AMBER_HEX,
      shadow: { offsetX: 0, offsetY: 0, color: this.AMBER_HEX, blur: 6, fill: true }
    }).setOrigin(0.5);
    c.add(chipLine);

    const marrowLine = this.add.text(0, 18, `MARROW: ${slot.marrow}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '15px', color: '#d4a574',
      shadow: { offsetX: 0, offsetY: 0, color: '#d4a574', blur: 5, fill: true }
    }).setOrigin(0.5);
    c.add(marrowLine);

    // Title flavor (rank-ish), derived from chips
    const title = this.add.text(0, 50, this.titleForChips(slot.chips), {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px', color: '#8b6f47', fontStyle: 'italic'
    }).setOrigin(0.5);
    c.add(title);

    // ----- SELECT button -----
    const selectBtn = this.makeBtn(0, h / 2 - 50, 200, 44, 'SELECT', this.GOLD, this.AMBER_HEX, () => {
      this.selectSlot(slotIdx);
    });
    c.add(selectBtn);

    // ----- × delete (top-right) -----
    const closeBtn = this.add.container(w / 2 - 20, -h / 2 + 20);
    const closeBg = this.add.graphics();
    closeBg.lineStyle(1, 0x6a4030, 0.6);
    closeBg.strokeCircle(0, 0, 11);
    const closeX = this.add.text(0, 0, '×', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px', fontStyle: 'bold', color: '#8b4030'
    }).setOrigin(0.5);
    closeBtn.add([closeBg, closeX]);
    const closeHit = this.add.zone(0, 0, 24, 24).setOrigin(0.5).setInteractive({ useHandCursor: true });
    closeBtn.add(closeHit);
    closeHit.on('pointerover', () => closeX.setColor('#ff6b35'));
    closeHit.on('pointerout',  () => closeX.setColor('#8b4030'));
    closeHit.on('pointerdown', () => this.confirmDelete(slotIdx, slot.name));
    c.add(closeBtn);
  }

  // ----------- EMPTY slot: "empty" + CREATE button -----------
  populateEmptyCard(c, slotIdx) {
    const h = this.CARD_H;

    // "empty" — big, faded
    const empty = this.add.text(0, -10, 'empty', {
      fontFamily: '"Courier New", monospace',
      fontSize: '26px', fontStyle: 'italic',
      color: '#4a3a25'
    }).setOrigin(0.5);
    c.add(empty);

    // Hint
    const hint = this.add.text(0, 25, 'name yourself,\ntake your stake', {
      fontFamily: '"Courier New", monospace',
      fontSize: '11px', color: '#5a4530', align: 'center'
    }).setOrigin(0.5);
    c.add(hint);

    // CREATE button
    const createBtn = this.makeBtn(0, h / 2 - 50, 200, 44, '+ CREATE', this.GOLD, this.AMBER_HEX, () => {
      this.openNameModal(slotIdx);
    });
    c.add(createBtn);
  }

  // Generic gold-bordered button factory.
  makeBtn(x, y, w, h, label, strokeColor, textHex, onClick) {
    const c = this.add.container(x, y);
    const bg = this.add.graphics();
    bg.fillStyle(0x1a1208, 0.95);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(2, strokeColor, 0.85);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    const txt = this.add.text(0, 0, label, {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      fontStyle: 'bold', color: textHex
    }).setOrigin(0.5);
    c.add([bg, txt]);
    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    c.add(hit);
    hit.on('pointerover', () => { txt.setColor('#ffd8a0'); });
    hit.on('pointerout',  () => { txt.setColor(textHex); });
    hit.on('pointerdown', onClick);
    return c;
  }

  // Cute flavor-rank derived from chip count — purely cosmetic.
  titleForChips(chips) {
    if (chips < 50)    return 'wagerless';
    if (chips < 200)   return 'first night';
    if (chips < 500)   return 'spectator';
    if (chips < 1000)  return 'regular';
    if (chips < 5000)  return 'high roller';
    if (chips < 20000) return 'house favorite';
    return 'parlor legend';
  }

  // ============================================================
  //  ACTIONS
  // ============================================================

  selectSlot(slotIdx) {
    if (this._modal) return;
    if (!GameState.selectSlot(this.game, slotIdx)) return;
    this.cameras.main.fadeOut(450, 8, 5, 5);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
  }

  confirmDelete(slotIdx, name) {
    if (this._modal) return;
    this.openModal((modal) => {
      const q = this.add.text(0, -42, `Delete "${name}"?`, {
        fontFamily: '"Courier New", monospace', fontSize: '17px',
        fontStyle: 'bold', color: this.AMBER_HEX
      }).setOrigin(0.5);
      modal.box.add(q);

      const sub = this.add.text(0, -16, 'This profile and its chips are gone for good.', {
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        color: '#8b6f47'
      }).setOrigin(0.5);
      modal.box.add(sub);

      const cancel = this.makeBtn(-80, 40, 130, 38, 'CANCEL', 0x8b6f47, '#8b6f47', () => this.closeModal());
      const del    = this.makeBtn( 80, 40, 130, 38, 'DELETE', 0xff6b35, '#ff6b35', () => {
        GameState.deleteSlot(slotIdx);
        this.closeModal();
        this.refreshCards();
      });
      modal.box.add([cancel, del]);
    });
  }

  // Re-build the slot row after a create/delete.
  refreshCards() {
    this.cards.forEach(c => c.destroy());
    this.cards = [];
    this.createCards();
  }

  // ============================================================
  //  NAME-INPUT MODAL — typed via keyboard, ENTER confirms
  // ============================================================

  openNameModal(slotIdx) {
    if (this._modal) return;
    this._nameInput = '';

    this.openModal((modal) => {
      const q = this.add.text(0, -56, 'NAME YOUR PROFILE', {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        fontStyle: 'bold', color: this.AMBER_HEX, letterSpacing: 2
      }).setOrigin(0.5);
      modal.box.add(q);

      // Type field — wide gold-bordered slot
      const fieldBg = this.add.graphics();
      fieldBg.fillStyle(0x080503, 0.9);
      fieldBg.fillRoundedRect(-180, -22, 360, 44, 4);
      fieldBg.lineStyle(2, this.GOLD, 0.7);
      fieldBg.strokeRoundedRect(-180, -22, 360, 44, 4);
      modal.box.add(fieldBg);

      this._nameDisplay = this.add.text(0, 0, '', {
        fontFamily: '"Courier New", monospace', fontSize: '20px',
        fontStyle: 'bold', color: '#ffe6b3'
      }).setOrigin(0.5);
      modal.box.add(this._nameDisplay);

      // Caret — a soft "_" that blinks
      this._caret = this.add.text(0, 0, '_', {
        fontFamily: '"Courier New", monospace', fontSize: '20px',
        fontStyle: 'bold', color: '#ffe6b3'
      }).setOrigin(0, 0.5);
      modal.box.add(this._caret);
      this._cursorTween = this.tweens.add({
        targets: this._caret, alpha: { from: 1, to: 0.1 },
        duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
      });

      const hint = this.add.text(0, 38, 'ENTER to confirm  ·  ESC to cancel  ·  14 characters max', {
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        color: '#6a5030'
      }).setOrigin(0.5);
      modal.box.add(hint);

      const cancel = this.makeBtn(-80, 90, 130, 38, 'CANCEL', 0x8b6f47, '#8b6f47', () => this.closeModal());
      this._confirmBtn = this.makeBtn(80, 90, 130, 38, 'CREATE', this.GOLD, this.AMBER_HEX, () => this.commitName(slotIdx));
      modal.box.add([cancel, this._confirmBtn]);

      this.updateNameDisplay();
    });

    // Capture all keyboard input while the modal is open.
    this._activeKeyHandler = (e) => this.handleNameKey(e, slotIdx);
    this.input.keyboard.on('keydown', this._activeKeyHandler);
  }

  handleNameKey(e, slotIdx) {
    if (!this._modal) return;
    if (e.key === 'Enter') {
      e.preventDefault?.();
      this.commitName(slotIdx);
      return;
    }
    if (e.key === 'Escape') {
      this.closeModal();
      return;
    }
    if (e.key === 'Backspace') {
      this._nameInput = this._nameInput.slice(0, -1);
      this.updateNameDisplay();
      return;
    }
    // Allowed characters: letters, digits, space, basic punctuation.
    if (e.key && e.key.length === 1 && /[a-zA-Z0-9 _.\-']/.test(e.key)
        && this._nameInput.length < GameState.MAX_NAME_LEN) {
      this._nameInput += e.key;
      this.updateNameDisplay();
    }
  }

  updateNameDisplay() {
    if (!this._nameDisplay) return;
    this._nameDisplay.setText(this._nameInput);
    // Caret sits just to the right of the typed text.
    const w = this._nameDisplay.width;
    this._caret.setPosition(w / 2 + 2, 0);
  }

  commitName(slotIdx) {
    const name = this._nameInput.trim();
    if (!name) return; // require something
    if (!GameState.createSlot(this.game, slotIdx, name)) return;
    this.closeModal();
    this.cameras.main.fadeOut(450, 8, 5, 5);
    this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
  }

  // ============================================================
  //  GENERIC MODAL HOST
  // ============================================================

  openModal(populate) {
    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.7);
    dim.fillRect(0, 0, 1280, 720);
    dim.setDepth(900);

    const box = this.add.container(640, 360);
    box.setDepth(901);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f0906, 0.98);
    bg.fillRoundedRect(-260, -110, 520, 220, 8);
    bg.lineStyle(2, this.GOLD, 0.75);
    bg.strokeRoundedRect(-260, -110, 520, 220, 8);
    box.add(bg);

    this._modal = { dim, box };
    populate(this._modal);
  }

  closeModal() {
    if (!this._modal) return;
    this._modal.dim.destroy();
    this._modal.box.destroy();
    this._modal = null;
    this._nameDisplay = null;
    this._caret = null;
    this._confirmBtn = null;
    if (this._cursorTween) { this._cursorTween.remove(); this._cursorTween = null; }
    if (this._activeKeyHandler) {
      this.input.keyboard.off('keydown', this._activeKeyHandler);
      this._activeKeyHandler = null;
    }
    this._nameInput = '';
  }
}
