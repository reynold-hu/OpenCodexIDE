#!/usr/bin/env python3
"""Slice a character sticker sheet into character packs.

Sheet layout: rows = characters (mapped via --rows), columns = states in the
fixed order idle, working, attention, celebrate, dizzy, heart, sleep.

Usage:
  python3 tools/slice-character-sheet.py "~/Desktop/sheet.png" \
      --rows dots,grok,muse --out frontend/public/characters

- removes the flat white background by edge flood-fill (interior whites kept)
- crops each cell to its content, centers on a square canvas, exports 512px PNG
- writes manifest.json per product
"""
import sys, os, json, argparse
from PIL import Image, ImageDraw, ImageFilter

STATES = ["idle", "working", "attention", "celebrate", "dizzy", "heart", "sleep"]
COLS = len(STATES)
COLS_OVERRIDE = 7

def remove_white_bg(img: Image.Image) -> Image.Image:
    img = img.convert("RGBA")
    work = img.copy()
    d = ImageDraw.Draw(work)
    w, h = work.size
    seeds = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1), (w // 2, 0), (w // 2, h - 1), (0, h // 2), (w - 1, h // 2)]
    for s in seeds:
        try:
            ImageDraw.floodfill(work, s, (255, 0, 255, 255), thresh=42)
        except Exception:
            pass
    px = work.load()
    out = img.copy()
    op = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if r > 235 and g < 30 and b > 235:
                op[x, y] = (r, g, b, 0)
    # feather the alpha edge slightly
    alpha = out.getchannel("A").filter(ImageFilter.GaussianBlur(0.6))
    out.putalpha(alpha)
    return out

def square_crop(img: Image.Image, box, pad=14, size=512) -> Image.Image:
    l, t, r, b = box
    l -= pad; t -= pad; r += pad; b += pad
    l = max(0, l); t = max(0, t); r = min(img.width, r); b = min(img.height, b)
    cw, ch = r - l, b - t
    side = max(cw, ch)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(img.crop((l, t, r, b)), ((side - cw) // 2, (side - ch) // 2), img.crop((l, t, r, b)))
    return canvas.resize((size, size), Image.LANCZOS)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("sheet")
    ap.add_argument("--rows", required=True, help="comma list, one product per sheet row")
    ap.add_argument("--out", default="frontend/public/characters")
    args = ap.parse_args()

    path = os.path.expanduser(args.sheet)
    products = [p.strip() for p in args.rows.split(",") if p.strip()]
    img = remove_white_bg(Image.open(path))
    rows = len(products)
    cw, chh = img.width / COLS_OVERRIDE, img.height / rows

    for ri, product in enumerate(products):
        outdir = os.path.join(args.out, product)
        os.makedirs(outdir, exist_ok=True)
        states = {}
        for ci, state in enumerate(STATES):
            x0, x1 = round(ci * cw), round((ci + 1) * cw)
            y0, y1 = round(ri * chh), round((ri + 1) * chh)
            cell = img.crop((x0, y0, x1, y1))
            bbox = cell.getbbox()
            if not bbox:
                continue
            piece = square_crop(cell, bbox)
            fname = f"{state}.png"
            piece.save(os.path.join(outdir, fname))
            states[state] = fname
        with open(os.path.join(outdir, "manifest.json"), "w") as f:
            json.dump({"name": f"{product}-sheet-v1", "states": states}, f, indent=2)
        print(f"{product}: {len(states)} states → {outdir}")

if __name__ == "__main__":
    main()
