import * as THREE from './vendor/three/three.module.min.js';
import { bossRigPoseAt, playerRigPoseAt } from './motion.mjs';
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

export function poseCharacter(character, pose, now) {
  const { pelvis, spine, neck, arms, legs, cape, capeBase, boss } = character;
  pelvis.position.y = 1.34 - pose.crouch;
  spine.rotation.set(pose.lean, pose.twist, boss ? pose.lean * .35 : -pose.lean * .2);
  spine.position.y = .14 + pose.breath;
  neck.rotation.set(-pose.lean * .5, -pose.twist * .45, 0);
  for (const hand of ['left', 'right']) {
    const arm = arms[hand], action = pose.arms[hand];
    arm.upper.rotation.set(action.raise, action.turn, action.spread, 'YXZ');
    arm.elbow.rotation.x = action.elbow;
    arm.wrist.rotation.x = action.wrist;
    const { hip, knee, ankle } = legs[hand];
    // Two-bone leg solve plants both feet while the pelvis lowers and shifts weight.
    const forward = (hand === 'left' ? 1 : -1) * (.1 + pose.step);
    const down = Math.max(.7, pelvis.position.y - .14);
    const length = Math.min(1.198, Math.hypot(down, forward));
    const angle = Math.acos(THREE.MathUtils.clamp((.62 ** 2 + length ** 2 - .58 ** 2) / (2 * .62 * length), -1, 1));
    hip.rotation.x = -Math.atan2(forward, down) - angle;
    knee.rotation.x = Math.PI - Math.acos(THREE.MathUtils.clamp((.62 ** 2 + .58 ** 2 - length ** 2) / (2 * .62 * .58), -1, 1));
    ankle.rotation.x = -hip.rotation.x - knee.rotation.x;
  }
  const positions = cape.geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = capeBase[i * 3], y = capeBase[i * 3 + 1];
    const v = .5 - y / (boss ? 1.35 : 1.15);
    positions.setXYZ(i, x * (.85 + v * .45), .65 - v * (boss ? 1.7 : 1.25),
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
    this.boss = createCharacter(true); this.player = createCharacter(false);
    this.scene.add(this.boss.root, this.player.root);
    this.available = true;
    this.renderer.domElement.addEventListener('webglcontextlost', event => { event.preventDefault(); this.available = false; });
    this.renderer.domElement.addEventListener('webglcontextrestored', () => { this.available = true; });
    this.renderer.compile(this.scene, this.camera);
  }

  draw(ctx, { width, height, bossX, bossY, bossScale, bossLean, playerX, playerY, scale, hit, glowHit, parryWindow, now, attackAt, parryAt, hurtAt, healAt = -Infinity, reduced, enemy = 'boss' }) {
    if (this.enemy !== enemy) {
      this.enemy = enemy;
      const [armor, trim] = enemy === 'elite' ? [0x634343, 0x996d62] : enemy === 'normal' ? [0x465263, 0x81909b] : [0x354d43, 0x597265];
      this.boss.armor.color.setHex(armor); this.boss.lightArmor.color.setHex(trim);
      Object.values(this.boss.arms).forEach(arm => arm.armMat.color.setHex(armor));
    }
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 1.5);
    if (this.width !== width || this.height !== height || this.dpr !== dpr) {
      this.width = width; this.height = height; this.dpr = dpr;
      this.renderer.setPixelRatio(dpr); this.renderer.setSize(width, height, false);
      Object.assign(this.camera, { left: -width / 2, right: width / 2, top: height / 2, bottom: -height / 2 });
      this.camera.updateProjectionMatrix();
    }
    const bossPose = bossRigPoseAt(hit, now, reduced);
    if (!reduced) bossPose.lean -= Math.sin(Math.max(0, Math.min(1, (now - attackAt) / 380)) * Math.PI) * .23;
    poseCharacter(this.boss, bossPose, reduced ? 0 : now);
    const healProgress = (now - healAt) / ITEM_USE_MS;
    this.player.potion.visible = healProgress >= 0 && healProgress < 1;
    const healing = this.player.potion.visible ? Math.sin(healProgress * Math.PI) : 0;
    poseCharacter(this.player, playerRigPoseAt(now, attackAt, parryAt, hurtAt, reduced, healing), reduced ? 0 : now);
    this.boss.root.position.set(bossX - width / 2, height / 2 - (bossY + 160 * bossScale), 0);
    this.boss.root.rotation.set(0, -.58, bossLean);
    this.boss.root.scale.setScalar(93 * bossScale);
    this.player.root.position.set(playerX - width / 2, height / 2 - (playerY + 39 * scale), 90);
    this.player.root.rotation.y = .78;
    this.player.root.scale.setScalar(58 * scale);
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
      core: project(this.boss.core), playerGuard: project(this.player.arms.right.wrist) };
  }
}
