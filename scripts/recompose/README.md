# Recomposed French cards

Scryfall only has low-resolution scans for most French printings. When the
English printing of the same set and number is a high-resolution scan, this
generator makes a sharp French card from it: the English text is erased and the
French text set again, in the fonts the cards are printed with, and the colours
are matched to the French scan. See `render.py` for how, and `plan.md` §13 for
why.

## Fonts

The print fonts are licensed. They are in `fonts/`, **encrypted with
git-crypt**: unreadable in this public repository, and never put in an image.
To use them in a clone:

```sh
brew install git-crypt
git-crypt unlock <the key file>   # kept outside any repository, and in a password manager
```

They are read from the folder in `PRISM_FONTS_DIR`, else from `fonts/` once
unlocked, else from `~/Library/Fonts`; or file by file from these variables:

| Variable | Default file | Used for |
|---|---|---|
| `PRISM_FONT_TITLE` | `Beleren2016-Bold.ttf` | name and type, modern frame |
| `PRISM_FONT_TITLE_OLD` | `Matrix-Bold.ttf` | name and type, 2003 frame |
| `PRISM_FONT_TITLE_RETRO` | `GoudyMediaeval-Regular.ttf` | name, 1993/1997 frames |
| `PRISM_FONT_TEXT` | `PlantinMTProRg.TTF` | rules text |
| `PRISM_FONT_TEXT_ITALIC` | `PlantinMTProRgIt.TTF` | reminder and flavor text |
| `PRISM_FONT_DIGITS` | `PlantinMTProBold.TTF` | figures in mana symbols |

The free assets it needs are in `assets/` (see `assets/LICENSES.md`).

## Run by hand

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt   # and tesseract (brew install tesseract)
curl -sL "$(curl -s https://api.scryfall.com/bulk-data/all-cards | jq -r .jsonl_download_uri)" -o all-cards.jsonl.gz
.venv/bin/python recompose.py --bulk all-cards.jsonl.gz --out out/ --sample 300   # try a spread first
.venv/bin/python recompose.py --bulk all-cards.jsonl.gz --out out/               # then everything
```

By default only the French printings the site shows (`best_printings` in
`.data/cards-mtg.db`) are processed; `--all` takes every one. A run resumes
where it stopped (`out/results.jsonl`). The images go in the app's
`.data/images/mtg/recomposed/` (`<id>.jpg`, and `<id>-back.jpg` for the back
of a double-faced card).

## Two modes

- **Fixed layouts** (`render.py`): the modern, 2003 and retro frames, whose
  bars and box sit where the templates were measured. A **quality gate** first
  retypesets the English text on the same card and compares it with the scan:
  name and type must land where the scan prints them (`GATE`).
- **Free-form** (`freeform.py`, `locate.py`): everything else — borderless,
  showcase, extended art, planeswalkers, sagas, adventures, double-faced cards,
  cards the gate refuses. The text is found by reading the scan (Tesseract),
  erased ink only, set in French, then the result is read back: a card with
  English left or a line cut off is dropped rather than published.

A card keeps its official scan when neither mode can do it cleanly, or when
Scryfall has no French text for it.

## Unattended (`auto.py`)

The app refreshes its card database every night. `auto.py` makes the sharp
cards of what was added:

1. the blurry French printings the site shows, less those in `results.jsonl`:
   nothing new, nothing downloaded;
2. otherwise Scryfall's archive is fetched, `recompose.py` runs on the new ones,
   the archive is deleted;
3. a recomposed card whose French scan has since become sharp is removed.

It runs from the image `ghcr.io/diix46/spellforge-recompose` (built by
`.github/workflows/recompose-image.yml` when this folder changes), on the
Unraid server, every Sunday at 05:30, as the User Script `spellforge_hd_cards`
(`unraid/spellforge_hd_cards.sh`). To set it up again (fonts, script and
schedule) from a clone where the fonts are unlocked:

```sh
scripts/recompose/unraid/install.sh root@192.168.1.2
```

What it runs:

```sh
docker run --rm -v /mnt/user/appdata/spellforge:/data \
  -v /mnt/user/appdata/spellforge/fonts:/fonts:ro ghcr.io/diix46/spellforge-recompose
```
