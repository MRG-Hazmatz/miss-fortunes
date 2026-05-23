// paylines.js — payline definitions, paytable, and win-detection logic.
// Kept separate from Slots.js so the rendering scene file stays focused on
// presentation.

import { SYMBOLS, symbolById } from './symbols.js';

// 9 paylines, each is an array of 5 row indices (one per reel) on a 5x3 grid.
// Layout: 3 horizontals + 2 V-shapes + 2 inverted V-shapes + 2 zigzags.
export const PAYLINES = [
  { name: 'middle',  rows: [1, 1, 1, 1, 1] },
  { name: 'top',     rows: [0, 0, 0, 0, 0] },
  { name: 'bottom',  rows: [2, 2, 2, 2, 2] },
  { name: 'V',       rows: [0, 1, 2, 1, 0] },
  { name: 'inv-V',   rows: [2, 1, 0, 1, 2] },
  { name: 'step-dn', rows: [0, 0, 1, 2, 2] },
  { name: 'step-up', rows: [2, 2, 1, 0, 0] },
  { name: 'zig-low', rows: [1, 0, 1, 2, 1] },
  { name: 'zig-hi',  rows: [1, 2, 1, 0, 1] }
];

// Multiplier table by symbol tier x count. Bet x multiplier = chips returned.
// Tarot (wild) gets its own column when it's the primary symbol of a line.
// Scatter (witch's mark) does NOT pay paylines — only the bonus round.
export const PAYTABLE = {
  common: { 3: 2,  4: 5,  5: 25 },
  mid:    { 3: 3,  4: 10, 5: 50 },
  wild:   { 3: 5,  4: 25, 5: 100 }
};

// Walk each payline left-to-right, count consecutive matches with wild
// substitution, sum payouts. Also tally scatters across the entire grid.
//
// grid: 2D array [reel][row] of symbol IDs (strings like 'candle', 'tarot').
// returns: { wins: [{paylineIdx, symbolId, count, multiplier, hadWild}],
//           scatterCount: number }
export function detectWins(grid) {
  const wins = [];

  for (let p = 0; p < PAYLINES.length; p++) {
    const payline = PAYLINES[p];
    const lineSymbols = payline.rows.map((row, reelIdx) => grid[reelIdx][row]);

    // Scatters never form payline wins
    if (lineSymbols[0] === SYMBOLS.WITCHMARK) continue;

    // Primary = first non-wild non-scatter symbol on the line.
    // (If the entire line is wilds, primary stays as TAROT and pays the wild
    //  column.)
    let primary = lineSymbols[0];
    if (primary === SYMBOLS.TAROT) {
      for (let i = 1; i < lineSymbols.length; i++) {
        if (lineSymbols[i] !== SYMBOLS.TAROT && lineSymbols[i] !== SYMBOLS.WITCHMARK) {
          primary = lineSymbols[i];
          break;
        }
      }
    }

    // Count consecutive matches from the left. Wild substitutes unless the
    // primary already IS wild (in which case the wild column applies directly).
    let count = 0;
    let hadWild = false;
    for (let i = 0; i < lineSymbols.length; i++) {
      const s = lineSymbols[i];
      if (s === primary) {
        count++;
      } else if (s === SYMBOLS.TAROT && primary !== SYMBOLS.TAROT) {
        count++;
        hadWild = true;
      } else {
        break;
      }
    }

    if (count >= 3) {
      const sym = symbolById(primary);
      const tier = (primary === SYMBOLS.TAROT) ? 'wild' : sym.tier;
      const base = PAYTABLE[tier]?.[count] || 0;
      if (base > 0) {
        // Wild substitution on a non-wild primary doubles the line.
        const multiplier = (hadWild && primary !== SYMBOLS.TAROT) ? base * 2 : base;
        wins.push({ paylineIdx: p, symbolId: primary, count, multiplier, hadWild });
      }
    }
  }

  // Count scatters anywhere on the grid (15 cells)
  let scatterCount = 0;
  for (let r = 0; r < grid.length; r++) {
    for (let row = 0; row < grid[r].length; row++) {
      if (grid[r][row] === SYMBOLS.WITCHMARK) scatterCount++;
    }
  }

  return { wins, scatterCount };
}
