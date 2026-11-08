# Histomap

Application web culturelle et éducative : explorer un sujet historique sur une carte du monde
(globe 3D, zoom jusqu'à l'échelle d'une ville) en déplaçant un curseur de temps.

- Le **sujet** (ex. le royaume de France sous Louis XIV) est coloré en bleu ; ses **adversaires** et **alliés**
  de l'époque sont colorés aussi, et leurs rôles évoluent dans le temps (l'Espagne passe d'ennemie à alliée en 1701).
- Les **événements localisés** (batailles, sièges, traités…) apparaissent puis s'estompent au fil de la frise.
- Un clic sur un territoire ou un point ouvre l'**inspecteur** à droite, alimenté par Wikipédia.
- Le lien de la page (`#s=louis-xiv&y=1672`) est partageable.

## Lancer

Aucune compilation : ouvrir `index.html` dans un navigateur (ou `python3 -m http.server`).
Une connexion internet est nécessaire (fonds de carte, frontières, Wikipédia).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `css/style.css` | Interface : sujet, légende, carte, inspecteur, frise |
| `js/app.js` | Carte (MapLibre GL), frise, rôles/couleurs, inspecteur |
| `js/wiki.js` | Résumés Wikipédia (fr, avec repli via les liens interlangues) |
| `data/scenarios.js` | Les sujets : acteurs, périodes, événements datés et géolocalisés |
| `data/entities.js` | Noms français et articles Wikipédia des États, selon l'époque |

Ajouter un sujet = ajouter un objet dans `data/scenarios.js` (le schéma est documenté en tête du fichier).

## Sources et licences

- Frontières : [historical-basemaps](https://github.com/aourednik/historical-basemaps) (A. Ourednik, GPL-3.0),
  chargées à la volée. Ce sont des **instantanés** (1650, 1700, 1715, 1783…) aux tracés approximatifs :
  la carte affiche l'instantané le plus proche antérieur à l'année choisie.
- Textes et images : Wikipédia (CC BY-SA).
- Fonds : © OpenStreetMap contributors, © CARTO ; imagerie © Esri.
