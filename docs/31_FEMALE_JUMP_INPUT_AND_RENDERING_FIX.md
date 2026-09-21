# 31 女性主人公のジャンプ操作と描画の修復

作成日: 2026-09-22（JST）。Sites version 19のsource `10bc8f3`を基準とする。

## 症状と切り分け

女性主人公が「飛ばなくなった」と報告された。公開端末での再現条件は未確認。女性v5の配布GLBはmanifestと同じSHA-256 `313C310E2476071F1523DE88F0E0E34E6E0DBA359D4F45395F80CA44082D9020`で、`Web_Jump`には脚・腕の動作がある。Coreのジャンプ開始と人物rootの高さは男女共通。v16からv19の間にその高さの式を変える変更はない。したがってGLB破損や女性専用のCore分岐を直接原因と断定しない。

入力側では従来、220ms以内かつ指移動8 CSS px以下のタップだけをJumpへ渡していた。縦方向の小さな指ぶれも横ドラッグ扱いされ、タップを捨てる可能性がある。描画側ではphase24以降の退場Jumpを終端姿勢に固定する既存22章の契約と、割込みfade中のweight連続性が満たされていなかった。これらは静的に確認した欠陥であり、利用者の端末での唯一の原因とはまだ証明されていない。

## 実装契約

1. Canvas上の300ms以内、始点から20 CSS px以内の接触を短いtapとする。ただし8 CSS pxを超える横方向優位の動きが一度でもあれば横ドラッグとし、離指でJumpさせない。大きな縦スワイプ、長押し、cancel、別pointerの終了をJumpへ変換しない。keyboardのSpace／ArrowUpは維持する。
2. `onJump`の1回のedgeを既存30Hz入力へ渡し、Coreの`jumpStartTick`・24tick・0.92mの高さ・phase6～18のLOW通過・server replayを変えない。入力が受理されなかった場合と描画失敗は今後の診断で区別する。
3. phase0～23では同じCore phaseでJump clip時刻とroot高さをsampleする。phase24以降へ抜ける際は退場Jumpをclip終端へ固定し、着地poseからRunへ接続する。Stumbleや終端への空中割込みでは既存の高さ演出を保つ。
4. clip切替時は直前の全actionの実効weightを起点に、設定済みの0.08／0.1／0.15秒で次のclipへ移す。割込み時に合計weightが0へ落ちてbind姿勢が入らないよう正規化する。連続Jumpは同じactionを自己fadeせず新phaseへsampleし、Run時刻を保持する。
5. 再挑戦、人物切替でCore新runの`jumpStartTick`と描画の姿勢・高さを取り違えない。既存v5／男性v4、Core／ruleset／schema／D1／ランキングを変更しない。

## 受入と証拠の区分

- 自動: 縦ぶれ短tapの受理、横ドラッグ・長押し・大きな移動の拒否、割込みfadeのweight連続性、既存Core／旧rulesetの回帰、型・lint・build。
- ローカル実画面: 女性のSpaceとCanvas tapで浮上、連続Jump、再挑戦後のJump、男性のJump。結果動画と結果選択への復帰。
- 実iPhone／Androidの指操作、実認証ranked／本番D1、公開版のジャンプ視認は各別に記録し、実施しなければ`NOT STARTED`とする。静的検査やdesktopを実機証拠にしない。

設計判断は[ADR-0020](adr/0020-female-jump-input-rendering.md)。従来の女性v5姿勢・体型の基準はルートの22章を維持する。
