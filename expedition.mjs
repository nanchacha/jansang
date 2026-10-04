import { Combat, ENEMY_HP, BASE_ATTACK_DAMAGE } from './combat.mjs';

export const XP_REWARDS = { normal: 10, elite: 15, boss: 30 };
export const TRAINING = {
  power: { name: '검술 수련', icon: '⚔', costs: [10, 20, 30] },
  vitality: { name: '생명력 단련', icon: '◇', costs: [15, 25] },
};

export const NODE_TYPES = {
  normal: { name: '일반 전투', icon: '⚔', description: '짧은 교전. 체력과 회복약을 아끼세요.' },
  elite: { name: '정예 전투', icon: '♜', description: '필살기를 쓰는 강적. 승리하면 희귀 보상 선택.' },
  rest: { name: '휴식 공간', icon: '♨', description: '회복하거나 강화할 수 있습니다. 한 가지만 선택하세요.' },
  treasure: { name: '보물상자', icon: '◇', description: '도착하면 보상이 공개됩니다. 하나를 가져갈 수 있습니다.' },
  boss: { name: '최종 보스', icon: '♛', description: '공허의 파수꾼. 마지막 전투에서 원정을 완성하세요.' },
};
export const RELICS = {
  vanguard: { name: '선봉의 문장', icon: '⚔', describe: rare => `매 전투 첫 공격 피해 +${rare ? 18 : 12}` },
  apothecary: { name: '약사의 유리병', icon: '♧', describe: rare => `회복약 회복량 +${rare ? 2 : 1}칸` },
  ward: { name: '붉은 호부', icon: '◈', describe: rare => `필살기 피해 −${rare ? 2 : 1}칸 · 최소 피해 1칸` },
  potion: { name: '비상 회복약', icon: '✚', describe: rare => `회복약 ${rare ? 2 : 1}개 획득` },
};

export function makeMap(random = Math.random) {
  const nodes = [];
  // Reserve two support floors so every branching route has 8 battles and 2 breaks.
  const treasureFloor = 3 + Math.floor(random() * 3);
  const restFloor = 7 + Math.floor(random() * 3);
  for (let floor = 1; floor <= 10; floor++) {
    let eliteUsed = false;
    for (const column of floor === 10 ? [1] : [0, 1, 2]) {
      const parents = nodes.filter(n => n.floor === floor - 1 && (floor === 10 || Math.abs(n.column - column) <= 1));
      let type = random() < .2 && !eliteUsed ? 'elite' : 'normal';
      if (floor === treasureFloor) type = 'treasure';
      if (floor === restFloor) type = 'rest';
      if (floor === 1) type = 'normal';
      if (floor === 10) type = 'boss';
      if (type === 'elite') eliteUsed = true;
      const node = { id: `${floor}-${column}`, floor, column, type, next: [],
        hp: ENEMY_HP[type] ?? 0 };
      parents.forEach(parent => parent.next.push(node.id));
      nodes.push(node);
    }
  }
  return nodes;
}

export class Expedition {
  constructor(random = Math.random) {
    this.random = random;
    this.nodes = makeMap(random);
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
    return { hp: this.hp, maxHp: this.maxHp, potions: this.potions, attackDamage: BASE_ATTACK_DAMAGE + this.weapon * 6 + this.training.power,
      firstStrikeBonus: rank('vanguard') ? rank('vanguard') === 2 ? 18 : 12 : 0,
      healAmount: 2 + rank('apothecary'), specialReduction: rank('ward') };
  }
  available() {
    if (this.state !== 'map') return [];
    return this.current ? this.node.next : this.nodes.filter(n => n.floor === 1).map(n => n.id);
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
