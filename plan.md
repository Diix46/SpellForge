# Plan — Prism : multi-univers & données locales

> Statut : **à valider avant implémentation**. Rien n'est codé tant que ce document
> n'est pas approuvé. Tous les chiffres ci-dessous sont **mesurés**, pas estimés
> (téléchargements réels des dumps Scryfall, base SQLite réellement construite,
> `Content-Length` réels sur le CDN, probes FTS5 contre `@libsql/client` du projet).

---

## 1. Décisions actées

| Sujet | Décision |
|---|---|
| Marque | Rebrand neutre complet → **Prism** (à confirmer : domaine, antériorité) |
| Périmètre | Magic **+** One Piece Card Game, extensible à un 3ᵉ jeu |
| One Piece | Bibliothèque + deckbuilding. **Jamais de proxy, jamais d'export imprimable** |
| Données cartes | **Zéro dépendance API au runtime.** Tout en base locale |
| Déploiement | L'app tourne sur **192.168.1.2** (Docker + volume nommé) |
| Images One Piece | **Miroir complet FR local** (~260 Mio) |
| Direction visuelle | Deux mondes opposés : One Piece de jour sur papier, Magic de nuit sur obsidienne |

Maquette de référence : https://claude.ai/artifact/4xdKcaNZMmijH8ExhSv3cp

---

## 2. Chiffres de référence (mesurés le 16/09/2026)

### Données

| Élément | Valeur réelle |
|---|---|
| Dump `all_cards` Scryfall | 375 Mo gzip → **2,70 Gio** décompressé → **542 326 lignes** |
| Après filtre `lang IN ('en','fr')` | **174 228 lignes** (115 381 EN + 58 847 FR) |
| Base SQLite finale (lean + FTS5) | **239 Mio** — seed gzippé **56 Mio** |
| Temps d'ingestion complet | **19 s** (download + gunzip + parse + insert + index + VACUUM) |
| Latence d'une requête type | **21 ms** (commandants FR, cmc ≤ 4, tri EDHREC) |
| One Piece FR | **2 888 cartes**, 1,7 Mo JSON, 37 packs |

### Images

| Élément | Volume |
|---|---|
| Magic `normal` (488×680), EN+FR | **≈ 13,5 Gio** |
| Magic `small` (146×204), EN+FR | ≈ 2,2 Gio |
| One Piece FR (WebP, 92,3 Ko moy.) | **≈ 260 Mio** |
| **Total miroir complet** | **≈ 16 Gio** |

> **Le budget annoncé était 1 To. Le besoin réel est ~16 Gio — 60× moins.**
> Le téraoctet n'apparaît que si on mirore les PNG haute résolution de Scryfall
> (553 Gio à eux seuls), ce dont personne n'a besoin pour afficher une grille.

---

## 3. Architecture cible

```
┌─ Ingestion (tâche Nitro planifiée, hors chemin de requête) ─────────┐
│  Scryfall  /bulk-data (3,4 Ko)  → compare updated_at                │
│      └─ si changé : stream jsonl_download_uri                       │
│            fetch → gunzip → readline → JSON.parse → INSERT batché   │
│            → cards-new.db → rename() atomique → reopen              │
│  punk-records (JSON statique, maj hebdo) → même pipeline pour OP    │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ SQLite / libSQL  (volume nommé, disque local, WAL) ────────────────┐
│  oracle_cards · printings · card_faces · card_parts · card_search   │
│  + op_cards · op_packs                                              │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
┌─ CardProvider (interface) ──────────────────────────────────────────┐
│  mtgProvider          │  optcgProvider                              │
│  search / resolve / prints / rules / palette / marketplace          │
└─────────────────────────────────────────────────────────────────────┘
                              ↓
                    app/ (inchangée dans sa structure)
```

**Ce qui disparaît** : `server/utils/scryfall.ts`, les 8 routes `server/api/cards/*`
qui proxient Scryfall, `enrichFrenchPrices`, `bulkPrefetchFrench`,
`bulkPrefetchLocalized`, `searchFrenchByName`, `searchBestPrinting`.

**Le gain principal** : la résolution d'une carte en français passe de **5 appels
réseau en cascade** à **une requête indexée**.

```sql
WHERE oracle_id = ? AND lang = 'fr' AND is_real_image = 1
ORDER BY (image_status = 'highres_scan') DESC, released_at DESC LIMIT 1
```

---

## 4. Schéma

Validé techniquement contre `@libsql/client` du projet : **FTS5 avec
`unicode61 remove_diacritics 2`**, **JSON1**, **colonnes générées indexables** et
**WAL** sont tous disponibles. Aucun moteur de recherche externe nécessaire.

```
oracle_cards          oracle_id PK · name · name_folded · name_front · type_line
                      oracle_text · mana_cost · cmc · layout · keywords
                      colors_mask INT · color_identity_mask INT      ← 5 bits WUBRG
                      legal_commander · is_funny · is_commander · edhrec_rank
                      min_price_eur                                  ← rollup, cf. §5.4
                      INDEX (name_folded) (cmc, edhrec_rank) (color_identity_mask)

printings             id PK · oracle_id → · lang · set · collector_number
                      released_at · rarity · promo · image_status · is_real_image
                      printed_name · printed_type_line · printed_text
                      price_eur · image_updated_at                   ← pas d'URL, cf. §5.8
                      UNIQUE (set, collector_number, lang)
                      INDEX (oracle_id, lang, is_real_image, image_status)

card_faces            (printing_id, face_index) PK — faces 0 et 1 uniquement
card_parts            oracle_id · component='token' · related_name
card_search           FTS5 : name_folded, printed_name, oracle_text, printed_text

op_cards              id PK · card_number · name · category · colors · rarity
                      pack_id · set_code · block_number · cost · life · power
                      counter · attributes · types · effect · trigger · lang
op_packs              id PK · label · lang
```

**Masques de couleur** : `id<=WUBRG` (sous-ensemble) devient `mask & ~q = 0`,
`color>=` (sur-ensemble) devient `mask & q = q`. Deux tests entiers indexés au lieu
de comparaisons de chaînes — c'est la requête la plus chaude de l'app.

---

## 5. Les pièges identifiés (chacun coûte une journée si découvert tard)

1. **L'API bulk a changé en juillet 2026.** `download_uri` et `size` **n'existent
   plus** ; ce sont `jsonl_download_uri` et `compressed_size`, et les fichiers sont
   du **JSONL gzippé**, pas un tableau JSON. Toute doc ou tout exemple antérieur est
   mort. Bonne nouvelle : le streaming devient trivial (une ligne = un objet).
2. **`default_cards` ne contient que 430 cartes françaises** (celles sans version
   anglaise). Il faut impérativement `all_cards` — 58 847 impressions FR.
3. **`is:commander` n'est récupérable qu'à 90,7 %** (3 384 dérivés vs 3 730 réels).
   Les Backgrounds et variantes *partner* manquent → liste d'exceptions à maintenir,
   avec un test épinglé sur les comptes Scryfall.
4. **Les prix EUR sont absents de 98 % des impressions FR** (1 105 / 58 847). Filtrer
   sur le prix de la ligne française viderait le catalogue. Il faut un rollup
   `min(price_eur)` par `oracle_id` → couverture 99,8 %.
5. **`ORDER BY edhrec_rank` met les NULL en premier** en SQLite ASC. Toujours
   `ORDER BY edhrec_rank IS NULL, edhrec_rank`.
6. **Plusieurs impressions FR partagent un `oracle_id`** → `GROUP BY oracle_id`,
   sinon la même carte apparaît trois fois. C'est exactement `unique=cards` vs
   `unique=prints` : il faut exposer le même choix.
7. **Scryfall masque par défaut** memorabilia, funny, art_series, tokens. Sans
   reproduire ces exclusions, nos compteurs divergeront visiblement des siens.
8. **Ne jamais stocker les URLs d'images** : elles se dérivent de `id` +
   `image_updated_at`. Les stocker coûte **400 Mio**, soit 62 % de la base.
9. **SQLite en WAL sur bind mount macOS ou NFS = corruption.** Volume Docker
   **nommé, sur disque local**, non négociable — y compris en dev.
10. **Ne jamais `fs.copyFile()` une base WAL ouverte.** `VACUUM INTO` pour les
    snapshots.

---

## 6. Lots de travail

Ordonnés pour que **chaque lot soit livrable et testable seul**, et que le
comportement observable ne change qu'au lot 4.

| # | Lot | Contenu | Sortie attendue |
|---|---|---|---|
| **0** ✔ | Assainissement — **fait** | jspdf 2.5.2→**4.2.1** (sécurité, cf. §8 bis), `@nuxt/ui` 4.8.2→**4.11.1**, `npm audit fix`, Renovate `pnpmDedupe`→`npmDedupe`, Dockerfile node:20→**24**, purge des 3 polices inutilisées | ✔ lint 0 · typecheck 0 · build 0 · **`npm audit --omit=dev` : 0 vulnérabilité** · build 4,32 → **4,07 Mo** |
| **1** ~ | Ingestion MTG **et** One Piece + tests | Streaming JSONL, schéma, index, FTS5, échange atomique, **une base par jeu**. Vitest en place (16 tests). Reste : passer l'ingestion en tâche Nitro planifiée | ✔ MTG **131,5 Mo en 92 s** (38 789 cartes / 174 228 impressions) · OP **6,7 Mo en 5 s** (2 888 FR + 4 843 EN) · `legal:commander` = **31 830, exact** · `npm run test` : **16/16** |
| **2** ✔ | Moteur de recherche — **fait** | `server/utils/cards/mtg-query.ts` : thèmes en FTS5, masques de couleur, budget, identité, tris, pagination, épinglage, autocomplétion | ✔ **3,4 ms** sur la navigation par défaut (168 → 66 → 3,4), page 20 à **3,6 ms** (109), résultats justes en VF · plan d'exécution sans `SCAN bp` ni tri du jeu complet |
| **3** | `GameCard` + `CardProvider` | Neutralisation de `ResolvedCard` (~25 fichiers), extraction de `providers/mtg/` depuis `useMtg` + `scryfall/*` | **Zéro changement de comportement**, lint + typecheck + tests verts |
| **4** | Bascule | Les routes `/api/cards/*` lisent la base ; suppression des proxies Scryfall | Plus aucun appel sortant vers `api.scryfall.com` au runtime |
| **5** ~ | Images — **volet One Piece fait** | Miroir OP complet (FR + repli EN) ; reste : stratégie MTG (cf. §9) et adaptation du proxy Nitro | ✔ **4 374 visuels, 801 Mo, 743 s, 0 échec, 0 manquant** · intégrité vérifiée (118/118 vraies images) · reprise sur incident testée |
| **6** | Adaptateur One Piece | Ingestion punk-records, moteur de règles OPTCG (50 + leader, 4 max par numéro, couleurs ⊆ leader, rotation par bloc, paires bannies) | Un deck OP se construit et se valide |
| **7** | UI multi-univers | Colonne `game`, migration `localStorage` v2, rail de filtres piloté par l'adaptateur, thèmes par univers, composants de coût | La maquette devient l'application |
| **8** | SEO | Rendu hybride sur les pages publiques (bibliothèque, fiche carte, `/discover`, `/shared/:id`), robots, sitemap | Une fiche carte est indexable |
| **9** | Rebrand | Prism : nom, logo, copies, métadonnées | — |

Le lot 3 est le verrou : **tant que `ResolvedCard` transporte le JSON brut de
Scryfall dans 25 fichiers, aucun second jeu n'est possible.**

---

## 7. Ce qui reste externe (assumé)

| Dépendance | Pourquoi elle reste |
|---|---|
| **EDHREC** | Recommandations « souvent joué avec ». Ce n'est pas de la donnée carte et il n'existe aucun équivalent local. Alternative à terme : calculer nos propres statistiques sur les decks publics de la plateforme |
| **API Anthropic** | Le coach. ⚠️ Son outil `scryfall_search` laisse le modèle écrire de la **syntaxe Scryfall libre** — à brancher sur le parseur du lot 2, ou à réécrire en filtres structurés |
| **CDN Scryfall** | Uniquement si on choisit le hotlink pour les images Magic (cf. §9) |

---

## 8. Cadre légal

**Magic** — Scryfall **encourage explicitement** le cache local : « We encourage you
to cache the data you download from Scryfall », et « If you need to rapidly look up
card names, prices, or resolve a large number of card images, **you must use the
bulk data files** ». Interdits : mettre les données derrière un paywall, republier
brut sans valeur ajoutée, recadrer le copyright ou le nom de l'artiste. Un
deckbuilder passe largement la barre. Mention Fan Content à afficher.

**One Piece** — **aucune licence, aucun équivalent fan-content.** Les données sont
scrapées du site Bandai et restent « copyrighted by ©Eiichiro Oda/Shueisha, Toei
Animation, Bandai Namco ». Le miroir de 2 888 visuels est une décision d'exposition
assumée. L'absence de proxy est notre meilleure protection : c'est précisément la
fonctionnalité que visent les règles IP de Bandai (« goods derived from or copied
from card designs »). Disclaimer visible obligatoire.

---

## 8 bis. Pourquoi jspdf était urgent

L'audit de départ comptait 50 vulnérabilités, presque toutes dans l'outillage de
build — j'avais vérifié qu'aucune n'atteignait `.output`. **Sauf jspdf.** C'est une
dépendance directe qui s'exécute dans le navigateur de l'utilisateur, nourrie de
texte de decklist et d'images distantes. La 2.5.2 cumulait **deux critiques** —
inclusion de fichier local / traversée de chemin (`GHSA-f8cm-6447-x5h2`) et
injection HTML (`GHSA-wfv2-pwc8-crg5`) — et une demi-douzaine de hautes :
injection d'objets PDF permettant l'exécution de JavaScript arbitraire, ReDoS,
DoS via dimensions GIF/BMP malformées.

La surface d'API réellement utilisée par `usePdfExport.ts` est minuscule et
stable (`addPage`, `addImage`, `setDrawColor`, `rect`, `setLineWidth`, `line`,
`save`, `output`), et l'import était déjà dynamique : la montée en v4 n'a demandé
aucune modification de code. Les 33 alertes `@tiptap/*` étaient transitives via
`@nuxt/ui` et tombent avec la 4.11.1, qui corrige au passage un arbre de
dépendances incohérent (`deduped invalid`).

## 9. À valider avant de démarrer

1. **Images Magic** — trois options :
   - **miroir `normal` + `small` EN+FR (~16 Gio)** → indépendance totale *(ma recommandation, cohérente avec l'objectif annoncé)*
   - cache à la demande (quelques Gio, croît avec l'usage)
   - hotlink `cards.scryfall.io` — explicitement **sans limite de débit** et sanctionné par la doc, mais c'est une dépendance externe qui subsiste
2. **Le nom Prism** — vérifier domaine et antériorité avant d'engager le rebrand.
3. **Accès SSH** — les deux clés disponibles (`alsatis`, `jolibrain`) sont rejetées
   par 192.168.1.2. Débloquer avec `ssh-copy-id -i ~/.ssh/alsatis.pub root@192.168.1.2`.
4. **Le sélecteur d'édition multilingue** actuel (`include_multilingual=true`) affiche
   toutes les langues. Un ingest EN+FR le dégraderait visiblement. On assume, ou on
   ingère toutes les langues (542 326 lignes, base ~700 Mio au lieu de 239 Mio).

---

## 10. Risques

| Risque | Mitigation |
|---|---|
| One Piece : source scrapée, sans SLA | punk-records est régénéré chaque semaine ; sa cadence est notre signal d'alerte. vegapull en repli |
| Une refonte du site Bandai casse tout | Snapshot versionné à chaque release ; l'app continue de tourner sur la dernière base valide |
| Couverture FR structurellement partielle | OP FR : 37 packs sur 60. Magic FR : `printed_type_line` à 78 %. Le repli EN par carte se conçoit dès le départ, pas après |
| Prix périmés | Scryfall : « dangerously stale after 24 hours ». Ré-ingestion quotidienne si on affiche des prix, hebdomadaire sinon |
| Régression silencieuse à la bascule | Le lot 3 impose zéro changement de comportement, et le lot 2 est couvert par des tests comparés aux comptes Scryfall |
