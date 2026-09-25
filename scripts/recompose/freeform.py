"""Any frame: the English text found by OCR (locate.py), erased, and the French
set in its place.

The templates of render.py cover the plain frames, pixel for pixel. Every
other card — borderless and showcase frames, planeswalkers, sagas, classes,
adventures, the faces of double-faced cards, cards the templates missed — goes
through here. Where the English name, type line and paragraphs sit is read
from the scan; the French text of each paragraph goes into the block its
English paragraph filled, at the same size or smaller.

The check is direct: the finished card is read again by OCR, and a card on
which English words survive, or whose French does not fit, is left alone.
"""
import re
import unicodedata

import cv2
import numpy as np
from PIL import Image

import locate
import render

W, H = render.W, render.H

# Prefixes the card prints outside the text box: loyalty costs in their badge,
# saga chapters beside their paragraph.
LOYALTY = re.compile(r'^\s*[+−\-]?\s*(?:\d+|X)\s*:\s*')
CHAPTER = re.compile(r'^\s*[IVX]+(?:\s*,\s*[IVX]+)*\s*[—-]\s*')


def paragraphs(text):
    return [p for p in (text or '').split('\n') if p.strip()]


def strip_prefix(p, layout, type_line):
    if 'Planeswalker' in (type_line or '') or 'Planeswalker' in p[:0]:
        p = LOYALTY.sub('', p)
    if layout == 'saga' or 'Saga' in (type_line or ''):
        p = CHAPTER.sub('', p)
    return p


def polarity(img, box):
    """True when the text in `box` is lighter than what it sits on."""
    x0, y0, x1, y1 = box
    g = cv2.cvtColor(img[max(0, y0):y1, max(0, x0):x1], cv2.COLOR_RGB2GRAY).astype(np.int16)
    if g.size == 0:
        return False
    bg = np.median(g)
    lo, hi = np.percentile(g, 3), np.percentile(g, 97)
    return (hi - bg) > (bg - lo)


def grow(img, box, light, step=12, limit=(22, 22, W - 22, H - 22), most=36):
    """Widen `box` sideways over the ink that continues it (mana symbols at the
    start of a line, a word the OCR dropped): the whole text must be erased."""
    x0, y0, x1, y1 = (int(max(0, box[0])), int(max(0, box[1])), int(min(W, box[2])), int(min(H, box[3])))
    if y1 - y0 < 3 or x1 - x0 < 3:
        return box
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY).astype(np.int16)
    band = gray[y0:y1]
    bg = cv2.medianBlur(band.astype(np.uint8), 31).astype(np.int16)
    ink = ((band - bg) if light else (bg - band)) > 30
    cols = ink.sum(0)
    start0, start1 = x0, x1
    while x0 - step > limit[0] and start0 - x0 < most and cols[x0 - step:x0].sum() > 3:
        x0 -= step
    while x1 + step < limit[2] and x1 - start1 < most and cols[x1:x1 + step].sum() > 3:
        x1 += step
    return (max(limit[0], x0), y0, min(limit[2], x1), y1)


def pad(box, p):
    return (box[0] - p, box[1] - p, box[2] + p, box[3] + p)


def blocks_of(found, keys):
    """Paragraph keys grouped into blocks: paragraphs whose lines follow each
    other in one column share a block (their French is set together)."""
    items = [(k, found[k]['box']) for k in keys if k in found]
    items.sort(key=lambda kb: (kb[1][1], kb[1][0]))
    blocks = []
    for k, b in items:
        for bl in blocks:
            r = bl['box']
            overlap_x = min(r[2], b[2]) - max(r[0], b[0])
            gap_y = b[1] - r[3]
            if overlap_x > 0.3 * min(r[2] - r[0], b[2] - b[0]) and gap_y < 48:
                bl['keys'].append(k)
                bl['box'] = (min(r[0], b[0]), min(r[1], b[1]), max(r[2], b[2]), max(r[3], b[3]))
                break
        else:
            blocks.append({'keys': [k], 'box': b})
    return blocks


def text_size(lines):
    """The English rules size: line pitch when there are several lines."""
    rows = []
    for c in sorted((ln['y0'] + ln['y1']) / 2 for ln in lines):
        if not rows or c - rows[-1] > 10:
            rows.append(c)
    # Pitches within a paragraph; the gaps between paragraphs are larger.
    pitches = [b - a for a, b in zip(rows, rows[1:]) if 18 < b - a < 60]
    if pitches:
        return float(np.median(pitches)) / 1.02
    return float(np.median([ln['h'] for ln in lines])) / 0.95


def face_texts(face_en, face_fr, layout):
    """English targets and their French, key by key."""
    en_keys = {'name': face_en.get('name', ''), 'type': face_en.get('type_line', '')}
    fr_keys = {'name': face_fr.get('printed_name') or '', 'type': (face_fr.get('printed_type_line') or '').replace(' — ', ' : ').replace(' - ', ' : ')}
    en_p = paragraphs(face_en.get('oracle_text'))
    fr_p = paragraphs(render.french_texts({'printed_name': 'x', 'printed_type_line': 'x', 'printed_text': face_fr.get('printed_text') or ''})['rules'])
    tl = face_en.get('type_line', '')
    for i, e in enumerate(en_p):
        en_keys[f'p{i}'] = strip_prefix(e, layout, tl)
    # French paragraphs apart when they do not pair up with the English ones
    # (a keyword line split or joined): they then go together into one block.
    if len(en_p) == len(fr_p):
        for i, f in enumerate(fr_p):
            fr_keys[f'p{i}'] = render.curly(strip_prefix(f, layout, tl))
    else:
        fr_keys['_all'] = [render.curly(strip_prefix(f, layout, tl)) for f in fr_p]
    if face_en.get('flavor_text') and face_fr.get('flavor_text'):
        en_keys['flavor'] = face_en['flavor_text']
        fr_keys['flavor'] = render.curly(face_fr['flavor_text'])
    return en_keys, fr_keys


# Every word printed on English cards (rules, flavor, types), set by the
# caller from the bulk file: what "real text" is, as opposed to OCR noise read
# in the art.
VOCAB = set()


def set_vocab(words):
    VOCAB.clear()
    VOCAB.update(words)


def text_words(img, exclude, all_words=None):
    """OCR words that are English card text, outside the `exclude` boxes."""
    out = []
    for w in (all_words if all_words is not None else locate.ocr_words(img)):
        toks = locate._tokens(w[0])
        if not toks:
            continue
        cx, cy = w[1] + w[3] / 2, w[2] + w[4] / 2
        if cy > 958 or any(b[0] - 4 <= cx <= b[2] + 4 and b[1] - 4 <= cy <= b[3] + 4 for b in exclude):
            continue
        real = [t for t in toks if t in VOCAB and (len(t) > 1 or t in ('a', 'i'))]
        if real and len(''.join(real)) >= 0.6 * len(''.join(toks)):
            out.append(w)
    # Drop readings far taller than the text around them (art noise).
    if out:
        med = float(np.median([w[4] for w in out]))
        out = [w for w in out if w[4] < 1.9 * med]
    return out


def cluster_blocks(lines):
    """Lines grouped into blocks: close vertically, overlapping horizontally."""
    blocks = []
    for ln in sorted(lines, key=lambda l: l['y0']):
        b = (ln['x0'], ln['y0'], ln['x1'], ln['y1'])
        for bl in blocks:
            r = bl['box']
            ov = min(r[2], b[2]) - max(r[0], b[0])
            gap = b[1] - r[3]
            if ov > 0.25 * min(r[2] - r[0], b[2] - b[0]) and gap < 1.5 * ln['h']:
                bl['lines'].append(ln)
                bl['box'] = (min(r[0], b[0]), min(r[1], b[1]), max(r[2], b[2]), max(r[3], b[3]))
                break
        else:
            blocks.append({'lines': [ln], 'box': b})
    # A block is real text: enough letters, on lines of several letters (a
    # column of ornaments read as "a" or "i" is not).
    def letters(ln):
        return sum(len(t) for t in locate._tokens(ln['text']) if t in VOCAB)
    return [bl for bl in blocks
            if sum(letters(ln) for ln in bl['lines']) >= 8
            and sum(letters(ln) >= 4 for ln in bl['lines']) >= max(1, len(bl['lines']) // 2)]


def assign(blocks, items):
    """Split `items` (English paragraph texts, in order) into contiguous runs,
    one per block, maximising the likeness of each block to its run. Returns
    [(start, end)] or None."""
    from rapidfuzz import fuzz
    k, n = len(blocks), len(items)
    if k > n or k == 0:
        return None
    texts = [' '.join(ln['text'] for ln in sorted(b['lines'], key=lambda l: l['y0'])) for b in blocks]
    best = {}

    def go(bi, start):
        if bi == k:
            return (0, []) if start == n else None
        key = (bi, start)
        if key in best:
            return best[key]
        res = None
        for end in range(start + 1, n - (k - bi - 1) + 1):
            sc = fuzz.token_set_ratio(texts[bi], ' '.join(items[start:end]))
            rest = go(bi + 1, end)
            if rest is not None and (res is None or sc + rest[0] > res[0]):
                res = (sc + rest[0], [(start, end)] + rest[1])
        best[key] = res
        return res
    r = go(0, 0)
    if r is None or r[0] / k < 45:
        return None
    return r[1]


def loyalty_badges(img, y0, y1, costs):
    """Vertical centres of the loyalty badges: the shield shapes in the column
    left of the rules text, as many as the card has loyalty abilities.
    `costs`: the costs the card prints, top to bottom."""
    strip = cv2.cvtColor(img[y0:y1, 4:120], cv2.COLOR_RGB2GRAY)
    found = []
    # The badge is a dark shield ringed in light metal (or the reverse):
    # try both, keep the reading that gives the expected count.
    for mask in (strip > 150, strip < 70):
        m = cv2.morphologyEx(mask.astype(np.uint8), cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        n, _, stats, cent = cv2.connectedComponentsWithStats(m, 8)
        comps = sorted((y0 + cent[i][1], 4 + stats[i, cv2.CC_STAT_LEFT] + stats[i, cv2.CC_STAT_WIDTH]) for i in range(1, n)
                       if 40 <= stats[i, cv2.CC_STAT_WIDTH] <= 105 and 26 <= stats[i, cv2.CC_STAT_HEIGHT] <= 75
                       and stats[i, cv2.CC_STAT_LEFT] < 60)
        ys = [c[0] for c in comps]
        BADGE_RIGHT[0] = max([c[1] for c in comps] + [96])
        # Nested rings of one badge count once.
        uniq = []
        for y in ys:
            if not uniq or y - uniq[-1] > 25:
                uniq.append(y)
        found.append(uniq)
    for uniq in found:
        if len(uniq) == len(costs):
            return uniq
    return None


def plan_planeswalker(lines, en_t, fr_t, badges):
    """One block per loyalty ability, facing its badge; static abilities
    before the first badge or after the last."""
    keys = [k for k in en_t if k.startswith('p')]
    loyal = [k for k in keys if LOYALTY.match(PW_RAW.get(k, ''))]
    if len(loyal) != len(badges) or '_all' in fr_t:
        return None
    first = keys.index(loyal[0]) if loyal else len(keys)
    pre, post = keys[:first], keys[first + len(loyal):]
    mids = [(a + b) / 2 for a, b in zip(badges, badges[1:])]
    regions = []
    for i, c in enumerate(badges):
        top = mids[i - 1] if i else c - 60
        bot = mids[i] if i < len(mids) else c + 60
        regions.append((top, bot))
    plan = []
    def block(ls):
        return {'lines': ls, 'box': (min(l['x0'] for l in ls), min(l['y0'] for l in ls), max(l['x1'] for l in ls), max(l['y1'] for l in ls))}
    for (top, bot), k in zip(regions, loyal):
        ls = [l for l in lines if top <= (l['y0'] + l['y1']) / 2 < bot]
        if not ls:
            return None
        b = block(ls)
        # Centred on its badge, as printed.
        b['box'] = (max(BADGE_RIGHT[0] + 14, b['box'][0]), int(min(b['box'][1], top + 4)), b['box'][2], int(max(b['box'][3], bot - 4)))
        b['pw'] = True
        plan.append((b, [fr_t[k]], None))
    first_top = regions[0][0] if regions else H
    last_bot = regions[-1][1] if regions else 0
    for ks, cond in ((pre, lambda l: (l['y0'] + l['y1']) / 2 < first_top), (post, lambda l: (l['y0'] + l['y1']) / 2 >= last_bot)):
        if not ks:
            continue
        ls = [l for l in lines if cond(l)]
        if not ls:
            return None
        plan.append((block(ls), [fr_t[k] for k in ks], None))
    return plan


PW_RAW = {}
DEBUG = False
LAST = []  # debugging: the last card composed, before its checks
BADGE_RIGHT = [96]


def compose_free(scan, faces, layout, frame, reference=None, lang_label='FR'):
    """`faces`: [(english face, french face)], one per face printed on this
    image (two for adventures, split and flip cards). Returns (image, info) or
    (None, reason)."""
    fam = render.family_of({'frame': frame}) or 'modern'
    if fam == 'retro':
        fam = 'old'
    img = np.array(scan.convert('RGB').resize((W, H), Image.LANCZOS))
    texts = []
    for fe, ff in faces:
        t = face_texts(fe, ff, layout)
        if not t[1]['name'] or not t[1]['type']:
            return None, 'no french name or type'
        texts.append(t)

    # Titles: name and type of each face, found by reading.
    rects, measured, colors = {}, {}, {}
    for fi, (en_t, fr_t) in enumerate(texts):
        for part in ('name', 'type'):
            card = {'name': en_t['name'], 'type_line': en_t['type']}
            ys = locate.TITLE_BANDS[part] if fi == 0 else range(40, H - 40, 10)
            ln = None
            if fi == 0:
                found = locate.match_parts(locate.lines_of(locate.ocr_words(img)), {'layout': 'normal', **card}) if part == 'name' and not rects else {}
                ln = (found.get(part) or [None])[0] if found else None
            ln = ln or locate.find_line(img, en_t[part], ys) or locate.find_line(img, en_t[part], range(40, H - 40, 12))
            if ln is None:
                return None, f'not found: {part}'
            box = pad((int(ln['x0']), int(ln['y0']), int(ln['x1']), int(ln['y1'])), 3)
            light = polarity(img, box)
            rects[(fi, part)] = (box, light)
            colors[(fi, part)] = render.LIGHT_INK if light else render.DARK_INK

    # Text: every line of real English words below the front face's type line.
    type_bottom = rects[(0, 'type')][0][3]
    name_bottom = rects[(0, 'name')][0][3]
    # The rules text sits below the type line, except where the type line is
    # at the bottom (sagas, classes) or the faces share the page.
    type_low = rects[(0, 'type')][0][1] > 0.75 * H
    top = name_bottom if (type_low or len(faces) > 1) else type_bottom
    title_boxes = [r[0] for r in rects.values()]
    every = locate.ocr_words(img)
    words = [w for w in text_words(img, title_boxes, every) if w[2] > top - 4 and not (type_low and w[2] > rects[(0, 'type')][0][1] - 4)]
    # Symbols and numbers read beside the words ("@: Add") belong to the line.
    for w in every:
        if w in words or w[2] + w[4] / 2 > 958:
            continue
        if any(abs((w[2] + w[4] / 2) - (v[2] + v[4] / 2)) < 0.5 * v[4] and 0.5 * v[4] < w[4] < 1.8 * v[4]
               and min(abs(w[1] - (v[1] + v[3])), abs(v[1] - (w[1] + w[3]))) < 1.8 * v[4] for v in words):
            words.append(w)
    lines = locate.lines_of(words)
    blocks = cluster_blocks(lines)
    if not blocks:
        return None, 'no text found'
    # Faces side by side (adventure): a block belongs to the face whose title
    # column it sits in.
    def face_of(bl):
        if len(faces) == 1:
            return 0
        cx = (bl['box'][0] + bl['box'][2]) / 2
        return min(range(len(faces)), key=lambda fi: abs(cx - (rects[(fi, 'type')][0][0] + rects[(fi, 'type')][0][2]) / 2) if fi else abs(cx - 560))
    plan = []
    if len(faces) == 1 and 'Planeswalker' in (faces[0][0].get('type_line') or ''):
        PW_RAW.clear()
        PW_RAW.update({f'p{i}': p for i, p in enumerate(paragraphs(faces[0][0].get('oracle_text')))})
        costs = [LOYALTY.match(p).group(0).split(':')[0].strip() for p in PW_RAW.values() if LOYALTY.match(p)]
        badges = loyalty_badges(img, int(type_bottom), 960, costs)
        pw_plan = plan_planeswalker(lines, texts[0][0], texts[0][1], badges) if badges else None
        if pw_plan is None:
            return None, 'loyalty badges'
        plan = pw_plan
    for fi, (en_t, fr_t) in enumerate(texts if not plan else []):
        keys = [k for k in en_t if k.startswith('p')] + (['flavor'] if 'flavor' in en_t else [])
        fbs = sorted([b for b in blocks if face_of(b) == fi], key=lambda b: (b['box'][1], b['box'][0]))
        if not keys:
            continue
        if '_all' in fr_t:
            # French paragraphs that do not pair with the English ones: only
            # possible when the face has a single text block.
            if len(fbs) != 1:
                return None, 'paragraphs differ'
            plan.append((fbs[0], fr_t['_all'], fr_t.get('flavor')))
            continue
        runs = assign(fbs, [en_t[k] for k in keys])
        if runs is None:
            return None, f'blocks do not match ({len(fbs)} for {len(keys)})'
        for b, (s0, s1) in zip(fbs, runs):
            plan.append((b, [fr_t[k] for k in keys[s0:s1] if k != 'flavor'], fr_t['flavor'] if 'flavor' in keys[s0:s1] else None))
    planeswalker = any('Planeswalker' in (fe.get('type_line') or '') for fe, _ in faces)

    for b, _, _ in plan:
        box = pad(tuple(int(v) for v in b['box']), 4)
        light = polarity(img, box)
        # Sideways, only over what continues the English lines — never left
        # of where they start by more than a symbol (frame ornaments, the
        # planeswalker's loyalty badges live there).
        left_limit = max(22, box[0] - (6 if planeswalker else 44))
        if b.get('pw'):
            box = (max(box[0], BADGE_RIGHT[0] + 14),) + tuple(box[1:])
            left_limit = box[0]
        b['rect'], b['light'] = grow(img, box, light, most=44, limit=(left_limit, 22, W - 22, H - 22)), light
        b['size'] = text_size(b['lines'])
    for k, (box, light) in rects.items():
        measured[k] = render.measure_line(img, box, dark_text=not light)

    # The erase reaches what continues the line; the French starts where
    # the English started (its measure is taken from the unwidened box).
    for k, (box, light) in list(rects.items()):
        render.erase(img, grow(img, box, light, step=9), dark_text=not light)
    has_pt = any(fe.get('power') is not None or fe.get('loyalty') is not None for fe, _ in faces)
    # English lines no block of the plan took (a line the Oracle text lacks, a
    # short last line) go too, when they sit in the column of the text.
    used = {id(ln) for b, _, _ in plan for ln in b['lines']}
    if plan:
        cx0 = min(b['rect'][0] for b, _, _ in plan) - 10
        cx1 = max(b['rect'][2] for b, _, _ in plan) + 10
        cy0 = min(b['rect'][1] for b, _, _ in plan) - 60
        for ln in lines:
            if id(ln) in used or not (cx0 <= ln['x0'] and ln['x1'] <= cx1 and cy0 <= ln['y0'] and ln['y1'] < 958):
                continue
            if has_pt and ln['x1'] > 600 and ln['y1'] > 925:
                continue
            box = pad((int(ln['x0']), int(ln['y0']), int(ln['x1']), int(ln['y1'])), 5)
            render.erase(img, grow(img, box, polarity(img, box), most=30), dark_text=not polarity(img, box), ink_only=True)
    for b, _, _ in plan:
        r = b['rect']
        if has_pt and r[2] > 600 and r[3] > 925:
            # Around the power/toughness box, never over it.
            render.erase(img, (r[0], r[1], r[2], 925), dark_text=not b['light'], ink_only=True)
            render.erase(img, (r[0], 925, 600, r[3]), dark_text=not b['light'], ink_only=True)
        else:
            render.erase(img, r, dark_text=not b['light'], ink_only=True)
        # Set between the English lines' own edges, not over the art beside them.
        box = pad(tuple(int(v) for v in b['box']), 4)
        # Lines start flush left: where most of them start (a speck of art
        # read at the start of one line does not move the margin).
        lefts = sorted(ln['x0'] for ln in b['lines'])
        mid = lefts[len(lefts) // 2]
        box = (int(min(l for l in lefts if l >= mid - 16)) - 4,) + tuple(box[1:])
        if b.get('pw'):
            box = (max(box[0], BADGE_RIGHT[0] + 14),) + tuple(box[1:])
        b['rect'] = (box[0], b['rect'][1], min(b['rect'][2], box[2] + 12), b['rect'][3])
    if reference is not None:
        img = render.match_colors(img, reference)
    im = Image.fromarray(img).convert('RGBA')

    title_right = {}
    for (fi, part), (box, light) in rects.items():
        right = obstacle_right(img, box, light)
        title_right[(fi, part)] = right
        grow_y = 14
        bar = (box[0], box[1] - grow_y, max(right, box[2]), box[3] + grow_y)
        m = measured[(fi, part)]
        m = dict(m, baseline=m['baseline'] + grow_y) if m else None
        render.set_title(im, bar, texts[fi][1][part], fam, part, colors[(fi, part)], m, texts[fi][0][part])
    rects_all = [b['rect'] for b, _, _ in plan]
    # Where each block goes, and one size for the whole card: the largest
    # that fits every block (abilities in several sizes look broken).
    english = int(round(min(render.TEXT_MAX + 3, max(14, float(np.median([b['size'] for b, _, _ in plan]))))))
    placed = []
    for b, paras, flavor in plan:
        rect = b['rect']
        # English wraps around the power/toughness box; the French block
        # stays clear of it.
        if has_pt and rect[2] > 560 and rect[3] > 905:
            rect = (rect[0], rect[1], rect[2], 905)
        text = '\n'.join(paras)
        if not render.typeset_box(im, rect, text, flavor, (0, 0, 0), divider=False, max_size=english, min_size=max(13, int(english * 0.8)), dry=True):
            floor = 905 if has_pt and rect[2] > 540 else 950
            below = min([r[1] - 6 for r in rects_all if r[1] > rect[3]] + [floor])
            rect = (rect[0], rect[1], rect[2], max(rect[3], below))
        placed.append((b, rect, text, flavor))
    size = None
    for s_ in range(english, max(13, int(english * 0.72)) - 1, -1):
        if all(render.typeset_box(im, rect, text, flavor, (0, 0, 0), divider=False, max_size=s_, min_size=s_, dry=True) for _, rect, text, flavor in placed):
            size = s_
            break
    if size is None:
        return None, 'text does not fit'
    for b, rect, text, flavor in placed:
        color = render.LIGHT_INK if b['light'] else render.DARK_INK
        render.typeset_box(im, rect, text, flavor, color, divider=False, max_size=size, min_size=size)
    if lang_label and fam == 'modern' and reads_en(np.array(im.convert('RGB'))):
        render.relabel_language(im, lang_label)
    out = im.convert('RGB')
    en_all = {f'{fi}.{k}': v for fi, (e, _) in enumerate(texts) for k, v in e.items()}
    fr_all = {f'{fi}.{k}': v for fi, (_, f) in enumerate(texts) for k, v in f.items()}
    if DEBUG:
        LAST[:] = [out]
    left = leftover_english(np.array(out), en_all, fr_all, [])
    if left:
        return None, 'english left: ' + ' '.join(left[:5])
    bad = read_back(np.array(out), [((18, r[0][1], title_right[(fi, part)], r[0][3]), texts[fi][1][part], 'title') for (fi, part), r in rects.items()]
                    + [(rect, (text + ' ' + (flavor or '')).strip(), 'block') for _, rect, text, flavor in placed])
    if bad:
        return None, 'read back: ' + bad
    return out, {'blocks': len(plan)}


def read_back(img, expected):
    """The finished card read again, area by area: each title bar and block
    must read as the French it was given — nothing left over (a piece of the
    English name, a line of English below), nothing cut off.

    `expected`: [(box, text, kind)], kind 'title' (read over the whole bar
    width) or 'block' (read with a margin above and below)."""
    import pytesseract
    from rapidfuzz import fuzz
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    letters = lambda t: len(re.sub(r'[^a-zà-ÿ]', '', t))
    for box, want, kind in expected:
        if kind == 'title':
            # From the card's edge to the mana cost or set symbol: a piece of
            # the English name left beside the French shows here.
            x0, y0, x1, y1 = box[0], box[1] - 10, box[2], box[3] + 10
        else:
            x0, y0, x1, y1 = box[0] - 6, box[1] - 34, box[2] + 6, box[3] + 34
        x0, y0, x1, y1 = int(max(0, x0)), int(max(0, y0)), int(min(W, x1)), int(min(H, y1))
        crop = cv2.resize(gray[y0:y1, x0:x1], None, fx=2.5, fy=2.5, interpolation=cv2.INTER_CUBIC)
        want_n = ' '.join(locate._norm(re.sub(r'\{[^}]*\}', ' ', want)).split())
        ok = False
        for var in (crop, 255 - crop):
            got = ' '.join(locate._norm(pytesseract.image_to_string(var, config='--psm 6' if kind == 'block' else '--psm 7')).split())
            if not got and kind == 'title':
                got = ' '.join(locate._norm(pytesseract.image_to_string(var, config='--psm 6')).split())
            # Only real words count (not the mana cost, set symbol or ornaments).
            wanted = set(want_n.split())
            if kind == 'title':
                got_words = ' '.join(w for w in got.split() if len(re.sub(r'[^a-zà-ÿ]', '', w)) >= 3 or w in wanted)
                sc = fuzz.ratio(got_words, want_n)
                extra = letters(got_words) - letters(want_n)
            else:
                got_words = got
                sc = fuzz.token_set_ratio(got, want_n)
                # The margin reads the art too: only a line of real words that
                # is not the French text counts (English left above or below).
                extra = 0
                for line in pytesseract.image_to_string(var, config='--psm 6').splitlines():
                    ln = ' '.join(locate._norm(line).split())
                    real = [w for w in re.findall(r'[a-zà-ÿ]{3,}', ln) if w in VOCAB and w not in wanted]
                    if len(real) >= 3 and fuzz.partial_ratio(ln, want_n) < 70:
                        extra += sum(map(len, real))
            if DEBUG:
                print('   RB', kind, round(sc), extra, '|', got_words[:70], '|', want_n[:40])
            if sc >= (78 if kind == 'title' else 75) and extra <= (2 if kind == 'title' else 0):
                ok = True
                break
        if not ok:
            return f'{want[:30]!r} ({kind})'
    return None


def reads_en(img):
    """Whether the collector line bottom left says "EN" where relabel_language
    would put "FR" (frames vary: stars, other layouts)."""
    import pytesseract
    crop = cv2.cvtColor(img[975:1020, 30:170], cv2.COLOR_RGB2GRAY)
    crop = cv2.resize(255 - crop, None, fx=3, fy=3, interpolation=cv2.INTER_CUBIC)
    txt = pytesseract.image_to_string(crop, config='--psm 6')
    return bool(re.search(r'\bEN\b', txt))


def obstacle_right(img, box, light):
    x0, y0, x1, y1 = (int(max(0, box[0])), int(max(0, box[1])), int(min(W, box[2])), int(min(H, box[3])))
    if y1 - y0 < 3:
        return W - 30
    gray = cv2.cvtColor(img[y0:y1], cv2.COLOR_RGB2GRAY).astype(np.int16)
    bg = cv2.medianBlur(gray.astype(np.uint8), 31).astype(np.int16)
    ink = (np.abs(gray - bg) > 45).sum(0)
    x = x1 + 8
    while x < W - 30:
        if ink[x:x + 3].sum() > 6:
            return x - 6
        x += 1
    return W - 30


ENGLISH = {'the', 'you', 'your', 'target', 'creature', 'creatures', 'card', 'cards', 'control', 'each', 'when',
           'whenever', 'this', 'turn', 'end', 'until', 'draw', 'damage', 'deals', 'gets', 'enters', 'battlefield',
           'player', 'opponent', 'with', 'from', 'that', 'may', 'put', 'counter', 'counters', 'library', 'graveyard',
           'hand', 'mana', 'add', 'sacrifice', 'return', 'exile', 'destroy', 'spell', 'ability', 'beginning', 'step'}


def leftover_english(img, en_all, fr_all, areas):
    """English words still in the rewritten areas (not also French, not names)."""
    # OCR often drops accents: "créature" reads "creature", still French.
    plain = lambda t: unicodedata.normalize('NFKD', t).encode('ascii', 'ignore').decode()
    french = set(locate._tokens(plain(' '.join(fr_all.values()))))
    names = {t for k, v in en_all.items() if k.endswith('name') for t in locate._tokens(v)}
    english = {t for v in en_all.values() for t in locate._tokens(v) if len(t) >= 4} - french - names
    def inside(w):
        cx, cy = w[1] + w[3] / 2, w[2] + w[4] / 2
        # Everywhere above the artist and copyright line; not the fine print
        # some art carries (card text is never that small).
        return cy < 955 and w[4] >= 15
    # Unaccented, so "excepté" is not read as "except".
    words = [plain(w[0]) for w in locate.ocr_words(img) if inside(w)]
    toks = [t for w in words for t in locate._tokens(w)]
    return [t for t in toks if (t in ENGLISH or t in english or (t in VOCAB and len(t) >= 5)) and t not in french and t not in names]
