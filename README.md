# Histomap

Application web culturelle et éducative : explorer un sujet historique sur une carte du monde
(globe 3D, zoom jusqu'à l'échelle d'une ville) en déplaçant un curseur de temps dont l'échelle
s'adapte au sujet, de 100 000 ans à l'heure.

- Le **sujet** (ex. le royaume de France sous Louis XIV) est coloré en bleu ; ses **adversaires** et **alliés**
  de l'époque sont colorés aussi, et leurs rôles évoluent dans le temps (l'Espagne passe d'ennemie à alliée en 1701).
- Les **événements localisés** apparaissent puis s'estompent ; ils sont classés en **catégories filtrables**
  (barre d'icônes au-dessus de la carte) et filtrés par **importance** selon le zoom.
- La **frise** se zoome comme une carte : molette, pincement, glisser, clic ; ses graduations s'adaptent.
- L'**inspecteur** (à droite) s'organise en tiroirs : faits clés, résumé Wikipédia, chronologie liée,
  acteurs, sources, article complet.
- L'onglet **Chronologie** offre une vue liste de tous les événements (navigation au clavier, lecteurs d'écran).
- Le lien de la page (`#s=…&t=…&v=…&f=…`) conserve le sujet, la date, l'échelle et les filtres.

Sujets fournis : Louis XIV, guerre de Cent Ans, épopée napoléonienne, Homo sapiens (préhistoire),
bataille d'Austerlitz heure par heure, exploration libre.

### Raccourcis

| Touche | Action |
|---|---|
| Espace | Lecture / pause |
| ← → | Reculer / avancer d'une graduation |
| Sur la frise : Maj + ← → | Grand pas |
| Sur la frise : + − | Zoomer / dézoomer dans le temps |
| Échap | Fermer l'inspecteur |

## Lancer

Aucune compilation : ouvrir `index.html` dans un navigateur (ou `python3 -m http.server`).
Une connexion internet est nécessaire (fonds de carte, frontières, Wikipédia).

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `css/style.css` | Interface : panneaux, carte, filtres, inspecteur, frise |
| `js/app.js` | Carte (MapLibre GL), rôles et couleurs, événements, filtres, inspecteur |
| `js/timeline.js` | Frise zoomable (canvas) : graduations, périodes, densité, interactions |
| `js/time.js` | Modèle temporel (années décimales, précisions, calendrier, formats) |
| `js/net.js` | Accès réseau : file d'attente, cache mémoire et IndexedDB, mode dégradé |
| `js/wiki.js` | Résumés et articles Wikipédia |
| `js/i18n.js`, `i18n/*.js` | Textes d'interface (français, anglais) |
| `data/scenarios.js` | Les sujets : acteurs, périodes, événements datés et géolocalisés |
| `data/categories.js` | Catégories d'événements (icône, couleur, libellés) |
| `data/entities.js` | Noms français et articles Wikipédia des États, selon l'époque |

Ajouter un sujet = ajouter un objet dans `data/scenarios.js` (le schéma est documenté en tête du fichier).

## Sources et licences

- Frontières : [historical-basemaps](https://github.com/aourednik/historical-basemaps) (A. Ourednik, GPL-3.0),
  chargées à la volée. Ce sont des **instantanés** (1650, 1700, 1715, 1783…) aux tracés approximatifs :
  la carte affiche l'instantané le plus proche antérieur à l'année choisie.
- Textes et images : Wikipédia (CC BY-SA).
- Fonds : © OpenStreetMap contributors, © CARTO ; imagerie © Esri.

## Feuille de route

Le plan détaillé du projet et les spécifications fonctionnelles sont dans [`docs/PLAN.md`](docs/PLAN.md).
