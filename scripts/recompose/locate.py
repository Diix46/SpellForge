"""Where a card prints its English text, found by OCR, for any frame.

The fixed templates of render.py cover the plain frames. Borderless and
showcase frames, planeswalkers, sagas, adventures… each put their text
elsewhere; rather than a template per frame, the English scan is read with
Tesseract and each line is matched to what the card says (name, type line,
the paragraphs of its rules text, its flavor text), which gives, card by card,
the exact boxes to erase and to write the French into.
"""
import re

import cv2
import numpy as np
import pytesseract
from PIL import Image
from rapidfuzz import fuzz

SCALE = 3  # OCR at three times the scan's size: small rules text reads far better


def _words(gray):
    """Words found in one pass: (text, x, y, w, h, conf) at card scale."""
    d = pytesseract.image_to_data(gray, output_type=pytesseract.Output.DICT, config='--psm 11 --oem 1')
    out = []
    for i, t in enumerate(d['text']):
        t = t.strip()
        if not t or float(d['conf'][i]) < 35 or not re.search(r'[A-Za-z0-9]', t):
            continue
        x, y, w, h = (v / SCALE for v in (d['left'][i], d['top'][i], d['width'][i], d['height'][i]))
        if h < 7 or h > 60:
            continue
        out.append((t, x, y, w, h, float(d['conf'][i])))
    return out


def ocr_words(img):
    """Words from several readings of the scan — as is, its negative (light
    text on dark boxes), and binarised against the local background (text on
    textured bars) — keeping the most confident one where they overlap."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    big = cv2.resize(gray, None, fx=SCALE, fy=SCALE, interpolation=cv2.INTER_CUBIC)
    bg = cv2.medianBlur(big, 61)
    dark = np.clip(255 - (bg.astype(np.int16) - big.astype(np.int16)) * 3, 0, 255).astype(np.uint8)
    light = np.clip(255 - (big.astype(np.int16) - bg.astype(np.int16)) * 3, 0, 255).astype(np.uint8)
    words = _words(big) + _words(255 - big) + _words(dark) + _words(light)
    words.sort(key=lambda w: -w[5])
    kept = []
    for w in words:
        if not any(_overlap(w, k) > 0.5 for k in kept):
            kept.append(w)
    return kept


def _overlap(a, b):
    ax0, ay0, ax1, ay1 = a[1], a[2], a[1] + a[3], a[2] + a[4]
    bx0, by0, bx1, by1 = b[1], b[2], b[1] + b[3], b[2] + b[4]
    ix = max(0, min(ax1, bx1) - max(ax0, bx0))
    iy = max(0, min(ay1, by1) - max(ay0, by0))
    return ix * iy / max(1e-6, min(a[3] * a[4], b[3] * b[4]))


def lines_of(words):
    """Words grouped into lines: same vertical band, close horizontally."""
    lines = []
    for w in sorted(words, key=lambda w: (w[2] + w[4] / 2, w[1])):
        cy = w[2] + w[4] / 2
        for ln in lines:
            if abs(ln['cy'] - cy) < 0.55 * max(ln['h'], w[4]) and w[1] - ln['x1'] < 3 * w[4] and ln['x0'] - (w[1] + w[3]) < 3 * w[4]:
                ln['words'].append(w)
                ln['x0'], ln['x1'] = min(ln['x0'], w[1]), max(ln['x1'], w[1] + w[3])
                ln['y0'], ln['y1'] = min(ln['y0'], w[2]), max(ln['y1'], w[2] + w[4])
                ln['h'] = max(ln['h'], w[4])
                break
        else:
            lines.append(dict(words=[w], x0=w[1], x1=w[1] + w[3], y0=w[2], y1=w[2] + w[4], cy=cy, h=w[4]))
    # Fragments of one line (split by a symbol or a stray reading) join up:
    # same row, a word's width apart at most.
    merged = True
    while merged:
        merged = False
        for a in lines:
            for b in lines:
                if a is b:
                    continue
                ov = min(a['y1'], b['y1']) - max(a['y0'], b['y0'])
                gap = max(a['x0'], b['x0']) - min(a['x1'], b['x1'])
                if ov > 0.5 * min(a['y1'] - a['y0'], b['y1'] - b['y0']) and gap < 4 * max(a['h'], b['h']):
                    a['words'] += b['words']
                    a['x0'], a['x1'] = min(a['x0'], b['x0']), max(a['x1'], b['x1'])
                    a['y0'], a['y1'] = min(a['y0'], b['y0']), max(a['y1'], b['y1'])
                    a['h'] = max(a['h'], b['h'])
                    lines.remove(b)
                    merged = True
                    break
            if merged:
                break
    for ln in lines:
        ln['words'].sort(key=lambda w: w[1])
        ln['text'] = ' '.join(w[0] for w in ln['words'])
    return sorted(lines, key=lambda ln: ln['y0'])


def _norm(s):
    return re.sub(r'\{[^}]*\}', ' ', s or '').replace('—', '-').replace('’', "'").lower()


def targets_of(en):
    """What the card prints, part by part. Cards with faces (adventures, split
    cards, double-faced cards seen from the front) list each face apart:
    `f1.name`, `f1.p0`…"""
    faces = en.get('card_faces') if en.get('layout') in ('adventure', 'split', 'flip', 'prototype') else None
    out = {}
    for fi, face in enumerate(faces or [en]):
        pre = f'f{fi}.' if faces and fi else ''
        name = face.get('name', '')
        if not faces:
            name = en.get('name', '')
        out[pre + 'name'] = name
        out[pre + 'type'] = face.get('type_line', '')
        for i, p in enumerate([p for p in (face.get('oracle_text') or '').split('\n') if p.strip()]):
            out[f'{pre}p{i}'] = p
        if face.get('flavor_text'):
            out[pre + 'flavor'] = face['flavor_text']
    return out


def _tokens(s):
    return re.findall(r"[a-z0-9]+(?:'[a-z]+)?", _norm(s))


def _trim_to(ln, vocab):
    """The part of a line made of the target's words (a name bar also reads
    the mana cost; that must not be erased)."""
    idx = [i for i, w in enumerate(ln['words']) if set(_tokens(w[0])) & vocab]
    if not idx:
        return None
    ws = ln['words'][idx[0]:idx[-1] + 1]
    return dict(ln, words=ws, text=' '.join(w[0] for w in ws), x0=min(w[1] for w in ws), x1=max(w[1] + w[3] for w in ws),
                y0=min(w[2] for w in ws), y1=max(w[2] + w[4] for w in ws))


def match_parts(lines, en):
    """Assign lines to the card's parts. Returns {part: [line, …]} for name,
    type, and every rules/flavor paragraph (`p0`, `p1`, …, `flavor`).

    Name and type lines are matched whole (trimmed to their own words). The
    rules and flavor lines are matched in reading order: paragraph numbers
    never go back up the card (two similar abilities cannot trade lines), and
    a line counts only if most of its words belong to the paragraph."""
    targets = targets_of(en)
    norm = {k: _norm(v) for k, v in targets.items()}
    vocab = {k: set(_tokens(v)) for k, v in targets.items()}
    parts = {}
    lines = [ln for ln in lines if len(''.join(_tokens(ln['text']))) >= 3]
    # Name and type: one line each, the best match, the topmost on a tie (the
    # name also appears in rules text). The line must be mostly the name: a
    # rules line that quotes it is longer.
    taken = set()
    for k in (k for k in targets if k.split('.')[-1] in ('name', 'type')):
        cands = []
        for i, ln in enumerate(lines):
            tl = _trim_to(ln, vocab[k])
            if not tl:
                continue
            letters = len(re.sub(r'[^a-z]', '', _norm(ln['text'])))
            own = len(re.sub(r'[^a-z]', '', _norm(tl['text'])))
            if letters and own / letters < 0.75:
                continue
            sc = fuzz.ratio(_norm(tl['text']), norm[k])
            # The front face's name sits in the top third, its type line in
            # the middle band: a rules line quoting the name is not it.
            if '.' not in k and k == 'name' and ln['y0'] > 0.33 * 1040:
                continue
            if '.' not in k and k == 'type' and not (0.3 * 1040 < ln['y0'] < 0.85 * 1040):
                continue
            if sc >= 78:
                cands.append((-sc, ln['y0'], i, tl))
        if cands:
            _, _, i, tl = min(cands)
            parts[k] = [tl]
            taken.add(i)
    rest = [ln for i, ln in enumerate(lines) if i not in taken]
    # Rules and flavor: in order, per face.
    order = [k for k in targets if k.split('.')[-1] not in ('name', 'type')]
    rest.sort(key=lambda ln: (ln['y0'], ln['x0']))
    def score_of(ln, k):
        toks = _tokens(ln['text'])
        # A one-word line only counts for a short paragraph ("Flying").
        if len(toks) < 2 and len(vocab[k]) > 3:
            return 0
        if not toks:
            return 0
        share = sum(t in vocab[k] for t in toks) / len(toks)
        if share < 0.6:
            return 0
        return fuzz.partial_ratio(_norm(ln['text']), norm[k]) * (0.5 + 0.5 * share)
    # Faces are laid side by side (adventures): order is kept per face.
    for face in sorted({k.split('.')[0] if '.' in k else '' for k in order}):
        keys = [k for k in order if (k.split('.')[0] if '.' in k else '') == face]
        if not keys:
            continue
        # Best total score with paragraph numbers that never go back: each
        # line is skipped or given a paragraph >= the previous one's.
        sc = [[score_of(ln, k) if score_of(ln, k) >= 72 else 0 for k in keys] for ln in rest]
        n, m = len(rest), len(keys)
        best = [[0.0] * m for _ in range(n + 1)]
        choice = [[None] * m for _ in range(n + 1)]
        for i in range(n - 1, -1, -1):
            for j in range(m):
                skip = best[i + 1][j]
                take = max(((sc[i][jj] + best[i + 1][jj], jj) for jj in range(j, m) if sc[i][jj]), default=(0, None))
                if take[1] is not None and take[0] > skip:
                    best[i][j], choice[i][j] = take
                else:
                    best[i][j], choice[i][j] = skip, None
        j = 0
        for i in range(n):
            if choice[i][j] is not None:
                j = choice[i][j]
                parts.setdefault(keys[j], []).append(rest[i])
    for k, ls in parts.items():
        ls.sort(key=lambda ln: ln['y0'])
        runs, run = [], [ls[0]]
        for a, b in zip(ls, ls[1:]):
            if b['y0'] - a['y1'] < 2.2 * max(a['h'], b['h']):
                run.append(b)
            else:
                runs.append(run)
                run = [b]
        runs.append(run)
        parts[k] = max(runs, key=lambda r: sum(len(ln['text']) for ln in r))
    return parts


def find_line(img, target, ys, half=26, min_score=78):
    """A single line of text read band by band (Tesseract's single-line mode):
    the band whose best run of words matches `target`, as a line dict. For
    titles on textured bars, which the whole-card reading misses."""
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    tn = _norm(target)
    best = None
    for yc in ys:
        y0, y1 = max(0, yc - half), min(img.shape[0], yc + half)
        band = cv2.resize(gray[y0:y1], None, fx=1.5, fy=1.5, interpolation=cv2.INTER_CUBIC)
        for var in (band, 255 - band):
            d = pytesseract.image_to_data(var, output_type=pytesseract.Output.DICT, config='--psm 7 --oem 1')
            ws = [(d['text'][i].strip(), d['left'][i] / 1.5, y0 + d['top'][i] / 1.5, d['width'][i] / 1.5, d['height'][i] / 1.5)
                  for i in range(len(d['text'])) if d['text'][i].strip()]
            for a in range(len(ws)):
                for b in range(a, min(len(ws), a + 8)):
                    run = ws[a:b + 1]
                    sc = fuzz.ratio(_norm(' '.join(w[0] for w in run)), tn)
                    if best is None or sc > best[0]:
                        best = (sc, run)
        if best and best[0] >= 95:
            break
    if not best or best[0] < min_score:
        return None
    run = best[1]
    x0, x1 = min(w[1] for w in run), max(w[1] + w[3] for w in run)
    y0, y1 = min(w[2] for w in run), max(w[2] + w[4] for w in run)
    return dict(words=[(w[0], w[1], w[2], w[3], w[4], 90.0) for w in run], text=' '.join(w[0] for w in run),
                x0=x0, x1=x1, y0=y0, y1=y1, cy=(y0 + y1) / 2, h=y1 - y0)


def box_of(lines, pad=3):
    return (int(min(l['x0'] for l in lines) - pad), int(min(l['y0'] for l in lines) - pad),
            int(max(l['x1'] for l in lines) + pad), int(max(l['y1'] for l in lines) + pad))


# Where titles usually sit on a 745x1040 card, then everywhere.
TITLE_BANDS = {'name': list(range(62, 170, 7)), 'type': list(range(560, 720, 7))}


def locate(img, en):
    """The English text of `img` (a 745x1040 RGB array): {part: {'box', 'lines'}}."""
    lines = lines_of(ocr_words(img))
    parts = match_parts(lines, en)
    parts['_all'] = lines
    for k, target in targets_of(en).items():
        kind = k.split('.')[-1]
        if k in parts or kind not in ('name', 'type') or not target:
            continue
        ys = TITLE_BANDS[kind] if '.' not in k else []
        ln = find_line(img, target, ys) if ys else None
        if ln is None:
            ln = find_line(img, target, range(40, img.shape[0] - 40, 12))
        if ln is not None:
            parts[k] = [ln]
    all_lines = parts.pop('_all')
    out = {k: {'box': box_of(v), 'lines': v} for k, v in parts.items()}
    out['_lines'] = all_lines
    return out
