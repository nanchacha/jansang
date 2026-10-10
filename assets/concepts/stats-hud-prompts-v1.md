# Player stats HUD concepts — v1

- Request: 생명력·공격력·회복약을 텍스트 대신 직관적인 시각 요소로 표현하는 시안 2개.
- Mode: built-in image_gen, image edit/reference workflow.
- Reference: .artifacts/map-without-guide-mobile.png
- Status: design previews only; not applied to the running game.
- Shared example values: health 5/5, attack 1, healing potions 2, cumulative hits 0.

## 1안 · 하트와 소지품

Output: assets/concepts/stats-hud-hearts-v1.png

### Final prompt

Use case: ui-mockup.
Asset type: polished mobile game UI design concept, portrait screenshot.
Input image 1: edit target — the current Korean JANSANG/AFTERIMAGE expedition-map screen.
Primary request: replace the text-heavy player statistics strip with a visually intuitive game HUD. Preserve the existing dark forest-green / charcoal palette, subdued antique brass borders, ivory typography, restrained atmospheric dark-fantasy aesthetic, and surrounding Korean interface.
Composition: one single flat screen mockup, no device frame, no presentation board, no side-by-side inset. Match the input portrait aspect ratio. Preserve the brand header, navigation, map title "공허로 향하는 길", progress "00 / 10 지점", character upgrade card "캐릭터 강화" and "0 XP", and vertical map below. Change the statistics area between the title and upgrade card; you may expand it slightly to give the icons comfortable breathing room and move the content below down correspondingly.
Values must be: full health 5 out of 5, attack power 1, two healing potions, cumulative hits 0. Do not print the labels "생명력", "공격력", "회복약" in the new HUD. The icons must unmistakably communicate these three stats on a small phone. Avoid dense decoration, new gameplay buttons, new sections, characters, art backgrounds, watermarks or explanatory annotations. Do not add a route guide or route introduction. Icons should feel crafted for this game's art direction, crisp and easy to count, not generic emoji.
Design direction A: immediately readable compact icon-and-pip HUD. Replace the current four-column text stat box with a clean two-tier panel, subtle green-black background and fine brass frame. Top tier: exactly FIVE individual full ruby-red heart icons in a spacious horizontal row, clearly separated, each heart visibly shaped and filled, followed by small ivory "5 / 5". Bottom tier: a prominent steel sword icon and ivory numeral "1" on the left, exactly TWO small luminous amber healing potion bottles in the middle with readable number "2", a small understated cracked-shield icon with "0" on the right for cumulative hits. Sword must read as a sword with blade/crossguard/hilt; healing bottles must have distinctive cork and flask silhouette and must not resemble hearts. Preserve the subtle "0회 강화" below or beside the sword as optional secondary metadata. Hearts are the focal point, sword/potions secondary, hit count tertiary. Use minimal ornament, generous spacing, intuitive shapes in addition to color. This is a high-fidelity shippable mobile interface, not a painted illustration.

## 2안 · 생명력 구슬과 장비 슬롯

Output: assets/concepts/stats-hud-orb-v1.png

### Final prompt

Use case: ui-mockup.
Asset type: polished mobile game UI design concept, portrait screenshot.
Input image 1: edit target — the current Korean JANSANG/AFTERIMAGE expedition-map screen.
Primary request: replace the text-heavy player statistics strip with a visually intuitive game HUD. Preserve the existing dark forest-green / charcoal palette, subdued antique brass borders, ivory typography, restrained atmospheric dark-fantasy aesthetic, and surrounding Korean interface.
Composition: one single flat screen mockup, no device frame, no presentation board, no side-by-side inset. Match the input portrait aspect ratio. Preserve the brand header, navigation, map title "공허로 향하는 길", progress "00 / 10 지점", character upgrade card "캐릭터 강화" and "0 XP", and vertical map below. Change the statistics area between the title and upgrade card; you may expand it slightly to give the icons comfortable breathing room and move the content below down correspondingly.
Values must be: full health 5 out of 5, attack power 1, two healing potions, cumulative hits 0. Do not print the labels "생명력", "공격력", "회복약" in the new HUD. The icons must unmistakably communicate these three stats on a small phone. Avoid dense decoration, new gameplay buttons, new sections, characters, art backgrounds, watermarks or explanatory annotations. Do not add a route guide or route introduction. Icons should feel crafted for this game's art direction, crisp and easy to count, not generic emoji.
Design direction B: immersive but legible dark-fantasy equipment HUD, visibly different from a heart row. Replace the current statistics box with a slightly taller horizontal panel containing THREE larger visual modules: on the left, a circular crimson life orb in a restrained dark bronze rim, deep red liquid filled to maximum, with crisp ivory "5 / 5" centered inside; in the center, a steel sword icon shown diagonally inside a square equipment slot with an ivory "1" in a clear small bottom-right badge; on the right, one beautifully clear green-amber healing flask with cork and visible luminous liquid in a square consumable slot, with ivory "×2" quantity badge. Life orb must have NO bottle neck, flask must have a distinct bottle neck; separate the shape silhouettes so health and potions are instantly distinguishable. Keep "0회 강화" as tiny secondary metadata under the sword. Place a tiny subdued cracked shield with "0" in a slim footer at the right of this panel, without distracting from health/sword/flask. The orb is a little larger than the two item slots. Thin worn-bronze frames, controlled highlights and clean negative space, no baroque filigree. Full orb signifies full health and numbers remain highly readable. This should feel like a refined playable action RPG HUD adapted to the provided minimalist green interface.
