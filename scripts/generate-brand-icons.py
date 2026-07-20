#!/usr/bin/env python3
"""Generate Cap Android/iOS/web brand icons from assets/branding sources.

Requires: pip install pillow

Sources (preferred):
  assets/branding/icon-light-source.png
  assets/branding/icon-dark-source.png
"""
from __future__ import annotations

import shutil
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
BRAND = ROOT / 'assets' / 'branding'
PUBLIC = ROOT / 'public' / 'icons'
ANDROID_RES = ROOT / 'android' / 'app' / 'src' / 'main' / 'res'
IOS_ICON = ROOT / 'ios' / 'App' / 'App' / 'Assets.xcassets' / 'AppIcon.appiconset' / 'AppIcon-512@2x.png'

NAVY = (1, 19, 43)

LAUNCHER = {
    'mipmap-mdpi': 48,
    'mipmap-hdpi': 72,
    'mipmap-xhdpi': 96,
    'mipmap-xxhdpi': 144,
    'mipmap-xxxhdpi': 192,
}
FOREGROUND = {
    'mipmap-mdpi': 108,
    'mipmap-hdpi': 162,
    'mipmap-xhdpi': 216,
    'mipmap-xxhdpi': 324,
    'mipmap-xxxhdpi': 432,
}


def nearly(c, target, tol=28):
    return all(abs(int(a) - int(b)) <= tol for a, b in zip(c[:3], target))


def trim_to_content(im: Image.Image, bg_tol=12) -> Image.Image:
    rgba = im.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    bg = tuple(sum(c[i] for c in corners) // 4 for i in range(3))

    def is_bg(x, y):
        r, g, b, a = px[x, y]
        if a < 8:
            return True
        return abs(r - bg[0]) <= bg_tol and abs(g - bg[1]) <= bg_tol and abs(b - bg[2]) <= bg_tol

    top = 0
    while top < h and all(is_bg(x, top) for x in range(w)):
        top += 1
    bottom = h - 1
    while bottom >= 0 and all(is_bg(x, bottom) for x in range(w)):
        bottom -= 1
    left = 0
    while left < w and all(is_bg(left, y) for y in range(h)):
        left += 1
    right = w - 1
    while right >= 0 and all(is_bg(right, y) for y in range(h)):
        right -= 1
    if right <= left or bottom <= top:
        return rgba
    return rgba.crop((left, top, right + 1, bottom + 1))


def make_square(im: Image.Image, size: int, fill=(0, 0, 0, 0)) -> Image.Image:
    im = im.convert('RGBA')
    im.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas = Image.new('RGBA', (size, size), fill)
    canvas.paste(im, ((size - im.width) // 2, (size - im.height) // 2), im)
    return canvas


def replace_near_white_with_navy(im: Image.Image, tol=30) -> Image.Image:
    rgba = im.convert('RGBA')
    out = []
    for r, g, b, a in rgba.getdata():
        if r > 255 - tol and g > 255 - tol and b > 255 - tol:
            out.append(NAVY + (255,))
        else:
            out.append((r, g, b, a))
    rgba.putdata(out)
    return rgba


def extract_mark(im: Image.Image, *, light: bool) -> Image.Image:
    rgba = im.convert('RGBA')
    px = rgba.load()
    w, h = rgba.size
    out = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    opx = out.load()
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if light:
                if r >= 210 and g >= 210 and b >= 210:
                    continue
            elif nearly((r, g, b), NAVY, 40):
                continue
            opx[x, y] = (r, g, b, 255)
    return out


def place_in_safe_zone(mark: Image.Image, canvas_size: int, safe_ratio=0.62) -> Image.Image:
    canvas = Image.new('RGBA', (canvas_size, canvas_size), (0, 0, 0, 0))
    target = int(canvas_size * safe_ratio)
    fitted = mark.copy()
    fitted.thumbnail((target, target), Image.Resampling.LANCZOS)
    canvas.paste(fitted, ((canvas_size - fitted.width) // 2, (canvas_size - fitted.height) // 2), fitted)
    return canvas


def save(im: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, 'PNG')
    print('wrote', path.relative_to(ROOT), im.size)


def main() -> None:
    light_src = BRAND / 'icon-light-source.png'
    dark_src = BRAND / 'icon-dark-source.png'
    if not light_src.exists() or not dark_src.exists():
        raise SystemExit(f'Missing sources under {BRAND}')

    light_sq = trim_to_content(Image.open(light_src))
    dark_sq = replace_near_white_with_navy(trim_to_content(Image.open(dark_src)))
    light_master = make_square(light_sq, 1024, (255, 255, 255, 255))
    dark_master = make_square(dark_sq, 1024, NAVY + (255,))

    save(light_master, BRAND / 'icon-light.png')
    save(dark_master, BRAND / 'icon-dark.png')

    fg_light = extract_mark(light_master, light=True)
    fg_dark = extract_mark(dark_master, light=False)
    save(fg_light, BRAND / 'icon-mark-light.png')
    save(fg_dark, BRAND / 'icon-mark-dark.png')

    mono = fg_light.copy()
    mono.putdata([(255, 255, 255, a if a > 20 else 0) for r, g, b, a in mono.getdata()])
    save(mono, BRAND / 'icon-monochrome.png')

    save(light_master.resize((192, 192), Image.Resampling.LANCZOS), PUBLIC / 'icon-192.png')
    save(light_master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-512.png')
    save(light_master.resize((192, 192), Image.Resampling.LANCZOS), PUBLIC / 'favicon.png')
    save(light_master, PUBLIC / 'logo-brand.png')
    save(light_master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-light.png')
    save(dark_master.resize((512, 512), Image.Resampling.LANCZOS), PUBLIC / 'icon-dark.png')
    save(make_square(fg_light, 512), PUBLIC / 'icon-mark-light.png')
    save(make_square(fg_dark, 512), PUBLIC / 'icon-mark-dark.png')

    for name, size in [('icon-192.svg', 192), ('icon-512.svg', 512)]:
        (PUBLIC / name).write_text(
            f'''<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 {size} {size}">
  <rect width="{size}" height="{size}" rx="{int(size * 0.22)}" fill="#FFFFFF"/>
  <text x="50%" y="54%" text-anchor="middle" dominant-baseline="middle" font-family="Arial,Helvetica,sans-serif" font-size="{int(size * 0.55)}" font-weight="700" fill="#011327">D</text>
  <circle cx="{int(size * 0.34)}" cy="{int(size * 0.68)}" r="{int(size * 0.055)}" fill="#FF6A00"/>
</svg>
'''
        )
        print('wrote', f'public/icons/{name}')

    ios_rgb = Image.new('RGB', (1024, 1024), (255, 255, 255))
    ios_rgba = light_master.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGBA')
    ios_rgb.paste(ios_rgba, mask=ios_rgba.split()[-1])
    save(ios_rgb, IOS_ICON)
    save(ios_rgb, BRAND / 'AppIcon-1024-light.png')
    save(dark_master.resize((1024, 1024), Image.Resampling.LANCZOS).convert('RGB'), BRAND / 'AppIcon-1024-dark.png')

    for folder, size in LAUNCHER.items():
        light_i = light_master.resize((size, size), Image.Resampling.LANCZOS)
        dark_i = dark_master.resize((size, size), Image.Resampling.LANCZOS)
        save(light_i, ANDROID_RES / folder / 'ic_launcher.png')
        save(light_i, ANDROID_RES / folder / 'ic_launcher_round.png')
        night = ANDROID_RES / folder.replace('mipmap-', 'mipmap-night-')
        save(dark_i, night / 'ic_launcher.png')
        save(dark_i, night / 'ic_launcher_round.png')

    for folder, size in FOREGROUND.items():
        fl = place_in_safe_zone(fg_light, size)
        fd = place_in_safe_zone(fg_dark, size)
        fm = place_in_safe_zone(mono, size)
        save(fl, ANDROID_RES / folder / 'ic_launcher_foreground.png')
        save(fm, ANDROID_RES / folder / 'ic_launcher_monochrome.png')
        night = ANDROID_RES / folder.replace('mipmap-', 'mipmap-night-')
        save(fd, night / 'ic_launcher_foreground.png')
        save(fm, night / 'ic_launcher_monochrome.png')

    print('DONE')


if __name__ == '__main__':
    main()
