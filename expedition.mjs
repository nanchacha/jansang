import { Combat, ENEMY_HP, BASE_ATTACK_DAMAGE } from './combat.mjs';

export const XP_REWARDS = { normal: 10, elite: 15, boss: 30 };
export const TRAINING = {
  power: { name: '검술 수련', icon: '⚔', costs: [10, 20, 30] },
  vitality: { name: '생명력 단련', icon: '◇', costs: [15, 25] },
};
export const ROUTES = [
  { name: '시련의 길', description: '정예 연전 · 휴식 없는 고위험 경로' },
  { name: '사냥의 길', description: '정예 보상과 한 번의 재정비' },
  { name: '안식의 길', description: '정예 없이 두 번의 회복·강화' },
  { name: '탐색의 길', description: '전투를 줄이고 보물 두 번 확보' },
];
// Keep the other routes available for reopening later.
export const ACTIVE_ROUTE_COLUMNS = [0];

export const NODE_TYPES = {
  normal: { name: '일반 전투', icon: '⚔', description: '짧은 교전. 체력과 회복약을 아끼세요.' },
  elite: { name: '정예 전투', icon: '♜', description: '필살기를 쓰는 강적. 승리하면 희귀 보상 선택.' },
  rest: { name: '휴식 공간', icon: '♨', description: '회복하거나 강화할 수 있습니다. 한 가지만 선택하세요.' },
  treasure: { name: '보물상자', icon: '◇', description: '도착하면 보상이 공개됩니다. 하나를 가져갈 수 있습니다.' },
  boss: { name: '최종 보스', icon: '♛', description: '공허의 파수꾼. 마지막 전투에서 원정을 완성하세요.' },
};
export const RELICS = {
  vanguard: { name: '선봉의 문장', icon: '⚔', describe: rare => `매 전투 첫 공격 피해 +${rare ? 2 : 1}` },
  apothecary: { name: '약사의 유리병', icon: '♧', describe: rare => `회복약 회복량 +${rare ? 2 : 1}칸` },
  ward: { name: '붉은 호부', icon: '◈', describe: rare => `필살기 피해 −${rare ? 2 : 1}칸 · 최소 피해 1칸` },
  potion: { name: '비상 회복약', icon: '✚', describe: rare => `회복약 ${rare ? 2 : 1}개 획득` },
};

export function makeMap(random = Math.random, columns = ACTIVE_ROUTE_COLUMNS) {
  const nodes = [];
  const pick = values => values[Math.floor(random() * values.length)];
  const early = pick([3, 4]), late = pick([7, 8]);
  // Each lane has a fixed risk/reward budget; encounter positions still vary.
  const encounters = [
    { [pick([2, 3])]: 'elite', [pick([4, 5])]: 'elite', [pick([6, 9])]: 'elite', [late]: 'treasure' },
    { [pick([2, 5])]: 'elite', [early]: 'treasure', [pick([6, 9])]: 'elite', [late]: 'rest' },
    { [early]: 'rest', [late]: 'rest' },
    { [early]: 'treasure', [pick([6, 9])]: 'elite', [late]: 'treasure', [15 - late]: 'rest' },
  ];
  for (let floor = 1; floor <= 10; floor++) {
    for (const column of floor === 10 ? [1.5] : [0, 1, 2, 3]) {
      const type = floor === 10 ? 'boss' : encounters[column][floor] || 'normal';
      nodes.push({ id: floor === 10 ? '10-1' : `${floor}-${column}`, floor, column, type,
        next: floor === 10 ? [] : [floor === 9 ? '10-1' : `${floor + 1}-${column}`], hp: ENEMY_HP[type] ?? 0 });
    }
  }
  // One one-way fork per pair, midway through the run. No crossings between
  // the two regions and no return to a lane once it has been left.
  for (const pair of [[0, 1], [2, 3]]) {
    const from = pick(pair), to = pair.find(column => column !== from);
    nodes.find(n => n.id === `5-${from}`).next.push(`6-${to}`);
  }
  const visible = nodes.filter(node => node.type === 'boss' || columns.includes(node.column));
  const ids = new Set(visible.map(node => node.id));
  for (const node of visible) node.next = node.next.filter(id => ids.has(id));
  return visible;
}

export class Expedition {
  constructor(random = Math.random, columns = ACTIVE_ROUTE_COLUMNS) {
    this.random = random;
    this.nodes = makeMap(random, columns);
    this.state = 'map'; this.current = null; this.visited = [];
    this.hp = 5; this.maxHp = 5; this.potions = 2; this.weapon = 0;
    this.xp = 0; this.lastXpGain = 0;
    this.training = { power: 0, vitality: 0 };
    this.relics = []; this.offers = []; this.battle = null;
    this.stats = { battles: 0, hits: 0, parries: 0, perfects: 0, potionsUsed: 0, elapsed: 0, xpEarned: 0 };
  }

  get node() { return this.nodes.find(n => n.id === this.current); }
  get profile() {
    const rank = id => { const item = this.relics.find(r => r.id === id); return item ? item.rare ? 2 : 1 : 0; };
    return { hp: this.hp, maxHp: this.maxHp, potions: this.potions, attackDamage: BASE_ATTACK_DAMAGE + this.weapon + this.training.power,
      firstStrikeBonus: rank('vanguard'),
      healAmount: 2 + rank('apothecary'), specialReduction: rank('ward') };
  }
  available() {
    if (this.state !== 'map') return [];
    return this.current ? this.node.next : this.nodes.filter(n => n.floor === 1).map(n => n.id);
  }
  futureNodes() {
    const future = new Set(this.current ? [this.current] : this.nodes.filter(n => n.floor === 1).map(n => n.id));
    for (const node of this.nodes) if (future.has(node.id)) for (const id of node.next) future.add(id);
    return future;
  }
  enter(id) {
    if (!this.available().includes(id)) return false;
    this.current = id;
    const node = this.node;
    if (node.type === 'rest') this.state = 'rest';
    else if (node.type === 'treasure') this.offerRewards(false);
    else {
      this.state = 'battle';
      this.lastXpGain = 0;
      this.battle = new Combat({ random: this.random, enemy: node.type, bossHp: node.hp, profile: this.profile });
    }
    return true;
  }
  completeNode() {
    if (!this.visited.includes(this.current)) this.visited.push(this.current);
    this.state = 'map';
  }
  settleBattle() {
    const fight = this.battle;
    if (this.state !== 'battle' || !fight || !['won', 'lost'].includes(fight.state)) return false;
    this.hp = fight.hp; this.potions = fight.potions;
    for (const key of ['hits', 'parries', 'perfects', 'potionsUsed', 'elapsed']) this.stats[key] += fight[key];
    if (fight.state === 'lost') this.state = 'lost';
    else {
      this.stats.battles++;
      this.lastXpGain = XP_REWARDS[this.node.type];
      this.xp += this.lastXpGain;
      this.stats.xpEarned += this.lastXpGain;
      this.completeNode();
      if (this.node.type === 'boss') this.state = 'won';
      else if (this.node.type === 'elite') this.offerRewards(true);
    }
    return true;
  }
  trainingCost(id) {
    if (id === 'vitality' && this.maxHp >= 7) return null;
    return TRAINING[id]?.costs?.[this.training[id]] ?? null;
  }
  canTrain(id) {
    const cost = this.trainingCost(id);
    return this.state === 'map' && cost !== null && this.xp >= cost;
  }
  train(id) {
    if (!this.canTrain(id)) return false;
    this.xp -= this.trainingCost(id);
    this.training[id]++;
    if (id === 'vitality') { this.maxHp++; this.hp++; }
    return true;
  }
  rest(choice) {
    if (this.state !== 'rest') return false;
    if (choice === 'heal' && this.hp < this.maxHp) this.hp = Math.min(this.maxHp, this.hp + 2);
    else if (choice === 'weapon' && this.weapon < 2) this.weapon++;
    else if (choice === 'vitality' && this.maxHp < 7) { this.maxHp++; this.hp++; }
    else if (choice !== 'leave') return false;
    this.completeNode(); return true;
  }
  offerRewards(rare) {
    const pool = Object.keys(RELICS).filter(id => !this.relics.some(r => r.id === id));
    // Shuffle once on arrival; reopening the screen never rerolls a chest.
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    this.offers = pool.slice(0, 3).map(id => ({ id, rare }));
    this.state = 'reward';
  }
  claim(id) {
    if (this.state !== 'reward') return false;
    const item = this.offers.find(r => r.id === id);
    if (!item) return false;
    if (id === 'potion') this.potions += item.rare ? 2 : 1;
    else this.relics.push(item);
    this.offers = []; this.completeNode(); return true;
  }
}
