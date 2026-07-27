// ranks.js — THE ORRERY's rank ladder. Mirrors Space Cadet's Cadet →
// Fleet Admiral progression, re-skinned occult. Advancing a rank is the
// reward for completing rites (missions).
//
// C2 uses this purely for display + a rank index that ticks up per mission.
// C3 ties it to the full mission catalog, per-profile persistence, and a
// marrow award on each new rank reached.

export const PINBALL_RANKS = [
  'INITIATE',
  'ACOLYTE',
  'ADEPT',
  'CONJURER',
  'MAGUS',
  'HIEROPHANT',
  'ARCHON',
  'ORACLE',
  'VEILMASTER'
];

export function rankName(index) {
  const i = Math.max(0, Math.min(PINBALL_RANKS.length - 1, index));
  return PINBALL_RANKS[i];
}
