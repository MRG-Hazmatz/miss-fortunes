// RouletteWheel.js — wheel + ball renderer & spin animator.
// Owns nothing about betting; just visual state for the spin.
//
// Coordinate convention: Phaser screen coords. Angle 0 = east (right side).
// Angle increases clockwise. Wheel rotates CCW (negative angular velocity),
// ball orbits CW (positive angular velocity).

class RouletteWheel {
  constructor(scene, x, y, radius) {
    this.scene = scene;
    this.x = x;
    this.y = y;
    this.radius = radius;

    // European single-zero pocket sequence (counter-clockwise from 0).
    // Each pocket is 360/37 wide; the index here maps to its angular slot.
    this.POCKET_SEQUENCE = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
    this.RED_NUMBERS = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
    this.POCKETS = this.POCKET_SEQUENCE.length;
    this.POCKET_ANGLE = (Math.PI * 2) / this.POCKETS;

    // Ball lands at the top of the wheel for max readability
    this.BALL_LAND_ANGLE = -Math.PI / 2;

    this.isSpinning = false;
    this.create();
  }

  create() {
    // Container holds everything that rotates with the wheel
    this.wheelContainer = this.scene.add.container(this.x, this.y);

    // ----- Outer rim (decorative, doesn't rotate visually since circles
    // are rotation-symmetric, but lives in the container for grouping) -----
    const rim = this.scene.add.graphics();
    rim.fillStyle(0x1a1208, 1);
    rim.fillCircle(0, 0, this.radius + 18);
    rim.lineStyle(2, 0xa89050, 0.55);
    rim.strokeCircle(0, 0, this.radius + 18);
    // Chipped gold rim — a few darker streaks suggesting wear
    rim.lineStyle(1, 0x6a5030, 0.4);
    for (let s = 0; s < 5; s++) {
      const a = Math.random() * Math.PI * 2;
      const r1 = this.radius + 14;
      const r2 = this.radius + 18;
      rim.lineBetween(r1 * Math.cos(a), r1 * Math.sin(a), r2 * Math.cos(a), r2 * Math.sin(a));
    }
    this.wheelContainer.add(rim);

    // ----- Pockets — 37 wedge fills around the rim -----
    const pocketG = this.scene.add.graphics();
    for (let i = 0; i < this.POCKETS; i++) {
      const num = this.POCKET_SEQUENCE[i];
      const startA = i * this.POCKET_ANGLE;
      const endA = startA + this.POCKET_ANGLE;
      const color = num === 0
        ? 0x2e7a3a
        : (this.RED_NUMBERS.includes(num) ? 0x8a1a1a : 0x141414);
      pocketG.fillStyle(color, 1);
      pocketG.beginPath();
      pocketG.moveTo(0, 0);
      pocketG.arc(0, 0, this.radius, startA, endA, false);
      pocketG.closePath();
      pocketG.fillPath();
    }
    // Pocket dividers — thin gold radial lines
    pocketG.lineStyle(1, 0xa89050, 0.45);
    for (let i = 0; i < this.POCKETS; i++) {
      const a = i * this.POCKET_ANGLE;
      pocketG.lineBetween(0, 0, this.radius * Math.cos(a), this.radius * Math.sin(a));
    }
    this.wheelContainer.add(pocketG);

    // ----- Inner cone / hub — dark wood -----
    const hub = this.scene.add.graphics();
    hub.fillStyle(0x2a1810, 1);
    hub.fillCircle(0, 0, this.radius * 0.55);
    hub.lineStyle(2, 0xa89050, 0.6);
    hub.strokeCircle(0, 0, this.radius * 0.55);
    // Inner spokes — 8 thin radial accents on the hub
    hub.lineStyle(1, 0xa89050, 0.35);
    for (let i = 0; i < 8; i++) {
      const a = i * (Math.PI * 2 / 8);
      const r = this.radius * 0.55;
      hub.lineBetween(0, 0, r * Math.cos(a), r * Math.sin(a));
    }
    this.wheelContainer.add(hub);

    // ----- Center spindle — small brass disc -----
    const spindle = this.scene.add.graphics();
    spindle.fillStyle(0xa89050, 1);
    spindle.fillCircle(0, 0, 8);
    spindle.lineStyle(1, 0x8a7040, 1);
    spindle.strokeCircle(0, 0, 8);
    spindle.fillStyle(0xe8c547, 0.7);
    spindle.fillCircle(-2, -2, 2);
    this.wheelContainer.add(spindle);

    // ----- Pocket-color overlay highlights for the winning pocket later -----
    // We create a separate graphics that rotates with the wheel and gets
    // selectively filled on win for the pulse. Positioned identically.
    this.winnerPulse = this.scene.add.graphics();
    this.wheelContainer.add(this.winnerPulse);

    // ----- Ball — small bright sphere, lives OUTSIDE the wheel container
    // so it doesn't co-rotate with the wheel during the spin -----
    this.ball = this.scene.add.graphics();
    this.ball.fillStyle(0xffffff, 1);
    this.ball.fillCircle(0, 0, 5);
    this.ball.lineStyle(1, 0xa89050, 0.4);
    this.ball.strokeCircle(0, 0, 5);
    this.ball.setVisible(false);

    // Initial wheel rotation (small offset just so 0 isn't pointing east)
    this.wheelContainer.rotation = -Math.PI / 2;

    // Soft ambient glow under the wheel (lamp cone simulation)
    const glow = this.scene.add.graphics();
    glow.fillStyle(0xffd8a0, 0.06);
    glow.fillCircle(0, 0, this.radius + 60);
    glow.fillStyle(0xffd8a0, 0.04);
    glow.fillCircle(0, 0, this.radius + 100);
    glow.setPosition(this.x, this.y);
    this.scene.children.bringToTop(this.wheelContainer);
    this.scene.children.bringToTop(this.ball);
  }

  // Spin to a predetermined winning number. Returns nothing; calls onLand
  // when the ball has finished its bounce settle.
  spin(winningNumber, durationMs, onLand) {
    if (this.isSpinning) return;
    this.isSpinning = true;

    const winnerIdx = this.POCKET_SEQUENCE.indexOf(winningNumber);

    // Where the wheel must end up so the winning pocket sits under the ball.
    // ball ends at BALL_LAND_ANGLE (top). pocket(winnerIdx) world angle =
    // wheelRotation + winnerIdx * POCKET_ANGLE. Solve for wheelRotation.
    const wheelExtraRotations = 5 + Math.floor(Math.random() * 3); // 5–7 full CCW
    const targetWheelAngle =
      this.BALL_LAND_ANGLE
      - winnerIdx * this.POCKET_ANGLE
      - wheelExtraRotations * Math.PI * 2;

    // Tween the wheel container's rotation
    this.scene.tweens.add({
      targets: this.wheelContainer,
      rotation: targetWheelAngle,
      duration: durationMs,
      ease: 'Expo.easeOut'
    });

    // Ball orbit — CW (angle increasing). Starts on the east side at radius
    // R+12, ends at top at R-8. Radius spirals inward as ball loses momentum.
    const startAngle = 0;
    const ballExtraOrbits = 6 + Math.floor(Math.random() * 3);
    const endAngle = this.BALL_LAND_ANGLE + Math.PI * 2 * ballExtraOrbits;
    const ballState = { angle: startAngle, radius: this.radius + 12 };

    this.ball.setVisible(true);
    this.updateBallPosition(ballState);

    // Spin whoosh
    if (typeof SFX !== 'undefined' && SFX.wheelSpin) SFX.wheelSpin();

    this.scene.tweens.add({
      targets: ballState,
      angle: endAngle,
      radius: this.radius - 8,
      duration: durationMs,
      ease: 'Expo.easeOut',
      onUpdate: () => this.updateBallPosition(ballState),
      onComplete: () => this.bounceBall(winnerIdx, () => {
        this.isSpinning = false;
        if (typeof SFX !== 'undefined' && SFX.ballLand) SFX.ballLand();
        if (onLand) onLand(winningNumber);
      })
    });
  }

  updateBallPosition(state) {
    this.ball.setPosition(
      this.x + state.radius * Math.cos(state.angle),
      this.y + state.radius * Math.sin(state.angle)
    );
  }

  // Ball hops between 2–3 adjacent pockets before settling on the winner.
  // Sells the physics even though the destination was predetermined.
  bounceBall(winnerIdx, callback) {
    const hopCount = 2 + Math.floor(Math.random() * 2); // 2 or 3
    const dir = Math.random() > 0.5 ? 1 : -1;
    const sequence = [];
    for (let h = hopCount; h >= 1; h--) sequence.push(winnerIdx + dir * h);
    sequence.push(winnerIdx); // final settle

    let i = 0;
    const wheelRot = this.wheelContainer.rotation;
    const settleRadius = this.radius - 6;

    const next = () => {
      if (i >= sequence.length) { callback(); return; }
      const idx = sequence[i];
      // World angle of the center of the target pocket
      const pocketAngle = wheelRot + idx * this.POCKET_ANGLE + this.POCKET_ANGLE / 2;
      const tx = this.x + settleRadius * Math.cos(pocketAngle);
      const ty = this.y + settleRadius * Math.sin(pocketAngle);
      this.scene.tweens.add({
        targets: this.ball,
        x: tx, y: ty,
        duration: 130 + Math.random() * 60,
        ease: 'Sine.easeInOut',
        onComplete: () => {
          if (typeof SFX !== 'undefined' && SFX.ballBounce) SFX.ballBounce();
          i++; next();
        }
      });
    };
    next();
  }

  // Pulse overlay on the winning pocket — calls after spin lands
  highlightWinner(winningNumber) {
    const idx = this.POCKET_SEQUENCE.indexOf(winningNumber);
    const startA = idx * this.POCKET_ANGLE;
    const endA = startA + this.POCKET_ANGLE;
    const color = winningNumber === 0
      ? 0x6aff80
      : (this.RED_NUMBERS.includes(winningNumber) ? 0xff6b6b : 0xe8e8e8);

    this.winnerPulse.clear();
    this.winnerPulse.fillStyle(color, 1);
    this.winnerPulse.beginPath();
    this.winnerPulse.moveTo(0, 0);
    this.winnerPulse.arc(0, 0, this.radius, startA, endA, false);
    this.winnerPulse.closePath();
    this.winnerPulse.fillPath();
    this.winnerPulse.setAlpha(0);

    this.scene.tweens.add({
      targets: this.winnerPulse,
      alpha: { from: 0.9, to: 0 },
      duration: 1400,
      yoyo: true, repeat: 1,
      ease: 'Sine.easeInOut'
    });
  }

  // Reset for the next spin — keep wheel where it is (don't snap), just hide ball.
  // The next spin will tween from current rotation so it feels continuous.
  resetForNextSpin() {
    this.ball.setVisible(false);
    this.winnerPulse.clear();
  }
}
