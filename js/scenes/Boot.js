class Boot extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create() {
    // Initialize persistent game state once
    GameState.init(this.game);

    const cx = this.cameras.main.centerX;
    const cy = this.cameras.main.centerY;

    // Title — aged brass, large
    const title = this.add.text(cx, cy - 30, "MISS FORTUNE'S", {
      fontFamily: '"Courier New", monospace',
      fontSize: '64px',
      fontStyle: 'bold',
      color: '#c9a961',
      stroke: '#2a1810',
      strokeThickness: 3,
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#c9a961',
        blur: 20,
        fill: true
      }
    });
    title.setOrigin(0.5);

    // Subtitle — muted, smaller
    const subtitle = this.add.text(cx, cy + 40, '— enter if you dare —', {
      fontFamily: '"Courier New", monospace',
      fontSize: '22px',
      color: '#8b6f47',
      shadow: {
        offsetX: 0,
        offsetY: 0,
        color: '#8b6f47',
        blur: 8,
        fill: true
      }
    });
    subtitle.setOrigin(0.5);
    subtitle.setAlpha(0);

    // Breathing glow on the title — slow, unreliable-feeling pulse
    this.tweens.add({
      targets: title,
      alpha: { from: 1, to: 0.7 },
      duration: 2200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Subtitle fades in slowly
    this.tweens.add({
      targets: subtitle,
      alpha: { from: 0, to: 0.8 },
      duration: 3000,
      delay: 800,
      ease: 'Sine.easeIn'
    });

    // Subtitle gentle drift after appearing
    this.tweens.add({
      targets: subtitle,
      alpha: { from: 0.8, to: 0.5 },
      duration: 3000,
      delay: 4000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // "Click to enter" prompt — appears after subtitle settles
    const prompt = this.add.text(cx, cy + 110, 'click to enter', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      color: '#6a5030'
    });
    prompt.setOrigin(0.5);
    prompt.setAlpha(0);

    // Fade in the prompt
    this.tweens.add({
      targets: prompt,
      alpha: { from: 0, to: 0.6 },
      duration: 2000,
      delay: 3000,
      ease: 'Sine.easeIn'
    });

    // Prompt pulse
    this.tweens.add({
      targets: prompt,
      alpha: { from: 0.6, to: 0.25 },
      duration: 1800,
      delay: 5000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Click handler — active after a short delay so the title can breathe
    this.time.delayedCall(2000, () => {
      this.input.once('pointerdown', () => {
        // Stop all tweens so the fade looks clean
        this.tweens.killAll();
        this.cameras.main.fadeOut(1000, 10, 6, 5);
        this.cameras.main.once('camerafadeoutcomplete', () => {
          // Title → SaveSelect → (pick/create profile) → Parlor.
          // Players always see the slot screen on boot so they can swap
          // profiles without nuking the run they're in the middle of.
          this.scene.start('SaveSelect');
        });
      });
    });
  }
}
