#!/usr/bin/env python3
"""
OutGame用の素材作成ツール

既定(ロゴ切り抜き): マゼンタ背景・紺のふちのロゴ絵(例: art/raw/logo_ryoseiworld.png)を読み、
画像の外周から辿れるマゼンタとその混色(紺のふちとの境目の紫がかった画素を含む)
だけを透過にする。紺のふちとその内側の配色はそのまま残すので、ふちの外に
紫の線は残らない。そのあと文字の外接矩形で切り抜き、--width の幅にリサイズ
した RGBA の PNG を書き出す。

使い方:
  python3 tools/make_outgame_art.py --in /path/to/logo_ryoseiworld.png \
      --out v5/assets/outgame/logo.png

入力画像(元の絵)はリポジトリに入れない。書き出した PNG だけをコミットする。

--ogp: OGP画像(1200x630のJPEG、300KB以下)を作る。背景(既定 v5/assets/bg_town.png)を
暗くした上に、ロゴ(既定 v5/assets/outgame/logo.png)と主人公のコマ(既定
v5/assets/hero_ride/hero_ride_r0_c0.png、正面向きのコマ)を貼り付けるだけで、
どちらも左右反転しない(PILの反転・回転の関数は使わない)。

使い方:
  python3 tools/make_outgame_art.py --ogp --out v5/assets/og/ogp.jpg
"""

import argparse
from collections import deque
from pathlib import Path

from PIL import Image


def parse_args():
    p = argparse.ArgumentParser(description="OutGame用の素材作成ツール")
    p.add_argument("--in", dest="infile", help="入力PNGパス(マゼンタ背景、ロゴ切り抜き用)")
    p.add_argument("--out", dest="outfile", required=True, help="出力ファイルのパス")
    p.add_argument("--width", type=int, default=1000, help="ロゴ切り抜きの出力の幅px(既定1000)")
    p.add_argument(
        "--r-threshold",
        type=int,
        default=20,
        help="背景(マゼンタ・紫の混色)とふち(紺)を分けるRチャンネルのしきい値。"
        "この絵では紺のふち側はR<20、背景側(境目の紫も含む)はR>=20に揃っていた(既定20)",
    )
    p.add_argument("--ogp", action="store_true", help="ロゴ切り抜きの代わりにOGP画像を作る")
    p.add_argument("--bg", default="v5/assets/bg_town.png", help="OGP: 背景PNG")
    p.add_argument("--logo", default="v5/assets/outgame/logo.png", help="OGP: ロゴPNG")
    p.add_argument(
        "--hero",
        default="v5/assets/hero_ride/hero_ride_r0_c0.png",
        help="OGP: 主人公のコマPNG(正面向きのコマが既定。左右反転はしない)",
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


OGP_W, OGP_H = 1200, 630
OGP_DARKEN = 0.45  # 背景にかける倍率(1.0で変化なし)。小さいほど暗い
OGP_MAX_BYTES = 300 * 1024


def build_ogp(bg_path, logo_path, hero_path, out_path):
    """背景を暗くした上にロゴと主人公のコマを貼り付け、1200x630のJPEGを書き出す。

    貼り付け位置を決めるだけで、ロゴも主人公のコマも反転しない(PILの反転・回転の
    関数は使わない)。出力が300KBを超えたらJPEGの画質を少しずつ下げる。
    """
    bg = Image.open(bg_path).convert("RGB")
    bw, bh = bg.size
    scale = max(OGP_W / bw, OGP_H / bh)
    resized_w, resized_h = round(bw * scale), round(bh * scale)
    bg = bg.resize((resized_w, resized_h), Image.Resampling.LANCZOS)
    left = (resized_w - OGP_W) // 2
    top = (resized_h - OGP_H) // 2
    bg = bg.crop((left, top, left + OGP_W, top + OGP_H))

    canvas = Image.eval(bg, lambda v: round(v * OGP_DARKEN)).convert("RGBA")

    logo = Image.open(logo_path).convert("RGBA")
    logo_w = 760
    logo_h = round(logo_w * logo.height / logo.width)
    logo = logo.resize((logo_w, logo_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(logo, ((OGP_W - logo_w) // 2, 50))

    hero = Image.open(hero_path).convert("RGBA")
    hero_h = 380
    hero_w = round(hero_h * hero.width / hero.height)
    hero = hero.resize((hero_w, hero_h), Image.Resampling.LANCZOS)
    canvas.alpha_composite(hero, (OGP_W - hero_w - 50, OGP_H - hero_h - 10))

    out_path = Path(out_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    rgb = canvas.convert("RGB")
    quality = 90
    while True:
        rgb.save(out_path, format="JPEG", quality=quality, optimize=True)
        size = out_path.stat().st_size
        if size <= OGP_MAX_BYTES or quality <= 40:
            break
        quality -= 5
    if size > OGP_MAX_BYTES:
        raise SystemExit(f"error: {out_path} is {size} bytes, over the 300KB limit even at quality 40")
    print(f"wrote {out_path} ({rgb.width}x{rgb.height}, {size} bytes, quality={quality})")


def main():
    args = parse_args()
    if args.ogp:
        build_ogp(args.bg, args.logo, args.hero, args.outfile)
        return
    if not args.infile:
        raise SystemExit("error: --in is required unless --ogp is given")
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
