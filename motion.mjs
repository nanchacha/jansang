// Local arena coordinates: x/y are offsets, depth is apparent size.
const paths = {
  steady: [[0, 0, 1], [0, 0, 1]],
  rise: [[18, -72, .88], [-30, 24, 1.08]],
  dip: [[-24, 38, 1.04], [-35, -28, 1.1]],
  retreat: [[70, -16, .62], [-64, 38, 1.28]],
  dive: [[55, -66, .7], [-50, 32, 1.22]],
};
export const MOTIONS = Object.keys(paths);
const rest = [0, 0, 1];
const smooth = t => t * t * (3 - 2 * t);

// Darkness follows the combat clock, not CSS time, so pause freezes the warning.
export function specialIntensityAt(hit, now) {
  if (!hit || !(hit.damage > 1) || now <= hit.windupAt || now >= hit.at + 420) return 0;
  const enter = smooth(Math.min(1, (now - hit.windupAt) / 360));
  const leave = now <= hit.at ? 1 : 1 - smooth((now - hit.at) / 420);
  return enter * leave;
}

// Preparation, strike and recovery weights shared by every 3D attack pose.
// Full extension coincides with impact (or projectile release), never a later frame.
export function attackPoseAt(hit, now, hand, reduced = false) {
  const rest = { swing: 0, prepare: 0 };
  if (!hit || reduced || (hit.guard !== 'both' && hit.hand !== hand) || now <= hit.windupAt) return rest;
  const release = hit.launchAt ?? hit.at;
  if (now >= release + 240) return rest;
  const strikeStart = release - Math.min(160, (release - hit.commitAt) * .3);
  let preparation;
  if (now < hit.commitAt) {
    const t = (now - hit.windupAt) / (hit.commitAt - hit.windupAt);
    preparation = hit.tempo === 'feint' ? .75 * Math.sin(t * Math.PI) : .85 * smooth(Math.min(1, (now - hit.windupAt) / Math.min(320, hit.commitAt - hit.windupAt)));
  } else {
    const start = hit.tempo === 'hold' ? .85 : 0;
    preparation = start + (1 - start) * smooth(Math.min(1, (now - hit.commitAt) / Math.max(1, (strikeStart - hit.commitAt) * .65)));
  }
  const swing = now < strikeStart ? 0 : smooth(Math.min(1, (now - strikeStart) / (release - strikeStart)));
  const recovery = now <= release ? 1 : 1 - smooth((now - release) / 240);
  return {
    swing: swing * recovery,
    prepare: preparation * (1 - swing) * recovery,
  };
}

// Skeletal poses use the same immutable combat clock as hit detection.
// Axes are local 3D joint rotations; the model handles facing the opponent.
export function bossRigPoseAt(hit, now, reduced = false) {
  const t = reduced ? 0 : now / 1000;
  const pose = { crouch: 0, lean: 0, twist: 0, step: 0, breath: Math.sin(t * 1.8) * .008, cloth: 0, arms: {} };
  for (const hand of ['left', 'right']) {
    const side = hand === 'left' ? -1 : 1;
    const { prepare: p, swing: s } = attackPoseAt(hit, now, hand, reduced);
    const arm = { raise: -.25, turn: 0, spread: side * .17, elbow: -.35, wrist: .06 };
    const type = hit?.type;
    const thrust = ['thrust', 'rush', 'retreat', 'recoil'].includes(type);
    const sweep = ['sweep', 'spin', 'low-sweep', 'flurry'].includes(type);
    if (hit?.launchAt != null) {
      arm.raise += -.85 * p - 1.65 * s; arm.elbow += -.85 * p + .08 * s;
      arm.spread += side * (.4 * p + .18 * s); arm.wrist += -.35 * p;
    } else if (thrust) {
      arm.raise += -.55 * p - 1.65 * s; arm.elbow += -1.25 * p + .12 * s;
      arm.turn = -side * .35 * p; arm.wrist += -.7 * p + .6 * s;
    } else if (sweep) {
      arm.raise += -1.05 * p - .75 * s; arm.elbow += -.65 * p - .25 * s;
      arm.turn = -side * (.9 * p - 1.05 * s); arm.spread += side * (.55 * p - .25 * s);
      arm.wrist += -.4 * p - .65 * s;
    } else if (type === 'drag') {
      arm.raise += .4 * p - 2.2 * s; arm.elbow += -.4 * p - .65 * s;
      arm.spread += side * .2 * p; arm.wrist += .3 * p - .3 * s;
    } else {
      arm.raise += -2.15 * p - .72 * s; arm.elbow += -.95 * p + .05 * s;
      arm.spread += side * (.23 * p - .05 * s); arm.wrist += .45 * p - .35 * s;
    }
    if (hit?.damage > 1) {
      arm.elbow -= .16 * p;
      pose.cloth = Math.max(pose.cloth, .2 * p + .7 * s);
    }
    arm.raise += Math.sin(t * 1.8 + side) * (reduced ? 0 : .018);
    pose.arms[hand] = arm;
    pose.crouch = Math.max(pose.crouch, .09 * p + (type === 'low-sweep' ? .26 : .16) * s);
    pose.lean += -.04 * p + .12 * s;
    pose.twist += side * ((sweep ? .42 : .14) * p - (sweep ? .5 : .18) * s);
    pose.step = Math.max(pose.step, (thrust ? .38 : .18) * s);
    pose.cloth = Math.max(pose.cloth, .1 * p + .48 * s);
  }
  return pose;
}

export const HOUND_RECOVERY_MS = 360;
// Authored beast choreography: body travel, airborne feet and supporting paws
// share one pose. Only the immutable contact time comes from the combat plan.
export function houndRigPoseAt(hit, now, reduced = false, hurtAt = -Infinity) {
  const t = reduced ? 0 : now / 1000;
  const hurtProgress = (now - hurtAt) / 380;
  const recoil = reduced || hurtProgress <= 0 || hurtProgress >= 1 ? 0 : Math.sin(hurtProgress * Math.PI);
  const pose = { crouch: .4 + .08 * recoil, lean: .96 - .4 * recoil, twist: Math.sin(t * 1.4) * .04,
    roll: 0, step: .1, lift: 0, breath: Math.sin(t * 2.7) * .018, cloth: .12,
    jaw: .13 + .28 * recoil, ears: .12 + .45 * recoil, tail: Math.sin(t * 2.1) * .2,
    travel: { x: 0, y: 0, depth: 1 }, feet: { left: { forward: .18, lift: 0, lateral: 0 }, right: { forward: -.18, lift: 0, lateral: 0 } }, arms: {} };
  for (const hand of ['left', 'right']) {
    const side = hand === 'left' ? -1 : 1;
    pose.arms[hand] = { raise: -.7, turn: 0, spread: side * .25, elbow: -.95, wrist: -.3, curl: .12 };
  }
  if (!hit || reduced || now <= hit.windupAt || now >= hit.at + HOUND_RECOVERY_MS) return pose;
  const unit = value => Math.max(0, Math.min(1, value));
  const recover = now <= hit.at ? 1 : 1 - smooth(unit((now - hit.at) / HOUND_RECOVERY_MS));
  const drive = smooth(unit((now - (hit.at - 260)) / 260));
  const cut = smooth(unit((now - (hit.at - 160)) / 160));
  const load = smooth(unit((now - hit.windupAt) / Math.min(340, hit.at - hit.windupAt - 260)));
  const p = load * (1 - drive) * recover, s = cut * recover, d = drive * recover;
  const air = Math.sin(drive * Math.PI) ** 2 * recover;
  const side = hit.hand === 'left' ? -1 : 1;
  const sidestep = Math.sin(load * Math.PI) ** 2 * (1 - drive) * recover;
  const follow = Math.sin(unit((now - hit.at) / HOUND_RECOVERY_MS) * Math.PI) ** 2;
  const feint = hit.tempo === 'feint' && now < hit.commitAt
    ? Math.sin(unit((now - hit.windupAt) / (hit.commitAt - hit.windupAt)) * Math.PI) ** 2 : 0;
  pose.jaw += .12 * p + .45 * s; pose.ears += .2 * p + .4 * d;
  pose.cloth += .25 * p + .8 * d; pose.tail += side * (.3 * p - .5 * s);
  // The other paw braces instead of performing a second, unannounced attack.
  for (const hand of ['left', 'right']) {
    const arm = pose.arms[hand], active = hit.guard === 'both' || hit.hand === hand;
    arm.raise += .12 * p; arm.elbow -= .2 * p;
    if (!active) { arm.raise += .22 * s; continue; }
    arm.curl += -.1 * p + .65 * s;
    const direction = hand === 'left' ? -1 : 1;
    switch (hit.type) {
      case 'hound-rush':
      case 'hound-rebound':
      case 'hound-pounce':
        arm.raise += .25 * p - 1.18 * s; arm.elbow += -.45 * p + .6 * s;
        arm.spread += direction * (.3 * p + .18 * air); arm.wrist -= .6 * s;
        break;
      case 'hound-maul':
        arm.raise += -1.7 * p - .7 * s; arm.elbow += -.25 * p + .65 * s;
        arm.spread += direction * .35 * p; arm.wrist -= .5 * s;
        break;
      case 'hound-scoop':
        arm.raise += .4 * p - .9 * s; arm.elbow += .3 * p - .15 * s;
        arm.turn = direction * (-.35 * p + .9 * s); arm.wrist += .2 * p - .65 * s;
        break;
      default:
        arm.raise += -.7 * p - .4 * s; arm.elbow += -.3 * p + .65 * s;
        arm.turn = direction * (-.6 * p + 1.25 * s);
        arm.spread += direction * (.9 * p - .05 * s); arm.wrist -= .7 * s;
        break;
    }
  }
  switch (hit.type) {
    case 'hound-rush':
      pose.crouch += .15 * p - .12 * s; pose.lean += .22 * p + .18 * s;
      pose.travel = { x: 24 * p - 165 * d, y: 28 * d, depth: 1 + .06 * s };
      pose.feet.left = { forward: .18 - .32 * p + .38 * s, lift: .2 * air };
      pose.feet.right = { forward: -.18 - .2 * s, lift: .32 * air };
      break;
    case 'hound-pounce':
    case 'hound-rebound': {
      const retreat = hit.type === 'hound-rebound';
      pose.crouch += .13 * p - .22 * air + .08 * s; pose.lean += .2 * p - .35 * air;
      pose.lift = (retreat ? .95 : 1.25) * air;
      pose.twist += side * (.22 * p - .32 * s); pose.roll = side * (.16 * p - .22 * air);
      pose.travel = { x: (retreat ? 155 + side * 45 : side * 100) * p - 140 * d - side * 32 * s,
        y: (retreat ? -22 : -12) * p + 24 * d, depth: 1 - (retreat ? .16 : .06) * p + .08 * s };
      pose.feet.left = { forward: .18 - .3 * air, lift: .36 * air };
      pose.feet.right = { forward: -.18 - .18 * air, lift: .28 * air };
      break;
    }
    case 'hound-maul':
      pose.crouch -= .34 * p; pose.crouch += .17 * s;
      pose.lean -= .85 * p; pose.lean += .18 * s; pose.lift = .5 * air;
      pose.travel = { x: 10 * p - 70 * d, y: 20 * s, depth: 1 + .09 * s };
      pose.feet.left.lift = pose.feet.right.lift = .18 * air;
      break;
    case 'hound-scoop':
      pose.crouch += .13 * p + .09 * s; pose.lean += .14 * p;
      pose.twist += side * (.38 * p - .85 * s); pose.roll = side * (.18 * p - .2 * s);
      pose.travel = { x: side * (105 * p - 65 * s) - 55 * d, y: -12 * p + 8 * s, depth: 1 - .06 * p + .04 * s };
      pose.feet[hit.hand].forward += .32 * s;
      break;
    case 'hound-flurry':
      pose.crouch += .07 * p - .14 * s; pose.lean -= .2 * s;
      pose.twist += side * (.5 * p - .92 * s); pose.roll = side * (.22 * p - .28 * s);
      pose.travel = { x: side * (150 * p - 85 * s - 28 * follow) - 75 * d, y: -16 * p + 16 * s, depth: 1 - .09 * p + .06 * s };
      pose.feet[hit.hand] = { forward: (hit.hand === 'left' ? .18 : -.18) + .25 * s, lift: .16 * air };
      break;
    case 'hound-feint':
      pose.lean -= .28 * feint + .12 * s;
      pose.twist += side * (.28 * p - .7 * s - .55 * feint); pose.roll = side * (.18 * p - .3 * feint - .2 * s);
      pose.travel = { x: side * (125 * p - 170 * feint - 32 * s) - 105 * d, y: -14 * p + 8 * s, depth: 1 - .08 * p + .06 * s };
      pose.feet[hit.hand].forward += .3 * s;
      break;
    default:
      pose.twist += side * (.48 * p - .9 * s); pose.roll = side * (.2 * p - .26 * s);
      pose.lean -= .15 * s; pose.crouch += .08 * p;
      pose.travel = { x: side * (155 * p - 78 * s - 35 * follow) - 72 * d, y: -18 * p + 12 * s, depth: 1 - .08 * p + .055 * s };
      pose.feet[hit.hand].forward += .22 * s;
      break;
  }
  // Push off sideways, bank into the cut, then catch the weight on the outside
  // hind paw. This stays on the strike clock, including early successful parries.
  const flank = ['hound-rake', 'hound-flurry', 'hound-feint', 'hound-scoop'].includes(hit.type);
  if (flank) {
    pose.lift += .28 * sidestep + .18 * air;
    pose.tail += side * (-.55 * p + .8 * s + .35 * follow);
    pose.cloth += .3 * sidestep + .3 * follow;
  }
  for (const hand of ['left', 'right']) {
    const foot = pose.feet[hand], outside = hand === hit.hand;
    foot.lateral = flank ? side * (outside ? .3 * p - .2 * s : -.14 * p + .3 * s) : 0;
    if (flank) foot.lift += (outside ? .24 : .12) * sidestep + (outside ? .12 : .2) * air;
  }
  return pose;
}

export const BELL_RECOVERY_MS = 400;
// A planted, weight-driven fighter: the shell and clapper lag behind the fists.
// Projectile gestures peak at launch; defense still resolves at arrival.
export function bellRigPoseAt(hit, now, reduced = false, hurtAt = -Infinity) {
  const t = reduced ? 0 : now / 1000;
  const recoil = reduced ? 0 : Math.sin(Math.max(0, Math.min(1, (now - hurtAt) / 400)) * Math.PI);
  const pose = { crouch: .14 + .06 * recoil, lean: .06 - .14 * recoil, twist: 0, roll: 0, step: 0, lift: 0,
    breath: Math.sin(t * 1.1) * .006, cloth: .05, bellTilt: Math.sin(t * .9) * .018 + .12 * recoil,
    bellTurn: 0, bellForward: 0, clapper: Math.sin(t * 1.2) * .055, travel: { x: 0, y: 0, depth: 1 },
    feet: { left: { forward: .12, lift: 0 }, right: { forward: -.12, lift: 0 } }, arms: {} };
  for (const hand of ['left', 'right']) pose.arms[hand] = { raise: -.12, turn: 0, spread: (hand === 'left' ? -1 : 1) * .2, elbow: -.18, wrist: 0 };
  const release = hit?.launchAt ?? hit?.at;
  if (!hit || reduced || now <= hit.windupAt || now >= release + BELL_RECOVERY_MS) return pose;
  const unit = value => Math.max(0, Math.min(1, value));
  const groundHold = hit.type === 'bell-groundbreak' ? 120 : 0;
  const recovery = 1 - smooth(unit((now - release - groundHold) / (BELL_RECOVERY_MS - groundHold)));
  const drive = smooth(unit((now - release + 240) / 240));
  const load = smooth(unit((now - hit.windupAt) / Math.min(800, release - hit.windupAt - 240)));
  const p = load * (1 - drive) * recovery, s = drive * recovery;
  const follow = Math.sin(unit((now - release) / BELL_RECOVERY_MS) * Math.PI) * recovery;
  const side = hit.hand === 'left' ? -1 : 1;
  const fake = hit.tempo === 'feint' && now < hit.commitAt
    ? Math.sin(unit((now - hit.windupAt) / (hit.commitAt - hit.windupAt)) * Math.PI) ** 2 : 0;
  pose.cloth += .12 * p + .4 * s; pose.bellTilt += -.1 * p + .18 * s + .2 * follow;
  pose.clapper += -.22 * p + .5 * s - .3 * follow;
  for (const hand of ['left', 'right']) {
    const arm = pose.arms[hand], direction = hand === 'left' ? -1 : 1;
    if (hit.guard !== 'both' && hand !== hit.hand) { arm.spread += direction * .12 * p; continue; }
    switch (hit.type) {
      case 'bell-pendulum':
        arm.raise -= .7 * p + .6 * s; arm.turn = direction * (-.45 * p + 1.05 * s + .2 * fake);
        arm.spread += direction * (.85 * p - .08 * s); arm.elbow -= .16 * p;
        break;
      case 'bell-auger':
        arm.raise += .35 * p - 1.55 * s; arm.turn = direction * (-.25 * p + .65 * s);
        arm.elbow += .08 * p - .45 * s; arm.wrist -= .2 * s;
        break;
      case 'bell-march':
        arm.raise -= .35 * p + 1.42 * s; arm.elbow -= 1.1 * p; arm.turn = -direction * .2 * p;
        break;
      case 'bell-groundbreak':
        // Both hands brace the bell rim as the shoulders roll it into the floor.
        arm.raise -= 1.25 * p + 1.95 * s; arm.elbow -= .55 * p;
        arm.spread += direction * (.28 * p + .05 * s); arm.wrist += .2 * p - .2 * s;
        break;
      case 'bell-lament':
        arm.raise -= 1.15 * p + .65 * s; arm.spread += direction * (.5 * p - .08 * s);
        arm.elbow -= .3 * p + 1.15 * s; arm.turn = -direction * .2 * s;
        break;
      case 'bell-resonance':
        arm.raise -= .75 * p + 1.1 * s; arm.spread += direction * (.65 * p - .03 * s);
        arm.elbow -= .5 * p + 1.3 * s; arm.wrist -= .3 * s;
        break;
      case 'bell-triplet':
        arm.raise -= 1.35 * p + .72 * s; arm.elbow -= .6 * p;
        arm.turn = direction * (-.12 * p + .3 * s);
        break;
      default:
        arm.raise -= (hit.type === 'bell-toll' ? 2.5 : 2.2) * p + .55 * s;
        arm.elbow -= .55 * p; arm.spread += direction * (.2 * p + .12 * s); arm.wrist += .15 * p;
        break;
    }
  }
  switch (hit.type) {
    case 'bell-pendulum':
      pose.twist = side * (.2 * p - .7 * s + .16 * fake); pose.roll = side * (-.08 * p + .1 * s);
      pose.bellTurn = side * (-.2 * p + .32 * follow); pose.travel.x = -42 * s;
      break;
    case 'bell-auger':
      pose.crouch += .3 * p - .06 * s; pose.lean += .24 * p - .16 * s;
      pose.twist = side * (.23 * p - .42 * s); pose.travel.x = -35 * s;
      pose.bellTilt -= .2 * s;
      break;
    case 'bell-march': {
      const step = smooth(unit((now - hit.windupAt) / (release - hit.windupAt - 240)));
      const footLift = Math.sin(step * Math.PI) ** 2 * recovery;
      pose.feet[hit.hand] = { forward: pose.feet[hit.hand].forward + .22 * step * recovery, lift: .28 * footLift };
      pose.roll = -side * .1 * footLift; pose.lean += .19 * s;
      pose.travel.x = -70 * step * recovery - 40 * s; pose.travel.y = 12 * s;
      break;
    }
    case 'bell-triplet':
      pose.twist = side * (.18 * p - .28 * s); pose.roll = side * (.1 * p - .12 * s);
      pose.crouch += .12 * s; pose.travel.x = -25 * s; pose.bellTurn = side * .22 * follow;
      break;
    case 'bell-groundbreak':
      pose.crouch += -.08 * p + .59 * s; pose.lean += -.2 * p + 1.04 * s;
      pose.bellTilt += -.12 * p + .27 * s; pose.bellForward = -.08 * p + .24 * s;
      // Keep the rim planted for 120ms; secondary motion starts on recovery.
      pose.bellTilt -= .2 * follow;
      pose.clapper += .3 * p - .55 * s;
      break;
    case 'bell-lament':
      pose.crouch += .12 * p; pose.lean -= .1 * p;
      pose.bellTilt += -.22 * p + .34 * s + .26 * follow;
      pose.clapper += .55 * p - .85 * s + .55 * follow;
      pose.travel.x = 22 * p; pose.bellTurn = .14 * follow;
      break;
    case 'bell-resonance':
      pose.lean -= .12 * p; pose.crouch += .06 * s; pose.travel.x = 35 * p;
      pose.bellTilt += .12 * follow; pose.clapper += .65 * follow;
      break;
    case 'bell-fault':
      pose.crouch -= .08 * p; pose.crouch += .34 * s; pose.lean += -.1 * p + .32 * s;
      pose.roll = side * .1 * s; pose.travel.x = -62 * s; pose.bellTilt += .22 * follow;
      break;
    case 'bell-toll':
      pose.crouch -= .1 * p; pose.crouch += .4 * s; pose.lean += -.16 * p + .4 * s;
      pose.travel.x = -50 * s; pose.bellTilt += .3 * follow; pose.clapper += .4 * follow;
      break;
    default:
      pose.crouch += .16 * s; pose.lean += -.08 * p + .17 * s;
      pose.twist = side * (.12 * p - .16 * s); pose.travel.x = -28 * s;
      break;
  }
  return pose;
}

export function dodgeMotionAt(now, dodgeAt, reduced = false) {
  const progress = (now - dodgeAt) / 500;
  if (reduced || progress <= 0 || progress >= 1) return 0;
  return progress < .3 ? smooth(progress / .3) : 1 - smooth((progress - .3) / .7);
}

export function playerRigPoseAt(now, attackAt, parryAt, hurtAt, reduced = false, healing = 0, dodgeAt = -Infinity) {
  const drink = reduced ? 0 : healing;
  const dodge = dodgeMotionAt(now, dodgeAt, reduced);
  const action = playerPoseAt(now, attackAt, parryAt, hurtAt, reduced);
  const progress = Math.max(0, Math.min(1, (now - attackAt) / 520));
  const attack = reduced ? 0 : Math.sin(progress * Math.PI);
  const windup = Math.max(0, action.sword / 2.2), cut = Math.max(0, -action.sword / .6);
  return {
    crouch: .045 + attack * .1 + action.guard * .12 + dodge * .24,
    lean: attack * .16 - action.recoil * .3 - drink * .08 - dodge * .3,
    twist: windup * -.36 + cut * .38 - dodge * .35,
    step: attack * .38 - action.recoil * .12 - dodge * .3,
    breath: reduced ? 0 : Math.sin(now / 480) * .008,
    cloth: attack * .7 + action.recoil * .3 + dodge * .65,
    arms: {
      right: { raise: -.35 - windup * 1.95 - cut * .65 - action.guard * .85,
        turn: -.15 + action.guard * .5, spread: .15 + windup * .25,
        elbow: -.35 - windup * .7 - action.guard * 1.15, wrist: -.1 - action.guard * .7 },
      left: { raise: -.45 - attack * .35 - action.guard * 1.05 - drink * .5,
        turn: -.25 + drink * .25, spread: -.25 - attack * .2 + drink * .18,
        elbow: -.85 - action.guard * .65 - drink * 1.2, wrist: drink * .4 },
    },
  };
}

export function playerPoseAt(now, attackAt, parryAt, hurtAt, reduced = false) {
  const pulse = (at, duration) => {
    const progress = (now - at) / duration;
    return progress > 0 && progress < 1 ? Math.sin(progress * Math.PI) : 0;
  };
  if (reduced) return { sword: 0, guard: 0, recoil: 0 };
  const progress = (now - attackAt) / 520;
  // Raise, cut through, then recover; do not leave the sword extended after a turn.
  const sword = progress <= 0 || progress >= 1 ? 0 : progress < .3
    ? 2.2 * smooth(progress / .3)
    : progress < .62 ? 2.2 - 2.8 * smooth((progress - .3) / .32)
      : -.6 * (1 - smooth((progress - .62) / .38));
  return { sword, guard: pulse(parryAt, 350), recoil: pulse(hurtAt, 380) };
}

export function motionAt(hit, now, reduced = false) {
  if (!hit || reduced || now <= hit.windupAt || now >= hit.at + 240) return { x: 0, y: 0, depth: 1 };
  if (hit.launchAt != null) {
    // Ranged attacks retreat before release and remain far away during flight.
    const amount = (hit.motionStrength ?? 1) * (now <= hit.at
      ? smooth(Math.min(1, (now - hit.windupAt) / (hit.launchAt - hit.windupAt)))
      : 1 - smooth((now - hit.at) / 240));
    const altitude = ['rise', 'dive'].includes(hit.motion) ? -65 : hit.motion === 'dip' ? -20 : -38;
    return { x: 65 * amount, y: altitude * amount, depth: 1 - .36 * amount };
  }
  const [prepare, impact] = paths[hit.motion] || paths.steady;
  const progress = (now - hit.windupAt) / (hit.at - hit.windupAt);
  let from, to, t;
  if (progress < .55) {
    from = rest; to = prepare; t = progress / .55;
  } else if (progress < 1) {
    from = prepare; to = impact; t = (progress - .55) / .45;
  } else {
    from = impact; to = rest; t = (now - hit.at) / 240;
  }
  const amount = hit.motionStrength ?? 1;
  const values = from.map((value, i) => value + (to[i] - value) * smooth(t));
  return { x: values[0] * amount, y: values[1] * amount, depth: 1 + (values[2] - 1) * amount };
}
