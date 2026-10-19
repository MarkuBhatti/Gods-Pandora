# Locations page artwork: same card as bg*.bmp, with labels + field/button shapes baked in (live controls sit on top)
from PIL import Image, ImageDraw, ImageFont
F = '/sessions/pensive-sleepy-hamilton/tmp/fonts/fonts/Open_Sans/OpenSans-'
CARD = (27, 25, 38); FIELD = (16, 15, 24); BTN = (42, 39, 53); ACC = (139, 107, 255)
def make(s, src, out):
    k = lambda v: int(round(v * s)); fnt = lambda w, z: ImageFont.truetype(F + w + '.ttf', k(z))
    c = Image.open(src).convert('RGBA'); d = ImageDraw.Draw(c)
    d.rectangle([k(476), k(308), k(904), k(494)], fill=CARD + (255,))
    ov = Image.new('RGBA', c.size, (0, 0, 0, 0)); o = ImageDraw.Draw(ov)
    def field(y): 
        d.rounded_rectangle([k(482), k(y), k(786), k(y + 32)], radius=k(9), fill=FIELD + (255,))
        o.rounded_rectangle([k(482), k(y), k(786), k(y + 32)], radius=k(9), outline=(255, 255, 255, 26), width=max(1, k(1)))
        d.rounded_rectangle([k(794), k(y), k(884), k(y + 32)], radius=k(9), fill=BTN + (255,))
        o.rounded_rectangle([k(794), k(y), k(884), k(y + 32)], radius=k(9), outline=(255, 255, 255, 30), width=max(1, k(1)))
    d.text((k(486), k(300)), 'Install location', font=fnt('Bold', 12), fill=(222, 220, 236)); field(320)
    d.text((k(486), k(364)), 'Library, downloads & AI models', font=fnt('Bold', 12), fill=(222, 220, 236))
    t = 'needs 5–60 GB · pick a big drive'; f = fnt('Regular', 11)
    d.text((k(884) - d.textlength(t, font=f), k(365)), t, font=f, fill=(140, 136, 160)); field(384)
    d.text((k(486), k(424)), 'Your keys, creations and models move there automatically.', font=fnt('Regular', 11), fill=(140, 136, 160))
    d.rounded_rectangle([k(660), k(454), k(764), k(490)], radius=k(11), fill=BTN + (255,))
    o.rounded_rectangle([k(660), k(454), k(764), k(490)], radius=k(11), outline=(255, 255, 255, 30), width=max(1, k(1)))
    d.rounded_rectangle([k(772), k(454), k(884), k(490)], radius=k(11), fill=ACC + (255,))
    c.alpha_composite(ov); c.convert('RGB').save(out)
for s, n in [(1, '100'), (1.25, '125'), (1.5, '150'), (2, '200')]:
    make(s, 'bg' + n + '.bmp', 'loc' + n + '.bmp')
make(1, 'bg100.bmp', '/sessions/pensive-sleepy-hamilton/mnt/outputs/_loc.png'); print('ok')
