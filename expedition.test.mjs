import test from 'node:test';
import assert from 'node:assert/strict';
import { Expedition, makeMap, XP_REWARDS } from './expedition.mjs';
import { Combat, ATTACK_COMPONENTS } from './combat.mjs';

const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
const battleTypes = ['normal', 'elite', 'boss'];

test('new battles and expedition nodes use attack 1 and enemy HP 7/15/30 at every floor', () => {
  for (const [enemy, hp] of [['normal', 7], ['elite', 15], ['boss', 30]]) {
    const fight = new Combat({ enemy });
    fight.start();
    assert.equal(fight.attackDamage, 1);
    assert.equal(fight.bossMaxHp, hp); assert.equal(fight.bossHp, hp);
    fight.attack(1); assert.equal(fight.bossHp, hp - 1);
    fight.start(); assert.equal(fight.bossHp, hp); assert.equal(fight.attackDamage, 1);
    fight.drain();
    fight.damageBoss(hp - 1);
    assert.equal(fight.phase, enemy === 'normal' ? 1 : 2);
    assert.equal(fight.drain().filter(e => e.type === 'phase').length, enemy === 'normal' ? 0 : 1);
    fight.damageBoss(1);
    assert.equal(fight.state, 'won');
    assert.equal(fight.phase, enemy === 'normal' ? 1 : 2);
    assert.ok(!fight.drain().some(e => e.type === 'phase'));
  }
  const run = new Expedition(() => 0);
  assert.equal(run.profile.attackDamage, 1);
  for (const node of run.nodes.filter(n => battleTypes.includes(n.type))) {
    assert.equal(node.hp, { normal: 7, elite: 15, boss: 30 }[node.type]);
  }
  run.enter('1-0'); run.battle.start();
  assert.equal(run.battle.attackDamage, 1); assert.equal(run.battle.bossHp, 7);
  run.battle.attack(1); assert.equal(run.battle.bossHp, 6);
});

function blockTurn(fight) {
  const hp = fight.bossHp;
  for (const hit of fight.sequence) {
    if (hit.guard === 'both') {
      fight.tap(hit.at, 'left'); fight.tap(hit.at, 'right');
      fight.release(hit.at, 'left'); fight.release(hit.at, 'right');
    } else { fight.tap(hit.at, hit.guard); fight.release(hit.at, hit.guard); }
  }
  fight.update(fight.endAt);
  assert.equal(fight.bossHp, hp, 'parrying must never damage enemies');
}

function win(fight) {
  while (!['won', 'lost'].includes(fight.state)) {
    assert.ok(fight.attack(fight.time + 1));
    if (fight.state === 'boss') blockTurn(fight);
  }
  assert.equal(fight.state, 'won');
}

test('experience is awarded once per victory at 10/15/30 and defeats grant no experience', () => {
  assert.deepEqual(XP_REWARDS, { normal: 10, elite: 15, boss: 30 });
  for (const type of battleTypes) for (const outcome of ['won', 'lost']) {
    const run = new Expedition(() => 0);
    const node = run.nodes.find(n => n.type === type);
    // Focus each outcome without needing to play the preceding map floors.
    run.current = node.id; run.state = 'battle';
    const fight = run.battle = new Combat({ enemy: type, profile: run.profile, random: () => 0 });
    fight.start();
    assert.equal(run.settleBattle(), false); assert.equal(run.xp, 0);
    if (outcome === 'won') win(fight);
    else { fight.hp = 1; fight.attack(1); fight.update(fight.endAt); }
    assert.equal(fight.state, outcome);
    assert.equal(run.settleBattle(), true);
    const reward = outcome === 'won' ? XP_REWARDS[type] : 0;
    assert.equal(run.xp, reward); assert.equal(run.lastXpGain, reward); assert.equal(run.stats.xpEarned, reward);
    assert.equal(run.settleBattle(), false);
    assert.equal(run.xp, reward); assert.equal(run.stats.xpEarned, reward);
  }
});

test('experience purchases spend the shown costs, persist in the next battle, respect limits, and reset for a new run', () => {
  const run = new Expedition(() => 0);
  assert.equal(run.train('power'), false); assert.equal(run.train('vitality'), false);
  run.enter('1-0'); run.battle.start(); win(run.battle); run.settleBattle();
  assert.equal(run.xp, 10); assert.equal(run.trainingCost('power'), 10);
  assert.equal(run.canTrain('vitality'), false);
  const node = run.current, path = [...run.visited];
  assert.equal(run.train('power'), true);
  assert.equal(run.xp, 0); assert.equal(run.profile.attackDamage, 2);
  assert.equal(run.stats.xpEarned, 10, 'spending never changes lifetime earned XP');
  assert.equal(run.trainingCost('power'), 20); assert.equal(run.train('power'), false);
  assert.equal(run.current, node); assert.deepEqual(run.visited, path);
  run.enter(run.available()[0]); run.battle.start();
  assert.equal(run.battle.attackDamage, 2); assert.equal(run.lastXpGain, 0);
  run.battle.attack(1); assert.equal(run.battle.bossHp, run.node.hp - 2);
  run.xp = 100;
  for (const state of ['battle', 'rest', 'reward', 'won', 'lost']) {
    run.state = state; assert.equal(run.train('power'), false); assert.equal(run.xp, 100);
  }
  run.state = 'map';
  for (const id of ['missing', '__proto__', 'constructor']) assert.equal(run.train(id), false);
  assert.equal(run.train('power'), true); assert.equal(run.xp, 80);
  assert.equal(run.trainingCost('power'), 30);
  assert.equal(run.train('power'), true); assert.equal(run.xp, 50);
  assert.equal(run.profile.attackDamage, 4); assert.equal(run.trainingCost('power'), null);
  assert.equal(run.train('power'), false); assert.equal(run.xp, 50);
  run.hp = 2; run.stats.hits = 3;
  assert.equal(run.train('vitality'), true);
  assert.equal(run.hp, 3); assert.equal(run.maxHp, 6); assert.equal(run.xp, 35);
  assert.equal(run.trainingCost('vitality'), 25);
  assert.equal(run.train('vitality'), true);
  assert.equal(run.hp, 4); assert.equal(run.maxHp, 7); assert.equal(run.xp, 10);
  assert.equal(run.stats.hits, 3); assert.equal(run.train('vitality'), false);
  run.state = 'rest'; assert.equal(run.rest('vitality'), false);
  const rested = new Expedition(() => 0); rested.state = 'rest'; rested.rest('vitality'); rested.xp = 100;
  assert.equal(rested.train('vitality'), true); assert.equal(rested.maxHp, 7);
  assert.equal(rested.train('vitality'), false, 'rest and XP share the maximum health cap');
  const next = new Expedition();
  assert.equal(next.xp, 0); assert.equal(next.stats.xpEarned, 0); assert.equal(next.profile.attackDamage, 1);
  assert.deepEqual(next.training, { power: 0, vitality: 0 });
});

test('1,000 maps have four distinct routes, sparse non-crossing forks and about 80% combat', () => {
  const variants = new Set(), forks = new Set();
  for (let seed = 0; seed < 1000; seed++) {
    const nodes = makeMap(seeded(seed * 104729));
    assert.equal(nodes.length, 37);
    assert.equal(nodes.filter(n => battleTypes.includes(n.type)).length, 29);
    assert.equal(nodes.filter(n => n.type === 'rest').length, 4);
    assert.equal(nodes.filter(n => n.type === 'treasure').length, 4);
    assert.equal(nodes.filter(n => n.floor === 1 && n.type === 'normal').length, 4);
    assert.equal(nodes.filter(n => n.next.length === 2).length, 2);
    variants.add(nodes.map(n => n.type).join(','));
    forks.add(nodes.filter(n => n.next.length === 2).map(n => n.id).join(','));
    const budgets = [
      { battles: 9, elites: 3, rests: 0, chests: 1, xp: 125 },
      { battles: 8, elites: 2, rests: 1, chests: 1, xp: 110 },
      { battles: 8, elites: 0, rests: 2, chests: 0, xp: 100 },
      { battles: 7, elites: 1, rests: 1, chests: 2, xp: 95 },
    ];
    for (let column = 0; column < 4; column++) {
      const route = nodes.filter(n => n.column === column || n.type === 'boss');
      const count = type => route.filter(n => n.type === type).length;
      assert.deepEqual({ battles: route.filter(n => battleTypes.includes(n.type)).length,
        elites: count('elite'), rests: count('rest'), chests: count('treasure'),
        xp: route.reduce((sum, n) => sum + (XP_REWARDS[n.type] || 0), 0) }, budgets[column]);
    }
    for (const node of nodes) {
      const parents = nodes.filter(n => n.next.includes(node.id));
      assert.equal(parents.length === 0, node.floor === 1, 'no unreachable nodes');
      assert.equal(new Set(node.next).size, node.next.length);
      if (node.floor === 10) { assert.equal(node.type, 'boss'); assert.equal(node.next.length, 0); continue; }
      assert.ok(node.next.length === 1 || node.next.length === 2);
      for (const id of node.next) {
        const next = nodes.find(n => n.id === id);
        assert.equal(next.floor, node.floor + 1);
        if (next.type === 'boss') continue;
        if (next.column !== node.column) {
          assert.equal(node.floor, 5, 'only the middle fork permits changing lanes');
          assert.equal(Math.floor(node.column / 2), Math.floor(next.column / 2), 'regions stay isolated');
        }
        for (const other of nodes.filter(n => n.floor === node.floor)) for (const otherId of other.next) {
          const otherNext = nodes.find(n => n.id === otherId);
          assert.ok((node.column - other.column) * (next.column - otherNext.column) >= 0, 'paths never cross between nodes');
        }
      }
    }
    const paths = [];
    const walk = (node, path = []) => {
      path = [...path, node];
      if (!node.next.length) paths.push(path);
      else for (const id of node.next) walk(nodes.find(n => n.id === id), path);
    };
    nodes.filter(n => n.floor === 1).forEach(n => walk(n));
    assert.equal(paths.length, 6, 'four straight routes and two meaningful alternatives');
    let battles = 0;
    for (const path of paths) {
      assert.equal(path.length, 10); assert.equal(path.at(-1).type, 'boss');
      const count = path.filter(n => battleTypes.includes(n.type)).length;
      assert.ok(count >= 7 && count <= 9, 'forks cannot farm extra support stops');
      battles += count;
    }
    assert.ok(battles / paths.length >= 7.8 && battles / paths.length <= 8.2);
  }
  assert.ok(variants.size > 100, 'encounter positions vary between expeditions');
  assert.equal(forks.size, 4, 'each pair varies its one-way fork direction');
});

test('choosing a start locks other regions, and taking a fork permanently leaves the original lane', () => {
  const finishStop = run => {
    if (run.state === 'battle') { run.battle.start(); win(run.battle); run.settleBattle(); }
    if (run.state === 'rest') assert.ok(run.rest('leave'));
    if (run.state === 'reward') assert.ok(run.claim(run.offers[0].id));
  };
  for (const roll of [0, .99]) for (let column = 0; column < 4; column++) {
    const run = new Expedition(() => roll);
    assert.deepEqual(run.available(), ['1-0', '1-1', '1-2', '1-3']);
    assert.equal(run.futureNodes().size, 37);
    for (let floor = 1; floor <= 5; floor++) {
      assert.ok(run.enter(`${floor}-${column}`)); finishStop(run);
      for (let other = 0; other < 4; other++) {
        if (other !== column) assert.equal(run.enter(`${floor}-${other}`), false);
        if (Math.floor(other / 2) !== Math.floor(column / 2)) {
          assert.equal(run.enter(`${floor + 1}-${other}`), false);
          assert.equal(run.futureNodes().has(`9-${other}`), false);
        }
      }
      if (floor < 5) assert.deepEqual(run.available(), [`${floor + 1}-${column}`]);
    }
    const fork = run.available().find(id => !id.endsWith(`-${column}`));
    const target = fork || run.available()[0];
    const nextColumn = run.nodes.find(n => n.id === target).column;
    assert.ok(run.enter(target)); finishStop(run);
    if (fork) assert.equal(run.futureNodes().has(`9-${column}`), false);
    assert.ok(run.futureNodes().has('10-1'));
    for (let floor = 7; floor <= 9; floor++) {
      assert.deepEqual(run.available(), [`${floor}-${nextColumn}`]);
      assert.equal(run.enter(`${floor}-${(nextColumn + 1) % 4}`), false);
      assert.ok(run.enter(`${floor}-${nextColumn}`)); finishStop(run);
    }
    assert.deepEqual(run.available(), ['10-1']);
    assert.ok(run.enter('10-1')); finishStop(run);
    assert.equal(run.state, 'won'); assert.equal(run.stats.hits, 0);
  }
});

test('200 complete expeditions remain no-hit clearable, preserve upgrades and cannot skip or repeat stops', () => {
  let eliteCount = 0;
  for (let seed = 1; seed <= 200; seed++) {
    const random = seeded(seed), run = new Expedition(random);
    assert.equal(run.enter('10-1'), false);
    while (run.state !== 'won') {
      const available = run.available();
      assert.ok(available.length);
      const id = available[Math.floor(random() * available.length)];
      assert.ok(run.enter(id));
      assert.equal(run.enter(id), false, 'cannot enter twice or bypass an unresolved encounter');
      if (run.state === 'battle') {
        const previousXP = run.xp;
        const profile = { ...run.profile };
        const fight = run.battle; fight.start();
        assert.equal(fight.hp, profile.hp); assert.equal(fight.maxHp, profile.maxHp); assert.equal(fight.potions, profile.potions);
        assert.equal(fight.bossMaxHp, run.node.hp);
        win(fight);
        if (run.node.type === 'elite') eliteCount++;
        assert.equal(fight.hits, 0); assert.ok(run.settleBattle());
        assert.equal(run.xp, previousXP + XP_REWARDS[run.node.type]);
        assert.equal(run.settleBattle(), false, 'no duplicate stats or rewards');
        assert.equal(run.hp, profile.hp); assert.equal(run.potions, profile.potions);
      }
      if (run.state === 'rest') {
        assert.ok(run.rest(run.weapon < 2 ? 'weapon' : run.maxHp < 7 ? 'vitality' : 'leave'));
        assert.equal(run.rest('weapon'), false);
      }
      if (run.state === 'reward') {
        const offer = run.offers[0];
        assert.equal(offer.rare, run.node.type === 'elite');
        assert.ok(run.claim(offer.id)); assert.equal(run.claim(offer.id), false);
      }
      assert.equal(run.enter(id), false, 'cannot revisit a cleared stop');
    }
    assert.equal(run.visited.length, 10); assert.equal(new Set(run.visited).size, 10);
    assert.equal(run.stats.hits, 0); assert.ok(run.stats.perfects > 0);
    assert.equal(run.stats.battles, run.visited.filter(id => battleTypes.includes(run.nodes.find(n => n.id === id).type)).length);
    assert.equal(run.xp, run.visited.reduce((sum, id) => sum + (XP_REWARDS[run.nodes.find(n => n.id === id).type] || 0), 0));
    assert.equal(run.stats.xpEarned, run.xp, 'rests and chests award no XP');
    assert.equal(run.available().length, 0); assert.equal(run.enter('1-0'), false);
  }
  assert.ok(eliteCount > 0);
});

test('rest choices cap healing, weapon and vitality; treasure never duplicates a passive or rerolls on inspection', () => {
  const run = new Expedition(seeded(8));
  run.current = run.nodes.find(n => n.type === 'rest').id;
  run.state = 'rest';
  assert.equal(run.rest('heal'), false); assert.equal(run.state, 'rest');
  run.hp = 4; assert.ok(run.rest('heal')); assert.equal(run.hp, 5);
  for (let i = 0; i < 2; i++) {
    run.state = 'rest'; assert.ok(run.rest('weapon'));
    assert.equal(run.profile.attackDamage, 1 + (i + 1));
  }
  run.state = 'rest'; assert.equal(run.rest('weapon'), false); assert.equal(run.profile.attackDamage, 3);
  for (let i = 0; i < 2; i++) { run.state = 'rest'; assert.ok(run.rest('vitality')); }
  assert.equal(run.maxHp, 7); assert.equal(run.hp, 7);
  run.state = 'rest'; assert.equal(run.rest('vitality'), false); assert.ok(run.rest('leave'));
  for (let i = 0; i < 6; i++) {
    run.offerRewards(i % 2 === 0);
    const snapshot = JSON.stringify(run.offers);
    assert.equal(run.claim('missing'), false); run.available(); void run.profile;
    assert.equal(JSON.stringify(run.offers), snapshot);
    assert.ok(run.offers.length >= 1 && run.offers.length <= 3);
    const offer = run.offers.find(o => o.id !== 'potion') || run.offers[0];
    assert.ok(!run.relics.some(r => r.id === offer.id));
    const stock = run.potions;
    assert.ok(run.claim(offer.id));
    if (offer.id === 'potion') assert.equal(run.potions, stock + (offer.rare ? 2 : 1));
  }
  assert.equal(run.relics.length, 3);
});

test('relic effects apply to real combat, including healing before a first strike and minimum special damage', () => {
  for (const rare of [false, true]) {
    const run = new Expedition(() => 0);
    run.relics = ['vanguard', 'apothecary', 'ward'].map(id => ({ id, rare }));
    run.hp = 1; run.maxHp = 7; run.weapon = 2;
    const durable = new Combat({ bossHp: 100, profile: run.profile, random: () => 0 });
    durable.start(); durable.attack(1); blockTurn(durable);
    const remaining = durable.bossHp; durable.attack(durable.time + 1);
    assert.equal(durable.bossHp, remaining - 3, 'first-strike bonus is not repeated within the fight');
    assert.ok(run.enter('1-0'));
    const fight = run.battle; fight.start();
    assert.equal(fight.heal(1), true); assert.equal(fight.hp, rare ? 5 : 4);
    assert.equal(fight.potions, 1); blockTurn(fight);
    assert.ok(fight.attack(fight.time + 1));
    assert.equal(fight.bossHp, 0, 'upgraded attacks clamp the new lower enemy HP at zero');
    assert.equal(fight.state, 'won'); run.settleBattle();
    assert.equal(run.hp, rare ? 5 : 4); assert.equal(run.potions, 1); assert.equal(run.stats.potionsUsed, 1);
    assert.ok(run.enter(run.available()[0]));
    run.battle.start(); assert.equal(run.battle.hp, run.hp); assert.equal(run.battle.potions, 1);
    run.battle.attack(1); assert.equal(run.battle.bossHp, Math.max(0, run.node.hp - 3 - (rare ? 18 : 12)), 'first strike renews once per fight');
    for (const type of ['judgment', 'execution']) {
      const index = ATTACK_COMPONENTS.findIndex(c => c.type === type);
      const rolls = [0, (index + .5) / ATTACK_COMPONENTS.length];
      const special = new Combat({ bossHp: 100, profile: run.profile, random: () => rolls.shift() ?? .5 });
      special.start(); special.attack(1); const hit = special.sequence[0];
      assert.equal(hit.type, type);
      special.update(hit.at + 116);
      assert.equal(special.hp, run.hp - Math.max(1, hit.damage - (rare ? 2 : 1)));
      assert.equal(special.hits, 1, 'damage reduction never erases a hit');
    }
  }
});

test('normal encounters exclude specials; death ends the run and a new expedition starts clean', () => {
  for (let seed = 0; seed < 100; seed++) {
    const fight = new Combat({ enemy: 'normal', random: seeded(seed) }); fight.start();
    for (let turn = 0; turn < 10; turn++) {
      fight.beginSequence(0);
      assert.ok(fight.sequence.every(hit => hit.damage === 1 && hit.group < 2));
    }
  }
  const run = new Expedition(() => 0); run.hp = 1; run.enter('1-0');
  run.battle.start(); run.battle.attack(1); run.battle.update(run.battle.endAt);
  assert.equal(run.battle.state, 'lost'); assert.ok(run.settleBattle());
  assert.equal(run.state, 'lost'); assert.equal(run.hp, 0); assert.equal(run.stats.hits, 1);
  assert.equal(run.settleBattle(), false); assert.equal(run.enter('2-0'), false); assert.equal(run.claim('potion'), false); assert.equal(run.rest('heal'), false);
  const next = new Expedition();
  assert.equal(next.hp, 5); assert.equal(next.potions, 2); assert.equal(next.relics.length, 0); assert.equal(next.weapon, 0); assert.equal(next.stats.hits, 0);
});
