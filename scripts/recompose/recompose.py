"""Generate the recomposed French cards.

    python recompose.py --bulk all-cards.jsonl.gz --out out/ [--db ../../.data/cards-mtg.db]
                        [--limit N] [--workers 6] [--sample N] [--all]

Targets: French printings whose Scryfall scan is low resolution while the
English printing of the same set and number is a high-resolution scan. By
default only the printings the site shows (best_printings in the card
database); --all takes every French one.

Each card: the English PNG is downloaded, the English text retypeset on it and
compared with the scan (the quality gate, render.check); a card that passes is
composed in French and written as out/<french printing id>.jpg. Every outcome
lands in out/results.jsonl, so a run can be stopped and resumed.

Cards the fixed layouts do not fit (borderless and showcase frames,
planeswalkers, sagas, adventures, double-faced cards, cards the gate refuses)
go through the free-form mode (freeform.py): the text is found by reading the
scan, then checked by reading the result back. The back of a double-faced
card is written as out/<id>-back.jpg.
"""
import argparse
import collections
import gzip
import io
import json
import sqlite3
import sys
import time
import urllib.request
from concurrent.futures import ProcessPoolExecutor, as_completed
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).parent))
import freeform  # noqa: E402
import locate  # noqa: E402
import render  # noqa: E402

UA = 'PrismRecompose/1.0 (+https://github.com/Diix46/SpellForge)'
# Share of the erased-card difference the English retypesetting may leave on
# the name and type bars (see render.check). Set on a sample of 300 cards
# reviewed by eye: passing cards were right, the failures seen were reworded
# old cards (Oracle text differs from the print), so the limits are generous.
GATE = {'name': 0.7, 'type': 0.85}
GATE_RETRO = {'name': 1.0, 'type': 0.95}


def load_targets(bulk, only_ids=None, vocab=None):
    en, fr = {}, {}
    # A French type line from any printing of the card: some French printings
    # lack theirs in Scryfall's data.
    # Failing that, the French of the same English type line on other cards.
    fr_types, by_line = {}, {}
    # Likewise the French rules text, where Scryfall gives English instead.
    fr_rules = {}
    oracle_line = {}
    with gzip.open(bulk, 'rt', encoding='utf-8') as fh:
        for line in fh:
            c = json.loads(line)
            key = (c['set'], c['collector_number'])
            if vocab is not None and c['lang'] == 'en':
                for f in [c] + c.get('card_faces', []):
                    vocab.update(locate._tokens(' '.join(f.get(k) or '' for k in ('name', 'type_line', 'oracle_text', 'flavor_text'))))
            if c['lang'] == 'en' and c.get('type_line'):
                oracle_line.setdefault(c.get('oracle_id'), c['type_line'])
            if c['lang'] == 'fr' and c.get('printed_text') and not c.get('card_faces') and not render.looks_english(c['printed_text']):
                fr_rules.setdefault(c.get('oracle_id'), c['printed_text'])
            if c['lang'] == 'fr' and c.get('printed_type_line'):
                fr_types.setdefault(c.get('oracle_id'), c['printed_type_line'])
                if c.get('type_line'):
                    by_line.setdefault(c['type_line'], collections.Counter())[c['printed_type_line']] += 1
            if c['lang'] == 'en' and c.get('image_status') == 'highres_scan':
                en[key] = c
            elif c['lang'] == 'fr' and c.get('image_status') == 'lowres':
                fr[key] = c
    out = []
    for key, f in fr.items():
        e = en.get(key)
        if e is None or (only_ids is not None and f['id'] not in only_ids):
            continue
        if f.get('printed_type_line') is None:
            known = fr_types.get(f.get('oracle_id'))
            if not known and by_line.get(e.get('type_line')):
                known = by_line[e['type_line']].most_common(1)[0][0]
            if known:
                f = {**f, 'printed_type_line': known}
        if render.looks_english(f.get('printed_text')) and fr_rules.get(f.get('oracle_id')):
            f = {**f, 'printed_text': fr_rules[f['oracle_id']]}
        if render.looks_english(f.get('flavor_text')):
            # A flavor text is the printing's own: none rather than English.
            f = {k: v for k, v in f.items() if k != 'flavor_text'}
        out.append((f, e))
    return out


def best_printing_ids(db):
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    try:
        return {r[0] for r in con.execute("SELECT printing_id FROM best_printings WHERE lang = 'fr'")}
    finally:
        con.close()


def fetch(url, tries=3):
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                return r.read()
        except Exception:
            if i == tries - 1:
                raise
            time.sleep(1 + 2 * i)


def init_worker(vocab):
    freeform.set_vocab(vocab)


FACES_ON_PAGE = ('adventure', 'split', 'flip')
DOUBLE_FACED = ('transform', 'modal_dfc')


def process_free(fr, en, out_dir, why):
    """The free-form mode, for a card the fixed layouts do not fit: each
    printed side composed apart (the back of a double-faced card too)."""
    fid = fr['id']
    both = en.get('card_faces') and fr.get('card_faces') and len(en['card_faces']) == len(fr['card_faces'])
    if fr['layout'] in DOUBLE_FACED and both:
        sides = [([(e, f)], e.get('image_uris'), f.get('image_uris'), suffix)
                 for e, f, suffix in zip(en['card_faces'][:2], fr['card_faces'][:2], ('', '-back'))]
    else:
        faces = list(zip(en['card_faces'], fr['card_faces'])) if fr['layout'] in FACES_ON_PAGE and both else [(en, fr)]
        sides = [(faces, en.get('image_uris'), fr.get('image_uris'), '')]
    made = []
    for faces, uris, fref, suffix in sides:
        if not uris or 'png' not in uris:
            reason = 'no png'
        else:
            try:
                scan = Image.open(io.BytesIO(fetch(uris['png'])))
                try:
                    ref = Image.open(io.BytesIO(fetch(fref['png']))) if fref else None
                except Exception:
                    ref = None
                im, reason = freeform.compose_free(scan, faces, fr['layout'], fr.get('frame'), ref)
            except Exception as err:
                im, reason = None, f'{type(err).__name__}: {err}'
            if im is not None:
                im.save(out_dir / f'{fid}{suffix}.jpg', quality=92, optimize=True, progressive=True)
                made.append(suffix or 'front')
                continue
        if not suffix:
            # No front, no card: the back alone is never shown.
            return {'id': fid, 'status': 'skip', 'reason': f'{why}; free: {reason}'}
    return {'id': fid, 'status': 'ok', 'mode': 'free', 'sides': made, 'set': fr['set'], 'cn': fr['collector_number']}


def process(fr, en, out_dir):
    r = process_fixed(fr, en, out_dir)
    if r['status'] == 'skip' and r['reason'] not in ('symbol', 'english text'):
        return process_free(fr, en, out_dir, r['reason'])
    return r


def process_fixed(fr, en, out_dir):
    fid = fr['id']
    if not render.supported(fr, en):
        return {'id': fid, 'status': 'skip', 'reason': 'frame'}
    if not render.symbols_ok(fr.get('printed_text'), en.get('oracle_text')):
        return {'id': fid, 'status': 'skip', 'reason': 'symbol'}
    if render.looks_english(fr.get('printed_text')) or render.looks_english(fr.get('flavor_text')):
        return {'id': fid, 'status': 'skip', 'reason': 'english text'}
    uris = en.get('image_uris') or {}
    if 'png' not in uris:
        return {'id': fid, 'status': 'skip', 'reason': 'no png'}
    try:
        scan = Image.open(io.BytesIO(fetch(uris['png'])))
        scan.load()
    except Exception as err:
        return {'id': fid, 'status': 'error', 'reason': f'download: {err}'}
    try:
        ratios = render.check(scan, en)
        if ratios is None:
            return {'id': fid, 'status': 'skip', 'reason': 'english does not fit'}
        # The digital Goudy of the retro frame differs a little from the printed
        # cut: a looser bar there, the gate still catches a misplaced line.
        gate = GATE_RETRO if render.family_of(en) == 'retro' else GATE
        failed = [p for p, limit in gate.items() if ratios[p] > limit]
        if failed:
            return {'id': fid, 'status': 'skip', 'reason': 'gate', 'parts': failed, 'ratios': ratios}
        # The French scan, however blurry, gives the colours (render.match_colors).
        try:
            reference = Image.open(io.BytesIO(fetch(fr['image_uris']['png'])))
            reference.load()
        except Exception:
            reference = None
        im, reason = render.compose(scan, en, render.french_texts(fr), lang_label='FR', reference=reference)
        if im is None:
            return {'id': fid, 'status': 'skip', 'reason': reason, 'ratios': ratios}
        im.save(out_dir / f'{fid}.jpg', quality=92, optimize=True, progressive=True)
        return {'id': fid, 'status': 'ok', 'set': fr['set'], 'cn': fr['collector_number'], 'ratios': ratios}
    except Exception as err:
        return {'id': fid, 'status': 'error', 'reason': f'{type(err).__name__}: {err}'}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--bulk', required=True, type=Path)
    ap.add_argument('--out', required=True, type=Path)
    ap.add_argument('--db', type=Path, default=Path(__file__).resolve().parents[2] / '.data/cards-mtg.db')
    ap.add_argument('--all', action='store_true', help='every French low-res printing, not only those shown by default')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--sample', type=int, help='a deterministic spread of N targets, for tuning')
    ap.add_argument('--workers', type=int, default=6)
    args = ap.parse_args()

    missing = render.missing_fonts()
    if missing:
        sys.exit(f'Missing fonts: {", ".join(missing)} (see scripts/recompose/README.md)')

    args.out.mkdir(parents=True, exist_ok=True)
    results = args.out / 'results.jsonl'
    done = set()
    if results.exists():
        done = {json.loads(line)['id'] for line in results.read_text().splitlines() if line.strip()}

    only = None if args.all else best_printing_ids(args.db)
    vocab = set()
    targets = [t for t in load_targets(args.bulk, only, vocab) if t[0]['id'] not in done]
    targets.sort(key=lambda t: (t[0]['set'], t[0]['collector_number']))
    if args.sample:
        step = max(1, len(targets) // args.sample)
        targets = targets[::step][:args.sample]
    if args.limit:
        targets = targets[:args.limit]
    print(f'{len(targets)} cards to process ({len(done)} already done)', flush=True)

    counts, t0 = {}, time.time()
    with ProcessPoolExecutor(args.workers, initializer=init_worker, initargs=(vocab,)) as pool, results.open('a') as log:
        futures = [pool.submit(process, f, e, args.out) for f, e in targets]
        for i, fut in enumerate(as_completed(futures), 1):
            r = fut.result()
            log.write(json.dumps(r) + '\n')
            log.flush()
            counts[r['status']] = counts.get(r['status'], 0) + 1
            if i % 100 == 0 or i == len(futures):
                rate = i / (time.time() - t0)
                print(f'{i}/{len(futures)}  {counts}  {rate:.1f}/s', flush=True)


if __name__ == '__main__':
    main()
