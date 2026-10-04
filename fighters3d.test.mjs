import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3, Box3 } from './vendor/three/three.module.min.js';
import { Combat, ATTACK_COMPONENTS } from './combat.mjs';
import { bossRigPoseAt, playerRigPoseAt, dodgeMotionAt } from './motion.mjs';
import { createCharacter, poseCharacter } from './fighters3d.mjs';

const values = object => Object.values(object).flatMap(value => typeof value === 'object' ? values(value) : [value]);
const samePose = (a, b) => values(a).forEach((value, i) => assert.ok(Math.abs(value - values(b)[i]) < 1e-8));
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
