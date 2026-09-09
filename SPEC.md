# RYOSEIWORLD — ボス戦ミニゲーム 仕様 v1

## 目的
ブラウザで遊べる2Dボス戦。主人公RYOSEI（ネス風・赤キャップ）が「AI魔法」でボス BUG KING を倒す。
単一の index.html + assets/ で動く（ビルド不要・外部ライブラリなし・GitHub Pagesでそのまま公開できる）。

## 素材（tools/slice_sheet.py が生成、パスは assets/<name>/<name>_frames.json を読む）
- 主人公 assets/ryosei/ : 4x4
  - row0 idle 4f / row1 run 4f / row2 AI魔法 4f (c1で弾発射) / row3 hurt c0-c1, jump c2, victory c3
- ボス assets/bugking/ : 3x3
  - row0 idle 3f / row1 attack 3f (c2で赤グリッチ弾を左へ) / row2 hurt c0-c1, defeated c2

## 画面
- Canvas 960x540、CSS `image-rendering: pixelated`、ドット絵は2倍表示
- 背景: 単色グラデ2段+地面ライン（画像不要、コードで描く）
- 上部に HP バー2本（RYOSEI 緑 / BUG KING 赤）と名前

## 操作
- ← → 移動、Z or Space ジャンプ、X or Enter でAI魔法（青い弾を右へ発射、連射間隔0.4s）
- モバイル: 画面下に ◀ ▶ JUMP AI のタッチボタン

## ルール
- RYOSEI HP 5、BUG KING HP 20。AI魔法1発=1ダメ
- ボスは画面右で idle→2〜3秒ごとに attack（赤グリッチ弾を左へ、地面すれすれ1発+空中1発のランダム）
- 弾に当たると hurt アニメ+無敵1秒+ノックバック
- ボスHP半分以下で攻撃間隔1.5秒に短縮（第2形態: 画面が一瞬赤くフラッシュ）
- 勝利: defeated アニメ→ RYOSEI victory → 「BUG KING DEFEATED」表示 → Rで再挑戦
- 敗北: 「GAME OVER」→ Rで再挑戦

## 演出（体験優先）
- 被弾時の画面シェイク、AI魔法命中時に青いスパーク粒子、ボス登場時に名前がドンと出る
- 効果音はWebAudioで合成（発射・命中・被弾・勝利）、外部ファイル不要
- タイトル画面: 「RYOSEIWORLD」ロゴ(canvas文字)+「PRESS ANY KEY」

## 完了条件
- `python3 -m http.server` で開いてタイトル→戦闘→勝利/敗北→再挑戦まで通る
- コンソールエラー0、60fps付近、素材が透過で正しく描画される

# v2: スマホゲーム化（2026-09-09 本人指示「スマホゲームにしよう」）

## 画面
- 縦持ち固定。論理解像度 540x960、CSSで画面いっぱい(100dvh)にフィット、上下は黒帯可。`image-rendering: pixelated`
- 上: BUG KING（画面上部1/3で左右にゆっくり往復、攻撃時は少し降りてくる）
- 下: RYOSEI（画面下部の地面ラインの上）。ボスは上向きの構図なので主人公は上に向かって撃つ
- HPバー: 最上部にボス(赤)、最下部に自分(緑)。セーフエリア(env(safe-area-inset-*))を考慮

## 操作（片手親指・ボタンなし）
- 画面のどこかを指で触れて左右にドラッグ → RYOSEIが指のX方向に追従して移動
- 触れている間はAI魔法を自動連射（0.35秒間隔、上向き）
- 素早いタップ(0.15秒未満・移動なし) → ジャンプ（ボスの低い弾を避ける）
- 画面下部に薄く「指で動かす／タップでジャンプ」の初回ガイドを3秒表示

## 敵の攻撃
- 赤グリッチ弾を下に落とす（狙い撃ち1発＋ばらまき3発をランダム）
- 第2形態(HP半分)でばらまき5発・間隔短縮・画面赤フラッシュ

## スマホ対応の必須
- `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, user-scalable=no">`
- touch-action: none、ダブルタップズーム・長押し選択・スクロール抑止
- iOS Safari: 初回タッチで AudioContext.resume()
- PWA: manifest.json(名前 RYOSEIWORLD、display standalone、portrait)、アイコン(assets/ryosei/ryosei_r0_c0.png から生成した 192/512 PNG)、Add to Home Screen で全画面起動
- PCでも遊べる: マウスドラッグ/クリックで同じ操作、キーボードも残す

## 完了条件
- iPhoneサイズ(390x844)のPlaywrightエミュレーションでタイトル→戦闘→勝利→再挑戦が通る
- 押しっぱなし連射でボスHPが実際に減り、20発で倒せる
