# ADR-0021: 女性v5の静止化した非Jump動作をv6で復元する

- 日付: 2026-09-22
- 状態: `IN PROGRESS`（ローカル実装・QA中、公開同意とSites反映は未完了）
- 文脈: 女性v5の`Run_03`は54チャンネルが一定で、走行時に手足が動かない。v4の腕脚8骨は動く。v5では待機・よろけ・捕まる動作も失われた。v5生成時の回転方式変更と不十分なAction名検査が原因。

## 判断

[32章](../32_FEMALE_RUN_ANIMATION_RESTORATION.md)に従い、v5の外見・skin・Jumpを基準に、v4から非Jump4 clipを元の時刻・値・補間で移植したv6を作る。旧版を上書きせず、書出したGLB自体の全clipを比較・視認する。v6 manifestは同じSHAへの承認を得るまで`draft`とする。Webの共有rendererとCore／ruleset／replayは変更しない。

## 理由と影響

回転方式だけをQuaternionへ戻すとv5 JumpのEulerキーが失われる。骨とskinはv4／v5で対応するため、4 clipのデータ移植が最も小さい修正になる。ADR-0020の入力・描画判断は維持するが、当時の「女性v5を保持」というasset選択だけをこの判断で更新する。GitHubへのprivate同期とSites source／一般公開は分離する。
