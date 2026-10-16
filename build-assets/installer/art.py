from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
F = '/sessions/pensive-sleepy-hamilton/tmp/fonts/fonts/Open_Sans/OpenSans-'
def font(w, s): return ImageFont.truetype(F + w + '.ttf', s)
box = Image.open('icon.png').convert('RGBA')
BG = (14, 14, 18)
GOLD = (255, 190, 120); VIO = (170, 150, 255)

def radial_mask(w, h, inner=0.55, outer=1.0):
    m = Image.new('L', (w, h), 0); d = ImageDraw.Draw(m)
    cx, cy = w / 2, h / 2; steps = 60
    for i in range(steps, 0, -1):
        t = i / steps; r = outer * t
        v = 255 if t <= inner else int(255 * (1 - (t - inner) / (1 - inner)))
        d.ellipse([cx - r * w / 2, cy - r * h / 2, cx + r * w / 2, cy + r * h / 2], fill=v)
    return m.filter(ImageFilter.GaussianBlur(w / 30))

def tracked(draw, xy, text, fnt, fill, track):
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=fnt, fill=fill)
        x += draw.textlength(ch, font=fnt) + track
    return x

def width_tracked(draw, text, fnt, track):
    return sum(draw.textlength(c, font=fnt) + track for c in text) - track

def glow(canvas, center, radius, color, alpha):
    g = Image.new('RGBA', canvas.size, (0, 0, 0, 0)); d = ImageDraw.Draw(g)
    x, y = center; d.ellipse([x - radius, y - radius, x + radius, y + radius], fill=color + (alpha,))
    g = g.filter(ImageFilter.GaussianBlur(radius / 2))
    canvas.alpha_composite(g)

def vignette(img, strength=0.65):
    w, h = img.size
    m = radial_mask(w, h, 0.35, 1.25)
    dark = Image.new('RGBA', (w, h), BG + (255,))
    inv = ImageChops.invert(m).point(lambda v: int(v * strength))
    return Image.composite(dark, img, inv)

def grid(img, step, alpha):
    d = ImageDraw.Draw(img)
    w, h = img.size
    for x in range(0, w, step): d.line([(x, 0), (x, h)], fill=(255, 255, 255, alpha))
    for y in range(0, h, step): d.line([(0, y), (w, y)], fill=(255, 255, 255, alpha))

# ── Splash 1280x720 (shown at 640x360 on 100 % scaling) ──
def splash(W=1280, H=720):
    c = Image.new('RGBA', (W, H), BG + (255,))
    ov = Image.new('RGBA', (W, H), (0, 0, 0, 0)); grid(ov, 40, 6); c.alpha_composite(ov)
    glow(c, (int(W * .745), int(H * .52)), 300, (110, 70, 255), 90)
    glow(c, (int(W * .765), int(H * .30)), 180, (255, 150, 80), 60)
    S = 640; b = box.resize((S, S), Image.LANCZOS)
    b.putalpha(ImageChops.multiply(b.getchannel('A'), radial_mask(S, S, 0.62, 1.0)))
    c.alpha_composite(b, (int(W * .745 - S / 2), int(H * .52 - S / 2)))
    c = vignette(c, .55)
    d = ImageDraw.Draw(c)
    x0 = 92
    d.text((x0, 196), "GOD'S", font=font('Light', 44), fill=(220, 220, 228))
    tracked(d, (x0 - 4, 238), 'PANDORA', font('Bold', 104), (255, 255, 255), 6)
    d.line([(x0, 378), (x0 + 120, 378)], fill=GOLD, width=3)
    d.text((x0, 396), 'Every model. Every medium. One creative universe.', font=font('Regular', 26), fill=(190, 190, 205))
    d.text((x0, 446), 'Version 0.4.0', font=font('Light', 24), fill=VIO)
    tracked(d, (x0, H - 92), 'IMAGE · VIDEO · AUDIO · 3D · LIVE VISUALS · AUTO EDIT · COLOR', font('Regular', 16), (130, 130, 145), 3)
    d.text((x0, H - 60), '© 2026 Haider Bhatti  ·  Free & open source  ·  Runs on your GPU or your own API keys', font=font('Regular', 16), fill=(105, 105, 120))
    # thin frame
    d.rectangle([0, 0, W - 1, H - 1], outline=(60, 60, 72))
    return c.convert('RGB')

# ── Welcome / finish sidebar 328x628 (2x of 164x314) ──
def sidebar(W=328, H=628, finish=False):
    c = Image.new('RGBA', (W, H), BG + (255,))
    glow(c, (W // 2, 230), 170, (110, 70, 255), 110)
    glow(c, (W // 2, 150), 110, (255, 150, 80), 70)
    S = 420; b = box.resize((S, S), Image.LANCZOS)
    b.putalpha(ImageChops.multiply(b.getchannel('A'), radial_mask(S, S, 0.6, 1.0)))
    c.alpha_composite(b, ((W - S) // 2, 20))
    c = vignette(c, .35)
    d = ImageDraw.Draw(c)
    f1 = font('Light', 26); f2 = font('Bold', 46)
    w1 = d.textlength("GOD'S", font=f1); d.text(((W - w1) / 2, 440), "GOD'S", font=f1, fill=(215, 215, 225))
    w2 = width_tracked(d, 'PANDORA', f2, 3); tracked(d, ((W - w2) / 2, 466), 'PANDORA', f2, (255, 255, 255), 3)
    d.line([(W / 2 - 40, 538), (W / 2 + 40, 538)], fill=GOLD, width=2)
    f3 = font('Regular', 16)
    for i, t in enumerate(['Every model. Every medium.', 'One creative universe.']):
        w = d.textlength(t, font=f3); d.text(((W - w) / 2, 552 + i * 22), t, font=f3, fill=(170, 170, 185))
    d.line([(W - 1, 0), (W - 1, H)], fill=(45, 45, 55), width=2)
    return c.convert('RGB')

# ── Header 300x114 (2x of 150x57) ──
def header(W=300, H=114):
    c = Image.new('RGBA', (W, H), (24, 24, 30, 255))
    glow(c, (W - 60, H // 2), 60, (110, 70, 255), 120)
    S = 112; b = box.resize((S, S), Image.LANCZOS)
    b.putalpha(ImageChops.multiply(b.getchannel('A'), radial_mask(S, S, 0.65, 1.0)))
    c.alpha_composite(b, (W - S - 4, 1))
    return c.convert('RGB')

splash().save('splash_hd.png')
splash().resize((640, 360), Image.LANCZOS).save('splash.bmp')
sidebar().save('sidebar.bmp')
header().save('header.bmp')
splash().save('/sessions/pensive-sleepy-hamilton/mnt/outputs/_splash.png')
s2 = Image.new('RGB', (328 + 300 + 20, 628), (40, 40, 40)); s2.paste(sidebar(), (0, 0)); s2.paste(header(), (348, 0)); s2.save('/sessions/pensive-sleepy-hamilton/mnt/outputs/_side.png')
print('ok')
