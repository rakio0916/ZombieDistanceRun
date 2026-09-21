# 32 女性主人公の走行アニメーション復元

作成日: 2026-09-22（JST）。対象は女性 `runner_002` のWeb人物。Sites version 21で配信中のv5と、GitHub mainにある修復v6を比較する。

## 症状と原因

女性の距離・背景は進むが、手足の走行動作が止まる。GLB内の全54アニメーションチャンネルを比較したところ、v4の`Run_03`では左右の上腕・前腕・大腿・下腿の回転が変化する一方、v5の`Run_03`は全チャンネルが一定だった。v5では`Web_Idle`、`Web_Stumble`、`Web_Caught`の回転も静止し、`Web_Jump`だけ回転が残っていた。これは人物GLB自体の退行である。

v5制作スクリプト`refine_runner_002_jump_action.py`は、Jumpを作るとき全骨をEuler回転方式へ変更し、旧動作のQuaternionキーを変換せず全Actionを書き出した。制作レポートの「他のActionを保持」は、Action名の存在確認だけで時系列の比較がなかったため誤りだった。v20のrenderer変更は女性GLBを変更していないため、本件の主修正対象としない。

## 修復内容

1. v5のmesh・skin weight・材質・`Web_Jump`を保ち、v4から`Web_Idle`、`Run_03`、`Web_Stumble`、`Web_Caught`の4 clipを新しいv6へ移す。v4／v5を上書きしない。
2. 移植前に骨名・階層・skin joint順序・inverse bindを確認する。node transformとinverse bindの小さな書出し丸め差は`1e-5`以内に限定する。アニメーションの時刻、値、補間は再サンプルせず保持する。
3. `scripts/restore-runner-002-animations.py`はv4／v5の固定SHAを照合し、v5の元BIN payload、Jumpのsamplerとchannelを保持し、復元した4 clipの全keyを比較する。Runでは左右8骨の回転が変わることを必須とする。
4. Web人物定義をv6へ切り替える。最初の修復作業では新SHAの承認前のためmanifestを`draft`としてSitesへ送らなかった。続く「全て実施して。サイトアップもして」の依頼を、このv6 exact SHAの外観と一般公開・配信・cache／取得・ゲーム表現への承認として記録し、manifestを`approved_for_public_site`へ更新して公開作業を進める。
5. 共有renderer、男性v4、Game Core／ruleset／schema／D1、旧run replayとスタミナ切れ動画修正を維持する。再挑戦時の描画状態初期化は別件として観察し、今回のGLB修復と混同しない。

## 受入条件と証拠

| ID | 条件 | 状態 |
|---|---|---|
| FRA-01 | v6のmesh・skin・材質・Jumpがv5から退行しない | VERIFIED: GLB生成時にv5 BINとJump定義を保持。BlenderでJump体型とウェイトを再検査 |
| FRA-02 | v4の非Jump4 clipを時刻・値・補間までv6へ保持 | VERIFIED: 全channel照合。Runの左右腕脚8骨が回転 |
| FRA-03 | v6の5 clipが実GLB内で変化し、manifestのSHA・bytesが一致 | VERIFIED: 新assetを読む自動テストで確認 |
| FRA-04 | Blender再読込、走行の5位相とJump→Run接続を目視確認 | VERIFIED: CPU Cyclesで0／5／10／15／20 frameの背面画像を確認。Jump体型はBlenderで再計測 |
| FRA-05 | ローカル画面で女性の走行・Jump・着地・再挑戦、男性の走行を確認 | VERIFIED: desktop練習で女性Run→Canvas tap Jump→Run、上級の結果動画→同じ設定で再挑戦後のRun、男性Runを確認 |
| FRA-06 | 実iPhone／Android、認証ranked／本番D1 | NOT STARTED |
| FRA-07 | v6 exact SHAの外観承認と一般公開・配信・cache／取得・ゲーム表現への同意 | VERIFIED: 2026-09-22のサイト公開依頼をSHA `6F7074694B91993498A15179ACEB36C3B0F5418866DF0F66828A0D06F592C125`へ紐付けて記録 |
| FRA-08 | Sites source・保存version・公開deployment | IN PROGRESS: 2026-09-22の公開依頼により実施 |

FRA-01～03の`VERIFIED`はモデルデータと自動検査の範囲に限る。ローカル画面や実機の証拠へ読み替えない。関連判断は[ADR-0021](adr/0021-restore-female-run-animations.md)。
