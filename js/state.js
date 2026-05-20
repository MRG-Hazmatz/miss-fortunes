// GameState — multi-slot save manager.
//
// Storage layout (single localStorage key):
//   missfortunes.save.v3 = {
//     slots: [SlotData|null, SlotData|null, SlotData|null],
//     activeSlot: 0|1|2|null
//   }
//   SlotData = { name, chips, marrow, createdAt, lastPlayedAt }
//
// Lifecycle:
//   - Boot calls GameState.init(game) which migrates any v2 save and wires
//     a debounced auto-saver to the registry.
//   - SaveSelect scene calls GameState.createSlot / selectSlot / deleteSlot.
//   - Once a slot is active, every chip/marrow change debounces back to
//     localStorage under that slot.
//   - Parlor's "switch profile" link calls unsetActive() so the next visit
//     to SaveSelect starts fresh.

export const GameState = {
  STORAGE_KEY: 'missfortunes.save.v3',
  LEGACY_KEY:  'missfortunes.save.v2',
  MAX_SLOTS: 3,
  MAX_NAME_LEN: 14,
  DEFAULTS: { chips: 100, marrow: 0 },

  // ===== Storage helpers =====

  loadStorage() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (!raw) return { slots: [null, null, null], activeSlot: null };
      const parsed = JSON.parse(raw);
      const slots = Array.isArray(parsed.slots) ? parsed.slots.slice(0, this.MAX_SLOTS) : [];
      while (slots.length < this.MAX_SLOTS) slots.push(null);
      const activeSlot =
        typeof parsed.activeSlot === 'number' && parsed.activeSlot >= 0 && parsed.activeSlot < this.MAX_SLOTS
          ? parsed.activeSlot
          : null;
      return { slots, activeSlot };
    } catch (e) {
      console.warn('[GameState] load failed, starting clean:', e);
      return { slots: [null, null, null], activeSlot: null };
    }
  },

  saveStorage(data) {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.warn('[GameState] save failed:', e);
    }
  },

  // One-time: pull any old single-slot v2 save into slot 0 of the new scheme,
  // then leave v2 in place (don't delete) as a tombstone in case we need it.
  migrate() {
    try {
      // If v3 already has anything, we've migrated.
      const existingV3 = localStorage.getItem(this.STORAGE_KEY);
      if (existingV3) return;

      const v2raw = localStorage.getItem(this.LEGACY_KEY);
      if (!v2raw) return;

      const v2 = JSON.parse(v2raw);
      const chips  = Number.isFinite(v2.chips)  && v2.chips  > 0 ? v2.chips  : this.DEFAULTS.chips;
      const marrow = Number.isFinite(v2.marrow) && v2.marrow >= 0 ? v2.marrow : this.DEFAULTS.marrow;
      const now = Date.now();
      this.saveStorage({
        slots: [
          { name: 'old hand', chips, marrow, createdAt: now, lastPlayedAt: now },
          null,
          null
        ],
        activeSlot: null  // require explicit selection on first SaveSelect visit
      });
    } catch (e) {
      console.warn('[GameState] migrate failed:', e);
    }
  },

  // ===== Lifecycle =====

  init(game) {
    this.migrate();

    // Registry needs valid initial values (HUDs may render with these even
    // before a slot is picked). They get overwritten on selectSlot/createSlot.
    game.registry.set('chips',  this.DEFAULTS.chips);
    game.registry.set('marrow', this.DEFAULTS.marrow);

    // Debounced auto-save of the active slot. Skips when there's no active
    // slot (the SaveSelect screen state).
    let pending = null;
    const schedule = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => { pending = null; this.persistActive(game); }, 250);
    };
    game.registry.events.on('changedata-chips',  schedule);
    game.registry.events.on('changedata-marrow', schedule);

    // ----- BROKE RECOVERY -----
    // Whenever chips drops to 0 or below in any scene, fire a flavor modal
    // and hand the player 50 chips. Active-slot only — SaveSelect floors
    // empty saves to 100 separately. The recovering flag prevents the
    // recovery's own registry.set('chips', 50) from re-triggering.
    let recovering = false;
    game.registry.events.on('changedata-chips', (_, value, prev) => {
      if (recovering) return;
      if (this.getActiveSlotIndex() == null) return; // ignore on SaveSelect
      if (value <= 0 && prev > 0) {
        recovering = true;
        this.showBrokeRecovery(game, () => { recovering = false; });
      }
    });
  },

  // Attach a centered modal to whichever scene is active and visible right
  // now. Click OK → hand the player 50 chips, close the modal, persist.
  showBrokeRecovery(game, onDismiss) {
    const scene = game.scene.scenes.find(s => s.scene.isActive() && s.scene.isVisible());
    if (!scene) {
      // No host scene (very unlikely) — silently restore so the player isn't stuck.
      game.registry.set('chips', 50);
      this.persistActive(game);
      if (onDismiss) onDismiss();
      return;
    }

    const dim = scene.add.graphics();
    dim.fillStyle(0x000000, 0.78);
    dim.fillRect(0, 0, 1280, 720);
    dim.setDepth(9999);

    const box = scene.add.container(640, 360);
    box.setDepth(10000);

    const bg = scene.add.graphics();
    bg.fillStyle(0x0f0906, 0.98);
    bg.fillRoundedRect(-280, -120, 560, 240, 8);
    bg.lineStyle(2, 0xa89050, 0.75);
    bg.strokeRoundedRect(-280, -120, 560, 240, 8);
    box.add(bg);

    const tag = scene.add.text(0, -85, 'BROKE', {
      fontFamily: '"Courier New", monospace', fontSize: '12px',
      color: '#8b6f47', letterSpacing: 4
    }).setOrigin(0.5);
    box.add(tag);

    const flavor = scene.add.text(0, -25,
      "You've nothing left to give.\n" +
      "Madame Ruin pities you. Take 50 chips.\n" +
      "Try not to embarrass yourself.",
      {
        fontFamily: '"Courier New", monospace', fontSize: '14px',
        color: '#c9a961', align: 'center', lineSpacing: 6
      }
    ).setOrigin(0.5);
    box.add(flavor);

    // OK button
    const btnW = 180, btnH = 42;
    const btn = scene.add.container(0, 70);
    const btnBg = scene.add.graphics();
    btnBg.fillStyle(0x1a1208, 0.95);
    btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    btnBg.lineStyle(2, 0xa89050, 0.85);
    btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 6);
    const btnTxt = scene.add.text(0, 0, 'TAKE THE PITY', {
      fontFamily: '"Courier New", monospace', fontSize: '13px',
      fontStyle: 'bold', color: '#a89050'
    }).setOrigin(0.5);
    btn.add([btnBg, btnTxt]);
    const hit = scene.add.zone(0, 0, btnW, btnH).setOrigin(0.5).setInteractive({ useHandCursor: true });
    btn.add(hit);
    hit.on('pointerover', () => btnTxt.setColor('#ffd8a0'));
    hit.on('pointerout',  () => btnTxt.setColor('#a89050'));

    const dismiss = () => {
      game.registry.set('chips', 50);
      this.persistActive(game);
      dim.destroy();
      box.destroy();
      if (onDismiss) onDismiss();
    };
    hit.on('pointerdown', dismiss);
    box.add(btn);
  },

  // ===== Slot operations =====

  // Returns the array of 3 slots (each SlotData or null) — for the SaveSelect UI.
  getSlots() {
    return this.loadStorage().slots;
  },

  getActiveSlotIndex() {
    return this.loadStorage().activeSlot;
  },

  // ===== Unlocks =====
  // Per-profile feature unlocks (Void Plinko board today, eventually tarot
  // cards / crystals / rooms). Stored on the active slot under
  // `unlocks: { ... }`. Old saves that pre-date this field default to {} so
  // isUnlocked returns false safely.
  isUnlocked(game, key) {
    const data = this.loadStorage();
    const idx = data.activeSlot;
    if (idx == null) return false;
    const slot = data.slots[idx];
    return !!(slot && slot.unlocks && slot.unlocks[key] === true);
  },

  unlock(game, key) {
    const data = this.loadStorage();
    const idx = data.activeSlot;
    if (idx == null) return false;
    const slot = data.slots[idx];
    if (!slot) return false;
    if (!slot.unlocks) slot.unlocks = {};
    slot.unlocks[key] = true;
    this.saveStorage(data);
    game.events.emit('state-saved');
    return true;
  },

  // Hydrate the registry from a slot. Returns true if the slot existed.
  selectSlot(game, slotIdx) {
    const data = this.loadStorage();
    const slot = data.slots[slotIdx];
    if (!slot) return false;
    data.activeSlot = slotIdx;
    slot.lastPlayedAt = Date.now();
    this.saveStorage(data);
    // Broke recovery — never load a player into a 0-chip dead end.
    const chips  = slot.chips  > 0  ? slot.chips  : this.DEFAULTS.chips;
    const marrow = slot.marrow >= 0 ? slot.marrow : this.DEFAULTS.marrow;
    game.registry.set('chips',  chips);
    game.registry.set('marrow', marrow);
    return true;
  },

  // Create a brand-new save in an empty slot. Returns true on success.
  createSlot(game, slotIdx, rawName) {
    const data = this.loadStorage();
    if (slotIdx < 0 || slotIdx >= this.MAX_SLOTS) return false;
    if (data.slots[slotIdx]) return false; // slot already filled

    const name = (rawName || '').trim().slice(0, this.MAX_NAME_LEN) || 'unnamed';
    const now = Date.now();
    data.slots[slotIdx] = {
      name,
      chips:  this.DEFAULTS.chips,
      marrow: this.DEFAULTS.marrow,
      createdAt: now,
      lastPlayedAt: now
    };
    data.activeSlot = slotIdx;
    this.saveStorage(data);
    game.registry.set('chips',  this.DEFAULTS.chips);
    game.registry.set('marrow', this.DEFAULTS.marrow);
    return true;
  },

  deleteSlot(slotIdx) {
    const data = this.loadStorage();
    if (!data.slots[slotIdx]) return false;
    data.slots[slotIdx] = null;
    if (data.activeSlot === slotIdx) data.activeSlot = null;
    this.saveStorage(data);
    return true;
  },

  // Write current registry values back to the active slot's record.
  persistActive(game) {
    const data = this.loadStorage();
    if (data.activeSlot == null) return;
    const slot = data.slots[data.activeSlot];
    if (!slot) return;
    slot.chips  = game.registry.get('chips');
    slot.marrow = game.registry.get('marrow');
    slot.lastPlayedAt = Date.now();
    this.saveStorage(data);
    game.events.emit('state-saved');
  },

  // Drop the active-slot pointer (does not delete the slot data) — used by
  // the parlor's "switch profile" link so SaveSelect re-shows a fresh chooser.
  unsetActive() {
    const data = this.loadStorage();
    data.activeSlot = null;
    this.saveStorage(data);
  },

  // ===== Helpers =====

  // "2m ago" / "3h ago" / "5d ago" — used in the slot card subtitle.
  relativeTime(ts) {
    if (!ts) return '';
    const diff = Math.max(0, Date.now() - ts);
    const m = Math.floor(diff / 60000);
    if (m < 1) return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    return `${d}d ago`;
  }
};
