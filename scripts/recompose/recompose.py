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
"""
import argparse
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
import render  # noqa: E402

UA = 'PrismRecompose/1.0 (+https://github.com/Diix46/SpellForge)'
# Share of the erased-card difference the English retypesetting may leave on
# the name and type bars (see render.check). Set on a sample of 300 cards
# reviewed by eye: passing cards were right, the failures seen were reworded
# old cards (Oracle text differs from the print), so the limits are generous.
GATE = {'name': 0.7, 'type': 0.85}


def load_targets(bulk, only_ids=None):
    en, fr = {}, {}
    # A French type line from any printing of the card: some French printings
    # lack theirs in Scryfall's data.
    fr_types = {}
    with gzip.open(bulk, 'rt', encoding='utf-8') as fh:
        for line in fh:
            c = json.loads(line)
            key = (c['set'], c['collector_number'])
            if c['lang'] == 'fr' and c.get('printed_type_line'):
                fr_types.setdefault(c.get('oracle_id'), c['printed_type_line'])
            if c['lang'] == 'en' and c.get('image_status') == 'highres_scan':
                en[key] = c
            elif c['lang'] == 'fr' and c.get('image_status') == 'lowres':
                fr[key] = c
    out = []
    for key, f in fr.items():
        e = en.get(key)
        if e is None or (only_ids is not None and f['id'] not in only_ids):
            continue
        if f.get('printed_type_line') is None and fr_types.get(f.get('oracle_id')):
            f = {**f, 'printed_type_line': fr_types[f['oracle_id']]}
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


def process(fr, en, out_dir):
    fid = fr['id']
    if not render.supported(fr, en):
        return {'id': fid, 'status': 'skip', 'reason': 'frame'}
    if not render.symbols_ok(fr.get('printed_text'), en.get('oracle_text')):
        return {'id': fid, 'status': 'skip', 'reason': 'symbol'}
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
        failed = [p for p, limit in GATE.items() if ratios[p] > limit]
        if failed:
            return {'id': fid, 'status': 'skip', 'reason': 'gate', 'parts': failed, 'ratios': ratios}
        im, reason = render.compose(scan, en, render.french_texts(fr), lang_label='FR')
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
    targets = [t for t in load_targets(args.bulk, only) if t[0]['id'] not in done]
    targets.sort(key=lambda t: (t[0]['set'], t[0]['collector_number']))
    if args.sample:
        step = max(1, len(targets) // args.sample)
        targets = targets[::step][:args.sample]
    if args.limit:
        targets = targets[:args.limit]
    print(f'{len(targets)} cards to process ({len(done)} already done)', flush=True)

    counts, t0 = {}, time.time()
    with ProcessPoolExecutor(args.workers) as pool, results.open('a') as log:
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
