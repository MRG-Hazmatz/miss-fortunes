// handRank.js — poker hand evaluation.
// Inputs are arrays of card-data objects with { suit: { name, sym, color }, rank: '2'..'A' }
// (same shape cards.js's Deck.build() produces).
//
// evalPokerHand(cards) returns the best matching tier from HAND_TIERS,
// using Jacks-or-Better video poker payouts. The "no_win" tier is the
// terminal fallback (multiplier 0).

const RANK_VALUE = {
  '2':  2, '3':  3, '4':  4, '5':  5, '6':  6,
  '7':  7, '8':  8, '9':  9, '10': 10,
  'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Ordered high → low. First match wins.
export const HAND_TIERS = [
  { rank: 'royal_flush',    name: 'ROYAL FLUSH',    multiplier: 800 },
  { rank: 'straight_flush', name: 'STRAIGHT FLUSH', multiplier: 50  },
  { rank: 'four_of_a_kind', name: 'FOUR OF A KIND', multiplier: 25  },
  { rank: 'full_house',     name: 'FULL HOUSE',     multiplier: 9   },
  { rank: 'flush',          name: 'FLUSH',          multiplier: 6   },
  { rank: 'straight',       name: 'STRAIGHT',       multiplier: 4   },
  { rank: 'three_of_a_kind',name: 'THREE OF A KIND',multiplier: 3   },
  { rank: 'two_pair',       name: 'TWO PAIR',       multiplier: 2   },
  { rank: 'jacks_or_better',name: 'JACKS OR BETTER',multiplier: 1   },
  { rank: 'no_win',         name: '—',              multiplier: 0   }
];

const byRank = r => HAND_TIERS.find(t => t.rank === r);

// Main entry point. Returns the highest-paying tier the hand qualifies for.
export function evalPokerHand(cards) {
  if (!cards || cards.length !== 5) return byRank('no_win');

  const values = cards.map(c => RANK_VALUE[c.rank]).slice().sort((a, b) => a - b);
  const suits  = cards.map(c => c.suit.name);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight: 5 consecutive ranks. Includes the A-2-3-4-5 "wheel" edge case.
  let isStraight = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i] !== values[i - 1] + 1) { isStraight = false; break; }
  }
  const isWheel =
    values[0] === 2 && values[1] === 3 && values[2] === 4 &&
    values[3] === 5 && values[4] === 14;
  if (isWheel) isStraight = true;

  // Rank-count buckets: { rank: count }
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  // [[rank, count], ...] sorted by count desc, then by rank value desc
  const groups = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return RANK_VALUE[b[0]] - RANK_VALUE[a[0]];
  });
  const topCount = groups[0][1];
  const secondCount = groups[1] ? groups[1][1] : 0;

  if (isFlush && isStraight) {
    // Royal flush = 10-J-Q-K-A all of one suit (not the wheel)
    if (!isWheel && values[0] === 10 && values[4] === 14) return byRank('royal_flush');
    return byRank('straight_flush');
  }
  if (topCount === 4)                       return byRank('four_of_a_kind');
  if (topCount === 3 && secondCount === 2)  return byRank('full_house');
  if (isFlush)                              return byRank('flush');
  if (isStraight)                           return byRank('straight');
  if (topCount === 3)                       return byRank('three_of_a_kind');
  if (topCount === 2 && secondCount === 2)  return byRank('two_pair');
  if (topCount === 2) {
    // Jacks or Better — the pair must be J, Q, K, or A
    const pairRank = groups[0][0];
    if (pairRank === 'J' || pairRank === 'Q' || pairRank === 'K' || pairRank === 'A') {
      return byRank('jacks_or_better');
    }
  }
  return byRank('no_win');
}
