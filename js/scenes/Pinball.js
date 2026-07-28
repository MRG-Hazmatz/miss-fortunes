import Phaser from 'phaser';
import { GameState } from '../state.js';
import { SFX } from '../audio.js';
import { MissionEngine } from '../pinball/missions.js';
import { rankName } from '../pinball/ranks.js';

// Pinball.js — THE ORRERY. Space Cadet's systems + feel, occult re-skin.
// C1: playable table — plunger, two flippers, pop bumpers, 3-ball game,
// chip ante. Missions / ranks / light-shows land in C2–C4.
//
// Physics model: top-down tilted table. Gravity pulls the ball toward the
// drain at the bottom. Walls are invisible static Matter bodies; the table
// art is drawn separately with Graphics and aligned to them (same decoupled
// pattern Plinko uses for pegs vs. wall bodies).

const M = Phaser.Physics.Matter.Matter;   // raw Matter modules (Body ops)

// ---- Table geometry (against the 1280×720 canvas) ----
const PF_TOP    = 132;
const PF_BOTTOM = 700;      // drain line
const PF_LEFT   = 400;      // inner edge of left wall
const DIVIDER_X = 824;      // wall between playfield and plunger lane
const OUTER_R   = 880;      // outer right wall
const LANE_X    = 852;      // plunger lane center

const BALL_R = 11;
const ANTE   = 5;           // chips to start a 3-ball game

// Flippers
const FLIP_LEN = 80;
const LEFT_PIVOT  = { x: 500, y: 628 };
const RIGHT_PIVOT = { x: 700, y: 628 };
const LEFT_REST = 18,  LEFT_ACTIVE = -22;    // degrees (y-down: +tips down)
const RIGHT_REST = 162, RIGHT_ACTIVE = 202;

export class Pinball extends Phaser.Scene {
  constructor() {
    super('Pinball');
  }

  create() {
    // Persistent-scene resets
    this.state       = 'IDLE';       // IDLE | READY | PLAY | GAMEOVER
    this.balls       = [];           // active ball images
    this.ballsLeft   = 0;
    this.score       = 0;
    this.charge      = 0;
    this.charging    = false;
    this.bumperBodies = [];
    this.flippers    = {};
    this._hudListeners = null;

    // Rites / ranks (C2)
    this.missionEngine = new MissionEngine();
    this.rankIndex   = 0;
    this.rollLamps   = [];    // { img, body, lit }
    this.dropTargets = [];    // { img, body, dropped }
    this.rift        = null;  // { img, body, x, y }
    this.showLamps   = [];    // perimeter light-show lamps
    this._announcing = false;
    this._crtRevertTimer = null;
    this._lastMarrowReward = 0;

    // Per-profile bests (persisted). bestRank = all-time rank ceiling; new
    // marrow is paid only when you push past it. highScore for the readout.
    this.bestRank  = GameState.getStat(this.game, 'pinballRank', 0);
    this.highScore = GameState.getStat(this.game, 'pinballHighScore', 0);

    // Each scene owns its own Matter world, so tuning gravity here doesn't
    // leak into Plinko's world.
    this.matter.world.setGravity(0, 0.9);

    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(500, 5, 3, 2);

    this.createTextures();
    this.createBackground();
    this.createTableArt();
    this.buildWalls();
    this.createBumpers();
    this.createRollovers();
    this.createDropTargets();
    this.createRift();
    this.createShowLamps();
    this.createFlippers();
    this.createCRT();
    this.createStartButton();
    this.createHUD();
    this.createBackButton();
    this.setupInput();
    this.setupCollisions();

    const idleMsg = this.highScore > 0
      ? `THE ORRERY hums. best ${this.highScore} · ${rankName(this.bestRank)}. insert 5 chips.`
      : 'THE ORRERY hums. insert 5 chips to wake it.';
    this.updateCRT(idleMsg);
  }

  // Award marrow the first time the player pushes their all-time rank ceiling
  // (milestone reward, not grindable). Sets _lastMarrowReward for the announce.
  awardRankMarrow() {
    if (this.rankIndex > this.bestRank) {
      const gained = this.rankIndex - this.bestRank;
      this.bestRank = this.rankIndex;
      GameState.setStat(this.game, 'pinballRank', this.bestRank);
      const reward = 2 * gained;
      this.registry.set('marrow', this.registry.get('marrow') + reward);
      this._lastMarrowReward = reward;
    } else {
      this._lastMarrowReward = 0;
    }
  }

  // ============================================================
  // TEXTURES
  // ============================================================
  createTextures() {
    if (this.textures.exists('pin_ball')) return;
    const g = this.make.graphics({ add: false });

    // Ball — brass sphere with highlight
    g.fillStyle(0x6a5030, 1); g.fillCircle(BALL_R, BALL_R, BALL_R);
    g.fillStyle(0xc9a961, 1); g.fillCircle(BALL_R, BALL_R, BALL_R - 2);
    g.fillStyle(0xffd8a0, 0.7); g.fillCircle(BALL_R - 3, BALL_R - 3, 3);
    g.generateTexture('pin_ball', BALL_R * 2, BALL_R * 2); g.clear();

    // Bumper — teal disc with brass rim + glowing core
    const BR = 28;
    g.fillStyle(0x3a6a6a, 1); g.fillCircle(BR, BR, BR);
    g.lineStyle(3, 0xc9a961, 0.9); g.strokeCircle(BR, BR, BR - 1);
    g.fillStyle(0x1a3a3a, 1); g.fillCircle(BR, BR, BR - 8);
    g.fillStyle(0x6ad0d0, 0.5); g.fillCircle(BR, BR, BR - 14);
    g.generateTexture('pin_bumper', BR * 2, BR * 2); g.clear();

    // Bumper lit state — brighter core
    g.fillStyle(0x4a8a8a, 1); g.fillCircle(BR, BR, BR);
    g.lineStyle(3, 0xffd8a0, 1); g.strokeCircle(BR, BR, BR - 1);
    g.fillStyle(0xaee8e8, 0.9); g.fillCircle(BR, BR, BR - 8);
    g.generateTexture('pin_bumper_lit', BR * 2, BR * 2); g.clear();

    // Flipper — rounded brass bar (84×20; body is slightly smaller)
    g.fillStyle(0xc9a961, 1); g.fillRoundedRect(0, 0, 84, 20, 10);
    g.lineStyle(2, 0x6a5030, 0.9); g.strokeRoundedRect(1, 1, 82, 18, 9);
    g.fillStyle(0xffd8a0, 0.5); g.fillRoundedRect(6, 3, 40, 5, 3);
    g.generateTexture('pin_flipper', 84, 20); g.clear();

    // Rollover lamp — white circle (tinted dim/bright at runtime)
    g.fillStyle(0xffffff, 1); g.fillCircle(11, 11, 9);
    g.lineStyle(2, 0xffffff, 0.5); g.strokeCircle(11, 11, 10);
    g.generateTexture('pin_lamp', 22, 22); g.clear();

    // Drop target — upright sigil stone (16×34)
    g.fillStyle(0x8a4a5a, 1); g.fillRoundedRect(0, 0, 16, 34, 4);
    g.lineStyle(2, 0xc9a961, 0.85); g.strokeRoundedRect(1, 1, 14, 32, 3);
    g.lineStyle(1, 0xffd8a0, 0.6); g.lineBetween(8, 6, 8, 28);
    g.lineBetween(4, 13, 12, 13);
    g.generateTexture('pin_target', 16, 34); g.clear();

    // The Rift — dark swirl with a teal ring (r=22)
    g.fillStyle(0x0a0605, 1); g.fillCircle(24, 24, 22);
    g.lineStyle(3, 0x3a6a6a, 0.9); g.strokeCircle(24, 24, 21);
    g.lineStyle(1, 0x6ad0d0, 0.5); g.strokeCircle(24, 24, 14);
    g.lineStyle(1, 0x8b2020, 0.5); g.strokeCircle(24, 24, 7);
    g.generateTexture('pin_rift', 48, 48); g.clear();

    g.destroy();
  }

  // ============================================================
  // BACKGROUND + TABLE ART (visual only; physics bodies are separate)
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
    // Left-side flavor panel (occult brass cabinet edge)
    const cab = this.add.graphics();
    cab.fillStyle(0x1a0e07, 1);
    cab.fillRect(0, 0, PF_LEFT - 20, 720);
    cab.fillStyle(0x1a0e07, 1);
    cab.fillRect(OUTER_R + 12, 0, 1280 - (OUTER_R + 12), 720);
  }

  createTableArt() {
    const g = this.add.graphics();
    // Felt playfield
    g.fillStyle(0x10241c, 1);
    g.fillRect(PF_LEFT - 8, PF_TOP, (OUTER_R + 8) - (PF_LEFT - 8), PF_BOTTOM - PF_TOP);
    // Faint arcane rings on the felt
    g.lineStyle(1, 0x3a6a6a, 0.18);
    g.strokeCircle(640, 330, 150);
    g.strokeCircle(640, 330, 100);
    g.lineStyle(1, 0xc9a961, 0.12);
    g.strokeCircle(640, 330, 200);
    // Brass rails (drawn where the wall bodies are)
    g.lineStyle(5, 0xc9a961, 0.55);
    g.strokeRect(PF_LEFT - 8, PF_TOP, (OUTER_R + 8) - (PF_LEFT - 8), PF_BOTTOM - PF_TOP);
    // Plunger-lane divider rail
    g.lineStyle(4, 0xc9a961, 0.5);
    g.lineBetween(DIVIDER_X, 210, DIVIDER_X, PF_BOTTOM);
    // Top-right deflector rail (guides launched ball into the field)
    g.lineBetween(886, 135, 700, 205);
    // Inlane rails toward the flippers
    g.lineStyle(4, 0xc9a961, 0.45);
    g.lineBetween(PF_LEFT - 4, 560, LEFT_PIVOT.x - 6, 622);
    g.lineBetween(DIVIDER_X, 560, RIGHT_PIVOT.x + 6, 622);
    // Drain mouth hint
    g.lineStyle(2, 0x8b2020, 0.4);
    g.lineBetween(560, 690, 640, 704);
    g.lineBetween(680, 690, 640, 704);

    // Dust motes
    for (let i = 0; i < 40; i++) {
      g.fillStyle(0xc9a961, 0.03 + Math.random() * 0.03);
      g.fillCircle(PF_LEFT + Math.random() * (OUTER_R - PF_LEFT), PF_TOP + Math.random() * (PF_BOTTOM - PF_TOP), 1 + Math.random());
    }

    this.bumperFlash = this.add.graphics().setDepth(6);
  }

  // ============================================================
  // WALLS (invisible static bodies)
  // ============================================================
  wall(cx, cy, w, h, angleDeg = 0) {
    this.matter.add.rectangle(cx, cy, w, h, {
      isStatic: true,
      angle: Phaser.Math.DegToRad(angleDeg),
      restitution: 0.3,
      friction: 0.02,
      label: 'wall'
    });
  }

  buildWalls() {
    const midY = (PF_TOP + PF_BOTTOM) / 2;
    const hFull = PF_BOTTOM - PF_TOP;
    // Left, top, outer-right
    this.wall(PF_LEFT - 8, midY, 16, hFull);
    this.wall((PF_LEFT + OUTER_R) / 2, PF_TOP - 4, (OUTER_R + 8) - (PF_LEFT - 8), 12);
    this.wall(OUTER_R + 6, midY, 16, hFull);
    // Plunger-lane divider (top open above y=210 so a launched ball exits)
    this.wall(DIVIDER_X, (210 + PF_BOTTOM) / 2, 12, PF_BOTTOM - 210);
    // Top-right deflector — spans from the outer wall down-left into the
    // field so a ball launched up the lane is always caught and redirected.
    this.wall(793, 170, 199, 12, -21);
    // Plunger-lane floor (ball rests here before launch)
    this.wall(LANE_X, 690, 44, 12);
    // Lower angled inlane walls funneling to the flippers
    this.wall((PF_LEFT - 4 + LEFT_PIVOT.x - 6) / 2, (560 + 622) / 2, 130, 10, 28);
    this.wall((DIVIDER_X + RIGHT_PIVOT.x + 6) / 2, (560 + 622) / 2, 130, 10, -28);
  }

  // ============================================================
  // BUMPERS
  // ============================================================
  createBumpers() {
    const spots = [
      { x: 520, y: 300 }, { x: 640, y: 250 }, { x: 760, y: 300 }
    ];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const img = this.add.image(s.x, s.y, 'pin_bumper').setDepth(5);
      const body = this.matter.add.circle(s.x, s.y, 28, {
        isStatic: true, restitution: 0.9, friction: 0,
        label: `bumper_${i}`
      });
      this.bumperBodies.push({ body, img, x: s.x, y: s.y });
    }
  }

  // ============================================================
  // RITE ELEMENTS — rollover lanes, drop-target bank, the rift
  // ============================================================
  createRollovers() {
    const spots = [{ x: 470, y: 190 }, { x: 565, y: 190 }, { x: 660, y: 190 }];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const img = this.add.image(s.x, s.y, 'pin_lamp').setDepth(4).setTint(0x2a4a4a);
      const body = this.matter.add.rectangle(s.x, s.y, 46, 18, {
        isStatic: true, isSensor: true, label: `roll_${i}`
      });
      this.rollLamps.push({ img, body, lit: false });
    }
  }

  createDropTargets() {
    const spots = [{ x: 442, y: 350 }, { x: 442, y: 392 }, { x: 442, y: 434 }];
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i];
      const img = this.add.image(s.x, s.y, 'pin_target').setDepth(4);
      const body = this.matter.add.rectangle(s.x, s.y, 16, 34, {
        isStatic: true, restitution: 0.4, label: `target_${i}`
      });
      this.dropTargets.push({ img, body, dropped: false });
    }
  }

  createRift() {
    const x = 640, y = 452, r = 22;
    const img = this.add.image(x, y, 'pin_rift').setDepth(4);
    const body = this.matter.add.circle(x, y, r, {
      isStatic: true, isSensor: true, label: 'rift'
    });
    this.rift = { img, body, x, y };
    this.tweens.add({
      targets: img, scale: { from: 0.9, to: 1.12 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
  }

  resetRolloverLamps() {
    for (const l of this.rollLamps) { l.lit = false; l.img.setTint(0x2a4a4a); }
  }

  resetDropTargets() {
    for (const t of this.dropTargets) {
      t.dropped = false;
      t.body.isSensor = false;
      t.img.setVisible(true);
    }
  }

  // Perimeter light-show lamps (Space Cadet's signature choreography).
  createShowLamps() {
    const spots = [
      { x: 430, y: 145 }, { x: 510, y: 145 }, { x: 590, y: 145 }, { x: 690, y: 145 }, { x: 770, y: 145 },
      { x: 410, y: 280 }, { x: 410, y: 420 }, { x: 410, y: 560 },
      { x: 810, y: 280 }, { x: 810, y: 420 }, { x: 810, y: 560 }
    ];
    for (const s of spots) {
      const img = this.add.image(s.x, s.y, 'pin_lamp').setDepth(3).setTint(0x223a3a).setScale(0.7);
      this.showLamps.push(img);
    }
  }

  // Chase around the perimeter, then an all-flash. Fired on rite completion.
  runLightShow() {
    this.tweens.killTweensOf(this.showLamps);
    this.showLamps.forEach((lamp, i) => {
      this.time.delayedCall(i * 45, () => {
        lamp.setTint(0xffd8a0);
        this.tweens.add({
          targets: lamp, scale: 1.1, duration: 120, yoyo: true, ease: 'Quad.easeOut',
          onComplete: () => lamp.setTint(0x223a3a)
        });
      });
    });
    const chaseTime = this.showLamps.length * 45 + 150;
    this.time.delayedCall(chaseTime, () => {
      for (const lamp of this.showLamps) {
        lamp.setTint(0x6ad0d0);
        this.tweens.add({
          targets: lamp, scale: 1.25, duration: 200, yoyo: true, repeat: 1, ease: 'Sine.easeInOut',
          onComplete: () => { lamp.setTint(0x223a3a); lamp.setScale(0.7); }
        });
      }
    });
    this.cameras.main.flash(280, 58, 106, 106);
  }

  // ============================================================
  // FLIPPERS (kinematic; repositioned around a fixed pivot)
  // ============================================================
  createFlippers() {
    this.flippers.left  = this.makeFlipper('left',  LEFT_PIVOT,  LEFT_REST,  LEFT_ACTIVE);
    this.flippers.right = this.makeFlipper('right', RIGHT_PIVOT, RIGHT_REST, RIGHT_ACTIVE);
  }

  makeFlipper(side, pivot, restDeg, activeDeg) {
    const img = this.add.image(pivot.x, pivot.y, 'pin_flipper').setDepth(7);
    img.setOrigin(0.1, 0.5);   // pivot near the left end of the sprite
    const body = this.matter.add.rectangle(pivot.x, pivot.y, FLIP_LEN, 16, {
      isStatic: true, restitution: 0.4, friction: 0.05,
      label: `flipper_${side}`
    });
    const f = { side, pivot, restDeg, activeDeg, img, body, theta: restDeg, held: false };
    this.setFlipperAngle(f, restDeg);
    return f;
  }

  setFlipperAngle(f, deg) {
    f.theta = deg;
    const rad = Phaser.Math.DegToRad(deg);
    // Body center sits half-length out from the pivot along the angle
    const cx = f.pivot.x + Math.cos(rad) * (FLIP_LEN / 2);
    const cy = f.pivot.y + Math.sin(rad) * (FLIP_LEN / 2);
    M.Body.setPosition(f.body, { x: cx, y: cy });
    M.Body.setAngle(f.body, rad);
    // Visual pivots at its 0.1 origin → place at the pivot point
    f.img.setPosition(f.pivot.x, f.pivot.y);
    f.img.setRotation(rad);
  }

  flip(side, down) {
    const f = this.flippers[side];
    if (!f || f.held === down) return;
    f.held = down;
    const target = down ? f.activeDeg : f.restDeg;
    this.tweens.killTweensOf(f);
    this.tweens.add({
      targets: f, theta: target,
      duration: down ? 45 : 90,
      ease: down ? 'Quad.easeOut' : 'Quad.easeIn',
      onUpdate: () => this.setFlipperAngle(f, f.theta)
    });
    if (down) {
      if (SFX.flipperThwack) SFX.flipperThwack();
      this.kickBallsWithFlipper(f);
    }
  }

  // On a flip press, give any ball resting on / near the flipper an upward,
  // inward velocity kick — the reliable-arcade momentum model.
  kickBallsWithFlipper(f) {
    for (const ball of this.balls) {
      const bx = ball.body.position.x, by = ball.body.position.y;
      const d = Phaser.Math.Distance.Between(bx, by, f.pivot.x, f.pivot.y);
      if (d < FLIP_LEN + 24 && by > 560) {
        const inward = f.side === 'left' ? 1 : -1;
        M.Body.setVelocity(ball.body, { x: inward * (2 + Math.random() * 2), y: -13 });
      }
    }
  }

  // ============================================================
  // CRT ticker + score/ball readout
  // ============================================================
  createCRT() {
    const g = this.add.graphics();
    g.fillStyle(0x081410, 0.95);
    g.fillRoundedRect(PF_LEFT - 8, 20, (OUTER_R + 8) - (PF_LEFT - 8), 84, 6);
    g.lineStyle(2, 0x3a6a6a, 0.7);
    g.strokeRoundedRect(PF_LEFT - 8, 20, (OUTER_R + 8) - (PF_LEFT - 8), 84, 6);

    this.crtText = this.add.text(640, 44, '', {
      fontFamily: '"Courier New", monospace', fontSize: '14px',
      color: '#6ad0d0', align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: '#3a6a6a', blur: 8, fill: true }
    }).setOrigin(0.5);

    this.scoreText = this.add.text(PF_LEFT + 4, 82, 'SCORE 0', {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(0, 0.5);
    this.rankText = this.add.text(640, 82, 'INITIATE', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'bold', color: '#6ad0d0', letterSpacing: 2
    }).setOrigin(0.5);
    this.ballsText = this.add.text(OUTER_R, 82, 'BALLS —', {
      fontFamily: '"Courier New", monospace', fontSize: '15px',
      fontStyle: 'bold', color: '#c9a961'
    }).setOrigin(1, 0.5);

    // Plunger power meter (right of the lane)
    this.powerMeter = this.add.graphics().setDepth(8);
  }

  updateCRT(msg) {
    if (this.crtText) this.crtText.setText(msg);
  }
  updateScoreUI() {
    if (this.scoreText) this.scoreText.setText(`SCORE ${this.score}`);
    if (this.ballsText) this.ballsText.setText(this.state === 'IDLE' ? 'BALLS —' : `BALLS ${this.ballsLeft}`);
  }
  updateRankUI() {
    if (this.rankText) this.rankText.setText(rankName(this.rankIndex));
  }
  // Show the active rite objective, unless an announcement is on screen.
  updateObjective() {
    if (this._announcing) return;
    this.updateCRT(this.missionEngine.objectiveText());
  }
  // Madame Veil speaks — override the CRT for a beat, then revert to the
  // objective. Punctuated by the eerie sting.
  veilAnnounce(line) {
    this._announcing = true;
    this.updateCRT(line);
    if (SFX.veilSting) SFX.veilSting();
    if (this._crtRevertTimer) this._crtRevertTimer.remove();
    this._crtRevertTimer = this.time.delayedCall(3800, () => {
      this._announcing = false;
      this.updateObjective();
    });
  }

  drawPowerMeter() {
    this.powerMeter.clear();
    if (this.state !== 'READY') return;
    const x = OUTER_R + 20, y0 = PF_BOTTOM, h = 180;
    this.powerMeter.fillStyle(0x1a0d08, 0.9);
    this.powerMeter.fillRect(x, y0 - h, 10, h);
    this.powerMeter.fillStyle(0xff6b35, 0.9);
    this.powerMeter.fillRect(x, y0 - h * this.charge, 10, h * this.charge);
    this.powerMeter.lineStyle(1, 0xc9a961, 0.7);
    this.powerMeter.strokeRect(x, y0 - h, 10, h);
  }

  // ============================================================
  // START / GAME FLOW
  // ============================================================
  createStartButton() {
    const x = 640, y = 380, w = 240, h = 56;
    this.startBtn = this.add.container(x, y).setDepth(20);
    const bg = this.add.graphics();
    bg.fillStyle(0x1a0d08, 0.97);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 8);
    bg.lineStyle(2, 0xc9a961, 0.9);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 8);
    const txt = this.add.text(0, 0, `START — ${ANTE} CHIPS`, {
      fontFamily: '"Courier New", monospace', fontSize: '18px',
      fontStyle: 'bold', color: '#c9a961', letterSpacing: 2
    }).setOrigin(0.5);
    this.startBtn.add([bg, txt]);
    const hit = this.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.startBtn.add(hit);
    hit.on('pointerover', () => txt.setColor('#ffd8a0'));
    hit.on('pointerout',  () => txt.setColor('#c9a961'));
    hit.on('pointerdown', () => this.startGame());
    this.startTxt = txt;
  }

  startGame() {
    if (this.state !== 'IDLE' && this.state !== 'GAMEOVER') return;
    if (this.registry.get('chips') < ANTE) {
      this.updateCRT('not enough chips. the machine stays cold.');
      return;
    }
    this.registry.set('chips', this.registry.get('chips') - ANTE);
    this.score = 0;
    this.ballsLeft = 3;
    this.startBtn.setVisible(false);

    // Fresh rites for the new game
    this.missionEngine.reset();
    this.rankIndex = 0;
    this._announcing = false;
    this.resetRolloverLamps();
    this.resetDropTargets();
    this.updateRankUI();
    this.updateScoreUI();

    this.spawnBall();
    // Madame Veil sets the first rite
    this.veilAnnounce(this.missionEngine.current().announce);
  }

  spawnBall() {
    this.state = 'READY';
    this.charge = 0;
    const ball = this.matter.add.image(LANE_X, 660, 'pin_ball', null, {
      shape: { type: 'circle', radius: BALL_R },
      restitution: 0.45, friction: 0.02, frictionAir: 0.006,
      density: 0.02, label: 'ball'
    }).setDepth(9);
    this.balls.push(ball);
    this.updateCRT(`ball ${4 - this.ballsLeft} of 3 — hold SPACE, then release`);
    this.updateScoreUI();
  }

  launchBall() {
    if (this.state !== 'READY') return;
    const ball = this.balls[this.balls.length - 1];
    if (!ball) return;
    const power = Math.max(0.2, this.charge);
    // Strong enough that even a light plunge clears the lane into the field.
    M.Body.setVelocity(ball.body, { x: 0, y: -(21 + power * 17) });
    if (SFX.plungerLaunch) SFX.plungerLaunch(power);
    this.state = 'PLAY';
    this.charge = 0;
    this.charging = false;
    this.drawPowerMeter();
    this.updateCRT('the sphere runs. keep it alive.');
  }

  drainBall(ball) {
    const idx = this.balls.indexOf(ball);
    if (idx >= 0) this.balls.splice(idx, 1);
    ball.destroy();
    if (SFX.drain) SFX.drain();

    this.ballsLeft--;
    if (this.ballsLeft > 0) {
      this.spawnBall();
    } else {
      this.gameOver();
    }
  }

  gameOver() {
    this.state = 'GAMEOVER';
    // Stop any pending rite-announce revert from overwriting the summary.
    this._announcing = false;
    if (this._crtRevertTimer) { this._crtRevertTimer.remove(); this._crtRevertTimer = null; }

    let msg;
    if (this.score > this.highScore) {
      this.highScore = this.score;
      GameState.setStat(this.game, 'pinballHighScore', this.highScore);
      msg = `NEW BEST — ${this.score}. the veil remembers you.`;
    } else {
      msg = `the veil closes. final score ${this.score}` +
            (this.highScore > 0 ? ` (best ${this.highScore}).` : '.');
    }
    this.updateCRT(msg);
    this.updateScoreUI();
    // C4 converts score → chip payout; for now just offer another game.
    this.startTxt.setText(`PLAY AGAIN — ${ANTE} CHIPS`);
    this.startBtn.setVisible(true);
  }

  // ============================================================
  // INPUT
  // ============================================================
  setupInput() {
    const kb = this.input.keyboard;
    this.keys = kb.addKeys({
      left1: Phaser.Input.Keyboard.KeyCodes.Z,
      left2: Phaser.Input.Keyboard.KeyCodes.LEFT,
      right1: Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH,
      right2: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      space: Phaser.Input.Keyboard.KeyCodes.SPACE
    });

    kb.on('keydown-Z', () => this.flip('left', true));
    kb.on('keyup-Z', () => this.flip('left', false));
    kb.on('keydown-LEFT', () => this.flip('left', true));
    kb.on('keyup-LEFT', () => this.flip('left', false));
    kb.on('keydown-FORWARD_SLASH', () => this.flip('right', true));
    kb.on('keyup-FORWARD_SLASH', () => this.flip('right', false));
    kb.on('keydown-RIGHT', () => this.flip('right', true));
    kb.on('keyup-RIGHT', () => this.flip('right', false));

    kb.on('keydown-SPACE', () => { if (this.state === 'READY') this.charging = true; });
    kb.on('keyup-SPACE', () => { if (this.state === 'READY') this.launchBall(); });

    // Stop arrow/space/slash from scrolling the page or triggering quick-find
    this.input.keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
      Phaser.Input.Keyboard.KeyCodes.FORWARD_SLASH
    ]);
  }

  // ============================================================
  // COLLISIONS
  // ============================================================
  setupCollisions() {
    this.matter.world.on('collisionstart', (event) => {
      for (const pair of event.pairs) {
        const a = pair.bodyA, b = pair.bodyB;
        const labels = [a.label, b.label];
        if (!labels.includes('ball')) continue;
        const other = a.label === 'ball' ? b : a;
        const ballBody = a.label === 'ball' ? a : b;
        const lbl = other.label || '';
        if (lbl.startsWith('bumper_')) {
          this.hitBumper(other, ballBody);
        } else if (lbl.startsWith('roll_')) {
          this.hitRollover(parseInt(lbl.slice(5), 10));
        } else if (lbl.startsWith('target_')) {
          this.hitTarget(parseInt(lbl.slice(7), 10));
        } else if (lbl === 'rift') {
          this.hitRift(ballBody);
        }
      }
    });
  }

  // ---- rite-element hits ----
  hitRollover(idx) {
    const lamp = this.rollLamps[idx];
    if (lamp && !lamp.lit) { lamp.lit = true; lamp.img.setTint(0xffd8a0); }
    this.registerHit('rollover', idx, 50);
  }

  hitTarget(idx) {
    const tgt = this.dropTargets[idx];
    if (!tgt || tgt.dropped) return;
    tgt.dropped = true;
    tgt.body.isSensor = true;              // ball now passes through
    tgt.img.setVisible(false);
    if (SFX.bumperPop) SFX.bumperPop();
    this.registerHit('target', idx, 100);
  }

  hitRift(ballBody) {
    // Eject the ball back up toward the bumpers (risk/reward, no stuck ball)
    M.Body.setVelocity(ballBody, { x: (Math.random() - 0.5) * 6, y: -11 });
    this.tweens.killTweensOf(this.rift.img);
    this.rift.img.setScale(1.3);
    this.tweens.add({ targets: this.rift.img, scale: 1, duration: 260, ease: 'Quad.easeOut' });
    if (SFX.veilSting) { /* rift uses its own eject cue via bumperPop below */ }
    if (SFX.bumperPop) SFX.bumperPop();
    this.registerHit('rift', 0, 150);
  }

  // Central hook: award base score, feed the mission engine, react.
  registerHit(trigger, id, baseScore) {
    this.score += baseScore;
    const r = this.missionEngine.hit(trigger, id);
    if (r.matched && r.progressed && !r.complete) {
      this.updateObjective();
    }
    if (r.matched && r.complete) {
      this.completeRite(r.mission);
    }
    this.updateScoreUI();
  }

  completeRite(mission) {
    this.score += mission.scoreReward;
    this.rankIndex = Math.min(8, this.rankIndex + 1);
    if (SFX.riteComplete) SFX.riteComplete();
    this.runLightShow();
    this.awardRankMarrow();   // marrow when pushing your all-time rank ceiling

    this.missionEngine.advance();
    const next = this.missionEngine.current();
    let line = next
      ? `RITE COMPLETE. ${next.announce}`
      : 'RITE COMPLETE. the rites are done — you see as she sees.';
    if (this._lastMarrowReward > 0) {
      line = `${rankName(this.rankIndex)} — the veil grants +${this._lastMarrowReward} marrow. ` + line;
    }
    this.veilAnnounce(line);

    // Fresh element state for the next rite
    this.resetRolloverLamps();
    this.resetDropTargets();

    this.updateRankUI();
    this.updateScoreUI();
  }

  hitBumper(bumperBody, ballBody) {
    const entry = this.bumperBodies.find(e => e.body === bumperBody);
    if (!entry) return;
    // Kick the ball outward from the bumper center
    const dx = ballBody.position.x - entry.x;
    const dy = ballBody.position.y - entry.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const speed = 9;
    M.Body.setVelocity(ballBody, { x: (dx / len) * speed, y: (dy / len) * speed });
    // Score + feed the 'bumper' rite (registerHit adds the base score)
    if (SFX.bumperPop) SFX.bumperPop();
    this.registerHit('bumper', 0, 100);
    entry.img.setTexture('pin_bumper_lit');
    this.tweens.killTweensOf(entry.img);
    entry.img.setScale(1.15);
    this.tweens.add({
      targets: entry.img, scale: 1, duration: 180, ease: 'Quad.easeOut',
      onComplete: () => entry.img.setTexture('pin_bumper')
    });
  }

  // ============================================================
  // UPDATE — charge + drain detection
  // ============================================================
  update(time, delta) {
    // Plunger charge
    if (this.state === 'READY' && this.charging) {
      this.charge = Math.min(1, this.charge + delta / 900);
      this.drawPowerMeter();
    }
    // Drain detection (only real balls in the field, not the lane rest)
    if (this.state === 'PLAY') {
      for (const ball of [...this.balls]) {
        const p = ball.body.position;
        // A ball that failed to clear the lane and settled back on the lane
        // floor gets re-armed for another plunge (authentic + prevents a
        // stuck ball), rather than draining.
        const inLane = p.x > DIVIDER_X + 2;
        const v = ball.body.velocity;
        const slow = Math.hypot(v.x, v.y) < 0.6;
        if (inLane && slow && p.y > 620) {
          this.state = 'READY';
          this.charge = 0;
          this.updateCRT('reload the sphere — hold SPACE, then release');
          continue;
        }
        if (p.y > PF_BOTTOM - 6 && !inLane) {
          this.drainBall(ball);
        }
      }
    }
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
    }).setOrigin(1, 0).setDepth(30);
    this.marrowText = this.add.text(1250, 44, `marrow: ${marrow}`, {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47'
    }).setOrigin(1, 0).setDepth(30);

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
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    }).setDepth(30);
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout',  () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.state === 'PLAY' || this.state === 'READY') {
        // Abandon the current ball/game cleanly
        this.balls.forEach(b => b.destroy());
        this.balls = [];
      }
      this.cameras.main.fadeOut(500, 5, 3, 2);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });
  }
}
