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

export function playerRigPoseAt(now, attackAt, parryAt, hurtAt, reduced = false, healing = 0) {
  const drink = reduced ? 0 : healing;
  const action = playerPoseAt(now, attackAt, parryAt, hurtAt, reduced);
  const progress = Math.max(0, Math.min(1, (now - attackAt) / 520));
  const attack = reduced ? 0 : Math.sin(progress * Math.PI);
  const windup = Math.max(0, action.sword / 2.2), cut = Math.max(0, -action.sword / .6);
  return {
    crouch: .045 + attack * .1 + action.guard * .12,
    lean: attack * .16 - action.recoil * .3 - drink * .08,
    twist: windup * -.36 + cut * .38,
    step: attack * .38 - action.recoil * .12,
    breath: reduced ? 0 : Math.sin(now / 480) * .008,
    cloth: attack * .7 + action.recoil * .3,
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
