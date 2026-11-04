#!/usr/bin/env python3
"""
OutGame用のロゴ切り抜きツール

マゼンタ背景・紺のふちのロゴ絵(例: art/raw/logo_ryoseiworld.png)を読み、
画像の外周から辿れるマゼンタとその混色(紺のふちとの境目の紫がかった画素を含む)
だけを透過にする。紺のふちとその内側の配色はそのまま残すので、ふちの外に
紫の線は残らない。そのあと文字の外接矩形で切り抜き、--width の幅にリサイズ
した RGBA の PNG を書き出す。

使い方:
  python3 tools/make_outgame_art.py --in /path/to/logo_ryoseiworld.png \
      --out v5/assets/outgame/logo.png

入力画像(元の絵)はリポジトリに入れない。書き出した PNG だけをコミットする。
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_args():
    p = argparse.ArgumentParser(description="OutGame用のロゴ切り抜きツール")
    p.add_argument("--in", dest="infile", required=True, help="入力PNGパス(マゼンタ背景)")
    p.add_argument("--out", dest="outfile", required=True, help="出力PNGパス")
    p.add_argument("--width", type=int, default=1000, help="出力の幅px(既定1000)")
    p.add_argument(
        "--r-threshold",
        type=int,
        default=20,
        help="背景(マゼンタ・紫の混色)とふち(紺)を分けるRチャンネルのしきい値。"
        "この絵では紺のふち側はR<20、背景側(境目の紫も含む)はR>=20に揃っていた(既定20)",
    )
    return p.parse_args()


def strip_background(im, r_threshold):
    """外周から幅優先探索でマゼンタとその混色だけを透過にする。

    紺のふちはRチャンネルが低く(このロゴでは最大19)、マゼンタや
    ふちとの境目の紫がかった混色はRチャンネルが高い(20以上)。外周の
    背景から隣接画素をたどり、Rがしきい値以上の間だけ透過を広げるので、
    ふちに囲まれた内側の配色(オレンジや金色の文字)には届かない。
    """
    im = im.convert("RGBA")
    w, h = im.size
    px = im.load()
    visited = bytearray(w * h)
    queue = deque()

    def seed(x, y):
        idx = y * w + x
        if not visited[idx]:
            visited[idx] = 1
            queue.append((x, y))

    for x in range(w):
        seed(x, 0)
        seed(x, h - 1)
    for y in range(h):
        seed(0, y)
        seed(w - 1, y)

    while queue:
        x, y = queue.popleft()
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            nx, ny = x + dx, y + dy
            if 0 <= nx < w and 0 <= ny < h:
                idx = ny * w + nx
                if not visited[idx]:
                    r, _g, _b, _a = px[nx, ny]
                    if r >= r_threshold:
                        visited[idx] = 1
                        queue.append((nx, ny))

    # 透過にする画素はRGBも(0,0,0)に揃える。元のマゼンタ色をRGBに残すと、
    # 縮小時のフィルタ処理で縁にマゼンタの滲みが出るため。
    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        row = y * w
        for x in range(w):
            if not visited[row + x]:
                opx[x, y] = px[x, y]
    return out


def main():
    args = parse_args()
    src = Image.open(args.infile)
    stripped = strip_background(src, args.r_threshold)

    bbox = stripped.getbbox()
    if bbox is None:
        raise SystemExit("error: 透過にした結果、絵が残りませんでした")
    cropped = stripped.crop(bbox)

    target_w = args.width
    target_h = round(target_w * cropped.height / cropped.width)
    resized = cropped.resize((target_w, target_h), Image.Resampling.LANCZOS)

    out_path = Path(args.outfile)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    resized.save(out_path)
    print(f"wrote {out_path} ({resized.width}x{resized.height}, RGBA)")


if __name__ == "__main__":
    main()
