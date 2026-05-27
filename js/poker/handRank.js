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

// ============================================================
// 3-Card Poker
// ============================================================
//
// Important quirk: in 3-card poker, THREE OF A KIND beats STRAIGHT, because
// there are fewer ways to make trips with 3 cards than with 5.
//
// Tiers, top to bottom:
//   Mini Royal (suited A-K-Q)  → highest
//   Straight Flush             → 3 consecutive same suit (excl. mini royal)
//   Three of a Kind
//   Straight                   → 3 consecutive any suit (incl. A-2-3 "wheel")
//   Flush                      → 3 same suit, non-consecutive
//   Pair
//   High Card                  → none of the above

export const THREE_CARD_TIERS = [
  { rank: 'mini_royal',      name: 'MINI ROYAL',      tierValue: 7, pairPlus: 100, anteBonus: 5 },
  { rank: 'straight_flush',  name: 'STRAIGHT FLUSH',  tierValue: 6, pairPlus: 40,  anteBonus: 5 },
  { rank: 'three_of_a_kind', name: 'THREE OF A KIND', tierValue: 5, pairPlus: 30,  anteBonus: 4 },
  { rank: 'straight',        name: 'STRAIGHT',        tierValue: 4, pairPlus: 6,   anteBonus: 1 },
  { rank: 'flush',           name: 'FLUSH',           tierValue: 3, pairPlus: 4,   anteBonus: 0 },
  { rank: 'pair',            name: 'PAIR',            tierValue: 2, pairPlus: 1,   anteBonus: 0 },
  { rank: 'high_card',       name: 'HIGH CARD',       tierValue: 1, pairPlus: 0,   anteBonus: 0 }
];

export function evalThreeCardHand(cards) {
  if (!cards || cards.length !== 3) return null;
  // descending by value
  const values = cards.map(c => RANK_VALUE[c.rank]).slice().sort((a, b) => b - a);
  const suits  = cards.map(c => c.suit.name);

  const isFlush = suits.every(s => s === suits[0]);

  // Straight: 3 consecutive descending → diffs of 1, 1
  let isStraight = (values[0] - values[1] === 1) && (values[1] - values[2] === 1);
  // Wheel: A-2-3. Sorted desc = [14, 3, 2]. Ace plays low.
  const isWheel = values[0] === 14 && values[1] === 3 && values[2] === 2;
  if (isWheel) isStraight = true;
  // High card on the wheel is 3, not Ace (Ace is low)
  const straightHigh = isWheel ? 3 : values[0];

  const isMiniRoyal = isFlush && values[0] === 14 && values[1] === 13 && values[2] === 12;

  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const isTrips = Object.values(counts).some(c => c === 3);
  const isPair  = !isTrips && Object.values(counts).some(c => c === 2);

  let tier;
  if (isMiniRoyal)               tier = THREE_CARD_TIERS[0];
  else if (isFlush && isStraight) tier = THREE_CARD_TIERS[1];
  else if (isTrips)               tier = THREE_CARD_TIERS[2];
  else if (isStraight)            tier = THREE_CARD_TIERS[3];
  else if (isFlush)               tier = THREE_CARD_TIERS[4];
  else if (isPair)                tier = THREE_CARD_TIERS[5];
  else                            tier = THREE_CARD_TIERS[6];

  // Kickers for tiebreaks, always descending priority
  let kickers;
  if (isMiniRoyal) {
    kickers = [14, 13, 12];
  } else if (isStraight) {
    kickers = [straightHigh, straightHigh - 1, straightHigh - 2];
  } else if (isTrips) {
    const tripV = RANK_VALUE[Object.entries(counts).find(([, v]) => v === 3)[0]];
    kickers = [tripV, tripV, tripV];
  } else if (isPair) {
    const pairV   = RANK_VALUE[Object.entries(counts).find(([, v]) => v === 2)[0]];
    const kickerV = RANK_VALUE[Object.entries(counts).find(([, v]) => v === 1)[0]];
    kickers = [pairV, pairV, kickerV];
  } else {
    kickers = values;
  }
  // Composite score so compareThreeCard is a single subtraction
  const score = tier.tierValue * 1e6 + kickers[0] * 1e4 + kickers[1] * 100 + kickers[2];

  // Dealer qualifies on Queen-high-or-better.
  // Anything above high-card (pair+) qualifies; high-card needs Q or higher.
  const qualifies = tier.tierValue >= 2 || values[0] >= 12;

  return {
    rank: tier.rank,
    name: tier.name,
    tierValue: tier.tierValue,
    pairPlus: tier.pairPlus,
    anteBonus: tier.anteBonus,
    kickers,
    score,
    qualifies,
    highCard: values[0]
  };
}

// >0 if a wins, <0 if b wins, 0 if push
export function compareThreeCard(a, b) {
  return a.score - b.score;
}

// ============================================================
// Caribbean Stud (5-card)
// ============================================================
//
// Same hand rankings as standard 5-card poker, but the paytable applies
// to the CALL bet only (the ante always pays 1:1 on a win), AND the
// dealer qualifies on pair+ OR specifically Ace-King high or better.

export const CARIBBEAN_TIERS = [
  { rank: 'royal_flush',    name: 'ROYAL FLUSH',    callMult: 100, tierValue: 10 },
  { rank: 'straight_flush', name: 'STRAIGHT FLUSH', callMult: 50,  tierValue: 9  },
  { rank: 'four_of_a_kind', name: 'FOUR OF A KIND', callMult: 20,  tierValue: 8  },
  { rank: 'full_house',     name: 'FULL HOUSE',     callMult: 7,   tierValue: 7  },
  { rank: 'flush',          name: 'FLUSH',          callMult: 5,   tierValue: 6  },
  { rank: 'straight',       name: 'STRAIGHT',       callMult: 4,   tierValue: 5  },
  { rank: 'three_of_a_kind',name: 'THREE OF A KIND',callMult: 3,   tierValue: 4  },
  { rank: 'two_pair',       name: 'TWO PAIR',       callMult: 2,   tierValue: 3  },
  { rank: 'pair',           name: 'PAIR',           callMult: 1,   tierValue: 2  },
  { rank: 'high_card',      name: 'HIGH CARD',      callMult: 1,   tierValue: 1  }
];

const ctByRank = r => CARIBBEAN_TIERS.find(t => t.rank === r);

export function evalCaribbeanHand(cards) {
  if (!cards || cards.length !== 5) return null;

  // descending values for kicker math + straight detection
  const values = cards.map(c => RANK_VALUE[c.rank]).slice().sort((a, b) => b - a);
  const suits  = cards.map(c => c.suit.name);

  const isFlush = suits.every(s => s === suits[0]);

  // 5 consecutive descending → diffs of 1
  let isStraight = true;
  for (let i = 1; i < values.length; i++) {
    if (values[i - 1] - values[i] !== 1) { isStraight = false; break; }
  }
  // Wheel: A-5-4-3-2 sorted desc = [14, 5, 4, 3, 2]
  const isWheel =
    values[0] === 14 && values[1] === 5 && values[2] === 4 &&
    values[3] === 3 && values[4] === 2;
  if (isWheel) isStraight = true;
  const straightHigh = isWheel ? 5 : values[0];

  // Group ranks: [[rank, count], ...] sorted by count desc, then rank desc
  const counts = {};
  for (const c of cards) counts[c.rank] = (counts[c.rank] || 0) + 1;
  const groups = Object.entries(counts).sort((a, b) => {
    if (b[1] !== a[1]) return b[1] - a[1];
    return RANK_VALUE[b[0]] - RANK_VALUE[a[0]];
  });
  const topCount    = groups[0][1];
  const secondCount = groups[1] ? groups[1][1] : 0;

  let tier, kickers;

  if (isFlush && isStraight) {
    if (!isWheel && values[0] === 14 && values[4] === 10) {
      tier = ctByRank('royal_flush');
      kickers = [14, 13, 12, 11, 10];
    } else {
      tier = ctByRank('straight_flush');
      kickers = [straightHigh, straightHigh - 1, straightHigh - 2, straightHigh - 3, straightHigh - 4];
    }
  } else if (topCount === 4) {
    tier = ctByRank('four_of_a_kind');
    const quadV   = RANK_VALUE[groups[0][0]];
    const kickerV = RANK_VALUE[groups[1][0]];
    kickers = [quadV, quadV, quadV, quadV, kickerV];
  } else if (topCount === 3 && secondCount === 2) {
    tier = ctByRank('full_house');
    const tripV = RANK_VALUE[groups[0][0]];
    const pairV = RANK_VALUE[groups[1][0]];
    kickers = [tripV, tripV, tripV, pairV, pairV];
  } else if (isFlush) {
    tier = ctByRank('flush');
    kickers = values;
  } else if (isStraight) {
    tier = ctByRank('straight');
    kickers = [straightHigh, straightHigh - 1, straightHigh - 2, straightHigh - 3, straightHigh - 4];
  } else if (topCount === 3) {
    tier = ctByRank('three_of_a_kind');
    const tripV = RANK_VALUE[groups[0][0]];
    const restV = groups.slice(1).map(([k]) => RANK_VALUE[k]).sort((a, b) => b - a);
    kickers = [tripV, tripV, tripV, restV[0], restV[1]];
  } else if (topCount === 2 && secondCount === 2) {
    tier = ctByRank('two_pair');
    const hiP = RANK_VALUE[groups[0][0]];
    const loP = RANK_VALUE[groups[1][0]];
    const kickerV = RANK_VALUE[groups[2][0]];
    kickers = [hiP, hiP, loP, loP, kickerV];
  } else if (topCount === 2) {
    tier = ctByRank('pair');
    const pairV = RANK_VALUE[groups[0][0]];
    const restV = groups.slice(1).map(([k]) => RANK_VALUE[k]).sort((a, b) => b - a);
    kickers = [pairV, pairV, restV[0], restV[1], restV[2]];
  } else {
    tier = ctByRank('high_card');
    kickers = values;
  }

  // Composite score for compareCaribbean. Use base 100 per kicker (values
  // go up to 14, well within range). tierValue × 100^5 dominates.
  let score = tier.tierValue * 1e10;
  for (let i = 0; i < 5; i++) score += kickers[i] * Math.pow(100, 4 - i);

  // Dealer qualifies on pair-or-better OR Ace-King-high.
  // (High-card hands qualify only if they contain both an A and a K.)
  const ranksInHand = cards.map(c => c.rank);
  const qualifies = tier.rank !== 'high_card' ||
                    (ranksInHand.includes('A') && ranksInHand.includes('K'));

  return {
    rank: tier.rank,
    name: tier.name,
    callMult: tier.callMult,
    tierValue: tier.tierValue,
    kickers,
    score,
    qualifies,
    highCard: values[0]
  };
}

// >0 if a wins, <0 if b wins, 0 if push
export function compareCaribbean(a, b) {
  return a.score - b.score;
}

