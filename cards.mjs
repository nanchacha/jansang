export const CARDS = {
  slash: { kind: 'attack', name: '베기', icon: 'i-blade', text: '기본 공격력만큼 피해를 줍니다.' },
  heavy: { kind: 'attack', name: '강타', icon: 'i-blade', text: '피해 +1. 이번 적 턴 자동 반격 없음.' },
  charge: { kind: 'attack', name: '축적', icon: 'i-blade', text: '준비가 없으면 피해 0으로 축적. 다음 공격은 피해 +1.' },
  chase: { kind: 'attack', name: '추격 베기', icon: 'i-blade', text: '직전 적 턴 전 타격 회피 시 피해 +1.' },
  riposte: { kind: 'attack', name: '정밀 찌르기', icon: 'i-blade', text: '직전 적 턴 전 타격 PERFECT 시 피해 +1.' },
  precision: { kind: 'support', name: '정밀 대응', icon: 'i-shield', text: '이번 전 타격 PERFECT → 반격 +1. 최대 피해 3.' },
  pursuit: { kind: 'support', name: '추격 준비', icon: 'i-arrow', text: '이번 전 타격 회피 → 다음 직접 공격 +1.' },
  rhythm: { kind: 'support', name: '연쇄 대응', icon: 'i-shield', threshold: 3, text: '이번 패링 3회 이상 → 다음 직접 공격 +1.' },
  insight: { kind: 'support', name: '간파', icon: 'i-shield', threshold: 2, text: '이번 PERFECT 2회 이상 → 다음 직접 공격 +1.' },
  resolve: { kind: 'support', name: '한계 집중', icon: 'i-blade', threshold: 2, text: '현재 생명력 2 이하 → 이번 공격 피해 +1.' },
};

export const BASE_CARDS = Object.keys(CARDS);
const upgrades = {
  slash: { bonus: 1, text: '기본 공격력에 피해 +1.' },
  heavy: { bonus: 2, text: '피해 +2. 이번 적 턴 자동 반격 없음.' },
  charge: { bonus: 2, text: '준비가 없으면 피해 0으로 축적. 다음 공격은 피해 +2.' },
  chase: { bonus: 2, text: '직전 적 턴 전 타격 회피 시 피해 +2.' },
  riposte: { bonus: 2, text: '직전 적 턴 전 타격 PERFECT 시 피해 +2.' },
  precision: { bonus: 2, text: '이번 전 타격 PERFECT → 반격 +2. 최대 피해 3.' },
  pursuit: { bonus: 2, text: '이번 전 타격 회피 → 다음 직접 공격 +2.' },
  rhythm: { threshold: 2, text: '이번 패링 2회 이상 → 다음 직접 공격 +1.' },
  insight: { threshold: 1, text: '이번 PERFECT 1회 이상 → 다음 직접 공격 +1.' },
  resolve: { threshold: 3, text: '현재 생명력 3 이하 → 이번 공격 피해 +1.' },
};
for (const id of BASE_CARDS) {
  Object.assign(CARDS[id], { base: id, bonus: id === 'slash' ? 0 : 1 });
  CARDS[id + '+'] = { ...CARDS[id], ...upgrades[id], name: CARDS[id].name + '+' };
}

export const STARTER_DECK = ['slash', 'heavy', 'charge', 'chase', 'precision', 'pursuit', 'rhythm', 'insight'];

// Copies increase draw weight, but one offer never repeats the same card type.
export function drawCards(deck, count, random = Math.random) {
  let pool = deck.filter(id => Object.hasOwn(CARDS, id));
  const drawn = [];
  while (pool.length && drawn.length < count) {
    const id = pool[Math.floor(random() * pool.length)];
    drawn.push(id);
    pool = pool.filter(other => CARDS[other].base !== CARDS[id].base);
  }
  return drawn;
}
