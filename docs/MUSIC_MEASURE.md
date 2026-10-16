# 試験用のクリック音で拍のずれを測った結果（SPEC_V9_MUSIC の1と4）

2026-10-16 に開発係が測った。SPEC_V9_MUSIC.md はルートの .md で開発係は変えられないので、ここに書く。司令塔が SPEC_V9_MUSIC.md の末尾に写す。

## 作り方と測り方

- `python3 tools/make_click_track.py --bpm 150 --bars 8 --pad 1 --out <場所>/c150.mp3`
  - 拍ごとに 20ms のクリック。小節の1拍目は 1760Hz、ほかは 880Hz。前後に1小節ずつ足す。44.1kHz・モノラル
  - mp3 は ffmpeg の libmp3lame 192kbps、m4a は ffmpeg の aac 192kbps
  - 試験用のファイルは `v5/assets/music` に置かない（道具が断る）
- `NODE_PATH=<playwright> node tools/measure_click_track.cjs <場所> 150:c150 174:c174 104:c104`
  - Playwright のブラウザで `decodeAudioData` し、振幅 0.1 を超えた所をクリックの頭として、拍の線（k×60/bpm）との差を出す
  - live は AudioContext、offline は shooter.js が最初のタップ前に使う OfflineAudioContext(2,1,44100)

## 結果（Playwright の Chromium 141 系）

| ファイル | 読めたか | 読んだ長さ（秒） | 作った長さ（秒） | クリック数 | 拍とのずれの最大 |
|---|---|---|---|---|---|
| c150.wav | 読めた | 16.0000 | 16.0000 | 40 | 0.05ms |
| c150.mp3 | 読めた | 16.0000 | 16.0000 | 40 | 0.05ms |
| c150.m4a | 読めない（EncodingError） | | | | |
| c174.wav | 読めた | 13.7931 | 13.7931 | 40 | 0.06ms |
| c174.mp3 | 読めた | 13.7937 | 13.7931 | 40 | 0.06ms |
| c174.m4a | 読めない（EncodingError） | | | | |
| c104.wav | 読めた | 23.0769 | 23.0769 | 40 | 0.06ms |
| c104.mp3 | 読めた | 23.0769 | 23.0769 | 40 | 0.06ms |
| c104.m4a | 読めない（EncodingError） | | | | |

- live と offline の結果は同じだった。ただし headless の Chromium は AudioContext も 44.1kHz だったので、48kHz の機械で鳴らす時の変換は確かめていない
- クリックの数（作った40個）と、ループの頭（loopStart）のクリックの位置も道具で照らし、合っていた
- mp3 は頭の無音（エンコーダの遅れ）が取り除かれ、拍のずれは 0.1ms より小さい。10ms の条件を満たす
- mp3 の長さは最大 0.6ms 長いことがある（最後のフレームの端数）。loopEnd は台帳の秒で切るので、ループには関係しない
- m4a は Playwright の Chromium が AAC を読めない（特許のある形式が入っていない版）。仕様の条件は Playwright の Chromium と WebKit なので、AAC は今の時点で条件から外れる

## まだ測っていないこと

- WebKit: この環境には Playwright の WebKit が入っていない（`webkit-2215` が無い）。Mac か WebKit の入った所で同じ道具を流す
- Chromium で mp3 の頭の無音が消えたのは、LAME がファイルに書く遅れの情報を読んだため。WebKit がこれを読まないと、約25ms（1105サンプルほど）遅れるおそれがある。R61 ではこの点を見る
- 48kHz の機械（実機の多く）で鳴らした時のずれも、R61 で見る
- 今の見込みでは、曲のファイルは mp3（libmp3lame・44.1kHz）を選ぶ。WebKit でも 10ms 以内なら決める
