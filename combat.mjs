import { MOTIONS } from './motion.mjs';

export const MODES = {
  challenge: { window: 115, perfect: 48, label: '도전' },
  practice: { window: 185, perfect: 80, label: '연습' },
};
// Shared by parry and dodge, including mistimed attempts.
export const COOLDOWN = 600;
export const DODGE_EXTRA_MS = 70;
export const CHORD_MS = 80;
export const ENEMY_HP = { normal: 7, elite: 15, boss: 30 };
export const BOSS_HP = ENEMY_HP.boss;
export const BASE_ATTACK_DAMAGE = 1;
export const MAX_HP = 5;
export const HEAL_AMOUNT = 2;
export const POTIONS = 2;
export const ITEM_USE_MS = 850;
export const COUNTER_MS = 520;
export const TELEGRAPH_MS = 620;
export const MAX_STRIKES = 6;
export const WEAKEN_ATTACKS = 2;
export const WEAKEN_MULTIPLIER = .5;
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
  { type: 'judgment', name: '단죄의 일격', damage: 2, windup: [1100, 1450], tempo: 'hold', delay: [650, 1000] },
  { type: 'execution', name: '종언의 쌍검', damage: 3, windup: [1250, 1600], tempo: 'hold', delay: [850, 1300], guard: 'both' },
];

export const HOUND_ATTACK_COMPONENTS = [
  { type: 'hound-rake', name: '앞발 후려치기', windup: [760, 1050] },
  { type: 'hound-rush', name: '낮은 쇄도', windup: [700, 950], tempo: 'quick' },
  { type: 'hound-pounce', name: '사냥 도약', windup: [1050, 1400], tempo: 'quick' },
  { type: 'hound-rebound', name: '후퇴 후 덮치기', windup: [1000, 1300], tempo: 'hold', delay: [400, 700] },
  { type: 'hound-flurry', name: '엇박 발톱 연타', windup: [680, 920], tempo: 'quick', hits: [2, 3] },
  { type: 'hound-scoop', name: '지면 할퀴기', windup: [900, 1200], tempo: 'hold', delay: [550, 900] },
  { type: 'hound-feint', name: '어깨 속임수', windup: [760, 1000], tempo: 'feint', delay: [650, 1100] },
  { type: 'hound-maul', name: '쌍발 내려찍기', windup: [1000, 1400], tempo: 'hold', delay: [700, 1100], guard: 'both' },
];

export const BELL_ATTACK_COMPONENTS = [
  { type: 'bell-hammer', name: '묵직한 철추', windup: [1050, 1400], tempo: 'hold', delay: [650, 1100] },
  { type: 'bell-pendulum', name: '추의 횡진', windup: [950, 1250] },
  { type: 'bell-auger', name: '비틀어 올리기', windup: [1000, 1350], tempo: 'hold', delay: [500, 850] },
  { type: 'bell-march', name: '철각 전진', windup: [1100, 1450], tempo: 'quick' },
  { type: 'bell-triplet', name: '엇박 종추 연타', windup: [850, 1250], tempo: 'hold', delay: [200, 750], hits: [2, 3] },
  { type: 'bell-resonance', name: '공명 충격파', windup: [1000, 1300], tempo: 'hold', delay: [550, 900], flight: [900, 1200], guard: 'both' },
  { type: 'bell-groundbreak', name: '종의 대지 강타', damage: 2, windup: [1400, 1800], tempo: 'hold', delay: [800, 1200], flight: [850, 1100], guard: 'both' },
  { type: 'bell-lament', name: '쇠약의 종울림', damage: 0, effect: 'weaken', windup: [1200, 1550], tempo: 'hold', delay: [750, 1100], flight: [1000, 1300], guard: 'both' },
  { type: 'bell-fault', name: '균열 내려찍기', damage: 2, windup: [1200, 1500], tempo: 'hold', delay: [800, 1250] },
  { type: 'bell-toll', name: '종언의 타종', damage: 3, windup: [1300, 1600], tempo: 'hold', delay: [900, 1400], guard: 'both' },
];

// One clock, supplied by the caller: pausing and dropped frames cannot change a hit's timing.
export class Combat {
  constructor({ random = Math.random, mode = 'challenge', practiceAttack = 'random', enemy = 'boss', species = enemy === 'normal' ? 'hound' : enemy === 'elite' ? 'bell' : 'warden', bossHp = ENEMY_HP[enemy] ?? BOSS_HP, profile = {} } = {}) {
    this.random = random;
    this.mode = MODES[mode] ? mode : 'challenge';
    this.species = ['hound', 'bell'].includes(species) ? species : 'warden';
    this.components = this.species === 'hound' ? HOUND_ATTACK_COMPONENTS : this.species === 'bell' ? BELL_ATTACK_COMPONENTS : ATTACK_COMPONENTS;
    this.practiceAttack = this.components.some(c => c.type === practiceAttack) ? practiceAttack : 'random';
    this.enemy = enemy;
    this.bossMaxHp = bossHp;
    this.profile = { ...profile };
    this.reset();
  }

  reset() {
    this.state = 'ready';
    this.maxHp = this.profile.maxHp ?? MAX_HP;
    this.hp = this.profile.hp ?? this.maxHp;
    this.potions = this.profile.potions ?? POTIONS;
    this.attackDamage = this.profile.attackDamage ?? BASE_ATTACK_DAMAGE;
    this.weakenedAttacks = 0;
    this.healAmount = this.profile.healAmount ?? HEAL_AMOUNT;
    this.attacks = 0;
    this.potionsUsed = 0;
    this.healAt = -Infinity;
    this.bossHp = this.bossMaxHp;
    this.phase = 1;
    this.round = 0;
    this.hits = 0;
    this.parries = 0;
    this.dodges = 0;
    this.perfects = 0;
    this.counters = 0;
    this.streak = 0;
    this.bestStreak = 0;
    this.lastTap = -Infinity;
    this.dodgeAt = -Infinity;
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
    const damage = this.nextAttackDamage();
    this.weakenedAttacks = Math.max(0, this.weakenedAttacks - 1);
    this.attacks++;
    this.damageBoss(damage);
    this.emit('attack', { damage });
    if (this.state === 'won') return true;
    this.state = 'boss';
    this.beginSequence(now + 850);
    return true;
  }

  heal(now) {
    this.update(now);
    if (this.state !== 'player' || this.mode === 'practice' || this.hp >= this.maxHp || this.potions === 0) return false;
    const amount = Math.min(this.healAmount, this.maxHp - this.hp);
    this.hp += amount;
    this.potions--;
    this.potionsUsed++;
    this.healAt = now;
    this.round++;
    this.emit('heal', { amount });
    this.state = 'boss';
    this.beginSequence(now + ITEM_USE_MS);
    return true;
  }

  beginSequence(start) {
    // Compose fresh components every turn; each may contain one or more strikes.
    // Phase changes speed, never the component pool or a fixed turn pattern.
    const selected = this.mode === 'practice' && this.components.find(c => c.type === this.practiceAttack);
    const count = selected ? 1 : 1 + Math.floor(this.random() * (this.enemy === 'normal' ? 2 : this.enemy === 'elite' ? 3 : 4));
    const speed = this.phase === 2 ? 0.88 : 1;
    this.sequence = [];
    let windupAt = start;
    // Even a late parry followed by the earliest dodge must clear shared recovery.
    const recovery = Math.max(240, COOLDOWN + MODES[this.mode].window + this.dodgeDuration() + 20 - TELEGRAPH_MS);
    for (let i = 0; i < count && this.sequence.length < MAX_STRIKES; i++) {
      const specialUsed = this.sequence.some(hit => hit.damage > 1);
      const weakenUsed = this.sequence.some(hit => hit.effect === 'weaken');
      const pool = this.components.filter(c => (!c.hits || c.hits[0] <= MAX_STRIKES - this.sequence.length) && !((specialUsed || this.enemy === 'normal') && c.damage > 1) && !(weakenUsed && c.effect === 'weaken'));
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
        this.sequence.push({ type: component.type, name: component.name, damage: component.damage ?? 1, effect: component.effect, hand, guard, tempo, motion, motionStrength, group: i, stroke, strokes, windupAt, commitAt, launchAt, at, resolved: false, result: null });
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
      this.weakenedAttacks = 0;
      this.emit('won');
    } else if (this.enemy !== 'normal' && this.bossHp <= this.bossMaxHp / 2 && this.phase === 1) {
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
      // A chord completes the original attempt, so it does not restart cooldown.
      return this.resolveInput('both', first.at, now);
    }
    if (this.cooldownRemaining(now) > 0) return 'cooldown';
    this.lastTap = now;
    // Briefly collect a chord so pressing both cannot auto-block single-hand attacks.
    this.pending = { side, at: now };
    return 'pending';
  }

  dodge(now) {
    this.update(now);
    if (this.state !== 'boss') return 'inactive';
    if (this.cooldownRemaining(now) > 0) return 'cooldown';
    this.dodgeAt = now;
    this.emit('dodge');
    // Also cover an input exactly at impact, without granting retroactive immunity.
    this.update(now);
    return 'dodge';
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
    if (this.state === 'counter') {
      if (now >= this.attackAt + COUNTER_MS) {
        this.state = 'player';
        this.emit('turn', { counter: true });
      }
      return;
    }
    if (this.state !== 'boss') return;
    if (this.pending && now - this.pending.at > CHORD_MS) {
      const first = this.pending;
      this.pending = null;
      this.resolveInput(first.side, first.at);
    }
    for (const hit of this.sequence) {
      if (!hit.resolved && now >= hit.at && this.isDodgingAt(hit.at)) {
        hit.resolved = true;
        hit.result = 'dodge';
        this.dodges++;
        this.streak = 0;
        this.emit('evade');
      }
      if (!hit.resolved && now > hit.at + MODES[this.mode].window) {
        // A valid late press keeps its original timestamp while its chord is collected.
        if (this.pending && Math.abs(this.pending.at - hit.at) <= MODES[this.mode].window) continue;
        hit.resolved = true;
        hit.result = 'miss';
        this.hits++;
        this.streak = 0;
        const damage = this.mode === 'practice' || hit.damage === 0 ? 0 : Math.max(1, hit.damage - (hit.damage > 1 ? this.profile.specialReduction ?? 0 : 0));
        this.hp = Math.max(0, this.hp - damage);
        if (hit.effect === 'weaken') {
          this.weakenedAttacks = WEAKEN_ATTACKS;
          this.emit('weaken');
        } else this.emit('hurt', { damage, attackDamage: hit.damage });
        if (this.hp <= 0) {
          this.state = 'lost';
          this.weakenedAttacks = 0;
          this.emit('lost');
          return;
        }
      }
    }
    if (now >= this.endAt) {
      // Reward the whole completed enemy turn, once; individual parries still
      // deal no damage and an early final parry cannot skip the enemy's motion.
      if (this.sequence.length && this.sequence.every(hit => hit.result === 'perfect')) {
        this.state = 'counter';
        this.attackAt = now;
        this.counters++;
        const damage = Math.min(this.bossHp, this.counterDamage());
        this.weakenedAttacks = Math.max(0, this.weakenedAttacks - 1);
        this.emit('counter', { damage, strikes: this.sequence.length });
        this.damageBoss(damage);
        return;
      }
      this.state = 'player';
      this.emit('turn');
    }
  }

  nextHit() { return this.sequence.find(h => !h.resolved); }
  outgoingDamage(amount) { return amount * (this.weakenedAttacks > 0 ? WEAKEN_MULTIPLIER : 1); }
  nextAttackDamage() { return this.outgoingDamage(this.attackDamage + (this.attacks === 0 ? this.profile.firstStrikeBonus ?? 0 : 0)); }
  counterDamage() { return this.outgoingDamage(Math.max(1, Math.min(3, Math.ceil(this.attackDamage / 2)))); }
  dodgeDuration() { return MODES[this.mode].window * 2 + DODGE_EXTRA_MS; }
  isDodgingAt(now) { return now >= this.dodgeAt && now < this.dodgeAt + this.dodgeDuration(); }
  cooldownRemaining(now = this.time) { return Math.max(0, Math.max(this.lastTap, this.dodgeAt) + COOLDOWN - now); }
}
