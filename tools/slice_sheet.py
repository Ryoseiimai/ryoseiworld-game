#!/usr/bin/env python3
"""
スプライトシート分解ツール

マゼンタ背景のスプライトシートを:
  1. マゼンタ系ピクセルを透過化(縁のにじみはerodeで侵食)
  2. cols x rows のグリッドでセル分割
  3. 各セルの不透明bboxを取り、全セル共通の足元Y/横中心Xに揃えた
     固定サイズのフレームPNGとして書き出す
  4. 行ごとにアニメGIF、frames strip画像、frames.json(メタ情報)を出力する

使い方:
  python3 slice_sheet.py --in assets/ryosei_sheet_v1.png --cols 4 --rows 4 \
      --out assets/ryosei --name ryosei
"""

import argparse
import json
import os

import numpy as np
from PIL import Image


def parse_args():
    p = argparse.ArgumentParser(description="スプライトシート分解ツール")
    p.add_argument("--in", dest="infile", required=True, help="入力PNGパス")
    p.add_argument("--cols", type=int, required=True, help="グリッド列数")
    p.add_argument("--rows", type=int, required=True, help="グリッド行数")
    p.add_argument("--out", dest="outdir", required=True, help="出力先ディレクトリ")
    p.add_argument("--name", required=True, help="出力ファイル名の接頭辞")
    p.add_argument("--fps", type=int, default=8, help="GIFのフレームレート(既定8)")
    p.add_argument("--r-min", type=int, default=200, help="マゼンタ判定 R下限(既定200)")
    p.add_argument("--g-max", type=int, default=80, help="マゼンタ判定 G上限(既定80)")
    p.add_argument("--b-min", type=int, default=200, help="マゼンタ判定 B下限(既定200)")
    p.add_argument("--erode", type=int, default=2, help="透過境界の侵食px数(にじみ対策、既定2)")
    p.add_argument("--margin", type=int, default=4, help="フレーム周囲の余白px(既定4)")
    return p.parse_args()


def magenta_mask(rgb_arr, r_min, g_max, b_min):
    """マゼンタ系ピクセルをTrueとするマスクを返す (H,W) bool"""
    r = rgb_arr[..., 0].astype(np.int16)
    g = rgb_arr[..., 1].astype(np.int16)
    b = rgb_arr[..., 2].astype(np.int16)
    return (r > r_min) & (g < g_max) & (b > b_min)


def erode_mask(opaque_mask, iterations):
    """opaque_mask(不透明=True)を指定回数だけ侵食する。
    にじみで残るピンク縁を削るため、透過側(マゼンタ側)を膨張させるのと等価に
    不透明領域を縮める。単純な4近傍erodeをnumpyで実装(scipy依存を避ける)。
    """
    m = opaque_mask.copy()
    for _ in range(iterations):
        shifted = np.ones_like(m)
        shifted &= m
        shifted &= np.roll(m, 1, axis=0)
        shifted &= np.roll(m, -1, axis=0)
        shifted &= np.roll(m, 1, axis=1)
        shifted &= np.roll(m, -1, axis=1)
        m = shifted
    return m


def make_rgba(img_rgb, r_min, g_max, b_min, erode_iters):
    arr = np.array(img_rgb.convert("RGB"))
    mask_magenta = magenta_mask(arr, r_min, g_max, b_min)
    opaque = ~mask_magenta
    opaque = erode_mask(opaque, erode_iters)
    alpha = np.where(opaque, 255, 0).astype(np.uint8)
    rgba = np.dstack([arr, alpha])
    return Image.fromarray(rgba, mode="RGBA")


def bbox_of_alpha(cell_rgba):
    """不透明部分のbboxを (left, top, right, bottom) で返す。全透明ならNone"""
    alpha = np.array(cell_rgba)[..., 3]
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return None
    return (int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1)


def main():
    args = parse_args()
    os.makedirs(args.outdir, exist_ok=True)

    src = Image.open(args.infile)
    rgba_full = make_rgba(src, args.r_min, args.g_max, args.b_min, args.erode)

    sheet_w, sheet_h = rgba_full.size
    cell_w = sheet_w // args.cols
    cell_h = sheet_h // args.rows

    cells = []  # (row, col, PIL.Image, bbox or None)
    for row in range(args.rows):
        for col in range(args.cols):
            box = (col * cell_w, row * cell_h, (col + 1) * cell_w, (row + 1) * cell_h)
            cell = rgba_full.crop(box)
            bbox = bbox_of_alpha(cell)
            cells.append((row, col, cell, bbox))

    # 全セル共通のフレームサイズを決定: 最大bboxの幅/高さ + 余白*2
    valid_bboxes = [b for (_, _, _, b) in cells if b is not None]
    if not valid_bboxes:
        raise RuntimeError("全セルが透明です。マゼンタ判定の閾値を確認してください。")

    max_w = max(b[2] - b[0] for b in valid_bboxes)
    max_h = max(b[3] - b[1] for b in valid_bboxes)
    frame_w = max_w + args.margin * 2
    frame_h = max_h + args.margin * 2

    frames_meta = []
    frames_by_row = {}

    for row, col, cell, bbox in cells:
        frame = Image.new("RGBA", (frame_w, frame_h), (0, 0, 0, 0))
        if bbox is not None:
            left, top, right, bottom = bbox
            sub = cell.crop(bbox)
            # 足元(bbox下端)Yと横中心Xを全セル共通位置に揃える
            bbox_w = right - left
            bbox_h = bottom - top
            dst_x = (frame_w - bbox_w) // 2
            dst_y = frame_h - args.margin - bbox_h
            frame.paste(sub, (dst_x, dst_y), sub)

        fname = f"{args.name}_r{row}_c{col}.png"
        fpath = os.path.join(args.outdir, fname)
        frame.save(fpath)

        frames_meta.append({
            "row": row,
            "col": col,
            "x": col * cell_w,
            "y": row * cell_h,
            "w": frame_w,
            "h": frame_h,
            "file": fname,
        })
        frames_by_row.setdefault(row, []).append(frame)

    # 行ごとのGIF出力
    # GIFはパレット+単一透過色しか扱えないため、各フレームを
    # 透明色として使わない色(255,0,255)で塗った上でPモード変換し、
    # 透過マスクからそのパレットindexをtransparencyに指定する。
    duration_ms = int(1000 / args.fps)
    TRANSPARENT_IDX = 255  # 色数を254色までに制限し、255番を専用の透過indexとして予約する

    def to_p_frame(rgba_frame):
        alpha = np.array(rgba_frame)[..., 3]
        rgb = rgba_frame.convert("RGB")
        # 不透明部分の色だけで254色パレットを作る(透過部分の色に引っ張られないように)
        p_frame = rgb.quantize(colors=254, method=Image.MEDIANCUT)
        p_arr = np.array(p_frame).astype(np.uint8)
        p_arr[alpha == 0] = TRANSPARENT_IDX
        palette = p_frame.getpalette()
        palette = palette + [0] * (768 - len(palette))
        # 255番のパレット色は何にも使わないダミー色にしておく
        palette[TRANSPARENT_IDX * 3:TRANSPARENT_IDX * 3 + 3] = [255, 0, 255]
        out = Image.fromarray(p_arr, mode="P")
        out.putpalette(palette)
        return out

    for row, frames in frames_by_row.items():
        gif_path = os.path.join(args.outdir, f"{args.name}_row{row}.gif")
        p_frames = [to_p_frame(fr) for fr in frames]
        p_frames[0].save(
            gif_path,
            save_all=True,
            append_images=p_frames[1:],
            duration=duration_ms,
            loop=0,
            disposal=2,
            transparency=TRANSPARENT_IDX,
            optimize=False,
        )

    # 全フレームを横1列に並べたstrip画像
    all_frames = [c for (_, _, c, _) in cells]  # 使わない、frames順で作る
    ordered_frames = []
    for row in range(args.rows):
        for col in range(args.cols):
            idx = row * args.cols + col
            ordered_frames.append(frames_by_row[row][col])
    strip_w = frame_w * len(ordered_frames)
    strip = Image.new("RGBA", (strip_w, frame_h), (0, 0, 0, 0))
    for i, f in enumerate(ordered_frames):
        strip.paste(f, (i * frame_w, 0), f)
    strip_path = os.path.join(args.outdir, f"{args.name}_strip.png")
    strip.save(strip_path)

    json_path = os.path.join(args.outdir, f"{args.name}_frames.json")
    with open(json_path, "w", encoding="utf-8") as f:
        json.dump(frames_meta, f, ensure_ascii=False, indent=2)

    print(f"frame size: {frame_w}x{frame_h}")
    print(f"cells: {args.rows}x{args.cols}")
    print(f"output dir: {args.outdir}")


if __name__ == "__main__":
    main()
