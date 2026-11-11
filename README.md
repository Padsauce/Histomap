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
- **Deux modes de frontières** (Affichage → Frontières) : *rapide* (instantanés historical-basemaps,
  monde entier) ou *précis* (Cliopatria, année par année, de 3400 av. J.-C. à 2024, avec les empires et
  alliances en pointillé). Avant 6000 av. J.-C., la carte montre les terres émergées par la baisse des mers.
- **Frontières dynamiques** : entre deux états connus, les contours glissent progressivement
  (interpolation signalée comme telle ; désactivable).
- **Mode professeur** (bouton 🎒 Préparer) : ajoutez événements, États et vues à un sujet de cours,
  ordonnez-les, annotez-les, posez des notes sur la carte, lancez une **visite guidée** en plein écran,
  imprimez une **fiche élève** ou **téléchargez le sujet** (`.histomap`) pour l'ouvrir sans connexion.
- **Mouvements** : armées et voyages avec flèches et tête de colonne qui avance pendant la lecture.
- **Import** de vos propres frontières (GeoJSON daté), qui restent dans votre navigateur.
- **Pendant ce temps** : l'inspecteur montre, région par région, ce qui se passe ailleurs dans le
  monde au même moment ; la couche « 🌍 Monde » l'affiche sur la carte et le bouton ☷ ajoute des
  frises parallèles par région sous la frise principale.
- L'onglet **Chronologie** offre une vue liste de tous les événements (navigation au clavier, lecteurs d'écran).
- Le lien de la page (`#s=…&t=…&v=…&f=…`) conserve le sujet, la date, l'échelle et les filtres.

Sujets éditorialisés : Louis XIV, guerre de Cent Ans, épopée napoléonienne, Homo sapiens (préhistoire),
bataille d'Austerlitz heure par heure, exploration libre. Tous les autres sujets se génèrent par la recherche.

### Raccourcis

| Touche | Action |
|---|---|
| Espace | Lecture / pause |
| ← → | Reculer / avancer d'une graduation |
| Sur la frise : Maj + ← → | Grand pas |
| Sur la frise : + − | Zoomer / dézoomer dans le temps |
| / | Aller à la recherche |
| Échap | Fermer l'inspecteur |

## Utiliser

**En ligne** : https://padsauce.github.io/Histomap/ (publié automatiquement à chaque push, voir plus bas).

**Rechercher** (barre en haut, raccourci `/`) :
- un sujet : « Charles Quint », « guerre de Sept Ans », « bataille de Waterloo », « Empire du Mali »,
  « Victor Hugo »… → Histomap construit le sujet en direct depuis Wikidata ;
- une date : « 1789 », « 52 av. J.-C. » ;
- un lieu à une date : « Kyoto en 1600 ».

Les sujets générés sont mémorisés dans le navigateur (8 derniers) et le lien de la page permet de les
rouvrir ou de les partager (`#s=wd:Q7742…`).

## Développer

```bash
npm install
npm run dev        # serveur de développement (http://localhost:5173)
npm test           # tests unitaires (Vitest)
npm run build      # vérification des types + build de production dans dist/
npm run build:index  # reconstruit l'index mondial (public/index) depuis Wikidata (≈ 30 s)
npm run build:borders  # télécharge Cliopatria et prépare le mode précis (public/borders, non versionné)
```

## Structure

| Fichier | Rôle |
|---|---|
| `index.html`, `src/style.css` | Interface : recherche, panneaux, carte, filtres, inspecteur, frise |
| `src/main.ts` | Application : carte (MapLibre GL), rôles et couleurs, événements, trajets, filtres, inspecteur, recherche |
| `src/core/generator.ts` | Génération de sujets depuis Wikidata (recettes : souverain, personne, guerre, événement, État, lieu) |
| `src/core/wikidata.ts` | Client Wikidata : recherche d'entités, SPARQL, libellés, conversion des dates |
| `src/core/time.ts` | Modèle temporel (années décimales, précisions, calendrier, formats, graduations) |
| `src/core/net.ts` | Accès réseau : file d'attente, cache mémoire et IndexedDB, mode dégradé, réessais |
| `src/core/wiki.ts` | Résumés et articles Wikipédia |
| `src/core/worldindex.ts` | Index mondial : chargement par tranches, régions, libellés |
| `tools/build-index.mjs` | Construction de l'index mondial (QLever, repli Wikidata) |
| `public/index/` | Index mondial (fichiers statiques) |
| `src/core/borders.ts` | Fournisseurs de frontières : mode rapide, mode précis (Cliopatria) |
| `tools/build-borders.mjs` | Préparation de Cliopatria et des plateaux continentaux |
| `public/paleo/` | Mers profondes (Natural Earth, domaine public) pour la paléogéographie |
| `src/core/types.ts` | Types du modèle de données |
| `src/ui/timeline.ts` | Frise zoomable (canvas) |
| `src/ui/teacher.ts` | Mode Préparation, paquets hors ligne, visite guidée, fiche élève |
| `src/core/morph.ts` | Frontières dynamiques (interpolation des contours) |
| `public/sw.js`, `public/manifest.webmanifest` | Application installable et hors ligne |
| `src/i18n/` | Textes d'interface (français, anglais) |
| `src/data/` | Sujets éditorialisés, catégories, noms d'États par époque |
| `tests/` | Tests unitaires |
| `.github/workflows/deploy.yml` | Build, tests et publication sur GitHub Pages |

Ajouter un sujet éditorialisé = ajouter un objet dans `src/data/scenarios.ts` (schéma : `src/core/types.ts`).

### Publication sur GitHub Pages

Le workflow `.github/workflows/deploy.yml` construit et publie l'application à chaque push.
Il faut l'activer **une seule fois** : dépôt GitHub → *Settings* → *Pages* → *Build and deployment* →
*Source* : **GitHub Actions**.

## Sources et licences

- Frontières : [historical-basemaps](https://github.com/aourednik/historical-basemaps) (A. Ourednik, GPL-3.0),
  chargées à la volée. Ce sont des **instantanés** (1650, 1700, 1715, 1783…) aux tracés approximatifs :
  la carte affiche l'instantané le plus proche antérieur à l'année choisie.
- Frontières précises : [Cliopatria](https://github.com/Seshat-Global-History-Databank/cliopatria)
  (Seshat Global History Databank) — licence à vérifier avant diffusion publique.
- Bathymétrie : [Natural Earth](https://www.naturalearthdata.com) (domaine public).
- Données des sujets générés : Wikidata (CC0).
- Textes et images : Wikipédia (CC BY-SA).
- Fonds : © OpenStreetMap contributors, © CARTO ; imagerie © Esri.

## Feuille de route

Le plan détaillé du projet et les spécifications fonctionnelles sont dans [`docs/PLAN.md`](docs/PLAN.md).
