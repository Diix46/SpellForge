# Galerie "Découvrir" — design

Date: 2026-07-09
Statut: approuvé (en attente de revue finale utilisateur)

## Contexte

Item 5 de la roadmap post-audit (proxxied.com research). Objectif : permettre à
un utilisateur avec compte cloud de rendre un deck visible publiquement dans
une galerie parcourable sans compte, en s'appuyant sur le mécanisme de partage
par lien existant (`shareId` sur `decks`, route `/shared/:shareId`).

## Décisions déjà validées

1. **Visibilité** : un deck devient listé publiquement via un toggle **séparé**
   ("Lister dans Découvrir"), distinct du toggle de partage par lien existant.
   Activer le listing public crée le lien de partage s'il n'existe pas encore ;
   désactiver le lien de partage désactive aussi automatiquement le listing
   (un deck public doit toujours avoir un lien valide vers lequel pointer).
2. **Pas de vues/likes/tri par popularité en V1**. Tri unique : dernière mise
   à jour, décroissant.
3. Seuls les decks **cloud** (compte requis) peuvent être publiés — cohérent
   avec la contrainte déjà existante sur le partage par lien (les decks invité
   en localStorage n'ont pas de représentation serveur).

## Hors scope (V1)

- Compteurs de vues/likes, tri par popularité.
- Modération / signalement.
- Filtres par couleur/commandant/archétype (nécessiterait de stocker des
  métadonnées dérivées du decklist — pas fait en V1, cf. section Modèle).
- Pagination avancée (infinite scroll, curseur) — une limite fixe suffit pour
  le volume actuel.

## Modèle de données

Ajout d'une colonne sur `decks` (migration Drizzle) :

```
public: integer('public', { mode: 'boolean' }).notNull().default(false),
```

Un deck public a nécessairement un `shareId` non nul (invariant appliqué côté
API, pas de contrainte SQL — cohérent avec le reste du schéma existant).

## API

### `POST /api/decks/:id/publish`
Body : `{ enabled: boolean }`. Auth requise (deck owned).

- `enabled: true` → si `shareId` est nul, en génère un (comme `share.post.ts`) ;
  set `public = true`.
- `enabled: false` → set `public = false` (le lien de partage privé, lui,
  reste actif — on ne fait que le désinscrire de la galerie).

Retourne `{ shareId, public }`.

### `server/api/decks/[id]/share.post.ts` (modifié)
Quand `enabled: false` (désactivation du lien de partage), on force aussi
`public = false` dans la même transaction — un deck sans `shareId` ne peut pas
rester listé (le lien de la galerie pointerait vers du vide).

### `GET /api/decks/discover` (nouvelle route publique, pas d'auth)
Query param optionnel `q` (recherche par nom, `LIKE`).

Jointure `decks` ⋈ `users` (sur `userId`) où `public = true`, tri par
`updatedAt` décroissant, limite fixe (60 résultats). Retourne uniquement les
champs nécessaires à l'affichage de la grille :

```ts
{ decks: Array<{ name: string, ownerDisplayName: string, updatedAt: number, shareId: string }> }
```

Pas de `raw`, pas de `userId` — même logique de minimisation que
`GET /api/shared/:shareId` existant. Le détail complet (cartes, prix) ne se
charge qu'au clic, via la page `/shared/:shareId` déjà existante — pas de
résolution Scryfall côté galerie.

## Client

### `useDeckStore`
- `Deck` gagne deux champs optionnels : `shareId?: string | null`,
  `public?: boolean`. Peuplés depuis les lignes serveur (`fromRow`) ; restent
  `undefined` pour les decks invité (localStorage), ce qui se traite comme
  "non partagé / non public" partout où c'est lu.
- Nouvelle méthode `setPublic(id, enabled): Promise<boolean>` (même forme que
  `setShare`), cloud-only.

### Page deck (`app/pages/deck/[id].vue` + `DeckToolbar.vue`)
Le bouton "Partager" actuel (clic unique → active le lien + copie) devient le
déclencheur d'un petit popover avec :
1. Toggle "Lien de partage actif" — appelle `setShare`. Si on l'éteint, le
   toggle public repasse visuellement à off (cohérent avec le cascade serveur).
2. Si actif : l'URL affichée + bouton copier.
3. Toggle "Lister dans Découvrir" — désactivé (grisé) tant que le lien n'est
   pas actif ; appelle `setPublic`.

Le comportement "clic → active et copie direct" disparaît au profit du
popover à deux réglages, plus cohérent maintenant qu'il y a deux notions
distinctes à exposer.

### Nouvelle page `/discover`
Accessible sans compte. Grille de cartes : nom du deck, pseudo du
propriétaire, "mis à jour il y a X" — clic → `/shared/:shareId`. Champ de
recherche (texte) qui refait l'appel `GET /api/decks/discover?q=...` (debounce
simple). État vide ("aucun deck public pour l'instant") si la liste est vide.

### Navigation (`app.vue`)
Nouveau lien "Découvrir" dans le nav principal (desktop + mobile), visible
pour tout le monde (invité et connecté) — à côté du lien "Mes decks" existant.

## i18n

Nouvelles clés FR/EN sous `discover.*` (titre de page, placeholder recherche,
état vide, "mis à jour il y a...") et extension de `share.*` pour le popover
(ex. `share.linkActive`, `share.listPublic`, `share.listPublicHint`).

## Gestion d'erreurs

- `setPublic`/`setShare` échouent silencieusement côté réseau → toast d'erreur
  existant (`share.error`), pas de nouveau cas particulier.
- `GET /api/decks/discover` : erreur serveur → page affiche un état d'erreur
  simple avec bouton réessayer (même pattern que le reste de l'app).

## Tests

- Route `publish.post.ts` : active sans `shareId` existant (en génère un),
  active avec `shareId` déjà présent (le réutilise), désactive.
- `share.post.ts` : désactiver le lien force bien `public = false`.
- `GET /api/decks/discover` : ne retourne que les decks `public = true`,
  respecte `q`, n'expose pas `raw`/`userId`.
- Vérification manuelle (devtools) : popover deck page (toggle share → toggle
  public → copie lien), page `/discover` (recherche, clic vers deck partagé,
  état vide), nav link visible en invité.
