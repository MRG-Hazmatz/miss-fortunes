# Miss Fortune's

A pixel-art desktop game in the spirit of Balatro and Buckshot Roulette — a dark fantasy occult parlor where you gamble with **fake currency** across a suite of mini-games, while a meta-layer of tarot, astrology, and crystal modifiers shapes every run.

**This is not a gambling app.** It is a single-player roguelike dressed in the aesthetics of gambling. No real money, no real betting, no monetization of chance. The gambling mechanics exist purely as game mechanics, the same way they do in Balatro or Buckshot Roulette.

---

## Vibe & References

- **Balatro** — CRT-tinted, "found on a burned CD in 1998" texture; divination items (tarot, planets, spectral) as core mechanics
- **Buckshot Roulette** (Mike Klubnika) — tense, claustrophobic sound design for the high-stakes room; Russian roulette with items is a *game*, not a coin flip
- **Inscryption / Cultist Simulator / World of Horror** — visual neighborhood, occult UI
- Pixel art with a **warm dim palette** (amber, crimson, rust) — not stark monochrome
- Heavy **CRT scanline shader** across everything
- UI feels slightly crooked, hand-drawn, like a cursed pamphlet

---

## The Parlor Frame

The entire game is set inside **Miss Fortune's**, a hidden underground fortune-teller-slash-gambling-parlor. The lobby is the hub. Each game is a room you walk between. A fortune teller sits in the corner. A crystal shelf holds equipment. A chalkboard shows today's "omen" (a random modifier that affects the day's runs).

---

## Two Currencies

- **Chips** — gambled at the tables. Standard win/lose. Your working capital.
- **Marrow** — rare. Earned from big wins, bad beats, and rituals. Spent on tarot readings, crystals, unlocking rooms, bribing the dealer. This is the resource that makes the occult meta-layer matter mechanically.

---

## v1 Scope — What We Are Building

1. **Plinko** — physics-based using Matter.js. The showpiece, the hook. **Important design rule: ball drops from a fixed point or a small constrained drop zone, NOT from wherever the user clicks at the top.** Letting the player aim for the 10x slot breaks the game. Multiplier slots at bottom, risk levels (low/medium/high → different peg layouts and payout curves).

2. **Blackjack** — simplest card game to implement well. Gives us the card rendering system we reuse everywhere.

3. **The Back Room** — Russian roulette, Buckshot Roulette-inspired (NOT Orange Roulette). You vs. the dealer. Shells loaded visibly. Items on the table (magnifying glass, cigarettes, handcuffs, inverter, etc.). Highest stakes, Marrow rewards, worst vibes in the best way.

4. **The Fortune Teller** — a meta system, not a minigame. Draw 3 tarot cards before a run; each gives a buff or debuff modifier for that run. The Tower = higher volatility. The Fool = first hand gets a free re-deal. The Hanged Man = inverted payouts. Costs Marrow.

5. **The Parlor lobby** — hub scene with door sprites for each room. Crystal shelf (2–3 starter crystals as passive modifiers). Chalkboard omen display. Chip/Marrow counter. Ambient looping piano.

**Crystals** are equipment bought with Marrow. 3 equip slots. Each crystal modifies one thing passively (e.g., "+10% Plinko multipliers, -10% Blackjack payouts"). This is the Balatro joker-equivalent — build-craft through equipment.

---

## Deferred — Do NOT Build These Yet

- Roulette, full Poker, astrology system — v2, after v1 feels good
- Multiplayer anything — out of scope entirely
- **Node.js / npm / build tooling** — defer until the project is too big for a single HTML file. We use CDN-loaded Phaser for now.
- **Tauri desktop packaging** — defer until we have a playable game worth wrapping
- **Custom pixel art** — use free itch.io packs (Kenney, 0x72, etc.) as placeholders; custom art comes in the polish pass
- **Custom audio** — ChipTone and royalty-free packs for v1

---

## Tech Stack (Current Phase)

- **Single HTML file** approach: `index.html` loads Phaser 3 from a CDN
- **Matter.js** for Plinko physics (bundled with Phaser)
- **No build step, no npm, no bundler.** Open `index.html` directly in a browser to test.
- CSS for CRT scanline shader, vignette, menu styling
- Vanilla JS, split across multiple files loaded as `<script>` tags or ES modules

**Graduation trigger:** when JS exceeds ~500 lines or we have 3+ scenes, we migrate to a proper Phaser + Vite + Node.js project. Not before. Premature tooling kills non-coder projects.

**Packaging:** eventually Tauri (Rust + webview wrapper) for a Steam-ready .exe. Phase 3, much later.

---

## Build Order

1. **Hello World** — `index.html` that loads Phaser, shows a black screen with "MISS FORTUNE'S" centered in amber text with CRT scanlines. Morale checkpoint. Prove the pipeline works.
2. **Parlor lobby skeleton** — static scene, door sprites, chip counter. Navigation frame.
3. **Plinko room** — the full game with fixed drop point, pegs, slots, multipliers, juice (screen shake, particles, sounds). The v1 centerpiece.
4. **Card system + Blackjack** — shared card rendering, dealer logic, bet flow.
5. **Fortune Teller + tarot deck** — meta modifier layer. Draw cards, apply modifiers to next run.
6. **The Back Room** — Russian roulette with items.
7. **Crystals + Marrow economy** — tie everything together.
8. **Polish pass** — sound, particles, chalkboard omens, dealer dialogue, transitions.

---

## Working Style Notes (IMPORTANT)

- **The person driving this project does not code.** Claude Code writes all the code; they review and give feedback on feel, vibe, and direction.
- They strongly value **game feel** — juice, visual feedback, satisfying sounds, screen shake on big wins, particle effects on peg hits. Polish is not optional, it is the point.
- They are **aesthetic-first** and will notice things that feel generic or wrong before mechanical issues.
- **Prefer showing over explaining.** When in doubt, make the small change and let them see it running rather than describing what you'd do.
- **Small, visible, incremental changes** are better than large refactors. They need to watch the game grow.
- **Explain what changed and why in plain English** after each edit. No jargon without translation.
- Ask before making architectural decisions. Do not silently refactor file structures.

---

## Palette

**Parlor furnishings & game UI — warm amber (the house vibe):**

- Background: `#0a0605` (near-black with warm undertone)
- Frame / borders: `#2a1810`, `#3d2817`
- Primary accent: `#c9a961` (aged brass)
- Bright accent: `#d4a574`, `#e8c547`
- Hot accent: `#ff6b35` (ONLY for big wins, danger, Back Room — keep it rare so it hits)
- Muted text: `#8b6f47`, `#6a5030`

**Parlor carousel doors — old signs in a smoky basement (doors ONLY, nowhere else in the parlor frame):**

Each door is a worn, slightly glowing sign. NOT vivid neon — these are warm, desaturated colors. The overall effect should be "eight old signs in a dark hallway, each a different shade of warmth," not "eight colored spotlights." The glow halo around each door uses the same hue at low intensity.

| Door             | Sign Color  | State                                |
|------------------|-------------|--------------------------------------|
| PLINKO           | `#c9a961`   | unlocked — warm amber (brass, the familiar home color) |
| BLACKJACK        | `#8b2020`   | unlocked — deep crimson (dark red lamp behind frosted glass) |
| THE BOOKIE       | `#4a7a4a`   | unlocked — pale sickly green (fluorescent tube energy) |
| ROULETTE         | `#a89050`   | unlocked — tarnished gold (old, oxidized glamour) |
| SLOTS            | `#8a4a5a`   | locked — dusty rose (faded Vegas sign) |
| POKER            | `#4a5a6a`   | locked — steel blue-grey (cool, muted, serious) |
| THE FORTUNE TELLER | `#5a3a6a` | locked — deep violet (the one unusual color, desaturated) |
| THE BACK ROOM    | `#4a0000`   | locked + **dying** — dim red, 0.3–0.7 flicker with periodic blackout (always last in carousel) |

Unlocked doors glow slightly brighter than locked ones. Locked doors are dim but still legible. The Back Room is broken — its flicker is erratic and sometimes goes fully dark. That's intentional and it should stay last in the carousel so the last thing a player sees before wrapping is the broken one.

Font: monospace (Courier New or similar) as placeholder; swap for a pixel font like VT323 or Press Start 2P in polish pass.

---

## Target File Structure (grows as we go)

```
miss-fortunes/
  CLAUDE.md          ← this file
  index.html         ← game entry point
  css/
    style.css        ← CRT shader, layout, menus
  js/
    main.js          ← Phaser config, scene registration
    scenes/
      Boot.js
      Parlor.js
      Plinko.js
      (more as we add them)
  assets/
    sprites/
    audio/
```

Keep individual files small. When a file grows past ~300 lines, consider splitting it.

---

## First Task

Build **Hello World**: a single `index.html` that loads Phaser 3 from a CDN, creates a 1280x720 game with a near-black background (`#0a0605`), displays "MISS FORTUNE'S" centered in amber (`#c9a961`) with a subtitle "— enter if you dare —", and applies a CSS CRT scanline overlay on top of the canvas. No gameplay, no interaction, just proof the pipeline works and the vibe lands. After showing it to the user, wait for their feedback before proceeding to the Parlor lobby.
