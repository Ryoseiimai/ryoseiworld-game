#!/usr/bin/env bash
# Autodev gate. Called by .github/workflows/autodev-ci.yml, which always runs main's copy of this file
# (workflow_run / schedule / workflow_dispatch use the default branch), and the fence below rejects any
# branch that touches .github/, so a branch cannot loosen its own check.
#
#   gate.sh plan [branch] [force]          stdout: "branch@sha ..." to check. Empty when autodev/STOP is on main.
#   gate.sh fence <base> <sha> <errfile>   exit 0 when only allowed paths change; reasons are appended to errfile.
#   gate.sh test <outdir> branch@sha...    per branch: <outdir>/<safe>/outcome.json + smoke/. RUNS BRANCH CODE:
#                                          call it only from a job whose token is read-only and not on disk.
#   gate.sh record <indir> branch@sha...   per branch: fence again, merge, results file + devlog entry, push main.
#                                          Never runs branch code. Test outcomes in <indir> come from the job that
#                                          ran branch code, so they are only advisory; the fence is decided here.
#
# Optional env: GATE_FORCE=1 (record again even when this tip already has a result), GATE_DEPLOY_KEY (ssh deploy key used for the push to main) or GATE_PUSH_TOKEN (sent only to that
#   push, as an http header via GIT_CONFIG_* env, never in argv or on disk); RUN_URL, RUN_NUMBER,
#   MAX_BRANCHES_PER_RUN, KEEP_SHOT_RUNS, KEEP_LOG_ENTRIES, GATE_SMOKE_PORT,
#   GATE_SMOKE_JS (test only: smoke script to use; default tools/smoke_v5.cjs from origin/main), GITHUB_OUTPUT.
set -uo pipefail

# Run from the repository root. The workflow runs a copy of this file and record.cjs from $RUNNER_TEMP, because
# record resets the checkout to the newest main, which may hold a newer gate.sh than the one bash is reading.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(git rev-parse --show-toplevel)" || { echo "gate.sh: run it inside the repository" >&2; exit 1; }
cd "$ROOT" || exit 1
MAX_BRANCHES_PER_RUN="${MAX_BRANCHES_PER_RUN:-3}"
MAX_FILE_BYTES="${MAX_FILE_BYTES:-8388608}"   # 8MB per file (art sheets are about 2-3MB)
GITHUB_ED25519='github.com ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIOMqqnkVzrm0SdG6UOoqKLsabgH5C9okWi0dh2l9GKJl'
command -v timeout >/dev/null 2>&1 || timeout() { shift; "$@"; }   # macOS dry runs only (GNU timeout is on the runner)

safe_of() { printf '%s' "${1//\//__}"; }
valid_branch() {
  [[ "$1" =~ ^claude/autodev-[A-Za-z0-9._-]+(/[A-Za-z0-9._-]+)*$ ]] && [[ "$1" != *..* && "$1" != *.lock ]]
}
valid_spec() { [[ "$1" == *@* ]] && valid_branch "${1%@*}" && [[ "${1##*@}" =~ ^[0-9a-f]{40}$ ]]; }
stopped() { git cat-file -e origin/main:autodev/STOP 2>/dev/null; }
fetch_all() {
  git fetch -q --prune origin '+refs/heads/main:refs/remotes/origin/main' \
    '+refs/heads/claude/autodev-*:refs/remotes/origin/claude/autodev-*'
}
fetch_one() { git fetch -q origin '+refs/heads/main:refs/remotes/origin/main' "+refs/heads/$1:refs/remotes/origin/$1"; }
recorded_sha() {  # sha in main's results file for branch $1 ("" when none)
  git show "origin/main:autodev/ci/results/$(safe_of "$1").json" 2>/dev/null | jq -r '.sha // ""' 2>/dev/null || true
}

# ---------------------------------------------------------------- fence
# Prints the reason when path $1 may not change, nothing when it may.
fence_path() {
  case "$1" in
    .github/*) echo "は変えてはいけない（自動確認の設定）" ;;
    autodev/ci/*|devlog/log.json|devlog/shots/*) echo "は自動確認だけが書く" ;;
    autodev/STOP) echo "は今井さんだけが置く・消す" ;;
    autodev/RULES.md|autodev/RUNBOOK.md|autodev/README.md) echo "は司令塔だけが変える（開発係の決まり）" ;;
    tools/slice_sheet.py) echo "は Mac の絵係の道具と同じ形を保つため変えない" ;;
    CLAUDE.md|*/CLAUDE.md|AGENTS.md|*/AGENTS.md|.claude/*|*/.claude/*|.codex/*|*/.codex/*)
      echo "は AI への指示になるので置けない" ;;
    v5/*|tools/*|autodev/*|devlog/*|docs/*) ;;
    *) echo "は合流してよい場所（v5/ tools/ autodev/ devlog/ docs/）の外。公開中の rpg.html・index.html・assets/ とルートのファイルは、変える・消す・名前を変える・移すのどれもしない" ;;
  esac
}

cmd_fence() {
  local base="$1" sha="$2" errfile="$3" rc=0 raw meta path nmode nsha st why size
  raw="$(mktemp)"
  # --no-renames: a rename must show both the deleted old path and the new path (otherwise rpg.html -> v5/x passes).
  if ! git -c core.quotePath=false diff --raw --no-renames -z --no-abbrev "$base" "$sha" > "$raw"; then
    echo "fence: 差分を取れなかった（$base..$sha）" >> "$errfile"; rm -f "$raw"; return 1
  fi
  while IFS= read -r -d '' meta && IFS= read -r -d '' path; do
    read -r _ nmode _ nsha st <<< "${meta#:}"
    why=""
    case "$nmode" in
      120000) why="はシンボリックリンクなので入れられない" ;;
      160000) why="は submodule なので入れられない" ;;
    esac
    [ -n "$why" ] || why="$(fence_path "$path")"
    if [ -z "$why" ] && [ "$st" != D ]; then
      size="$(git cat-file -s "$nsha" 2>/dev/null || echo 0)"
      [ "$size" -le "$MAX_FILE_BYTES" ] || why="は大きすぎる（$((size / 1048576))MB・上限 $((MAX_FILE_BYTES / 1048576))MB）"
    fi
    if [ -n "$why" ]; then rc=1; printf 'fence: %s %s\n' "$path" "$why" >> "$errfile"; fi
  done < "$raw"
  rm -f "$raw"
  return $rc
}

# ---------------------------------------------------------------- plan
cmd_plan() {
  local explicit="${1:-}" force="${2:-}" list=() seen=" " ts ref b cutoff
  fetch_all >&2 || echo "::warning::fetch failed" >&2
  if stopped; then echo "autodev/STOP が main にあるので何もしない" >&2; return 0; fi
  needs_check() {
    local tip
    tip="$(git rev-parse -q --verify "refs/remotes/origin/$1^{commit}")" || return 1
    git merge-base --is-ancestor "$tip" origin/main && return 1      # already merged
    [ "$force" = force ] && return 0
    [ "$(recorded_sha "$1")" = "$tip" ] && return 1                  # this tip already has a result
    return 0
  }
  add() { list+=("$1@$(git rev-parse "refs/remotes/origin/$1^{commit}")"); seen+="$1 "; }
  if [ -n "$explicit" ]; then
    if valid_branch "$explicit" && git rev-parse -q --verify "refs/remotes/origin/$explicit" >/dev/null; then
      needs_check "$explicit" && add "$explicit"
    else
      echo "::warning::not an autodev branch or not found: $explicit" >&2
    fi
  fi
  # Sweep: oldest first, tips committed within the last 3 days, no result for this tip yet.
  cutoff=$(( $(date +%s) - 3 * 24 * 3600 ))
  while read -r ts ref; do
    [ "${#list[@]}" -ge "$MAX_BRANCHES_PER_RUN" ] && break
    b="${ref#refs/remotes/origin/}"
    [ "$ts" -lt "$cutoff" ] && continue
    case "$seen" in *" $b "*) continue ;; esac
    valid_branch "$b" || continue
    needs_check "$b" && add "$b"
  done < <(git for-each-ref --sort=committerdate --format='%(committerdate:unix) %(refname)' 'refs/remotes/origin/claude/')
  echo "Branches to check: ${list[*]:-(none)}" >&2
  echo "${list[*]:-}"
}

# ---------------------------------------------------------------- test (branch code runs here)
cmd_test() {
  local outdir="$1"; shift
  local tmpd smoke_js spec b sha safe work errors base mb tree fence merge test_v5 smoke port
  mkdir -p "$outdir"; outdir="$(cd "$outdir" && pwd)"
  tmpd="$(mktemp -d)"; mkdir -p "$tmpd/home"
  git config user.name 'autodev-gate'; git config user.email 'autodev-gate@users.noreply.github.com'
  port="${GATE_SMOKE_PORT:-8842}"
  # The smoke script comes from main, so a branch cannot loosen its own browser check.
  smoke_js="$tmpd/smoke_v5.cjs"
  if [ -n "${GATE_SMOKE_JS:-}" ]; then cp "$GATE_SMOKE_JS" "$smoke_js"
  else git show origin/main:tools/smoke_v5.cjs > "$smoke_js" 2>/dev/null || : > "$smoke_js"; fi
  for spec in "$@"; do
    valid_spec "$spec" || { echo "::warning::bad spec: $spec"; continue; }
    b="${spec%@*}"; sha="${spec##*@}"; safe="$(safe_of "$b")"
    work="$outdir/$safe"; rm -rf "$work"; mkdir -p "$work/smoke"
    errors="$work/errors.txt"; : > "$errors"
    fence=pass; merge=skipped; test_v5=skipped; smoke=skipped
    echo "::group::test $b @ ${sha:0:7}"
    fetch_one "$b" || true
    base="$(git rev-parse origin/main)"
    if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then
      fence=fail; echo "fetch: $sha が見つからない" >> "$errors"
    else
      mb="$(git merge-base "$base" "$sha")" || mb="$base"
      cmd_fence "$mb" "$sha" "$errors" || fence=fail
    fi
    if [ "$fence" = pass ]; then
      tree="$tmpd/tree-$safe"
      git worktree add -q --detach "$tree" "$base"
      if git -C "$tree" merge -q --ff-only "$sha" 2>/dev/null; then merge=ff
      elif git -C "$tree" merge -q --no-ff --no-edit -m "autodev: merge $b" "$sha" >/dev/null 2>&1; then merge=merge
      else
        merge=conflict
        echo "merge: main と衝突した。main を取り込んでから直して push し直す" >> "$errors"
        git -C "$tree" diff --name-only --diff-filter=U | sed 's/^/merge: 衝突 /' >> "$errors"
        git -C "$tree" merge --abort 2>/dev/null
      fi
      if [ "$merge" != conflict ]; then
        if [ -f "$tree/tools/test_v5.cjs" ]; then
          # Minimal env: no tokens, a throwaway HOME.
          if (cd "$tree" && timeout 600 env -i PATH="$PATH" HOME="$tmpd/home" LANG=C.UTF-8 node tools/test_v5.cjs) > "$work/test_v5.log" 2>&1
          then test_v5=pass
          else test_v5=fail; { echo "test_v5: 失敗（最後の15行）"; tail -n 15 "$work/test_v5.log"; } >> "$errors"; fi
        fi
        # The boss shooter and the prototype mini game have their own Node tests; a failure counts as test_v5 fail.
        for extra in test_shooter test_proto; do
          [ -f "$tree/tools/$extra.cjs" ] || continue
          if (cd "$tree" && timeout 600 env -i PATH="$PATH" HOME="$tmpd/home" LANG=C.UTF-8 node "tools/$extra.cjs") > "$work/$extra.log" 2>&1
          then :
          else test_v5=fail; { echo "$extra: 失敗（最後の15行）"; tail -n 15 "$work/$extra.log"; } >> "$errors"; fi
        done
        [ -s "$smoke_js" ] || cp "$tree/tools/smoke_v5.cjs" "$smoke_js" 2>/dev/null || true   # bootstrap: main has no smoke yet
        if [ -s "$smoke_js" ]; then
          if timeout 900 node "$smoke_js" --root "$tree" --port "$port" --out "$work/smoke" --format jpeg > "$work/smoke.json" 2> "$work/smoke.err"
          then smoke=pass
          else
            smoke=fail
            jq -r '.errors[:20][] | "smoke: [\(.kind)] \(.viewport // "-") \(.message)"' "$work/smoke/result.json" >> "$errors" 2>/dev/null \
              || { echo "smoke: 実行できなかった"; tail -n 10 "$work/smoke.err"; } >> "$errors"
          fi
        else smoke=fail; echo "smoke: tools/smoke_v5.cjs が無い" >> "$errors"; fi
      fi
      git worktree remove --force "$tree" 2>/dev/null || rm -rf "$tree"
    fi
    jq -n --arg branch "$b" --arg sha "$sha" --arg base "$base" --arg fence "$fence" --arg merge "$merge" \
      --arg test_v5 "$test_v5" --arg smoke "$smoke" --rawfile errors "$errors" \
      '{branch:$branch, sha:$sha, base:$base, checks:{fence:$fence, merge:$merge, test_v5:$test_v5, smoke:$smoke},
        errors:($errors | split("\n") | map(select(length > 0)) | .[:60])}' > "$work/outcome.json"
    echo "$b: fence=$fence merge=$merge test_v5=$test_v5 smoke=$smoke"
    echo "::endgroup::"
  done
  git worktree prune 2>/dev/null
  rm -rf "$tmpd"
}

# ---------------------------------------------------------------- record (no branch code runs here)
push_main() {
  local rc keyf khf
  if [ -n "${GATE_DEPLOY_KEY:-}" ]; then
    keyf="$(mktemp)"; khf="$(mktemp)"
    printf '%s\n' "$GATE_DEPLOY_KEY" > "$keyf"; chmod 600 "$keyf"
    printf '%s\n' "$GITHUB_ED25519" > "$khf"
    GIT_SSH_COMMAND="ssh -i $keyf -o IdentitiesOnly=yes -o UserKnownHostsFile=$khf -o StrictHostKeyChecking=yes" \
      git push -q "git@github.com:${GITHUB_REPOSITORY:?}.git" HEAD:refs/heads/main
    rc=$?; rm -f "$keyf" "$khf"; return $rc
  elif [ -n "${GATE_PUSH_TOKEN:-}" ]; then
    GIT_CONFIG_COUNT=1 GIT_CONFIG_KEY_0='http.https://github.com/.extraheader' \
      GIT_CONFIG_VALUE_0="AUTHORIZATION: basic $(printf 'x-access-token:%s' "$GATE_PUSH_TOKEN" | base64 | tr -d '\n')" \
      git push -q origin HEAD:refs/heads/main
  else
    git push -q origin HEAD:refs/heads/main
  fi
}

# One attempt for one branch. 0 = recorded and pushed, 1 = push rejected (retry from the newest main), 2 = skipped.
record_one() {
  local indir="$1" b="$2" sha="$3" n="$4" safe work errors outcome mb fence merge test_v5 smoke result run_dir o_merge in_smoke
  safe="$(safe_of "$b")"; work="$GATE_TMP/$safe"; rm -rf "$work"; mkdir -p "$work"
  errors="$work/errors.txt"; : > "$errors"
  fetch_one "$b" || { echo "fetch failed for $b"; return 1; }
  if stopped; then echo "autodev/STOP が main にあるので $b は記録しない"; return 2; fi
  git checkout -q -B autodev-gate origin/main && git reset -q --hard origin/main && git clean -fdq
  if ! git cat-file -e "$sha^{commit}" 2>/dev/null; then echo "$sha is gone"; return 2; fi
  if git merge-base --is-ancestor "$sha" origin/main; then echo "$b @ ${sha:0:7} はもう main に入っている"; return 2; fi
  if [ -z "${GATE_FORCE:-}" ] && [ "$(recorded_sha "$b")" = "$sha" ]; then echo "$b @ ${sha:0:7} はもう記録がある"; return 2; fi

  fence=pass; merge=skipped; test_v5=skipped; smoke=skipped; result=fail
  mb="$(git merge-base origin/main "$sha")" || mb="$(git rev-parse origin/main)"
  cmd_fence "$mb" "$sha" "$errors" || fence=fail

  outcome="$indir/$safe/outcome.json"
  if [ -f "$outcome" ] && [ ! -L "$outcome" ] && jq -e --arg sha "$sha" '.sha == $sha' "$outcome" >/dev/null 2>&1; then :
  else outcome=""; fi

  if [ "$fence" = pass ]; then
    if git merge -q --ff-only "$sha" 2>/dev/null; then merge=ff
    elif git merge -q --no-ff --no-edit -m "autodev: merge $b" "$sha" >/dev/null 2>&1; then merge=merge
    else
      merge=conflict; result=conflict
      echo "merge: main と衝突した。main を取り込んでから直して push し直す" >> "$errors"
      git diff --name-only --diff-filter=U | sed 's/^/merge: 衝突 /' >> "$errors"
      git merge --abort 2>/dev/null
    fi
  fi
  if [ "$fence" = pass ] && [ "$merge" != conflict ]; then
    if [ -z "$outcome" ]; then
      result=error
      echo "自動確認のテストが途中で止まった（結果が無い）。コードではなく自動確認の側の問題の見込み" >> "$errors"
    else
      test_v5="$(jq -r '.checks.test_v5 // "skipped"' "$outcome")"
      smoke="$(jq -r '.checks.smoke // "skipped"' "$outcome")"
      o_merge="$(jq -r '.checks.merge // ""' "$outcome")"
      jq -r '.errors[]? | tostring' "$outcome" | grep -v '^fence: ' | head -n 60 >> "$errors"
      if [ "$test_v5" != fail ] && [ "$smoke" = pass ]; then result=pass
      elif [ "$smoke" = skipped ] && [ "$o_merge" = conflict ]; then
        result=conflict   # tested against an older main where it conflicted; it must be pushed again
      elif [ "$smoke" = skipped ]; then
        result=error; echo "自動確認のテストが動かなかった（smoke が skipped）" >> "$errors"
      else result=fail; fi
    fi
  fi
  # Keep the merge only when everything passed. Known limit: when main moved after the test job, the merge
  # is onto a newer main than the one tested (same as before the split); the next branch's test covers it.
  [ "$result" = pass ] || git reset -q --hard origin/main

  run_dir="${RUN_NUMBER:-0}"; [ "$n" -gt 1 ] && run_dir="$run_dir-$n"
  in_smoke=""   # screenshots only when the tests ran on this merge (not for conflict / error)
  if [ "$result" = pass ] || [ "$result" = fail ]; then in_smoke="$indir/$safe/smoke"; fi
  BRANCH="$b" SHA="$sha" BASE_SHA="$mb" RESULT="$result" FENCE="$fence" MERGE="$merge" TEST_V5="$test_v5" SMOKE="$smoke" \
  ERRORS_FILE="$errors" RUN_DIR="$run_dir" IN_SMOKE="$in_smoke" TESTED_BASE="$( [ -n "$outcome" ] && jq -r '.base // ""' "$outcome" )" \
  MERGED_SHA="$( [ "$result" = pass ] && git rev-parse HEAD || echo '')" RUN_URL="${RUN_URL:-}" \
    node "$HERE/record.cjs" || { echo "::error::record.cjs failed for $b"; git reset -q --hard origin/main; return 2; }
  git add -A autodev/ci/results devlog/log.json
  [ -d devlog/shots ] && git add -A devlog/shots
  git commit -q -m "autodev-ci: $result $b (${sha:0:7})" -m "${RUN_URL:-}"
  if push_main; then echo "recorded: $b $result"; RECORDED+=("$b: $result (fence=$fence merge=$merge test_v5=$test_v5 smoke=$smoke)"); return 0; fi
  return 1
}

cmd_record() {
  local indir="$1"; shift
  local spec b sha try n=0 rc pushed=0
  mkdir -p "$indir"; indir="$(cd "$indir" && pwd)"
  GATE_TMP="$(mktemp -d)"; RECORDED=()
  git config user.name 'github-actions[bot]'
  git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
  for spec in "$@"; do
    valid_spec "$spec" || { echo "::warning::bad spec: $spec"; continue; }
    b="${spec%@*}"; sha="${spec##*@}"; n=$((n + 1))
    echo "::group::record $b @ ${sha:0:7}"
    # A rejected push means main moved: start this branch over from the newest main (no rebase, so no stuck rebase).
    for try in 1 2 3; do
      record_one "$indir" "$b" "$sha" "$n"; rc=$?
      [ $rc -eq 0 ] && pushed=1
      [ $rc -ne 1 ] && break
      echo "push rejected (try $try): start over from the newest main"
      [ "$try" -lt 3 ] && sleep $((try * 3))
    done
    [ $rc -eq 1 ] && echo "::error::could not push the result for $b to main (the next run retries this branch)"
    echo "::endgroup::"
  done
  git checkout -q -B autodev-gate origin/main 2>/dev/null
  [ -n "${GITHUB_OUTPUT:-}" ] && echo "pushed=$pushed" >> "$GITHUB_OUTPUT"
  [ -n "${GITHUB_STEP_SUMMARY:-}" ] && [ "${#RECORDED[@]}" -gt 0 ] && printf '%s\n' "${RECORDED[@]}" >> "$GITHUB_STEP_SUMMARY"
  rm -rf "$GATE_TMP"
  return 0
}

case "${1:-}" in
  plan)   shift; cmd_plan "$@" ;;
  fence)  shift; cmd_fence "$@" ;;
  test)   shift; cmd_test "$@" ;;
  record) shift; cmd_record "$@" ;;
  *) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 2 ;;
esac
