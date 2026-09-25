"""Keep the recomposed French cards up to date, unattended.

    python auto.py --data /data

Run on a schedule (the Docker image, see Dockerfile and README): the card
database is refreshed every night by the app; this makes the sharp French
cards of what it added.

1. The French printings the site shows with a blurry scan (best_printings in
   the card database), less those already processed (results.jsonl beside the
   images). Nothing new: done, without downloading anything.
2. Otherwise Scryfall's all_cards archive is fetched, recompose.py runs on the
   new ones only (it resumes from results.jsonl), and the archive is deleted.
3. A recomposed card whose French printing has since got a sharp scan is not
   needed any more: removed, with its derived sizes.
"""
import argparse
import json
import shutil
import sqlite3
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
import recompose  # noqa: E402
import render  # noqa: E402

BULK_META = 'https://api.scryfall.com/bulk-data/all_cards'
DERIVED = ('large', 'normal', 'small', 'thumb')


def log(msg):
    print(f'[recompose:auto] {msg}', flush=True)


def done_ids(results):
    if not results.exists():
        return set()
    return {json.loads(line)['id'] for line in results.read_text().splitlines() if line.strip()}


def pending(db, done):
    """The printings to make: French, blurry, shown by the site, not processed."""
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    try:
        rows = con.execute("""
            SELECT p.id FROM best_printings b JOIN printings p ON p.id = b.printing_id
            WHERE b.lang = 'fr' AND p.image_status = 'lowres'""").fetchall()
    finally:
        con.close()
    return {r[0] for r in rows} - done


def now_sharp(db, ids):
    """Of `ids`, the printings Scryfall now has as a sharp scan."""
    if not ids:
        return set()
    con = sqlite3.connect(f'file:{db}?mode=ro', uri=True)
    try:
        sharp = set()
        ids = list(ids)
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            marks = ','.join('?' * len(chunk))
            sharp |= {r[0] for r in con.execute(
                f"SELECT id FROM printings WHERE id IN ({marks}) AND image_status = 'highres_scan'", chunk)}
        return sharp
    finally:
        con.close()


def prune(out, db):
    """Remove the recomposed cards whose French scan is now sharp."""
    masters = {p.stem.removesuffix('-back') for p in out.glob('*.jpg')}
    gone = now_sharp(db, masters)
    for pid in gone:
        for name in (f'{pid}.jpg', f'{pid}-back.jpg'):
            (out / name).unlink(missing_ok=True)
            for size in DERIVED:
                for ext in ('.jpg', '.webp'):
                    (out / size / (Path(name).stem + ext)).unlink(missing_ok=True)
    return len(gone)


def download_bulk(target):
    with urllib.request.urlopen(urllib.request.Request(BULK_META, headers={'User-Agent': recompose.UA}), timeout=30) as r:
        uri = json.load(r)['jsonl_download_uri']
    tmp = target.with_suffix('.part')
    with urllib.request.urlopen(urllib.request.Request(uri, headers={'User-Agent': recompose.UA}), timeout=120) as r, tmp.open('wb') as fh:
        shutil.copyfileobj(r, fh, 1 << 20)
    tmp.rename(target)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('--data', type=Path, default=Path('/data'), help="the app's data folder (.data)")
    ap.add_argument('--workers', type=int, default=4)
    args = ap.parse_args()

    db = args.data / 'cards-mtg.db'
    out = args.data / 'images/mtg/recomposed'
    work = args.data / 'recompose'
    out.mkdir(parents=True, exist_ok=True)
    work.mkdir(parents=True, exist_ok=True)
    t0 = time.time()

    missing = render.missing_fonts()
    if missing:
        sys.exit(f'Missing fonts: {", ".join(missing)} (mount them, see README)')
    if not db.exists():
        sys.exit(f'No card database at {db}')

    removed = prune(out, db)
    if removed:
        log(f'{removed} recomposed cards removed: their French scan is sharp now')

    todo = pending(db, done_ids(out / 'results.jsonl'))
    if not todo:
        log(f'nothing new ({time.time() - t0:.0f} s)')
        return
    log(f'{len(todo)} new printings to make; fetching the Scryfall archive')

    bulk = work / 'all-cards.jsonl.gz'
    try:
        download_bulk(bulk)
        code = subprocess.call([sys.executable, str(HERE / 'recompose.py'), '--bulk', str(bulk), '--out', str(out),
                                '--db', str(db), '--workers', str(args.workers)])
    finally:
        bulk.unlink(missing_ok=True)
    if code:
        sys.exit(f'recompose.py failed (code {code})')
    # Printings the archive gave no target for (no sharp English scan of the
    # same set and number): recorded, or every run would fetch it again.
    left = pending(db, done_ids(out / 'results.jsonl'))
    with (out / 'results.jsonl').open('a') as fh:
        for pid in sorted(left):
            fh.write(json.dumps({'id': pid, 'status': 'skip', 'reason': 'no english scan'}) + '\n')
    log(f'done in {(time.time() - t0) / 60:.1f} min; {len(todo) - len(left)} processed, {len(left)} without a sharp English scan')


if __name__ == '__main__':
    main()
