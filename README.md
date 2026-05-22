# Miss Fortune's

> *the door is unmarked. there is no sign. you found it anyway.*

A pixel-art **occult parlor of mini-games** — dark fantasy, fake currency, dressed in the aesthetics of gambling the way Balatro and Buckshot Roulette are. **Not a gambling app.** A single-player roguelike. No real money, no real bets, no monetization of chance.

---

<p align="center">
  <a href="https://mrg-hazmatz.github.io/miss-fortunes/"><b>▶ &nbsp;Play in your browser</b></a>
  <br>
  <sub><i>no download, no account — your save lives in this browser's localStorage</i></sub>
</p>

---

## The parlor

A hidden underground fortune-teller-slash-gambling-parlor. The **lobby** is the hub — eight doors arranged in a carousel, each leading to a different room. A chalkboard near the entrance shows today's omen. A shelf of cracked crystals catches the candlelight. Somewhere in the corner, a fortune teller is waiting.

### Rooms

| Door | What it is | Status |
|---|---|---|
| **PLINKO** | Physics-based ball drop. Four boards — *Shallow Grave* (safe), *Crossroads* (classic), *Marrow Deep* (jackpot edges), *The Void* (procedural, regenerates each visit). The Void costs **100 marrow** to unlock. | playable |
| **BLACKJACK** | Buckshot-style table against the dealer. | partial |
| **THE BOOKIE** | Off-track horse racing on a flickering CRT. Five horses, five bet types from WIN to SUPERFECTA. | playable |
| **ROULETTE** | European single-zero. Full felt layout, en prison on even-money bets, history strip. | playable |
| **SLOTS** | Five reels, cursed urn bonus round. | scaffold only |
| **POKER** | Texas hold'em. | locked |
| **THE FORTUNE TELLER** | Meta system. Draw tarot before a run, apply modifiers to the next room. | locked |
| **THE BACK ROOM** | Russian roulette with items. Highest stakes, worst vibes, best vibes. | locked |

### Two currencies

- **Chips** — gambled at the tables. Standard win/lose. Your working capital. New players start with 100.
- **Marrow** — rare. Earned from big wins, bad beats, and rituals. Spent on tarot reads, crystals, unlocking rooms, bribing the dealer. New players also start with 100 marrow so The Void is reachable on day one.

### Saves

Three profile slots, browser-only. Your save lives in `localStorage`, scoped to this device + this browser. No cloud, no account, no download. Use the **save** link in the bottom-right of the parlor for peace of mind — though chip/marrow changes already auto-save on every wager.

---

## Vibe & references

- **Balatro** — CRT-tinted "found on a burned CD" texture, divination items as core mechanics
- **Buckshot Roulette** *(Mike Klubnika)* — tense claustrophobic sound, items on a table, Russian roulette as a *game* not a coin flip
- **Inscryption** / **Cultist Simulator** / **World of Horror** — visual neighborhood, occult UI

Warm dim palette — amber, crimson, rust. Heavy CRT scanline shader across everything. UI feels slightly crooked, hand-drawn, like a cursed pamphlet.

---

## Built with

- **Phaser 3.80.1** + Matter.js (physics for Plinko)
- **Vite** + npm — ES modules, single-bundle build
- **Zero external assets** — every sprite is Phaser graphics, every sound is synthesized via Web Audio API
- ~8,000 lines of vanilla JS

## Running locally

```bash
git clone https://github.com/MRG-Hazmatz/miss-fortunes.git
cd miss-fortunes
npm install
npm run dev          # → http://localhost:3000
```

```bash
npm run build        # → dist/ (GitHub Pages build, /miss-fortunes/ base)
npm run build:itch   # → dist-itch/ (relative base, zips for itch.io)
```

---

## Status

Active development. The parlor lobby, Plinko (four boards), Bookie, and Roulette are playable. Blackjack and Slots are partial. Fortune Teller, Back Room, and Pinball are queued.

Pull up a chair. Madame Fortune will see you when she's ready.

> *the dealer keeps the house. the house keeps the marrow.*
