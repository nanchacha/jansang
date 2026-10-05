import { Combat, MODES, COOLDOWN, ITEM_USE_MS, TELEGRAPH_MS, WEAKEN_ATTACKS, WEAKEN_MULTIPLIER } from './combat.mjs';
import { Expedition, NODE_TYPES, RELICS, TRAINING, ROUTES, XP_REWARDS, ACTIVE_ROUTE_COLUMNS } from './expedition.mjs';
import { motionAt, specialIntensityAt, dodgeMotionAt, houndRigPoseAt, HOUND_RECOVERY_MS, bellRigPoseAt, BELL_RECOVERY_MS } from './motion.mjs';
import { Fighters3D } from './fighters3d.mjs';
import { CombatAudio } from './audio.mjs';

const $ = id => document.getElementById(id);
const canvas = $('scene');
const ctx = canvas.getContext('2d');
let game = new Combat({ species: 'hound' });
let expedition = new Expedition();
let expeditionBattle = false;
let paused = false;
let pausedAt = 0;
let origin = performance.now();
let lastFrame = performance.now();
let width = 800, height = 550, hudBottom = 110;
let feedbackUntil = 0, flashAt = -Infinity, flashKind = '', phaseUntil = 0;
let showGuide = true, sound = true;
const audio = new CombatAudio();
let best = null;
let particles = [];
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const swingSeen = new WeakSet();
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
const running = () => ['player', 'boss', 'counter'].includes(game.state);
const isHound = () => game.species === 'hound';
const timeString = ms => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;
const activeModes = [...document.querySelectorAll('[data-mode]')];
const parryButtons = { left: $('parry-left'), right: $('parry-right') };
const heldInputs = new Map();
const guardColors = { left: '#88dcf2', right: '#f2ad8e' };

let fighters;
try { fighters = new Fighters3D(); } catch { /* Basic rendering remains playable without WebGL2. */ }
canvas.dataset.renderer = fighters ? 'webgl2' : 'fallback';

function resize() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  width = bounds.width; height = bounds.height;
  hudBottom = document.querySelector('.boss-hud').getBoundingClientRect().bottom - bounds.top;
  $('special-warning').style.top = `${hudBottom + 13}px`;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
new ResizeObserver(resize).observe(canvas);

function unlockAudio() {
  if (sound && !paused) audio.unlock();
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
      case 'start': feedback('YOUR TURN', '공격하거나 아이템을 선택하세요', '', 1500); break;
      case 'attack': feedbackUntil = 0; audio.play('attack', .55); burst('attack'); break;
      case 'counter':
        feedback('PERFECT COUNTER', `${event.strikes}타 모두 퍼펙트 · 반격 피해 ${event.damage}`, 'counter', 1200);
        audio.play('attack', .72); burst('attack');
        break;
      case 'heal': feedback(`HP +${event.amount}`, `회복약 사용 · 남은 수량 ${game.potions}개`, 'heal', ITEM_USE_MS); break;
      case 'dodge':
        feedback('회피', `${(game.dodgeDuration() / 1000).toFixed(2)}초 무적`, 'dodge', game.dodgeDuration());
        audio.play('swing', .18, .8);
        break;
      case 'evade': feedback('DODGE', '회피 성공 · 피해 0', 'dodge', 750); break;
      case 'perfect':
      case 'parry': {
        const perfect = event.type === 'perfect';
        feedback(perfect ? 'PERFECT' : 'PARRY', `피해 0${showGuide ? ` · ${event.offset > 0 ? '+' : ''}${event.offset} ms` : ''}`, '', 750);
        audio.play(perfect ? 'perfect' : 'parry', .72);
        burst(event.type);
        if (navigator.vibrate) navigator.vibrate(perfect ? [12, 25, 12] : 12);
        break;
      }
      case 'early': feedback('TOO EARLY', '타격 순간까지 기다리세요', 'early', 500); break;
      case 'late': feedback('TOO LATE', '조금 더 일찍 탭해 보세요', 'hurt', 700); break;
      case 'wrong': feedback('방향 확인', '빛나는 팔과 무기 쪽을 막아보세요', 'early', 650); break;
      case 'weaken':
        feedback('쇠약', `체력 피해 없음 · 다음 공격 ${WEAKEN_ATTACKS}회 피해 −${(1 - WEAKEN_MULTIPLIER) * 100}%`, 'weaken', 1600);
        break;
      case 'hurt':
        feedback(event.attackDamage > 1 ? 'CRITICAL HIT' : 'HIT', game.mode === 'practice' ? `연습 모드 · 실제 전투에서는 생명력 −${event.attackDamage}` : `타이밍을 놓쳤습니다 · 생명력 −${event.damage}`, 'hurt');
        audio.play('hurt', event.attackDamage > 1 ? .72 : .6, event.attackDamage > 1 ? .82 : 1); burst('hurt');
        $('arena').classList.remove('hit'); void $('arena').offsetWidth; $('arena').classList.add('hit');
        if (navigator.vibrate) navigator.vibrate(40);
        break;
      case 'phase': phaseUntil = clock() + 1900; break;
      case 'turn': if (!event.counter) feedback('YOUR TURN', '공격하거나 회복할 수 있습니다.', '', 1100); break;
      case 'won':
      case 'lost': finish(event.type === 'won'); break;
    }
  }
  updateUI();
}

function updateUI() {
  $('boss-health').innerHTML = `${game.bossHp} <small>/ ${game.bossMaxHp}</small>`;
  $('boss-fill').style.width = `${game.bossHp / game.bossMaxHp * 100}%`;
  document.querySelector('.boss-health-track').setAttribute('aria-valuenow', game.bossHp);
  document.querySelector('.boss-health-track').setAttribute('aria-valuemax', game.bossMaxHp);
  $('enemy-name').textContent = { hound: '재의 사냥개', bell: '종을 짊어진 집행자', warden: '공허의 파수꾼' }[game.species];
  $('enemy-label').textContent = expeditionBattle ? `지점 ${expedition.node.floor} / ${NODE_TYPES[game.enemy].name}` : { hound: 'ASH HOUND / COMBAT STUDY', bell: 'BELL EXECUTIONER / COMBAT STUDY', warden: 'BOSS 01 / THE HOLLOW WARDEN' }[game.species];
  const navigationLocked = running() || !$('death-screen').hidden;
  $('show-map').disabled = navigationLocked;
  $('show-solo').disabled = navigationLocked;
  $('solo-settings').hidden = expeditionBattle;
  $('phase').textContent = `PHASE 0${game.phase}`;
  $('phase').classList.toggle('enraged', game.phase === 2);
  $('hp-text').textContent = game.mode === 'practice' ? '∞' : `${game.hp} / ${game.maxHp}`;
  if ($('health-pips').children.length !== game.maxHp) {
    $('health-pips').innerHTML = '<i></i>'.repeat(game.maxHp);
    $('arena-life').innerHTML = '<i></i>'.repeat(game.maxHp) + '<b></b>';
  }
  $('health-pips').setAttribute('aria-label', game.mode === 'practice' ? '연습 모드 무제한 생명력' : `생명력 ${game.hp}/${game.maxHp}`);
  [...$('health-pips').children].forEach((pip, i) => pip.classList.toggle('empty', i >= game.hp));
  $('arena-life').setAttribute('aria-label', $('health-pips').getAttribute('aria-label'));
  [...$('arena-life').querySelectorAll('i')].forEach((pip, i) => pip.classList.toggle('empty', i >= game.hp));
  $('arena-life').querySelector('b').textContent = game.mode === 'practice' ? '∞' : `${game.hp} / ${game.maxHp}`;
  $('parry-count').textContent = String(game.parries).padStart(2, '0');
  $('perfect-count').textContent = String(game.perfects).padStart(2, '0');
  $('hit-count').textContent = String(game.hits).padStart(2, '0');
  $('nohit-status').classList.toggle('broken', game.hits > 0);
  $('nohit-label').textContent = game.mode === 'practice' ? '연습 중' : game.hits > 0 ? '다음 도전에' : game.state === 'won' ? '달성!' : game.state === 'ready' ? '도전 준비' : '진행 중';
  $('round-label').textContent = `ROUND ${game.round ? String(game.round).padStart(2, '0') : '—'}`;
  const playerTurn = game.state === 'player';
  const bossTurn = game.state === 'boss';
  $('turn-tag').classList.toggle('boss', bossTurn);
  $('turn-tag').innerHTML = `<i></i> ${paused ? '일시 정지' : playerTurn ? '당신의 차례' : bossTurn ? '보스의 차례' : game.state === 'counter' ? '퍼펙트 반격' : game.state === 'won' ? '전투 승리' : game.state === 'lost' ? '전투 종료' : '전투 대기'}`;
  $('attack').disabled = !playerTurn || paused;
  $('items').disabled = !playerTurn || paused;
  $('item-hint').textContent = `회복약 ×${game.potions}`;
  $('potion-stock').textContent = `${game.potions}개`;
  $('potion-effect').textContent = `생명력 +${game.healAmount} · 최대 ${game.maxHp}칸`;
  const potionReason = game.mode === 'practice' ? '연습 모드는 생명력이 무제한입니다.'
    : game.potions === 0 ? '남은 회복약이 없습니다.'
      : game.hp >= game.maxHp ? '체력이 가득 차 있습니다.' : '';
  $('use-potion').disabled = !playerTurn || paused || Boolean(potionReason);
  $('potion-reason').textContent = potionReason || `지금 사용하면 ${Math.min(game.maxHp, game.hp + game.healAmount)} / ${game.maxHp}로 회복합니다. 피격 기록은 유지됩니다.`;
  Object.values(parryButtons).forEach(button => { button.disabled = !bossTurn || paused; });
  $('dodge').disabled = !bossTurn || paused;
  $('attack-hint').textContent = playerTurn ? `피해 ${game.nextAttackDamage()}${game.weakenedAttacks ? ' · 쇠약' : ''}` : '내 차례';
  $('attack').classList.toggle('weakened', game.weakenedAttacks > 0);
  $('weaken-status').hidden = game.weakenedAttacks === 0;
  $('weaken-status').textContent = game.weakenedAttacks ? `쇠약 · 피해 −${(1 - WEAKEN_MULTIPLIER) * 100}% · 공격·반격 ${game.weakenedAttacks}회 남음` : '';
  $('pause').disabled = !running();
  activeModes.forEach(button => { button.disabled = running() || !$('death-screen').hidden; });
  $('practice-attack-label').hidden = game.mode !== 'practice';
  $('practice-attack').disabled = running() || !$('death-screen').hidden;
  $('enemy-design').disabled = navigationLocked;
  $('dodge-rule').textContent = `회피: 닿기 직전에 탭 · ${(game.dodgeDuration() / 1000).toFixed(2)}초 무적 · 방향 무관`;
  const perfectHits = game.sequence.filter(hit => hit.result === 'perfect').length;
  const counterFailed = game.sequence.some(hit => hit.result && hit.result !== 'perfect');
  $('counter-rule').textContent = `한 턴 모두 PERFECT → 자동 반격 ${game.counterDamage()} 피해${bossTurn ? counterFailed ? ' · 이번 턴 조건 실패' : ` · ${perfectHits}/${game.sequence.length}` : ''}`;
  updateDefenseCooldown(clock());
}

function updateDefenseCooldown(now) {
  const remaining = game.state === 'boss' ? game.cooldownRemaining(now) : 0;
  for (const [side, button] of Object.entries({ ...parryButtons, dodge: $('dodge') })) {
    // Keep pointer capture / key releases alive. Combat enforces the lock;
    // the second finger may still complete an already-started 80ms chord.
    const joiningChord = side !== 'dodge' && game.pending && game.pending.side !== side && game.held.has(game.pending.side);
    const cooling = remaining > 0 && !joiningChord;
    button.classList.toggle('cooling', cooling);
    button.setAttribute('aria-disabled', String(button.disabled || cooling));
    const hint = joiningChord ? '동시 입력 가능' : side === 'dodge' && game.isDodgingAt(now) ? '무적 상태' : cooling ? `대기 ${(Math.ceil(remaining / 100) / 10).toFixed(1)}초` : side === 'dodge' ? '방향 없이 피하기' : `${side === 'left' ? '왼쪽' : '오른쪽'} 공격 방어`;
    const label = button.querySelector('small');
    if (label.textContent !== hint) label.textContent = hint;
    button.querySelector('.cooldown-fill').style.width = `${remaining / COOLDOWN * 100}%`;
  }
}

function start() {
  if (!$('death-screen').hidden) return;
  if (expeditionBattle && ['won', 'lost'].includes(game.state)) { showMap(); return; }
  if (paused) { togglePause(); return; }
  clearParryInputs();
  audio.stop();
  unlockAudio();
  origin = performance.now(); lastFrame = origin;
  game.start();
  $('battle-xp').hidden = true;
  particles = []; phaseUntil = 0; flashAt = -Infinity;
  $('overlay').hidden = true;
  $('arena').classList.remove('hit');
  processEvents();
}

function act(kind) {
  if (!running() || paused || $('item-dialog').open) return;
  unlockAudio();
  const now = clock();
  if (kind === 'attack') game.attack(now);
  else if ((kind === 'dodge' ? game.dodge(now) : game.tap(now, kind)) === 'cooldown') {
    const remaining = game.cooldownRemaining(now);
    feedback('재사용 대기', `${(Math.ceil(remaining / 100) / 10).toFixed(1)}초 후 패링·회피 가능`, 'early', remaining);
  }
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
    $('item-dialog').close();
    $('overlay-eyebrow').textContent = 'TAKE A BREATH';
    $('overlay-title').innerHTML = '잠깐의 <em>쉼표.</em>';
    $('overlay-copy').innerHTML = '준비되면, 멈췄던 순간부터 이어갑니다.';
    $('overlay-foot').textContent = '화면을 벗어나면 전투가 자동으로 멈춥니다';
    $('result-stats').hidden = true;
    $('battle-xp').hidden = true;
    $('intro-emblem').textContent = 'Ⅱ';
    $('start').innerHTML = '전투 계속 <svg><use href="#i-arrow"/></svg>';
    $('overlay').hidden = false;
    $('pause').setAttribute('aria-label', '전투 계속');
    audio.pause();
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
  if (expeditionBattle) expedition.settleBattle();
  const nohit = won && game.hits === 0 && game.mode === 'challenge';
  $('intro-emblem').textContent = nohit ? '◈' : won ? '◇' : '↻';
  $('overlay-eyebrow').textContent = nohit ? 'A FLAWLESS VICTORY' : won ? 'WARDEN DEFEATED' : 'EVERY ATTEMPT COUNTS';
  $('overlay-title').innerHTML = nohit ? '완벽한 <em>잔상.</em>' : won ? '순간을 <em>지배하다.</em>' : '다시, <em>한 번.</em>';
  $('overlay-copy').innerHTML = nohit ? '한 대도 맞지 않았습니다.<br>모든 순간이 당신의 것이었습니다.' : won ? '공허의 파수꾼을 쓰러뜨렸습니다.<br>다음 목표는 한 대도 맞지 않는 승리.' : '패턴은 달라져도, 빈틈은 있습니다.<br>다음에는 조금 더 정확하게.';
  $('result-stats').innerHTML = `<div><span>전투 시간</span><b>${timeString(game.elapsed)}</b></div><div><span>퍼펙트</span><b>${game.perfects}</b></div><div><span>피격</span><b>${game.hits}</b></div><div><span>회복약 사용</span><b>${game.potionsUsed}회</b></div>`;
  $('result-stats').hidden = false;
  $('battle-xp').hidden = !expeditionBattle || !won;
  if (expeditionBattle && won) $('battle-xp').textContent = `+${expedition.lastXpGain} XP 획득 · 보유 ${expedition.xp} XP`;
  $('start').innerHTML = '다시 도전 <svg><use href="#i-retry"/></svg>';
  $('overlay-foot').textContent = game.mode === 'practice' ? '연습 모드 · 최고 기록에 포함되지 않습니다' : '새로운 공격 조합이 기다립니다';
  if (expeditionBattle) {
    $('start').innerHTML = `${expedition.state === 'reward' ? '희귀 보상 선택' : ['won', 'lost'].includes(expedition.state) ? '원정 결과' : '지도로 돌아가기'} <svg><use href="#i-arrow"/></svg>`;
    $('overlay-copy').textContent = won ? `${$('enemy-name').textContent}을 쓰러뜨렸습니다. 남은 체력과 아이템을 가지고 다음 길로 향하세요.` : '이번 원정의 끝입니다. 지나온 길과 기록을 확인하세요.';
    $('overlay-foot').textContent = `원정 누적 피격 ${expedition.stats.hits}회 · 남은 회복약 ${expedition.potions}개`;
  }
  $('overlay').hidden = !won;
  if (won) {
    if (!expeditionBattle && game.mode === 'challenge' && (!best || game.hits < best.hits || (game.hits === best.hits && game.elapsed < best.time))) {
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

const nodeX = node => node.type === 'boss' ? 320 : 640 * (ACTIVE_ROUTE_COLUMNS.indexOf(node.column) + .5) / ACTIVE_ROUTE_COLUMNS.length;
const nodeY = node => 76 + (10 - node.floor) * 110;

function locateNode() {
  const target = expedition.nodes.find(n => n.id === expedition.available()[0]) || expedition.node || expedition.nodes[0];
  $('map-scroll').scrollTop = nodeY(target) - $('map-scroll').clientHeight * .6;
}

function focusRoute() {
  locateNode();
  $('expedition-status').scrollIntoView({ block: 'start' });
  $('map-canvas').querySelector('.reachable')?.focus({ preventScroll: true });
}

function showMap() {
  if (running() || !$('death-screen').hidden) return;
  audio.stop();
  $('battle-view').hidden = true;
  $('expedition-view').hidden = false;
  $('show-map').setAttribute('aria-pressed', 'true');
  $('show-solo').setAttribute('aria-pressed', 'false');
  renderExpedition();
  locateNode();
  if (expedition.state !== 'map') $('journey-card').focus();
  else focusRoute();
}

function renderExpedition() {
  const run = expedition, available = run.available(), future = run.futureNodes();
  $('expedition-floor').textContent = String(run.node?.floor || 0).padStart(2, '0');
  $('expedition-status').innerHTML = `<div><span>생명력</span><b>${run.hp} <small>/ ${run.maxHp}</small></b></div><div><span>공격력</span><b>${run.profile.attackDamage} <small>${run.weapon + run.training.power}회 강화</small></b></div><div><span>회복약</span><b>${run.potions} <small>개</small></b></div><div><span>누적 피격</span><b>${run.stats.hits} <small>회</small></b></div>`;
  $('xp-balance').textContent = run.xp;
  const canUpgrade = Object.keys(TRAINING).some(id => run.canTrain(id));
  $('training-panel').classList.toggle('has-upgrade', canUpgrade);
  $('training-ready').textContent = canUpgrade ? '강화 가능' : '경험치로 능력 성장';
  $('training-feedback').textContent = '';
  $('training-options').innerHTML = Object.entries(TRAINING).map(([id, option]) => {
    const cost = run.trainingCost(id);
    const capped = cost === null;
    const effect = id === 'power' ? `공격력 ${run.profile.attackDamage} → ${run.profile.attackDamage + 1}` : `최대 체력 ${run.maxHp} → ${run.maxHp + 1} · 현재 체력 +1`;
    const status = capped ? '최대 강화' : ['won', 'lost'].includes(run.state) ? '원정 종료' : run.state !== 'map' ? '다음 길 선택 시 강화 가능' : run.xp < cost ? `${cost - run.xp} XP 부족` : '강화하기';
    return `<button class="training-option" data-training="${id}" ${run.canTrain(id) ? '' : 'disabled'}><span class="training-icon" aria-hidden="true">${option.icon}︎</span><span><b>${option.name} <small>${run.training[id]} / ${option.costs.length}</small></b><span>${capped ? '최대치에 도달했습니다' : effect}</span><small>${status}</small></span><strong>${capped ? 'MAX' : `${cost} XP`}</strong></button>`;
  }).join('');
  const routes = ROUTES.map((route, column) => ({ ...route, column })).filter(route => ACTIVE_ROUTE_COLUMNS.includes(route.column));
  for (const id of ['route-cards', 'map-route-headings']) $(id).classList.toggle('single-route', routes.length === 1);
  $('route-cards').innerHTML = routes.map(route => {
    const { column } = route;
    const nodes = run.nodes.filter(n => n.column === column || n.type === 'boss');
    const count = type => nodes.filter(n => n.type === type).length;
    const battles = nodes.filter(n => XP_REWARDS[n.type]).length;
    const xp = nodes.reduce((sum, n) => sum + (XP_REWARDS[n.type] || 0), 0);
    return `<article class="route-card route-${column}"><h3><span aria-hidden="true">0${column + 1}</span>${route.name}</h3><p>${route.description}</p><b>전투 ${battles} · 정예 ${count('elite')} 포함</b><span>휴식 ${count('rest')} · 보물 ${count('treasure')}</span><strong>${xp} XP · 희귀 보상 ${count('elite')}회</strong></article>`;
  }).join('');
  $('map-route-headings').innerHTML = routes.map(route => `<span class="route-${route.column}">${route.name}</span>`).join('');
  const edges = run.nodes.flatMap(node => node.next.map(id => {
    const next = run.nodes.find(n => n.id === id);
    const travelled = run.visited.includes(node.id) && (run.visited.includes(id) || id === run.current);
    const open = node.id === run.current && available.includes(id);
    const locked = !future.has(node.id) || !future.has(id);
    return `<path class="${travelled ? 'travelled' : open ? 'open' : locked ? 'locked' : ''}" d="M${nodeX(node)},${nodeY(node)} L${nodeX(next)},${nodeY(next)}"/>`;
  })).join('');
  $('map-canvas').innerHTML = `<svg class="map-paths" viewBox="0 0 640 1150" preserveAspectRatio="none" aria-hidden="true">${edges}</svg><div class="map-destination">THE HOLLOW WARDEN</div>` + [...run.nodes].reverse().map(node => {
    const type = NODE_TYPES[node.type], visited = run.visited.includes(node.id), current = node.id === run.current, reachable = available.includes(node.id);
    const locked = !visited && !future.has(node.id), route = ROUTES[node.column];
    const label = current ? '현재 위치' : visited ? '방문 완료' : locked ? '선택한 경로에서 접근 불가' : reachable ? '이동 가능' : '이후 경로';
    const fork = node.next.length > 1 ? ' · 갈림길' : '';
    return `<button class="map-node ${node.type} ${visited ? 'visited' : ''} ${reachable ? 'reachable' : ''} ${current ? 'current' : ''} ${locked ? 'locked' : ''}" data-node="${node.id}" style="left:${nodeX(node) / 6.4}%;top:${nodeY(node)}px" ${reachable ? '' : 'disabled'} ${current ? 'aria-current="step"' : ''} aria-label="${node.floor}층 ${route?.name || '최종 합류'} ${type.name}, ${label}${fork}"><span class="node-ring" aria-hidden="true">${visited ? '✓' : type.icon + '︎'}</span><b>${type.name}</b><small>${current ? '현재 위치' : reachable ? node.floor === 1 ? '여기서 출발' : '이동하기' : `${String(node.floor).padStart(2, '0')} 지점`}${fork}</small></button>`;
  }).join('') + '<div class="map-origin">출발 · 당신의 길을 선택하세요</div>';
  $('map-legend').innerHTML = Object.entries(NODE_TYPES).map(([id, type]) => `<span class="${id}"><i aria-hidden="true">${type.icon}︎</i>${type.name}</span>`).join('');
  $('expedition-relics').innerHTML = run.relics.length ? run.relics.map(item => `<div class="owned-relic"><i aria-hidden="true">${RELICS[item.id].icon}︎</i><div><b>${item.rare ? '희귀 · ' : ''}${RELICS[item.id].name}</b><p>${RELICS[item.id].describe(item.rare)}</p></div></div>`).join('') : '<p class="empty-relics">아직 가져온 유물이 없습니다.<br>보물상자와 정예 전투에서 발견하세요.</p>';
  const card = $('journey-card');
  const choice = (id, icon, title, copy, disabled = false) => `<button class="journey-choice" data-choice="${id}" ${disabled ? 'disabled' : ''}><i aria-hidden="true">${icon}︎</i><span><b>${title}</b><small>${copy}</small></span><span aria-hidden="true">↗</span></button>`;
  if (run.state === 'rest') {
    card.innerHTML = `<span class="overline">A MOMENT OF RESPITE</span><h2>꺼지지 않은 불씨</h2><p>잠시 숨을 고르세요.<br>이번 휴식에서 한 가지만 선택할 수 있습니다.</p><div class="journey-choices">${choice('heal', '✚', '상처 돌보기', run.hp === run.maxHp ? '생명력이 이미 가득 찼습니다' : `생명력 +2 · ${run.hp} → ${Math.min(run.maxHp, run.hp + 2)}`, run.hp === run.maxHp)}${choice('weapon', '⚔', '무기 벼리기', run.weapon >= 2 ? '최대 강화에 도달했습니다' : `공격력 +1 · ${run.profile.attackDamage} → ${run.profile.attackDamage + 1}`, run.weapon >= 2)}${choice('vitality', '◇', '생명력 단련', run.maxHp >= 7 ? '최대 생명력에 도달했습니다' : `최대 생명력 ${run.maxHp} → ${run.maxHp + 1} · 현재 체력 +1`, run.maxHp >= 7)}</div><button class="journey-skip" data-choice="leave">선택 없이 떠나기</button>`;
  } else if (run.state === 'reward') {
    const rare = run.offers[0]?.rare;
    card.innerHTML = `<span class="overline">${rare ? 'ELITE REWARD' : 'A FORGOTTEN TREASURE'}</span><h2>${rare ? '강적이 남긴 유산' : '잊힌 자의 보물'}</h2><p>${rare ? '정예를 꺾은 대가로 더 강한 보상을 얻습니다.' : '길을 지켜온 유물이 당신을 기다립니다.'}<br>보상 하나를 선택하세요.</p><div class="journey-choices">${run.offers.map(item => choice(item.id, RELICS[item.id].icon, `${item.rare ? '희귀 · ' : ''}${RELICS[item.id].name}`, RELICS[item.id].describe(item.rare))).join('')}</div><span class="choice-foot">유물은 이번 원정이 끝날 때까지 적용됩니다.</span>`;
  } else if (['won', 'lost'].includes(run.state)) {
    const won = run.state === 'won';
    card.innerHTML = `<span class="overline">${won && run.stats.hits === 0 ? 'A FLAWLESS EXPEDITION' : won ? 'EXPEDITION COMPLETE' : 'THE JOURNEY ENDS'}</span><h2>${won ? '공허를 넘어서' : '다음 길은 다를 거예요'}</h2><p>${won ? run.stats.hits === 0 ? '전 원정 무피격 달성. 모든 순간을 막아냈습니다.' : '공허의 파수꾼을 쓰러뜨리고 원정을 완주했습니다.' : `${run.node.floor}번째 지점에서 쓰러졌습니다. 새 원정에서는 경험치와 강화가 초기화됩니다.`}</p><dl class="journey-results"><div><dt>완료한 지점</dt><dd>${run.visited.length} / 10</dd></div><div><dt>승리한 전투</dt><dd>${run.stats.battles}회</dd></div><div><dt>전투 시간</dt><dd>${timeString(run.stats.elapsed)}</dd></div><div><dt>피격 / 퍼펙트</dt><dd>${run.stats.hits} / ${run.stats.perfects}</dd></div><div><dt>회복약 사용</dt><dd>${run.stats.potionsUsed}회</dd></div><div><dt>획득 경험치 / 남은 경험치</dt><dd>${run.stats.xpEarned} / ${run.xp} XP</dd></div></dl><button class="new-expedition" data-new-run>새로운 원정 시작 <span>↗</span></button>`;
  } else {
    const direction = !run.current ? routes.length === 1 ? `${routes[0].name}에서 원정을 시작하세요. 빛나는 출발점을 눌러 이동합니다.` : '출발점 중 하나를 선택하세요. 위의 경로 안내에서 위험과 보상을 비교할 수 있습니다.' : available.length > 1 ? '갈림길입니다. 직진하거나 연결된 옆길로 이동하세요. 옮겨간 뒤에는 원래 길로 돌아올 수 없습니다.' : '외길 구간입니다. 빛나는 다음 지점으로만 이동할 수 있습니다.';
    card.innerHTML = `<span class="overline">CHOOSE YOUR NEXT STEP</span><h2>${run.current ? ROUTES[run.node.column]?.name || '다음 길을 고르세요' : routes.length === 1 ? routes[0].name : '당신의 길을 선택하세요'}</h2><p>${direction}</p><ol class="journey-rules"><li><b>전투</b><span>빛나는 팔과 무기를 읽고 방향에 맞춰 패링하세요.</span></li><li><b>휴식</b><span>회복, 무기 강화, 생명력 단련 중 하나를 선택하세요.</span></li><li><b>보물</b><span>유물과 회복약으로 마지막 전투를 준비하세요.</span></li></ol><div class="route-tip">${run.current ? routes.length === 1 ? '길을 따라 마지막 지점의 보스에게 도전하세요.' : '흐릿해진 지점은 선택한 경로에서 접근할 수 없습니다.' : '시련의 길은 휴식이 없는 대신, 정예 승리 보상 3회를 보장합니다.'}</div>`;
  }
}

$('map-canvas').addEventListener('click', event => {
  const id = event.target.closest('[data-node]')?.dataset.node;
  if (!id || !expedition.enter(id)) return;
  $('route-guide').open = false;
  if (expedition.state === 'battle') {
    game = expedition.battle;
    expeditionBattle = true;
    $('expedition-view').hidden = true;
    $('battle-view').hidden = false;
    resize(); start();
    $('arena').scrollIntoView({ block: 'start' });
    $('attack').focus({ preventScroll: true });
  } else {
    renderExpedition();
    $('journey-card').focus();
  }
});
$('journey-card').addEventListener('click', event => {
  if (event.target.closest('[data-new-run]')) {
    expedition = new Expedition(); renderExpedition(); focusRoute();
    return;
  }
  const id = event.target.closest('[data-choice]')?.dataset.choice;
  if (!id) return;
  const changed = expedition.state === 'rest' ? expedition.rest(id) : expedition.claim(id);
  if (changed) { renderExpedition(); focusRoute(); }
});
$('training-options').addEventListener('click', event => {
  const id = event.target.closest('[data-training]')?.dataset.training;
  if (!id || !expedition.train(id)) return;
  renderExpedition();
  $('training-feedback').textContent = `${TRAINING[id].name} 완료 · ${id === 'power' ? `공격력 ${expedition.profile.attackDamage}` : `생명력 ${expedition.hp} / ${expedition.maxHp}`} · 남은 ${expedition.xp} XP`;
  const button = $('training-options').querySelector(`[data-training="${id}"]`);
  (button.disabled ? $('training-toggle') : button).focus({ preventScroll: true });
});
$('locate-node').addEventListener('click', locateNode);
$('show-map').addEventListener('click', showMap);
$('show-solo').addEventListener('click', () => {
  if (running() || !$('death-screen').hidden) return;
  expeditionBattle = false;
  game = new Combat({ species: $('enemy-design').value });
  syncPracticeOptions();
  $('expedition-view').hidden = true; $('battle-view').hidden = false;
  $('show-map').setAttribute('aria-pressed', 'false'); $('show-solo').setAttribute('aria-pressed', 'true');
  activeModes.forEach(button => { const selected = button.dataset.mode === game.mode; button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
  $('mode-description').textContent = '생명력 5칸 · 회복약 2개. 원정과 별개의 전투입니다.';
  $('overlay-eyebrow').textContent = 'A DUEL OF TIMING';
  $('overlay-title').innerHTML = '한 번의 탭.<br><em>완벽한 방어.</em>';
  $('overlay-copy').textContent = '빛나는 팔과 무기를 읽고 모든 공격을 막아내세요.';
  $('overlay-foot').textContent = '아래에서 연습 모드와 공격 패턴을 선택할 수 있습니다.';
  $('intro-emblem').textContent = '◇'; $('result-stats').hidden = true;
  $('battle-xp').hidden = true;
  $('start').innerHTML = '전투 시작 <svg><use href="#i-arrow"/></svg>';
  $('overlay').hidden = false;
  resize(); updateUI();
});

$('start').addEventListener('click', start);
$('items').addEventListener('click', () => {
  if (game.state !== 'player' || paused) return;
  updateUI();
  $('item-dialog').showModal();
  ($('use-potion').disabled ? $('item-cancel') : $('use-potion')).focus();
});
$('item-cancel').addEventListener('click', () => $('item-dialog').close());
$('item-dialog').addEventListener('close', () => {
  if (!paused && running()) (game.state === 'player' ? $('items') : $('parry-left')).focus({ preventScroll: true });
});
$('use-potion').addEventListener('click', () => {
  if (paused || !game.heal(clock())) return;
  unlockAudio();
  $('item-dialog').close();
  processEvents();
});
$('pause').addEventListener('click', togglePause);
$('sound').addEventListener('click', () => {
  sound = !sound;
  $('sound').setAttribute('aria-pressed', String(sound));
  $('sound').setAttribute('aria-label', sound ? '소리 끄기' : '소리 켜기');
  audio.mute(!sound);
  if (sound) unlockAudio();
});
$('guide').addEventListener('change', event => { showGuide = event.target.checked; });
function syncPracticeOptions() {
  $('practice-attack').replaceChildren(new Option('전체 무작위 조합', 'random'));
  game.components.forEach(component => $('practice-attack').add(new Option(`${component.name}${component.effect === 'weaken' ? ' · 공격 약화' : component.damage > 1 ? ` · 필살기 −${component.damage} HP` : ''}`, component.type)));
  $('practice-attack').value = game.practiceAttack;
}
syncPracticeOptions();
$('practice-attack').addEventListener('change', event => {
  if (running() || !$('death-screen').hidden) return;
  game = new Combat({ mode: game.mode, species: $('enemy-design').value, practiceAttack: event.target.value });
  updateUI();
});
$('enemy-design').addEventListener('change', () => {
  if (running() || !$('death-screen').hidden) return;
  game = new Combat({ mode: game.mode, species: $('enemy-design').value, practiceAttack: $('practice-attack').value });
  syncPracticeOptions();
  updateUI();
});
for (const action of ['attack', 'dodge']) {
  $(action).addEventListener('pointerdown', event => {
    if (event.button !== 0 || $(action).disabled) return;
    event.preventDefault();
    act(action);
  });
  $(action).addEventListener('click', event => { if (event.detail === 0) act(action); });
}
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
  game = new Combat({ mode: button.dataset.mode, species: $('enemy-design').value, practiceAttack: $('practice-attack').value });
  activeModes.forEach(item => {
    const selected = item === button;
    item.classList.toggle('selected', selected);
    item.setAttribute('aria-pressed', String(selected));
  });
  $('mode-description').textContent = game.mode === 'practice' ? '무제한 생명력과 넓은 판정으로 타이밍을 익히세요.' : '생명력 5칸 · 회복약 2개. 한 대도 맞지 않는 승리에 도전하세요.';
  updateUI();
}));
document.addEventListener('keydown', event => {
  // The native dialog owns focus and Escape; shortcuts must not spend a turn behind it.
  if ($('item-dialog').open) return;
  if (event.repeat || /INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
  if (event.code === 'Escape') { togglePause(); return; }
  if (['KeyJ', 'KeyA', 'KeyD', 'KeyK'].includes(event.code)) {
    if (!running() || paused) return;
    event.preventDefault();
    if (event.code === 'KeyJ') act('attack');
    else if (event.code === 'KeyK') act('dodge');
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
  if (hit.type === 'bell-resonance' || hit.effect === 'weaken') {
    if (hit.effect === 'weaken') ellipse(0, 0, radius * .6, radius * 2.2, '#bf9df2');
    for (const size of [1, 1.45, 1.9]) ellipse(-radius * (size - 1), 0, radius * .36, radius * size, color);
  } else if (hit.type === 'energy-orb') {
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

function drawGroundShockwave(hit, now, from, target, scale) {
  const progress = Math.max(0, Math.min(1, (now - hit.launchAt) / (hit.at - hit.launchAt)));
  const fade = now <= hit.at ? 1 : Math.max(0, 1 - (now - hit.at) / 240);
  // The expanding ellipse reaches the player's feet exactly at the defense time.
  const reach = Math.hypot(target[0] - from[0], (target[1] - from[1]) / .35);
  ctx.save(); ctx.globalAlpha = fade;
  const radius = Math.max(1, reach * progress);
  ctx.beginPath(); ctx.ellipse(...from, radius, radius * .35, 0, 0, Math.PI * 2);
  ctx.strokeStyle = '#f2ce88'; ctx.lineWidth = 3; ctx.stroke();
  const age = Math.max(0, (now - hit.launchAt) / 400);
  if (age < 1) {
    ctx.globalAlpha = (1 - age) * fade;
    ellipse(...from, (24 + age * 42) * scale, (7 + age * 10) * scale, '#e8c28b', true);
    if (!reducedMotion) for (let i = 0; i < 8; i++) {
      const angle = i * Math.PI / 4;
      const x = from[0] + Math.cos(angle) * (20 + age * 58) * scale;
      const y = from[1] + Math.sin(angle) * 12 * scale - Math.sin(age * Math.PI) * (12 + i % 3 * 6) * scale;
      polygon([[x - 3, y + 2], [x, y - 4], [x + 4, y + 2]], '#b2a285');
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

  // Keep the procedural arena behind the combatants.
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

  const special = game.sequence.find(h => (h.damage > 1 || h.effect === 'weaken') && now >= h.windupAt && now < h.at + 420);
  const specialIntensity = specialIntensityAt(special, now);
  const specialWarning = special && !special.resolved && !paused && game.state === 'boss';
  $('special-warning').hidden = !specialWarning;
  $('special-warning').dataset.effect = specialWarning ? special.effect || '' : '';
  $('arena').dataset.special = specialWarning ? String(special.damage) : '';
  if (specialWarning) {
    if ($('special-name').textContent !== special.name) $('special-name').textContent = special.name;
    const damage = Math.max(1, special.damage - (game.profile.specialReduction || 0));
    const risk = special.effect === 'weaken' ? `공격 약화 · 양손 패링 또는 회피` : `필살기 · 생명력 −${damage}${damage < special.damage ? ' · 호부 적용' : ''}`;
    if ($('special-risk').textContent !== risk) $('special-risk').textContent = risk;
  }
  if (specialIntensity > 0) {
    // Darken the environment before drawing characters, cues, and projectiles.
    ctx.fillStyle = `rgba(2,3,8,${specialIntensity * (special.damage === 3 ? .87 : .76)})`;
    ctx.fillRect(0, 0, width, height);
    const rim = ctx.createRadialGradient(width * .55, height * .5, width * .15, width * .55, height * .5, width * .75);
    rim.addColorStop(0, '#5e132000'); rim.addColorStop(1, `rgba(140,22,39,${specialIntensity * .4})`);
    ctx.fillStyle = rim; ctx.fillRect(0, 0, width, height);
  }
  const hit = game.state === 'boss' ? game.nextHit() : null;
  const hound = isHound(), bell = game.species === 'bell';
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
  const recoveryMs = hound ? HOUND_RECOVERY_MS : bell ? BELL_RECOVERY_MS : 240;
  const lastImpact = game.state === 'boss' ? game.sequence.find(h => now >= h.at && now - h.at < recoveryMs) : null;
  const strikeProgress = lastImpact ? (now - lastImpact.at) / recoveryMs : 0;
  const poseHit = lastImpact || motionHit;
  const enemyPose = hound ? houndRigPoseAt(poseHit, now, reducedMotion, game.attackAt) : bell ? bellRigPoseAt(poseHit, now, reducedMotion, game.attackAt) : null;
  const pose = poseHit?.type;
  const ranged = poseHit?.launchAt != null;
  const travel = lastImpact ? 1 - strikeProgress : motionHit ? Math.max(0, (now - motionHit.commitAt) / (motionHit.at - motionHit.commitAt)) : 0;
  let shiftX = 0, shiftY = 0, lean = 0;
  if (!hound && pose === 'leap') {
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
  const movement = enemyPose?.travel || motionAt(poseHit, now, reducedMotion);
  shiftX += movement.x; shiftY += movement.y;
  if (reducedMotion) { shiftX = 0; shiftY = 0; lean = 0; }
  const bossArtReady = !hound && !bell && characterArt.boss.complete && characterArt.boss.naturalWidth > 0;
  // Reserve space for a raised blade as well as the resting silhouette.
  const bossTop = fighters?.available ? hound ? 220 : bell ? 235 : 265 : 150, bossBottom = 160;
  const framingTop = hudBottom + 48 * specialIntensity;
  const bossScale = Math.min(scale * movement.depth, (height - 88 - framingTop) / (bossTop + bossBottom)) * (hound ? 1.06 : game.enemy === 'normal' ? .85 : game.enemy === 'elite' ? .94 : 1);
  const edge = Math.min(width / 2, (hound ? 140 : bell ? 180 : bossArtReady ? 235 : 230) * bossScale + 12);
  const bossX = Math.max(edge, Math.min(width - edge, width * .56 + shiftX * scale));
  const minBossY = framingTop + bossTop * bossScale + 8;
  const maxBossY = height - 80 - bossBottom * bossScale;
  const bossY = Math.max(minBossY, Math.min(maxBossY, height * .49 + shiftY * scale));
  const floatY = 0;
  const groundY = hound || bell ? bossY + (bossBottom - 5) * bossScale : bossArtReady || fighters?.available
    ? Math.max(minBossY, Math.min(maxBossY, height * .49)) + (bossBottom - 5) * bossScale + (movement.depth - 1) * 50 * scale
    : height * .7 + (movement.depth - 1) * 50 * scale;
  if (specialIntensity > 0) {
    const aura = ctx.createRadialGradient(bossX, bossY, 0, bossX, bossY, 190 * bossScale);
    aura.addColorStop(0, `rgba(190,39,62,${specialIntensity * .3})`); aura.addColorStop(1, '#bd273e00');
    ctx.fillStyle = aura; ctx.fillRect(0, 0, width, height);
    ctx.save(); ctx.globalAlpha = specialIntensity * .7;
    ellipse(bossX, groundY, 90 * bossScale, 17 * bossScale, '#cb6576');
    ellipse(bossX, groundY, 105 * bossScale, 21 * bossScale, '#ad526760');
    ctx.restore();
  }
  ellipse(bossX, groundY, (hound ? 70 * (1 - enemyPose.lift * .2) : bell ? 90 : pose === 'leap' ? 52 : 70) * bossScale, 12 * bossScale, '#00000035', true);
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

  const attackProgress = Math.max(0, Math.min(1, (now - game.attackAt) / 520));
  const dash = reducedMotion ? 0 : Math.sin(attackProgress * Math.PI) * width * .12;
  const dodge = dodgeMotionAt(now, game.dodgeAt, reducedMotion);
  const playerX = width * .3 + dash - dodge * 46 * scale, playerY = height * .76 - dash * .7 + dodge * 12 * scale;
  const parrying = ['parry', 'perfect'].includes(flashKind) && now - flashAt < 350;
  const playerGuardY = playerY - 44 * scale;
  const playerGroundY = playerY + 39 * scale;
  ellipse(playerX, playerGroundY, 30 * scale, 6 * scale, '#00000040', true);
  if (game.isDodgingAt(now)) {
    ellipse(playerX, playerGroundY, 38 * scale, 10 * scale, '#c0b4ed');
    if (!reducedMotion) {
      for (const offset of [15, 35, 55]) line([[playerX + offset * scale, playerY - 40 * scale], [playerX + (offset + 22) * scale, playerY - 46 * scale]], '#c0b4ed66', 2);
    }
  }
  let anchors;
  const use3D = Boolean(fighters?.available);
  canvas.dataset.renderer = use3D ? 'webgl2' : 'fallback';
  $('render-notice').hidden = use3D;
  if (use3D) {
    anchors = fighters.draw(ctx, { width, height, bossX, bossY: bossY + floatY, bossScale, bossLean: lean,
      playerX, playerY, scale, hit: poseHit, glowHit, parryWindow, now,
      attackAt: game.attackAt, parryAt: parrying ? flashAt : -Infinity,
      hurtAt: flashKind === 'hurt' ? flashAt : -Infinity, healAt: game.healAt, dodgeAt: game.dodgeAt, reduced: reducedMotion, enemy: game.enemy, species: game.species, enemyPose });
  } else {
    // Compatibility fallback only. No cutout animation is used by the 3D renderer.
    ctx.save(); ctx.translate(bossX, bossY); ctx.scale(-bossScale, bossScale);
    if (hound) {
      polygon([[-44, 145], [-42, 65], [-65, -20], [-23, -78], [24, -75], [54, 25], [35, 143], [14, 143], [10, 58], [-10, 63], [-20, 145]], '#484541', '#817052');
      polygon([[-26, -65], [-24, -125], [-8, -98], [18, -129], [29, -87], [61, -58], [26, -47]], '#cec3a6', '#817052');
      for (const side of [-1, 1]) {
        line([[side * 38, -22], [side * 63, 20], [side * 67, 61]], '#675a42', 15);
        for (let i = 0; i < 3; i++) line([[side * (61 + i * 6), 60], [side * (64 + i * 7), 95]], '#d1c7b2', 3);
      }
    } else if (bell) {
      polygon([[-32, -135], [32, -135], [58, -45], [94, -8], [-94, -8], [-58, -45]], '#796a47', '#bea065', 3);
      polygon([[-24, -55], [24, -55], [20, 10], [-20, 10]], '#252d2a', '#a68f5c');
      for (const side of [-1, 1]) {
        line([[side * 66, -10], [side * 78, 38], [side * 81, 80]], '#86704b', 28);
        line([[side * 28, 10], [side * 33, 145]], '#38473f', 27);
        ellipse(side * 81, 86, 23, 21, '#303731', true);
      }
    } else if (bossArtReady) ctx.drawImage(characterArt.boss, -108, -138, 204, 306);
    else polygon([[-48, 155], [-45, -85], [0, -135], [45, -85], [48, 155]], '#65755b', '#cbbb86');
    ctx.restore();
    ctx.save(); ctx.translate(playerX, playerY); ctx.scale(scale, scale);
    if (characterArt.player.naturalWidth) ctx.drawImage(characterArt.player, -70, -118, 110, 165);
    else polygon([[-15, 39], [-20, -80], [0, -110], [20, -80], [15, 39]], '#cfc6a9');
    ctx.restore();
    anchors = { hands: { left: [bossX - 62 * bossScale, bossY], right: [bossX + 62 * bossScale, bossY] }, core: [bossX, bossY - 58 * bossScale], playerGuard: [playerX, playerGuardY], groundStrike: [bossX, groundY] };
    if (glowHit) for (const side of ['left', 'right']) {
      if (glowHit.guard !== 'both' && glowHit.guard !== side) continue;
      const direction = side === 'left' ? -1 : 1, [x, y] = anchors.hands[side];
      line([[bossX + direction * 40 * bossScale, bossY - 50 * bossScale], [x, y], [x + direction * 32 * bossScale, y + 108 * bossScale]], parryWindow ? '#fff0b4' : guardColors[side], 4);
    }
  }
  const bossHands = Object.fromEntries(Object.entries(anchors.hands).map(([side, point]) => [side, [point[0] / width, point[1] / height]]));
  if (game.weakenedAttacks > 0) {
    const [x, y] = anchors.playerGuard;
    ellipse(x, y, 24 * scale, 10 * scale, '#c4a1ed');
    if (!reducedMotion) ellipse(x, y, (26 + Math.sin(t * 2) * 4) * scale, 13 * scale, '#a581d170');
  }
  if (ranged && motionHit && now < motionHit.launchAt) {
    for (const side of ['left', 'right']) {
      if (motionHit.guard !== side && motionHit.guard !== 'both') continue;
      const [x, y] = anchors.hands[side], color = guardColors[side];
      const radius = (5 + anticipation * 14) * bossScale;
      ellipse(x, y, radius * 1.5, radius * 1.5, color + '35', true);
      ellipse(x, y, radius, radius, color);
      ellipse(x, y, radius * .4, radius * .4, '#dcfff7', true);
    }
  }
  if (showGuide && warning && hit?.launchAt == null) {
    ctx.save(); ctx.translate(...anchors.core); ctx.scale(bossScale, bossScale);
    timingRing(delta, parryWindow); ctx.restore();
  }
  if (parrying) {
    ctx.save(); ctx.translate(...anchors.playerGuard);
    ctx.beginPath(); ctx.arc(0, 0, 38 * scale, -1.7, .5);
    ctx.strokeStyle = '#e8d9a4'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
  }
  const healProgress = (now - game.healAt) / ITEM_USE_MS;
  if (healProgress >= 0 && healProgress < 1) {
    ctx.save();
    ctx.globalAlpha = reducedMotion ? .6 : Math.sin(healProgress * Math.PI);
    const rise = reducedMotion ? 0 : healProgress * 65 * scale;
    ellipse(playerX, playerGroundY - rise, 32 * scale, 8 * scale, '#a5edc0');
    line([[playerX - 6 * scale, playerY - 80 * scale - rise], [playerX + 6 * scale, playerY - 80 * scale - rise]], '#d2ffe3', 2);
    line([[playerX, playerY - 86 * scale - rise], [playerX, playerY - 74 * scale - rise]], '#d2ffe3', 2);
    ctx.restore();
  }

  if (ranged && now >= poseHit.launchAt && !['parry', 'perfect'].includes(poseHit.result)) {
    // Keep the release position fixed while the arm recoils. Normalized points
    // also survive a viewport resize without pulling a projectile off screen.
    if (poseHit.type === 'bell-groundbreak') {
      if (!projectileOrigins.has(poseHit)) projectileOrigins.set(poseHit, { ground: [anchors.groundStrike[0] / width, anchors.groundStrike[1] / height] });
      const source = projectileOrigins.get(poseHit).ground;
      drawGroundShockwave(poseHit, now, [source[0] * width, source[1] * height], [width * .3, height * .76 + 39 * scale], scale);
    } else {
      if (!projectileOrigins.has(poseHit)) projectileOrigins.set(poseHit, bossHands);
      for (const side of [-1, 1]) {
        if (poseHit.guard === 'both' || poseHit.hand === (side < 0 ? 'left' : 'right')) {
          const source = projectileOrigins.get(poseHit)?.[side < 0 ? 'left' : 'right'];
          drawProjectile(poseHit, now, source ? [source[0] * width, source[1] * height] : [bossX + side * 100 * bossScale, bossY + 12 * bossScale], [playerX + (side * 22 + dodge * 46) * scale, playerGuardY - dodge * 12 * scale], side, scale);
        }
      }
    }
  }
  if (showGuide && warning && hit?.launchAt != null) {
    ctx.save(); ctx.translate(playerX, hit.type === 'bell-groundbreak' ? playerGroundY : playerGuardY); ctx.scale(scale, scale);
    timingRing(delta, parryWindow);
    ctx.restore();
  }

  if (lastImpact && lastImpact.launchAt == null && !reducedMotion) {
    const fade = 1 - strikeProgress;
    const side = lastImpact.hand === 'right' ? 1 : -1;
    ctx.globalAlpha = fade * .7;
    if (bell) {
      for (const hand of ['left', 'right']) {
        if (lastImpact.guard !== 'both' && lastImpact.hand !== hand) continue;
        const [x, y] = anchors.hands[hand];
        line([[x, y - 20 * scale], [x, y + 18 * scale]], '#dfc18c', 7 * scale);
      }
      for (const ring of [0, 1]) ellipse(bossX, groundY, (35 + strikeProgress * 100 + ring * 20) * bossScale,
        (7 + strikeProgress * 22 + ring * 4) * bossScale, '#d5b679');
    } else if (hound) {
      for (const hand of ['left', 'right']) {
        if (lastImpact.guard !== 'both' && lastImpact.hand !== hand) continue;
        const [x, y] = anchors.hands[hand], direction = hand === 'left' ? -1 : 1;
        for (let claw = -1; claw <= 1; claw++) {
          const offset = claw * 9 * scale;
          ctx.beginPath(); ctx.moveTo(x + offset, y);
          ctx.quadraticCurveTo(x + direction * 35 * scale, y + 35 * scale + offset, playerX + offset, playerGuardY + 20 * scale + offset);
          ctx.strokeStyle = '#dcc9a1'; ctx.lineWidth = 1.8; ctx.stroke();
        }
      }
      if (['hound-pounce', 'hound-rebound', 'hound-maul'].includes(lastImpact.type)) ellipse(bossX, groundY, (28 + strikeProgress * 45) * bossScale, (6 + strikeProgress * 9) * bossScale, '#b7a68070');
    } else if (['sweep', 'spin', 'low-sweep', 'flurry'].includes(lastImpact.type)) {
      ctx.beginPath(); ctx.moveTo(bossX + side * 105 * bossScale, bossY + 20 * bossScale);
      ctx.quadraticCurveTo(bossX - side * 100 * bossScale, playerY - (lastImpact.type === 'low-sweep' ? -10 : 55) * scale, playerX, playerY);
      ctx.strokeStyle = '#ead3a3'; ctx.lineWidth = 3; ctx.stroke();
      if (lastImpact.type === 'spin') ellipse(bossX, bossY + 50 * bossScale, 125 * bossScale, 26 * bossScale, '#c5c58d');
    } else if (lastImpact.type === 'drag') {
      line([[bossX + side * 70 * bossScale, bossY + 150 * bossScale], [playerX, playerY - 50 * scale]], '#f1d3a1', 4);
    } else if (lastImpact.type === 'fury' || lastImpact.type === 'execution') {
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
    const rangedCaption = hit?.launchAt != null && windup ? hit.type === 'bell-groundbreak'
      ? now < hit.launchAt ? '종을 들어올립니다 · 지면 충격파 주의' : '지면 충격파 접근 · 도착 순간 방어'
      : now < hit.launchAt ? `${hit.name} 충전 · 도착에 맞춰 방어` : `${hit.name} 접근 · 패링 또는 회피` : '';
    $('timing-caption').textContent = healProgress >= 0 && healProgress < 1 ? '회복 중 · 곧 보스가 반격합니다' : parryWindow ? '패링! 회피는 닿기 직전에' : rangedCaption || (warning ? `${hit.name} · 빛나는 무기를 보세요` : windup && remaining ? '빛나는 팔과 무기를 읽고 기다리세요' : remaining ? '보스가 공격을 준비합니다' : '공격을 피했다면, 다음 빈틈을 노리세요');
    $('timing-caption').style.color = parryWindow ? '#f6dfa1' : hit?.launchAt != null ? '#a5dfff' : hit?.type === 'fury' ? '#edb098' : '#b3c0a7';
  } else {
    $('timing-caption').textContent = game.state === 'player' ? '공격하거나 아이템을 선택하세요.' : game.state === 'counter' ? '자동 반격 중 · 곧 당신의 차례입니다' : '';
    $('timing-caption').style.color = '#b3c0a7';
  }
}

function frame(realTime) {
  if ($('battle-view').hidden) { lastFrame = realTime; requestAnimationFrame(frame); return; }
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
      for (const strike of game.sequence) {
        // Follow the actual blade swing, not the earlier timing-guide cue.
        const release = strike.launchAt ?? strike.at;
        const swingAt = release - Math.min(160, (release - strike.commitAt) * .3);
        if (now >= swingAt && !swingSeen.has(strike)) {
          swingSeen.add(strike);
          if (now < release && !strike.resolved) audio.play('swing', strike.damage > 1 ? .4 : strike.guard === 'both' ? .28 : .22, game.species === 'bell' ? .65 : strike.damage > 1 ? .72 : strike.guard === 'both' ? .88 : 1);
        }
        if (strike.launchAt != null && now >= strike.launchAt && !launchSeen.has(strike)) {
          launchSeen.add(strike);
          if (now < strike.at && !strike.resolved) {
            audio.play('wave', .36, strike.guard === 'both' ? .85 : 1);
            if (strike.effect === 'weaken') audio.play('perfect', .4, .5);
            if (strike.type === 'bell-groundbreak') {
              audio.play('hurt', .5, .65); audio.play('perfect', .45, .45);
            }
          }
        }
      }
    }
  }
  drawScene(now);
  $('feedback').classList.toggle('visible', now < feedbackUntil && $('overlay').hidden);
  $('phase-toast').classList.toggle('visible', now < phaseUntil && $('overlay').hidden && $('special-warning').hidden);
  $('arena').classList.toggle('parried', ['parry', 'perfect'].includes(flashKind) && now - flashAt < 250);
  updateDefenseCooldown(now);
  requestAnimationFrame(frame);
}

$('parry-cooldown-rule').textContent = `패링·회피 후 ${(COOLDOWN / 1000).toFixed(1)}초 공통 대기 · 성공·실패 모두 적용`;
resize(); renderBest(); updateUI(); renderExpedition(); locateNode(); requestAnimationFrame(frame);
