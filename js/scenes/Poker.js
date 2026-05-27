import Phaser from 'phaser';
import { GameState } from '../state.js';

// Poker.js — the Poker Room. A sub-hub off the main parlor that holds four
// felt-topped tables: Video Poker, 3-Card, Caribbean Stud, Texas Hold'em.
// Each table is its own scene (added in later sub-phases); for now,
// unbuilt variants show a "coming soon" toast on click.

const TABLES = [
  { id: 'VideoPoker',     name: 'VIDEO POKER',  scene: 'VideoPoker', x: 360, y: 310 },
  { id: 'ThreeCardPoker', name: 'THREE-CARD',   scene: null,         x: 920, y: 310 },
  { id: 'CaribbeanStud',  name: 'CARIBBEAN',    scene: null,         x: 360, y: 530 },
  { id: 'HoldEm',         name: "HOLD 'EM",     scene: null,         x: 920, y: 530 }
];

export class Poker extends Phaser.Scene {
  constructor() {
    super('Poker');
  }

  create() {
    // Persistent-scene defensive resets
    this.tableObjects = [];
    this.toastText    = null;
    this.chipText     = null;
    this.marrowText   = null;
    this._hudListeners = null;

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createBackground();
    this.createHeader();
    this.createTables();
    this.createBackButton();
    this.createHUD();
  }

  // ============================================================
  // BACKGROUND — dim smoky room with low amber lamp pools
  // ============================================================
  createBackground() {
    const g = this.add.graphics();
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 0, 1280, 720);

    // Vignette at top + bottom edges
    for (let i = 0; i < 8; i++) {
      g.fillStyle(0x000000, 0.06);
      g.fillRect(0, 0, 1280, 50 + i * 10);
      g.fillRect(0, 720 - (50 + i * 10), 1280, 50 + i * 10);
    }

    // Lamp pools — two soft amber glows, one over each column of tables
    [360, 920].forEach(cx => {
      const lamp = this.add.graphics();
      lamp.fillStyle(0xc9a961, 0.04);
      lamp.fillCircle(cx, 420, 280);
      lamp.fillStyle(0xc9a961, 0.06);
      lamp.fillCircle(cx, 420, 180);
      lamp.fillStyle(0xc9a961, 0.08);
      lamp.fillCircle(cx, 420, 100);
    });

    // Dust motes drifting upward
    for (let i = 0; i < 70; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.04);
      g.fillCircle(Math.random() * 1280, Math.random() * 720, 1 + Math.random() * 2);
    }
  }

  // ============================================================
  // HEADER — title + flavor line
  // ============================================================
  createHeader() {
    this.add.text(640, 60, 'THE POKER ROOM', {
      fontFamily: '"Courier New", monospace', fontSize: '30px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 10,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 14, fill: true }
    }).setOrigin(0.5);
    this.add.text(640, 100, '— four tables. four games. bet what you can lose. —', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      fontStyle: 'italic', color: '#8b6f47', letterSpacing: 2
    }).setOrigin(0.5);

    // Subtle divider under header
    const line = this.add.graphics();
    line.lineStyle(1, 0x2a1810, 0.6);
    line.lineBetween(380, 130, 900, 130);
  }

  // ============================================================
  // TABLES — 4 felt ovals in a 2x2 grid. Hoverable, clickable.
  // ============================================================
  createTables() {
    for (const t of TABLES) {
      const container = this.add.container(t.x, t.y);
      const felt = this.add.graphics();
      this.drawFelt(felt, false);
      container.add(felt);

      const label = this.add.text(0, -8, t.name, {
        fontFamily: '"Courier New", monospace', fontSize: '20px',
        fontStyle: 'bold', color: '#c9a961', letterSpacing: 5,
        shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 6, fill: true }
      }).setOrigin(0.5);
      container.add(label);

      const subTxt = t.scene ? '— click to play —' : '— coming soon —';
      const subColor = t.scene ? '#c9a961' : '#6a5030';
      const sub = this.add.text(0, 22, subTxt, {
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        fontStyle: 'italic', color: subColor, letterSpacing: 2
      }).setOrigin(0.5);
      container.add(sub);

      // Decorative chip stack at the corner of each table
      this.drawChipStack(container, -90, 18);

      const hit = this.add.zone(0, 0, 240, 150).setOrigin(0.5).setInteractive({ useHandCursor: true });
      container.add(hit);

      hit.on('pointerover', () => {
        this.tweens.add({ targets: container, scaleX: 1.05, scaleY: 1.05, duration: 150, ease: 'Sine.easeOut' });
        this.drawFelt(felt, true);
        label.setColor('#ffd8a0');
      });
      hit.on('pointerout', () => {
        this.tweens.add({ targets: container, scaleX: 1, scaleY: 1, duration: 150, ease: 'Sine.easeOut' });
        this.drawFelt(felt, false);
        label.setColor('#c9a961');
      });
      hit.on('pointerdown', () => {
        if (t.scene) {
          this.cameras.main.fadeOut(500, 5, 3, 2);
          this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start(t.scene));
        } else {
          this.showComingSoonToast(t.name);
        }
      });

      this.tableObjects.push({ container, felt, table: t });
    }
  }

  // Draw the felt oval. hovered=true tints brighter and brass-rim glows.
  drawFelt(g, hovered) {
    g.clear();
    g.fillStyle(hovered ? 0x5a1818 : 0x4a1010, 1);
    g.fillEllipse(0, 0, 240, 140);
    g.lineStyle(3, hovered ? 0xffd8a0 : 0xc9a961, hovered ? 0.95 : 0.7);
    g.strokeEllipse(0, 0, 240, 140);
    g.lineStyle(1, hovered ? 0xc9a961 : 0x6a5030, hovered ? 0.7 : 0.5);
    g.strokeEllipse(0, 0, 220, 120);
    // Subtle felt texture — small dark specks
    for (let i = 0; i < 18; i++) {
      g.fillStyle(0x2a0808, 0.4);
      g.fillCircle((Math.random() - 0.5) * 200, (Math.random() - 0.5) * 100, 0.8);
    }
  }

  drawChipStack(container, x, y) {
    const stack = this.add.graphics();
    const colors = [0xc9a961, 0x8b2020, 0x4a7a4a];
    for (let i = 0; i < 5; i++) {
      const c = colors[i % colors.length];
      stack.fillStyle(c, 0.85);
      stack.fillEllipse(x, y - i * 2, 18, 6);
      stack.lineStyle(1, 0x2a1810, 0.5);
      stack.strokeEllipse(x, y - i * 2, 18, 6);
    }
    container.add(stack);
  }

  showComingSoonToast(name) {
    if (this.toastText) {
      this.tweens.killTweensOf(this.toastText);
      this.toastText.destroy();
    }
    this.toastText = this.add.text(640, 660, `${name} — madame is still teaching the dealer.`, {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      fontStyle: 'italic', color: '#c24f2a', letterSpacing: 1,
      shadow: { offsetX: 0, offsetY: 0, color: '#c24f2a', blur: 6, fill: true }
    }).setOrigin(0.5).setAlpha(0);
    this.tweens.add({ targets: this.toastText, alpha: 1, duration: 250 });
    this.tweens.add({
      targets: this.toastText, alpha: 0,
      delay: 2400, duration: 500,
      onComplete: () => {
        if (this.toastText) { this.toastText.destroy(); this.toastText = null; }
      }
    });
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

    const onChip = () => {
      if (this.chipText) this.chipText.setText(`chips: ${this.registry.get('chips')}`);
    };
    const onMarrow = () => {
      if (this.marrowText) this.marrowText.setText(`marrow: ${this.registry.get('marrow')}`);
    };
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
  // BACK TO PARLOR
  // ============================================================
  createBackButton() {
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });
  }
}
