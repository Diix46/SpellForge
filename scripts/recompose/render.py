"""A French card, sharp: the English HD scan with its text retypeset in French.

The English high-resolution scan keeps the art, frame, mana cost, set symbol
and artist line. Name, type line and text box are erased (letter strokes are
found against a median-blurred background, then inpainted) and set again in
French, in the fonts the cards are printed with:

  - Beleren Bold (modern frame) or Matrix Bold (2003 frame) for name and type,
    at the size, left edge and baseline measured on the English scans;
  - Plantin (standing in for MPlantin) for rules and flavor text, at most
    37 px, the largest size measured on the English scans;
  - Mana (OFL) for the symbols, with Plantin Bold figures.

Those fonts are read from the machine (PRISM_FONT_* or ~/Library/Fonts) and
never bundled: see assets/LICENSES.md.

`check()` is the quality gate: it retypesets the ENGLISH text on the same card
and measures how far the result is from the original scan. A card whose
geometry the templates do not fit (an unusual frame, a planeswalker box) fails
it and keeps its official scan.
"""
import json
import os
import re
from pathlib import Path

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

ASSETS = Path(__file__).parent / 'assets'
FONTS_DIR = Path.home() / 'Library/Fonts'


def _font_path(env, default):
    return os.environ.get(env) or str(FONTS_DIR / default)


FONT = {
    'title': _font_path('PRISM_FONT_TITLE', 'Beleren2016-Bold.ttf'),
    'title_old': _font_path('PRISM_FONT_TITLE_OLD', 'Matrix-Bold.ttf'),
    'text': _font_path('PRISM_FONT_TEXT', 'PlantinMTProRg.TTF'),
    'italic': _font_path('PRISM_FONT_TEXT_ITALIC', 'PlantinMTProRgIt.TTF'),
    'digits': _font_path('PRISM_FONT_DIGITS', 'PlantinMTProBold.TTF'),
    'mana': str(ASSETS / 'mana.ttf'),
    'label': str(ASSETS / 'Barlow-SemiBold.ttf'),
}
GLYPH = json.loads((ASSETS / 'mana-glyphs.json').read_text(encoding='utf-8'))


def missing_fonts():
    return [k for k, p in FONT.items() if not Path(p).is_file()]


# ---- geometry, on Scryfall's 745x1040 PNG ------------------------------------

W, H = 745, 1040
MODERN = {'2015', 'future'}
OLD = {'2003'}

# name/type bars and text box per frame family; right edges are refined per
# card (mana cost, set symbol) and the box bottom by the power/toughness box.
LAYOUT = {
    'modern': dict(name=(58, 58, 690, 102), type=(58, 588, 690, 638), box=(58, 652, 686, 948), box_pt=928),
    # the old box's right border sits close: stop short of it or the erase smears it
    'old': dict(name=(58, 60, 690, 102), type=(58, 590, 690, 636), box=(60, 656, 682, 930), box_pt=912,
                extra=[(58, 96, 690, 108)]),
}

# Measured pixel for pixel on the English HD scans (calibrate.py): size, left
# edge, baseline as a share of the bar height, tracking in pixels.
TITLE_SET = {
    ('modern', 'name'): dict(size=40.0, dx=4.0, dy=0.7955, tracking=0.0),
    ('modern', 'type'): dict(size=33.5, dx=3.0, dy=0.71, tracking=0.0),
    ('old', 'name'): dict(size=44.5, dx=10.0, dy=0.905, tracking=0.6),
    ('old', 'type'): dict(size=36.0, dx=6.0, dy=0.77, tracking=0.0),
}
TEXT_MAX = 37

MANA_BG = {'W': (248, 246, 216), 'U': (193, 215, 233), 'B': (186, 177, 171), 'R': (228, 153, 119), 'G': (163, 192, 149)}
GENERIC_BG = (190, 184, 178)
DARK_INK, LIGHT_INK = (18, 16, 14), (250, 246, 238)


def family_of(card):
    if card.get('frame') in MODERN:
        return 'modern'
    if card.get('frame') in OLD:
        return 'old'
    return None


def supported(fr, en):
    """Only the plain frames the templates were calibrated on."""
    fam = family_of(fr)
    # Effects that change colours or ornaments, not where the text sits: the
    # quality gate decides for each card.
    effects = set(fr.get('frame_effects') or []) - {'legendary', 'enchantment', 'miracle', 'nyxtouched', 'etched', 'devoid', 'extendedart', 'inverted', 'showcase', 'colorshifted', 'snow'}
    return (fam is not None and fr.get('layout') == 'normal' and fr.get('border_color') in ('black', 'yellow', 'white')
            and not effects
            and fr.get('printed_name') and fr.get('printed_type_line') is not None
            and 'Planeswalker' not in (en.get('type_line') or '') and 'Battle' not in (en.get('type_line') or ''))


def regions(img, en, fam):
    """The bars and box for this very card."""
    lay = LAYOUT[fam]
    symbols = len(re.findall(r'\{[^}]+\}', en.get('mana_cost') or ''))
    name = lay['name'][:2] + (lay['name'][2] - symbols * 37 - (14 if symbols else 0), lay['name'][3])
    # up to the set symbol: the English type line may run right to it
    type_ = lay['type'][:2] + (set_symbol_left(img, lay['type']) - 2, lay['type'][3])
    has_pt = en.get('power') is not None or en.get('toughness') is not None or en.get('loyalty') is not None
    box = lay['box'][:3] + ((lay['box_pt'] if has_pt else lay['box'][3]),)
    extra = list(lay.get('extra', []))
    if fam == 'old' and has_pt:
        # the last line runs left of the power/toughness box (no holofoil stamp
        # on this frame)
        extra.append((lay['box'][0], lay['box_pt'] - 40, 545, lay['box_pt'] + 22))
    if fam == 'modern' and has_pt:
        # the last line runs under the power/toughness box, left of it
        # (tall enough, overlapping the box, for the erase's median to see
        # background; down to the frame, in two parts around the holofoil stamp
        # at the bottom center, which the erase would smear)
        extra.append((lay['box'][0], lay['box_pt'] - 40, 320, lay['box_pt'] + 30))
        extra.append((420, lay['box_pt'] - 40, 570, lay['box_pt'] + 30))
        # and above the stamp itself, where a centered last line ends
        extra.append((320, lay['box_pt'] - 40, 420, lay['box_pt'] + 15))
    extra = [(e[0], e[1], min(e[2], name[2]) if e[1] < 200 else e[2], e[3]) for e in extra]
    return dict(name=name, type=type_, box=box, extra=extra)


def set_symbol_left(img, bar):
    """Left edge of the set symbol, found from the right end of the type bar."""
    x0, y0, x1, y1 = bar
    gray = cv2.cvtColor(img[y0 + 6:y1 - 6, :], cv2.COLOR_RGB2GRAY).astype(np.int16)
    ref = np.median(gray[:, x0 + 4:x0 + 40])
    dev = np.abs(gray - ref).max(0)
    x, quiet = x1 - 4, 0
    while x > x1 - 200:
        quiet = quiet + 1 if dev[x] < 40 else 0
        if quiet >= 10:
            return x + 10
        x -= 1
    return x1 - 60


# ---- erase ---------------------------------------------------------------------

def erase(img, region, dark_text=True, ink_only=False):
    """Inpaint the letters in `region`: strokes stand out from a median-blurred background.

    `ink_only` keeps to the printed ink itself (near black, or near white on a
    dark box): a watermark under the rules text stands out from the background
    too, but pale and coloured, and must survive the erase.
    """
    x0, y0, x1, y1 = region
    crop = img[y0:y1, x0:x1]
    gray = cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY).astype(np.int16)
    bg = cv2.medianBlur(cv2.cvtColor(crop, cv2.COLOR_RGB2GRAY), 31).astype(np.int16)
    diff = (bg - gray) if dark_text else (gray - bg)
    strokes = diff > 18
    if ink_only:
        strokes &= (gray < 110) if dark_text else (gray > 170)
    mask = strokes.astype(np.uint8) * 255
    mask = cv2.dilate(mask, np.ones((5, 5), np.uint8), iterations=2)
    img[y0:y1, x0:x1] = cv2.inpaint(crop, mask, 7, cv2.INPAINT_TELEA)


def luminance(img, region):
    x0, y0, x1, y1 = region
    return float(cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY).mean())


# ---- titles --------------------------------------------------------------------

def measure_line(img, box, dark_text):
    """Where the scan prints the line in `box`: left edge, baseline and cap
    height of its letters (box-relative), or None when no text reads there.

    Scans are not cropped alike and the old frames were not typeset alike:
    the French line takes the English one's place, card by card."""
    x0, y0, x1, y1 = box
    gray = cv2.cvtColor(img[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY).astype(np.int16)
    bg = cv2.medianBlur(gray.astype(np.uint8), 31).astype(np.int16)
    diff = (bg - gray) if dark_text else (gray - bg)
    ink = (diff > 35).astype(np.uint8)
    ink[ink.mean(1) > 0.5, :] = 0  # the bar's own edges
    n, _, stats, _ = cv2.connectedComponentsWithStats(ink, 8)
    w = x1 - x0
    # Not the bar's own curled ends, at its left and right edges.
    letters = [stats[i] for i in range(1, n)
               if 6 <= stats[i, cv2.CC_STAT_HEIGHT] <= 60 and stats[i, cv2.CC_STAT_WIDTH] <= 80 and stats[i, cv2.CC_STAT_AREA] >= 10
               and stats[i, cv2.CC_STAT_LEFT] > 4 and stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH] < w - 4]
    if len(letters) < 3:
        return None
    bottoms = np.array([s[1] + s[3] for s in letters])
    baseline = float(np.median(bottoms))  # descenders are the few
    # Width is the steadiest measure: how wide the English line prints.
    right = float(max(s[0] + s[2] for s in letters))
    left = float(min(s[0] for s in letters))
    return dict(left=left, baseline=baseline, width=right - left)


_CAP_RATIO = {}


def cap_ratio(path):
    """Cap height of a font, per point of size."""
    if path not in _CAP_RATIO:
        f = ImageFont.truetype(path, 200)
        b = f.getbbox('H')
        _CAP_RATIO[path] = (b[3] - b[1]) / 200
    return _CAP_RATIO[path]


def set_title(im, box, text, fam, part, color, measured=None, measured_text=None, k=4):
    """Name or type line where and as large as the scan printed it (measured),
    else at the calibrated place and size; smaller only when too long."""
    x0, y0, x1, y1 = box
    p = dict(TITLE_SET[(fam, part)])
    path = FONT['title'] if fam == 'modern' else FONT['title_old']
    if measured and measured_text:
        # The size that gives the English line its printed width, tracking kept.
        f = ImageFont.truetype(path, 100)
        natural = f.getbbox(measured_text)
        per_pt = (natural[2] - natural[0]) / 100
        size = (measured['width'] - p['tracking'] * (len(measured_text) - 1)) / per_pt if per_pt else p['size']
        # A measure far from the calibration read something else (an ornament).
        if 0.8 * p['size'] <= size <= 1.2 * p['size']:
            p.update(size=size, dx=measured['left'] - natural[0] * size / 100, dy=measured['baseline'] / (y1 - y0))
    size = p['size']

    def width(sz):
        f = ImageFont.truetype(path, int(sz * k))
        return (f.getlength(text) + p['tracking'] * k * (len(text) - 1)) / k
    while size > 16 and width(size) > x1 - x0 - p['dx'] - 6:
        size -= 0.5
    f = ImageFont.truetype(path, int(size * k))
    layer = Image.new('RGBA', ((x1 - x0) * k, (y1 - y0) * k), color + (0,))
    d = ImageDraw.Draw(layer)
    base_y = p['dy'] * (y1 - y0) * k
    for i, ch in enumerate(text):
        x = p['dx'] * k + f.getlength(text[:i]) + i * p['tracking'] * k
        d.text((x, base_y), ch, font=f, fill=color + (255,), anchor='ls')
    im.alpha_composite(layer.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))


# ---- rules and flavor text ------------------------------------------------------

TOKEN = re.compile(r'\{([^}]+)\}')


def runs(paragraph, italic=False):
    """(kind, value, italic) runs; reminder text in parentheses is italic."""
    out, depth = [], italic
    for part in re.split(r'(\{[^}]+\}|\(|\))', paragraph):
        if not part:
            continue
        if part == '(':
            depth = True
            out.append(('text', '(', True))
        elif part == ')':
            out.append(('text', ')', True))
            depth = italic
        elif TOKEN.fullmatch(part):
            out.append(('sym', part[1:-1], depth))
        else:
            out.append(('text', part, depth))
    return out


def drawable(sym):
    """Whether draw_symbol knows this symbol (a card with others keeps its scan)."""
    parts = sym.upper().split('/')
    if len(parts) == 2:
        return parts[1] == 'P' or all(p.isdigit() or p.lower() in GLYPH for p in parts)
    key = sym.lower()
    return key.isdigit() or key in ('x', 't', 'q', 'e') or key in GLYPH


def draw_symbol(draw, x, y, size, sym, stroke):
    key = sym.lower().replace('/', '')
    r = size / 2
    ink = (12, 12, 12)
    parts = sym.upper().split('/')
    if len(parts) == 2 and parts[1] != 'P':
        # Hybrid: the circle split along the diagonal, one symbol in each half.
        a, b = parts
        draw.pieslice([x, y, x + size, y + size], 135, 315, fill=MANA_BG.get(a, GENERIC_BG))
        draw.pieslice([x, y, x + size, y + size], -45, 135, fill=MANA_BG.get(b, GENERIC_BG))
        for part, (cx, cy) in ((a, (x + r * 0.62, y + r * 0.62)), (b, (x + r * 1.38, y + r * 1.38))):
            if part.isdigit():
                f = ImageFont.truetype(FONT['digits'], int(size * 0.5))
                draw.text((cx, cy), part, font=f, fill=ink, anchor='mm')
            elif GLYPH.get(part.lower()):
                f = ImageFont.truetype(FONT['mana'], int(size * 0.42))
                draw.text((cx, cy), GLYPH[part.lower()], font=f, fill=ink, anchor='mm')
        return
    if len(parts) == 2:
        # Phyrexian: the color's circle with the phi glyph.
        draw.ellipse([x, y, x + size, y + size], fill=MANA_BG.get(parts[0], GENERIC_BG))
        gf = ImageFont.truetype(FONT['mana'], int(size * 0.8))
        draw.text((x + r, y + r + size * 0.02), GLYPH.get('p', 'P'), font=gf, fill=ink, anchor='mm', stroke_width=stroke, stroke_fill=ink)
        return
    if key == 'e':
        # Energy prints as a bare black glyph, no circle.
        gf = ImageFont.truetype(FONT['mana'], int(size * 0.95))
        draw.text((x + r, y + r), GLYPH['energy'], font=gf, fill=ink, anchor='mm', stroke_width=stroke, stroke_fill=ink)
        return
    draw.ellipse([x, y, x + size, y + size], fill=MANA_BG.get(sym.upper(), GENERIC_BG))
    if key.isdigit() or key == 'x':
        # Generic costs: a heavy numeral, as printed (Mana's is thin).
        df = ImageFont.truetype(FONT['digits'], int(size * 0.95))
        draw.text((x + r, y + r + size * 0.05), sym.upper(), font=df, fill=ink, anchor='mm', stroke_width=stroke, stroke_fill=ink)
        return
    glyph = {'t': GLYPH.get('tap'), 'q': GLYPH.get('untap')}.get(key) or GLYPH.get(key)
    if glyph:
        gf = ImageFont.truetype(FONT['mana'], int(size * 0.8))
        draw.text((x + r, y + r + size * 0.02), glyph, font=gf, fill=ink, anchor='mm', stroke_width=stroke, stroke_fill=ink)


def layout(paragraphs, width, size, fonts):
    """Word-wrap runs into lines of (kind, value, italic, width); 'gap' between paragraphs."""
    regular, italic = fonts
    sym = size * 0.86
    space = regular.getlength(' ')
    lines_out = []
    for paragraph in paragraphs:
        words = []
        for kind, value, it in paragraph:
            if kind == 'sym':
                words.append([('sym', value, it, sym + 3)])
                continue
            for i, w in enumerate(re.split(r'(\s+)', value)):
                if not w:
                    continue
                if w.isspace():
                    words.append(None)
                    continue
                piece = ('text', w, it, (italic if it else regular).getlength(w))
                # glued to the previous word when no space separates them
                if words and words[-1] is not None and i == 0:
                    words[-1].append(piece)
                else:
                    words.append([piece])
        line, lw = [], 0.0
        for w in words:
            if w is None:
                if line:
                    line.append(('space', ' ', False, space))
                    lw += space
                continue
            ww = sum(p[3] for p in w)
            if lw + ww > width and line:
                while line and line[-1][0] == 'space':
                    lw -= line.pop()[3]
                lines_out.append(line)
                line, lw = [], 0.0
            line.extend(w)
            lw += ww
        while line and line[-1][0] == 'space':
            line.pop()
        lines_out.append(line)
        lines_out.append('gap')
    if lines_out and lines_out[-1] == 'gap':
        lines_out.pop()
    return lines_out


def typeset_box(im, box, rules, flavor, color, divider, k=4):
    x0, y0, x1, y1 = box
    pad_x, pad_y = 10, 6
    width, height = x1 - x0 - 2 * pad_x, y1 - y0 - 2 * pad_y
    paragraphs = [runs(p) for p in rules.split('\n')] if rules else []
    flavor_pars = [runs(p, italic=True) for p in (flavor or '').split('\n') if p]
    for size in range(TEXT_MAX, 15, -1):
        fonts = (ImageFont.truetype(FONT['text'], size), ImageFont.truetype(FONT['italic'], size))
        body = layout(paragraphs, width, size, fonts)
        fl = layout(flavor_pars, width, size, fonts) if flavor_pars else []
        # Printed cards set the text tight: little leading, small paragraph gaps.
        lh, gap = size * 1.02, size * 0.3
        total = sum(gap if ln == 'gap' else lh for ln in body) + ((gap * 1.2 + sum(0 if ln == 'gap' else lh for ln in fl)) if fl else 0)
        if total <= height:
            break
    else:
        return False
    # Drawn 4x larger then scaled down: glyphs keep their shapes, and a
    # quarter-pixel stroke brings Plantin to MPlantin's printed weight.
    big = (ImageFont.truetype(FONT['text'], size * k), ImageFont.truetype(FONT['italic'], size * k))
    layer = Image.new('RGBA', ((x1 - x0) * k, (y1 - y0) * k), color + (0,))
    draw = ImageDraw.Draw(layer)
    y = pad_y + (height - total) / 2

    def put(lines, gap_mul):
        nonlocal y
        for line in lines:
            if line == 'gap':
                y += gap * gap_mul
                continue
            x = pad_x
            for kind, value, it, w in line:
                if kind == 'sym':
                    s = size * 0.86
                    draw_symbol(draw, x * k, (y + (lh - s) / 2 + size * 0.04) * k, s * k, value, stroke=k // 2)
                elif kind == 'text':
                    draw.text((x * k, (y + lh * 0.82) * k), value, font=big[1] if it else big[0], fill=color + (255,),
                              anchor='ls', stroke_width=0 if it else 1, stroke_fill=color + (255,))
                x += w
            y += lh
    put(body, 1.0)
    if fl:
        y += gap
        if divider:
            draw.line([(width * 0.12 * k, (y - gap * 0.5) * k), ((x1 - x0 - width * 0.12) * k, (y - gap * 0.5) * k)],
                      fill=color + (200,), width=k)
        y += gap * 0.2
        put(fl, 0.0)
    im.alpha_composite(layer.resize((x1 - x0, y1 - y0), Image.LANCZOS), (x0, y0))
    return True


def relabel_language(im, label='FR'):
    """The modern frame prints "SET • EN" bottom left: the last two glyphs become the label."""
    x0, y0, x1, y1 = 40, 984, 138, 1012
    arr = np.array(im.convert('RGB'))
    crop = cv2.cvtColor(arr[y0:y1, x0:x1], cv2.COLOR_RGB2GRAY)
    _, _, stats, _ = cv2.connectedComponentsWithStats((crop > 140).astype(np.uint8), 8)
    glyphs = sorted((s for s in stats[1:] if s[3] >= 8), key=lambda s: s[0])
    if len(glyphs) < 2:
        return False
    e, n = glyphs[-2], glyphs[-1]
    gx0, gy0 = x0 + e[0] - 1, y0 + min(e[1], n[1]) - 1
    gx1, gy1 = x0 + n[0] + n[2] + 1, y0 + max(e[1] + e[3], n[1] + n[3]) + 1
    d = ImageDraw.Draw(im)
    d.rectangle([gx0, gy0, gx1, gy1], fill=tuple(int(v) for v in arr[gy0 - 3, gx0]))
    f = ImageFont.truetype(FONT['label'], int((gy1 - gy0 - 2) / 0.7))
    d.text((gx0 + 1, gy1 - 1), label, font=f, fill=(240, 240, 240), anchor='ls')
    return True


# ---- one card --------------------------------------------------------------------

def curly(text):
    """Printed French uses the typographic apostrophe; Scryfall's text the straight one."""
    return (text or '').replace("'", '’')


def compose(scan, en, texts, lang_label=None):
    """Erase the English text from `scan` and set `texts` (name, type, rules, flavor).

    Returns (image, regions) or (None, reason).
    """
    fam = family_of(en)
    img = np.array(scan.convert('RGB').resize((W, H), Image.LANCZOS))
    reg = regions(img, en, fam)
    colors = {}
    # Measured before the erase: where the English name and type sit.
    measured = {part: measure_line(img, reg[part], dark_text=luminance(img, reg[part]) >= 110) for part in ('name', 'type')}
    for part in ('name', 'type', 'box'):
        dark_bg = luminance(img, reg[part]) < 110
        colors[part] = LIGHT_INK if dark_bg else DARK_INK
        # Only the ink: the bars' texture and the box's watermark stay intact.
        erase(img, reg[part], dark_text=not dark_bg, ink_only=True)
    for region in reg['extra']:
        erase(img, region, dark_text=luminance(img, region) >= 110, ink_only=True)
    im = Image.fromarray(img).convert('RGBA')
    set_title(im, reg['name'], texts['name'], fam, 'name', colors['name'], measured['name'], en['name'])
    set_title(im, reg['type'], texts['type'], fam, 'type', colors['type'], measured['type'], en['type_line'])
    if not typeset_box(im, reg['box'], texts['rules'], texts['flavor'], colors['box'], divider=fam == 'modern'):
        return None, 'text does not fit'
    if lang_label and fam == 'modern':
        relabel_language(im, lang_label)
    return im.convert('RGB'), reg


# Blur per part before comparing: the gate judges where the ink sits (a bar,
# a block of lines), not where each word breaks — the French text will wrap
# differently anyway. A misplaced box or a leftover English line still shows.
BLUR = {'name': 2.0, 'type': 2.0, 'box': 7.0}


def residual(a, b, box, sigma=0.0):
    """Mean absolute grey-level difference over `box`, after an optional blur."""
    ga = np.asarray(a.convert('L').crop(box), dtype=np.float32)
    gb = np.asarray(b.convert('L').crop(box), dtype=np.float32)
    if sigma:
        ga, gb = cv2.GaussianBlur(ga, (0, 0), sigma), cv2.GaussianBlur(gb, (0, 0), sigma)
    return float(np.abs(ga - gb).mean())


def check(scan, en):
    """Quality gate: retypeset the English text and compare with the scan.

    Returns per-part ratios (0 = identical to the scan, 1 = as far from it as
    the bare erased card). The English text is what the scan prints, so a low
    ratio proves the geometry, colors and fonts fit this card.
    """
    texts = {'name': en['name'], 'type': en['type_line'], 'rules': curly(en.get('oracle_text')), 'flavor': curly(en.get('flavor_text')) or None}
    rebuilt, reg = compose(scan, en, texts)
    if rebuilt is None:
        return None
    original = scan.convert('RGB').resize((W, H), Image.LANCZOS)
    img = np.array(original)
    for part in ('name', 'type', 'box'):
        erase(img, reg[part], dark_text=luminance(img, reg[part]) >= 110)
    for region in reg['extra']:
        erase(img, region, dark_text=luminance(img, region) >= 110)
    blank = Image.fromarray(img)
    out = {}
    for part in ('name', 'type'):
        base = residual(original, blank, reg[part], BLUR[part])
        out[part] = residual(original, rebuilt, reg[part], BLUR[part]) / base if base > 1 else 1.0
    # The text may run into the strip beside the power/toughness box.
    below = [e[3] for e in reg['extra'] if e[1] >= reg['box'][3] - 4]
    region = reg['box'][:3] + (max([reg['box'][3], *below]),)
    # Recorded for review, not gated: the frame texture below the box makes
    # it noisy (see recompose.GATE).
    out['box'] = text_outside(original, region, pt_box=bool(below))
    return out


def text_outside(image, box, pt_box):
    """1.0 when letters sit right below the text region: the scan's text runs
    past it and would survive the erase. 0.0 otherwise. The band left of the
    power/toughness box is checked; the box itself prints "3/3"."""
    x0, _, x1, y1 = box
    right = 560 if pt_box else x1 - 10
    band = np.asarray(image.convert('L').crop((x0 + 10, y1, right, y1 + 12)), dtype=np.int16)
    bg = cv2.medianBlur(band.astype(np.uint8), 15).astype(np.int16)
    strokes = (np.abs(band - bg) > 30).astype(np.uint8)
    n, _, stats, _ = cv2.connectedComponentsWithStats(strokes, 8)
    letters = sum(1 for i in range(1, n) if 4 <= stats[i, cv2.CC_STAT_HEIGHT] <= 30 and stats[i, cv2.CC_STAT_WIDTH] <= 40
                  and stats[i, cv2.CC_STAT_AREA] >= 6)
    return 1.0 if letters >= 3 else 0.0


def symbols_ok(*texts):
    return all(drawable(t) for text in texts for t in TOKEN.findall(text or ''))


# Scryfall's French text sometimes loses a line break: "Vol{1}{B} : …" where
# the card prints "Vol" then "{1}{B} : …". French never glues a word to a
# symbol, so a letter right before one means a lost break.
# Same for a sentence glued to the next: "d'une carte.Piochez deux cartes."
LOST_BREAK = re.compile(r'(?<=[^\W\d_])(?=\{)|(?<=[.!?])(?=[A-ZÀ-Ý])')


def french_texts(fr):
    fr = {**fr, 'printed_text': LOST_BREAK.sub('\n', fr.get('printed_text') or '')}
    return {
        'name': fr['printed_name'],
        'type': (fr.get('printed_type_line') or '').replace(' — ', ' : ').replace(' - ', ' : '),
        'rules': curly(fr.get('printed_text')),
        'flavor': curly(fr.get('flavor_text')) or None,
    }
