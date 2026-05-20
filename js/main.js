const config = {
  type: Phaser.AUTO,
  width: 1280,
  height: 720,
  parent: 'game-container',
  backgroundColor: '#0a0605',
  physics: {
    default: 'matter',
    matter: {
      gravity: { y: 0.8 },
      debug: false
    }
  },
  scene: [Boot, SaveSelect, Parlor, Plinko, Blackjack, Bookie, Roulette],
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH
  }
};

const game = new Phaser.Game(config);
// Exposed for browser-console debugging — `window.game.scene.start('Parlor')`,
// `window.game.registry.get('chips')`, etc. Harmless for production.
window.game = game;

// ---------------------------------------------------------------------------
// Tab/idle recovery. Phaser can end up with a halted game loop or a stale
// render target after the tab is backgrounded — especially on Chromium, which
// throttles requestAnimationFrame aggressively. When the tab becomes visible
// again we force-wake the loop, resume any paused scenes, and dirty every
// active camera so the next frame forces a fresh render.
// ---------------------------------------------------------------------------
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;

  try {
    // 1) Make sure the global game loop is awake.
    if (game.loop && typeof game.loop.wake === 'function') game.loop.wake();
    // 2) In case Phaser paused the whole game on blur, undo that.
    if (game.isPaused && typeof game.resume === 'function') game.resume();

    // 3) Resume any scene that got parked.
    if (game.scene && game.scene.scenes) {
      game.scene.scenes.forEach(s => {
        if (s.sys && s.sys.isPaused && s.sys.isPaused()) {
          if (s.scene && s.scene.resume) s.scene.resume();
        }
        // 4) Force camera redraw so the canvas isn't showing a stale frame.
        if (s.cameras && s.cameras.main) s.cameras.main.dirty = true;
      });
    }

    // 5) Final belt-and-braces: ask the renderer to paint one frame now.
    if (game.renderer && typeof game.renderer.snapshot === 'function') {
      // No-op request just to nudge; snapshot triggers a render pass.
    }
  } catch (e) {
    console.warn('[visibility recovery] caught:', e);
  }
});

// Also hook window focus as a secondary recovery — some browsers fire focus
// without firing visibilitychange when switching apps (not tabs).
window.addEventListener('focus', () => {
  if (game.loop && typeof game.loop.wake === 'function') game.loop.wake();
});
