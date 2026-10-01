import { Combat, MODES, COOLDOWN, BOSS_HP, TELEGRAPH_MS, ATTACK_COMPONENTS } from './combat.mjs';
import { motionAt, weaponPoseAt, playerPoseAt } from './motion.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
let game = new Combat();
let paused = false;
let pausedAt = 0;
let origin = performance.now();
let lastFrame = performance.now();
let width = 800, height = 550, hudBottom = 110;
let feedbackUntil = 0, flashAt = -Infinity, flashKind = '', phaseUntil = 0;
let showGuide = true, sound = true, audio;
let best = null;
let particles = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const impactSeen = new WeakSet();
const cueSeen = new WeakSet();
const launchSeen = new WeakSet();
const projectileOrigins = new WeakMap();
const characterArt = { boss: new Image(), player: new Image() };
characterArt.boss.src = './assets/concepts/hollow-warden-v1.png';
characterArt.player.src = './assets/concepts/protagonist-v1.png';
$('start').disabled = true;
Promise.all(Object.values(characterArt).map(image => image.decode().catch(() => {}))).then(() => {
  $('start').disabled = false;
  lastFrame = performance.now();
});
try { best = JSON.parse(localStorage.getItem('afterimage-best-v1')); } catch { /* Local storage is optional. */ }

const clock = () => paused ? pausedAt : performance.now() - origin;
const running = () => game.state === 'player' || game.state === 'boss';
const timeString = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const activeModes = [...document.querySelectorAll('[data-mode]')];
const parryButtons = { left: $('parry-left'), right: $('parry-right') };
const heldInputs = new Map();
const guardColors = { left: '#88dcf2', right: '#f2ad8e' };

// ponytail: cutout hinges reuse the two concept PNGs. Separate painted limb
// sheets would be needed for elbow articulation or turning away from the camera.
function artRig(bounds, definitions) {
  const [x, y, w, h] = bounds;
  const point = ([px, py]) => [x + px / 1024 * w, y + py / 1536 * h];
  const body = new Path2D(); body.rect(x, y, w, h);
  const parts = definitions.map(([side, pivot, points]) => {
    const path = new Path2D();
    points.map(point).forEach(([px, py], i) => i ? path.lineTo(px, py) : path.moveTo(px, py));
    path.closePath(); body.addPath(path);
    return { side, pivot: point(pivot), path };
  });
  return { bounds, body, parts };
}
const bossRig = artRig([-108, -138, 204, 306], [
  ['left', [355, 404], [[0, 395], [395, 395], [407, 445], [358, 522], [330, 589], [344, 623], [334, 670], [286, 744], [265, 826], [0, 1430]]],
  ['right', [677, 455], [[635, 425], [1024, 425], [1024, 1420], [875, 1110], [803, 898], [762, 803], [714, 692], [677, 606], [651, 551], [629, 496]]],
]);
const playerRig = artRig([-70, -118, 110, 165], [
  ['left', [439, 457], [[0, 432], [448, 432], [482, 481], [450, 555], [419, 607], [427, 642], [402, 698], [366, 749], [317, 809], [0, 1410]]],
  ['right', [747, 457], [[736, 419], [1024, 419], [1024, 632], [823, 607], [759, 580], [726, 521]]],
]);

function limbTransform(part, pose) {
  const [x, y] = part.pivot;
  ctx.translate(x + pose.x, y + pose.y);
  ctx.rotate(pose.angle); ctx.scale(1, pose.scaleY); ctx.translate(-x, -y);
}

function drawArtRig(image, rig, poses, decorate) {
  ctx.save(); ctx.clip(rig.body, 'evenodd'); ctx.drawImage(image, ...rig.bounds); ctx.restore();
  for (const part of rig.parts) {
    ctx.save(); limbTransform(part, poses[part.side]);
    ctx.save(); ctx.clip(part.path); ctx.drawImage(image, ...rig.bounds); ctx.restore();
    decorate?.(part.side);
    ctx.restore();
  }
}

function resize() {
  const bounds = canvas.getBoundingClientRect();
  width = bounds.width; height = bounds.height;
  hudBottom = document.querySelector('.boss-hud').getBoundingClientRect().bottom - bounds.top;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);

function unlockAudio() {
  if (!sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
  } catch { /* Visual cues work without audio support. */ }
}

function tone(freq, duration = .12, type = 'sine', volume = .06, endFreq = freq) {
  if (!sound || !audio || audio.state !== 'running') return;
  const oscillator = audio.createOscillator();
  const gain = audio.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(freq, audio.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(endFreq, audio.currentTime + duration);
  gain.gain.setValueAtTime(0, audio.currentTime);
  gain.gain.linearRampToValueAtTime(volume, audio.currentTime + .008);
  gain.gain.exponentialRampToValueAtTime(.001, audio.currentTime + duration);
  oscillator.connect(gain).connect(audio.destination);
  oscillator.start(); oscillator.stop(audio.currentTime + duration + .01);
}

function feedback(title, description, kind = '', duration = 900) {
  $('feedback').className = `combat-feedback visible ${kind}`;
  $('feedback').querySelector('strong').textContent = title;
  $('feedback').querySelector('span').textContent = description;
  feedbackUntil = clock() + duration;
}

function burst(kind) {
  flashAt = clock(); flashKind = kind;
  if (reducedMotion) return;
  const x = kind === 'attack' ? width * .56 : width * .3;
  const y = kind === 'attack' ? height * .4 : height * .76 - (characterArt.player.naturalWidth ? 44 : 18) * Math.min(width / 680, height / 505);
  for (let i = 0; i < 24; i++) {
    const angle = Math.random() * Math.PI * 2;
    particles.push({ x, y, vx: Math.cos(angle) * (30 + Math.random() * 180), vy: Math.sin(angle) * (30 + Math.random() * 180), birth: clock(), kind });
  }
}

function processEvents() {
  for (const event of game.drain()) {
    switch (event.type) {
      case 'start': feedback('YOUR TURN', '공격 버튼으로 전투를 시작하세요', '', 1500); break;
      case 'attack': feedbackUntil = 0; tone(145, .16, 'triangle', .1, 48); burst('attack'); break;
      case 'perfect':
      case 'parry': {
        const perfect = event.type === 'perfect';
        feedback(perfect ? 'PERFECT' : 'PARRY', `피해 0${showGuide ? ` · ${event.offset > 0 ? '+' : ''}${event.offset} ms` : ''}`, '', 750);
        tone(perfect ? 1046 : 698, .3, 'sine', .09, perfect ? 1568 : 880);
        tone(2200, .08, 'triangle', .035, 1800);
        burst(event.type);
        if (navigator.vibrate) navigator.vibrate(perfect ? [12, 25, 12] : 12);
        break;
      }
      case 'early': feedback('TOO EARLY', '타격 순간까지 기다리세요', 'early', 500); tone(170, .08, 'sine', .04, 120); break;
      case 'late': feedback('TOO LATE', '조금 더 일찍 탭해 보세요', 'hurt', 700); break;
      case 'wrong': feedback('방향 확인', '빛나는 팔과 무기 쪽을 막아보세요', 'early', 650); break;
      case 'hurt':
        feedback('HIT', game.mode === 'practice' ? '괜찮아요. 다음 타격에 집중하세요' : '타이밍을 놓쳤습니다 · 생명력 −1', 'hurt');
        tone(85, .23, 'sawtooth', .05, 35); burst('hurt');
        $('arena').classList.remove('hit'); void $('arena').offsetWidth; $('arena').classList.add('hit');
        if (navigator.vibrate) navigator.vibrate(40);
        break;
      case 'phase': phaseUntil = clock() + 1900; tone(110, .5, 'triangle', .07, 165); break;
      case 'turn': feedback('YOUR TURN', '빈틈입니다. 공격하세요.', '', 1100); tone(392, .2, 'sine', .04, 523); break;
      case 'won':
      case 'lost': finish(event.type === 'won'); break;
    }
  }
  updateUI();
}

function updateUI() {
  $('boss-health').innerHTML = `${game.bossHp} <small>/ ${BOSS_HP}</small>`;
  $('boss-fill').style.width = `${game.bossHp / BOSS_HP * 100}%`;
  document.querySelector('.boss-health-track').setAttribute('aria-valuenow', game.bossHp);
  $('phase').textContent = `PHASE 0${game.phase}`;
  $('phase').classList.toggle('enraged', game.phase === 2);
  $('hp-text').textContent = game.mode === 'practice' ? '∞' : `${game.hp} / 5`;
  $('health-pips').setAttribute('aria-label', game.mode === 'practice' ? '연습 모드 무제한 생명력' : `생명력 ${game.hp}/5`);
  [...$('health-pips').children].forEach((pip, i) => pip.classList.toggle('empty', i >= game.hp));
  $('arena-life').setAttribute('aria-label', $('health-pips').getAttribute('aria-label'));
  [...$('arena-life').querySelectorAll('i')].forEach((pip, i) => pip.classList.toggle('empty', i >= game.hp));
  $('arena-life').querySelector('b').textContent = game.mode === 'practice' ? '∞' : `${game.hp} / 5`;
  $('parry-count').textContent = String(game.parries).padStart(2, '0');
  $('perfect-count').textContent = String(game.perfects).padStart(2, '0');
  $('hit-count').textContent = String(game.hits).padStart(2, '0');
  $('nohit-status').classList.toggle('broken', game.hits > 0);
  $('nohit-label').textContent = game.mode === 'practice' ? '연습 중' : game.hits > 0 ? '다음 도전에' : game.state === 'won' ? '달성!' : game.state === 'ready' ? '도전 준비' : '진행 중';
  $('round-label').textContent = `ROUND ${game.round ? String(game.round).padStart(2, '0') : '—'}`;
  const playerTurn = game.state === 'player';
  const bossTurn = game.state === 'boss';
  $('turn-tag').classList.toggle('boss', bossTurn);
  $('turn-tag').innerHTML = `<i></i> ${paused ? '일시 정지' : playerTurn ? '당신의 차례' : bossTurn ? '보스의 차례' : game.state === 'won' ? '전투 승리' : game.state === 'lost' ? '전투 종료' : '전투 대기'}`;
  $('attack').disabled = !playerTurn || paused;
  Object.values(parryButtons).forEach(button => { button.disabled = !bossTurn || paused; });
  $('attack-hint').textContent = playerTurn ? '빈틈 공격' : '내 차례';
  $('pause').disabled = !running();
  activeModes.forEach(button => { button.disabled = running() || !$('death-screen').hidden; });
  $('practice-attack-label').hidden = game.mode !== 'practice';
  $('practice-attack').disabled = running() || !$('death-screen').hidden;
}

function start() {
  if (!$('death-screen').hidden) return;
  if (paused) { togglePause(); return; }
  clearParryInputs();
  unlockAudio();
  origin = performance.now(); lastFrame = origin;
  game.start();
  particles = []; phaseUntil = 0; flashAt = -Infinity;
  $('overlay').hidden = true;
  $('arena').classList.remove('hit');
  processEvents();
}

function act(kind) {
  if (!running() || paused) return;
  unlockAudio();
  if (kind === 'attack') game.attack(clock());
  else game.tap(clock(), kind);
  processEvents();
}

function pressParry(side, token) {
  if (paused || game.state !== 'boss' || heldInputs.has(token)) return;
  heldInputs.set(token, side);
  parryButtons[side].classList.add('held');
  act(side);
}

function releaseParry(token) {
  const side = heldInputs.get(token);
  if (!side) return;
  heldInputs.delete(token);
  if (![...heldInputs.values()].includes(side)) {
    parryButtons[side].classList.remove('held');
    game.release(clock(), side);
    processEvents();
  }
}

function clearParryInputs() {
  heldInputs.clear();
  for (const [side, button] of Object.entries(parryButtons)) {
    game.release(clock(), side);
    button.classList.remove('held');
  }
}

function togglePause() {
  if (!running()) return;
  if (!paused) {
    clearParryInputs();
    processEvents();
    pausedAt = clock(); paused = true;
    $('overlay-eyebrow').textContent = 'TAKE A BREATH';
    $('overlay-title').innerHTML = '잠깐의 <em>쉼표.</em>';
    $('overlay-copy').innerHTML = '준비되면, 멈췄던 순간부터 이어갑니다.';
    $('overlay-foot').textContent = '화면을 벗어나면 전투가 자동으로 멈춥니다';
    $('result-stats').hidden = true;
    $('intro-emblem').textContent = 'Ⅱ';
    $('start').innerHTML = '전투 계속 <svg><use href="#i-arrow"/></svg>';
    $('overlay').hidden = false;
    $('pause').setAttribute('aria-label', '전투 계속');
    if (audio) audio.suspend().catch(() => {});
  } else {
    origin = performance.now() - pausedAt; paused = false; lastFrame = performance.now();
    $('overlay').hidden = true;
    $('pause').setAttribute('aria-label', '일시 정지');
    unlockAudio();
  }
  $('arena').classList.toggle('paused', paused);
  updateUI();
}

async function finish(won) {
  clearParryInputs();
  const nohit = won && game.hits === 0 && game.mode === 'challenge';
  $('intro-emblem').textContent = nohit ? '◈' : won ? '◇' : '↻';
  $('overlay-eyebrow').textContent = nohit ? 'A FLAWLESS VICTORY' : won ? 'WARDEN DEFEATED' : 'EVERY ATTEMPT COUNTS';
  $('overlay-title').innerHTML = nohit ? '완벽한 <em>잔상.</em>' : won ? '순간을 <em>지배하다.</em>' : '다시, <em>한 번.</em>';
  $('overlay-copy').innerHTML = nohit ? '한 대도 맞지 않았습니다.<br>모든 순간이 당신의 것이었습니다.' : won ? '공허의 파수꾼을 쓰러뜨렸습니다.<br>다음 목표는 한 대도 맞지 않는 승리.' : '패턴은 달라져도, 빈틈은 있습니다.<br>다음에는 조금 더 정확하게.';
  $('result-stats').innerHTML = `<div><span>전투 시간</span><b>${timeString(game.elapsed)}</b></div><div><span>퍼펙트</span><b>${game.perfects}</b></div><div><span>피격</span><b>${game.hits}</b></div>`;
  $('result-stats').hidden = false;
  $('start').innerHTML = '다시 도전 <svg><use href="#i-retry"/></svg>';
  $('overlay-foot').textContent = game.mode === 'practice' ? '연습 모드 · 최고 기록에 포함되지 않습니다' : '새로운 공격 조합이 기다립니다';
  $('overlay').hidden = !won;
  if (won) {
    tone(523, .6, 'sine', .07, 1046);
    if (game.mode === 'challenge' && (!best || game.hits < best.hits || (game.hits === best.hits && game.elapsed < best.time))) {
      best = { hits: game.hits, time: game.elapsed };
      try { localStorage.setItem('afterimage-best-v1', JSON.stringify(best)); } catch { /* Private browsing can disable persistence. */ }
      renderBest();
    }
  } else {
    feedbackUntil = 0; phaseUntil = 0;
    const death = $('death-screen');
    death.hidden = false;
    await death.animate(reducedMotion ? [{ opacity: 1 }, { opacity: 1 }] : [
      { opacity: 0, offset: 0 },
      { opacity: 1, offset: .1 },
      { opacity: 1, offset: .28 },
      { opacity: 0, offset: 1 },
    ], { duration: reducedMotion ? 1200 : 3600, fill: 'forwards' }).finished;
    death.hidden = true;
    death.getAnimations().forEach(animation => animation.cancel());
    $('overlay').hidden = false;
    updateUI();
    $('start').focus({ preventScroll: true });
  }
}

function renderBest() {
  $('best-record').textContent = best && Number.isFinite(best.hits) && Number.isFinite(best.time) ? `${best.hits === 0 ? 'NO-HIT' : `피격 ${best.hits}회`} · ${timeString(best.time)}` : '첫 승리를 기다리는 중';
}

$('start').addEventListener('click', start);
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', () => {
  sound = !sound;
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
  if (sound) unlockAudio();
});
$('guide').addEventListener('change', event => { showGuide = event.target.checked; });
ATTACK_COMPONENTS.forEach(component => $('practice-attack').add(new Option(component.name, component.type)));
$('practice-attack').addEventListener('change', event => {
  if (running() || !$('death-screen').hidden) return;
  game = new Combat({ mode: game.mode, practiceAttack: event.target.value });
  updateUI();
});
$('attack').addEventListener('pointerdown', event => {
  if (event.button !== 0) return;
  event.preventDefault();
  act('attack');
});
$('attack').addEventListener('click', event => { if (event.detail === 0) act('attack'); });
for (const [side, button] of Object.entries(parryButtons)) {
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || button.disabled) return;
    event.preventDefault();
    button.setPointerCapture(event.pointerId);
    // Secondary touch pointers are required for a two-finger parry.
    pressParry(side, `pointer:${event.pointerId}`);
  });
  for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(eventName, event => releaseParry(`pointer:${event.pointerId}`));
  }
  // Screen-reader activation and native keyboard clicks are single-side taps.
  button.addEventListener('click', event => {
    if (event.detail !== 0) return;
    pressParry(side, `click:${side}`);
    releaseParry(`click:${side}`);
  });
}
activeModes.forEach(button => button.addEventListener('click', () => {
  if (running() || !$('death-screen').hidden) return;
  game = new Combat({ mode: button.dataset.mode, practiceAttack: $('practice-attack').value });
  activeModes.forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  $('mode-description').textContent = game.mode === 'practice' ? '무제한 생명력과 넓은 판정으로 타이밍을 익히세요.' : '5번의 기회. 한 대도 맞지 않는 승리에 도전하세요.';
  updateUI();
}));
document.addEventListener('keydown', event => {
  if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Escape') { togglePause(); return; }
  if (['KeyJ', 'KeyA', 'KeyD'].includes(event.code)) {
    if (!running() || paused) return;
    event.preventDefault();
    if (event.code === 'KeyJ') act('attack');
    else pressParry(event.code === 'KeyA' ? 'left' : 'right', event.code);
  }
});
document.addEventListener('keyup', event => releaseParry(event.code));
document.addEventListener('visibilitychange', () => { if (document.hidden && running() && !paused) togglePause(); });
window.addEventListener('blur', () => { if (running() && !paused) togglePause(); });

function polygon(points, fill, stroke, lineWidth = 1) {
  ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}
function line(points, color, lineWidth = 1) {
  ctx.beginPath(); points.forEach(([x, y], index) => index ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
  ctx.strokeStyle = color; ctx.lineWidth = lineWidth; ctx.stroke();
}
function ellipse(x, y, rx, ry, color, fill = false) {
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
  if (fill) { ctx.fillStyle = color; ctx.fill(); } else { ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.stroke(); }
}

function timingRing(delta, active) {
  ctx.setLineDash([2, 5]); ellipse(0, 0, 24, 24, '#d5d5a670'); ctx.setLineDash([]);
  ctx.beginPath(); ctx.arc(0, 0, 24 + Math.max(0, delta) / TELEGRAPH_MS * 90, 0, Math.PI * 2);
  ctx.strokeStyle = active ? '#f4df9b' : '#c6c49eaa'; ctx.lineWidth = active ? 3 : 1.5; ctx.stroke();
  if (active) { ctx.fillStyle = '#f4df9b0c'; ctx.fill(); }
}

function drawProjectile(hit, now, from, target, side, scale) {
  const progress = Math.max(0, Math.min(1, (now - hit.launchAt) / (hit.at - hit.launchAt)));
  // Curved lanes ensure a left projectile visibly approaches from the player's left.
  const control = [Math.max(18, Math.min(width - 18, target[0] + side * width * .42)), height * .62];
  const point = u => from.map((v, i) => (1 - u) ** 2 * v + 2 * (1 - u) * u * control[i] + u * u * target[i]);
  const [x, y] = point(progress);
  const radius = Math.max(6, (6 + 18 * progress) * scale);
  const color = guardColors[side < 0 ? 'left' : 'right'];
  ctx.save();
  ctx.globalAlpha = now <= hit.at ? 1 : Math.max(0, 1 - (now - hit.at) / 240);
  if (!reducedMotion) {
    const trail = [0, 1, 2, 3, 4].map(i => point(Math.max(0, progress - i * .035)));
    line(trail, `${color}65`, Math.max(2, radius * .5));
    ctx.shadowColor = color; ctx.shadowBlur = radius * 1.5;
  }
  ctx.translate(x, y);
  const previous = point(Math.max(0, progress - .02));
  ctx.rotate(Math.atan2(y - previous[1], x - previous[0]));
  if (hit.type === 'energy-orb') {
    ellipse(0, 0, radius, radius, `${color}65`, true);
    ellipse(0, 0, radius, radius, color);
    ellipse(0, 0, radius * .45, radius * .45, '#edfff5', true);
  } else {
    for (const size of [1, 1.5]) {
      ctx.beginPath(); ctx.arc(-radius * .4, 0, radius * size, -1.2, 1.2);
      ctx.strokeStyle = color; ctx.lineWidth = size === 1 ? 4 : 2; ctx.stroke();
    }
  }
  ctx.restore();
}

function drawScene(now) {
  ctx.clearRect(0, 0, width, height);
  const scale = Math.min(width / 680, height / 505);
  const t = reducedMotion ? 0 : now / 1000;
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#18271f'); bg.addColorStop(.5, '#243529'); bg.addColorStop(1, '#121f1c');
  ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
  const glow = ctx.createRadialGradient(width * .55, height * .42, 0, width * .55, height * .42, width * .55);
  glow.addColorStop(0, '#89946419'); glow.addColorStop(1, '#89946400');
  ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);

  // Keep the procedural arena behind the illustrated combatants.
  const horizon = height * .61;
  for (let i = 0; i < 11; i++) {
    const x = (i / 10) * width;
    const towerH = (65 + Math.sin(i * 4.1) * 45) * scale;
    const towerW = (19 + Math.cos(i) * 9) * scale;
    polygon([[x, horizon], [x, horizon - towerH], [x + towerW * .3, horizon - towerH - 15 * scale], [x + towerW, horizon - towerH - 7 * scale], [x + towerW, horizon]], '#1a2a22', '#41513a30');
    line([[x + towerW * .3, horizon - towerH - 15 * scale], [x + towerW * .3, horizon]], '#73825a16');
  }
  ctx.fillStyle = '#15251ea0'; ctx.fillRect(0, horizon, width, height - horizon);
  for (let i = 0; i < 7; i++) {
    const angle = i / 6 * Math.PI;
    line([[width * .53, height * .64], [width * .53 + Math.cos(angle) * width, height * .64 + Math.sin(angle) * height * .8]], '#65755313');
  }
  ellipse(width * .53, height * .735, width * .405, height * .143, '#70876032');
  ellipse(width * .53, height * .735, width * .36, height * .12, '#8390621e');
  ellipse(width * .53, height * .735, width * .27, height * .08, '#64775624');
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI * 2 / 16;
    const x = width * .53 + Math.cos(a) * width * .385;
    const y = height * .735 + Math.sin(a) * height * .132;
    line([[x, y], [x + Math.cos(a) * 7, y + Math.sin(a) * 3]], '#afae7350');
  }

  // Broken pillars frame the room without obscuring either fighter.
  [[.1, .51, 1], [.85, .54, .8]].forEach(([px, py, size], i) => {
    ctx.save(); ctx.translate(width * px, height * py); ctx.scale(scale * size, scale * size);
    polygon([[-16, 55], [-13, -60], [0, -76], [19, -59], [21, 52], [3, 61]], '#29352b', '#68724a55');
    polygon([[0, -76], [19, -59], [21, 52], [3, 61]], '#1d2d25');
    line([[-13, -30], [-2, -24], [-7, -9], [3, 2]], '#75836250');
    const bob = Math.sin(t + i) * 3;
    polygon([[-12, -91 + bob], [-8, -112 + bob], [10, -121 + bob], [18, -96 + bob], [1, -83 + bob]], '#364331', '#80886655');
    ctx.restore();
  });

  const hit = game.state === 'boss' ? game.nextHit() : null;
  const delta = hit ? hit.at - now : Infinity;
  const windup = hit && now >= hit.windupAt;
  const warning = delta < TELEGRAPH_MS && delta > -MODES[game.mode].window;
  const parryWindow = hit && Math.abs(delta) <= MODES[game.mode].window;
  // Light only the current strike once its windup begins, never the next combo step.
  const glowHit = windup && !paused ? hit : null;
  // Animate the scheduled strike even when it was parried early; otherwise the
  // weapon would jump to the next hand before the current swing reached impact.
  const motionHit = game.state === 'boss' ? game.sequence.find(h => h.windupAt <= now && h.at > now) : null;
  let anticipation = 0;
  if (motionHit) {
    const progress = Math.max(0, (now - motionHit.commitAt) / (motionHit.at - motionHit.commitAt));
    if (motionHit.tempo === 'hold') {
      anticipation = now < motionHit.commitAt ? Math.min(.8, (now - motionHit.windupAt) / 300) : .8 + .2 * progress;
    } else if (motionHit.tempo === 'feint' && now < motionHit.commitAt) {
      anticipation = .8 * Math.sin((now - motionHit.windupAt) / (motionHit.commitAt - motionHit.windupAt) * Math.PI);
    } else {
      anticipation = progress;
    }
    if (motionHit.launchAt != null) anticipation = Math.min(1, (now - motionHit.windupAt) / (motionHit.launchAt - motionHit.windupAt));
  }
  const lastImpact = game.state === 'boss' ? game.sequence.find(h => now >= h.at && now - h.at < 240) : null;
  const strikeProgress = lastImpact ? (now - lastImpact.at) / 240 : 0;
  const poseHit = lastImpact || motionHit;
  const pose = poseHit?.type;
  const ranged = poseHit?.launchAt != null;
  const travel = lastImpact ? 1 - strikeProgress : motionHit ? Math.max(0, (now - motionHit.commitAt) / (motionHit.at - motionHit.commitAt)) : 0;
  let shiftX = 0, shiftY = 0, lean = 0;
  if (pose === 'leap') {
    shiftX = -50 * travel;
    shiftY = 28 * travel - (lastImpact ? 0 : 40 * Math.sin(travel * Math.PI));
  } else if (pose === 'rush') {
    shiftX = -85 * travel ** 3; shiftY = 50 * travel ** 3; lean = -.12 * travel;
  } else if (pose === 'retreat') {
    shiftX = lastImpact ? -60 * travel : 40 * Math.sin(travel * Math.PI) - 60 * travel ** 4;
    shiftY = -shiftX * .45;
  } else if (pose === 'spin') {
    lean = (poseHit.hand === 'left' ? -1 : 1) * .28 * Math.sin(travel * Math.PI);
  } else if (pose === 'low-sweep') {
    shiftY = 19 * travel;
  } else if (pose === 'wave') {
    shiftY = 8 * Math.sin(travel * Math.PI * 2);
  }
  // Movement is composed independently of the weapon, on the same paused clock.
  const movement = motionAt(poseHit, now, reducedMotion);
  shiftX += movement.x; shiftY += movement.y;
  if (reducedMotion) { shiftX = 0; shiftY = 0; lean = 0; }
  const bossArtReady = characterArt.boss.complete && characterArt.boss.naturalWidth > 0;
  // Reserve space for a raised blade as well as the resting silhouette.
  const bossTop = bossArtReady ? 220 : 110, bossBottom = bossArtReady ? 168 : 125;
  const bossScale = Math.min(scale * movement.depth, (height - 88 - hudBottom) / (bossTop + bossBottom));
  const edge = Math.min(width / 2, (bossArtReady ? 235 : 230) * bossScale + 12);
  const bossX = Math.max(edge, Math.min(width - edge, width * .56 + shiftX * scale));
  const minBossY = hudBottom + bossTop * bossScale + 8;
  const maxBossY = height - 80 - bossBottom * bossScale;
  const bossY = Math.max(minBossY, Math.min(maxBossY, height * .49 + shiftY * scale));
  const floatY = Math.sin(t * 1.5) * 4 * scale;
  const groundY = bossArtReady
    ? Math.max(minBossY, Math.min(maxBossY, height * .49)) + (bossBottom - 5) * bossScale + (movement.depth - 1) * 50 * scale
    : height * .7 + (movement.depth - 1) * 50 * scale;
  ellipse(bossX, groundY, (pose === 'leap' ? 52 : 70) * bossScale, 12 * bossScale, '#00000035', true);
  // A shrinking shadow and a detached body make altitude distinct from depth.
  if (movement.y < -12 && !reducedMotion) {
    line([[bossX, bossY + (bossBottom - 2) * bossScale], [bossX, groundY - 8 * bossScale]], '#c4bd8330');
  }

  // Ground attacks telegraph their approach; the wave deals damage only at its
  // scheduled arrival, through exactly the same parry check as a sword strike.
  if (pose === 'wave' || pose === 'leap') {
    if (pose === 'wave' && motionHit) {
      const approach = Math.max(0, 1 - (motionHit.at - now) / TELEGRAPH_MS);
      if (approach > 0) {
        ellipse(bossX, groundY, width * .31 * approach, height * .15 * approach, '#e3c285aa');
        ellipse(bossX, groundY, width * .29 * approach, height * .14 * approach, '#a1925c55');
      }
    }
    if (lastImpact) {
      const spread = 1 + strikeProgress * .3;
      ctx.globalAlpha = 1 - strikeProgress;
      ellipse(bossX, groundY, width * .31 * spread, height * .15 * spread, '#e3c285');
      for (let i = 0; i < 7; i++) {
        const angle = i * Math.PI / 3.5;
        line([[bossX, groundY], [bossX + Math.cos(angle) * 100 * bossScale, groundY + Math.sin(angle) * 22 * bossScale]], '#d7b57f66');
      }
      ctx.globalAlpha = 1;
    }
  }

  ctx.save(); ctx.translate(bossX, bossY + floatY); ctx.scale(bossScale, bossScale); ctx.rotate(lean);
  const hurtFlash = flashKind === 'attack' && now - flashAt < 130;
  const fury = pose === 'fury';
  const armor = hurtFlash ? '#a6ac7e' : fury ? '#6c4438' : '#465442';
  const edges = fury ? '#f0a080aa' : game.phase === 2 ? '#a4845755' : '#a5ad7e55';
  const core = parryWindow ? '#fff0b4' : ranged ? '#a5dfff' : fury ? '#f5a082' : warning ? '#e7bd80' : game.phase === 2 ? '#d19567' : '#c6ba7f';
  const bossHands = {};
  if (bossArtReady) {
    ctx.save();
    // Face the player. Art-side hinges are mirrored, but guard names, colors
    // and projectile lanes must still refer to the player's screen sides.
    ctx.scale(-1, 1);
    const poses = Object.fromEntries(['left', 'right'].map(hand => {
      const screenHand = hand === 'left' ? 'right' : 'left';
      const pose = weaponPoseAt(poseHit, now, screenHand, reducedMotion);
      pose.angle *= -1; pose.x *= -1;
      if (!reducedMotion) pose.angle += Math.sin(t * 1.7 + (hand === 'left' ? 0 : 1.4)) * .025;
      return [hand, pose];
    }));
    if (!reducedMotion) {
      const breath = Math.sin(t * 1.7) * .009;
      ctx.scale(1 - breath * .4, 1 + breath);
      ctx.rotate((poses.left.angle + poses.right.angle) * -.025);
    }
    if (hurtFlash) ctx.filter = 'brightness(1.65)';
    drawArtRig(characterArt.boss, bossRig, poses, artSide => {
      const side = artSide === 'left' ? 'right' : 'left';
      ctx.filter = 'none';
      const wrist = artSide === 'left' ? [-62, 4] : [49, 12];
      const position = ctx.getTransform().transformPoint({ x: wrist[0], y: wrist[1] });
      bossHands[side] = [position.x / canvas.width, position.y / canvas.height];
      if (glowHit && (glowHit.guard === side || glowHit.guard === 'both')) {
        ctx.save(); ctx.globalCompositeOperation = 'screen';
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        const color = parryWindow ? '#fff0b4' : guardColors[side];
        const arm = artSide === 'left' ? [[-38, -57], [-52, -42], [-62, -8]] : [[27, -47], [40, -25], [49, 3]];
        const blade = artSide === 'left' ? [[-67, 24], [-101, 119]] : [[56, 32], [90, 120]];
        ctx.shadowColor = color; ctx.shadowBlur = reducedMotion ? 0 : Math.max(8, 18 * bossScale);
        line(arm, `${color}30`, 24);
        line(arm, `${color}88`, 10);
        line(arm, color, 2.5);
        line(blade, `${color}55`, 16);
        line(blade, color, parryWindow ? 7 : 5);
        ctx.restore();
      }
      if (ranged && motionHit && now < motionHit.launchAt && (motionHit.guard === side || motionHit.guard === 'both')) {
        const radius = 5 + anticipation * 14, color = guardColors[side];
        ellipse(...wrist, radius * 1.5, radius * 1.5, `${color}35`, true);
        ellipse(...wrist, radius, radius, color);
        ellipse(...wrist, radius * .45, radius * .45, '#dcfff7', true);
      }
    });
    ctx.restore();
  } else {
    // Geometry remains a fallback if an image cannot load.
    // Floating stone skirt, torso, shoulders and an empty crown.
    polygon([[-31, 29], [-51, 117], [-9, 94], [0, 36]], '#263a30', edges);
    polygon([[8, 36], [19, 102], [53, 121], [36, 25]], '#344735', edges);
    polygon([[-8, 38], [-12, 96], [6, 111], [23, 71]], '#1d3028', edges);
    polygon([[-43, -37], [-20, -52], [25, -48], [44, -29], [28, 35], [0, 51], [-30, 31]], armor, edges);
    polygon([[3, -49], [44, -29], [28, 35], [0, 51]], '#2d4032', edges);
    polygon([[-43, -34], [-61, -47], [-80, -19], [-47, -5]], '#4b5942', edges);
    polygon([[40, -35], [66, -46], [79, -15], [46, -4]], '#394b38', edges);
    polygon([[-17, -58], [-22, -88], [-7, -80], [0, -105], [10, -79], [26, -91], [19, -57], [1, -47]], '#3e503b', edges);
    line([[-9, -68], [1, -63], [11, -68]], core, 2);
    // Right/left refer to screen sides, preserving the original right-side sword.
    // Each arm winds up and swings independently, including alternating combos.
    for (const hand of ['left', 'right']) {
      const side = hand === 'right' ? 1 : -1;
      const preparing = motionHit?.hand === hand || motionHit?.guard === 'both';
      const striking = !ranged && (lastImpact?.hand === hand || lastImpact?.guard === 'both');
      let lift = preparing ? anticipation : 0;
      const type = striking ? lastImpact.type : preparing ? motionHit.type : 'cleave';
      const stabbing = ['thrust', 'rush', 'retreat', 'recoil'].includes(type);
      const sweeping = ['sweep', 'spin', 'low-sweep', 'flurry'].includes(type);
      // The mechanical feint ratchets in steps; its final attack remains smooth.
      if (type === 'recoil' && motionHit && now < motionHit.commitAt && !reducedMotion) lift = Math.floor(lift * 5) / 5;
      const cock = ranged ? .95 : type === 'drag' ? -.4 : stabbing ? .32 : sweeping ? .7 : 1.25;
      const arc = type === 'drag' ? -2.4 : stabbing ? .45 : sweeping ? 1.8 : 2.4;
      const extension = striking && stabbing ? Math.sin(strikeProgress * Math.PI) : 0;
      const rotation = striking ? -cock * (1 - strikeProgress) + Math.sin(strikeProgress * Math.PI) * arc : -lift * cock;
      const lit = lift > .2 || striking;
      const low = ['drag', 'wave', 'low-sweep'].includes(type) ? 22 * (striking ? 1 - strikeProgress : lift) : 0;
      ctx.save(); ctx.scale(side, 1); ctx.translate(63 - extension * 25, -18 + extension * 36 + low); ctx.rotate(-.18 + rotation);
      const signal = glowHit && (glowHit.guard === hand || glowHit.guard === 'both') ? (parryWindow ? '#fff0b4' : guardColors[hand]) : null;
      if (signal) { ctx.shadowColor = signal; ctx.shadowBlur = reducedMotion ? 0 : 15 * bossScale; }
      polygon([[-11, 0], [6, -5], [14, 47], [-1, 54], [-15, 32]], signal ? `${signal}88` : lit ? '#69734f' : '#445740', signal || (lit ? '#c9c49a' : edges));
      line([[8, 29], [27, 59]], '#75815b', 5);
      line([[12, 62], [40, 47]], lit ? '#e3d3a0' : '#8f9567', 4);
      polygon([[23, 55], [35, 49], [92, 156], [73, 150]], lit ? '#c4bc89' : '#777f60', '#c7c49a66');
      polygon([[35, 49], [92, 156], [79, 144]], signal || (lit ? '#f1dfad' : '#a3ac89'));
      if (type === 'drag' && preparing) {
        line([[73, 151], [85, 161], [90, 150], [102, 164]], '#eab87b99', 1.5);
      }
      ctx.restore();
    }
  }
  if (fury) {
    polygon([[0, -43], [7, -35], [0, -27], [-7, -35]], '#f3a58b');
  }
  if (!bossArtReady && ranged && motionHit && now < motionHit.launchAt) {
    for (const side of [-1, 1]) {
      if (motionHit.guard === 'both' || motionHit.hand === (side < 0 ? 'left' : 'right')) {
        const radius = 5 + anticipation * 14;
        const color = guardColors[side < 0 ? 'left' : 'right'];
        ellipse(side * 100, 12, radius * 1.5, radius * 1.5, `${color}35`, true);
        ellipse(side * 100, 12, radius, radius, color);
        ellipse(side * 100, 12, radius * .45, radius * .45, '#dcfff7', true);
      }
    }
  }

  // The concept's chest core sits above the image's waist anchor.
  if (bossArtReady) ctx.translate(0, -58);
  const aura = ctx.createRadialGradient(0, 0, 3, 0, 0, parryWindow ? 85 : 60);
  aura.addColorStop(0, `${core}40`); aura.addColorStop(1, `${core}00`);
  ctx.fillStyle = aura; ctx.fillRect(-90, -90, 180, 180);
  if (!bossArtReady) {
    polygon([[0, -23], [17, 0], [0, 23], [-17, 0]], '#182d25', '#a4a577');
    polygon([[0, -12], [8, 0], [0, 12], [-8, 0]], core);
  }
  if (parryWindow) {
    ctx.shadowColor = core; ctx.shadowBlur = 18;
    line([[-29, 0], [-18, 0]], core, 2); line([[18, 0], [29, 0]], core, 2);
    ctx.shadowBlur = 0;
  }
  if (showGuide && warning && hit?.launchAt == null) timingRing(delta, parryWindow);
  ctx.restore();

  // Small, readable player silhouette and parry pose.
  const attackProgress = Math.max(0, Math.min(1, (now - game.attackAt) / 520));
  const dash = reducedMotion ? 0 : Math.sin(attackProgress * Math.PI) * width * .12;
  const playerX = width * .3 + dash, playerY = height * .76 - dash * .7;
  const parrying = ['parry', 'perfect'].includes(flashKind) && now - flashAt < 350;
  const playerArtReady = characterArt.player.complete && characterArt.player.naturalWidth > 0;
  const playerGuardY = playerY - (playerArtReady ? 44 : 18) * scale;
  ellipse(width * .3, playerArtReady ? height * .76 + 39 * scale : height * .82, 30 * scale, 6 * scale, '#00000040', true);
  ctx.save(); ctx.translate(playerX, playerY); ctx.scale(scale, scale);
  if (playerArtReady) {
    ctx.save();
    const action = playerPoseAt(now, game.attackAt, parrying ? flashAt : -Infinity, flashKind === 'hurt' ? flashAt : -Infinity, reducedMotion);
    const idle = reducedMotion ? 0 : Math.sin(t * 2.1) * .035;
    ctx.translate(-action.recoil * 9, action.recoil * 4);
    ctx.rotate(-Math.sin(attackProgress * Math.PI) * (reducedMotion ? 0 : .12) + action.recoil * .12);
    const breath = reducedMotion ? 0 : Math.sin(t * 2.1) * .009;
    ctx.scale(1, 1 + breath);
    if (flashKind === 'hurt' && now - flashAt < 130) ctx.filter = 'brightness(1.4) sepia(.4)';
    drawArtRig(characterArt.player, playerRig, {
      left: { angle: action.sword - action.guard * 2.05 + idle, x: action.guard * 4, y: -action.guard, scaleY: 1 - action.guard * .12 },
      right: { angle: -action.guard * .65 - action.sword * .14 - idle, x: 0, y: 0, scaleY: 1 },
    });
    ctx.restore();
  } else {
    polygon([[-9, -27], [-19, 13], [-35, 33], [-9, 23], [6, 4], [6, -21]], '#a4ae99', '#c8ceaf88');
    polygon([[-9, -27], [-19, 13], [-35, 33], [-23, 1]], '#6e8271');
    line([[-7, 8], [-8, 39]], '#a0b4a3', 5); line([[2, 6], [13, 35]], '#718c7b', 5);
    polygon([[-13, -44], [-2, -49], [7, -39], [3, -29], [-9, -29]], '#c7ceaf', '#d8dbbf');
    line([[-2, -38], [7, -36]], '#415b4d', 2);
    line([[1, -22], [12, -9], [24, parrying ? -26 : -9]], '#b8c9af', 5);
    const swordTip = parrying ? [7, -76] : [54, -57];
    line([[19, parrying ? -20 : -6], swordTip], '#e4e3c6', 3);
    line([[17, parrying ? -32 : -19], [31, parrying ? -29 : -9]], '#c0b788', 2);
  }
  if (parrying) {
    ctx.beginPath(); ctx.arc(6, playerArtReady ? -44 : -17, 44, -1.5, .4); ctx.strokeStyle = '#e8d9a4'; ctx.lineWidth = 2; ctx.stroke();
  }
  if (playerArtReady && attackProgress > 0 && attackProgress < 1 && !reducedMotion) {
    ctx.globalAlpha = Math.sin(attackProgress * Math.PI);
    ctx.beginPath(); ctx.arc(0, -50, 65, -1.8, .3); ctx.strokeStyle = '#ead3a3'; ctx.lineWidth = 3; ctx.stroke();
  }
  ctx.restore();

  if (ranged && now >= poseHit.launchAt && !['parry', 'perfect'].includes(poseHit.result)) {
    // Keep the release position fixed while the arm recoils. Normalized points
    // also survive a viewport resize without pulling a projectile off screen.
    if (bossArtReady && !projectileOrigins.has(poseHit)) projectileOrigins.set(poseHit, bossHands);
    for (const side of [-1, 1]) {
      if (poseHit.guard === 'both' || poseHit.hand === (side < 0 ? 'left' : 'right')) {
        const source = projectileOrigins.get(poseHit)?.[side < 0 ? 'left' : 'right'];
        drawProjectile(poseHit, now, source ? [source[0] * width, source[1] * height] : [bossX + side * 100 * bossScale, bossY + 12 * bossScale], [playerX + side * 22 * scale, playerGuardY], side, scale);
      }
    }
  }
  if (showGuide && warning && hit?.launchAt != null) {
    ctx.save(); ctx.translate(playerX, playerGuardY); ctx.scale(scale, scale);
    timingRing(delta, parryWindow);
    ctx.restore();
  }

  if (lastImpact && lastImpact.launchAt == null && !reducedMotion) {
    const fade = 1 - (now - lastImpact.at) / 240;
    const side = lastImpact.hand === 'right' ? 1 : -1;
    ctx.globalAlpha = fade * .7;
    if (['sweep', 'spin', 'low-sweep', 'flurry'].includes(lastImpact.type)) {
      ctx.beginPath(); ctx.moveTo(bossX + side * 105 * bossScale, bossY + 20 * bossScale);
      ctx.quadraticCurveTo(bossX - side * 100 * bossScale, playerY - (lastImpact.type === 'low-sweep' ? -10 : 55) * scale, playerX, playerY);
      ctx.strokeStyle = '#ead3a3'; ctx.lineWidth = 3; ctx.stroke();
      if (lastImpact.type === 'spin') ellipse(bossX, bossY + 50 * bossScale, 125 * bossScale, 26 * bossScale, '#c5c58d');
    } else if (lastImpact.type === 'drag') {
      line([[bossX + side * 70 * bossScale, bossY + 150 * bossScale], [playerX, playerY - 50 * scale]], '#f1d3a1', 4);
    } else if (lastImpact.type === 'fury') {
      for (const direction of [-1, 1]) line([[bossX + direction * 65 * bossScale, bossY - 70 * bossScale], [playerX - direction * 15 * scale, playerY + 20 * scale]], '#efb095', 4);
    } else if (lastImpact.type !== 'wave') {
      const thrust = ['thrust', 'rush', 'retreat', 'recoil'].includes(lastImpact.type);
      line([[bossX + side * 80 * bossScale, bossY + (thrust ? 25 : -50) * bossScale], [playerX - side * 20 * scale, playerY + 15 * scale]], '#ead3a3', thrust ? 2 : 3);
      if (!thrust) line([[bossX + side * 94 * bossScale, bossY - 52 * bossScale], [playerX - side * 4 * scale, playerY + 19 * scale]], '#be906255', 9);
    }
    ctx.globalAlpha = 1;
  }
  for (let i = 0; i < 24; i++) {
    const x = ((Math.sin(i * 31.7) * .5 + .5) * width + t * (i % 3 + 1) * 2) % width;
    const y = ((Math.cos(i * 7.3) * .5 + .5) * height - t * (i % 4 + 1) * 3 % height + height) % height;
    ctx.fillStyle = `rgba(190,193,139,${.1 + Math.sin(t + i) * .07})`;
    ctx.fillRect(x, y, i % 3 === 0 ? 2 : 1, 2);
  }
  particles = particles.filter(p => now - p.birth < 650);
  for (const p of particles) {
    const age = (now - p.birth) / 1000;
    ctx.globalAlpha = Math.max(0, 1 - age / .65);
    ctx.fillStyle = p.kind === 'hurt' ? '#eb9a77' : '#e0d4a4';
    ctx.fillRect(p.x + p.vx * age, p.y + p.vy * age + 100 * age * age, 2, 2);
  }
  ctx.globalAlpha = 1;
  if (now - flashAt < 140 && flashKind === 'hurt') {
    ctx.fillStyle = `rgba(173,65,38,${(1 - (now - flashAt) / 140) * .14})`; ctx.fillRect(0, 0, width, height);
  }
  if (game.state === 'boss' && !paused) {
    const remaining = game.sequence.filter(h => !h.resolved).length;
    const rangedCaption = hit?.launchAt != null && windup ? now < hit.launchAt ? `${hit.name} 충전 · 도착할 때 패링` : `${hit.name} 접근 · 도착할 때 패링` : '';
    $('timing-caption').textContent = parryWindow ? '지금, 패링!' : rangedCaption || (warning ? `${hit.name} · 빛나는 무기를 보세요` : windup && remaining ? '빛나는 팔과 무기를 읽고 기다리세요' : remaining ? '보스가 공격을 준비합니다' : '공격을 막아냈다면, 다음 빈틈을 노리세요');
    $('timing-caption').style.color = parryWindow ? '#f6dfa1' : hit?.launchAt != null ? '#a5dfff' : hit?.type === 'fury' ? '#edb098' : '#b3c0a7';
  } else {
    $('timing-caption').textContent = game.state === 'player' ? '빈틈입니다. 공격하세요.' : '';
    $('timing-caption').style.color = '#b3c0a7';
  }
}

function frame(realTime) {
  // A long foreground stall must not silently skip a telegraph and deal unavoidable damage.
  if (realTime - lastFrame > 300 && running() && !paused) {
    origin += realTime - lastFrame;
    togglePause();
  }
  lastFrame = realTime;
  const now = clock();
  if (!paused) {
    game.update(now);
    if (game.events.length) processEvents();
    if (game.state === 'boss') {
      const hit = game.nextHit();
      if (hit && hit.at - now < TELEGRAPH_MS && !cueSeen.has(hit)) {
        cueSeen.add(hit); tone(310, .08, 'sine', .025, 440);
      }
      for (const strike of game.sequence) {
        if (strike.launchAt != null && now >= strike.launchAt && !launchSeen.has(strike)) {
          launchSeen.add(strike); tone(440, .18, 'sine', .04, 700);
        }
        if (now >= strike.at && !impactSeen.has(strike)) {
          impactSeen.add(strike);
          if (strike.result !== 'perfect' && strike.result !== 'parry') tone(120, .14, 'triangle', .07, 50);
        }
      }
    }
  }
  drawScene(now);
  $('feedback').classList.toggle('visible', now < feedbackUntil && $('overlay').hidden);
  $('phase-toast').classList.toggle('visible', now < phaseUntil && $('overlay').hidden);
  $('arena').classList.toggle('parried', ['parry', 'perfect'].includes(flashKind) && now - flashAt < 250);
  for (const button of Object.values(parryButtons)) button.querySelector('.cooldown-fill').style.width = `${Math.max(0, 1 - (now - game.lastTap) / COOLDOWN) * 100}%`;
  requestAnimationFrame(frame);
}

resize(); renderBest(); updateUI(); requestAnimationFrame(frame);
