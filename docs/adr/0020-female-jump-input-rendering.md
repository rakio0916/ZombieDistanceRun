# ADR-0020: 女性Jumpの入力と描画の受け渡しを修復する

- 日付: 2026-09-22
- 状態: `IN PROGRESS`（実装済み、公開検証中）
- 根拠: 「女性主人公が飛ばなくなった」に続く、設計した修復の全面実施依頼。

## 判断

[31章](../31_FEMALE_JUMP_INPUT_AND_RENDERING_FIX.md)に従い、Canvasの短tapと横dragの判定を分ける。Jump入力edgeは既存Coreへ渡し、描画は同じCore phaseに従う。接地時のJump終端姿勢と、中断したclip遷移のweight連続性を保証する。女性v5 GLBとGame Core／ruleset／server replayは維持する。

## 理由

従来の8px・220ms判定は縦方向の小さな指ぶれをdragとし、Jump入力を捨て得る。着地ではJumpの終端sampleが欠け、遷移を割り込む場合のfadeは直前weightから再開しなかった。入力、Core、姿勢、高さを別々に検証することで、利用者端末での根本原因を未確認のままGLBや競技規則を変えない。
