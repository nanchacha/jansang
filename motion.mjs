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

// Angles describe the illustrated arm's shoulder hinge, mirrored by screen side.
// The blade reaches its striking pose at the actual hit (or projectile release).
export function weaponPoseAt(hit, now, hand, reduced = false) {
  const rest = { angle: 0, x: 0, y: 0, scaleY: 1, swing: 0 };
  if (!hit || reduced || (hit.guard !== 'both' && hit.hand !== hand) || now <= hit.windupAt) return rest;
  const release = hit.launchAt ?? hit.at;
  if (now >= release + 240) return rest;
  const side = hand === 'left' ? -1 : 1;
  const stab = ['thrust', 'rush', 'retreat', 'recoil'].includes(hit.type);
  const sweep = ['sweep', 'spin', 'low-sweep', 'flurry'].includes(hit.type);
  const ranged = hit.launchAt != null;
  const lift = hit.type === 'drag';
  const cock = ranged ? 1.1 : lift ? -.35 : stab ? .8 : sweep ? 1.35 : 2.05;
  const follow = ranged ? .45 : lift ? 1.75 : stab ? -.12 : sweep ? -.65 : -.3;
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
    angle: -side * (cock * preparation * (1 - swing) + follow * swing) * recovery,
    x: -side * 3 * swing * recovery,
    y: (stab ? 4 : ranged ? -3 : sweep ? 3 : 0) * swing * recovery,
    scaleY: 1 - (stab ? .27 : .13) * preparation * (1 - swing) * recovery + (stab ? .1 : 0) * swing * recovery,
    swing: swing * recovery,
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
