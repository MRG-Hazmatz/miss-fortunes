import Phaser from 'phaser';
import { GameState } from '../state.js';

export class Parlor extends Phaser.Scene {
  constructor() {
    super('Parlor');

    // All 8 doors — unlocked ones go first, then locked, then the dying one last.
    // Palette: warm, desaturated — "old signs in a smoky basement," not a rave.
    // Each door's glow uses the same hue at low intensity, so the overall effect
    // is eight different shades of warmth rather than eight spotlights.
    this.DOORS = [
      { name: 'PLINKO',             locked: false, scene: 'Plinko',    neon: 0xc9a961, hex: '#c9a961' },
      { name: 'BLACKJACK',          locked: false, scene: 'Blackjack', neon: 0x8b2020, hex: '#8b2020' },
      { name: 'THE BOOKIE',         locked: false, scene: 'Bookie',    neon: 0x4a7a4a, hex: '#4a7a4a' },
      { name: 'ROULETTE',           locked: false, scene: 'Roulette',  neon: 0xa89050, hex: '#a89050' },
      { name: 'SLOTS',              locked: false, scene: 'Slots',     neon: 0x8a4a5a, hex: '#8a4a5a' },
      { name: 'POKER',              locked: true,  scene: null,        neon: 0x4a5a6a, hex: '#4a5a6a' },
      { name: 'THE FORTUNE\nTELLER', locked: true, scene: null,        neon: 0x5a3a6a, hex: '#5a3a6a' },
      { name: 'THE BACK\nROOM',     locked: true,  scene: null,        neon: 0x4a0000, hex: '#4a0000', dying: true }
    ];

    this.DOOR_W = 220;
    this.DOOR_H = 280;
    this.DOOR_SPACING = 260;
    this.CAROUSEL_CX = 640;
    this.CAROUSEL_CY = 380;
    this.ROTATE_MS = 360;
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(600, 10, 6, 5);

    // Phaser scene instances are PERSISTENT — `this` survives shutdown/restart.
    // After a player exits to a game and comes back, every property we set in
    // a previous mount still holds a reference to a destroyed GameObject.
    // Anything that's iterated by an `update*` method (paginationDots,
    // doorNodes, chip/marrow/saved text) MUST be cleared here, or those
    // updates will touch destroyed objects and silently halt scene boot at
    // status=CREATING (which manifests as a black screen on back-to-parlor).
    this.centerIdx = 0;
    this._animating = false;
    this._wheelCooldown = 0;
    this.doorNodes = [];
    this.paginationDots = null;
    this.chipText = null;
    this.marrowText = null;
    this.savedFlash = null;
    this._savedTween = null;
    this._resetModal = null;
    this._exitModal = null;
    this._chipTween = null;

    this.createHeader();
    this.createHUD();
    this.createCarousel();
    this.createPaginationDots();
    this.createInput();
    this.createDust();
  }

  // ============================================================
  //  HEADER & HUD — warm amber, untouched from before
  // ============================================================

  createHeader() {
    const cx = this.cameras.main.centerX;

    this.add.text(cx, 38, "MISS FORTUNE'S", {
      fontFamily: '"Courier New", monospace',
      fontSize: '28px',
      fontStyle: 'bold',
      color: '#c9a961',
      stroke: '#2a1810',
      strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 12, fill: true }
    }).setOrigin(0.5);

    this.add.text(cx, 72, '— the parlor —', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#8b6f47'
    }).setOrigin(0.5);

    const line = this.add.graphics();
    line.lineStyle(1, 0x2a1810, 0.6);
    line.lineBetween(340, 100, 940, 100);
  }

  createHUD() {
    // Active profile name — top-left, small. Lets the player see whose
    // seat they're sitting at without ever leaving the parlor.
    const activeIdx = GameState.getActiveSlotIndex();
    const slots = GameState.getSlots();
    const profile = (activeIdx != null) ? slots[activeIdx] : null;
    if (profile) {
      this.add.text(40, 690, `seated as: ${profile.name}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: '#5a4530',
        fontStyle: 'italic'
      }).setOrigin(0, 1);
    }

    this.chipText = this.add.text(1240, 28, `CHIPS: ${this.registry.get('chips')}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 6, fill: true }
    }).setOrigin(1, 0);

    this.marrowText = this.add.text(1240, 54, `MARROW: ${this.registry.get('marrow')}`, {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#d4a574',
      shadow: { offsetX: 0, offsetY: 0, color: '#d4a574', blur: 6, fill: true }
    }).setOrigin(1, 0);

    // Keep the HUD live if another scene changes the registry while this scene
    // is still mounted. CRITICAL: registry events are GAME-LEVEL singletons —
    // they outlive the scene unless we explicitly off() them on shutdown.
    // A stale listener firing after this Parlor instance is destroyed will
    // try to .setText on a destroyed Text object and throw, which bubbles
    // back through Phaser's emitter chain and breaks registry.set() for the
    // currently-active game. That manifests as "none of the games work."
    const onChips = (_, v) => {
      if (this.chipText && this.chipText.active) this.chipText.setText(`CHIPS: ${v}`);
    };
    const onMarrow = (_, v) => {
      if (this.marrowText && this.marrowText.active) this.marrowText.setText(`MARROW: ${v}`);
    };
    this.registry.events.on('changedata-chips',  onChips);
    this.registry.events.on('changedata-marrow', onMarrow);

    // "SAVED" flash — barely visible, comforting. Triggered whenever
    // state.js writes to localStorage.
    this.savedFlash = this.add.text(1240, 80, 'SAVED', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: '#6a8a6a'
    }).setOrigin(1, 0).setAlpha(0);

    const onSaved = () => {
      if (!this.savedFlash || !this.savedFlash.active) return;
      if (this._savedTween) this._savedTween.remove();
      this.savedFlash.setAlpha(0.3);
      this._savedTween = this.tweens.add({
        targets: this.savedFlash,
        alpha: 0, duration: 800, ease: 'Sine.easeOut'
      });
    };
    this.game.events.on('state-saved', onSaved);

    // Tear down EVERY game-level listener on shutdown so they don't leak
    // across scene transitions. Without this, entering a game would orphan
    // the listeners; the next chip change would throw on a destroyed text.
    const cleanup = () => {
      this.registry.events.off('changedata-chips',  onChips);
      this.registry.events.off('changedata-marrow', onMarrow);
      this.game.events.off('state-saved', onSaved);
    };
    this.events.once('shutdown', cleanup);
    this.events.once('destroy',  cleanup);

    // "switch profile" + "exit" links — tiny, bottom-right, discreet.
    // The active slot auto-saves on every chip change, so neither one
    // ever needs to flush manually.
    this.createCornerLinks();
  }

  createCornerLinks() {
    const mkLink = (x, label, onClick) => {
      const link = this.add.text(x, 702, label, {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: '#5a4530',
        letterSpacing: 1
      }).setOrigin(1, 1);
      link.setInteractive({ useHandCursor: true });
      link.on('pointerover', () => link.setColor('#c9a961'));
      link.on('pointerout',  () => link.setColor('#5a4530'));
      link.on('pointerdown', onClick);
      return link;
    };

    // Bottom-right cluster, right-to-left: switch profile, save, exit.
    // Bumped visibility (was 11px @ #3a2a1a, basically invisible) so first-time
    // players can actually find the exit and the manual save reassurance.
    mkLink(1270, 'switch profile', () => {
      GameState.unsetActive();
      this.cameras.main.fadeOut(450, 8, 5, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('SaveSelect'));
    });
    // Manual save — the auto-save already covers chip/marrow changes, but
    // a visible "save" button reassures players the game can be safely closed.
    // Fires the same 'state-saved' event as auto-save, so the SAVED chip flashes.
    mkLink(1130, 'save', () => GameState.persistActive(this.game));
    mkLink(1040, 'exit', () => this.showExitConfirm());
  }

  // Friendly reminder modal — the game is browser-based and can't really
  // close itself (browsers block window.close()), but a clear "your save
  // is preserved, you can close this tab whenever" softens the off-ramp.
  // When we eventually wrap this in Tauri, swap the OK button for a real
  // app.exit() call.
  showExitConfirm() {
    if (this._exitModal) return;

    const dim = this.add.graphics();
    dim.fillStyle(0x000000, 0.7);
    dim.fillRect(0, 0, 1280, 720);
    dim.setDepth(900);

    const box = this.add.container(640, 360);
    box.setDepth(901);

    const bg = this.add.graphics();
    bg.fillStyle(0x0f0906, 0.98);
    bg.fillRoundedRect(-260, -100, 520, 200, 8);
    bg.lineStyle(2, 0xa89050, 0.75);
    bg.strokeRoundedRect(-260, -100, 520, 200, 8);
    box.add(bg);

    const tag = scene => null; // (kept tidy — no header tag for this dialog)
    const q = this.add.text(0, -50, 'leaving so soon?', {
      fontFamily: '"Courier New", monospace', fontSize: '17px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(0.5);
    box.add(q);

    const sub = this.add.text(0, -15,
      'Close this tab to exit.\nYour progress is saved to this profile.',
      {
        fontFamily: '"Courier New", monospace', fontSize: '12px',
        color: '#8b6f47', align: 'center', lineSpacing: 4
      }
    ).setOrigin(0.5);
    box.add(sub);

    const btnW = 140, btnH = 40;
    const btn = this.add.container(0, 55);
    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x1a1208, 0.95);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    btnBg.lineStyle(2, 0xa89050, 0.85);
    btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    const btnTxt = this.add.text(0, 0, 'OK', {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'bold', color: '#a89050'
    }).setOrigin(0.5);
    btn.add([btnBg, btnTxt]);
    const hit = this.add.zone(0, 0, btnW, btnH).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.add(hit);
    hit.on('pointerover', () => btnTxt.setColor('#ffd8a0'));
    hit.on('pointerout',  () => btnTxt.setColor('#a89050'));
    hit.on('pointerdown', () => {
      dim.destroy();
      box.destroy();
      this._exitModal = null;
    });
    box.add(btn);

    this._exitModal = { dim, box };
  }

  // ============================================================
  //  CAROUSEL — 8 doors, 3-4 visible at a time, wraps
  // ============================================================

  createCarousel() {
    // Build all 8 doors, then lay them out.
    this.DOORS.forEach((cfg, i) => {
      const node = this.buildDoor(i, cfg);
      this.doorNodes.push(node);
    });
    this.layoutDoors(true);
  }

  buildDoor(idx, cfg) {
    // Container holds every visual piece of this door. Tweening the container
    // handles position/scale/alpha for the carousel rotation cleanly.
    const c = this.add.container(this.CAROUSEL_CX, this.CAROUSEL_CY);

    const w = this.DOOR_W;
    const h = this.DOOR_H;

    // Intensity: full neon for unlocked, 40% for plain locked, dying handled separately.
    const isUnlocked = !cfg.locked;
    const isDying = cfg.dying === true;
    const baseAlpha = isUnlocked ? 1.0 : (isDying ? 0.5 : 0.4);

    // ----- NEON GLOW — concentric stroked rects with decreasing alpha -----
    // 5 layers from outside-in simulate a neon sign's bloom.
    const glowLayers = [];
    for (let g = 5; g >= 1; g--) {
      const gw = w + g * 10;
      const gh = h + g * 10;
      const glow = this.add.graphics();
      const a = baseAlpha * (0.08 + (5 - g) * 0.045);
      glow.lineStyle(2 + g, cfg.neon, a);
      glow.strokeRoundedRect(-gw / 2, -gh / 2, gw, gh, 8 + g);
      c.add(glow);
      glowLayers.push(glow);
    }

    // ----- DOOR SLAB — near-black with a tiny warm undertone -----
    const slab = this.add.graphics();
    slab.fillStyle(0x0a0605, 0.85);
    slab.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    c.add(slab);

    // ----- BRIGHT BORDER — the actual neon outline -----
    const border = this.add.graphics();
    border.lineStyle(3, cfg.neon, Math.min(1, baseAlpha + 0.25));
    border.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    c.add(border);

    // ----- INNER BORDER — inset a bit for that double-frame door feel -----
    const inner = this.add.graphics();
    inner.lineStyle(1, cfg.neon, baseAlpha * 0.5);
    inner.strokeRoundedRect(-w / 2 + 10, -h / 2 + 10, w - 20, h - 20, 4);
    c.add(inner);

    // ----- LABEL — uses the door's own neon hex for the glow shadow -----
    const label = this.add.text(0, -20, cfg.name, {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      fontStyle: 'bold',
      color: cfg.hex,
      align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: cfg.hex, blur: 10, fill: true }
    }).setOrigin(0.5).setAlpha(baseAlpha + (isUnlocked ? 0 : 0.1));
    c.add(label);

    // ----- LOCKED SUBTEXT -----
    let lockedLabel = null;
    if (cfg.locked) {
      lockedLabel = this.add.text(0, 70, 'LOCKED', {
        fontFamily: '"Courier New", monospace',
        fontSize: '13px',
        color: cfg.hex,
        letterSpacing: 4
      }).setOrigin(0.5).setAlpha(baseAlpha * 1.3);
      c.add(lockedLabel);
    }

    // ----- HIT AREA — invisible rect spanning the door for clicks -----
    const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setInteractive({ useHandCursor: true });
    c.add(hit);

    const node = {
      container: c,
      idx,
      cfg,
      glowLayers,
      slab,
      border,
      inner,
      label,
      lockedLabel,
      hit,
      baseAlpha,
      pulseTween: null,
      flickerTween: null
    };

    // ----- UNLOCKED: steady neon pulse -----
    if (isUnlocked) {
      node.pulseTween = this.tweens.add({
        targets: glowLayers,
        alpha: { from: 1, to: 0.7 },
        duration: 1400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }

    // ----- DYING: erratic flicker with rare blackout -----
    if (isDying) {
      const flicker = () => {
        const low = 0.3 + Math.random() * 0.4; // 0.3–0.7
        const blackout = Math.random() < 0.15;
        const target = blackout ? 0 : low;
        this.tweens.add({
          targets: [slab, border, inner, label, ...glowLayers, lockedLabel].filter(Boolean),
          alpha: target,
          duration: 60 + Math.random() * 120,
          onComplete: () => {
            this.tweens.add({
              targets: [slab, border, inner, label, ...glowLayers, lockedLabel].filter(Boolean),
              alpha: baseAlpha,
              duration: 100 + Math.random() * 200,
              onComplete: () => this.time.delayedCall(300 + Math.random() * 900, flicker)
            });
          }
        });
      };
      this.time.delayedCall(400 + Math.random() * 600, flicker);
    }

    // ----- INPUT -----
    hit.on('pointerdown', () => this.onDoorClick(idx));
    hit.on('pointerover', () => this.onDoorHover(node, true));
    hit.on('pointerout', () => this.onDoorHover(node, false));

    return node;
  }

  // ----- Hover: thicken & brighten the door's own color (no harsh white) -----
  onDoorHover(node, hovering) {
    if (node.cfg.dying) return; // Don't interfere with flicker
    const rel = this.getRelative(node.idx);
    if (Math.abs(rel) > 1) return; // Too far to matter

    const cfg = node.cfg;
    node.border.clear();
    const thick = hovering ? 4 : 3;
    const alpha = hovering ? 1 : Math.min(1, node.baseAlpha + 0.25);
    // Stay in the door's own hue — keeps the smoky-basement cohesion.
    node.border.lineStyle(thick, cfg.neon, alpha);
    node.border.strokeRoundedRect(-this.DOOR_W / 2, -this.DOOR_H / 2, this.DOOR_W, this.DOOR_H, 6);
  }

  // ----- Clicking the centered door enters it. Side doors rotate toward them. -----
  onDoorClick(idx) {
    if (this._animating) return;
    const rel = this.getRelative(idx);
    if (rel === 0) {
      const cfg = this.DOORS[idx];
      if (cfg.locked || !cfg.scene) return; // ignore locked
      this.cameras.main.fadeOut(500, 10, 6, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(cfg.scene));
    } else if (rel > 0) {
      this.rotate(1);
    } else {
      this.rotate(-1);
    }
  }

  // ----- Returns signed position relative to centerIdx in range [-4,+4] -----
  // This is the crux of the wrap: a door 5 slots "ahead" is also 3 slots "behind".
  getRelative(idx) {
    const n = this.DOORS.length;
    let d = idx - this.centerIdx;
    if (d > n / 2) d -= n;
    if (d < -n / 2) d += n;
    return d;
  }

  // ----- Layout: tween each door's container to its slot based on getRelative -----
  layoutDoors(instant = false) {
    this.doorNodes.forEach((node) => {
      const rel = this.getRelative(node.idx);
      const absRel = Math.abs(rel);
      const targetX = this.CAROUSEL_CX + rel * this.DOOR_SPACING;
      const targetY = this.CAROUSEL_CY;

      let scale, alpha;
      if (absRel === 0) { scale = 1.0;  alpha = 1.0;  }
      else if (absRel === 1) { scale = 0.92; alpha = 0.95; }
      else if (absRel === 2) { scale = 0.85; alpha = 0.3;  }
      else                   { scale = 0.8;  alpha = 0;    }

      if (instant) {
        node.container.x = targetX;
        node.container.y = targetY;
        node.container.setScale(scale);
        node.container.setAlpha(alpha);
      } else {
        this.tweens.add({
          targets: node.container,
          x: targetX,
          y: targetY,
          scale,
          alpha,
          duration: this.ROTATE_MS,
          ease: 'Cubic.easeInOut'
        });
      }

      // Only the centered door sorts to top
      node.container.setDepth(absRel === 0 ? 10 : (10 - absRel));
    });

    this.updatePaginationDots();
  }

  // ----- Rotate by ±1, wraps. Blocks re-entry until tween finishes. -----
  rotate(dir) {
    if (this._animating) return;
    const n = this.DOORS.length;
    this._animating = true;
    this.centerIdx = (this.centerIdx + dir + n) % n;
    this.layoutDoors(false);
    this.time.delayedCall(this.ROTATE_MS + 20, () => { this._animating = false; });
  }

  jumpTo(idx) {
    if (this._animating) return;
    if (idx === this.centerIdx) return;
    this._animating = true;
    this.centerIdx = idx;
    this.layoutDoors(false);
    this.time.delayedCall(this.ROTATE_MS + 20, () => { this._animating = false; });
  }

  // ============================================================
  //  PAGINATION DOTS
  // ============================================================

  createPaginationDots() {
    const n = this.DOORS.length;
    const spacing = 22;
    const totalW = (n - 1) * spacing;
    const startX = this.cameras.main.centerX - totalW / 2;
    const y = 620;

    this.paginationDots = [];
    for (let i = 0; i < n; i++) {
      const d = this.add.circle(startX + i * spacing, y, 3, 0x8b6f47, 1);
      this.paginationDots.push(d);
    }
    this.updatePaginationDots();
  }

  updatePaginationDots() {
    if (!this.paginationDots || this.paginationDots.length === 0) return;
    this.paginationDots.forEach((d, i) => {
      // Belt-and-braces — if we ever leak a destroyed dot reference here,
      // skip it instead of crashing the scene boot.
      if (!d || !d.active) return;
      if (i === this.centerIdx) {
        d.setFillStyle(0xe8c547, 1);
        d.setRadius(5);
      } else {
        d.setFillStyle(0x8b6f47, 0.5);
        d.setRadius(3);
      }
    });
  }

  // ============================================================
  //  INPUT — arrows, A/D, and mouse wheel with debounce
  // ============================================================

  createInput() {
    this.input.keyboard.on('keydown-LEFT',  () => this.rotate(-1));
    this.input.keyboard.on('keydown-RIGHT', () => this.rotate(1));
    this.input.keyboard.on('keydown-A',     () => this.rotate(-1));
    this.input.keyboard.on('keydown-D',     () => this.rotate(1));
    this.input.keyboard.on('keydown-ENTER', () => this.onDoorClick(this.centerIdx));
    this.input.keyboard.on('keydown-SPACE', () => this.onDoorClick(this.centerIdx));

    // Mouse wheel with a cooldown so trackpads don't fire off 8 steps at once
    this.input.on('wheel', (_ptr, _go, _dx, dy) => {
      const now = performance.now();
      if (now - this._wheelCooldown < 180) return;
      this._wheelCooldown = now;
      this.rotate(dy > 0 ? 1 : -1);
    });
  }

  // ============================================================
  //  DUST — preserved, warm amber motes drifting up
  // ============================================================

  createDust() {
    if (!this.textures.exists('dust')) {
      const gfx = this.make.graphics({ add: false });
      gfx.fillStyle(0xc9a961, 1);
      gfx.fillCircle(2, 2, 2);
      gfx.generateTexture('dust', 4, 4);
      gfx.destroy();
    }

    this.add.particles(0, 0, 'dust', {
      x: { min: 100, max: 1180 },
      y: 740,
      quantity: 1,
      frequency: 700,
      lifespan: 8000,
      alpha: { start: 0.12, end: 0 },
      scale: { min: 0.3, max: 0.8 },
      speedX: { min: -6, max: 6 },
      speedY: { min: -18, max: -6 },
      blendMode: 'ADD'
    });
  }
}
