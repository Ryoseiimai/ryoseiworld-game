# OutGame の表の使い方

OutGame の項目は `v5/data/outgame.js` の表に1か所で書きます。`v5/js/outgame.js` の解釈器がその行を読み、エンジン（`v5/index.html`）は置き場所の名前を渡すだけです。シェアのボタンや文を増やすときは、まず表を見てください。

## 行の足し方

### シェアを別の置き場所に出す

`share` の行の `in` に置き場所の名前を足し、`shareTexts` に同じ名前で文を足します。

```js
{id:'share',do:'share',label:['シェアする','シェアする'],in:['chapter-card','challenge-result','credit-card']},
```

```js
'credit-card':[['RYOSEIWORLD を最後まで遊んだ','RYOSEIWORLD を さいごまで あそんだ'],ANIME],
```

ラベルと文は `[おとな, こども]` の順です。文の中の `{stage}` のような変数が空だと、その行は消えます。`links.anime` が空の間は、この決まりでアニメの行が消えます。

### 文に使える変数

| 変数 | 中身 |
|---|---|
| `{chapter}` | クリアした章 |
| `{stage}`、`{combo}` | 今回のチャレンジのステージとコンボ |
| `{cheat}` | チートを使った回だけ `ui.cheat` の文 |
| `{animeUrl}` | `links.anime` |
| `{earned}`、`{total}` | 実績の数（og-achievement から） |

### アニメの URL を入れる

`links.anime` を書き換えるコミットを1つ出します。リポジトリが公開なので、限定公開の間は入れません。本公開の判定のあとに入れます。

### 表だけでは済まないとき

| 増やす物 | 触る場所 |
|---|---|
| 新しい置き場所 | `js/outgame.js` の `SLOTS` に1項目、`index.html` の `outgamePort.openers` に1項目、エンジンの呼び出しを1か所 |
| 新しい動作（`do` の種類） | `js/outgame.js` の `DO` に1項目 |
| 窓の新しい本文 | `js/outgame.js` の `BODY` に1項目 |
| 文の新しい変数 | `js/outgame.js` の `VARS` と `vars()` |

`SLOTS` に足すと、`__v5.smokeScenes` に場面が1つ増えます。場面は3画面で、ステージの中に収まること、ほかの要素に重ならないこと、ラベルがはみ出さないこと、文字が24px以上であることを確かめ、違えば例外を投げます。

## `validate()` が止める物

`registerOutGame` は問題の行を外し、残りの行で動きます。外した行は `console.error` に出るので、スモークが不合格にします。`tools/outgame_tests/share.cjs` は、表の問題が0件であることを確かめます。

| 調べる物 | 不合格の例 |
|---|---|
| 名前 | `in` に `SLOTS` にない名前、`do`、`view`、`link`、`count` の間違い、`id` の重複 |
| 両モード | おとなかこどもの文が空 |
| 幅 | 置き場所の `wide` を超えるラベル、全角16文字を超える実績名 |
| 上限 | 置き場所の `max` を超える行 |
| シェアの文 | `do:'share'` の `in` に `shareTexts` がない |
| リンク | `https://` で始まらない URL |
| アドレス | `links` の外に `ryoseiimai` |
| 実績の条件 | `when` に `{not}` や `{item}`。一度真になったあとで偽に戻るため |

## 表の外に書いてはいけない物

- アドレス（`ryoseiimai`）は `links` にだけ書きます。画面の字にも出しません。
- プレイヤーに見える OutGame の文は表に書きます。解釈器に日本語を書きません。`tools/outgame_copy.cjs` が表から公開の文の一覧を作るので、表の外の文は判定から漏れます。
- 偽の URL を本番のコードに残しません。スモークの場面は `links.game` をアニメの代わりに使います。テストは `_sim.setLinks` から入れます。`?anime=` のような URL 引数は作りません。
- エピローグの入力と最高記録をシェアの文に入れません。文は今回の結果だけから作ります。

## 外部を開く処理の決まり

`window.open`、`navigator.share`、`clipboard`、X のアドレスは `js/outgame.js` の中にだけ書きます。解釈器の外に増やしません。`tools/outgame_tests/share.cjs` のソース検索が不合格にします。

`autodev/RULES.md` の「外部通信なし」との関係は次のとおりです。

- プレイヤーがボタンを押したときの `window.open` と `navigator.share` だけを使います。
- `fetch`、`XMLHttpRequest`、`sendBeacon` を増やしません。自動で外へ出る通信はありません。
- 解析と計測はしません。`?from=anime1` が付いたリンクで来ても、ゲームは読みません。

## 外へ開くときの動き

- `navigator.share` があれば呼びます。プレイヤーが閉じた `AbortError` のときは何もしません。
- 実行中は共有中のフラグで2回目を無視し、終わったら戻します。連打で窓が裏に開いた不具合を防ぐためです。
- `navigator.share` がないときと失敗したときは窓を出します（`Xで投稿`、`リンクをコピー`、戻る）。
- `window.open` が `null` のときは `この画面で開く` を1つ出します。`noopener` を指定すると成功しても `null` が返るので、指定せずに開いてから `opener` を消します。
- `<a>` は使いません。`buttonsIn()` の対象にならず、Enter でも開けないためです。

## Playables 版

`tools/build_playables_v5.sh` は `js/outgame.js`、`data/outgame.js` の `<script>` とファイルをバンドルに入れません。エンジンは `OG()?.…` で呼ぶので、読めなくても動きます。`tools/test_playables_v5.cjs` は、バンドルに `x.com`、`clipboard`、`github.io`、`intent/post` が無いことを確かめます。gate は `test_v5.cjs` しか走らせないので、`tools/outgame_tests/share.cjs` がこのテストを呼びます。
