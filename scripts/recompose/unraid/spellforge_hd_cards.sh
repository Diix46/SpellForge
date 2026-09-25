#!/bin/bash
# SpellForge : cartes françaises HD des nouvelles impressions (scripts/recompose/auto.py).
# Rien de neuf : sortie en quelques secondes, rien de téléchargé.
docker pull -q ghcr.io/diix46/spellforge-recompose:latest
docker run --rm --name spellforge-recompose --cpus 4 \
  -v /mnt/user/appdata/spellforge:/data \
  -v /mnt/user/appdata/spellforge/fonts:/fonts:ro \
  ghcr.io/diix46/spellforge-recompose:latest
