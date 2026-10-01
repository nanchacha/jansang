import { MOTIONS } from './motion.mjs';

export const MODES = {
  challenge: { window: 115, perfect: 48, label: '도전' },
  practice: { window: 185, perfect: 80, label: '연습' },
};
export const COOLDOWN = 320;
export const CHORD_MS = 80;
export const BOSS_HP = 240;
export const TELEGRAPH_MS = 620;
export const MAX_STRIKES = 6;
export const ATTACK_COMPONENTS = [
  { type: 'cleave', name: '내려베기', windup: [760, 1100] },
  { type: 'sweep', name: '횡베기', windup: [700, 1000] },
  { type: 'thrust', name: '찌르기', windup: [650, 850] },
  { type: 'leap', name: '도약 강타', windup: [1050, 1400] },
  { type: 'spin', name: '회전 베기', windup: [850, 1150] },
  { type: 'drag', name: '끌어올리기', windup: [900, 1200], tempo: 'hold', delay: [900, 1700] },
  { type: 'wave', name: '지면 파동', windup: [1050, 1400] },
  { type: 'fury', name: '붉은 강타', windup: [1000, 1400], tempo: 'hold', delay: [700, 1400], guard: 'both' },
  { type: 'recoil', name: '태엽 꺾기', windup: [750, 1050], tempo: 'feint', delay: [650, 1100] },
  { type: 'rush', name: '파고들기', windup: [650, 850], tempo: 'quick' },
  { type: 'retreat', name: '후퇴 후 찌르기', windup: [900, 1200], tempo: 'quick' },
  { type: 'flurry', name: '연속 교차검', windup: [650, 800], tempo: 'quick', hits: [2, 3] },
  { type: 'low-sweep', name: '낮은 쓸기', windup: [800, 1150] },
  { type: 'energy-orb', name: '에너지 탄', windup: [550, 850], tempo: 'hold', delay: [250, 550], flight: [900, 1250] },
  { type: 'arc-barrage', name: '교차 파동 연사', windup: [280, 440], tempo: 'quick', hits: [2, 3], flight: [620, 820] },
  { type: 'twin-wave', name: '쌍방향 에너지 파동', windup: [650, 950], tempo: 'hold', delay: [350, 800], flight: [780, 1100], guard: 'both' },
];

// One clock, supplied by the caller: pausing and dropped frames cannot change a hit's timing.
export class Combat {
  constructor({ random = Math.random, mode = 'challenge', practiceAttack = 'random' } = {}) {
    this.random = random;
    this.mode = MODES[mode] ? mode : 'challenge';
    this.practiceAttack = ATTACK_COMPONENTS.some(c => c.type === practiceAttack) ? practiceAttack : 'random';
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.hp = 5;
    this.bossHp = BOSS_HP;
    this.phase = 1;
    this.round = 0;
    this.hits = 0;
    this.parries = 0;
    this.perfects = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastTap = -Infinity;
    this.held = new Set();
    this.pending = null;
    this.sequence = [];
    this.events = [];
    this.time = 0;
    this.elapsed = 0;
    this.attackAt = -Infinity;
  }

  emit(type, extra = {}) { this.events.push({ type, at: this.time, ...extra }); }
  drain() { return this.events.splice(0); }
  roll(min, max) { return min + this.random() * (max - min); }

  start() {
    this.reset();
    this.state = 'player';
    this.emit('start');
  }

  attack(now) {
    this.update(now);
    if (this.state !== 'player') return false;
    this.round++;
    this.attackAt = now;
    this.damageBoss(24);
    this.emit('attack', { damage: 24 });
    if (this.state === 'won') return true;
    this.state = 'boss';
    this.beginSequence(now + 850);
    return true;
  }

  beginSequence(start) {
    // Compose fresh components every turn; each may contain one or more strikes.
    // Phase changes speed, never the component pool or a fixed turn pattern.
    const selected = this.mode === 'practice' && ATTACK_COMPONENTS.find(c => c.type === this.practiceAttack);
    const count = selected ? 1 : 1 + Math.floor(this.random() * 4);
    const speed = this.phase === 2 ? 0.88 : 1;
    this.sequence = [];
    let windupAt = start;
    const recovery = Math.max(240, MODES[this.mode].window, COOLDOWN + 2 * MODES[this.mode].window + 20 - TELEGRAPH_MS);
    for (let i = 0; i < count && this.sequence.length < MAX_STRIKES; i++) {
      const pool = ATTACK_COMPONENTS.filter(c => !c.hits || c.hits[0] <= MAX_STRIKES - this.sequence.length);
      const component = selected || pool[Math.floor(this.random() * pool.length)];
      let hand = this.random() < 0.5 ? 'left' : 'right';
      const rhythm = this.random();
      const tempo = component.tempo || (rhythm < .55 ? 'quick' : rhythm < .85 ? 'hold' : 'feint');
      const strokes = component.hits ? Math.min(MAX_STRIKES - this.sequence.length, Math.floor(this.roll(component.hits[0], component.hits[1] + 1))) : 1;
      for (let stroke = 0; stroke < strokes; stroke++) {
        const delay = tempo === 'quick' ? 0 : this.roll(...(component.delay || [tempo === 'hold' ? 400 : 550, 1000])) * speed;
        const commitAt = windupAt + delay;
        const windup = this.roll(...component.windup) * speed;
        const launchAt = component.flight ? commitAt + windup : null;
        const at = component.flight ? launchAt + Math.max(TELEGRAPH_MS, this.roll(...component.flight) * speed) : commitAt + Math.max(TELEGRAPH_MS, windup);
        const motion = MOTIONS[Math.floor(this.random() * MOTIONS.length)];
        const motionStrength = this.roll(.85, 1.15);
        const guard = component.guard || hand;
        this.sequence.push({ type: component.type, name: component.name, hand, guard, tempo, motion, motionStrength, group: i, stroke, strokes, windupAt, commitAt, launchAt, at, resolved: false, result: null });
        // Each stroke, including a flurry, retains its own full cue and cooldown margin.
        windupAt = at + recovery + this.roll(0, component.hits ? 40 : 180) * speed;
        hand = hand === 'left' ? 'right' : 'left';
      }
    }
    // This plan is final: input and phase changes cannot reroll an announced hit.
    this.endAt = this.sequence.at(-1).at + MODES[this.mode].window + 850;
  }

  damageBoss(amount) {
    this.bossHp = Math.max(0, this.bossHp - amount);
    if (!this.bossHp) {
      this.state = 'won';
      this.emit('won');
    } else if (this.bossHp <= BOSS_HP / 2 && this.phase === 1) {
      this.phase = 2;
      this.emit('phase');
    }
  }

  tap(now, side) {
    this.update(now);
    if (this.state !== 'boss') return 'inactive';
    if (!['left', 'right'].includes(side)) return 'invalid';
    if (this.held.has(side)) return 'held';
    this.held.add(side);
    if (this.pending && side !== this.pending.side && this.held.has(this.pending.side)) {
      const first = this.pending;
      this.pending = null;
      this.lastTap = now;
      return this.resolveInput('both', first.at, now);
    }
    if (now - this.lastTap < COOLDOWN) return 'cooldown';
    this.lastTap = now;
    // Briefly collect a chord so pressing both cannot auto-block single-hand attacks.
    this.pending = { side, at: now };
    return 'pending';
  }

  release(now, side) {
    this.update(now);
    this.held.delete(side);
    if (this.pending?.side === side) {
      const first = this.pending;
      this.pending = null;
      return this.resolveInput(side, first.at);
    }
  }

  resolveInput(side, firstAt, lastAt = firstAt) {
    const { window, perfect } = MODES[this.mode];
    const hit = this.sequence.find(h => !h.resolved && Math.abs(firstAt - h.at) <= window);
    if (!hit) {
      const late = this.sequence.some(h => h.result === 'miss' && firstAt > h.at + window && firstAt - h.at < window + COOLDOWN);
      const result = late ? 'late' : 'early';
      this.emit(result);
      return result;
    }
    if (side !== hit.guard) {
      this.emit('wrong', { required: hit.guard });
      return 'wrong';
    }
    if (Math.abs(lastAt - hit.at) > window) {
      this.emit('late');
      return 'late';
    }
    const offset = Math.abs(firstAt - hit.at) > Math.abs(lastAt - hit.at) ? firstAt - hit.at : lastAt - hit.at;
    hit.resolved = true;
    hit.result = Math.abs(offset) <= perfect ? 'perfect' : 'parry';
    this.parries++;
    this.streak++;
    this.bestStreak = Math.max(this.bestStreak, this.streak);
    if (hit.result === 'perfect') this.perfects++;
    this.emit(hit.result, { offset: Math.round(offset), guard: side });
    return hit.result;
  }

  update(now) {
    this.time = now;
    if (['ready', 'won', 'lost'].includes(this.state)) return;
    this.elapsed = now;
    if (this.state !== 'boss') return;
    if (this.pending && now - this.pending.at > CHORD_MS) {
      const first = this.pending;
      this.pending = null;
      this.resolveInput(first.side, first.at);
    }
    for (const hit of this.sequence) {
      if (!hit.resolved && now > hit.at + MODES[this.mode].window) {
        // A valid late press keeps its original timestamp while its chord is collected.
        if (this.pending && Math.abs(this.pending.at - hit.at) <= MODES[this.mode].window) continue;
        hit.resolved = true;
        hit.result = 'miss';
        this.hits++;
        this.streak = 0;
        if (this.mode !== 'practice') this.hp--;
        this.emit('hurt');
        if (this.hp <= 0) {
          this.state = 'lost';
          this.emit('lost');
          return;
        }
      }
    }
    if (now >= this.endAt) {
      this.state = 'player';
      this.emit('turn');
    }
  }

  nextHit() { return this.sequence.find(h => !h.resolved); }
}
