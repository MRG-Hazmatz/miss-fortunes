// Bookie.js — the off-track betting shop in the back office.
// A cramped room with a chunky CRT TV, an odds chalkboard, and a counter.
// The parlor's warm amber gives way to cold fluorescent green down here.
// Horse data is stable across races; odds and results roll fresh each round.
//
// State machine: IDLE → PLACED → RACING → RESULTS → (IDLE)
// Bet flow: pick horse → pick chip size → PLACE BET → watch CRT → payout → RACE AGAIN.

class Bookie extends Phaser.Scene {
  constructor() {
    super('Bookie');

    // Horse roster. Odds are re-rolled per race inside each horse's range.
    // The ranges are tuned so normalized win probabilities roughly match the
    // fractional odds stated on the card — no house edge, just drama.
    // Odds ranges overlap significantly on purpose — the "favorite" isn't
    // guaranteed to be Widow's Walk each race. Player has to READ THE BOARD
    // every time, not just muscle-memory-pick the top horse. Names carry
    // reputation, not certainty.
    this.HORSE_CONFIG = [
      { name: "WIDOW'S WALK",   minOdds: 2, maxOdds: 5,  body: 0xa89478, jockey: 0xe8c547 },
      { name: "CINDER",         minOdds: 2, maxOdds: 6,  body: 0xc24f2a, jockey: 0x1a0d08 },
      { name: "CORBIN'S BANE",  minOdds: 3, maxOdds: 8,  body: 0x7a1a1a, jockey: 0xc9a961 },
      { name: "ASHEN MARE",     minOdds: 4, maxOdds: 10, body: 0xa8a899, jockey: 0x6a4020 },
      { name: "HANGMAN'S ECHO", minOdds: 5, maxOdds: 12, body: 0x3a1a1a, jockey: 0xff1744 }
    ];

    this.betOptions = [1, 5, 10, 25];
    this.currentBet = 5;

    // Bet types — selection rules, finish-condition, and payout multipliers.
    //   count       = how many horses must be picked
    //   ordered     = picks must finish in the exact selected order
    //   multiplier  = applied to product-of-odds. <1 dampens variance for
    //                 wider bets so a Superfecta on 4 longshots doesn't pay
    //                 the GDP of a small country, while keeping the dream alive.
    this.BET_TYPES = ['WIN', 'QUINELLA', 'EXACTA', 'TRIFECTA', 'SUPERFECTA'];
    this.BET_PROFILES = {
      WIN:        { count: 1, ordered: false, multiplier: 1.0 },
      QUINELLA:   { count: 2, ordered: false, multiplier: 0.5 },
      EXACTA:     { count: 2, ordered: true,  multiplier: 1.0 },
      TRIFECTA:   { count: 3, ordered: true,  multiplier: 0.7 },
      SUPERFECTA: { count: 4, ordered: true,  multiplier: 0.6 }
    };

    // CRT screen interior (where the race plays)
    this.CRT_X = 640;
    this.CRT_Y = 250;
    this.CRT_OUTER_W = 800;
    this.CRT_OUTER_H = 420;
    this.CRT_INNER_W = 720;
    this.CRT_INNER_H = 340;

    // Race track inside the CRT screen
    this.TRACK_START_X = 305;
    this.TRACK_END_X = 965;
    this.LANE_YS = [155, 200, 245, 290, 335];

    this.RACE_MIN_DUR = 26;
    this.RACE_MAX_DUR = 32;
  }

  create() {
    this.cameras.main.resetFX();
    this.cameras.main.fadeIn(600, 5, 8, 5);

    // Per-scene state (constructor doesn't fire on restart)
    this.horses = this.HORSE_CONFIG.map(h => ({ ...h }));
    this.betType = 'WIN';
    this.selectedHorses = [];   // ordered array of horse indices (length depends on betType)
    this.state = 'IDLE';
    this.race = null;
    this.displayedChips = this.registry.get('chips');
    this._chipTween = null;
    this.horseSprites = [];
    this.oddsCards = [];

    this.createStaticTextures();
    this.createEnvironment();
    this.createTitleBar();
    this.createCRT();
    this.createRaceView();     // hidden until race starts
    this.createIdleOverlay();  // CRT idle "AWAITING WAGER" text + heavy static
    this.createResultsBoard(); // hidden until RESULTS
    this.createOddsBoard();
    this.createBetTypeSelector();
    this.createBetControls();
    this.createBackButton();

    this.rollNewOdds();
    this.updateOddsBoard();
    this.updateBetButtons();
    this.updatePlaceBetButton();

    // CRT static ticker — swaps the static texture and nudges alpha so it
    // feels genuinely unstable instead of a looping gif.
    this._staticTick = 0;
    this.time.addEvent({
      delay: 75, loop: true,
      callback: () => this.tickStatic()
    });
  }

  // ----------------------------------------------------------------------
  // Static (CRT noise) textures — pre-generate a few variants to cycle
  // through, which is far cheaper than redrawing per frame.
  // ----------------------------------------------------------------------
  createStaticTextures() {
    if (this.textures.exists('crt_static_0')) return;
    for (let v = 0; v < 4; v++) {
      const gfx = this.make.graphics({ add: false });
      // Background washed green to match fluorescent palette
      gfx.fillStyle(0x0a1208, 1);
      gfx.fillRect(0, 0, 240, 120);
      for (let x = 0; x < 240; x += 2) {
        for (let y = 0; y < 120; y += 2) {
          const r = Math.random();
          if (r > 0.72) {
            const gray = 0x40 + Math.floor(Math.random() * 0x80);
            const color = (gray << 16) | (gray << 8) | gray;
            gfx.fillStyle(color, r - 0.3);
            gfx.fillRect(x, y, 2, 2);
          }
        }
      }
      gfx.generateTexture(`crt_static_${v}`, 240, 120);
      gfx.destroy();
    }
  }

  tickStatic() {
    if (!this.staticImage) return;
    this._staticTick = (this._staticTick + 1) % 4;
    this.staticImage.setTexture(`crt_static_${this._staticTick}`);

    // Static level per game state:
    //  IDLE    — heavy, "no signal / awaiting wager"   (~0.55 + small wobble)
    //  RACING  — clean broadcast, basically nothing    (~0.02, no wobble)
    //  RESULTS — light, broadcast winding down         (~0.12 + small wobble)
    // The old 2% random-spike boost is gone during RACING — it was causing
    // the race footage to look like a bad composite.
    if (this.state === 'RACING') {
      this.staticImage.setAlpha(0.02);
      return;
    }
    const base = this.state === 'IDLE' ? 0.55 : 0.12;
    this.staticImage.setAlpha(base + (Math.random() - 0.5) * 0.06);
    if (this.state === 'IDLE' && Math.random() < 0.02) {
      this.staticImage.setAlpha(Math.min(1, this.staticImage.alpha + 0.4));
    }
  }

  // Brief positional jitter on the race container — fires when a surge hits,
  // to simulate signal interference during a dramatic moment. NOT static —
  // just a ±3px horizontal shake for ~100ms.
  surgeJitter() {
    if (!this.raceView) return;
    const baseX = this.raceView._baseX || 0;
    const dx = (Math.random() < 0.5 ? -1 : 1) * 3;
    this.raceView.x = baseX + dx;
    this.time.delayedCall(50, () => {
      if (this.raceView) this.raceView.x = baseX - dx;
    });
    this.time.delayedCall(100, () => {
      if (this.raceView) this.raceView.x = baseX;
    });
  }

  // ----------------------------------------------------------------------
  // Environment — walls, floor, fluorescent tube, scattered betting slips
  // ----------------------------------------------------------------------
  createEnvironment() {
    const g = this.add.graphics();

    // Back wall — slightly green-tinted dark
    g.fillStyle(0x0b1008, 1);
    g.fillRect(0, 0, 1280, 720);

    // Horizontal wall paneling lines
    g.lineStyle(1, 0x1a2413, 0.35);
    for (let y = 90; y < 600; y += 34) g.lineBetween(0, y, 1280, y);

    // Vertical panel seams
    for (let x = 280; x < 1280; x += 320) {
      g.lineStyle(1, 0x0f1a0c, 0.5);
      g.lineBetween(x, 0, x, 600);
    }

    // Water-damage splotches
    g.fillStyle(0x1c2414, 0.5);
    g.fillEllipse(180, 120, 140, 40);
    g.fillEllipse(1080, 200, 90, 35);
    g.fillEllipse(340, 540, 180, 28);

    // Ceiling mount — fluorescent tube fixture (cold green light)
    g.fillStyle(0x1a1a1a, 1);
    g.fillRect(420, 0, 440, 16);
    // the bulb
    g.fillStyle(0xd8ffd8, 0.9);
    g.fillRect(432, 5, 416, 7);
    // bulb highlight
    g.fillStyle(0xffffff, 0.4);
    g.fillRect(440, 6, 400, 2);
    // mount brackets
    g.fillStyle(0x2a2a2a, 1);
    g.fillRect(420, 0, 16, 22);
    g.fillRect(844, 0, 16, 22);

    // Fluorescent light cone — cold green wash over the room
    g.fillStyle(0x6aff80, 0.04);
    g.fillTriangle(520, 16, 760, 16, 1080, 460);
    g.fillTriangle(520, 16, 760, 16, 200, 460);
    g.fillStyle(0x6aff80, 0.025);
    g.fillTriangle(420, 16, 860, 16, 1280, 600);
    g.fillTriangle(420, 16, 860, 16, 0, 600);

    // Fluorescent flicker on the tube — occasional dim
    const tube = this.add.rectangle(640, 8, 416, 7, 0xd8ffd8);
    tube.setAlpha(0);
    this.tweens.add({
      targets: tube,
      alpha: { from: 0, to: 0.2 },
      duration: 80,
      yoyo: true, repeat: -1,
      ease: 'Quad.easeInOut',
      repeatDelay: 3000 + Math.random() * 4000
    });

    // Counter/window — horizontal strip across the bottom third
    g.fillStyle(0x0a0605, 1);
    g.fillRect(0, 600, 1280, 120);
    g.fillStyle(0x1a1210, 1);
    g.fillRect(0, 598, 1280, 4);
    // Counter front trim
    g.lineStyle(1, 0x2a1810, 0.8);
    g.lineBetween(0, 660, 1280, 660);

    // Scattered betting slips (pale torn rectangles)
    const slipPositions = [
      [80, 680, 0.18], [220, 694, -0.14], [380, 672, 0.22],
      [1180, 688, -0.18], [1060, 676, 0.12], [920, 696, -0.08]
    ];
    slipPositions.forEach(([x, y, rot]) => {
      const s = this.add.graphics();
      s.fillStyle(0x8b6f47, 0.3);
      s.fillRect(-20, -13, 40, 26);
      s.lineStyle(1, 0x6a5030, 0.5);
      s.strokeRect(-20, -13, 40, 26);
      s.lineStyle(0.5, 0x4a3a25, 0.6);
      s.lineBetween(-14, -5, 12, -5);
      s.lineBetween(-14, 0, 8, 0);
      s.lineBetween(-14, 5, 14, 5);
      s.setPosition(x, y);
      s.setRotation(rot);
    });

    // Cigarette stub near the counter
    const stub = this.add.graphics();
    stub.fillStyle(0xe8d4a0, 1);
    stub.fillRect(-6, -1, 8, 2);
    stub.fillStyle(0x3a1515, 1);
    stub.fillRect(2, -1, 4, 2);
    stub.setPosition(500, 688);
    stub.setRotation(0.4);

    // Empty glass near the counter
    const glass = this.add.graphics();
    glass.fillStyle(0x6a8560, 0.15);
    glass.fillRect(-8, -12, 16, 24);
    glass.lineStyle(1, 0xaabba0, 0.4);
    glass.strokeRect(-8, -12, 16, 24);
    glass.setPosition(1140, 680);
  }

  // ----------------------------------------------------------------------
  // Title bar — keep it amber so the parlor identity carries through
  // ----------------------------------------------------------------------
  createTitleBar() {
    this.add.text(640, 30, 'THE BOOKIE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#c9a961',
      stroke: '#2a1810', strokeThickness: 2,
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    }).setOrigin(0.5);

    this.add.text(640, 52, '— off-track —', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#8b6f47'
    }).setOrigin(0.5);

    this.chipText = this.add.text(1240, 28, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '18px',
      color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 6, fill: true }
    }).setOrigin(1, 0);
    this.updateChipDisplay(0);
  }

  createBackButton() {
    const back = this.add.text(30, 24, '< back to parlor', {
      fontFamily: '"Courier New", monospace', fontSize: '16px', color: '#6a5030'
    });
    back.setInteractive({ useHandCursor: true });
    back.on('pointerover', () => back.setColor('#c9a961'));
    back.on('pointerout', () => back.setColor('#6a5030'));
    back.on('pointerdown', () => {
      if (this.state === 'RACING') return;  // don't bail mid-race
      this.cameras.main.fadeOut(600, 5, 8, 5);
      this.cameras.main.once('camerafadeoutcomplete', () => this.scene.start('Parlor'));
    });
  }

  // ----------------------------------------------------------------------
  // CRT cabinet + inner screen — plastic frame, knobs, brand sticker
  // ----------------------------------------------------------------------
  createCRT() {
    const g = this.add.graphics();
    const { CRT_X, CRT_Y, CRT_OUTER_W, CRT_OUTER_H, CRT_INNER_W, CRT_INNER_H } = this;

    // Outer cabinet plastic — slight bevel via two layers
    g.fillStyle(0x0a0a0a, 1);
    g.fillRoundedRect(CRT_X - CRT_OUTER_W / 2, CRT_Y - CRT_OUTER_H / 2, CRT_OUTER_W, CRT_OUTER_H, 14);
    g.lineStyle(1, 0x2a2a2a, 0.9);
    g.strokeRoundedRect(CRT_X - CRT_OUTER_W / 2, CRT_Y - CRT_OUTER_H / 2, CRT_OUTER_W, CRT_OUTER_H, 14);

    // Darker inset — where the tube meets the plastic
    g.fillStyle(0x000000, 1);
    g.fillRoundedRect(CRT_X - CRT_INNER_W / 2 - 6, CRT_Y - CRT_INNER_H / 2 - 6, CRT_INNER_W + 12, CRT_INNER_H + 12, 10);

    // Inner screen background (very dark green, like phosphor)
    g.fillStyle(0x040806, 1);
    g.fillRoundedRect(CRT_X - CRT_INNER_W / 2, CRT_Y - CRT_INNER_H / 2, CRT_INNER_W, CRT_INNER_H, 6);

    // Brand sticker bottom-right of cabinet
    this.add.text(CRT_X + CRT_OUTER_W / 2 - 20, CRT_Y + CRT_OUTER_H / 2 - 14, 'PANASCREEN', {
      fontFamily: '"Courier New", monospace',
      fontSize: '10px',
      color: '#4a3a25'
    }).setOrigin(1, 0.5);

    // Two control knobs bottom-left
    const knob1 = this.add.graphics();
    knob1.fillStyle(0x1a1a1a, 1);
    knob1.fillCircle(0, 0, 9);
    knob1.lineStyle(1, 0x4a4a4a, 0.8);
    knob1.strokeCircle(0, 0, 9);
    knob1.lineStyle(1, 0x6a6a6a, 0.9);
    knob1.lineBetween(0, 0, 6, -3);
    knob1.setPosition(CRT_X - CRT_OUTER_W / 2 + 30, CRT_Y + CRT_OUTER_H / 2 - 18);

    const knob2 = this.add.graphics();
    knob2.fillStyle(0x1a1a1a, 1);
    knob2.fillCircle(0, 0, 9);
    knob2.lineStyle(1, 0x4a4a4a, 0.8);
    knob2.strokeCircle(0, 0, 9);
    knob2.lineStyle(1, 0x6a6a6a, 0.9);
    knob2.lineBetween(0, 0, -2, -6);
    knob2.setPosition(CRT_X - CRT_OUTER_W / 2 + 58, CRT_Y + CRT_OUTER_H / 2 - 18);

    // Power LED (red dot)
    const led = this.add.graphics();
    led.fillStyle(0xff1744, 1);
    led.fillCircle(0, 0, 2);
    led.setPosition(CRT_X + CRT_OUTER_W / 2 - 30, CRT_Y + CRT_OUTER_H / 2 - 18);
    this.tweens.add({
      targets: led,
      alpha: { from: 1, to: 0.4 },
      duration: 1400, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // Screen contents live in a container scoped to the inner screen rect,
    // so everything I add inside positions relative to the tube's center.
    // I don't actually clip to the rectangle — Phaser containers aren't
    // masks by default — but all my drawing stays inside it by design.
    this.crtContainer = this.add.container(CRT_X, CRT_Y);

    // Static layer — tiled across the inner screen
    this.staticImage = this.add.image(0, 0, 'crt_static_0')
      .setDisplaySize(CRT_INNER_W, CRT_INNER_H)
      .setAlpha(0.55);
    this.crtContainer.add(this.staticImage);

    // Persistent scanlines on top of everything inside the CRT
    const scan = this.add.graphics();
    scan.fillStyle(0x000000, 0.35);
    for (let sy = -CRT_INNER_H / 2; sy < CRT_INNER_H / 2; sy += 3) {
      scan.fillRect(-CRT_INNER_W / 2, sy, CRT_INNER_W, 1);
    }
    this.crtContainer.add(scan);
    // Soft phosphor vignette
    const vig = this.add.graphics();
    vig.lineStyle(8, 0x000000, 0.5);
    vig.strokeRoundedRect(-CRT_INNER_W / 2, -CRT_INNER_H / 2, CRT_INNER_W, CRT_INNER_H, 6);
    this.crtContainer.add(vig);
    this.scanlinesLayer = scan;
    this.vignetteLayer = vig;
  }

  // ----------------------------------------------------------------------
  // Race view — track, horses, finish line. Lives inside crtContainer.
  // ----------------------------------------------------------------------
  createRaceView() {
    const { CRT_INNER_W, CRT_INNER_H, TRACK_START_X, TRACK_END_X, LANE_YS, CRT_X, CRT_Y } = this;

    // Absolute-coordinate container that mirrors the CRT screen position;
    // horses use world coordinates so lane math stays simple.
    this.raceView = this.add.container(0, 0);
    this.raceView.setVisible(false);

    const g = this.add.graphics();

    // Sky/backdrop of the broadcast — very dark green
    g.fillStyle(0x0e1a0c, 0.85);
    g.fillRect(TRACK_START_X - 10, CRT_Y - CRT_INNER_H / 2 + 40,
               TRACK_END_X - TRACK_START_X + 20, CRT_INNER_H - 60);

    // Track lane separators — chalky white
    g.lineStyle(1, 0xaabca8, 0.4);
    for (let i = 0; i <= LANE_YS.length; i++) {
      const y = (i === 0 ? LANE_YS[0] - 22
                        : i === LANE_YS.length ? LANE_YS[LANE_YS.length - 1] + 22
                        : (LANE_YS[i - 1] + LANE_YS[i]) / 2) + (CRT_Y - 250);
      g.lineBetween(TRACK_START_X, y, TRACK_END_X, y);
    }

    // Start gate — vertical white line
    g.lineStyle(2, 0xaabca8, 0.8);
    g.lineBetween(TRACK_START_X, LANE_YS[0] - 22, TRACK_START_X, LANE_YS[4] + 22);

    // Finish line — checkered pattern (alternating rects)
    const finishG = this.add.graphics();
    for (let i = 0; i < 20; i++) {
      const y = LANE_YS[0] - 22 + i * ((LANE_YS[4] + 22 - LANE_YS[0] + 22) / 20);
      const h = (LANE_YS[4] + 22 - LANE_YS[0] + 22) / 20;
      finishG.fillStyle(i % 2 === 0 ? 0xffffff : 0x1a1a1a, 0.75);
      finishG.fillRect(TRACK_END_X - 4, y, 6, h);
    }

    // Scoreboard strip at top of CRT — shows race state and elapsed time
    const board = this.add.graphics();
    board.fillStyle(0x000000, 0.6);
    board.fillRect(TRACK_START_X - 10, CRT_Y - CRT_INNER_H / 2 + 8, TRACK_END_X - TRACK_START_X + 20, 30);
    board.lineStyle(1, 0x4a6a4a, 0.6);
    board.strokeRect(TRACK_START_X - 10, CRT_Y - CRT_INNER_H / 2 + 8, TRACK_END_X - TRACK_START_X + 20, 30);

    this.raceLabelText = this.add.text(TRACK_START_X, CRT_Y - CRT_INNER_H / 2 + 23, 'POST', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      color: '#8aff9b'
    }).setOrigin(0, 0.5);

    this.raceTimerText = this.add.text(TRACK_END_X, CRT_Y - CRT_INNER_H / 2 + 23, '0.0s', {
      fontFamily: '"Courier New", monospace',
      fontSize: '12px',
      color: '#8aff9b'
    }).setOrigin(1, 0.5);

    this.raceView.add([g, finishG, board, this.raceLabelText, this.raceTimerText]);

    // Commentary line — sits just below the scoreboard, center-aligned.
    // Gets overwritten by setCommentary() for leader changes, surges, photo finishes.
    this.raceCommentaryText = this.add.text(CRT_X, CRT_Y - CRT_INNER_H / 2 + 58, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#e8c547',
      shadow: { offsetX: 0, offsetY: 0, color: '#e8c547', blur: 10, fill: true }
    }).setOrigin(0.5).setAlpha(0);
    this.raceView.add(this.raceCommentaryText);

    // Horse sprites — lo-fi silhouettes per lane
    this.horseSprites = [];
    for (let i = 0; i < 5; i++) {
      const sprite = this.buildHorseSprite(this.HORSE_CONFIG[i].body, this.HORSE_CONFIG[i].jockey);
      sprite.setPosition(TRACK_START_X, LANE_YS[i]);
      this.raceView.add(sprite);
      this.horseSprites.push(sprite);

      // Lane number tag on the sprite's left, so the player can tell who's who
      const tag = this.add.text(TRACK_START_X - 18, LANE_YS[i], `${i + 1}`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '11px',
        color: '#aabca8'
      }).setOrigin(0.5);
      this.raceView.add(tag);
    }

    // Player markers — array of downward-pointing chevrons, one per picked
    // horse. For ordered bets each chevron has a predicted-finish number
    // (1, 2, 3, 4) embedded above it; for unordered (QUINELLA/WIN) just the
    // chevron. Built fresh each race in rebuildPlayerMarkers().
    this.playerMarkers = [];

    // Bring the scanlines/vignette to the very top of the crtContainer
    this.crtContainer.bringToTop(this.scanlinesLayer);
    this.crtContainer.bringToTop(this.vignetteLayer);
  }

  // Build one race-time chevron marker. `numberLabel` is null for unnumbered
  // (WIN / QUINELLA) or '1'/'2'/'3'/'4' for ordered bets. Container origin
  // is at the chevron tip — set position to (sprite.x, sprite.y - 22) and
  // the chevron points down at the horse with the number floating above.
  buildPlayerMarker(numberLabel) {
    const c = this.add.container(0, 0);
    const gfx = this.add.graphics();
    gfx.fillStyle(0xff6b35, 1);
    gfx.fillTriangle(-7, -10, 7, -10, 0, 0);
    gfx.lineStyle(1, 0xffd8c0, 0.9);
    gfx.strokeTriangle(-7, -10, 7, -10, 0, 0);
    c.add(gfx);

    if (numberLabel) {
      const t = this.add.text(0, -14, numberLabel, {
        fontFamily: '"Courier New", monospace', fontSize: '11px',
        fontStyle: 'bold', color: '#ffe6b3',
        stroke: '#0a0605', strokeThickness: 2
      }).setOrigin(0.5, 1);
      c.add(t);
    }

    this.raceView.add(c);
    this.tweens.add({
      targets: c,
      scaleX: { from: 1, to: 1.35 }, scaleY: { from: 1, to: 1.35 },
      duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });
    return c;
  }

  // Tear down old markers and build a fresh set for the upcoming race.
  // Called from startRace() so the markers reflect the current bet's
  // picks + ordering at the moment the race kicks off.
  rebuildPlayerMarkers() {
    if (this.playerMarkers) {
      this.playerMarkers.forEach(m => {
        this.tweens.killTweensOf(m);
        m.destroy();
      });
    }
    this.playerMarkers = [];
    if (this.selectedHorses.length === 0) return;

    const profile = this.BET_PROFILES[this.betType];
    this.selectedHorses.forEach((horseIdx, pickIdx) => {
      const numberLabel = profile.ordered ? String(pickIdx + 1) : null;
      const marker = this.buildPlayerMarker(numberLabel);
      marker._horseIdx = horseIdx;  // for the per-frame position sync
      marker.setPosition(this.TRACK_START_X, this.LANE_YS[horseIdx] - 22);
      this.playerMarkers.push(marker);
    });
  }

  buildHorseSprite(bodyColor, jockeyColor) {
    const c = this.add.container(0, 0);
    const g = this.add.graphics();

    // Body — flat silhouette, stylized
    g.fillStyle(bodyColor, 1);
    g.fillRect(-10, -3, 20, 7);    // torso
    g.fillRect(8, -5, 4, 4);       // neck/head extension
    g.fillRect(11, -6, 3, 3);      // head
    // Legs (two visible sets to suggest stride)
    g.fillRect(-8, 4, 2, 5);
    g.fillRect(-4, 4, 2, 5);
    g.fillRect(4, 4, 2, 5);
    g.fillRect(8, 4, 2, 5);
    // Tail
    g.fillRect(-13, -2, 3, 5);

    // Jockey on top
    g.fillStyle(jockeyColor, 1);
    g.fillRect(-2, -8, 5, 4);       // torso
    g.fillRect(-1, -11, 3, 3);      // head
    // Jockey arm/whip
    g.fillRect(3, -7, 3, 1);

    c.add(g);
    return c;
  }

  // ----------------------------------------------------------------------
  // CRT idle overlay — "AWAITING WAGER" text shown when not racing
  // ----------------------------------------------------------------------
  createIdleOverlay() {
    // These texts are added to crtContainer (which is at world CRT_X, CRT_Y),
    // so we use container-LOCAL coords here. Using world coords would double
    // the position and pin the text to (2*CRT_X, ...) — off-screen right.
    this.idleText1 = this.add.text(0, -20, 'AWAITING WAGER', {
      fontFamily: '"Courier New", monospace',
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#8aff9b',
      shadow: { offsetX: 0, offsetY: 0, color: '#8aff9b', blur: 12, fill: true }
    }).setOrigin(0.5);

    this.idleText2 = this.add.text(0, 12, 'pick a horse, pick your poison', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      color: '#5a8a5a'
    }).setOrigin(0.5);

    // Gentle pulse on idle text
    this.tweens.add({
      targets: [this.idleText1, this.idleText2],
      alpha: { from: 1, to: 0.6 },
      duration: 1800,
      yoyo: true, repeat: -1, ease: 'Sine.easeInOut'
    });

    // Keep idle text below scanlines (inside the crtContainer so scanlines
    // overlay it, not the other way around).
    this.crtContainer.add([this.idleText1, this.idleText2]);
    // Re-lift scanlines/vignette so they sit on top
    this.crtContainer.bringToTop(this.scanlinesLayer);
    this.crtContainer.bringToTop(this.vignetteLayer);
  }

  // ----------------------------------------------------------------------
  // Results board — appears after race finishes
  // ----------------------------------------------------------------------
  createResultsBoard() {
    const { CRT_X, CRT_Y, CRT_INNER_W, CRT_INNER_H } = this;

    this.resultsContainer = this.add.container(CRT_X, CRT_Y);
    this.resultsContainer.setVisible(false);

    // Backdrop
    const bg = this.add.graphics();
    bg.fillStyle(0x000000, 0.82);
    bg.fillRoundedRect(-CRT_INNER_W / 2 + 20, -CRT_INNER_H / 2 + 20,
                       CRT_INNER_W - 40, CRT_INNER_H - 40, 6);
    bg.lineStyle(1, 0x6aff80, 0.6);
    bg.strokeRoundedRect(-CRT_INNER_W / 2 + 20, -CRT_INNER_H / 2 + 20,
                         CRT_INNER_W - 40, CRT_INNER_H - 40, 6);
    this.resultsContainer.add(bg);

    this.resultsHeader = this.add.text(0, -CRT_INNER_H / 2 + 48, 'RESULTS', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px', fontStyle: 'bold',
      color: '#8aff9b',
      shadow: { offsetX: 0, offsetY: 0, color: '#8aff9b', blur: 10, fill: true }
    }).setOrigin(0.5);
    this.resultsContainer.add(this.resultsHeader);

    // 5 result rows, populated by showResults()
    this.resultRows = [];
    for (let i = 0; i < 5; i++) {
      const row = this.add.container(0, -60 + i * 30);
      const rank = this.add.text(-220, 0, `${i + 1}.`, {
        fontFamily: '"Courier New", monospace', fontSize: '16px', fontStyle: 'bold',
        color: '#aabca8'
      }).setOrigin(0, 0.5);
      const name = this.add.text(-190, 0, '', {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        color: '#aabca8'
      }).setOrigin(0, 0.5);
      const odds = this.add.text(220, 0, '', {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        color: '#8aff9b'
      }).setOrigin(1, 0.5);
      row.add([rank, name, odds]);
      this.resultsContainer.add(row);
      this.resultRows.push({ row, rank, name, odds });
    }

    // Payout text (below rows)
    this.payoutText = this.add.text(0, CRT_INNER_H / 2 - 60, '', {
      fontFamily: '"Courier New", monospace',
      fontSize: '20px', fontStyle: 'bold',
      color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 10, fill: true }
    }).setOrigin(0.5);
    this.resultsContainer.add(this.payoutText);

    // Bring scanlines to top over the results board too
    this.crtContainer.bringToTop(this.scanlinesLayer);
    this.crtContainer.bringToTop(this.vignetteLayer);
  }

  // ----------------------------------------------------------------------
  // Odds board — chalky 5-card row below the CRT. Clickable to select.
  // ----------------------------------------------------------------------
  createOddsBoard() {
    const startX = 90;
    const cardW = 220;
    const gap = 20;
    const y = 545;  // was 500 — bumped down so the section header fits clear of the CRT bezel

    // Section header — sits between CRT bottom (~y=460) and the cards (y=500-590)
    this.add.text(640, 480, '─── PICK YOUR PONY ───', {
      fontFamily: '"Courier New", monospace',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#8b6f47',
      letterSpacing: 2
    }).setOrigin(0.5);

    this.oddsCards = [];
    this.HORSE_CONFIG.forEach((h, i) => {
      const x = startX + i * (cardW + gap) + cardW / 2;

      const frame = this.add.rectangle(x, y, cardW, 90);
      frame.setStrokeStyle(1, 0x4a6a4a, 0.7);
      frame.setFillStyle(0x08100a, 0.75);

      // Lane number badge
      const laneBadge = this.add.rectangle(x - cardW / 2 + 18, y - 26, 20, 20);
      laneBadge.setStrokeStyle(1, 0x8aff9b, 0.6);
      const laneLabel = this.add.text(x - cardW / 2 + 18, y - 26, `${i + 1}`, {
        fontFamily: '"Courier New", monospace', fontSize: '12px', fontStyle: 'bold',
        color: '#8aff9b'
      }).setOrigin(0.5);

      const name = this.add.text(x - cardW / 2 + 38, y - 22, h.name, {
        fontFamily: '"Courier New", monospace', fontSize: '14px', fontStyle: 'bold',
        color: '#c9a961'
      }).setOrigin(0, 0.5);

      // Large odds display on the right side
      const oddsText = this.add.text(x + cardW / 2 - 16, y + 10, '—', {
        fontFamily: '"Courier New", monospace', fontSize: '26px', fontStyle: 'bold',
        color: '#8aff9b',
        shadow: { offsetX: 0, offsetY: 0, color: '#8aff9b', blur: 8, fill: true }
      }).setOrigin(1, 0.5);

      const probText = this.add.text(x - cardW / 2 + 12, y + 18, '', {
        fontFamily: '"Courier New", monospace', fontSize: '10px',
        color: '#5a8a5a'
      }).setOrigin(0, 0.5);

      frame.setInteractive({ useHandCursor: true });
      frame.on('pointerover', () => {
        if (this.state !== 'IDLE') return;
        if (this.selectedHorses.indexOf(i) === -1) {
          frame.setStrokeStyle(1, 0x8aff9b, 0.9);
        }
      });
      frame.on('pointerout', () => this.updateOddsCardVisual(i));
      frame.on('pointerdown', () => this.selectHorse(i));

      this.oddsCards.push({ frame, name, oddsText, probText, laneBadge, laneLabel });
    });
  }

  updateOddsBoard() {
    this.horses.forEach((h, i) => {
      const card = this.oddsCards[i];
      card.oddsText.setText(this.fractionOdds(h.odds));
      card.probText.setText(`${(h.probability * 100).toFixed(1)}% win`);
      this.updateOddsCardVisual(i);
    });
  }

  updateOddsCardVisual(i) {
    const card = this.oddsCards[i];
    const pickIdx = this.selectedHorses.indexOf(i);  // -1 if not selected
    const selected = pickIdx >= 0;
    const h = this.HORSE_CONFIG[i];

    if (selected) {
      card.frame.setStrokeStyle(3, h.body);
      card.frame.setFillStyle(h.body, 0.12);
      card.name.setColor('#e8c547');
    } else {
      card.frame.setStrokeStyle(1, 0x4a6a4a, 0.7);
      card.frame.setFillStyle(0x08100a, 0.75);
      card.name.setColor('#c9a961');
    }

    // Pick badge — varies by bet type:
    //   ordered (EXACTA/TRIFECTA/SUPERFECTA) → solid filled circle in the
    //     horse's accent color, with the predicted-finish number inside.
    //     The "1" badge gets a thin gold ring around it because 1st place
    //     is the most committed prediction.
    //   unordered (QUINELLA / WIN) → simple gold dot, no number.
    if (!card.pickBadge) {
      card.pickBadge = this.add.container(0, 0);
      card.pickBadgeBg = this.add.graphics();
      card.pickBadgeText = this.add.text(0, 0, '', {
        fontFamily: '"Courier New", monospace', fontSize: '15px',
        fontStyle: 'bold', color: '#0a0605'
      }).setOrigin(0.5);
      card.pickBadge.add([card.pickBadgeBg, card.pickBadgeText]);
      // Position relative to the card frame's top-right
      card.pickBadge.setPosition(card.frame.x + 220 / 2 - 16, card.frame.y - 26);
      card.pickBadge.setDepth(card.frame.depth + 1);
    }
    card.pickBadgeBg.clear();
    card.pickBadgeText.setText('');
    if (selected) {
      const profile = this.BET_PROFILES[this.betType];
      if (profile.ordered) {
        // Solid circle in horse's accent color
        card.pickBadgeBg.fillStyle(h.body, 1);
        card.pickBadgeBg.fillCircle(0, 0, 13);
        // Inner dark stroke for definition against the dark card
        card.pickBadgeBg.lineStyle(1, 0x0a0605, 0.6);
        card.pickBadgeBg.strokeCircle(0, 0, 13);
        // Gold ring on #1 — the most-committed pick
        if (pickIdx === 0) {
          card.pickBadgeBg.lineStyle(2, 0xe8c547, 0.95);
          card.pickBadgeBg.strokeCircle(0, 0, 16);
        }
        // Pick text color by luma so dark backgrounds get light text
        const r = (h.body >> 16) & 0xff;
        const g = (h.body >> 8)  & 0xff;
        const b = h.body & 0xff;
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        card.pickBadgeText.setColor(luma > 130 ? '#0a0605' : '#ffe6b3');
        card.pickBadgeText.setText(String(pickIdx + 1));
      } else {
        // Unordered (QUINELLA / WIN) — simple gold dot, no number
        card.pickBadgeBg.fillStyle(0xa89050, 1);
        card.pickBadgeBg.fillCircle(0, 0, 11);
        card.pickBadgeBg.lineStyle(1, 0x6a5030, 0.9);
        card.pickBadgeBg.strokeCircle(0, 0, 11);
      }
    }
  }

  // Selection — branches by bet type. Players pick horses by clicking cards.
  //  WIN        → single pick, replaces previous (or deselects on re-click)
  //  QUINELLA   → up to 2 picks, FIFO replace on overflow, order doesn't matter
  //  EXACTA     → up to 2 ordered picks, last position replaces on overflow
  //  TRIFECTA   → up to 3 ordered picks, same overflow rule
  //  SUPERFECTA → up to 4 ordered picks, same overflow rule
  //
  // Re-clicking an already-selected horse DESELECTS it. For ordered modes,
  // splice() removes the pick and naturally promotes the picks behind it
  // forward (TRIFECTA [A, B, C] → click B → [A, C]; C is now 2nd-place pick).
  // Lets the player rearrange roster + order without resetting the bet type.
  selectHorse(i) {
    if (this.state !== 'IDLE') return;
    const profile = this.BET_PROFILES[this.betType];
    const already = this.selectedHorses.indexOf(i);

    if (already >= 0) {
      // Deselect — works for every bet type.
      this.selectedHorses.splice(already, 1);
    } else if (this.betType === 'WIN') {
      this.selectedHorses = [i];
    } else if (profile.ordered) {
      // EXACTA / TRIFECTA / SUPERFECTA — append, or replace last if full
      if (this.selectedHorses.length < profile.count) {
        this.selectedHorses.push(i);
      } else {
        this.selectedHorses[profile.count - 1] = i;
      }
    } else {
      // QUINELLA — append, or FIFO replace if full
      if (this.selectedHorses.length < profile.count) {
        this.selectedHorses.push(i);
      } else {
        this.selectedHorses.shift();
        this.selectedHorses.push(i);
      }
    }

    this.oddsCards.forEach((_, j) => this.updateOddsCardVisual(j));
    this.updateBetDisplay();
    this.updatePlaceBetButton();
    SFX.pegHit();
  }

  // Switch active bet type (called by the selector buttons). Resets picks
  // since the rules differ per type.
  setBetType(type) {
    if (this.state !== 'IDLE') return;
    if (!this.BET_PROFILES[type]) return;
    if (type === this.betType) return;
    this.betType = type;
    this.selectedHorses = [];
    if (this.betTypeButtons) this.styleBetTypeButtons();
    this.oddsCards.forEach((_, j) => this.updateOddsCardVisual(j));
    this.updateBetDisplay();
    this.updatePlaceBetButton();
    SFX.pegHit();
  }

  // ----------------------------------------------------------------------
  // Bet-type selector — vertical stack on the right of the CRT cabinet,
  // reading top-to-bottom (riskier bets toward the bottom). Sits in the
  // wood-paneling gutter between the CRT and the canvas right edge so it
  // doesn't crowd the wager strip below.
  // ----------------------------------------------------------------------
  createBetTypeSelector() {
    const bx = 1140;          // right-gutter center column
    const startY = 154;       // first button center; middle button lands ~CRT center
    const stepY  = 50;        // vertical pitch between buttons
    const btnW = 156, btnH = 38;

    // Small header above the stack
    this.add.text(bx, startY - 38, '─ BET TYPE ─', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      color: '#6a5030', letterSpacing: 2
    }).setOrigin(0.5);

    this.betTypeButtons = [];
    this.BET_TYPES.forEach((type, i) => {
      const y = startY + i * stepY;
      const rect = this.add.rectangle(bx, y, btnW, btnH);
      const lbl = this.add.text(bx, y, type, {
        fontFamily: '"Courier New", monospace', fontSize: '13px', fontStyle: 'bold'
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => this.setBetType(type));
      rect.on('pointerover', () => {
        if (this.state !== 'IDLE') return;
        if (this.betType !== type) lbl.setColor('#d4a574');
      });
      rect.on('pointerout', () => this.styleBetTypeButtons());
      this.betTypeButtons.push({ rect, lbl, type });
    });
    this.styleBetTypeButtons();

    // Live bet-display string sits directly under the stack so the player
    // reads "[bet type] → [your picks]" as one column. Top-anchored so it
    // grows downward as more picks fill in. Centered to match the stack.
    const lastBtnBottom = startY + (this.BET_TYPES.length - 1) * stepY + btnH / 2;
    this.betDisplay = this.add.text(bx, lastBtnBottom + 16, '', {
      fontFamily: '"Courier New", monospace', fontSize: '11px',
      fontStyle: 'bold', color: '#6a5030', align: 'center', lineSpacing: 3,
      wordWrap: { width: btnW + 20 }
    }).setOrigin(0.5, 0);
    this.updateBetDisplay();
  }

  styleBetTypeButtons() {
    if (!this.betTypeButtons) return;
    this.betTypeButtons.forEach(({ rect, lbl, type }) => {
      const sel = type === this.betType;
      rect.setStrokeStyle(sel ? 2 : 1, sel ? 0xa89050 : 0x3d2817);
      rect.setFillStyle(0xa89050, sel ? 0.10 : 0);
      lbl.setColor(sel ? '#e8c547' : '#6a5030');
    });
  }

  // Live "current bet" tagline — stacked column under the bet-type buttons.
  // Empty state: rule hint per type (Quinella vs Exacta look the same on the
  // surface but play very differently, so the hint earns its keep).
  // Filled state: numbered list for ordered modes, "&"-separated pair for
  // QUINELLA, single line for WIN. The narrow right gutter forces a
  // multi-line layout, which actually reads better than the old long string.
  updateBetDisplay() {
    if (!this.betDisplay) return;
    const profile = this.BET_PROFILES[this.betType];

    const HINTS = {
      WIN:        'pick 1 horse\nto win',
      QUINELLA:   'pick 2 horses\nany order',
      EXACTA:     'pick 2 horses\nin exact order',
      TRIFECTA:   'pick 3 horses\nin exact order',
      SUPERFECTA: 'pick 4 horses\nin exact order'
    };

    let lines;
    if (this.selectedHorses.length === 0) {
      lines = [HINTS[this.betType]];
    } else {
      const names = this.selectedHorses.map(idx => this.HORSE_CONFIG[idx].name);
      lines = [];
      if (this.betType === 'WIN') {
        // Just the horse name
        lines.push(names[0]);
      } else if (this.betType === 'QUINELLA') {
        // "&" reads as "either order" — single line, lets word-wrap handle long names
        lines.push(names.length === 2 ? `${names[0]} & ${names[1]}` : `${names[0]} & …`);
      } else if (this.betType === 'EXACTA') {
        // "then" reads as ordered — single line for the 2-horse case
        lines.push(names.length === 2 ? `${names[0]} then ${names[1]}` : `${names[0]} then …`);
      } else {
        // TRIFECTA / SUPERFECTA — numbered list. Numbers match the
        // numbered badges on the cards so the visual mapping is direct.
        names.forEach((n, i) => lines.push(`${i + 1}. ${n}`));
        if (names.length < profile.count) lines.push('…');
      }
    }

    this.betDisplay.setText(lines.join('\n'));

    // Color: muted while picking the rule hint or partial picks; gold once full.
    const ready = this.selectedHorses.length === profile.count;
    if (this.selectedHorses.length === 0) {
      this.betDisplay.setColor('#6a5030');
    } else {
      this.betDisplay.setColor(ready ? '#c9a961' : '#8b6f47');
    }
  }

  // ----------------------------------------------------------------------
  // Bet controls — chip buttons + PLACE BET + RACE AGAIN
  // ----------------------------------------------------------------------
  createBetControls() {
    const y = 640;
    // Bet-display tagline now lives under the bet-type stack on the right
    // (built by createBetTypeSelector). This area is purely the wager
    // strip + PLACE BET / RACE AGAIN.

    // 4 chip buttons centered around (330, y)
    this.betButtons = [];
    this.betOptions.forEach((amt, i) => {
      const bx = 210 + i * 80;
      const rect = this.add.rectangle(bx, y + 2, 70, 38);
      const lbl = this.add.text(bx, y + 2, `${amt}`, {
        fontFamily: '"Courier New", monospace', fontSize: '16px', fontStyle: 'bold'
      }).setOrigin(0.5);
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerdown', () => {
        if (this.state !== 'IDLE') return;
        this.currentBet = amt;
        this.updateBetButtons();
        this.updatePlaceBetButton();
      });
      this.betButtons.push({ rect, lbl, amt });
    });

    // PLACE BET button
    this.placeBetRect = this.add.rectangle(700, y + 2, 260, 46);
    this.placeBetRect.setStrokeStyle(2, 0xc9a961);
    this.placeBetRect.setFillStyle(0xc9a961, 0.06);
    this.placeBetLabel = this.add.text(700, y + 2, 'PLACE BET', {
      fontFamily: '"Courier New", monospace', fontSize: '20px', fontStyle: 'bold', color: '#c9a961',
      shadow: { offsetX: 0, offsetY: 0, color: '#c9a961', blur: 8, fill: true }
    }).setOrigin(0.5);
    this.placeBetRect.setInteractive({ useHandCursor: true });
    this.placeBetRect.on('pointerover', () => {
      if (this.canPlaceBet()) {
        this.placeBetRect.setStrokeStyle(3, 0xe8c547);
        this.placeBetLabel.setColor('#e8c547');
      }
    });
    this.placeBetRect.on('pointerout', () => this.updatePlaceBetButton());
    this.placeBetRect.on('pointerdown', () => {
      if (this.canPlaceBet()) this.placeBet();
    });

    // RACE AGAIN button (hidden until results)
    this.raceAgainRect = this.add.rectangle(940, y + 2, 200, 46);
    this.raceAgainRect.setStrokeStyle(2, 0x8aff9b);
    this.raceAgainRect.setFillStyle(0x8aff9b, 0.06);
    this.raceAgainLabel = this.add.text(940, y + 2, 'RACE AGAIN', {
      fontFamily: '"Courier New", monospace', fontSize: '17px', fontStyle: 'bold', color: '#8aff9b',
      shadow: { offsetX: 0, offsetY: 0, color: '#8aff9b', blur: 8, fill: true }
    }).setOrigin(0.5);
    this.raceAgainRect.setInteractive({ useHandCursor: true });
    this.raceAgainRect.on('pointerover', () => {
      this.raceAgainRect.setStrokeStyle(3, 0xd8ffd8);
      this.raceAgainLabel.setColor('#d8ffd8');
    });
    this.raceAgainRect.on('pointerout', () => {
      this.raceAgainRect.setStrokeStyle(2, 0x8aff9b);
      this.raceAgainLabel.setColor('#8aff9b');
    });
    this.raceAgainRect.on('pointerdown', () => this.raceAgain());
    this.raceAgainRect.setVisible(false);
    this.raceAgainLabel.setVisible(false);

    this.updateBetButtons();
  }

  updateBetButtons() {
    this.betButtons.forEach(({ rect, lbl, amt }) => {
      const sel = amt === this.currentBet;
      const affordable = this.registry.get('chips') >= amt;
      rect.setStrokeStyle(sel ? 2 : 1, sel ? 0xc9a961 : 0x3d2817);
      rect.setFillStyle(0xc9a961, sel ? 0.1 : 0);
      lbl.setColor(sel ? '#c9a961' : affordable ? '#8b6f47' : '#4a3a25');
    });
  }

  canPlaceBet() {
    const profile = this.BET_PROFILES[this.betType];
    return this.state === 'IDLE'
      && this.selectedHorses.length === profile.count
      && this.registry.get('chips') >= this.currentBet;
  }

  updatePlaceBetButton() {
    const ok = this.canPlaceBet();
    this.placeBetRect.setStrokeStyle(2, ok ? 0xc9a961 : 0x3d2817);
    this.placeBetRect.setFillStyle(0xc9a961, ok ? 0.06 : 0);
    this.placeBetLabel.setColor(ok ? '#c9a961' : '#4a3a25');
    this.placeBetRect.input && (this.placeBetRect.input.cursor = ok ? 'pointer' : 'default');
  }

  // ----------------------------------------------------------------------
  // Odds generation
  // Each race: roll a fresh odds number inside each horse's range, then
  // normalize raw probabilities (1/(odds+1)) to sum to 1 so the race is
  // fair. Stated odds are "roughly" the win chance, per spec.
  // ----------------------------------------------------------------------
  rollNewOdds() {
    // Round to nearest 0.5 so display is always a clean fraction
    const rollOdds = (min, max) => {
      const raw = min + Math.random() * (max - min);
      return Math.round(raw * 2) / 2;
    };
    this.horses.forEach((h, i) => {
      const cfg = this.HORSE_CONFIG[i];
      h.odds = rollOdds(cfg.minOdds, cfg.maxOdds);
    });
    // Normalize raw probabilities so they sum to 1
    const raw = this.horses.map(h => 1 / (h.odds + 1));
    const sum = raw.reduce((a, b) => a + b, 0);
    this.horses.forEach((h, i) => { h.probability = raw[i] / sum; });
  }

  fractionOdds(o) {
    // Display "5/2", "3/1", "11/2" etc. — always a clean ratio.
    if (Number.isInteger(o)) return `${o}/1`;
    return `${Math.round(o * 2)}/2`;
  }

  // ----------------------------------------------------------------------
  // Place bet — deduct chips, set up race, transition state
  // ----------------------------------------------------------------------
  placeBet() {
    if (!this.canPlaceBet()) return;

    const chips = this.registry.get('chips');
    this.registry.set('chips', chips - this.currentBet);
    this.updateChipDisplay(260);
    this.updateBetButtons();
    this.updatePlaceBetButton();

    // Lock odds/bet buttons visually
    this.oddsCards.forEach(card => card.frame.disableInteractive());
    this.betButtons.forEach(b => b.rect.disableInteractive());

    this.startRace();
  }

  // ----------------------------------------------------------------------
  // Start race — pre-determine finish order, prep horse state, swap CRT
  // ----------------------------------------------------------------------
  startRace() {
    this.state = 'RACING';

    // Pre-determine finish order by weighted sampling without replacement
    const finishOrder = this.pickFinishOrder();
    const baseDuration = this.RACE_MIN_DUR + Math.random() * (this.RACE_MAX_DUR - this.RACE_MIN_DUR);

    this.race = {
      elapsed: 0,
      baseDuration,
      finishOrder,              // [winnerIndex, 2ndIndex, ...]
      currentLeader: -1,        // last-announced leader idx
      surgeAnnounced: new Set(),// longshot indices already called as surging
      photoFinishCalled: false,
      _lastLeaderCallAt: 0,
      horses: this.horses.map((h, i) => {
        const rank = finishOrder.indexOf(i);
        // Noise amplitude scales with odds: favorites are steady, longshots chaotic.
        // odds=2 (Widow's Walk best) → 0.18 peak, odds=12 (Hangman's Echo) → 0.53 peak.
        const oddsFactor = Phaser.Math.Clamp((h.odds - 2) / 10, 0, 1);
        const peakAmp = 0.18 + oddsFactor * 0.35;
        return {
          index: i,
          horse: h,
          progress: 0,
          // Variable gap per rank — some races are photo finishes, others blowouts
          finishTime: baseDuration + rank * (0.3 + Math.random() * 0.5),
          noisePhase: Math.random() * Math.PI * 2,
          noiseFreq: 1.2 + Math.random() * 0.9,
          peakAmp,
          finished: false,
          finishedAt: 0
        };
      })
    };

    // Plan 2–3 surge events scattered across the middle of the race.
    // Each surge: +20%–60% speed for 1.5s, intensity scaled by odds
    // (longshots surge more violently). Avoid first 3s and last 2s so
    // surges are visible mid-race, not flashing at the start/finish.
    const surgeCount = 2 + Math.floor(Math.random() * 2);
    this.race.surges = [];
    const surgeWindow = Math.max(1, baseDuration - 5); // from 3s to baseDuration-2s
    for (let s = 0; s < surgeCount; s++) {
      const startTime = 3 + Math.random() * surgeWindow;
      const horseIdx = Math.floor(Math.random() * 5);
      const hh = this.horses[horseIdx];
      // odds=2 → 0.20 (+20%), odds=12 → 0.55 (+55%) — longshot surges are violent
      const intensity = Phaser.Math.Clamp(0.2 + (hh.odds - 2) * 0.035, 0.2, 0.6);
      this.race.surges.push({
        horseIdx, startTime, duration: 1.5, intensity,
        fired: false, active: false
      });
    }

    // Longshots — top 2 highest-odds horses. Used for "SURGING" commentary
    // when one of them crashes into the top 2 by progress.
    this.race.longshotIndices = this.horses
      .map((h, i) => ({ i, odds: h.odds }))
      .sort((a, b) => b.odds - a.odds)
      .slice(0, 2)
      .map(x => x.i);

    // Build a chevron marker per picked horse. Ordered bets get numbered
    // chevrons (1, 2, 3, 4) matching the card badges; unordered bets get
    // unnumbered chevrons. The race becomes a readable scorecard:
    // chevron #1 leading the pack means your top pick is on track.
    this.rebuildPlayerMarkers();

    // CRT flicker-on effect: briefly blast static, then reveal the race
    SFX.crtFlicker(0.22, 0.18);
    this.idleText1.setVisible(false);
    this.idleText2.setVisible(false);
    this.staticImage.setAlpha(0.95);

    this.time.delayedCall(200, () => {
      this.raceView.setVisible(true);
      // Scanlines above race
      this.crtContainer.bringToTop(this.scanlinesLayer);
      this.crtContainer.bringToTop(this.vignetteLayer);
      // Starting bell
      SFX.raceStart();
      this.raceLabelText.setText('POST');
      this.flashRaceLabel('POST', '#e8c547');
    });
  }

  // Weighted sampling without replacement using inverse-CDF method.
  // Every iteration, pick a horse weighted by (probability / remainingSum),
  // remove it from the pool. Result: honest, honoring the listed odds.
  pickFinishOrder() {
    const remaining = this.horses.map((h, i) => ({ i, p: h.probability }));
    const order = [];
    while (remaining.length > 0) {
      const total = remaining.reduce((a, b) => a + b.p, 0);
      let roll = Math.random() * total;
      let pick = 0;
      for (let k = 0; k < remaining.length; k++) {
        roll -= remaining[k].p;
        if (roll <= 0) { pick = k; break; }
      }
      order.push(remaining[pick].i);
      remaining.splice(pick, 1);
    }
    return order;
  }

  flashRaceLabel(text, color) {
    this.raceLabelText.setText(text);
    this.raceLabelText.setColor(color);
    this.tweens.killTweensOf(this.raceLabelText);
    this.raceLabelText.setScale(1);
    this.tweens.add({
      targets: this.raceLabelText,
      scaleX: { from: 1.3, to: 1 },
      scaleY: { from: 1.3, to: 1 },
      duration: 420, ease: 'Sine.easeOut'
    });
  }

  // ----------------------------------------------------------------------
  // Per-frame race update — horses inch along, noise makes it organic
  // ----------------------------------------------------------------------
  update(time, delta) {
    if (this.state !== 'RACING' || !this.race) return;
    const dt = Math.min(0.05, delta / 1000);  // clamp to 50ms to avoid spiral
    this.race.elapsed += dt;

    const { TRACK_START_X, TRACK_END_X } = this;
    const trackLen = TRACK_END_X - TRACK_START_X;

    // Activate / deactivate surges based on elapsed time
    this.race.surges.forEach((surge) => {
      const t = this.race.elapsed;
      if (!surge.fired && t >= surge.startTime) {
        surge.fired = true;
        surge.active = true;
        // Brief signal-interference jitter on the race container — drama.
        this.surgeJitter();
      }
      if (surge.active && t >= surge.startTime + surge.duration) {
        surge.active = false;
      }
    });

    this.race.horses.forEach((rh, i) => {
      if (rh.finished) return;

      // Linear expected progress
      const expected = Math.min(1, this.race.elapsed / rh.finishTime);

      // Bell-curve noise envelope: zero at start and finish, peak mid-race.
      // This makes the back stretch chaotic and the finish line more orderly —
      // exactly what a TV broadcast reads like.
      const bell = Math.sin(expected * Math.PI);
      const noise = Math.sin(this.race.elapsed * rh.noiseFreq + rh.noisePhase) * rh.peakAmp * bell;

      // Surge: find if this horse has an active speed burst right now
      const activeSurge = this.race.surges.find(s => s.active && s.horseIdx === i);
      const surgeBoost = activeSurge ? activeSurge.intensity : 0;

      // Base rate from target finish time, modulated by noise, then by surge
      const baseRate = 1 / rh.finishTime;
      let rate = baseRate * Math.max(0.4, 1 + noise);
      rate *= (1 + surgeBoost);
      rh.progress += rate * dt;

      // Drift correction — pulls progress back to expected linear curve so
      // the predetermined finish order holds. Weakened during a surge so the
      // burst is actually visible before snapping back.
      const driftFactor = activeSurge ? 0.3 : 1.2;
      const drift = expected - rh.progress;
      rh.progress += drift * driftFactor * dt;

      rh.progress = Phaser.Math.Clamp(rh.progress, 0, 1);
      const sprite = this.horseSprites[i];
      sprite.setX(TRACK_START_X + rh.progress * trackLen);

      // Gallop bob — small vertical oscillation
      const lane = this.LANE_YS[i];
      const bob = Math.sin(this.race.elapsed * 14 + i) * 2;
      sprite.setY(lane + bob);

      // Finished?
      if (rh.progress >= 1) {
        rh.finished = true;
        rh.finishedAt = this.race.elapsed;
      }
    });

    // Track every player chevron over its predicted horse
    if (this.playerMarkers && this.playerMarkers.length > 0) {
      this.playerMarkers.forEach(marker => {
        const sprite = this.horseSprites[marker._horseIdx];
        if (sprite) {
          marker.setX(sprite.x);
          marker.setY(sprite.y - 22);
        }
      });
    }

    // ----- Race state labels (flash on threshold crossings, once each) -----
    const avgProgress = this.race.horses.reduce((s, h) => s + h.progress, 0) / 5;
    if (avgProgress > 0.02 && !this.race._calledOff) {
      this.race._calledOff = true;
      this.flashRaceLabel("AND THEY'RE OFF", '#e8c547');
    }
    if (avgProgress > 0.25 && !this.race._calledFirstTurn) {
      this.race._calledFirstTurn = true;
      this.flashRaceLabel('FIRST TURN', '#8aff9b');
    }
    if (avgProgress > 0.5 && !this.race._calledHalf) {
      this.race._calledHalf = true;
      this.flashRaceLabel('BACK STRETCH', '#8aff9b');
    }
    if (avgProgress > 0.7 && !this.race._calledFarTurn) {
      this.race._calledFarTurn = true;
      this.flashRaceLabel('FAR TURN', '#8aff9b');
    }
    if (avgProgress > 0.8 && !this.race._calledFinal) {
      this.race._calledFinal = true;
      this.flashRaceLabel('DOWN THE STRETCH', '#e8c547');
    }

    // ----- Commentary — "TAKES THE LEAD" on leader changes -----
    let leaderIdx = 0;
    let maxProgress = -1;
    this.race.horses.forEach((rh, i) => {
      if (rh.progress > maxProgress) { maxProgress = rh.progress; leaderIdx = i; }
    });
    // Gate: race has been running a second (don't fire on initial jitter),
    // leader actually changed, and 2s cooldown so swap-flurries don't spam.
    if (this.race.elapsed > 1
        && leaderIdx !== this.race.currentLeader
        && this.race.elapsed - this.race._lastLeaderCallAt > 2) {
      this.race.currentLeader = leaderIdx;
      this.race._lastLeaderCallAt = this.race.elapsed;
      this.setCommentary(`${this.HORSE_CONFIG[leaderIdx].name} TAKES THE LEAD`, '#e8c547');
    }

    // ----- Commentary — longshots entering the top 2 -----
    const byProgress = [...this.race.horses].sort((a, b) => b.progress - a.progress);
    const top2 = [byProgress[0].index, byProgress[1].index];
    top2.forEach(idx => {
      if (this.race.longshotIndices.includes(idx) && !this.race.surgeAnnounced.has(idx)) {
        this.race.surgeAnnounced.add(idx);
        this.setCommentary(`${this.HORSE_CONFIG[idx].name} SURGING`, '#8aff9b');
      }
    });

    // ----- Commentary — PHOTO FINISH when top 2 within 5% past 85% progress -----
    if (!this.race.photoFinishCalled && avgProgress > 0.85) {
      if (byProgress[0].progress - byProgress[1].progress < 0.05) {
        this.race.photoFinishCalled = true;
        this.setCommentary('PHOTO FINISH', '#ff6b35');
      }
    }

    this.raceTimerText.setText(`${this.race.elapsed.toFixed(1)}s`);

    // Everyone finished → end race
    if (this.race.horses.every(h => h.finished)) {
      this.state = 'RESULTS';
      this.time.delayedCall(400, () => this.endRace());
    }
  }

  // ----------------------------------------------------------------------
  // Commentary — overlays short messages in the scoreboard area mid-race.
  // Newest replaces oldest. 1.5s visible then fades out.
  // ----------------------------------------------------------------------
  setCommentary(text, hexColor) {
    const obj = this.raceCommentaryText;
    if (!obj) return;
    obj.setText(text);
    obj.setColor(hexColor);
    obj.setShadow(0, 0, hexColor, 10, true);
    this.tweens.killTweensOf(obj);
    obj.setAlpha(0);
    obj.setScale(1);
    this.tweens.add({
      targets: obj,
      alpha: 1,
      scaleX: { from: 1.15, to: 1 }, scaleY: { from: 1.15, to: 1 },
      duration: 220, ease: 'Sine.easeOut'
    });
    this.tweens.add({
      targets: obj,
      alpha: 0,
      duration: 350, delay: 1500, ease: 'Sine.easeIn'
    });
  }

  // ----------------------------------------------------------------------
  // Race end — show results board, pay out, big-win treatment if deserved
  // ----------------------------------------------------------------------
  endRace() {
    SFX.finishBell();
    this.flashRaceLabel('FINISH', '#ff6b35');

    // Determine actual finish order (by finishedAt, not finishOrder, since
    // the noise might flip very-close pairs — honor what the visuals showed)
    const finishSorted = [...this.race.horses].sort((a, b) => a.finishedAt - b.finishedAt);
    const actualOrder = finishSorted.map(rh => rh.index);
    const winnerIdx = actualOrder[0];

    // Evaluate the player's bet against the result — handles all 5 bet types.
    const result = this.evaluateBet(actualOrder);

    // Populate results rows. Highlight every horse the player picked, with
    // gold for the actual winner and a softer warm tone for "picked but
    // didn't help" finishers.
    const pickedSet = new Set(this.selectedHorses);
    actualOrder.forEach((hIdx, rank) => {
      const h = this.horses[hIdx];
      const cfg = this.HORSE_CONFIG[hIdx];
      const row = this.resultRows[rank];
      row.name.setText(cfg.name);
      row.odds.setText(this.fractionOdds(h.odds));
      if (rank === 0) {
        row.name.setColor('#e8c547');
        row.rank.setColor('#e8c547');
        row.odds.setColor('#e8c547');
      } else if (pickedSet.has(hIdx)) {
        row.name.setColor('#8b6f47');
        row.rank.setColor('#8b6f47');
        row.odds.setColor('#8b6f47');
      } else {
        row.name.setColor('#aabca8');
        row.rank.setColor('#aabca8');
        row.odds.setColor('#8aff9b');
      }
    });

    this.time.delayedCall(800, () => {
      this.resultsContainer.setVisible(true);
      this.crtContainer.bringToTop(this.scanlinesLayer);
      this.crtContainer.bringToTop(this.vignetteLayer);
      this.payOut(result, actualOrder, winnerIdx);
    });
  }

  // Determine win/loss + payout for the current bet against an actual finish
  // order. Returns:
  //   { won, profit, productOdds, betType }
  // where profit is already discounted by the bet-type multiplier.
  evaluateBet(actualOrder) {
    const profile = this.BET_PROFILES[this.betType];
    const picks = this.selectedHorses;
    let won = false;

    if (picks.length !== profile.count) {
      return { won: false, profit: 0, productOdds: 0, betType: this.betType };
    }

    if (this.betType === 'WIN') {
      won = (actualOrder[0] === picks[0]);
    } else if (this.betType === 'QUINELLA') {
      // Both picks must be in top 2, any order.
      const top2 = new Set([actualOrder[0], actualOrder[1]]);
      won = picks.every(p => top2.has(p));
    } else {
      // Ordered modes — strict positional match.
      won = picks.every((p, idx) => actualOrder[idx] === p);
    }

    let productOdds = 0, profit = 0;
    if (won) {
      productOdds = picks.reduce((acc, p) => acc * this.horses[p].odds, 1);
      profit = Math.round(this.currentBet * productOdds * profile.multiplier);
    }
    return { won, profit, productOdds, betType: this.betType };
  }

  // Pay out — payoutResult = { won, profit, productOdds, betType }
  // Big-win treatment ESCALATES with bet type:
  //   WIN          — existing (longshot odds ≥ 8 = big-win shake/flash)
  //   QUINELLA/EXACTA — brass flash + screen pulse, gold payout text
  //   TRIFECTA     — full big-win: shake, hot orange, "TRIFECTA — IMPOSSIBLE"
  //   SUPERFECTA   — ABSURD: max shake, "REALITY BROKEN", CRT distort + flicker
  payOut(payoutResult, actualOrder, winnerIdx) {
    if (this.selectedHorses.length === 0) {
      // shouldn't happen — bet gate required selections
      this.showRaceAgain();
      return;
    }

    const { won, profit, betType } = payoutResult;

    if (won) {
      const total = profit + this.currentBet;
      const chips = this.registry.get('chips');
      this.registry.set('chips', chips + total);
      this.updateChipDisplay(600);

      this.applyWinTreatment(betType, payoutResult);
    } else {
      this.resultsHeader.setColor('#8aff9b');
      this.resultsHeader.setShadow(0, 0, '#8aff9b', 10, true);
      this.payoutText.setColor('#6a5030');
      this.payoutText.setShadow(0, 0, '#6a5030', 6, true);
      this.payoutText.setText(`NO WIN  -${this.currentBet}`);
    }

    // Common payout-text pop animation
    this.payoutText.setScale(0.4);
    this.payoutText.setAlpha(0);
    this.tweens.add({
      targets: this.payoutText,
      scale: 1, alpha: 1,
      duration: 320, ease: 'Back.easeOut'
    });

    // Hold longer for the more dramatic wins
    const holdDelay = (betType === 'SUPERFECTA') ? 3200
                    : (betType === 'TRIFECTA')   ? 2200
                    : 900;
    this.time.delayedCall(holdDelay, () => this.showRaceAgain());
  }

  // Per-bet-type win flourish.
  applyWinTreatment(betType, result) {
    const { profit } = result;
    const firstName = this.HORSE_CONFIG[this.selectedHorses[0]].name;

    if (betType === 'WIN') {
      const pickedOdds = this.horses[this.selectedHorses[0]].odds;
      const isBigWin = pickedOdds >= 8;
      if (isBigWin) {
        this.cameras.main.shake(450, 0.012);
        this.cameras.main.flash(180, 255, 100, 30);
        SFX.bigWin();
        this.resultsHeader.setColor('#ff6b35');
        this.resultsHeader.setShadow(0, 0, '#ff6b35', 16, true);
        this.payoutText.setColor('#ff6b35');
        this.payoutText.setShadow(0, 0, '#ff6b35', 14, true);
        this.payoutText.setText(`${firstName} WINS — +${profit}`);
        this.flashImpossibleBanner(firstName);
      } else {
        this.resultsHeader.setColor('#8aff9b');
        this.resultsHeader.setShadow(0, 0, '#8aff9b', 10, true);
        this.payoutText.setColor('#c9a961');
        this.payoutText.setShadow(0, 0, '#c9a961', 10, true);
        this.payoutText.setText(`YOU WIN  +${profit}`);
      }
      return;
    }

    if (betType === 'QUINELLA' || betType === 'EXACTA') {
      // Brass flash + screen pulse — modest flourish
      this.cameras.main.flash(220, 220, 175, 80);
      this.cameras.main.shake(180, 0.005);
      SFX.bigWin();
      this.resultsHeader.setColor('#e8c547');
      this.resultsHeader.setShadow(0, 0, '#e8c547', 12, true);
      this.payoutText.setColor('#e8c547');
      this.payoutText.setShadow(0, 0, '#e8c547', 10, true);
      this.payoutText.setText(`${betType} HIT  +${profit}`);
      return;
    }

    if (betType === 'TRIFECTA') {
      // Full big-win — sustained orange, screen shake, banner
      this.cameras.main.shake(700, 0.016);
      this.cameras.main.flash(220, 255, 110, 50);
      SFX.bigWin();
      this.resultsHeader.setColor('#ff6b35');
      this.resultsHeader.setShadow(0, 0, '#ff6b35', 16, true);
      this.payoutText.setColor('#ff6b35');
      this.payoutText.setShadow(0, 0, '#ff6b35', 16, true);
      this.payoutText.setText(`TRIFECTA  +${profit}`);
      this.flashTrifectaBanner();
      return;
    }

    if (betType === 'SUPERFECTA') {
      // ABSURD treatment — maximum drama. The room briefly disagrees
      // with the result. Sustained chaos for 3+ seconds.
      this.cameras.main.shake(1500, 0.025);
      this.cameras.main.flash(300, 255, 110, 50);
      // Triple-flash for sustained chaos
      this.time.delayedCall(400,  () => this.cameras.main.flash(200, 255, 80, 40));
      this.time.delayedCall(900,  () => this.cameras.main.flash(180, 255, 80, 40));
      this.time.delayedCall(1500, () => this.cameras.main.flash(160, 255, 100, 60));
      SFX.bigWin();
      // Distant ringing (re-using bigWin twice gives a near-cacophony)
      this.time.delayedCall(800, () => SFX.bigWin && SFX.bigWin());
      this.resultsHeader.setColor('#ff6b35');
      this.resultsHeader.setShadow(0, 0, '#ff6b35', 20, true);
      this.payoutText.setColor('#ff6b35');
      this.payoutText.setShadow(0, 0, '#ff6b35', 20, true);
      this.payoutText.setText(`SUPERFECTA  +${profit}`);
      this.flashRealityBrokenBanner();
      this.crtRollDistortion();
      this.flickerLights();
      return;
    }
  }

  flashImpossibleBanner(horseName) {
    const msg = this.add.text(this.CRT_X, this.CRT_Y - this.CRT_INNER_H / 2 + 110,
      `${horseName} WINS — IMPOSSIBLE`, {
        fontFamily: '"Courier New", monospace',
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ff6b35',
        shadow: { offsetX: 0, offsetY: 0, color: '#ff6b35', blur: 14, fill: true }
      }).setOrigin(0.5);
    msg.setAlpha(0);
    this.tweens.add({
      targets: msg,
      alpha: { from: 0, to: 1 },
      duration: 160, yoyo: true, hold: 1800, repeat: 1,
      ease: 'Sine.easeInOut',
      onComplete: () => msg.destroy()
    });
  }

  // TRIFECTA banner — bigger and longer than the WIN banner
  flashTrifectaBanner() {
    const msg = this.add.text(this.CRT_X, this.CRT_Y,
      'TRIFECTA — IMPOSSIBLE', {
        fontFamily: '"Courier New", monospace',
        fontSize: '36px',
        fontStyle: 'bold',
        color: '#ff6b35',
        shadow: { offsetX: 0, offsetY: 0, color: '#ff6b35', blur: 20, fill: true }
      }).setOrigin(0.5).setDepth(2000);
    msg.setAlpha(0).setScale(0.5);
    this.tweens.add({
      targets: msg,
      alpha: { from: 0, to: 1 }, scale: { from: 0.5, to: 1 },
      duration: 250, ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: msg,
          alpha: 0,
          delay: 1900, duration: 280, ease: 'Sine.easeIn',
          onComplete: () => msg.destroy()
        });
      }
    });
  }

  // SUPERFECTA banner — the biggest text in the game, held longest, dripping
  // with insulted-by-the-player drama. Sits ABOVE the CRT so it dominates.
  flashRealityBrokenBanner() {
    const msg = this.add.text(640, 360, 'SUPERFECTA\nREALITY BROKEN', {
      fontFamily: '"Courier New", monospace',
      fontSize: '52px',
      fontStyle: 'bold',
      color: '#ff6b35',
      align: 'center',
      shadow: { offsetX: 0, offsetY: 0, color: '#ff6b35', blur: 28, fill: true }
    }).setOrigin(0.5).setDepth(3000);
    msg.setAlpha(0).setScale(0.4);
    this.tweens.add({
      targets: msg,
      alpha: { from: 0, to: 1 }, scale: { from: 0.4, to: 1 },
      duration: 350, ease: 'Back.easeOut',
      onComplete: () => {
        // Hold the banner for 2.4s with a slight scale wobble, then fade.
        this.tweens.add({
          targets: msg,
          scale: { from: 1, to: 1.05 },
          duration: 600, yoyo: true, repeat: 1, ease: 'Sine.easeInOut'
        });
        this.tweens.add({
          targets: msg,
          alpha: 0, delay: 2400, duration: 500, ease: 'Sine.easeIn',
          onComplete: () => msg.destroy()
        });
      }
    });
  }

  // CRT roll distortion — the broadcast briefly disagrees with reality.
  // Implements as a hard horizontal cut: a band of the screen shifts up by
  // a few px, slides down, repeats a few times. Sells "rolling vertical hold".
  crtRollDistortion() {
    if (!this.crtContainer) return;
    const original = this.crtContainer.y;
    const cycle = (offsets, idx = 0) => {
      if (idx >= offsets.length) {
        this.crtContainer.y = original;
        return;
      }
      this.crtContainer.y = original + offsets[idx];
      this.time.delayedCall(80, () => cycle(offsets, idx + 1));
    };
    // Asymmetric jitter — feels less like a clean wave
    cycle([0, -4, 6, -3, 5, -2, 3, -1, 0, 4, -2, 0]);
  }

  // Lights flicker — simulate the room's ceiling fluorescent stuttering.
  // Phaser's camera doesn't have an ambient light, so we briefly tint
  // the whole camera and snap back. Three quick taps.
  flickerLights() {
    const cam = this.cameras.main;
    const taps = [120, 360, 700, 1100];
    taps.forEach(t => {
      this.time.delayedCall(t, () => {
        cam.flash(70, 200, 220, 200, false);
      });
    });
  }

  showRaceAgain() {
    this.raceAgainRect.setVisible(true);
    this.raceAgainLabel.setVisible(true);
    this.raceAgainRect.setAlpha(0);
    this.raceAgainLabel.setAlpha(0);
    this.tweens.add({
      targets: [this.raceAgainRect, this.raceAgainLabel],
      alpha: 1, duration: 320, ease: 'Sine.easeOut'
    });
    // Disable PLACE BET during results
    this.placeBetRect.disableInteractive();
    this.placeBetLabel.setAlpha(0.3);
    this.placeBetRect.setAlpha(0.3);
  }

  raceAgain() {
    // Clean up race view + results
    this.raceView.setVisible(false);
    this.resultsContainer.setVisible(false);
    this.raceAgainRect.setVisible(false);
    this.raceAgainLabel.setVisible(false);
    this.placeBetRect.setAlpha(1);
    this.placeBetLabel.setAlpha(1);
    this.placeBetRect.setInteractive({ useHandCursor: true });

    // Reset horse sprite positions
    this.horseSprites.forEach((s, i) => {
      s.setPosition(this.TRACK_START_X, this.LANE_YS[i]);
    });

    // Tear down race-time chevrons; rebuilt on next race start.
    if (this.playerMarkers) {
      this.playerMarkers.forEach(m => {
        this.tweens.killTweensOf(m);
        m.destroy();
      });
      this.playerMarkers = [];
    }
    this.tweens.killTweensOf(this.raceCommentaryText);
    this.raceCommentaryText.setAlpha(0);
    this.raceCommentaryText.setText('');

    // Restore odds card + bet button interactivity
    this.oddsCards.forEach(card => card.frame.setInteractive({ useHandCursor: true }));
    this.betButtons.forEach(b => b.rect.setInteractive({ useHandCursor: true }));

    // Fresh odds + fresh selection. Bet TYPE persists across races so the
    // player can keep playing the same kind of bet without re-clicking;
    // their picks reset because the horses are about to re-roll odds.
    this.selectedHorses = [];
    this.state = 'IDLE';
    this.race = null;
    this.rollNewOdds();
    this.updateOddsBoard();
    this.updateBetDisplay();
    this.updatePlaceBetButton();
    this.idleText1.setVisible(true);
    this.idleText2.setVisible(true);
  }

  // ----------------------------------------------------------------------
  // Chip counter — ticker animation on big pays
  // ----------------------------------------------------------------------
  updateChipDisplay(duration) {
    const target = this.registry.get('chips');
    const dur = duration !== undefined ? duration : 220;
    if (this._chipTween) { this._chipTween.remove(); this._chipTween = null; }
    if (dur <= 0 || this.displayedChips === target) {
      this.displayedChips = target;
      this.chipText.setText(`CHIPS: ${target}`);
      return;
    }
    const from = { v: this.displayedChips };
    this._chipTween = this.tweens.add({
      targets: from, v: target, duration: dur, ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.displayedChips = Math.round(from.v);
        this.chipText.setText(`CHIPS: ${this.displayedChips}`);
      },
      onComplete: () => {
        this.displayedChips = target;
        this.chipText.setText(`CHIPS: ${target}`);
      }
    });
  }
}
