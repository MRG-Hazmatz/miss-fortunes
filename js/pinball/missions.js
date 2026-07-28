// missions.js — THE ORRERY's rite (mission) engine.
//
// Pure logic, no Phaser — so it's node-testable. The scene owns the table
// elements + visuals; it calls engine.hit(trigger, id) when a labelled body
// is struck, and reacts to the returned events (announce, score, rank-up,
// light show).
//
// Two kinds of rite:
//   - unique-set (counted:false): need N DISTINCT ids (e.g. all 3 rollover
//     lanes, all 3 drop targets). Re-hitting the same id doesn't advance.
//   - counted (counted:true): need N hits total (e.g. feed the rift 5 times,
//     wake the bumpers 15 times). Every hit advances.
//
// The catalog runs sequentially; completing a rite advances a rank.

export const RITES = [
  { id: 'candles',  name: 'LIGHT THE CANDLES',  trigger: 'rollover', counted: false, targetCount: 3,  scoreReward: 500,
    announce: 'the veil stirs. light all three candles — roll the upper lanes.' },
  { id: 'seance',   name: 'CONDUCT THE SÉANCE',  trigger: 'target',   counted: false, targetCount: 3,  scoreReward: 1000,
    announce: 'strike the three sigils. begin the séance.' },
  { id: 'rift1',    name: 'OPEN THE RIFT',       trigger: 'rift',     counted: true,  targetCount: 5,  scoreReward: 2000,
    announce: 'feed the rift. five times. tear it open.' },
  { id: 'sleepers', name: 'WAKE THE SLEEPERS',   trigger: 'bumper',   counted: true,  targetCount: 15, scoreReward: 1500,
    announce: 'the sleepers stir. strike the stones fifteen times — wake them.' },
  { id: 'candles2', name: 'RELIGHT THE CANDLES', trigger: 'rollover', counted: false, targetCount: 3,  scoreReward: 1500,
    announce: 'the candles guttered. light them again — she is watching now.' },
  { id: 'seance2',  name: 'THE SECOND SÉANCE',   trigger: 'target',   counted: false, targetCount: 3,  scoreReward: 2500,
    announce: 'the dead lean closer. strike the sigils once more.' },
  { id: 'rift2',    name: 'WIDEN THE RIFT',      trigger: 'rift',     counted: true,  targetCount: 8,  scoreReward: 3500,
    announce: 'wider. eight feedings. let something through.' },
  { id: 'familiar', name: 'BIND THE FAMILIAR',   trigger: 'bumper',   counted: true,  targetCount: 25, scoreReward: 3000,
    announce: 'it will not come willingly. twenty-five strikes to bind it.' },
  { id: 'seance3',  name: 'THE FINAL SÉANCE',    trigger: 'target',   counted: false, targetCount: 3,  scoreReward: 4000,
    announce: 'the last séance. she is almost here. strike the sigils.' },
  { id: 'torn',     name: 'THE VEIL TORN',       trigger: 'rift',     counted: true,  targetCount: 12, scoreReward: 6000,
    announce: 'now. tear it fully. twelve feedings and the veil is yours.' }
];

export class MissionEngine {
  constructor(rites = RITES) {
    this.rites = rites;
    this.reset();
  }

  reset() {
    this.index = 0;
    this.progress = new Set();  // unique ids (non-counted rites)
    this.count = 0;             // running total (counted rites)
    this.allComplete = false;
  }

  current() {
    return this.allComplete ? null : this.rites[this.index];
  }

  have() {
    const m = this.current();
    if (!m) return 0;
    return m.counted ? this.count : this.progress.size;
  }

  // Register a table hit. Returns:
  //   { matched, progressed, complete, mission, have, need }
  hit(trigger, id) {
    const m = this.current();
    if (!m || m.trigger !== trigger) {
      return { matched: false, progressed: false, complete: false };
    }
    let progressed = false;
    if (m.counted) {
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

  advance() {
    this.progress = new Set();
    this.count = 0;
    if (this.index < this.rites.length - 1) {
      this.index++;
    } else {
      this.allComplete = true;
    }
  }

  objectiveText() {
    const m = this.current();
    if (!m) return 'ALL RITES COMPLETE — the veil is yours';
    return `RITE: ${m.name}  (${this.have()}/${m.targetCount})`;
  }
}
