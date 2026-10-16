# SPEC_V9_MUSIC 録音した曲を鳴らす

目的: 今はコードで合成している曲を、AI（Google の Lyria）で作った音声ファイルで鳴らせるようにする。ファイルが無い・読めない・条件に合わないときは、今の合成の曲をそのまま鳴らす。曲のファイルは司令塔が別に作って入れる。この件では曲のファイルを作らない（試験用のクリック音は作ってよい）。

## 1. 置き場と台帳

- 音声は `v5/assets/music/<key>.<拡張子>`、台帳は `v5/data/music.json`。台帳が無ければ全部合成のまま。
- 台帳の形: `{"version":1,"tracks":{"<key>":{"file":"assets/music/xxx.mp3","bpm":150,"loopStart":0.0,"loopEnd":25.6,"gain":0.8,"once":false}}}`。時刻は秒。`loopStart` は拍0の位置で、`loopStart`〜`loopEnd` は4/4の整数小節。
- key の一覧:
  - `town`・`battle`・`boss_turn`（index.html の `'boss'`）・`victory`（`once:true`）
  - `shooter_<bossId>_s0`〜`_s3`（`bossId` は shooter.js の `MUSIC` のキー。`s0` は `MUSIC` の bpm、`sN` は bpm+8N で、`updateTempo` の段と同じ）
- ファイルの前後には、ループ内の音を1小節ずつ足してある前提で読む（つなぎ目の音飛び対策）。
- 形式は、Playwright の Chromium と WebKit で `decodeAudioData` した長さと拍の位置を測り、両方でずれが10ms以内になるもの（MP3 か AAC）を選ぶ。測った結果をこのファイルの末尾に書く。

## 2. ボス戦（v5/js/shooter.js）

- 録音を使う条件: ストーリーモード、`w.scale===1`（時間のチートなし）、台帳に `s0`〜`s3` の4つがそろい、4つとも読めたとき。チャレンジモード（`setStage`）・チート中・4つそろわないときは、今の `musicTick`（合成）。
- 読み込みは `loadAll(S)` の9秒の待ちに入れる。間に合わなければ合成で始め、その戦いの途中で録音に切り替えない。
- 時計は今のまま（音ありは `AU.ctx.currentTime`、音なしは RAF）。test_shooter.cjs の「音ありではAudioContextの時刻が進む」を壊さない。
- 頭出し: 鳴らし始める時刻 T の拍の位置 `phase` から、`offset = loopStart + (phase mod ループの拍数) × 60 / bpm` を出し、`start(T, offset)`、`loop=true`、`loopStart`/`loopEnd` を台帳どおりにする。最初のタップの前は無音で拍だけ進む今の動きを保ち、`audioUnlock` の後は今の拍の位置から鳴らす（頭から鳴らさない）。
- テンポの段: `updateTempo` で bpm が+8になった時に、次の段のファイルへ30〜50msで重ねて切り替える。新しい offset は同じ式に新しい bpm を入れて出す。
- 一時停止・ミニゲーム表示中・ボス戦の終わりで止める。再開は拍の位置から頭出しする。ヒットストップでは止めない（拍が進むため）。
- 音量は `AU.master` を通して台帳の `gain` を掛ける。`audioAllowed(S)` が偽なら鳴らさない。

## 3. ボス戦以外（v5/index.html の music()）

- `town`・`battle`・`boss_turn`・`victory` は、台帳にあって読めたら録音でループする（`victory` は1回だけ）。曲の切り替えは300msで重ねる。無ければ今の合成。
- 読み込みは `loadAssets()` の再試行の形にならい、最初の画面を出したあとに後ろで読む。読み終わる前は合成で鳴らし、読み終わったら次の曲の切り替えから録音にする。
- `syncAudio` の一時停止・消音にそのまま従う。

## 4. テスト

- 台帳とファイルが無い今の状態で、tools/test_v5.cjs・test_shooter.cjs・test_proto.cjs が変更なしで通ること。
- 偽の AudioContext と偽のバッファで、次を足す。
  1. ボス戦の開始で `loop=true`・`loopStart`/`loopEnd`・offset が式どおり（誤差1ms以内）。
  2. HP75%で `s1` に切り替わり、offset が新しい bpm の式どおり。古い音は重ねたあと止まる。
  3. 一時停止で止まり、再開で拍の位置から頭出しする。
  4. チャレンジモード・`w.scale≠1`・4段がそろわない・読み込み失敗のときは合成（`musicTick` が今どおり音を予約する）。
  5. index.html 側は、台帳ありで録音のループ、無しで合成、`victory` は1回。
- 試験用に `tools/make_click_track.*` を作り、指定した bpm の拍ごとに音（1拍目は高い音）を置いたファイルを出せるようにする。Playwright でそれを読み込み、拍の線とクリックが10ms以内で合うかを1回確かめて結果を書く。試験用のファイルは `v5/assets/music` に置かない。

## 5. 表記

- 録音の曲を鳴らしている間は、すでにあるクレジットや「このゲームについて」の文に「音楽の一部は Google の Lyria で作りました」を足す。そういう場所が無ければ足さない。

## 6. できあがりの条件

- 台帳が無い状態で、今と同じ動きと同じスクショになる。
- 4のテストが通り、自動の確認（CI）が合格する。
