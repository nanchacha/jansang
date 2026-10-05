import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Box3 } from './vendor/three/three.module.min.js';
import { Combat, ATTACK_COMPONENTS, HOUND_ATTACK_COMPONENTS, BELL_ATTACK_COMPONENTS } from './combat.mjs';
import { bossRigPoseAt, houndRigPoseAt, bellRigPoseAt, playerRigPoseAt, dodgeMotionAt, HOUND_RECOVERY_MS, BELL_RECOVERY_MS } from './motion.mjs';
import { createCharacter, createHound, createBellExecutioner, poseCharacter } from './fighters3d.mjs';

const values = object => Object.values(object).flatMap(value => typeof value === 'object' ? values(value) : [value]);
const samePose = (a, b) => values(a).forEach((value, i) => assert.ok(Math.abs(value - values(b)[i]) < 1e-8));
test('hound claws articulate on the combat clock, retain readable windups, and recover without foot sliding', () => {
  const hound = createHound(); hound.root.rotation.y = -.58;
  const world = object => object.getWorldPosition(new Vector3());
  const idle = houndRigPoseAt(null, 0, true);
  assert.ok(idle.crouch >= .25 && idle.lean > .3, 'Hound rests low and leans toward the player');
  assert.ok(houndRigPoseAt(null, 190, false, 0).lean < idle.lean - .25, 'Taking damage recoils through the spine');
  for (const component of HOUND_ATTACK_COMPONENTS) for (const random of [0, .99]) {
    const game = new Combat({ species: 'hound', mode: 'practice', practiceAttack: component.type, random: () => random });
    game.start(); game.attack(0);
    for (const hit of game.sequence) {
      const original = JSON.stringify(hit), release = hit.launchAt ?? hit.at;
      for (const at of [hit.windupAt, hit.commitAt, release - 260, release - 160, release, release + HOUND_RECOVERY_MS]) {
        const before = values(houndRigPoseAt(hit, at - .001)), after = values(houndRigPoseAt(hit, at + .001));
        before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < .005, `${component.type}: continuous hound pose, including travel in pixels`));
      }
      const preparation = houndRigPoseAt(hit, release - 170), strike = houndRigPoseAt(hit, release);
      poseCharacter(hound, preparation, release - 170);
      for (const hand of ['left', 'right']) {
        if (hit.guard !== hand && hit.guard !== 'both') continue;
        assert.ok((world(hound.arms[hand].wrist).x - world(hound.core).x) * (hand === 'left' ? -1 : 1) > 0,
          `${component.type}/${hand}: preparing claw stays on its screen side`);
      }
      const tip = world(hound.arms[hit.hand].weapon.tip);
      poseCharacter(hound, strike, release);
      assert.ok(world(hound.arms[hit.hand].weapon.tip).distanceTo(tip) > .3, 'Claw sweeps through space instead of rotating a flat image');
      for (const arm of Object.values(hound.arms)) {
        assert.ok(Math.abs(world(arm.upper).distanceTo(world(arm.elbow)) - .57) < .001);
        assert.ok(Math.abs(world(arm.elbow).distanceTo(world(arm.wrist)) - .6) < .001);
        assert.equal(arm.fingers.length, 3);
      }
      for (const [hand, leg] of Object.entries(hound.legs)) assert.ok(Math.abs(world(leg.ankle).y - .07 - strike.lift - strike.feet[hand].lift) < .025, 'Supporting paws stay planted; airborne paws follow their targets');
      const bounds = new Box3().setFromObject(hound.root);
      assert.ok(bounds.min.y > -.4 && bounds.max.y < 4, `${component.type}: silhouette stays inside framing`);
      assert.ok(values(strike).every(Number.isFinite));
      hit.resolved = true; hit.result = 'perfect';
      assert.deepEqual(houndRigPoseAt(hit, release), strike, 'Early parry does not cancel the scheduled motion');
      hit.resolved = false; hit.result = null;
      assert.equal(JSON.stringify(hit), original, 'Animation never changes combat timing');
      samePose(houndRigPoseAt(hit, release, true, release - 100), idle);
      samePose(houndRigPoseAt(hit, release + HOUND_RECOVERY_MS), houndRigPoseAt(null, release + HOUND_RECOVERY_MS));
    }
  }
  const fixture = { windupAt: 1000, commitAt: 1800, at: 2700, hand: 'left', guard: 'left', tempo: 'feint' };
  const choreography = new Set(HOUND_ATTACK_COMPONENTS.map(component => JSON.stringify([1300, 2300, 2570, 2700].map(at => houndRigPoseAt({ ...fixture, type: component.type }, at)))));
  assert.equal(choreography.size, 8, 'Every hound attack has distinct choreography, not renamed sword swings');
  const leap = houndRigPoseAt({ ...fixture, type: 'hound-pounce' }, 2570);
  assert.ok(leap.lift > 1 && leap.feet.left.lift > .3, 'Leap lifts the whole body and folds the hind legs');
  poseCharacter(hound, leap, 2570);
  assert.ok(world(hound.legs.left.ankle).y > 1.5, 'Airborne paw visibly clears the floor');
  assert.ok(houndRigPoseAt({ ...fixture, type: 'hound-rebound' }, 2300).travel.x > 80, 'Rebound withdraws before lunging');
  assert.ok(houndRigPoseAt({ ...fixture, type: 'hound-rush' }, 2700).travel.x < -150, 'Rush closes distance at contact');
  poseCharacter(hound, houndRigPoseAt(null, 800), 800);
  const paused = world(hound.tail.at(-1));
  poseCharacter(hound, houndRigPoseAt(null, 800), 800);
  assert.ok(world(hound.tail.at(-1)).distanceTo(paused) < 1e-8, 'Idle motion freezes with the combat clock');
});

test('bell fists, planted feet and independently swaying mantle follow ten distinct continuous poses', () => {
  const bell = createBellExecutioner(); bell.root.rotation.y = -.58;
  const world = object => object.getWorldPosition(new Vector3());
  const idle = bellRigPoseAt(null, 0, true);
  assert.ok(bellRigPoseAt(null, 200, false, 0).lean < idle.lean - .1);
  for (const component of BELL_ATTACK_COMPONENTS) for (const random of [0, .99]) {
    const game = new Combat({ species: 'bell', mode: 'practice', practiceAttack: component.type, random: () => random });
    game.start(); game.attack(0);
    for (const hit of game.sequence) {
      const original = JSON.stringify(hit), release = hit.launchAt ?? hit.at;
      for (const at of [hit.windupAt, hit.commitAt, release - 240, release, release + 120, release + BELL_RECOVERY_MS, hit.at]) {
        const before = values(bellRigPoseAt(hit, at - .001)), after = values(bellRigPoseAt(hit, at + .001));
        before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < .005, `${hit.type}: continuous pose`));
      }
      poseCharacter(bell, bellRigPoseAt(hit, release - 250), release - 250);
      for (const hand of ['left', 'right']) {
        if (hit.guard !== 'both' && hand !== hit.hand) continue;
        assert.ok((world(bell.arms[hand].wrist).x - world(bell.core).x) * (hand === 'left' ? -1 : 1) > 0, `${hit.type}/${hand}: visible preparation matches guard`);
      }
      const start = world(bell.arms[hit.hand].weapon.tip), strike = bellRigPoseAt(hit, release);
      poseCharacter(bell, strike, release);
      if (hit.type === 'bell-groundbreak') {
        assert.ok(strike.lean > 1 && strike.crouch > .7, 'The whole body drives the bell into the floor');
        const floorContact = world(bell.groundStrike).y;
        assert.ok(floorContact > -.05 && floorContact < .08, `Bell rim contacts the floor, got ${floorContact}`);
        poseCharacter(bell, bellRigPoseAt(hit, release + 100), release + 100);
        assert.ok(Math.abs(world(bell.groundStrike).y - floorContact) < .015, 'Bell remains planted during the impact hold');
        poseCharacter(bell, strike, release);
      }
      assert.ok(world(bell.arms[hit.hand].weapon.tip).distanceTo(start) > .3, `${hit.type}: fist travels in 3D`);
      for (const arm of Object.values(bell.arms)) {
        assert.ok(Math.abs(world(arm.upper).distanceTo(world(arm.elbow)) - .56) < .001);
        assert.ok(Math.abs(world(arm.elbow).distanceTo(world(arm.wrist)) - .57) < .001);
      }
      for (const [hand, leg] of Object.entries(bell.legs)) assert.ok(Math.abs(world(leg.ankle).y - .07 - strike.feet[hand].lift) < .025, 'Weight transfer plants the supporting feet');
      const bounds = new Box3().setFromObject(bell.root, true);
      assert.ok(bounds.min.y > -.45 && bounds.max.y < 4.3, `${hit.type}: fits arena framing`);
      assert.ok(values(strike).every(Number.isFinite));
      hit.resolved = true; hit.result = 'perfect'; assert.deepEqual(bellRigPoseAt(hit, release), strike);
      hit.resolved = false; hit.result = null; assert.equal(JSON.stringify(hit), original);
      samePose(bellRigPoseAt(hit, release, true, release - 100), idle);
      samePose(bellRigPoseAt(hit, release + BELL_RECOVERY_MS), bellRigPoseAt(null, release + BELL_RECOVERY_MS));
    }
  }
  const fixture = { windupAt: 1000, commitAt: 1800, at: 3000, hand: 'left', guard: 'left', tempo: 'hold' };
  assert.equal(new Set(BELL_ATTACK_COMPONENTS.map(c => JSON.stringify([1400, 2400, 2880, 3000, 3130].map(at => bellRigPoseAt({ ...fixture, type: c.type }, at))))).size, 10);
  const marching = bellRigPoseAt({ ...fixture, type: 'bell-march' }, 1880);
  assert.ok(marching.feet.left.lift > .25 && marching.feet.right.lift === 0, 'A deliberate single step instead of a floating body');
  const toll = bellRigPoseAt({ ...fixture, type: 'bell-toll', guard: 'both' }, 3130);
  poseCharacter(bell, toll, 3130);
  assert.ok(bell.mantle.rotation.x > .3 && bell.clapper.rotation.x > .2, 'Bell and clapper retain their own follow-through');
  const paused = world(bell.clapper);
  poseCharacter(bell, toll, 3130); assert.ok(world(bell.clapper).distanceTo(paused) < 1e-8);
});

test('3D joints stay connected, poses are continuous and deterministic, and combat timing is unchanged', () => {
  const boss = createCharacter(true), player = createCharacter(false);
  const idle = playerRigPoseAt(0, -Infinity, -Infinity, -Infinity);
  const dodging = playerRigPoseAt(150, -Infinity, -Infinity, -Infinity, false, 0, 0);
  assert.ok(dodging.crouch > idle.crouch + .2 && dodging.step < -.2, 'dodge bends knees and shifts weight back');
  for (const at of [0, 150, 300, 500]) {
    assert.ok(Math.abs(dodgeMotionAt(at - .001, 0) - dodgeMotionAt(at + .001, 0)) < .001);
    const pose = playerRigPoseAt(at, -Infinity, -Infinity, -Infinity, false, 0, 0);
    poseCharacter(player, pose, at);
    assert.ok(values(pose).every(Number.isFinite));
    assert.deepEqual(pose, playerRigPoseAt(at, -Infinity, -Infinity, -Infinity, false, 0, 0));
    assert.equal(dodgeMotionAt(at, 0, true), 0);
  }
  assert.equal(dodgeMotionAt(500, 0), 0);
  samePose(playerRigPoseAt(150, -Infinity, -Infinity, -Infinity, true, 0, 0), playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, true));
  const drinking = playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, false, 1);
  assert.ok(drinking.arms.left.elbow < idle.arms.left.elbow - 1, 'free hand raises the potion');
  assert.deepEqual(drinking.arms.right, idle.arms.right, 'drinking does not swing the sword');
  assert.equal(player.potion.parent, player.arms.left.wrist);
  assert.equal(player.potion.visible, false);
  samePose(playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, true, 1), playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, true));
  boss.root.rotation.y = -.58;
  let bones = 0, meshes = 0;
  boss.root.traverse(object => { if (object.isBone) bones++; if (object.isMesh) meshes++; });
  assert.ok(bones >= 19 && meshes >= 50, 'Use jointed 3D geometry');
  const world = object => object.getWorldPosition(new Vector3());
  for (const component of ATTACK_COMPONENTS) for (const random of [0, .99]) {
    const game = new Combat({ mode: 'practice', practiceAttack: component.type, random: () => random });
    game.start(); game.attack(0);
    for (const hit of game.sequence) {
      const original = JSON.stringify(hit), release = hit.launchAt ?? hit.at;
      for (const at of [hit.windupAt, hit.commitAt, release - 160, release, release + 240]) {
        const before = values(bossRigPoseAt(hit, at - .001)), after = values(bossRigPoseAt(hit, at + .001));
        before.forEach((value, i) => assert.ok(Math.abs(value - after[i]) < .001, `${component.type}: continuous pose`));
      }
      const preparation = bossRigPoseAt(hit, release - 170);
      const striking = bossRigPoseAt(hit, release);
      assert.ok(Math.abs(preparation.arms[hit.hand].elbow - striking.arms[hit.hand].elbow) > .05, 'Elbow articulates independently');
      if (hit.guard !== 'both') {
        const other = hit.hand === 'left' ? 'right' : 'left';
        samePose(preparation.arms[other], bossRigPoseAt(null, release - 170).arms[other]);
      }
      poseCharacter(boss, preparation, release - 170);
      for (const side of ['left', 'right']) {
        if (hit.guard !== side && hit.guard !== 'both') continue;
        assert.ok((world(boss.arms[side].wrist).x - world(boss.core).x) * (side === 'left' ? -1 : 1) > 0, 'Preparing hand keeps its screen-side guard');
      }
      const start = world(boss.arms[hit.hand].weapon.tip);
      poseCharacter(boss, striking, release);
      assert.ok(world(boss.arms[hit.hand].weapon.tip).distanceTo(start) > .3, 'Sword moves through 3D space');
      for (const arm of Object.values(boss.arms)) {
        assert.ok(Math.abs(world(arm.upper).distanceTo(world(arm.elbow)) - .49) < .01);
        assert.ok(Math.abs(world(arm.elbow).distanceTo(world(arm.wrist)) - .47) < .001);
      }
      for (const leg of Object.values(boss.legs)) assert.ok(Math.abs(world(leg.ankle).y - .07) < .025, 'Feet remain planted through weight transfer');
      assert.ok(values(striking).every(Number.isFinite));
      const bounds = new Box3().setFromObject(boss.root);
      assert.ok(bounds.min.y > -.4 && bounds.max.y < 5.2, 'Bounded poses fit arena framing');
      hit.resolved = true; hit.result = 'perfect';
      assert.deepEqual(bossRigPoseAt(hit, release), striking, 'Early parry cannot snap the animation');
      hit.resolved = false; hit.result = null;
      assert.equal(JSON.stringify(hit), original);
      samePose(bossRigPoseAt(hit, release, true), bossRigPoseAt(null, 0, true));
    }
  }
  const guard = playerRigPoseAt(175, -Infinity, 0, -Infinity);
  poseCharacter(player, guard, 175);
  assert.ok(player.arms.right.elbow.rotation.x < -1);
  assert.ok(world(player.arms.right.wrist).y > 1.5, 'Guard raises the sword in front of the body');
  assert.deepEqual(playerRigPoseAt(200, 0, 0, 0, true), playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, true));
  assert.deepEqual(bossRigPoseAt(null, 500), bossRigPoseAt(null, 500), 'Pause freezes the pose');
});
