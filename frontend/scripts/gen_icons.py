"""Rasterize the Kitty cat mark into PWA icons (same geometry as public/favicon.svg)."""
import math
import os
from PIL import Image, ImageDraw

SS = 4                       # supersample factor
GRID = 64                    # design-grid units
UNIT = SS                    # px per grid unit when rendering at base

TOP = (18, 183, 106)      # #12B76A
MID = (7, 148, 85)        # #079455
BOT = (6, 78, 59)         # #064E3B
CAT_HI = (242, 254, 246)  # #F2FEF6
CAT_LO = (201, 239, 216)  # #C9EFD8
EYE = (6, 78, 59)
GOLD = (227, 185, 89)     # #E3B959


def lerp(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def gradient(size, radius_ratio):
    """Rounded-square diagonal green gradient."""
    w = h = size
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    grad = Image.new("RGB", (w, h))
    px = grad.load()
    span = (w + h) or 1
    for y in range(h):
        for x in range(0, w, 2):
            d = (x + y) / (2 * span) * 2.2   # stretch so corners hit deep green
            d = min(1.0, d)
            if d < 0.55:
                c = lerp(TOP, MID, d / 0.55)
            else:
                c = lerp(MID, BOT, (d - 0.55) / 0.45)
            px[x, y] = c
            if x + 1 < w:
                px[x + 1, y] = c
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    md.rounded_rectangle([0, 0, w - 1, h - 1], radius=int(w * radius_ratio), fill=255)
    img.paste(grad, (0, 0), mask)
    return img


def gradient_full(size):
    grad = gradient(size, 0.0)
    out = Image.new("RGBA", (size, size), (0, 0, 0, 255))
    out.paste(grad, (0, 0), grad)
    return out


def cat_layer(size):
    """Transparent layer with just the cat, sized to `size`."""
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    scale = size / GRID

    def pt(x, y):
        return (x * scale, y * scale)

    def ellipse(cx, cy, rx, ry, fill):
        d.ellipse([(cx - rx) * scale, (cy - ry) * scale,
                   (cx + rx) * scale, (cy + ry) * scale], fill=fill)

    def poly(points, fill):
        d.polygon([pt(x, y) for x, y in points], fill=fill)

    # ears + head
    poly([(18, 27.5), (13.5, 9.8), (26.4, 20.2)], CAT_LO)
    poly([(46, 27.5), (50.5, 9.8), (37.6, 20.2)], CAT_LO)
    ellipse(32, 39, 17.5, 14.5, CAT_LO)
    # highlight pass
    hi = Image.new("RGBA", img.size, (0, 0, 0, 0))
    hd = ImageDraw.Draw(hi)
    hd.ellipse([(32 - 17.5) * scale, (39 - 14.5) * scale,
                (32 + 17.5) * scale, 39 * scale], fill=CAT_HI + (110,))
    hd.polygon([pt(18, 27.5), pt(13.5, 9.8), pt(22.5, 18.5)], fill=CAT_HI + (120,))
    hd.polygon([pt(46, 27.5), pt(50.5, 9.8), pt(41.5, 18.5)], fill=CAT_HI + (120,))
    img.alpha_composite(hi)
    # eyes + gold nose
    ellipse(24, 37.5, 2.2, 2.2, EYE)
    ellipse(40, 37.5, 2.2, 2.2, EYE)
    poly([(32, 43.8), (34.7, 46.3), (32, 48.8), (29.3, 46.3)], GOLD)
    return img


def render(path, size, radius_ratio=0.22, safe_pad=0.0, opaque=False):
    big = size * SS
    bg = gradient_full(big) if opaque else gradient(big, radius_ratio)
    cat = cat_layer(big)
    if safe_pad > 0:
        inner = int(big * (1 - 2 * safe_pad))
        cat_small = cat.resize((inner, inner), Image.LANCZOS)
        off = (big - inner) // 2
        cat = Image.new("RGBA", (big, big), (0, 0, 0, 0))
        cat.paste(cat_small, (off, off), cat_small)
    bg.alpha_composite(cat)
    if opaque:
        flat = Image.new("RGB", bg.size, (6, 78, 59))
        flat.paste(bg, (0, 0), bg)
        bg = flat
    bg.resize((size, size), Image.LANCZOS).save(path)
    print("saved", path)


if __name__ == "__main__":
    out_dir = os.path.join(os.path.dirname(__file__), "..", "public", "icons")
    os.makedirs(out_dir, exist_ok=True)
    render(os.path.join(out_dir, "icon-192.png"), 192, radius_ratio=0.22)
    render(os.path.join(out_dir, "icon-512.png"), 512, radius_ratio=0.22)
    render(os.path.join(out_dir, "icon-maskable-512.png"), 512, safe_pad=0.10, opaque=True)
    render(os.path.join(out_dir, "apple-touch-icon.png"), 180, safe_pad=0.06, opaque=True)
