// missions.js — THE ORRERY's rite (mission) engine.
//
// Pure logic, no Phaser — so it's node-testable. The scene owns the table
// elements + visuals; it calls engine.hit(trigger, id) when a labelled body
// is struck, and reacts to the returned events (announce, score, rank-up,
// light show).
//
// C2 wires three rites, run sequentially. C3 expands the catalog to ~10.

export const RITES = [
  {
    id: 'candles',
    name: 'LIGHT THE CANDLES',
    // Madame Veil's announcement line, shown in the CRT ticker + sting.
    announce: 'the veil stirs. light all three candles — roll the upper lanes.',
    trigger: 'rollover',   // unique rollover-lane ids
    targetCount: 3,
    scoreReward: 500
  },
  {
    id: 'seance',
    name: 'CONDUCT THE SÉANCE',
    announce: 'strike the three sigils. begin the séance.',
    trigger: 'target',     // unique drop-target ids
    targetCount: 3,
    scoreReward: 1000
  },
  {
    id: 'rift',
    name: 'OPEN THE RIFT',
    announce: 'feed the rift. five times. tear it open.',
    trigger: 'rift',       // counted hits
    targetCount: 5,
    scoreReward: 2000
  }
];

export class MissionEngine {
  constructor(rites = RITES) {
    this.rites = rites;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.progress = new Set();  // unique ids for rollover / target rites
    this.count = 0;             // running count for the rift rite
    this.allComplete = false;
  }

  current() {
    return this.allComplete ? null : this.rites[this.index];
  }

  // How much of the active rite is done.
  have() {
    const m = this.current();
    if (!m) return 0;
    return m.trigger === 'rift' ? this.count : this.progress.size;
  }

  // Register a table hit. Returns:
  //   { matched, progressed, complete, mission, have, need }
  // matched   = this hit is relevant to the active rite
  // progressed= this hit advanced progress (new lane/target, or a rift feed)
  // complete  = the active rite is now finished
  hit(trigger, id) {
    const m = this.current();
    if (!m || m.trigger !== trigger) {
      return { matched: false, progressed: false, complete: false };
    }
    let progressed = false;
    if (trigger === 'rift') {
      this.count++;
      progressed = true;
    } else if (!this.progress.has(id)) {
      this.progress.add(id);
      progressed = true;
    }
    const have = this.have();
    const complete = have >= m.targetCount;
    return { matched: true, progressed, complete, mission: m, have, need: m.targetCount };
  }

  // Move to the next rite (call after handling a completion).
  advance() {
    this.progress = new Set();
    this.count = 0;
    if (this.index < this.rites.length - 1) {
      this.index++;
    } else {
      this.allComplete = true;
    }
  }

  // One-line objective for the CRT readout.
  objectiveText() {
    const m = this.current();
    if (!m) return 'ALL RITES COMPLETE — the veil is yours';
    return `RITE: ${m.name}  (${this.have()}/${m.targetCount})`;
  }
}
