import test from 'node:test';
import assert from 'node:assert/strict';
import { Combat, MODES, COOLDOWN, CHORD_MS, ATTACK_COMPONENTS, TELEGRAPH_MS, MAX_STRIKES, ITEM_USE_MS, DODGE_EXTRA_MS } from './combat.mjs';
import { MOTIONS, motionAt, attackPoseAt, playerPoseAt, specialIntensityAt } from './motion.mjs';

function seeded(seed) {
  return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
}

function parry(game, now, hit = game.nextHit()) {
  const side = hit?.guard === 'both' ? 'left' : hit?.guard || 'left';
  const first = game.tap(now, side);
  if (first !== 'pending') { game.release(now, side); return first; }
  if (hit.guard !== 'both') return game.release(now, side);
  const result = game.tap(now, 'right');
  game.release(now, 'left'); game.release(now, 'right');
  return result;
}

test('dodge immunity covers every attack at impact, lasts just longer than parry, and cannot erase a late hit', () => {
  assert.equal(DODGE_EXTRA_MS, 70);
  for (const mode of Object.keys(MODES)) for (const [index, component] of ATTACK_COMPONENTS.entries()) {
    for (const timing of ['early', 'first', 'last', 'late']) {
      const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length];
      const game = new Combat({ mode, practiceAttack: component.type, random: () => rolls.shift() ?? .5 });
      game.start(); game.attack(0); game.drain();
      const hit = game.nextHit(), bossHp = game.bossHp, duration = game.dodgeDuration();
      assert.equal(duration, MODES[mode].window * 2 + 70);
      const offset = { early: -duration - 1, first: -duration + 1, last: 0, late: 1 }[timing];
      const at = hit.at + offset;
      assert.equal(game.dodge(at), 'dodge');
      assert.ok(game.isDodgingAt(at));
      assert.ok(game.isDodgingAt(at + duration - 1));
      assert.equal(game.isDodgingAt(at + duration), false, 'immunity ends independently of recovery');
      game.update(hit.at + MODES[mode].window + 1);
      const avoided = timing === 'first' || timing === 'last';
      assert.equal(hit.result, avoided ? 'dodge' : 'miss', component.type);
      assert.equal(game.dodges, avoided ? 1 : 0);
      assert.equal(game.hits, avoided ? 0 : 1);
      assert.equal(game.hp, avoided || mode === 'practice' ? 5 : 5 - hit.damage);
      assert.equal(game.bossHp, bossHp);
      assert.equal(game.parries, 0); assert.equal(game.perfects, 0);
      assert.equal(game.drain().filter(e => e.type === 'evade').length, avoided ? 1 : 0);
      game.update(game.time);
      assert.equal(game.drain().length, 0, 'frozen clock or repeated frame cannot resolve twice');
    }
  }
});

test('dodge and parry share recovery without queued inputs, immunity extension, or broken two-hand chords', () => {
  const game = new Combat({ random: () => 0 });
  assert.equal(game.dodge(0), 'inactive');
  game.start();
  assert.equal(game.dodge(0), 'inactive');
  game.attack(0);
  assert.equal(game.dodge(0), 'dodge'); // Too early, but still spends recovery.
  for (const at of [1, 100, 300, 599]) {
    assert.equal(game.dodge(at), 'cooldown');
    assert.equal(game.tap(at, 'left'), 'cooldown'); game.release(at, 'left');
    assert.equal(game.tap(at, 'right'), 'cooldown'); game.release(at, 'right');
    assert.equal(game.dodgeAt, 0);
    assert.equal(game.cooldownRemaining(at), COOLDOWN - at);
  }
  assert.equal(game.dodge(600), 'dodge');
  assert.equal(game.dodgeAt, 600);
  game.start(); game.attack(0);
  const hit = game.nextHit(); hit.guard = 'both';
  assert.equal(game.tap(hit.at, 'left'), 'pending');
  assert.equal(game.dodge(hit.at + 1), 'cooldown', 'cannot cancel a parry into dodge');
  assert.equal(game.tap(hit.at + 10, 'right'), 'perfect', 'second parry finger remains allowed');
  game.release(hit.at + 10, 'left'); game.release(hit.at + 10, 'right');
  assert.equal(game.dodgeAt, -Infinity);
  assert.equal(game.cooldownRemaining(hit.at + 10), 590);
  game.update(game.endAt);
  assert.equal(game.dodge(game.time), 'inactive');
  game.damageBoss(game.bossMaxHp);
  assert.equal(game.dodge(game.time), 'inactive');
  game.start(); game.hp = 1; game.attack(0); game.update(game.endAt);
  assert.equal(game.state, 'lost'); assert.equal(game.dodge(game.time), 'inactive');
  game.start();
  assert.equal(game.dodgeAt, -Infinity); assert.equal(game.dodges, 0);
  assert.equal(game.cooldownRemaining(0), 0);
});

test('400 randomized battles can finish without damage using dodges or mixed late parries and early dodges', () => {
  for (const mode of Object.keys(MODES)) for (let seed = 1; seed <= 200; seed++) {
    const game = new Combat({ mode, random: seeded(seed) });
    game.start(); let strikes = 0;
    while (game.state !== 'won') {
      game.attack(game.time + 1);
      if (game.state === 'won') break;
      const plan = structuredClone(game.sequence);
      for (const [i, hit] of game.sequence.entries()) {
        if (seed % 2 === 0 && i % 2 === 0) {
          assert.equal(parry(game, hit.at + MODES[mode].window - 1, hit), 'parry');
        } else {
          const at = hit.at - (i % 2 ? game.dodgeDuration() - 1 : 0);
          assert.equal(game.dodge(at), 'dodge');
          game.update(hit.at);
          assert.equal(hit.result, 'dodge');
        }
        strikes++;
      }
      assert.deepEqual(game.sequence.map(hit => ({ ...hit, resolved: false, result: null })), plan);
      game.update(game.endAt);
    }
    assert.equal(game.hits, 0); assert.equal(game.hp, 5); assert.equal(game.round, 30);
    assert.equal(game.dodges + game.parries, strikes);
  }
});

test('potions consume one player turn, heal up to the cap, preserve hit records, and reset only for a new battle', () => {
  let rolls = 0;
  const game = new Combat({ random: () => { rolls++; return 0; } });
  assert.equal(game.heal(0), false, 'cannot use before starting');
  game.start(); game.drain();
  assert.equal(game.heal(0), false, 'full health cannot waste a potion or turn');
  assert.equal(game.round, 0); assert.equal(rolls, 0); assert.equal(game.potions, 2);
  game.attack(100);
  assert.equal(game.heal(101), false, 'cannot heal in the boss turn');
  game.update(game.endAt);
  assert.equal(game.hp, 4);
  const usedAt = game.time + 1, previousPlan = game.sequence, previousRolls = rolls, bossHp = game.bossHp;
  game.drain();
  assert.equal(game.heal(usedAt), true);
  assert.equal(game.hp, 5, 'cap gives only one health when one is missing');
  assert.equal(game.potions, 1); assert.equal(game.potionsUsed, 1);
  assert.equal(game.round, 2); assert.equal(game.state, 'boss');
  assert.equal(game.hits, 1, 'healing never restores the no-hit record');
  assert.equal(game.bossHp, bossHp); assert.equal(game.attackAt, 100, 'healing cannot damage or animate an attack');
  assert.deepEqual(game.drain(), [{ type: 'heal', at: usedAt, amount: 1 }]);
  assert.notEqual(game.sequence, previousPlan); assert.ok(rolls > previousRolls, 'fresh random components after an item turn');
  assert.equal(game.sequence[0].windupAt, usedAt + ITEM_USE_MS, 'finish using the item before telegraphing');
  const plan = structuredClone(game.sequence), plannedRolls = rolls;
  assert.equal(game.heal(usedAt), false, 'double activation cannot use the second potion');
  assert.equal(game.attack(usedAt), false, 'the same turn cannot also attack');
  assert.equal(game.potions, 1); assert.equal(rolls, plannedRolls);
  assert.deepEqual(game.sequence, plan);
  game.update(game.endAt); // 4 HP
  game.attack(game.time + 1); game.update(game.endAt); // 3 HP
  const hits = game.hits;
  assert.equal(game.heal(game.time + 1), true);
  assert.equal(game.hp, 5); assert.equal(game.potions, 0); assert.equal(game.potionsUsed, 2);
  assert.equal(game.hits, hits);
  game.update(game.endAt);
  const round = game.round;
  assert.equal(game.heal(game.time + 1), false, 'empty inventory cannot consume a turn');
  assert.equal(game.state, 'player'); assert.equal(game.round, round);
  while (game.state !== 'lost') { game.attack(game.time + 1); game.update(game.endAt); }
  assert.equal(game.heal(game.time + 1), false, 'no revival after death');
  game.start();
  assert.equal(game.hp, 5); assert.equal(game.potions, 2); assert.equal(game.potionsUsed, 0);
  assert.equal(game.healAt, -Infinity); assert.equal(game.hits, 0);
  game.damageBoss(game.bossMaxHp);
  assert.equal(game.heal(1), false, 'finished battles cannot use items');
  const practice = new Combat({ mode: 'practice' }); practice.start();
  assert.equal(practice.heal(0), false); assert.equal(practice.potions, 2);
});

test('special strikes deal 2 or 3 HP once, remain fully parryable, and telegraph on the paused combat clock', () => {
  for (const [type, damage] of [['judgment', 2], ['execution', 3]]) {
    const index = ATTACK_COMPONENTS.findIndex(c => c.type === type);
    for (const mode of Object.keys(MODES)) for (const phase of [1, 2]) {
      for (const input of ['miss', 'wrong', 'perfect', 'parry', 'lethal']) {
        const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length];
        const game = new Combat({ mode, practiceAttack: type, random: () => rolls.shift() ?? .5 });
        game.start();
        if (phase === 2) game.damageBoss(game.bossMaxHp / 2);
        game.attack(0); game.drain();
        const hit = game.sequence[0], bossHp = game.bossHp;
        assert.equal(hit.type, type); assert.equal(hit.damage, damage);
        assert.ok(hit.at - hit.windupAt >= 1500, 'specials retain readable preparation even in phase II');
        const shownAt = hit.windupAt + 400, shown = specialIntensityAt(hit, shownAt);
        assert.equal(specialIntensityAt(hit, hit.windupAt - 1), 0, 'do not reveal future attacks');
        assert.equal(shown, 1);
        assert.equal(specialIntensityAt(hit, shownAt), shown, 'same paused clock freezes darkness');
        for (const at of [hit.windupAt, hit.windupAt + 360, hit.at, hit.at + 420]) {
          assert.ok(Math.abs(specialIntensityAt(hit, at - .001) - specialIntensityAt(hit, at + .001)) < .001);
        }
        if (input === 'lethal') game.hp = 1;
        if (input === 'perfect' || input === 'parry') {
          assert.equal(parry(game, hit.at + (input === 'parry' ? MODES[mode].window - 1 : 0), hit), input);
        } else if (input === 'wrong') {
          const side = hit.guard === 'left' ? 'right' : 'left';
          game.tap(hit.at, side); assert.equal(game.release(hit.at, side), 'wrong');
        }
        const blocked = input === 'perfect' || input === 'parry';
        game.update(hit.at + MODES[mode].window + 1);
        const expectedDamage = blocked || mode === 'practice' ? 0 : damage;
        assert.equal(game.hp, Math.max(0, (input === 'lethal' ? 1 : 5) - expectedDamage));
        assert.equal(game.bossHp, bossHp, 'special parries cannot damage the boss');
        assert.equal(game.hits, blocked ? 0 : 1, 'one special is one recorded hit');
        const hurts = game.drain().filter(e => e.type === 'hurt');
        assert.equal(hurts.length, blocked ? 0 : 1);
        if (!blocked) assert.equal(hurts[0].damage, mode === 'practice' ? 0 : damage);
        if (input === 'lethal' && mode === 'challenge') assert.equal(game.state, 'lost');
        const hp = game.hp;
        game.update(hit.at + MODES[mode].window + 2);
        assert.equal(game.hp, hp, 'do not apply damage again on subsequent frames');
        assert.equal(specialIntensityAt(hit, hit.at + 420), 0, 'darkness clears after the strike');
      }
    }
  }
  assert.equal(specialIntensityAt({ damage: 1, windupAt: 0, at: 1000 }, 500), 0);
});

test('attack animation weights select the correct arms, reach impact on time, and recover continuously without changing combat', () => {
  const rest = attackPoseAt(null, 0, 'left');
  for (const component of ATTACK_COMPONENTS) for (const random of [0, .5, .99]) {
    const game = new Combat({ mode: 'practice', practiceAttack: component.type, random: () => random });
    game.start(); game.attack(0);
    for (const hit of game.sequence) {
      const original = JSON.stringify(hit), release = hit.launchAt ?? hit.at;
      const hand = hit.hand, other = hand === 'left' ? 'right' : 'left';
      const preparation = attackPoseAt(hit, release - 170, hand);
      assert.ok(preparation.prepare > .1, `${hit.type} must actually move its arm`);
      assert.equal(attackPoseAt(hit, release, hand).swing, 1, 'full strike at hit / launch, never after it');
      assert.deepEqual(attackPoseAt(hit, release + 240, hand), rest);
      assert.deepEqual(attackPoseAt(hit, hit.windupAt, hand), rest);
      assert.deepEqual(attackPoseAt(hit, release, hand, true), rest);
      if (hit.guard !== 'both') assert.deepEqual(attackPoseAt(hit, release - 170, other), rest, 'do not expose the next combo hand');
      else assert.equal(attackPoseAt(hit, release, other).swing, 1);
      for (const boundary of [hit.windupAt, hit.commitAt, release - 160, release, release + 240]) {
        const before = attackPoseAt(hit, boundary - .001, hand), after = attackPoseAt(hit, boundary + .001, hand);
        for (const key of Object.keys(rest)) assert.ok(Math.abs(before[key] - after[key]) < .001, `${hit.type}: continuous ${key} at ${boundary}`);
      }
      const pose = attackPoseAt(hit, release - 100, hand);
      hit.resolved = true; hit.result = 'perfect';
      assert.deepEqual(attackPoseAt(hit, release - 100, hand), pose, 'early parry must not snap the arm to rest');
      hit.resolved = false; hit.result = null;
      assert.equal(JSON.stringify(hit), original);
    }
  }
  const neutral = { sword: 0, guard: 0, recoil: 0 };
  assert.deepEqual(playerPoseAt(0, -Infinity, -Infinity, -Infinity), neutral);
  assert.deepEqual(playerPoseAt(1000, 0, 0, 0), neutral);
  assert.ok(playerPoseAt(150, 0, -Infinity, -Infinity).sword > 2);
  assert.ok(playerPoseAt(320, 0, -Infinity, -Infinity).sword < 0);
  assert.ok(playerPoseAt(175, -Infinity, 0, -Infinity).guard > .99);
  assert.deepEqual(playerPoseAt(150, 0, 0, 0, true), neutral);
});

test('400 composed battles can be cleared without damage, with all components available in both phases', () => {
  const seen = { 1: new Set(), 2: new Set() };
  const tempos = { 1: new Set(), 2: new Set() };
  const counts = { 1: new Set(), 2: new Set() };
  const motions = { 1: new Set(), 2: new Set() };
  const handOrders = new Set();
  const combinations = new Set();
  for (const mode of Object.keys(MODES)) {
    for (let seed = 1; seed <= 200; seed++) {
      const game = new Combat({ mode, random: seeded(Math.imul(seed, 0x9e3779b1)) });
      game.start();
      let now = 0;
      while (game.state !== 'won' && game.round < 30) {
        assert.equal(game.state, 'player');
        assert.ok(game.attack(now += 100));
        if (game.state === 'won') break;
        for (const hit of game.sequence) {
          seen[game.phase].add(hit.type);
          tempos[game.phase].add(hit.tempo);
          motions[game.phase].add(hit.motion);
        }
        counts[game.phase].add(game.sequence.length);
        handOrders.add(game.sequence.map(hit => hit.hand === 'right' ? 'R' : 'L').join(''));
        combinations.add(game.sequence.map(hit => `${hit.hand}:${hit.type}:${hit.tempo}`).join('/'));
        for (let i = 0; i < game.sequence.length; i++) {
          const hit = game.sequence[i];
          if (i) assert.ok(hit.at - game.sequence[i - 1].at >= COOLDOWN + MODES[mode].window * 2);
          now = hit.at;
          assert.equal(parry(game, now, hit), 'perfect');
          assert.equal(game.hp, 5);
          if (game.state === 'won') break;
        }
        if (game.state !== 'won') game.update(now = game.endAt);
      }
      assert.equal(game.state, 'won');
      assert.equal(game.round, 30, 'thirty direct attacks at damage 1 deplete 30 HP');
      assert.equal(game.bossHp, 0);
      assert.equal(game.hits, 0);
      assert.equal(game.parries, game.perfects);
      assert.equal(game.phase, 2);
    }
  }
  for (const phase of [1, 2]) {
    assert.equal(seen[phase].size, ATTACK_COMPONENTS.length);
    assert.equal(tempos[phase].size, 3);
    assert.equal(motions[phase].size, MOTIONS.length);
    assert.deepEqual([...counts[phase]].sort(), [1, 2, 3, 4, 5, 6]);
  }
  assert.ok(combinations.size > 200, 'compose many new arrangements instead of choosing a small authored list');
  for (const order of ['R', 'L', 'RL', 'LR', 'RLR', 'LRL', 'RRR', 'LLL', 'RRRR', 'LLLL', 'RLRL', 'LRLR']) {
    assert.ok(handOrders.has(order), `${order} appears in actual randomized battles`);
  }
});

test('4,000 generated turns give every strike a full cue and allow late-then-early parries without rerolling', () => {
  for (const mode of Object.keys(MODES)) {
    for (const phase of [1, 2]) {
      for (let seed = 1; seed <= 1000; seed++) {
        const random = seeded(Math.imul(seed, 0x9e3779b1));
        let rolls = 0;
        const game = new Combat({ mode, random: () => { rolls++; return random(); } });
        game.start();
        if (phase === 2) game.damageBoss(game.bossMaxHp / 2);
        game.attack(100);
        assert.ok(game.sequence.length >= 1 && game.sequence.length <= MAX_STRIKES);
        assert.ok(game.sequence.filter(hit => hit.damage > 1).length <= 1, 'at most one special per random turn');
        const plan = structuredClone(game.sequence);
        const planningRolls = rolls;
        for (const [i, hit] of game.sequence.entries()) {
          assert.ok(['left', 'right'].includes(hit.hand));
          const component = ATTACK_COMPONENTS.find(c => c.type === hit.type);
          assert.equal(hit.guard, component.guard || hit.hand);
          assert.ok(ATTACK_COMPONENTS.some(component => component.type === hit.type));
          assert.ok(['quick', 'hold', 'feint'].includes(hit.tempo));
          assert.ok(MOTIONS.includes(hit.motion));
          assert.ok(hit.motionStrength >= .85 && hit.motionStrength <= 1.15);
          assert.ok(hit.commitAt >= hit.windupAt);
          assert.ok(hit.at - hit.commitAt >= TELEGRAPH_MS - 1e-8);
          assert.equal(hit.commitAt === hit.windupAt, hit.tempo === 'quick');
          if (component.hits) {
            assert.ok(hit.strokes >= 2 && hit.strokes <= 3);
            if (hit.stroke) {
              assert.equal(game.sequence[i - 1].group, hit.group);
              assert.notEqual(game.sequence[i - 1].hand, hit.hand);
            }
          }
          if (i) {
            const previous = game.sequence[i - 1];
            assert.ok(hit.windupAt >= previous.at + Math.max(240, MODES[mode].window));
            assert.ok(hit.at - previous.at >= COOLDOWN + 2 * MODES[mode].window);
          }
          // A late parry followed by an early one is the tightest allowed input gap.
          const offset = (MODES[mode].window - 1) * (i % 2 ? -1 : 1);
          assert.equal(parry(game, hit.at + offset, hit), 'parry');
          assert.equal(game.hp, 5);
        }
        assert.deepEqual(game.sequence.map(hit => ({ ...hit, resolved: false, result: null })), plan);
        assert.equal(rolls, planningRolls, 'no new randomness during defense');
        game.update(game.endAt);
        assert.equal(game.hits, 0);
        assert.equal(game.state, 'player');
      }
    }
  }
});

test('all melee and ranged attacks block all damage with the correct guard in both modes and phases', () => {
  for (const mode of Object.keys(MODES)) for (const phase of [1, 2]) for (const hand of ['left', 'right']) {
    ATTACK_COMPONENTS.forEach((component, index) => {
      const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length, hand === 'left' ? .25 : .75];
      const game = new Combat({ mode, random: () => rolls.shift() ?? .5 });
      game.start();
      if (phase === 2) game.damageBoss(game.bossMaxHp / 2);
      game.attack(0);
      assert.equal(game.sequence[0].type, component.type);
      assert.equal(game.sequence[0].hand, hand);
      for (const hit of game.sequence) {
        assert.equal(parry(game, hit.at + MODES[mode].window - 1, hit), 'parry');
        assert.equal(game.hp, 5);
      }
      game.update(game.endAt);
      assert.equal(game.hits, 0);
      assert.equal(game.state, 'player');
    });
  }
});

test('movement stays continuous at impact, resets between strikes, and follows the paused clock without randomness', () => {
  const rest = { x: 0, y: 0, depth: 1 };
  for (const motion of MOTIONS) for (const motionStrength of [.85, 1.15]) {
    const hit = { windupAt: 100, at: 1500, motion, motionStrength };
    assert.deepEqual(motionAt(hit, 0), rest);
    assert.deepEqual(motionAt(hit, 100), rest);
    assert.deepEqual(motionAt(hit, 1740), rest);
    assert.deepEqual(motionAt(hit, 1750), rest);
    for (let now = 100; now <= 1740; now += 8) {
      const pose = motionAt(hit, now);
      assert.ok(Math.abs(pose.x) <= 81 && Math.abs(pose.y) <= 83);
      assert.ok(pose.depth >= .56 && pose.depth <= 1.33);
      assert.deepEqual(motionAt(hit, now), pose, 'same clock gives same pose');
      assert.deepEqual(motionAt(hit, now, true), rest, 'reduced motion is stationary');
    }
    const before = motionAt(hit, hit.at - .01);
    const impact = motionAt(hit, hit.at);
    const after = motionAt(hit, hit.at + .01);
    for (const axis of ['x', 'y', 'depth']) {
      assert.ok(Math.abs(before[axis] - impact[axis]) < .001);
      assert.ok(Math.abs(after[axis] - impact[axis]) < .001);
    }
    const prepare = motionAt(hit, 100 + 1400 * .55);
    if (motion === 'rise' || motion === 'dive') assert.ok(prepare.y < -50);
    if (motion === 'dip') assert.ok(prepare.y > 30 && impact.y < 0);
    if (motion === 'retreat' || motion === 'dive') assert.ok(prepare.depth < .75 && impact.depth > 1.18);
  }
  assert.deepEqual(motionAt(null, 100), rest);
});

test('ranged attacks stay distant during flight, launch is too early to parry, and every arrival is avoidable', () => {
  for (const component of ATTACK_COMPONENTS.filter(c => c.flight)) {
    for (const mode of Object.keys(MODES)) for (const phase of [1, 2]) for (const roll of [0, .5, .999]) {
      const index = ATTACK_COMPONENTS.indexOf(component);
      const rolls = mode === 'challenge' ? [0, (index + .5) / ATTACK_COMPONENTS.length] : [];
      const game = new Combat({ mode, practiceAttack: component.type, random: () => rolls.shift() ?? roll });
      game.start();
      if (phase === 2) game.damageBoss(game.bossMaxHp / 2);
      game.attack(0);
      const bossHp = game.bossHp;
      const plan = structuredClone(game.sequence);
      for (const hit of game.sequence) {
        assert.equal(hit.type, component.type);
        assert.ok(hit.launchAt > hit.commitAt);
        assert.ok(hit.at - hit.launchAt >= TELEGRAPH_MS - 1e-8);
        const distant = motionAt(hit, hit.launchAt);
        assert.ok(distant.depth < .8 && distant.x > 40);
        assert.deepEqual(motionAt(hit, hit.at - 1), distant, 'boss stays back while projectile travels');
        assert.deepEqual(motionAt(hit, hit.at + 240), { x: 0, y: 0, depth: 1 });
        // A rapid volley may launch while the previous parry is still cooling.
        const launchResult = game.cooldownRemaining(hit.launchAt) > 0 ? 'cooldown' : 'early';
        assert.equal(parry(game, hit.launchAt, hit), launchResult, 'launch cannot parry the arriving projectile');
        game.update(hit.at - MODES[mode].window - 1);
        assert.equal(game.hits, 0);
        assert.equal(parry(game, hit.at, hit), 'perfect');
        assert.equal(game.bossHp, bossHp);
      }
      game.update(game.endAt);
      assert.equal(game.hits, 0);
      assert.deepEqual(game.sequence.map(hit => ({ ...hit, resolved: false, result: null })), plan);
    }
  }
});

test('a flurry needs a separate tap per stroke, and selected practice attacks never affect challenge mode', () => {
  const game = new Combat({ mode: 'practice', practiceAttack: 'flurry', random: () => .5 });
  game.start(); game.attack(0);
  assert.equal(game.sequence.length, 3);
  assert.ok(game.sequence.every(hit => hit.type === 'flurry'));
  assert.equal(parry(game, game.sequence[0].at), 'perfect');
  game.update(game.endAt);
  assert.equal(game.parries, 1);
  assert.equal(game.hits, 2);
  const normal = new Combat({ random: seeded(321) });
  const withSelection = new Combat({ practiceAttack: 'fury', random: seeded(321) });
  normal.start(); withSelection.start(); normal.attack(0); withSelection.attack(0);
  assert.deepEqual(normal.sequence, withSelection.sequence);
  assert.equal(new Combat({ practiceAttack: 'unknown' }).practiceAttack, 'random');
});

test('phase changes preserve an announced composition, and fresh turns consume fresh randomness', () => {
  let rolls = 0;
  const random = seeded(12345);
  const game = new Combat({ random: () => { rolls++; return random(); } });
  game.start(); game.attack(0);
  const plan = structuredClone(game.sequence);
  const previousRolls = rolls;
  game.damageBoss(game.bossMaxHp / 2);
  assert.equal(game.phase, 2);
  assert.deepEqual(game.sequence, plan);
  assert.equal(rolls, previousRolls);
  game.update(game.endAt);
  game.attack(game.time + 100);
  assert.ok(rolls > previousRolls);
  assert.notDeepEqual(game.sequence, plan);
});

test('normal and perfect parries block ALL incoming damage without damaging the boss; inputs outside do not', () => {
  for (const mode of Object.keys(MODES)) {
    const margin = MODES[mode].window;
    for (const offset of [-margin - 1, -margin, -48, 0, 48, margin, margin + 1]) {
      const game = new Combat({ mode, random: () => 0 });
      game.start(); game.attack(0);
      const impact = game.sequence[0].at;
      const bossHp = game.bossHp;
      const result = parry(game, impact + offset);
      assert.equal(game.bossHp, bossHp, 'parrying never damages the boss');
      game.update(impact + margin + 2);
      if (Math.abs(offset) <= margin) {
        assert.ok(['parry', 'perfect'].includes(result));
        assert.equal(game.hits, 0);
        assert.equal(game.hp, 5);
      } else {
        assert.equal(result, offset < 0 ? 'early' : 'late');
        assert.equal(game.hits, 1);
        assert.equal(game.hp, mode === 'practice' ? 5 : 4);
      }
    }
  }
});

test('one tap cannot parry multiple hits, attack is turn-gated, and mashing has a recovery', () => {
  const game = new Combat({ random: () => .5 });
  game.start();
  assert.equal(game.tap(0, 'left'), 'inactive');
  game.attack(0);
  assert.equal(game.attack(100), false);
  assert.ok(game.sequence.length >= 2);
  const impact = game.sequence[0].at;
  assert.equal(parry(game, impact - 200), 'early');
  assert.equal(parry(game, impact), 'cooldown');
  game.update(impact + 116);
  assert.equal(game.hits, 1);
  const second = game.sequence[1].at;
  assert.equal(parry(game, second), 'perfect');
  assert.equal(parry(game, second, game.sequence[1]), 'cooldown');
  assert.equal(game.parries, 1);
});

test('every parry attempt shares a 600ms cooldown; rejected presses cannot extend or queue it and a chord is one attempt', () => {
  assert.equal(COOLDOWN, 600);
  for (const mode of Object.keys(MODES)) for (const side of ['left', 'right']) {
    const other = side === 'left' ? 'right' : 'left';
    const window = MODES[mode].window;
    for (const [offset, wrong, expected] of [[-300, false, 'early'], [0, true, 'wrong'], [window + 1, false, 'late'], [window, false, 'parry'], [0, false, 'perfect']]) {
      const game = new Combat({ mode, random: () => 0 });
      game.start(); game.attack(0);
      const hit = game.sequence[0];
      hit.hand = side; hit.guard = side;
      const at = hit.at + offset, input = wrong ? other : side;
      assert.equal(game.tap(at, input), 'pending');
      assert.equal(game.release(at, input), expected);
      assert.equal(game.cooldownRemaining(at), COOLDOWN);
      for (const elapsed of [1, 100, 300, COOLDOWN - 1]) {
        const retrySide = elapsed === 100 ? other : side;
        assert.equal(game.tap(at + elapsed, retrySide), 'cooldown');
        game.release(at + elapsed, retrySide);
        assert.equal(game.lastTap, at, 'mashing must not restart the penalty');
        assert.equal(game.cooldownRemaining(at + elapsed), COOLDOWN - elapsed);
      }
      assert.equal(game.cooldownRemaining(at + COOLDOWN), 0);
      assert.equal(game.tap(at + COOLDOWN, side), 'pending', 'unlock exactly at the boundary');
      assert.equal(game.cooldownRemaining(at + COOLDOWN), COOLDOWN);
      game.start();
      assert.equal(game.cooldownRemaining(0), 0);
    }
  }
  const chord = new Combat({ mode: 'practice', practiceAttack: 'fury', random: () => 0 });
  chord.start(); chord.attack(0);
  const at = chord.sequence[0].at - 40;
  assert.equal(chord.tap(at, 'left'), 'pending');
  assert.equal(chord.tap(at + CHORD_MS, 'right'), 'perfect');
  assert.equal(chord.lastTap, at, 'second finger completes the same attempt');
  assert.equal(chord.cooldownRemaining(at + CHORD_MS), COOLDOWN - CHORD_MS);
  chord.release(at + CHORD_MS, 'left'); chord.release(at + CHORD_MS, 'right');
  assert.equal(chord.tap(at + 100, 'right'), 'cooldown');
  chord.update(at + COOLDOWN);
  assert.equal(chord.pending, null, 'blocked input is not buffered for later');
  assert.equal(chord.tap(at + COOLDOWN, 'right'), 'held', 'must release a key held during cooldown');
  chord.release(at + COOLDOWN, 'right');
  assert.equal(chord.tap(at + COOLDOWN, 'right'), 'pending');
});

test('missed strikes resolve once even across slow frames, defeat is terminal, practice is infinite', () => {
  for (const mode of Object.keys(MODES)) {
    const game = new Combat({ mode, random: () => .5 });
    game.start();
    let now = 0;
    for (let i = 0; i < 5 && game.state !== 'lost'; i++) {
      game.attack(now);
      const count = game.sequence.length;
      const prior = game.hits;
      game.update(now = game.endAt + 100);
      const after = game.hits;
      assert.equal(after, mode === 'practice' ? prior + count : Math.min(5, prior + count));
      game.update(now + 1);
      assert.equal(game.hits, after);
    }
    assert.equal(game.state, mode === 'practice' ? 'player' : 'lost');
    assert.equal(game.hp, mode === 'practice' ? 5 : 0);
    if (mode === 'challenge') {
      assert.equal(game.attack(now + 200), false);
      assert.equal(game.tap(now + 200, 'left'), 'inactive');
    }
    game.start();
    assert.equal(game.hp, 5);
    assert.equal(game.hits, 0);
    assert.equal(game.state, 'player');
  }
});

test('direction must match exactly: wrong side, one hand against fury, and both against a single hand all fail', () => {
  for (const mode of Object.keys(MODES)) for (const hand of ['left', 'right']) {
    for (const type of ['cleave', 'wave', 'fury', 'energy-orb', 'twin-wave']) {
      const index = ATTACK_COMPONENTS.findIndex(c => c.type === type);
      for (const input of ['left', 'right', 'both']) {
        const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length, hand === 'left' ? .25 : .75];
        const game = new Combat({ mode, random: () => rolls.shift() ?? .5 });
        game.start(); game.attack(0);
        const hit = game.sequence[0];
        const first = input === 'both' ? hand : input;
        assert.equal(game.tap(hit.at, first), 'pending');
        const result = input === 'both' ? game.tap(hit.at + 20, first === 'left' ? 'right' : 'left') : game.release(hit.at, first);
        assert.equal(result, input === hit.guard ? 'perfect' : 'wrong');
        assert.equal(game.bossHp, 29);
        game.update(game.endAt);
        assert.equal(game.hits, input === hit.guard ? 0 : 1);
      }
    }
  }
});

test('two-hand parries require overlapping fresh presses within 80ms, with BOTH timestamps inside the hit window', () => {
  for (const mode of Object.keys(MODES)) for (const first of ['left', 'right']) {
    const window = MODES[mode].window;
    for (const scenario of [
      { a: -40, b: 40, ok: true },
      { a: -40, b: 41, ok: false },
      { a: 0, b: 0, ok: true },
      { a: -window, b: -window + CHORD_MS, ok: true },
      { a: window, b: window, ok: true },
      { a: window - 30, b: window + 1, ok: false },
      { a: -window - 1, b: -window + 30, ok: false },
      { a: -20, b: 20, release: true, ok: false },
      { a: -500, b: 0, ok: false },
    ]) {
      const game = new Combat({ mode, practiceAttack: 'fury', random: () => .5 });
      game.start();
      // Select fury deterministically in challenge too.
      const index = ATTACK_COMPONENTS.findIndex(c => c.type === 'fury');
      const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length];
      if (mode === 'challenge') game.random = () => rolls.shift() ?? .5;
      game.attack(0);
      const hit = game.sequence[0];
      assert.equal(hit.guard, 'both');
      game.tap(hit.at + scenario.a, first);
      if (scenario.release) game.release(hit.at + scenario.a, first);
      game.tap(hit.at + scenario.b, first === 'left' ? 'right' : 'left');
      game.update(game.endAt);
      assert.equal(game.hits, scenario.ok ? 0 : 1, JSON.stringify({ mode, first, scenario }));
      assert.equal(game.parries, scenario.ok ? 1 : 0);
      assert.equal(game.bossHp, 29);
    }
  }
});

test('late single presses retain their timestamp, duplicate held inputs do not retrigger, and restart clears chords', () => {
  const game = new Combat({ random: () => 0 });
  game.start(); game.attack(0);
  const hit = game.sequence[0];
  const when = hit.at + MODES.challenge.window;
  assert.equal(game.tap(when, hit.guard), 'pending');
  assert.equal(game.tap(when + 1, hit.guard), 'held');
  game.update(when + CHORD_MS);
  assert.equal(game.hits, 0, 'wait for a late press to finish collecting its chord');
  game.update(when + CHORD_MS + 1);
  assert.equal(game.parries, 1);
  assert.equal(game.hits, 0);
  assert.equal(game.sequence[0].result, 'parry');
  assert.equal(game.tap(when + COOLDOWN + 1, hit.guard), 'held');
  game.start();
  assert.equal(game.held.size, 0);
  assert.equal(game.pending, null);
  game.attack(0);
  assert.equal(game.tap(game.sequence[0].at, 'both'), 'invalid', 'no single-input shortcut for both hands');
  assert.equal(game.lastTap, -Infinity);
});
