import test from 'node:test';
import assert from 'node:assert/strict';
import { CARDS, BASE_CARDS, STARTER_DECK, drawCards } from './cards.mjs';
import { Combat, COUNTER_MS, HOUND_ATTACK_COMPONENTS } from './combat.mjs';
import { Expedition } from './expedition.mjs';

const seeded = seed => () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
function fightWith(attack, support, options = {}) {
  const fight = new Combat({ enemy: 'normal', bossHp: 100, random: () => 0, deck: [attack, 'slash', support], ...options });
  fight.start();
  assert.ok(fight.selectCard('attack', attack)); assert.ok(fight.selectCard('support', support));
  return fight;
}
function defend(fight, kind = 'perfect') {
  for (const hit of fight.sequence) {
    if (kind === 'dodge') { fight.dodge(hit.at); fight.update(hit.at); }
    else {
      const at = hit.at + (kind === 'parry' ? 90 : 0);
      const side = hit.guard === 'both' ? 'left' : hit.guard;
      fight.tap(at, side);
      if (hit.guard === 'both') { fight.tap(at, 'right'); fight.release(at, 'right'); }
      fight.release(at, side);
    }
  }
  fight.update(fight.endAt);
  if (fight.state === 'counter') fight.update(fight.time + COUNTER_MS);
}

test('battle offers use owned copies as weights and the chosen pair stays locked across attacks, counters and healing', () => {
  let copies = 0, single = 0;
  const random = seeded(481);
  for (let i = 0; i < 2000; i++) {
    if (drawCards(['slash', 'heavy', 'charge', 'chase'], 1, random)[0] === 'heavy') single++;
    if (drawCards(['slash', 'heavy', 'heavy', 'heavy', 'heavy', 'charge', 'chase'], 1, random)[0] === 'heavy') copies++;
  }
  assert.ok(copies > single * 1.7, 'extra copies have a real draw advantage');
  assert.deepEqual(drawCards(['__proto__', 'missing'], 3), []);
  const fight = new Combat({ deck: [...STARTER_DECK, 'chase', 'insight'], random: seeded(98) });
  fight.start();
  const offered = structuredClone(fight.hand);
  for (const kind of ['attack', 'support']) {
    assert.equal(offered[kind].length, 3); assert.equal(new Set(offered[kind]).size, 3);
    assert.ok(offered[kind].every(id => fight.deck.includes(id) && CARDS[id].kind === kind));
  }
  assert.equal(fight.attack(1), false);
  assert.equal(fight.selectCard('__proto__', 'slash'), false);
  assert.equal(fight.selectCard('attack', offered.support[0]), false);
  assert.equal(fight.selectCard('attack', 'missing'), false);
  fight.selectCard('attack', offered.attack.find(id => id !== 'charge'));
  assert.equal(fight.attack(2), false);
  fight.selectCard('support', offered.support[0]);
  const selected = { ...fight.selection };
  fight.update(3); assert.deepEqual(fight.hand, offered);
  assert.ok(fight.attack(4));
  const sequence = structuredClone(fight.sequence);
  assert.equal(fight.selectCard('attack', offered.attack[0]), false);
  assert.equal(fight.attack(5), false); assert.deepEqual(fight.sequence, sequence);
  defend(fight);
  for (const defense of ['dodge', 'perfect']) {
    assert.deepEqual(fight.hand, offered);
    assert.deepEqual(fight.selection, selected);
    assert.equal(fight.cardsReady(), true);
    assert.equal(fight.selectCard('attack', offered.attack[0]), false);
    assert.equal(fight.selectCard('support', offered.support[0]), false);
    assert.ok(fight.attack(fight.time + 1));
    assert.deepEqual(fight.activeCards, selected);
    defend(fight, defense);
  }
  fight.hp = 2;
  assert.ok(fight.heal(fight.time + 1));
  assert.deepEqual(fight.activeCards, {});
  defend(fight, 'dodge');
  assert.deepEqual(fight.hand, offered); assert.deepEqual(fight.selection, selected);
  assert.ok(fight.attack(fight.time + 1)); assert.deepEqual(fight.activeCards, selected);
  fight.start();
  assert.deepEqual(fight.selection, { attack: null, support: null });
  assert.equal(fight.cardsReady(), false);
  assert.equal(fight.selectCard('attack', fight.hand.attack[0]), true);
});

test('starting with healing requires a pair, locks it once used and keeps it for the first attack', () => {
  const fight = new Combat({ deck: STARTER_DECK, random: () => 0, profile: { hp: 1 } });
  fight.start();
  assert.equal(fight.heal(1), false); assert.equal(fight.round, 0);
  fight.selectCard('attack', 'slash');
  assert.equal(fight.heal(2), false); assert.equal(fight.potions, 2);
  fight.selectCard('support', 'precision');
  const offered = structuredClone(fight.hand), selected = { ...fight.selection };
  assert.ok(fight.heal(3)); assert.equal(fight.hp, 3);
  defend(fight, 'dodge');
  assert.deepEqual(fight.hand, offered); assert.deepEqual(fight.selection, selected);
  assert.equal(fight.selectCard('attack', 'heavy'), false);
  assert.ok(fight.attack(fight.time + 1)); assert.deepEqual(fight.activeCards, selected);
});

test('heavy trades its extra damage for the full-turn counter, while precision adds one counter damage up to three', () => {
  const heavy = fightWith('heavy', 'precision');
  assert.equal(heavy.nextAttackDamage(), 2); heavy.attack(1); defend(heavy);
  assert.equal(heavy.bossHp, 98); assert.equal(heavy.counters, 0); assert.equal(heavy.hp, 5);
  assert.equal(heavy.lastDefense, 'perfect');
  for (const attackDamage of [1, 3, 8]) {
    const precise = fightWith('slash', 'precision', { profile: { attackDamage } });
    precise.attack(1); defend(precise);
    assert.equal(precise.bossHp, 100 - attackDamage - Math.min(3, Math.ceil(attackDamage / 2) + 1));
    assert.equal(precise.counters, 1);
    precise.update(precise.time + 1000); assert.equal(precise.counters, 1);
  }
  const weak = fightWith('slash', 'precision');
  weak.attack(1); weak.weakenedAttacks = 2; defend(weak);
  assert.equal(weak.bossHp, 98); assert.equal(weak.weakenedAttacks, 1);
});

test('charge and healing preserve the next direct bonus and first-strike relic without stacking or consuming weakened attacks', () => {
  const fight = fightWith('charge', 'pursuit', { profile: { hp: 2, firstStrikeBonus: 2 } });
  fight.weakenedAttacks = 2;
  assert.equal(fight.nextAttackDamage(), 0); fight.attack(1);
  assert.equal(fight.bossHp, 100); assert.equal(fight.attacks, 0); assert.equal(fight.weakenedAttacks, 2);
  defend(fight, 'dodge'); assert.equal(fight.nextBonus, 1);
  fight.heal(fight.time + 1); assert.deepEqual(fight.activeCards, {});
  defend(fight, 'dodge'); assert.equal(fight.nextBonus, 1); assert.equal(fight.potions, 1);
  assert.equal(fight.selection.attack, 'charge');
  assert.equal(fight.nextAttackDamage(), 2, '(base 1 + bonus 1 + relic 2) halved');
  fight.attack(fight.time + 1); assert.equal(fight.nextBonus, 0); assert.equal(fight.attacks, 1);
  assert.equal(fight.weakenedAttacks, 1); assert.equal(fight.bossHp, 98);
  defend(fight, 'parry');
  assert.equal(fight.nextAttackDamage(), 0, 'the fixed charge card prepares again after spending its bonus');
  fight.attack(fight.time + 1);
  assert.equal(fight.nextBonus, 1); assert.equal(fight.attacks, 1); assert.equal(fight.weakenedAttacks, 1);
  fight.start(); assert.equal(fight.nextBonus, 0); assert.equal(fight.lastDefense, null);
});

test('support conditions resolve only after the enemy turn and one-turn bonuses cannot accumulate', () => {
  for (const [support, defense, expected] of [['pursuit', 'dodge', 1], ['pursuit', 'perfect', 0], ['rhythm', 'parry', 1], ['insight', 'perfect', 1], ['insight', 'parry', 0]]) {
    const fight = fightWith('slash', support, { random: () => .99 });
    fight.components = [HOUND_ATTACK_COMPONENTS.find(c => c.type === 'hound-flurry')];
    fight.attack(1); assert.ok(fight.sequence.length >= 3); assert.equal(fight.nextBonus, 0);
    defend(fight, defense); assert.equal(fight.nextBonus, expected, support + '/' + defense);
    assert.equal(fight.nextAttackDamage(), 1 + expected);
    const before = fight.bossHp;
    fight.attack(fight.time + 1); assert.equal(fight.bossHp, before - 1 - expected);
    assert.equal(fight.nextBonus, 0);
  }
  const missed = fightWith('slash', 'pursuit'); missed.attack(1); missed.update(missed.endAt);
  assert.equal(missed.nextBonus, 0); assert.equal(missed.lastDefense, null);
});

test('conditional attacks use the previous full defense and share a +1 direct-damage cap with all card bonuses', () => {
  for (const [attack, defense] of [['chase', 'dodge'], ['riposte', 'perfect']]) {
    const fight = fightWith(attack, 'resolve', { profile: { hp: 2 } });
    fight.attack(1); defend(fight, defense);
    fight.nextBonus = 1;
    assert.equal(fight.nextAttackDamage(), 2, 'conditional attack, low health and banked bonus do not stack');
    fight.attack(fight.time + 1); assert.equal(fight.nextBonus, 0);
    defend(fight, defense === 'perfect' ? 'dodge' : 'perfect');
    fight.hp = 5;
    assert.equal(fight.nextAttackDamage(), 1, 'previous defense requirement must match');
  }
});

test('every victory offers three stable cards, locks progress until one claim, then preserves elite rewards and boss completion', () => {
  for (const type of ['normal', 'elite', 'boss']) {
    const run = new Expedition(seeded(12));
    run.current = run.nodes.find(node => node.type === type).id; run.state = 'battle';
    run.battle = new Combat({ enemy: type, deck: run.deck }); run.battle.start(); run.battle.damageBoss(100);
    assert.ok(run.settleBattle()); assert.equal(run.state, 'card-reward');
    const offers = [...run.cardOffers], deck = [...run.deck];
    assert.equal(offers.length, 3); assert.equal(new Set(offers).size, 3);
    assert.deepEqual(run.available(), []); assert.equal(run.claimCard('missing'), false);
    assert.equal(run.claim('potion'), false); assert.equal(run.enter('2-0'), false);
    assert.equal(run.settleBattle(), false); assert.deepEqual(run.cardOffers, offers);
    assert.ok(run.claimCard(offers[0])); assert.deepEqual(run.deck, [...deck, offers[0]]);
    assert.equal(run.claimCard(offers[1]), false);
    assert.equal(run.state, { normal: 'map', elite: 'reward', boss: 'won' }[type]);
    if (type === 'elite') { assert.ok(run.offers.every(offer => offer.rare)); run.claim(run.offers[0].id); }
    if (type !== 'boss') { assert.ok(run.enter(run.available()[0])); assert.deepEqual(run.battle.deck, run.deck); }
  }
  const full = new Expedition(() => 0); full.deck = Object.keys(CARDS);
  full.enter('1-0'); full.battle.start(); full.battle.damageBoss(100); full.settleBattle();
  assert.equal(new Set(full.cardOffers).size, 3);
  const copy = full.cardOffers[0]; full.claimCard(copy);
  assert.equal(full.deck.filter(id => id === copy).length, 2);
  assert.deepEqual(new Expedition().deck, STARTER_DECK);
});

test('victory upgrades exactly one owned copy instead of adding a card, cannot claim twice, and preserves elite and boss progression', () => {
  for (const type of ['normal', 'elite', 'boss']) {
    const run = new Expedition(() => 0);
    run.deck.push('slash');
    run.current = run.nodes.find(node => node.type === type).id; run.state = 'battle';
    run.battle = new Combat({ enemy: type, deck: run.deck }); run.battle.start();
    assert.equal(run.claimCard('slash', true), false);
    run.battle.damageBoss(100); assert.ok(run.settleBattle());
    const offers = [...run.cardOffers], size = run.deck.length;
    assert.ok(offers.every(id => BASE_CARDS.includes(id)), 'new-card rewards contain only base grades');
    for (const id of ['missing', '__proto__', 'slash+', 'riposte']) assert.equal(run.claimCard(id, true), false);
    assert.deepEqual(run.cardOffers, offers); assert.equal(run.deck.length, size);
    assert.ok(run.claimCard('slash', true));
    assert.equal(run.deck.length, size);
    assert.equal(run.deck.filter(id => id === 'slash+').length, 1);
    assert.equal(run.deck.filter(id => id === 'slash').length, 1);
    assert.deepEqual(run.cardOffers, []);
    assert.equal(run.claimCard(offers[0]), false); assert.equal(run.claimCard('slash', true), false);
    assert.equal(run.state, { normal: 'map', elite: 'reward', boss: 'won' }[type]);
    if (type === 'elite') { assert.ok(run.offers.every(item => item.rare)); run.claim(run.offers[0].id); }
    if (type !== 'boss') {
      assert.ok(run.enter(run.available()[0]));
      const fight = run.battle; fight.start();
      assert.ok(fight.hand.attack.includes('slash+'));
      assert.equal(fight.hand.attack.includes('slash'), false, 'base and upgraded copies never appear in the same draw');
      fight.selectCard('attack', 'slash+'); fight.selectCard('support', fight.hand.support[0]);
      assert.equal(fight.nextAttackDamage(), 2);
      const hp = fight.bossHp; fight.attack(1); assert.equal(fight.bossHp, hp - 2);
    }
  }
  const full = new Expedition(() => 0); full.deck = BASE_CARDS.map(id => id + '+');
  full.enter('1-0'); full.battle.start(); full.battle.damageBoss(100); full.settleBattle();
  assert.deepEqual(full.upgradableCards(), []);
  assert.equal(full.claimCard('slash+', true), false);
  assert.equal(full.claimCard('slash', true), false);
  assert.ok(full.claimCard(full.cardOffers[0]), 'all-upgraded decks can still take a new base card');
  assert.equal(new Expedition().deck.some(id => id.endsWith('+')), false);
});

test('all ten upgrades affect combat, preserve conditions and tradeoffs, and never add card bonuses together', () => {
  for (const [attack, damage] of [['slash+', 2], ['heavy+', 3]]) {
    const fight = fightWith(attack, 'precision+'); fight.attack(1);
    assert.equal(fight.bossHp, 100 - damage); defend(fight);
    assert.equal(fight.counters, attack === 'heavy+' ? 0 : 1);
    assert.equal(fight.bossHp, 100 - damage - (attack === 'heavy+' ? 0 : 3));
  }
  for (const [attack, defense] of [['chase+', 'dodge'], ['riposte+', 'perfect']]) {
    const fight = fightWith(attack, 'pursuit+');
    assert.equal(fight.nextAttackDamage(), 1); fight.attack(1); defend(fight, defense);
    assert.equal(fight.nextAttackDamage(), 3, 'conditional and banked bonuses use the largest one');
    fight.weakenedAttacks = 2; assert.equal(fight.nextAttackDamage(), 1.5);
  }
  const charge = fightWith('charge+', 'insight', { profile: { hp: 1 } });
  charge.components = [HOUND_ATTACK_COMPONENTS.find(c => c.type === 'hound-flurry')];
  charge.attack(1); defend(charge); // A smaller support bonus cannot overwrite the prepared +2.
  assert.equal(charge.nextBonus, 2); charge.heal(charge.time + 1); defend(charge, 'dodge');
  assert.equal(charge.nextAttackDamage(), 3);
  const hp = charge.bossHp; charge.attack(charge.time + 1); assert.equal(charge.bossHp, hp - 3);
  defend(charge, 'dodge'); assert.equal(charge.nextAttackDamage(), 0);
  for (const [support, defense] of [['pursuit+', 'dodge'], ['rhythm+', 'parry'], ['insight+', 'perfect']]) {
    const fight = fightWith('slash', support);
    if (support === 'rhythm+') fight.components = [HOUND_ATTACK_COMPONENTS.find(c => c.type === 'hound-flurry')];
    fight.attack(1); assert.equal(fight.sequence.length, support === 'rhythm+' ? 2 : 1);
    defend(fight, defense); assert.equal(fight.nextBonus, support === 'pursuit+' ? 2 : 1);
    assert.equal(fight.nextAttackDamage(), 1 + fight.nextBonus);
  }
  const resolve = fightWith('slash', 'resolve+', { profile: { hp: 3 } });
  assert.equal(resolve.nextAttackDamage(), 2);
  resolve.hp = 4; assert.equal(resolve.nextAttackDamage(), 1);
  const draw = drawCards(['slash', 'slash+', 'heavy', 'heavy+', 'precision', 'precision+'], 6, () => 0);
  assert.equal(draw.length, 3); assert.equal(new Set(draw.map(id => CARDS[id].base)).size, 3);
});
