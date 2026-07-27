// bots.js — rule-based Texas Hold'em opponents. No backend, no API; pure
// heuristics so the game stays a self-contained static site.
//
// Each bot has a "personality" that shifts its aggression + bluff frequency,
// so the two seats don't play identically. Decisions come from:
//   - hand strength (pre-flop table / post-flop best-of-seven tier)
//   - pot odds (how much to call vs. what's already in the pot)
//   - a personality-scaled random wobble (bluffs + occasional folds)

import { evalBestOfSeven } from './handRank.js';

const RANK_VALUE = {
  '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
  '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
};

// Personalities. aggression scales raise frequency; bluff scales
// betting-with-air; tightness raises the fold threshold.
export const BOT_PERSONAS = {
  widow:      { name: 'THE WIDOW',      aggression: 0.55, bluff: 0.18, tightness: 0.45 },
  gravedigger:{ name: 'THE GRAVEDIGGER',aggression: 0.75, bluff: 0.30, tightness: 0.30 }
};

// Pre-flop hand strength on a 0..1 scale. Lightweight Chen-ish heuristic.
export function preflopStrength(hole) {
  const v = hole.map(c => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const [hi, lo] = v;
  const suited = hole[0].suit.name === hole[1].suit.name;
  const gap = hi - lo;

  let s = hi / 14 * 0.5;              // high card weight
  if (hi === lo) s += 0.34;          // pocket pair (kept below saturation so
                                     // AA > KK > QQ ordering survives)
  else {
    s += lo / 14 * 0.15;             // kicker weight
    if (suited) s += 0.09;           // suited bonus
    if (gap === 1) s += 0.07;        // connected
    else if (gap === 2) s += 0.04;
    else if (gap === 3) s += 0.02;
  }
  // Premium pairs and big aces get a small nudge so bots respect them
  if (hi === lo && hi >= 12) s += 0.06;         // QQ+
  if (hi === 14 && lo >= 12) s += 0.06;          // AK / AQ
  return Math.max(0, Math.min(1, s));
}

// Post-flop strength 0..1 from the best 5-of-7 tier + top-kicker nuance.
export function postflopStrength(hole, community) {
  const best = evalBestOfSeven([...hole, ...community]);
  if (!best) return 0;
  // tierValue 1 (high card) .. 10 (royal). Normalize to a curve that keeps
  // one-pair modest and rewards trips+ strongly.
  const tierBase = {
    1: 0.12, 2: 0.34, 3: 0.52, 4: 0.72, 5: 0.8,
    6: 0.86, 7: 0.92, 8: 0.96, 9: 0.99, 10: 1.0
  }[best.tierValue] || 0.1;
  // Small bump for a high top-kicker within the tier
  const kickerBump = (best.kickers[0] / 14) * 0.06;
  return Math.min(1, tierBase + kickerBump);
}

// Main decision. Returns { action: 'fold'|'call'|'raise' }.
//   state = {
//     hole, community, persona,
//     toCall,          // chips needed to call
//     pot,             // current pot size
//     bigBlind,        // the stake unit
//     canRaise,        // false if the raise cap is hit
//     street           // 'preflop'|'flop'|'turn'|'river'
//   }
export function botDecision(state) {
  const { hole, community, persona, toCall, pot, canRaise, street } = state;
  const p = persona;

  const strength = street === 'preflop'
    ? preflopStrength(hole)
    : postflopStrength(hole, community);

  // Pot odds: fraction of the post-call pot we must contribute.
  const potOdds = toCall > 0 ? toCall / (pot + toCall) : 0;

  // Random wobble keeps bots from being solved; personality scales it.
  const wobble = (Math.random() - 0.5) * 0.2;
  const effStrength = Math.max(0, Math.min(1, strength + wobble));

  // ---- Check / bet line (nothing to call) ----
  if (toCall === 0) {
    // Value-raise strong hands; bluff-raise sometimes; otherwise check.
    const raiseChance = effStrength * p.aggression +
                        (Math.random() < p.bluff ? 0.35 : 0);
    if (canRaise && (effStrength > 0.62 || raiseChance > 0.7)) {
      return { action: 'raise' };
    }
    return { action: 'call' };  // a "call" of 0 is a check
  }

  // ---- Facing a bet ----
  // Fold threshold rises with pot odds (worse odds ⇒ need more strength)
  // and with the bot's tightness.
  const foldThreshold = potOdds * 0.8 + p.tightness * 0.35;

  if (effStrength < foldThreshold) {
    // Occasionally hero-call / float with a weak hand as a bluff-catch
    if (Math.random() < p.bluff * 0.4 && potOdds < 0.35) {
      return { action: 'call' };
    }
    return { action: 'fold' };
  }

  // Strong enough to continue: raise big hands, else call.
  const raiseChance = (effStrength - foldThreshold) * p.aggression +
                      (Math.random() < p.bluff ? 0.25 : 0);
  if (canRaise && (effStrength > 0.78 || raiseChance > 0.55)) {
    return { action: 'raise' };
  }
  return { action: 'call' };
}
