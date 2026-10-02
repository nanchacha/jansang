# AFTERIMAGE combat audio

2026-10-01. 공개 녹음 소스를 게임용으로 편집한 WAV 9개다. 직접 녹음하거나 AI 음성 도구로 생성한 에셋은 아니다. 원작 게임의 소리는 사용하지 않았다.

## 원본과 사용 허가

- **StarNinjas — [20 Sword Sound Effects (Attacks and Clashes)](https://opengameart.org/content/20-sword-sound-effects-attacks-and-clashes)**, [작가 프로필](https://opengameart.org/users/starninjas). 두 칼을 맞대어 녹음하고 편집한 소리. 원본 페이지의 **CC0** 허가로 사용한다.
  - [Sword source ZIP](https://opengameart.org/sites/default/files/sword_-_starninjas_1.zip)
  - [Clash source ZIP](https://opengameart.org/sites/default/files/sword_clash_-_starninjas_0.zip)
- **artisticdude — [Swishes Sound Pack](https://opengameart.org/content/swishes-sound-pack)**. 옷걸이와 나무 막대의 스윙을 녹음하고 편집한 소리. 원본 페이지의 **CC0** 허가로 사용한다.
  - [Swish source ZIP](https://opengameart.org/sites/default/files/swishes.zip)
- 허가 전문: [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/).

## 편집 내역

모든 파일은 44.1kHz / 16bit / 모노 PCM WAV. 시작 무음 제거, 저역 잡음 필터, 짧은 페이드, 피크 80% 정규화를 적용했다. 다음 공격을 가리지 않도록 잔향을 짧게 유지한다. 전체 약 377KiB이며 추가 네트워크 서비스나 실행 시 FFmpeg가 필요 없다.

| 게임 파일 | 원본 테이크 | 편집 / 용도 |
| --- | --- | --- |
| `parry-1/2/3.wav` | sword_clash 1 / 3 / 7 | 약간 낮춘 피치, 날카로운 고역 완화, 0.58초 충돌음 3변형 |
| `perfect.wav` | sword_clash 6 + 2 | 선명한 충돌에 낮은 금속음을 작게 겹침, 0.72초 |
| `swing-1/2.wav` | swish 1 / 3 | 빠르고 짧은 베기 바람, 0.24 / 0.27초 |
| `slash.wav` | sword 4 + sword_clash 5 | 검이 스치는 소리에 120ms 후 낮은 타격을 겹침, 0.48초 |
| `hurt.wav` | sword_clash 5 + sword 6 | 둔한 충격과 작은 칼 마찰음, 0.32초 |
| `wave.wav` | swish 7 + 3 | 느리고 낮은 공기 흐름에 짧은 스윙을 겹침, 0.6초 |

## 재생과 재제작

`audio.mjs`가 먼저 파일을 내려받고 최초 사용자 입력에서 Web Audio 버퍼로 디코딩한다. 전투 이벤트에서 즉시 재생하며, 아직 준비되지 않았거나 누락된 소리는 건너뛴다. 같은 패링·스윙 테이크의 연속 반복을 피한다. 음소거·정지·재시작 시 재생 중인 소리를 지워 복귀 시 예전 소리가 다시 들리지 않게 한다.

재제작에만 Node.js와 FFmpeg가 필요하다. 위 ZIP들을 `.artifacts/audio-source/` 아래 `sword`, `clash`, `swishes` 폴더에 각각 풀고 프로젝트 루트에서 다음 명령을 실행한다. ZIP 내부 폴더 구조는 유지한다.

```sh
node scripts/build-audio.mjs
node --test audio.test.mjs
```

원본 경로를 별도로 지정하려면 `node scripts/build-audio.mjs <source-folder>`를 사용한다. 다운로드 원본은 `.artifacts/`에만 보관하며 게임에는 편집한 WAV를 포함한다.
