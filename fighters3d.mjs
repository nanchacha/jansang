import * as THREE from './vendor/three/three.module.min.js';
import { bossRigPoseAt, houndRigPoseAt, bellRigPoseAt, playerRigPoseAt } from './motion.mjs';
import { ITEM_USE_MS } from './combat.mjs';

const colors = { left: 0x88dcf2, right: 0xf2ad8e, perfect: 0xffedab };
const sphere = new THREE.SphereGeometry(1, 12, 8);
const box = new THREE.BoxGeometry(1, 1, 1);
const cylinder = new THREE.CylinderGeometry(1, 1, 1, 10);
const gem = new THREE.OctahedronGeometry(1);
const mat = (color, metalness = .3, roughness = .48) => new THREE.MeshStandardMaterial({ color, metalness, roughness });

function mesh(parent, geometry, material, position, scale) {
  const object = new THREE.Mesh(geometry, material);
  object.position.set(...position); object.scale.set(...scale);
  parent.add(object); return object;
}
function bone(parent, name, x = 0, y = 0, z = 0) {
  const joint = new THREE.Bone(); joint.name = name; joint.position.set(x, y, z); parent.add(joint); return joint;
}
function plate(parent, points, depth, material, trim, position) {
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => i ? shape.lineTo(x, y) : shape.moveTo(x, y)); shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: .018, bevelThickness: .012, bevelSegments: 1, steps: 1 });
  return mesh(parent, geometry, [material, trim], position, [1, 1, 1]);
}
function segment(parent, length, radius, material) {
  return mesh(parent, cylinder, material, [0, -length / 2, 0], [radius, length, radius * .85]);
}
function sword(parent, boss, material, gold, dark) {
  const grip = bone(parent, 'sword');
  mesh(grip, cylinder, dark, [0, -.04, 0], [.037, .28, .037]);
  for (let i = 0; i < 4; i++) mesh(grip, cylinder, gold, [0, .045 - i * .053, 0], [.041, .014, .041]);
  mesh(grip, gem, gold, [0, .12, 0], [.065, .095, .065]);
  const guard = plate(grip, [[-.23, .025], [-.15, -.065], [0, -.035], [.15, -.065], [.23, .025], [.13, .06], [0, .015], [-.13, .06]], .05, gold, gold, [0, -.18, -.025]);
  guard.scale.x = boss ? 1.15 : .8;
  const length = boss ? 1.34 : 1.08, half = boss ? .09 : .046;
  const blade = plate(grip, [[-half, 0], [-half, -length * .84], [0, -length], [half, -length * .84], [half, 0]], .034, material, material, [0, -.2, -.017]);
  mesh(grip, box, gold, [0, -.2 - length * .43, .025], [.01, length * .81, .008]);
  const tip = bone(grip, 'blade-tip', 0, -.2 - length, 0);
  return { grip, blade, tip };
}

// Real geometry with a joint hierarchy. Rigid armor follows bones; cloth vertices
// deform separately. These are original stylized models, not image cutouts.
export function createCharacter(boss = false) {
  const root = new THREE.Group(); root.name = boss ? 'hollow-warden' : 'protagonist';
  const armor = mat(boss ? 0x354d43 : 0x2e3835, .55, .38);
  const lightArmor = mat(boss ? 0x597265 : 0x8d9990, .6, .35);
  const gold = mat(0xb99b60, .65, .32), dark = mat(0x17201e, .1, .8);
  const clothMaterial = mat(boss ? 0x24352e : 0xcfc8ac, 0, .92); clothMaterial.side = THREE.DoubleSide;
  const skin = mat(0xba9780, 0, .82), hair = mat(0x242a29, .05, .9);
  const pelvis = bone(root, 'pelvis', 0, 1.34, 0);
  const spine = bone(pelvis, 'spine', 0, .14, 0);
  const neck = bone(spine, 'head', 0, .97, 0);
  mesh(pelvis, sphere, dark, [0, .04, 0], [.32, .23, .19]);
  mesh(spine, sphere, armor, [0, .41, -.005], [boss ? .47 : .34, .55, .25]);
  const chest = [[-.43, .68], [-.36, .9], [0, .98], [.36, .9], [.43, .68], [.29, .15], [0, .04], [-.29, .15]];
  const cuirass = plate(spine, chest, .08, armor, gold, [0, -.06, .18]);
  if (!boss) cuirass.scale.set(.78, .95, 1);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const rib = plate(spine, [[0, 0], [.23, .09], [.21, -.065], [0, -.14]], .045, lightArmor, gold, [side * .05, .28 - i * .12, .23]);
      rib.scale.x = side * (boss ? 1 : .82);
    }
    const hipPlate = plate(pelvis, [[0, .1], [.29, .08], [.37, -.37], [.16, -.5], [0, -.15]], .055, armor, gold, [side * .18, 0, .11]);
    hipPlate.scale.x = side;
  }
  mesh(pelvis, box, dark, [0, .04, .2], [.63, .1, .12]);
  mesh(pelvis, gem, gold, [0, .045, .28], [.11, .11, .04]);

  let core;
  if (boss) {
    mesh(neck, sphere, dark, [0, .05, 0], [.14, .22, .13]);
    plate(neck, [[-.23, .02], [-.25, .39], [-.1, .48], [0, .73], [.11, .48], [.25, .39], [.19, .02], [0, -.1]], .25, armor, gold, [0, -.02, -.13]);
    plate(neck, [[-.18, .3], [0, .23], [.18, .3], [.13, .12], [0, .04], [-.13, .12]], .03, dark, gold, [0, 0, .14]);
    const energy = new THREE.MeshStandardMaterial({color:0x86e3d4,emissive:0x4bd9c5,emissiveIntensity:1.5,roughness:.25});
    for (const side of [-1, 1]) {
      const eye = mesh(neck, box, energy, [side * .089, .235, .185], [.14, .018, .013]); eye.rotation.z = side * .2;
    }
    mesh(spine, gem, gold, [0, .57, .315], [.2, .27, .045]);
    core = mesh(spine, gem, energy, [0, .57, .354], [.14, .2, .06]);
  } else {
    mesh(neck, sphere, skin, [0, .12, .015], [.18, .25, .16]);
    mesh(neck, sphere, hair, [0, .24, -.025], [.2, .18, .18]);
    for (let i = 0; i < 7; i++) {
      const lock = mesh(neck, gem, hair, [(i - 3) * .052, .27 - Math.abs(i - 3) * .028, .105], [.065, .17, .07]); lock.rotation.z = (i - 2) * -.12;
    }
    mesh(neck, gem, skin, [0, .13, .175], [.033, .055, .055]);
    for (const side of [-1, 1]) mesh(neck, box, dark, [side * .07, .17, .156], [.042, .016, .014]);
    const collar = mesh(spine, sphere, clothMaterial, [0, .8, -.035], [.47, .21, .3]);
    collar.scale.y = .14;
    mesh(spine, gem, gold, [.11, .74, .29], [.06, .08, .035]);
    core = bone(spine, 'chest-anchor', 0, .57, .3);
  }

  const arms = {}, legs = {};
  for (const [hand, side] of [['left', -1], ['right', 1]]) {
    const upper = bone(spine, `${hand}-shoulder`, side * (boss ? .51 : .4), .78, 0);
    const elbow = bone(upper, `${hand}-elbow`, 0, -.49, 0);
    const wrist = bone(elbow, `${hand}-wrist`, 0, -.47, 0);
    const armMat = armor.clone(), bladeMat = mat(boss ? 0xc1bd98 : 0xd0d6d0, .7, .26);
    const shoulder = mesh(upper, sphere, lightArmor, [side * .055, -.01, 0], [boss ? .29 : .2, .22, .24]);
    if (boss) {
      for (let i = 0; i < 3; i++) {
        const pauldron = plate(upper, [[-.22, .13], [0, .3], [.24, .12], [.29, -.08], [0, -.2], [-.24, -.08]], .16, armMat, gold, [side * .05, .02 - i * .105, .07]);
        pauldron.scale.setScalar(1 - i * .08);
      }
    } else shoulder.material = clothMaterial;
    segment(upper, .49, boss ? .135 : .095, dark);
    segment(elbow, .47, boss ? .15 : .095, armMat);
    mesh(elbow, sphere, gold, [0, 0, 0], [.145, .115, .135]);
    plate(elbow, [[-.12, .02], [.12, .02], [.09, -.42], [0, -.49], [-.1, -.39]], .045, armMat, gold, [0, -.015, .1]);
    mesh(wrist, sphere, dark, [0, -.03, .01], [.085, .12, .1]);
    const weapon = boss || hand === 'right' ? sword(wrist, boss, bladeMat, gold, dark) : null;
    arms[hand] = { upper, elbow, wrist, weapon, armMat, bladeMat };
    const hip = bone(pelvis, `${hand}-hip`, side * (boss ? .24 : .18), -.07, 0);
    const knee = bone(hip, `${hand}-knee`, 0, -.62, 0);
    const ankle = bone(knee, `${hand}-ankle`, 0, -.58, 0);
    segment(hip, .62, boss ? .19 : .125, boss ? armor : dark);
    segment(knee, .58, boss ? .16 : .11, armor);
    mesh(knee, gem, lightArmor, [0, -.015, .1], [.2, .22, .14]);
    plate(knee, [[-.13, -.07], [.13, -.07], [.1, -.5], [0, -.57], [-.1, -.5]], .045, lightArmor, gold, [0, 0, .11]);
    mesh(ankle, sphere, dark, [0, -.06, .1], [.15, .1, .26]);
    mesh(ankle, gem, armor, [0, -.03, .19], [.16, .1, .28]);
    legs[hand] = { hip, knee, ankle };
  }

  const capeGeometry = new THREE.PlaneGeometry(boss ? 1.05 : 1.08, boss ? 1.35 : 1.15, 6, 8);
  const cape = new THREE.Mesh(capeGeometry, clothMaterial); spine.add(cape);
  const capeBase = capeGeometry.attributes.position.array.slice();
  // Split hanging panels preserve the original silhouette without binding the knees.
  for (const side of [-1, 1]) {
    const tabard = plate(pelvis, [[0, .08], [.17, .08], [.2, -.73], [.08, -.89], [-.02, -.65]], .012, clothMaterial, gold, [side * .035, -.09, .23]);
    tabard.scale.x = side; tabard.rotation.x = -.08;
  }
  let potion;
  if (!boss) {
    potion = new THREE.Group(); arms.left.wrist.add(potion);
    const glass = mat(0x67c993, .2, .25);
    mesh(potion, sphere, glass, [0, -.04, .085], [.09, .12, .09]);
    mesh(potion, cylinder, glass, [0, .075, .085], [.043, .12, .043]);
    mesh(potion, cylinder, gold, [0, .14, .085], [.048, .04, .048]);
    potion.visible = false;
  }
  const character = { root, pelvis, spine, neck, arms, legs, cape, capeBase, core, boss, potion, armor, lightArmor };
  poseCharacter(character, boss ? bossRigPoseAt(null, 0, true) : playerRigPoseAt(0, -Infinity, -Infinity, -Infinity, true), 0);
  return character;
}

export function createHound() {
  const root = new THREE.Group(); root.name = 'ash-hound';
  const fur = mat(0x302e2c, .05, .94), mane = mat(0x484541, .05, .9);
  const bronze = mat(0x8e7750, .65, .43), ivory = mat(0xd0c6ad, .15, .65), dark = mat(0x171b1c, .1, .85);
  const clothMaterial = mat(0x69736a, 0, .95); clothMaterial.side = THREE.DoubleSide;
  const pelvis = bone(root, 'pelvis', 0, 1.34), spine = bone(pelvis, 'spine', 0, .14);
  const neck = bone(spine, 'head', 0, .85, .1);
  mesh(pelvis, sphere, fur, [0, .06, 0], [.29, .25, .22]);
  mesh(spine, sphere, fur, [0, .36, 0], [.35, .47, .25]);
  mesh(spine, sphere, mane, [0, .65, -.09], [.46, .28, .28]);
  for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const tuft = mesh(spine, gem, mane, [side * (.28 + i * .025), .73 - i * .1, -.08], [.15, .23, .19]);
      tuft.rotation.z = side * (.65 + i * .12);
    }
    for (let i = 0; i < 3; i++) {
      const rib = mesh(spine, sphere, mane, [side * .15, .4 - i * .13, .2], [.15, .07, .075]); rib.rotation.z = side * .25;
    }
  }
  mesh(neck, sphere, fur, [0, .12, .04], [.21, .25, .23]);
  const mask = mesh(neck, gem, ivory, [0, .16, .18], [.2, .28, .22]); mask.rotation.x = -.12;
  mesh(neck, sphere, ivory, [0, .025, .34], [.135, .11, .29]);
  mesh(neck, gem, dark, [0, .025, .595], [.095, .07, .065]);
  const jaw = bone(neck, 'jaw', 0, -.06, .12);
  mesh(jaw, sphere, fur, [0, -.035, .2], [.13, .07, .29]);
  for (const side of [-1, 1]) {
    mesh(jaw, gem, ivory, [side * .09, .015, .32], [.028, .065, .028]);
    const socket = mesh(neck, gem, bronze, [side * .16, .15, .245], [.08, .085, .04]); socket.rotation.z = side * -.3;
    const eyeMat = mat(0xb2dacb, .15, .4); eyeMat.emissive.setHex(0x6d9d90); eyeMat.emissiveIntensity = .6;
    mesh(neck, sphere, eyeMat, [side * .174, .16, .265], [.034, .031, .026]);
    const edge = mesh(neck, box, bronze, [side * .105, .08, .376], [.018, .028, .36]); edge.rotation.z = side * .15;
  }
  const ears = [-1, 1].map(side => {
    const ear = bone(neck, 'ear', side * .155, .29, -.025);
    const outer = plate(ear, [[-.1, 0], [.01, .44], [.12, .035]], .065, fur, mane, [0, 0, 0]);
    outer.rotation.z = -side * .12;
    plate(ear, [[-.052, .06], [.005, .34], [.066, .085]], .01, bronze, dark, [0, 0, .072]);
    return ear;
  });
  const core = bone(spine, 'chest-anchor', 0, .48, .28), arms = {}, legs = {};
  for (const [hand, side] of [['left', -1], ['right', 1]]) {
    const upper = bone(spine, `${hand}-shoulder`, side * .44, .68);
    const elbow = bone(upper, `${hand}-elbow`, 0, -.57), wrist = bone(elbow, `${hand}-wrist`, 0, -.6);
    const armMat = bronze.clone(), bladeMat = mat(0xc4bda9, .72, .34);
    mesh(upper, sphere, fur, [side * .02, -.21, 0], [.19, .34, .18]);
    mesh(elbow, sphere, mane, [0, -.22, 0], [.15, .35, .14]);
    mesh(elbow, sphere, dark, [0, 0, 0], [.13, .13, .14]);
    for (let i = 0; i < 4; i++) {
      const cuff = mesh(elbow, cylinder, armMat, [0, -.14 - i * .105, .015], [.156 - i * .009, .045, .15 - i * .01]);
      cuff.rotation.z = side * .16;
    }
    plate(elbow, [[-.12, 0], [.12, 0], [.1, -.38], [0, -.5], [-.1, -.36]], .04, armMat, bronze, [0, -.06, .12]);
    mesh(wrist, sphere, fur, [0, -.08, .03], [.19, .18, .12]);
    const fingers = [];
    for (let i = 0; i < 3; i++) {
      const finger = bone(wrist, `claw-${i}`, (i - 1) * .12, -.16, .06);
      mesh(finger, sphere, dark, [0, -.045, 0], [.05, .11, .055]);
      const claw = plate(finger, [[-.035, 0], [-.055, -.16], [-.025, -.3], [.16, -.43], [.08, -.27], [.035, -.08], [.035, 0]], .035, bladeMat, bladeMat, [0, -.08, 0]);
      claw.rotation.y = -Math.PI / 2;
      fingers.push(finger);
    }
    const tip = bone(fingers[1], 'claw-tip', 0, -.51, .16);
    arms[hand] = { upper, elbow, wrist, fingers, weapon: { tip }, armMat, bladeMat };
    const hip = bone(pelvis, `${hand}-hip`, side * .23, -.07);
    const knee = bone(hip, `${hand}-knee`, 0, -.62), ankle = bone(knee, `${hand}-hock`, 0, -.58);
    mesh(hip, sphere, fur, [0, -.23, 0], [.21, .36, .21]);
    segment(knee, .58, .095, fur);
    mesh(knee, sphere, mane, [0, 0, .035], [.15, .17, .17]);
    for (const y of [-.19, -.27, -.39]) mesh(knee, cylinder, bronze, [0, y, 0], [.113, .04, .11]);
    mesh(ankle, sphere, fur, [0, -.055, .13], [.17, .085, .24]);
    for (let i = 0; i < 3; i++) {
      mesh(ankle, sphere, mane, [(i - 1) * .105, -.06, .26], [.057, .068, .12]);
      mesh(ankle, gem, ivory, [(i - 1) * .105, -.06, .36], [.036, .03, .1]);
    }
    legs[hand] = { hip, knee, ankle };
  }
  const tail = []; let parent = pelvis;
  for (let i = 0; i < 4; i++) {
    const joint = bone(parent, 'tail', 0, i ? 0 : .06, i ? -.25 : -.2);
    const plume = mesh(joint, sphere, i % 2 ? mane : fur, [0, 0, -.13], [.11 - i * .018, .12 - i * .02, .2]);
    plume.rotation.x = -.15; tail.push(joint); parent = joint;
  }
  mesh(spine, sphere, clothMaterial, [0, .69, .02], [.39, .09, .29]);
  mesh(spine, gem, bronze, [.08, .64, .3], [.075, .09, .035]);
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(.64, 1.35, 4, 6), clothMaterial); spine.add(cape);
  const capeBase = cape.geometry.attributes.position.array.slice();
  const character = { root, pelvis, spine, neck, arms, legs, cape, capeBase, core, boss: true, hound: true, jaw, ears, tail };
  poseCharacter(character, houndRigPoseAt(null, 0, true), 0);
  return character;
}

export function createBellExecutioner() {
  const root = new THREE.Group(); root.name = 'bell-executioner';
  const bronze = mat(0x746441, .72, .5), gold = mat(0xb89b60, .7, .4), patina = mat(0x415d53, .5, .68);
  const iron = mat(0x272c2b, .75, .48), dark = mat(0x111917, .2, .8);
  const clothMaterial = mat(0x30362f, 0, .96); clothMaterial.side = THREE.DoubleSide;
  const pelvis = bone(root, 'pelvis', 0, 1.34), spine = bone(pelvis, 'spine', 0, .14);
  const neck = bone(spine, 'head', 0, .88, .29);
  mesh(pelvis, sphere, iron, [0, .05, 0], [.4, .24, .28]);
  mesh(spine, sphere, dark, [0, .4, 0], [.49, .47, .29]);
  const mantle = bone(spine, 'bell-mantle', 0, .44, -.1);
  const groundStrike = bone(mantle, 'bell-rim-contact', -Math.sin(.68) * 1.03, -.05, Math.cos(.68) * 1.03);
  const profile = [[1.02, -.1], [1.04, 0], [.91, .13], [.72, .38], [.57, .84], [.45, 1.02], [.3, 1.09]];
  // An open front reveals the iron mask and the clapper beneath the bell.
  const shellGeometry = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 24, .68, Math.PI * 2 - 1.36);
  bronze.side = THREE.DoubleSide;
  const bellMetal = bronze.clone();
  mesh(mantle, shellGeometry, bellMetal, [0, 0, 0], [1, 1, 1]);
  for (const [radius, y, tube] of [[1.03, -.05, .045], [.95, .1, .025], [.57, .83, .025], [.39, 1.05, .035]]) {
    const rim = mesh(mantle, new THREE.TorusGeometry(radius, tube, 5, 24, Math.PI * 2 - 1.36), gold, [0, y, 0], [1, 1, 1]);
    rim.rotation.set(-Math.PI / 2, 0, .68 - Math.PI / 2);
  }
  for (let i = 0; i < 10; i++) {
    const angle = .8 + i * (Math.PI * 2 - 1.6) / 9;
    const rib = mesh(mantle, box, i % 3 ? gold : patina, [Math.sin(angle) * .69, .47, Math.cos(angle) * .69], [.027, .68, .04]);
    rib.rotation.set(Math.cos(angle) * -.35, 0, Math.sin(angle) * .35);
    mesh(mantle, sphere, gold, [Math.sin(angle) * .95, .12, Math.cos(angle) * .95], [.045, .045, .045]);
  }
  mesh(mantle, cylinder, iron, [0, 1.12, 0], [.19, .18, .19]);
  mesh(mantle, new THREE.TorusGeometry(.18, .05, 6, 12), gold, [0, 1.34, 0], [1, 1, 1]);
  mesh(neck, sphere, iron, [0, .05, .03], [.2, .26, .21]);
  plate(neck, [[-.19, .2], [0, .29], [.19, .2], [.15, -.15], [0, -.22], [-.15, -.15]], .07, iron, gold, [0, 0, .19]);
  mesh(neck, box, dark, [0, .07, .272], [.26, .038, .018]);
  const clapper = bone(mantle, 'clapper', 0, .52, .2);
  segment(clapper, .76, .04, iron);
  mesh(clapper, sphere, gold, [0, -.72, 0], [.14, .17, .14]);
  const core = bone(spine, 'chest-anchor', 0, .46, .35), arms = {}, legs = {};
  for (const [hand, side] of [['left', -1], ['right', 1]]) {
    const upper = bone(spine, `${hand}-shoulder`, side * .76, .68, .04);
    const elbow = bone(upper, `${hand}-elbow`, 0, -.56), wrist = bone(elbow, `${hand}-wrist`, 0, -.57);
    const armMat = bronze.clone(), bladeMat = iron.clone();
    mesh(upper, sphere, armMat, [side * .025, -.04, 0], [.3, .26, .28]);
    segment(upper, .56, .17, iron);
    mesh(elbow, sphere, gold, [0, 0, 0], [.2, .17, .19]);
    const gauntlet = new THREE.CylinderGeometry(.19, .32, .5, 10);
    mesh(elbow, gauntlet, armMat, [0, -.28, 0], [1, 1, 1]);
    mesh(elbow, cylinder, gold, [0, -.51, 0], [.34, .075, .34]);
    mesh(wrist, box, bladeMat, [0, -.17, .045], [.48, .34, .42]);
    for (let i = 0; i < 3; i++) mesh(wrist, box, armMat, [(i - 1) * .15, -.19, .27], [.105, .22, .055]);
    const tip = bone(wrist, 'fist-contact', 0, -.32, .13);
    arms[hand] = { upper, elbow, wrist, weapon: { tip }, armMat, bladeMat };
    const hip = bone(pelvis, `${hand}-hip`, side * .32, -.07);
    const knee = bone(hip, `${hand}-knee`, 0, -.62), ankle = bone(knee, `${hand}-ankle`, 0, -.58);
    segment(hip, .62, .22, iron); segment(knee, .58, .19, patina);
    mesh(knee, box, bronze, [0, -.02, .11], [.38, .29, .22]);
    plate(knee, [[-.18, -.08], [.18, -.08], [.2, -.5], [-.2, -.5]], .06, bronze, gold, [0, 0, .14]);
    mesh(ankle, box, iron, [0, -.04, .13], [.44, .17, .58]);
    mesh(ankle, box, bronze, [0, .02, .22], [.4, .1, .38]);
    legs[hand] = { hip, knee, ankle };
    const skirt = plate(pelvis, [[-.17, .1], [.17, .1], [.21, -.5], [.06, -.64], [-.17, -.5]], .015, clothMaterial, iron, [side * .22, 0, .27]);
    skirt.rotation.x = -.14;
  }
  const cape = new THREE.Mesh(new THREE.PlaneGeometry(.86, 1.35, 4, 6), clothMaterial); spine.add(cape);
  const capeBase = cape.geometry.attributes.position.array.slice();
  const character = { root, pelvis, spine, neck, arms, legs, cape, capeBase, core, boss: true, bell: true, mantle, clapper, bellMetal, groundStrike };
  poseCharacter(character, bellRigPoseAt(null, 0, true), 0);
  return character;
}

export function poseCharacter(character, pose, now) {
  const { pelvis, spine, neck, arms, legs, cape, capeBase, boss } = character;
  const baseHeight = 1.34 - pose.crouch;
  pelvis.position.y = baseHeight + (pose.lift || 0);
  spine.rotation.set(pose.lean, pose.twist, pose.roll ?? (boss ? pose.lean * .35 : -pose.lean * .2));
  spine.position.y = .14 + pose.breath;
  neck.rotation.set(-pose.lean * .5, -pose.twist * .45, 0);
  for (const hand of ['left', 'right']) {
    const arm = arms[hand], action = pose.arms[hand];
    arm.upper.rotation.set(action.raise, action.turn, action.spread, 'YXZ');
    arm.elbow.rotation.x = action.elbow;
    arm.wrist.rotation.x = action.wrist;
    if (arm.fingers) arm.fingers.forEach((finger, i) => {
      finger.rotation.set(action.curl, 0, (i - 1) * (.13 - action.curl * .08));
    });
    const { hip, knee, ankle } = legs[hand];
    // Two-bone leg solve plants both feet while the pelvis lowers and shifts weight.
    const foot = pose.feet?.[hand];
    const forward = foot ? foot.forward : (hand === 'left' ? 1 : -1) * (.1 + pose.step);
    const down = Math.max(foot ? .35 : .7, baseHeight - .14 - (foot?.lift || 0));
    const length = Math.min(1.198, Math.hypot(down, forward));
    const angle = Math.acos(THREE.MathUtils.clamp((.62 ** 2 + length ** 2 - .58 ** 2) / (2 * .62 * length), -1, 1));
    hip.rotation.x = -Math.atan2(forward, down) - angle;
    knee.rotation.x = Math.PI - Math.acos(THREE.MathUtils.clamp((.62 ** 2 + .58 ** 2 - length ** 2) / (2 * .62 * .58), -1, 1));
    ankle.rotation.x = -hip.rotation.x - knee.rotation.x;
  }
  if (character.hound) {
    neck.rotation.x = -pose.lean * .85 - .06;
    character.jaw.rotation.x = pose.jaw;
    character.ears.forEach((ear, i) => { ear.rotation.x = -pose.ears; ear.rotation.z = (i ? -1 : 1) * .13; });
    character.tail.forEach((joint, i) => { joint.rotation.set(.12 + pose.cloth * .2, pose.tail + Math.sin(now / 350 - i * .6) * .06, 0); });
  }
  if (character.bell) {
    character.mantle.rotation.set(pose.bellTilt, pose.bellTurn, -pose.roll * .6);
    character.mantle.position.z = -.1 + pose.bellForward;
    character.clapper.rotation.x = pose.clapper;
  }
  const positions = cape.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = capeBase[i * 3], y = capeBase[i * 3 + 1];
    const v = .5 - y / (boss ? 1.35 : 1.15);
    const hem = character.hound ? Math.cos(x * 29) * .13 * v ** 4 : 0;
    positions.setXYZ(i, x * (.85 + v * .45), .65 - v * (character.hound ? 1.1 : boss ? 1.7 : 1.25) + hem,
      -.27 - v * (.15 + pose.cloth * .5) + Math.sin(now / 260 - v * 4 + x * 5) * v * .04);
  }
  positions.needsUpdate = true; cape.geometry.computeVertexNormals();
  character.root.updateMatrixWorld(true);
}

export class Fighters3D {
  constructor() {
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-400, 400, 275, -275, .1, 4000);
    this.camera.position.set(0, 0, 1500);
    this.scene.add(new THREE.HemisphereLight(0xcbe4dd, 0x363126, 1.7));
    for (const [color, intensity, x, y, z] of [[0xffe3b3, 2.8, -350, 650, 800], [0x9bdad8, 2, 500, 150, -400], [0xc9d9e8, .9, 350, 400, 700]]) {
      const light = new THREE.DirectionalLight(color, intensity); light.position.set(x, y, z); this.scene.add(light);
    }
    this.warden = createCharacter(true); this.hound = createHound(); this.bell = createBellExecutioner(); this.boss = this.warden; this.player = createCharacter(false);
    this.hound.root.visible = this.bell.root.visible = false;
    this.scene.add(this.warden.root, this.hound.root, this.bell.root, this.player.root);
    this.available = true;
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.available = false; });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.available = true; });
    this.renderer.compile(this.scene, this.camera);
  }

  draw(ctx, { width, height, bossX, bossY, bossScale, bossLean, playerX, playerY, scale, hit, glowHit, parryWindow, now, attackAt, parryAt, hurtAt, healAt = -Infinity, dodgeAt = -Infinity, reduced, enemy = 'boss', species = 'warden', enemyPose }) {
    const hound = species === 'hound', bell = species === 'bell';
    this.boss = hound ? this.hound : bell ? this.bell : this.warden;
    this.hound.root.visible = hound; this.bell.root.visible = bell; this.warden.root.visible = !hound && !bell;
    if (this.enemy !== enemy) {
      this.enemy = enemy;
      const [armor, trim] = enemy === 'elite' ? [0x634343, 0x996d62] : enemy === 'normal' ? [0x465263, 0x81909b] : [0x354d43, 0x597265];
      this.warden.armor.color.setHex(armor); this.warden.lightArmor.color.setHex(trim);
      Object.values(this.warden.arms).forEach(arm => arm.armMat.color.setHex(armor));
    }
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    if (this.width !== width || this.height !== height || this.dpr !== dpr) {
      this.width = width; this.height = height; this.dpr = dpr;
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(width, height, false);
      Object.assign(this.camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
      this.camera.updateProjectionMatrix();
    }
    const bossPose = enemyPose || (hound ? houndRigPoseAt(hit, now, reduced, attackAt) : bell ? bellRigPoseAt(hit, now, reduced, attackAt) : bossRigPoseAt(hit, now, reduced));
    if (!reduced && !hound && !bell) bossPose.lean -= Math.sin(Math.max(0, Math.min(1, (now - attackAt) / 380)) * Math.PI) * .23;
    poseCharacter(this.boss, bossPose, reduced ? 0 : now);
    const healProgress = (now - healAt) / ITEM_USE_MS;
    this.player.potion.visible = healProgress >= 0 && healProgress < 1;
    const healing = this.player.potion.visible ? Math.sin(healProgress * Math.PI) : 0;
    poseCharacter(this.player, playerRigPoseAt(now, attackAt, parryAt, hurtAt, reduced, healing, dodgeAt), reduced ? 0 : now);
    this.boss.root.position.set(bossX - width / 2, height / 2 - (bossY + 160 * bossScale), 0);
    this.boss.root.rotation.set(0, -.58, bossLean);
    this.boss.root.scale.setScalar(93 * bossScale);
    this.player.root.position.set(playerX - width / 2, height / 2 - (playerY + 39 * scale), 90);
    this.player.root.rotation.y = .78;
    this.player.root.scale.setScalar(58 * scale);
    if (bell) {
      this.bell.bellMetal.emissive.setHex(glowHit?.effect === 'weaken' ? 0x9c6cd3 : 0xe9c582);
      this.bell.bellMetal.emissiveIntensity = glowHit?.effect === 'weaken' ? .65 : glowHit?.type === 'bell-groundbreak' ? .6 : 0;
    }
    for (const [hand, arm] of Object.entries(this.boss.arms)) {
      const lit = glowHit && (glowHit.guard === hand || glowHit.guard === 'both');
      for (const material of [arm.armMat, arm.bladeMat]) {
        material.emissive.setHex(lit ? parryWindow ? colors.perfect : colors[hand] : 0x000000);
        material.emissiveIntensity = lit ? parryWindow ? 1.45 : glowHit.damage > 1 ? 1.2 : .8 : 0;
      }
    }
    this.scene.updateMatrixWorld(true);
    this.renderer.render(this.scene, this.camera);
    ctx.drawImage(this.renderer.domElement, 0, 0, width, height);
    const project = object => {
      const p = object.getWorldPosition(new THREE.Vector3()).project(this.camera);
      return [(p.x + 1) * width / 2, (1 - p.y) * height / 2];
    };
    return { hands: Object.fromEntries(Object.entries(this.boss.arms).map(([side, arm]) => [side, project(arm.wrist)])),
      core: project(this.boss.core), playerGuard: project(this.player.arms.right.wrist), groundStrike: bell ? project(this.bell.groundStrike) : null };
  }
}
