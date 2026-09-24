# Recomposed French cards

Scryfall only has low-resolution scans for most French printings. When the
English printing of the same set and number is a high-resolution scan, this
generator makes a sharp French card from it: the English text is erased and the
French text set again, in the fonts the cards are printed with. See `render.py`
for how, and `plan.md` §13 for why.

## Fonts

The print fonts are proprietary and **never committed**. They are read from
`~/Library/Fonts`, or from these variables:

| Variable | Default file | Used for |
|---|---|---|
| `PRISM_FONT_TITLE` | `Beleren2016-Bold.ttf` | name and type, modern frame |
| `PRISM_FONT_TITLE_OLD` | `Matrix-Bold.ttf` | name and type, 2003 frame |
| `PRISM_FONT_TEXT` | `PlantinMTProRg.TTF` | rules text |
| `PRISM_FONT_TEXT_ITALIC` | `PlantinMTProRgIt.TTF` | reminder and flavor text |
| `PRISM_FONT_DIGITS` | `PlantinMTProBold.TTF` | figures in mana symbols |

The free assets it needs are in `assets/` (see `assets/LICENSES.md`).

## Run

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
curl -sL "$(curl -s https://api.scryfall.com/bulk-data/all-cards | jq -r .jsonl_download_uri)" -o all-cards.jsonl.gz
.venv/bin/python recompose.py --bulk all-cards.jsonl.gz --out out/ --sample 300   # try a spread first
.venv/bin/python recompose.py --bulk all-cards.jsonl.gz --out out/               # then everything
```

By default only the French printings the site shows (`best_printings` in
`.data/cards-mtg.db`) are processed; `--all` takes every one. A run resumes
where it stopped (`out/results.jsonl`).

## What is left alone

A card keeps its official scan when its frame is not one the templates were
measured on (borderless, showcase, double-faced, sagas, planeswalkers,
watermarks, the 1997 frame…), when its text uses a symbol the generator cannot
draw, or when the **quality gate** fails: the English text is first retypeset
on the same card and compared with the scan; name and type must land where the
scan prints them (`GATE` in `recompose.py`).
