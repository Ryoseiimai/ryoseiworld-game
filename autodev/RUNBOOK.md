# 開発係の1回分の手順

クラウドの開発係（2時間おき）が、毎回この順に上から実行する。
先に `autodev/RULES.md` を読む。RULES と食いちがったら RULES を正とする。
時刻はすべて日本時間で扱う（`TZ=Asia/Tokyo date`）。シェルの変数は呼び出しをまたいで残らないことがあるので、使うたびに作り直す。

## 0. 準備（2分）

```bash
cd "$(git rev-parse --show-toplevel)"
date +%s > /tmp/autodev_start                     # 50分の打ち切りに使う
TZ=Asia/Tokyo date '+%Y-%m-%d %H:%M'               # 今の時刻（記録用）
git config user.name  >/dev/null || git config user.name  "ryoseiworld-autodev"
git config user.email >/dev/null || git config user.email "autodev@users.noreply.github.com"
git fetch --unshallow origin 2>/dev/null || true   # 浅い clone でも履歴と枝が見えるようにする
git fetch --prune origin '+refs/heads/main:refs/remotes/origin/main' \
  '+refs/heads/claude/autodev-*:refs/remotes/origin/claude/autodev-*'
git checkout -B main origin/main                   # 最新の main から始める
git for-each-ref --count=3 --sort=-refname --format='%(refname:lstrip=3)' 'refs/remotes/origin/claude/autodev-2*'   # 枝が見えるか確かめる
```

経過時間（分）はいつでもこれで見る。

```bash
echo $(( ( $(date +%s) - $(cat /tmp/autodev_start) ) / 60 ))
```

- `v5/index.html` が main に無いときは、何もせず終わる（司令塔が v5 を main に入れる前）
- push できるのは `claude/autodev-` で始まるブランチだけ。main へは push しない。`--force` は使わない

## 1. 止める印を見る

```bash
test -f autodev/STOP && echo "STOP があるので終わる"
grep -nE '^- \[!\] R[0-9]+ \| 止まっています' autodev/ROADMAP.md && echo "止まっている印があるので終わる"
```

どちらかが出たら、何も変えずに終わる（push もしない）。
「止まっています」の行は、詰まりが続いたときに開発係が書く（4章）。今井さんか司令塔が原因を見て `[x]` にすると、次の回から動く。

## 2. 直前のブランチの結果を見る

直前のブランチ＝リモートにある `claude/autodev-2…`（絵係の `claude/autodev-art-…` は除く）のうち、名前が一番新しいもの。名前に作った時刻が入っているので、名前の並びが新しさの並びになる。

```bash
PREV=$(git for-each-ref --sort=-refname --format='%(refname:lstrip=3)' 'refs/remotes/origin/claude/autodev-2*' | head -1)
echo "PREV=$PREV"
```

`PREV` が空なら、初めての回。3へ進む。
空でなければ、自動確認の結果と、その枝の数え（STATE.json の current）を一度に見る。結果ファイルの名前は、ブランチ名の `/` を `__` に置き換えたもの。

```bash
PREV=$(git for-each-ref --sort=-refname --format='%(refname:lstrip=3)' 'refs/remotes/origin/claude/autodev-2*' | head -1)
python3 - "$PREV" <<'PY'
import json, os, subprocess, sys, time
prev = sys.argv[1]
res = "autodev/ci/results/" + prev.replace("/", "__") + ".json"
head = subprocess.check_output(["git", "rev-parse", f"origin/{prev}"]).decode().strip()
mins = int((time.time() - int(subprocess.check_output(["git", "log", "-1", "--format=%ct", f"origin/{prev}"]))) / 60)
try:
    cur = json.loads(subprocess.check_output(["git", "show", f"origin/{prev}:autodev/STATE.json"]))["current"] or {}
except Exception:
    cur = {}
counts = " ".join(f"{k}={cur.get(k, 0)}" for k in ("attempts", "conflicts", "retriggers"))
if not os.path.exists(res):
    print(f"NO_RESULT {counts} | {mins}分前にpush"); sys.exit()
d = json.load(open(res))
if d.get("sha") != head:
    print(f"OLD_RESULT {counts} | {mins}分前にpush（結果は前のpushのもの）"); sys.exit()
print(d["result"].upper(), counts, "|", "; ".join(d.get("errors", [])[:10]))
PY
```

出た答えごとに、次のどれか1つをする。数えの欄が無い古い STATE は0として扱う。

| 出た答え | すること |
|---|---|
| `PASS` | 完了。main に合流済み。3へ進む（4で STATE.history に `pass` で書く） |
| `NO_RESULT` / `OLD_RESULT` で push から90分以内 | 自動確認の待ち。何もせず終わる（push もしない） |
| `NO_RESULT` / `OLD_RESULT` で90分を過ぎた、または `ERROR` | 自動確認が動かなかった。`retriggers` が2未満なら下の「もう一度確認にかける」をして終わる。2以上ならあきらめる（理由「自動確認が動かない」） |
| `FAIL` で `attempts` が3未満 | 下の「直す回」をする（attempts を1増やす） |
| `CONFLICT` で `conflicts` が3未満 | 下の「直す回」をする。衝突を直すだけなので conflicts を1増やし、attempts は増やさない |
| `FAIL` で `attempts` が3以上、または `CONFLICT` で `conflicts` が3以上 | あきらめる |

あきらめるとき: main の ROADMAP のその行を `- [~]` にし、題の後ろに `（理由）` を足す（例 `（自動確認に3回通らなかった）`）。3へ進み、4で `BLOCKED_BRANCH` に PREV、`BLOCKED_REASON` に理由を入れる。

### 直す回

```bash
PREV=$(git for-each-ref --sort=-refname --format='%(refname:lstrip=3)' 'refs/remotes/origin/claude/autodev-2*' | head -1)
git checkout -B "$PREV" "origin/$PREV"
git merge --no-edit origin/main     # CONFLICT のときはここで衝突が出る。両方の意図を残して直す
```

- 結果ファイルの `errors` と `checks` と `shots` を読み、原因を直す。テストを消したり弱めたりしない
- 直す回でも3（要望を ROADMAP に移す）はする。今井さんの GO や急ぎの要望を待たせないため。4（選ぶ）は飛ばす
- そのあとは 5（作る）の確認役と手元のテストをして、7（終える）へ進む。ブランチ名は `PREV` のまま
- STATE.json の数えを1増やす（FAIL なら `attempts`、CONFLICT なら `conflicts`）。

```bash
KIND=attempts    # CONFLICT のときは conflicts
python3 -c 'import json,sys;p="autodev/STATE.json";s=json.load(open(p));c=s["current"]=s.get("current") or {};k=sys.argv[1];c[k]=c.get(k,0)+1;open(p,"w").write(json.dumps(s,ensure_ascii=False,indent=2)+"\n");print(c)' "$KIND"
```

### もう一度確認にかける

2章の結果を見た直後（ほかに何も変えていない状態）で行う。枝の STATE.json の `retriggers` を1増やして commit し、push し直す（中身のある commit なので、自動確認がもう一度かかる）。

```bash
PREV=$(git for-each-ref --sort=-refname --format='%(refname:lstrip=3)' 'refs/remotes/origin/claude/autodev-2*' | head -1)
git checkout -B "$PREV" "origin/$PREV"
python3 -c 'import json;p="autodev/STATE.json";s=json.load(open(p));c=s["current"]=s.get("current") or {};c["retriggers"]=c.get("retriggers",0)+1;open(p,"w").write(json.dumps(s,ensure_ascii=False,indent=2)+"\n");print(c)'
git add autodev/STATE.json
git commit -m "自動確認をもう一度かける"
git push origin "HEAD:$PREV"
```

attempts は増やさない。last_run.md は書かない。

## 3. 今井さんの要望を ROADMAP に移す

`autodev/REQUESTS.md` の、行頭が `- [ ] ` の行が未処理。上から順に1行ずつ扱う。

- ふつうの要望: ROADMAP.md の「つぎにやること」の先頭に `- [ ] R<番号> | <短い題> | <完了条件>` を足す。番号は ROADMAP の中で一番大きい R番号＋1。大きい要望は2〜3行に分けてよい
  ```bash
  grep -oE '\bR[0-9]+\b' autodev/ROADMAP.md | tr -d R | sort -n | tail -1
  ```
- 「GO」と書いてある要望: 下の「GO の扱い」
- 「止めて」の要望: ROADMAP には足さない。last_run.md に「止めるには autodev/STOP を作ってください」と書く（STOP は今井さんだけが作る）
- 質問だけの要望: ROADMAP には足さない。答えを last_run.md に1行で書く
- 扱った行は `- [x] <元の文> → R<番号>`（ROADMAP に足さなかったものは `→ 返事は last_run`）にする。元の文は消さない

### GO の扱い

GO の相手は、題に `（要GO）` がある `- [!]` の行。1つならその行、2つ以上なら動かさず last_run.md に「どれの GO か分からない」と書く。

1. その行を、準備の行に書き換えて「つぎにやること」の先頭へ動かす。
   `- [ ] R33 | v5 の入れ替えの準備（GO 済み） | v5 側を仕上げ、docs/GOLIVE.md に入れ替えの手順（司令塔が打つコマンドつき）と、入れ替えた後の確かめ方を書く。本番のファイルは変えない`
2. その件をするときも、本番のファイル（rpg.html・index.html・assets/ など）は変えない。自動確認が必ず不合格にする
3. 終えるとき（7章）、その行を `[x]` にし、すぐ下に人の番の行を足す。
   `- [!] R<新しい番号> | 司令塔が本番を入れ替える（手順は docs/GOLIVE.md） | 司令塔が docs/GOLIVE.md どおりに main を変え、この行を [x] にする`

`[!]` の行は「人の番」（今井さんの GO か、司令塔の作業を待つ）。開発係は選ばない。

## 4. 今回の1件を選び、ブランチを作る

### 4-1. 詰まりが続いていないか見る

```bash
BLOCKED_BRANCH=""     # 2であきらめたときだけ、そのブランチ名（PREV）
python3 - "$BLOCKED_BRANCH" <<'PY'
import json, sys
h = json.load(open("autodev/STATE.json")).get("history", [])
n = 1 if sys.argv[1] else 0
for e in reversed(h):
    if e.get("result") != "blocked": break
    n += 1
print("HALT" if n >= 2 else "GO", f"(続けて詰まった件: {n})")
PY
```

`HALT` が出たら、新しい件を選ばない。代わりに次をして7へ進む（5と6は飛ばす）。
- ROADMAP の「つぎにやること」の先頭に、新しい R番号で `- [!] R<番号> | 止まっています: 詰まりが2件続いた（<詰まった R番号>） | 今井さんか司令塔が原因を見て、この行を [x] にする` を足す
- 今回の1件（RID）は、この行の R番号にする。4-3 の STATE も同じように書く
- last_run.md は「詰まりが2件続いたので、新しい件に進まず止めました」「原因の見込み: …（errors から1行）」の2行にする

### 4-2. 1件を選ぶ

ROADMAP.md を上から見て、最初の `- [ ] ` の行を今回の1件にする（`[x]` 完了・`[!]` 人の番・`[~]` 詰まり は飛ばす）。
`- [ ]` が1つも無いときは、ROADMAP の「くりかえし」の型を新しい R番号で「つぎにやること」の末尾に足して、それを今回の1件にする。

選んだ R番号が、別の枝で何度も落ちていないかも見る（枝の一覧が見えない環境でも同じ件をくり返さないため）。3以上なら、その行を `- [~]` にして（理由「3本の枝で通らなかった」）次の `[ ]` を選び直す。

```bash
RID=R12      # ↑で選んだ番号に置き換える
python3 - "$RID" <<'PY'
import glob, json, sys
n = 0
for f in glob.glob(f"autodev/ci/results/claude__autodev-2*-{sys.argv[1]}.json"):
    try: n += json.load(open(f)).get("result") in ("fail", "conflict", "error")
    except Exception: pass
print(f"{sys.argv[1]} が落ちた枝: {n}")
PY
```

```bash
RID=R12      # 今回の番号
BR="claude/autodev-$(TZ=Asia/Tokyo date +%Y%m%d-%H%M)-$RID"
git checkout -b "$BR"          # 3で変えた REQUESTS と ROADMAP はそのまま持って行く
echo "$BR"
```

### 4-3. STATE.json を書き換える

下の値だけを今回のものに置き換えて流す。
main の `current`（前に合流した件）は、結果が pass なら history に移す。あきらめた件があれば history と blocked に足す。

```bash
RID=R12                                   # 今回の R番号
BLOCKED_BRANCH=""                         # 2であきらめたときだけ、そのブランチ名（PREV）
BLOCKED_REASON=""                         # 例: 自動確認に3回通らなかった / 自動確認が動かない
BR=$(git branch --show-current)
python3 - "$RID" "$BR" "$BLOCKED_BRANCH" "$BLOCKED_REASON" <<'PY2'
import json, os, subprocess, sys
rid, br, blocked_br, reason = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4] or "自動確認に3回通らなかった"
now = subprocess.check_output(["bash","-c","TZ=Asia/Tokyo date '+%Y-%m-%dT%H:%M:%S+09:00'"]).decode().strip()
def result_of(branch):
    f = "autodev/ci/results/" + branch.replace("/", "__") + ".json"
    return json.load(open(f)).get("result") if os.path.exists(f) else None
p = "autodev/STATE.json"; s = json.load(open(p))
done = {h["branch"] for h in s["history"]}
cur = s.get("current")
if cur and cur["branch"] not in done and result_of(cur["branch"]) == "pass":
    s["history"].append({"id": cur["id"], "branch": cur["branch"], "result": "pass", "at": now})
if blocked_br:
    b = json.loads(subprocess.check_output(["git","show",f"origin/{blocked_br}:autodev/STATE.json"]))["current"]
    s["history"].append({"id": b["id"], "branch": blocked_br, "result": "blocked", "at": now})
    s["blocked"].append({"id": b["id"], "branch": blocked_br, "at": now, "reason": reason})
s["current"] = {"id": rid, "branch": br, "attempts": 1, "conflicts": 0, "retriggers": 0, "started_at": now}
s["history"] = s["history"][-50:]
open(p, "w").write(json.dumps(s, ensure_ascii=False, indent=2) + "\n")
print(s["current"])
PY2
```

## 5. 作る（ここに一番時間を使う・目安35分）

1. 設計書を正本の順に読む: `STORY_V4.md` → `STORY_V3.md` → `SPEC_V6.md` → `SPEC_V5_ENGINE.md` → `SPEC_V5.md` → `SPEC_V5_CH234.md`。今回の件に関係する所だけでよい。あれば `v5/ENGINE_API.md` も読む
2. `v5/` の下を変える。ルートの `rpg.html`・`index.html`・`assets/` は変えない（RULES.md の1）
3. 反証する確認役を1人立てる（サブエージェント・Task）。渡す文の例:
   「あなたは反証する確認役です。ROADMAP の `<行>` の完了条件と、設計書の該当部分と、`git diff origin/main` を読み、①仕様との差 ②壊れている所（コンソールエラー・止まる・進めない）③540x960 で文字が重なる・はみ出す所 ④RULES.md に反する所 を、ファイルと行で挙げてください。直さずに挙げるだけ。サブエージェントは起動しないこと。」
   挙がったものを直す。直さないと決めたものは理由を last_run.md に1行書く
4. 手元の確認（あるものだけ）:
   ```bash
   test -f tools/test_v5.cjs  && node tools/test_v5.cjs
   test -f tools/smoke_v5.cjs && node tools/smoke_v5.cjs     # ブラウザが使えるときだけ
   ```
   ブラウザ（Playwright）が使えない環境なら飛ばし、last_run.md に「ブラウザの確認は自動確認に任せた」と書く。Playwright を入れるときは `/tmp` の下に入れ、リポジトリの package.json は増やさない
5. 新しい確認を足せるなら `tools/test_v5.cjs` か `tools/smoke_v5.cjs` に足す（自動確認もこれを使う）
6. 40分を過ぎたら新しいことを始めず、8（時間切れ）の形で仕上げる

## 6. 絵が要るとき

自分では描かない。`autodev/ART_REQUESTS.json` の配列の末尾に1件足し、コードは仮の絵（色の四角と名前）で動くようにしておく。同じ `name` で `pending` の依頼がすでにあれば足さない。

```json
{
  "id": "art-20261009-1630-tiger_glow",
  "file": "v5/assets/tiger_glow_sheet.png",
  "size": "1024x1024",
  "grid": "2x2",
  "out": "v5/assets/tiger_glow",
  "name": "tiger_glow",
  "prompt": "Pixel art sprite sheet, 2x2 grid, ... transparent background, no text",
  "ref": "v5/assets/tiger_sheet.png",
  "status": "pending",
  "task": "R12",
  "requested_at": "2026-10-09T16:30:00+09:00"
}
```

- `prompt` は英語。コマの並び（何行目が何か）と、透明な背景・文字を入れないことを書く。MOTHER / EarthBound・任天堂・実在の会社の絵に似せる言葉は書かない
- `ref` は似せたい既存の絵（無ければ省く）。`v5/assets/` の下の PNG だけが使える
- 絵係が作り終えると `out` の下に `<name>_frames.json` とコマの画像が入る。コードはそれを読み、無い間は仮の絵で動く
- `status` が `failed` になった依頼は、`reason` を読んで prompt などを直し、新しい `id` で足し直してよい。`pending` のままの依頼は待つ（Mac が寝ている間は進まない）

## 7. 終える（必ず push まで・目安8分）

1. ROADMAP.md の今回の行を `- [x]` にする。直す回なら行はそのまま。入れ替えの準備（3章の GO の扱い）なら、すぐ下に人の番の行を足す
2. `autodev/last_run.md` を、この形で上書きする（進み具合ページと夜のメールがこの形を読む）。見出しや空行を先頭に置かない
   ```markdown
   - やったこと1（1行40字くらい）
   - やったこと2
   - やったこと3
   次: 次の一手を1行
   時刻: 2026-10-09 16:30
   ```
   自動確認は、この先頭の3行を進み具合ページの要約にする。題は ROADMAP の行から取るので、ここには書かない。やったことが1〜2行なら、それだけでよい
3. 変えたファイルだけを足して commit し、main を取りこんでから push する
   ```bash
   BR=$(git branch --show-current)
   git add -A v5 tools autodev $(test -d docs && echo docs)
   git status --short          # 関係ないファイル（node_modules・スクショ・dist）や、柵の外（RULES の1）の変更が無いか見る
   git commit -m "R12: 横スクロールのボス戦の土台"
   git fetch origin main && git merge --no-edit origin/main   # 衝突したら直して commit
   git push -u origin "HEAD:$BR"
   test "$(git ls-remote origin "refs/heads/$BR" | cut -f1)" = "$(git rev-parse HEAD)" && echo "push できた"
   ```
4. 「push できた」が出なければ、もう一度 push する。2回だめなら、理由を画面に出して終わる
5. main には push しない。PR も作らない。合流は自動確認がする

## 8. 時間切れ（50分）

経過が50分を超えたら、手を止めて7へ行く。そのときは次のようにする。

- 今回の行を `- [x]` にし、題の後ろに「（前半）」と付ける。残りを `- [ ] R<新しい番号> | <題>（後半） | <残りの完了条件>` として、すぐ下の行に足す
- 動かない途中のものは commit しない（`git stash` か元に戻す）。動く所までを push する
- last_run.md の「次:」に、後半でやることを書く

## 9. 時間が残っていたら続ける（1回の起動で3件まで）

2026-10-09 司令塔が追加。7で push したとき、起動からの経過が30分未満なら、自動確認の結果を待って次の件へ進む。

```bash
BR=$(git branch --show-current); F="autodev/ci/results/${BR//\//__}.json"
for i in $(seq 1 12); do git fetch -q origin main; git cat-file -e "origin/main:$F" 2>/dev/null && break; sleep 60; done
git show "origin/main:$F" 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["result"], d.get("sha",""))'
git rev-parse HEAD
```

- 結果が `pass` で、その sha が今のブランチの先頭（`git rev-parse HEAD`）と同じなら、`git checkout -q main && git reset -q --hard origin/main` で最新の main に戻り、2章（直前の枝の結果を見る）から次の1件をする。1回の起動で合わせて3件まで
- `pass` 以外・12分待っても結果が無い・起動からの経過が30分を超えた、のどれかなら、そこで終わる（次の起動が続ける）
- 続けた回も、件ごとに7の push と last_run.md の書き換えをする

## よくある迷い

- テストが手元で通らない: 直せる所まで直し、そのまま push してよい。自動確認の `errors` を見て、次の回が直す
- 設計書どうしが食いちがう: 正本の順で前のものに従い、last_run.md に1行書く
- 1件が50分で終わりそうにない: 作り始める前に ROADMAP で2〜3件に分け、その最初の1件だけをする
- 絵がまだ届かない: 仮の絵で先に進める。絵が届いた後の差し替えは小さな件として ROADMAP に足す
- 自動確認の結果が `ERROR`: コードではなく自動確認の側が止まった見込み。コードは直さず、2章の表どおり「もう一度確認にかける」
- 柵（fence）で落ちた: `errors` の `fence:` の行のファイルを元に戻す。柵を通すために名前を変えたり、別の場所へ移したりしない
