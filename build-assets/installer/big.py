from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
F = '/sessions/pensive-sleepy-hamilton/tmp/fonts/fonts/Open_Sans/OpenSans-'
box = Image.open('icon.png').convert('RGBA')
BG = (13, 12, 20); CARD = (27, 25, 38)
W0, H0 = 960, 600
def make(s, path):
    W, H = int(W0 * s), int(H0 * s); k = lambda v: int(v * s)
    fnt = lambda w, z: ImageFont.truetype(F + w + '.ttf', k(z))
    c = Image.new('RGBA', (W, H), BG + (255,))
    def glow(x, y, r, col, a):
        g = Image.new('RGBA', (W, H), (0,0,0,0)); ImageDraw.Draw(g).ellipse([k(x-r), k(y-r), k(x+r), k(y+r)], fill=col + (a,))
        c.alpha_composite(g.filter(ImageFilter.GaussianBlur(k(r) / 2)))
    glow(230, 300, 230, (110, 70, 255), 110); glow(240, 210, 140, (255, 140, 70), 70); glow(820, 80, 160, (60, 180, 255), 35)
    # box art with soft fade
    S = k(470); b = box.resize((S, S), Image.LANCZOS)
    m = Image.new('L', (S, S), 0); ImageDraw.Draw(m).ellipse([S*0.06, S*0.04, S*0.94, S*0.98], fill=255)
    b.putalpha(ImageChops.multiply(b.getchannel('A'), m.filter(ImageFilter.GaussianBlur(S / 14))))
    layer = Image.new('RGB', (W, H), (0,0,0)); layer.paste(b.convert('RGB'), (k(232) - S // 2, k(300) - S // 2), b.getchannel('A'))
    c = Image.merge('RGBA', (*ImageChops.screen(c.convert('RGB'), layer).split(), Image.new('L', (W, H), 255)))
    d = ImageDraw.Draw(c)
    # right squircle card (solid colour so live text sits cleanly on it)
    sh = Image.new('RGBA', (W, H), (0,0,0,0)); ImageDraw.Draw(sh).rounded_rectangle([k(452), k(52), k(924), k(552)], radius=k(36), fill=(0,0,0,150))
    c.alpha_composite(sh.filter(ImageFilter.GaussianBlur(k(18))))
    ov = Image.new('RGBA', (W, H), (0,0,0,0)); o = ImageDraw.Draw(ov)
    d = ImageDraw.Draw(c)
    d.rounded_rectangle([k(446), k(44), k(920), k(544)], radius=k(36), fill=CARD + (255,))
    o.rounded_rectangle([k(446), k(44), k(920), k(544)], radius=k(36), outline=(255,255,255,30), width=max(1, k(1.2)))
    x = k(486)
    d.text((x, k(82)), "GOD'S", font=fnt('Light', 26), fill=(214, 212, 228))
    tx = x
    for ch in 'PANDORA':
        d.text((tx, k(108)), ch, font=fnt('Bold', 58), fill=(255,255,255)); tx += d.textlength(ch, font=fnt('Bold', 58)) + k(4)
    d.rounded_rectangle([x, k(188), x + k(64), k(192)], radius=k(2), fill=(255, 184, 107))
    d.text((x, k(204)), 'Every model. Every medium. One creative universe.', font=fnt('Regular', 15), fill=(176, 172, 196))
    # feature pills (squircle chips like the app tabs)
    pills = [('Image', (139,107,255)), ('Video', (255,107,157)), ('Audio', (64,220,160)), ('3D', (79,209,255)), ('Cut', (255,184,107)), ('Live', (183,123,255))]
    px, py = x, k(250)
    for name, col in pills:
        f = fnt('Bold', 12); tw = d.textlength(name, font=f); w = tw + k(30)
        if px + w > k(888): px = x; py += k(40)
        d.rounded_rectangle([px, py, px + w, py + k(30)], radius=k(15), fill=tuple(int(v*0.22 + 27*0.78) for v in col) + (255,))
        o.rounded_rectangle([px, py, px + w, py + k(30)], radius=k(15), outline=col + (130,), width=max(1, k(1)))
        d.ellipse([px + k(11), py + k(11), px + k(19), py + k(19)], fill=col)
        d.text((px + k(24), py + k(6)), name, font=f, fill=(240, 238, 250)); px += w + k(6)
    # info rows
    rows = ['Free & open source · runs on your GPU or your own API keys', 'Installs just for you — no admin rights needed', 'Your library, keys and models are always kept']
    for i, t in enumerate(rows):
        yy = k(318 + i * 28)
        d.rounded_rectangle([x, yy + k(5), x + k(10), yy + k(15)], radius=k(5), fill=(139, 107, 255))
        d.text((x + k(20), yy), t, font=fnt('Regular', 13), fill=(196, 192, 214))
    # progress area: status text sits at y=438 (live label), track drawn around live bar at y=468..474
    d.rounded_rectangle([x - k(4), k(462), k(884), k(480)], radius=k(9), fill=(16, 15, 24))
    o.rounded_rectangle([x - k(4), k(462), k(884), k(480)], radius=k(9), outline=(255,255,255,22), width=max(1,k(1)))
    d.text((x, k(500)), 'Version 0.4.0  ·  © 2026 Haider Bhatti', font=fnt('Regular', 12), fill=(120, 116, 140))
    # window frame
    o.rounded_rectangle([0, 0, W - 1, H - 1], radius=k(14), outline=(255,255,255,24), width=max(1, k(1)))
    c.alpha_composite(ov)
    c.convert('RGB').save(path)
for s, n in [(1, 'bg100'), (1.25, 'bg125'), (1.5, 'bg150'), (2, 'bg200')]:
    make(s, n + '.bmp')
make(1, '/sessions/pensive-sleepy-hamilton/mnt/outputs/_bigbg.png')
print('ok')
