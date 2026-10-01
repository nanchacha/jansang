# AFTERIMAGE 캐릭터 시안 v1

제작일: 2026-09-30 (Asia/Seoul)
생성 방식: 내장 image_gen 도구. 두 캐릭터를 각각 독립 생성했습니다.
형식: 각 1024 × 1536 PNG, 알파 채널 포함. 전신 디자인 검토용 시안입니다.

- `hollow-warden-v1.png`: 공허의 파수꾼. 이끼색 갑주, 청록빛 가슴 코어, 좌우 쌍검.
- `protagonist-v1.png`: 주인공 검사. 아이보리색 분리형 망토, 어두운 경량 의상, 장검.

게임 적용 시에는 현재 공격 궤적을 유지하도록 팔·검·몸체를 분리하거나 동작별 프레임을 제작할 수 있습니다.

## 보스 생성 프롬프트

```text
Use case: stylized-concept. Asset type: one polished original full-body character concept for AFTERIMAGE, a dark fantasy mobile timing/parry boss combat game. Style: premium game character concept painting, semi-realistic anatomy, sculptural readable armor shapes, refined painterly texture and restrained detail, believable materials, sharp silhouette at small mobile size, sophisticated art direction. Palette of desaturated forest green, aged pale gold, charcoal and ivory. Lighting: soft cinematic key light with a narrow cool rim, readable dark materials, controlled contrast, no blown-out bloom. Composition: one character only, entire body and every weapon tip inside the image with generous clear margin, portrait composition, isolated on genuinely transparent background. No scenery, no floor platform, no lettering, no labels, no logo, no watermark, no inset panels or alternate views. Original design; no recognizable existing game character.
Subject: THE HOLLOW WARDEN, a towering imposing armored boss. Three-quarter frontal view facing slightly toward the viewer's left; balanced combat-ready stance, both arms held apart so each hand and blade are clearly readable. Broad angular shoulders taper into a narrow hollow waist; weathered deep moss-green and blackened bronze plate armor with architectural triangular planes, subtle stone-like wear and carefully chosen pale-gold edges. Closed faceless pointed helm with a tiny cold cyan slit; a diamond-shaped hollow chest aperture containing a restrained luminous cyan energy core, the defining focal point. Exactly two large straight ceremonial swords, one in each hand, chipped pale-gold metal blades held down and outward away from the legs; strong right-left attack readability. Layered split charcoal skirt armor, heavy articulated legs and gauntlets. Monumental and unsettling but elegant, dominant silhouette, credible joints suitable for future combat animation. Keep the face and chest dark and mysterious while the outer silhouette reads clearly. No gore, no excessive spikes, no extra arms or extra weapons.
```

## 주인공 생성 프롬프트

```text
Use case: stylized-concept. Asset type: one polished original full-body character concept for AFTERIMAGE, a dark fantasy mobile timing/parry boss combat game. Style: premium game character concept painting, semi-realistic anatomy, sculptural readable armor shapes, refined painterly texture and restrained detail, believable materials, sharp silhouette at small mobile size, sophisticated art direction. Palette of desaturated forest green, aged pale gold, charcoal and ivory. Lighting: soft cinematic key light with a narrow cool rim, readable dark materials, controlled contrast, no blown-out bloom. Composition: one character only, entire body and every weapon tip inside the image with generous clear margin, portrait composition, isolated on genuinely transparent background. No scenery, no floor platform, no lettering, no labels, no logo, no watermark, no inset panels or alternate views. Original design; no recognizable existing game character.
Subject: the playable swordsman, a lean athletic adult human with an androgynous face, short tousled black hair and a quiet focused expression. Three-quarter frontal view facing slightly toward the viewer's right, low balanced fencing-ready stance, feet separated, calm alert body language. Worn warm-ivory short split cloak over a tailored charcoal-green coat, dark fitted leather trousers, practical dark boots, restrained brushed-steel forearm armor with pale-gold fittings. Off-white fabric and the slim silhouette must contrast strongly against the dark massive boss. One practical narrow steel longsword with a modest aged brass crossguard, held by the right hand down and outward; left armored hand raised open near the torso ready to meet an attack, all fingers anatomically correct and legible. Cloak ends stop near the knees and separate cleanly from limbs, no sprawling cape. Understated distinctive crescent-shaped gold clasp on the chest, small cool sage cloth accents. Adventurous, grounded and capable, not overdecorated, functional clothing with elegant tailoring. Clear separated limbs suitable for future attack and parry animation. Exactly one sword, no shield, no extra weapons, no oversized equipment, no exaggerated anime proportions.
```
