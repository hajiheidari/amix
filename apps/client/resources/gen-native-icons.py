"""Generate Android launcher icons and splash screens from the Amix mark (run from apps/client)."""
import glob, os
from PIL import Image, ImageDraw

BG = '#0e3b43'

def mark(size, scale=1.0, bg=None, rounded=False, circle=False):
    im = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    k = size / 512
    if bg:
        if circle: d.ellipse([0, 0, size - 1, size - 1], fill=bg)
        elif rounded: d.rounded_rectangle([0, 0, size - 1, size - 1], radius=int(112 * k), fill=bg)
        else: d.rectangle([0, 0, size, size], fill=bg)
    off = (1 - scale) * 256
    P = lambda x, y: (int((off + x * scale) * k), int((off + y * scale) * k))
    d.line([P(96, 352), P(192, 248), P(256, 296), P(352, 176), P(416, 216)], fill='#2fd3b5', width=max(2, int(36 * k * scale)), joint='curve')
    r = int(26 * k * scale); cx, cy = P(416, 216); d.ellipse([cx - r, cy - r, cx + r, cy + r], fill='#f5c451')
    d.line([P(96, 400), P(416, 400)], fill='#5f8f96', width=max(1, int(18 * k * scale)))
    return im

res = 'android/app/src/main/res'
sizes = {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}
for dens, s in sizes.items():
    mark(s, 0.8, BG, rounded=True).save(f'{res}/mipmap-{dens}/ic_launcher.png')
    mark(s, 0.8, BG, circle=True).save(f'{res}/mipmap-{dens}/ic_launcher_round.png')
    mark(int(s * 108 / 48), 0.55).save(f'{res}/mipmap-{dens}/ic_launcher_foreground.png')
with open(f'{res}/values/ic_launcher_background.xml', 'w') as f:
    f.write(f'<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">{BG}</color>\n</resources>\n')
for p in glob.glob(f'{res}/drawable*/splash.png'):
    w, h = Image.open(p).size
    sp = Image.new('RGB', (w, h), BG)
    m = mark(int(min(w, h) * 0.35), 0.9)
    sp.paste(m, ((w - m.width) // 2, (h - m.height) // 2), m)
    sp.save(p)
print('ok')
