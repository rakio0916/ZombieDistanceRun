# 30 スタミナ切れのゲームオーバー動画

作成日: 2026-09-21（JST）。実装対象は現在公開中の歩行ゾンビ版（Sites version 18）から派生したWeb checkout。

2026-09-22の開始不良修復: 動画表示直後の初回再生を`canplay`だけに依存させず、可視状態なら明示的に`play()`を呼ぶ。音声付きの再生拒否時は既存の無音再試行を続ける。再生開始が4秒間確認できなければ「動画を再生」「結果へ進む」を表示し、操作できない黒画面に留まらない。`playing`で案内を消し、非表示・終了・unmountで監視を解除する。タブ復帰時はその時点の時刻から再生し、古い非同期再生結果が新しい試行の表示を変えない。Core／ruleset／動画bytesは変えない。この修復はSites version 20には含まれず、公開操作は別依頼とする。

## 目的と映像

新しいrunでスタミナが0になり、Coreが`EXHAUSTED`を確定した直後に添付動画を先頭から一度だけ再生する。映像の`GAME OVER`まで再生したら、既存の結果画面へ自動で戻す。結果画面には「同じ設定でもう一度」「主人公・レベルを変更」を表示し、次のrunはユーザーの選択で始める。`TIME_LIMIT`完走にはこの動画を出さない。旧runのreplay、Core、ruleset、当たり判定は変更しない。

元添付`1-617399792_1789982098673558.mp4`はH.264/AAC、360×640、24fps、8.000秒、964,670 bytes。SHA-256は`65202ADF2664175BAA95044B7D66D40A1569BE9E4A34A4874345528BC3496E26`。先頭は主人公の走行、中盤はゾンビによる襲撃、終盤は黒背景の`GAME OVER`。入力元は上書きせず、同一bytesを`Web/ZombieDistanceRun-zombie-walk-v1/public/media/game-over/zdr-stamina-game-over-v1.mp4`へversion付きで配置する。ユーザーの公開依頼をこの添付動画のWeb配信許可として扱う。

## 状態遷移

1. Coreの終端tickで距離、スタミナ、人物、難易度、入力列、ranked run IDを固定し、timerと保持入力を停止する。
2. `EXHAUSTED`なら動画overlayを表示し、videoの`ended`まで1回再生する。同じrunの重複finishや再描画でvideoを再生成しない。
3. ranked結果の送信は動画と並行する。動画の終了を通信応答で待たせない。
4. 動画終了後は既存の結果と2つの選択肢を表示し、結果見出しへfocusを移す。前回の人物と難易度を保つ。
5. ranked送信が未解決なら新ranked開始を抑止し、「記録を確認中…」を表示する。送信失敗では同じsubmission IDとpayloadを再送する。設定変更は許すが送信内容は変えない。

動画はviewport全体に黒背景で`contain`表示し、縦横どちらでも切らない。loopを付けない。音声付き再生がブラウザから拒否された場合のみ無音で再試行し、「音声ON」を表示する。無音でも再生できないときは利用者の「動画を再生」操作を待ち、「結果へ進む」も提供する。読込・decode errorなら結果へ進む。非表示時はpauseし、復帰後に同じ時刻から再開する。ゲーム操作のpointer captureを解放し、video中の入力を次のrunへ持ち越さない。動画表示中はWebGL描画の更新を休止するが、sceneを破棄しない。

## 受入条件

- 練習／rankedの`EXHAUSTED`は各runで8秒動画が1回だけ出て、最後に結果画面へ戻る。
- `TIME_LIMIT`では動画を出さない。旧runのserver replayとboardを変更しない。
- 動画が再生できない場合も結果画面へ進める。音声付き再生拒否時は無音再生へ切り替える。
- ranked送信が8秒を超えても結果選択は表示し、新ranked開始は未解決のrunがある間は抑止する。再送は同じpayloadとsubmission IDを使う。
- 画面回転・タブ非表示・動画終端の重複event・連続2runで再生回数と入力持越しが破綻しない。
- `npm run test:core`、lint、型検査、build、ローカルブラウザ、公開版のasset取得を別々に記録する。実iPhone／Androidと実認証ranked／本番D1は実施した場合だけ検証済みとする。

## 対象

`app/game-client.tsx`、`app/game-over-video.tsx`、`app/game-scene.tsx`、`app/globals.css`、version付きMP4。設計判断は[ADR-0019](adr/0019-stamina-game-over-video.md)。
