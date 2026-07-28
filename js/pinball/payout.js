// payout.js — THE ORRERY's score economy + multiball threshold.
// Pure logic → node-testable.

// Reach this rank within a single game to trigger multiball.
export const MULTIBALL_RANK = 3;   // CONJURER (after 3 rites)

// Final score → chip payout at game over. Provisional curve; the Phase-G
// economy pass re-tunes it against the whole game. Roughly: a weak game
// (a few hundred points) pays nothing (the house keeps the 5-chip ante),
// a two-rite game lands near break-even, strong runs turn a profit.
export function scoreToChips(score) {
  if (!score || score <= 0) return 0;
  return Math.floor(score / 500);
}
