# Histomap — Plan de projet et spécifications fonctionnelles

> Document de référence pour définir les fonctionnalités. Chaque fonctionnalité porte un identifiant
> (`F-xx`) pour être citée dans les tickets, commits et revues. Priorités : **M** (indispensable),
> **S** (souhaitable), **C** (confort), **L** (plus tard).
>
> État : v0.5 — phases 1 à 3 livrées. Application en ligne : https://padsauce.github.io/Histomap/ Prototype : `index.html`,
> branche `claude/cultural-education-app-224852`.

---

## 1. Vision

Histomap est un **atlas historique vivant** : on choisit un sujet (un roi, une guerre, une invention,
une migration préhistorique…) et on le voit évoluer sur un globe, en déplaçant un curseur de temps
dont l'échelle s'adapte au sujet (de 10 000 ans à l'heure).

Ce qui le distingue :

1. **La synchronie mondiale** — pendant que l'on suit Louis XIV, on voit ce qui se passe au même
   moment en Chine, en Afrique ou aux Amériques. C'est l'atout central de l'application.
2. **Le zoom à double sens** — zoom spatial (du globe à la rue) *et* zoom temporel (du millénaire à
   l'heure), avec une information qui se densifie progressivement (« tiroirs »).
3. **Des données vivantes** — Wikidata et Wikipédia sont interrogés en temps réel ; l'application ne
   stocke que ce qui est indispensable (index légers, sujets éditorialisés, paquets hors ligne).
4. **Un outil pour enseigner** — un professeur prépare un sujet en ligne, sélectionne ce qu'il veut
   garder, et l'emporte hors ligne pour la classe.

### Principes directeurs

| Principe | Conséquence concrète |
|---|---|
| Lisible pour tous | Un niveau de lecture « grand public » par défaut, le détail sur demande |
| Honnête sur l'incertitude | Toute frontière, date ou lieu affiche sa source et sa précision |
| Mondial, pas européocentré | Le mode « Pendant ce temps » est natif ; on mesure et corrige les biais de couverture |
| Temps réel d'abord | Requêtes en direct ; le stockage local n'est qu'un cache ou un export choisi |
| Multilingue dès la conception | Aucun texte en dur ; toutes les données demandées dans la langue de l'utilisateur |

---

## 2. Publics et cas d'usage

| Profil | Besoin | Exemple |
|---|---|---|
| Curieux / grand public | Explorer, comprendre vite, se laisser porter | « Que se passait-il dans le monde en 1453 ? » |
| Élève | Réviser un chapitre, situer des événements | Suivre la guerre de Cent Ans bataille par bataille |
| Professeur | Préparer un support, le projeter, l'utiliser hors ligne | Paquet « Révolution française » pour une classe de 4e |
| Passionné / chercheur amateur | Le détail, les sources, ses propres données | Importer ses frontières de la Bourgogne des Valois |

**Parcours clés**

- **P1 — Explorer** : recherche « Louis XIV » → la carte se cadre sur la France de 1643 à 1715 → lecture
  automatique → clic sur une bataille → l'inspecteur s'ouvre → « aller plus loin » vers l'article.
- **P2 — Comparer** : sur le même sujet, ouvrir « Pendant ce temps » → voir les Qing, l'Empire moghol,
  l'Empire ashanti en 1680.
- **P3 — Préparer un cours** : mode Préparation → cocher événements, personnages et textes dans
  l'inspecteur → « Télécharger le sujet » → ouverture hors ligne en classe, avec visite guidée.
- **P4 — Temps profond** : recherche « peuplement de l'Amérique » → carte paléogéographique (Béringie,
  calottes glaciaires) → échelle de 1 000 ans par graduation.
- **P5 — Précision** : recherche « bataille d'Austerlitz » → la frise passe en heures → mouvements des
  corps d'armée en flèches animées → zoom au niveau du village.

---

## 3. Hiérarchie de l'information (« tiroirs »)

### 3.1 Niveaux de détail (LOD) sur la carte

Chaque objet reçoit un **score d'importance** (0–100) qui décide de son apparition selon le zoom
spatial *et* temporel. Calcul de base : nombre d'articles Wikipédia liés (sitelinks Wikidata),
corrigé par le type, la durée et un bonus éditorial (sujets choisis à la main), puis normalisé par
région et par époque pour ne pas écraser les zones moins documentées.

| Niveau | Zoom carte | Durée visible sur la frise | Ce qui s'affiche |
|---|---|---|---|
| L0 — Monde | 0–2 | > 1 000 ans | Civilisations et grands empires, quelques jalons majeurs |
| L1 — Continent | 2–4 | 100–1 000 ans | États, guerres majeures, grandes découvertes |
| L2 — Région | 4–7 | 10–100 ans | Provinces, batailles, traités, personnalités |
| L3 — Local | 7–11 | 1–10 ans | Sièges, villes, événements locaux, lieux de naissance |
| L4 — Fin | > 11 | jours, heures | Mouvements d'unités, bâtiments, plans de ville d'époque |

- **F-01 (M)** Filtrage par importance selon le zoom spatial et temporel.
- **F-02 (M)** Regroupement (clustering) des points denses, avec un compteur par catégorie.
- **F-03 (S)** Indicateur « N éléments masqués — zoomez pour voir plus ».

### 3.2 Tiroirs de l'inspecteur

L'inspecteur s'organise en sections repliables, de la plus courte à la plus riche :

1. **En bref** — nom d'époque, dates, rôle dans le sujet, une phrase (toujours visible).
2. **Faits clés** — tableau issu de Wikidata (dirigeants, capitale, participants, vainqueur, bilan…).
3. **Résumé** — extrait Wikipédia et image.
4. **Chronologie liée** — événements rattachés, cliquables (saut dans le temps et l'espace).
5. **Acteurs et relations** — alliés, adversaires, successeurs/prédécesseurs, avec mini-graphe.
6. **Pendant ce temps** — ce qui se passe ailleurs à la même date.
7. **Sources et fiabilité** — origine de chaque donnée, précision, liens Wikidata/Wikipédia,
   « signaler une erreur ».
8. **Article complet** — lecture de l'article Wikipédia dans le panneau (sans quitter l'application).

- **F-04 (M)** Inspecteur à tiroirs, dont l'état replié/déplié est mémorisé.
- **F-05 (S)** Fil d'Ariane dans l'inspecteur (Louis XIV › Guerre de Hollande › Passage du Rhin).
- **F-06 (S)** Épinglage : garder plusieurs fiches ouvertes en onglets.

---

## 4. Le temps

### 4.1 Modèle de données temporel

- Représentation interne : **année astronomique décimale** (1 av. J.-C. = 0, 2 av. J.-C. = −1),
  stockée en flottant 64 bits : précise à la seconde près en 2000, et utilisable jusqu'à −10⁹.
- Chaque date porte une **précision**, alignée sur Wikidata : milliard d'années, million d'années,
  100 000 ans, 10 000 ans, millénaire, siècle, décennie, année, mois, jour ; complétée par **heure**
  et **minute** (absentes de Wikidata, issues des sujets éditorialisés ou de l'IA).
- Chaque événement a un **intervalle** (début, fin) et éventuellement des bornes floues
  (« au plus tôt / au plus tard »), affichées en dégradé.
- Calendriers : conversion julien/grégorien (Wikidata fournit le modèle de calendrier) ;
  affichage « BP » (avant le présent) pour la préhistoire, « av. / apr. J.-C. » sinon, réglable.

### 4.2 Frise adaptative

- **F-10 (M)** Frise zoomable comme une carte : molette ou pincement pour changer d'échelle, glisser
  pour se déplacer. Graduations automatiques : 10 000 ans › 1 000 › 100 › 10 › 1 an › mois › jour › heure.
- **F-11 (M)** Échelle initiale déduite du sujet (durée et précision des données).
- **F-12 (S)** Échelle non linéaire optionnelle (logarithmique vers le passé) pour le temps profond.
- **F-13 (M)** Densité d'événements affichée sous la frise (histogramme par catégorie).
- **F-14 (M)** Lecture automatique avec une vitesse exprimée en « unités de frise par seconde ».
- **F-15 (S)** Bandes de périodes empilées sur plusieurs lignes (règnes, guerres, ères), cliquables.
- **F-16 (S)** Mode « fenêtre » : afficher un intervalle (ex. 1700–1720) plutôt qu'un instant.
- **F-17 (C)** Repères personnels sur la frise (signets).

---

## 5. La carte et les frontières

### 5.1 Fond de carte

- Fond vectoriel neutre sans frontières modernes par défaut (les frontières modernes sont une couche
  optionnelle, pour comparer).
- **F-20 (M)** Globe 3D et projection plane, relief ombré optionnel.
- **F-21 (S)** **Paléogéographie** : niveau des mers et calottes glaciaires selon l'époque (Doggerland,
  Béringie, Sahara vert). Couches dédiées pour −100 000 à −5 000.
- **F-22 (L)** Temps géologique (dérive des continents) via des reconstructions de type PALEOMAP/GPlates.

### 5.2 Deux modes de frontières

| | **Mode rapide** | **Mode précis** |
|---|---|---|
| But | Couvrir le monde entier, toutes époques | Exactitude sur un sujet donné |
| Sources | Jeux mondiaux à instantanés ou à intervalles | Données importées par l'utilisateur, OpenHistoricalMap, jeux spécialisés |
| Granularité temporelle | Instantanés (≈ 50 dates) ou intervalles annuels | Date exacte de chaque changement (traités, annexions) |
| Échelle fiable | Pays et continents | Jusqu'à la commune ou la rue |
| Affichage | Badge « approximatif », bords adoucis | Badge source, traits nets, incertitude par segment |

Sources candidates (licences et couverture **à vérifier** avant intégration) :

| Source | Couverture | Usage prévu |
|---|---|---|
| historical-basemaps (Ourednik) | Monde, −123 000 → 2010, 53 instantanés, GPL-3.0 | Mode rapide (déjà intégré) |
| Cliopatria (Seshat) | Monde, ≈ −3400 → aujourd'hui, polygones avec dates de début et de fin | Mode rapide, alternative plus fine dans le temps |
| OpenHistoricalMap | Crowdsourcé, dates de début et de fin par objet, CC0, tuiles vectorielles | Mode précis, plans de villes anciens |
| CShapes 2.0 | États souverains 1886–2019 | Mode précis, époque contemporaine |
| Wikidata P3896 (geoshape) | Quelques entités | Complément ponctuel |
| **Données de l'utilisateur** | GeoJSON, KML, Shapefile, GeoPackage | Mode précis |

Fonctionnalités :

- **F-23 (M)** Abstraction « fournisseur de frontières » : chaque source expose
  `polygones(intervalle, emprise, niveau)` avec, pour chaque polygone, identifiant Wikidata si connu,
  date de début, date de fin, source et confiance.
- **F-24 (M)** Bascule « mode rapide / mode précis » ; en mode précis, repli sur le mode rapide là où
  aucune donnée précise n'existe (avec un indicateur visuel).
- **F-25 (M)** Rapprochement polygone ↔ entité Wikidata (par nom, dates et position ; table de
  correspondance éditable).
- **F-26 (C)** Import de données utilisateur, avec un assistant de correspondance des champs
  (nom, date de début, date de fin, entité).
- **F-27 (S)** Territoires **contestés** ou à souveraineté partagée (hachures), vassalité
  (teinte du suzerain), zones d'influence (contour seul).
- **F-28 (S)** Transitions animées entre deux états de frontières.
- **F-29 (L)** Éditeur de frontières (dessin, découpe, attribution de dates) pour produire ses
  propres données en mode précis.
- **F-30 (M)** Conversion des gros jeux en tuiles vectorielles (PMTiles) hébergées statiquement :
  pas de serveur, chargement par zone.

### 5.3 Mouvements et trajectoires

- **F-31 (S)** Flèches animées : armées, migrations, explorations, routes commerciales.
  Modèle : suite de points datés (`[lon, lat, date]`), épaisseur = effectif, couleur = camp.
- **F-32 (S)** Trajectoires de personnages (lieux successifs : naissance, résidences, voyages, mort),
  construites depuis Wikidata (P19, P551, P20, P937…) et complétées éditorialement.
- **F-33 (L)** Mode bataille : positions d'unités heure par heure (données éditorialisées ou assistées
  par l'IA).

---

## 6. Catégories et filtres

Barre de filtres à icônes, cochables et décochables, avec un compteur par catégorie. Chaque catégorie
correspond à un ensemble de classes Wikidata (`P31`/`P279`).

| Icône | Catégorie | Exemples de classes Wikidata |
|---|---|---|
| 🏛 | Entités politiques | État historique, empire, royaume, cité-État |
| ⚔ | Batailles et conflits | bataille, siège, guerre, révolte |
| 📜 | Traités et actes | traité, édit, constitution |
| 👤 | Personnalités | humain (naissance, mort, lieux de vie) |
| 💡 | Découvertes et inventions | invention, découverte scientifique (date P575, inventeur P61) |
| 🎨 | Culture et arts | œuvre, monument, mouvement artistique |
| ⛪ | Religions | concile, fondation d'ordre, schisme |
| 🧭 | Explorations et routes | expédition, voyage, route commerciale |
| 👣 | Migrations et peuplements | migration humaine, site archéologique |
| 🏙 | Villes | fondation, destruction, capitale |
| 🌋 | Catastrophes et épidémies | séisme, éruption, épidémie, famine |
| 🔬 | Sciences et techniques | publication, observation, premier vol |

- **F-40 (M)** Filtres par catégorie (icônes), mémorisés et inclus dans le lien partageable.
- **F-41 (M)** Légende dynamique (ne montre que les catégories présentes à l'écran).
- **F-42 (S)** Filtres secondaires : importance minimale, région, « seulement le sujet » ou « monde entier ».
- **F-43 (S)** Catégories personnalisées par sujet (ex. « Campagnes de Turenne »).

---

## 7. « Pendant ce temps » (synchronie mondiale)

- **F-50 (M)** Couche mondiale permanente : pour l'instant affiché, les entités politiques du monde
  entier et les jalons majeurs (importance élevée), même hors du sujet.
- **F-51 (M)** Panneau « Pendant ce temps » : une carte par grande région (Europe, Afrique, Asie de
  l'Est, Asie du Sud, Moyen-Orient, Amériques, Océanie) avec 1 à 3 éléments marquants à la date courante.
- **F-52 (S)** Mini-cartes de comparaison (vues synchronisées côte à côte : Europe / Chine).
- **F-53 (S)** Frises parallèles : deux à quatre lignes de temps (France, Chine, Mali, Aztèques).
- **F-54 (C)** « Saviez-vous ? » : rapprochements inattendus (ex. Oxford fondée avant l'Empire aztèque).

> Point d'architecture : une vue mondiale instantanée ne peut pas reposer uniquement sur des requêtes
> SPARQL en direct (trop lentes à l'échelle du globe). Voir § 9.3, « index mondial léger ».

---

## 8. Recherche et génération de sujets

### 8.1 Deux sources de sujets

1. **Sujets éditorialisés** — écrits et vérifiés à la main (comme les quatre du prototype) : acteurs,
   périodes, événements, textes, éventuellement des frontières précises et une visite guidée.
2. **Sujets générés** — construits à la volée depuis Wikidata à partir d'une recherche.

Un sujet généré peut être **enrichi** puis enregistré comme sujet éditorialisé (par un professeur ou
un contributeur).

### 8.2 Recherche

- **F-60 (M)** Barre de recherche unique avec autocomplétion (recherche d'entités Wikidata dans la
  langue de l'interface), regroupée par type : personne, dynastie, État, conflit, événement, période,
  lieu, thème.
- **F-61 (M)** Recherche par date ou par lieu : « 1789 », « Kyoto en 1600 », « Afrique XIVe siècle ».
- **F-62 (S)** Recherche dans le sujet courant (filtrer la chronologie).

### 8.3 Générateur de sujets (recettes par type)

Chaque type d'entité a une **recette** : un ensemble de requêtes qui produit un scénario au même
format que les sujets éditorialisés.

| Type recherché | Cadre temporel | Acteurs (sujet / adversaires / alliés) | Événements récupérés |
|---|---|---|---|
| Souverain (ex. Louis XIV) | Dates de la fonction (P39 + qualificatifs P580/P582) | État gouverné ; adversaires des guerres menées | Guerres, batailles, traités pendant le règne, naissance et mort |
| Dynastie | Du premier au dernier membre | États gouvernés | Règnes successifs (bandes de périodes) |
| Guerre / conflit | P580–P582 | Participants (P710), vainqueur (P1346) | Batailles « partie de » (P361), traités de fin |
| État historique | Création (P571) – dissolution (P576) | État, prédécesseurs (P1365) et successeurs (P1366) | Capitales, dirigeants, guerres |
| Personnalité | Naissance – mort | Pays de nationalité | Lieux de vie, œuvres, événements avec participation (P1344) |
| Invention / découverte | Date (P575) ± contexte | Pays d'origine | Inventeur, diffusion, découvertes liées |
| Thème (ex. imprimerie, peste) | Selon les occurrences | — | Instances et sous-classes datées et localisées |

- **F-63 (M)** Recettes pour : souverain, guerre, État historique, personnalité.
- **F-64 (S)** Recettes pour : dynastie, invention, thème, période.
- **F-65 (M)** Résolution des lieux : P625 (coordonnées), sinon P276 (lieu) → P625, sinon pays.
  La précision de localisation est affichée (point exact, ville, région, pays).
- **F-66 (M)** Rôles évolutifs (allié puis ennemi), calculés à partir des participations aux conflits
  et de leurs dates.
- **F-67 (S)** Score de qualité du sujet généré (nombre d'événements datés, localisés, de frontières
  trouvées) et suggestions pour le compléter.

---

## 9. Architecture technique

### 9.1 Vue d'ensemble

```
┌─────────────────────────── Navigateur (application web progressive) ───────────────────────────┐
│ Interface : carte (MapLibre GL) · frise · inspecteur · filtres · recherche                      │
│      │                                                                                          │
│ Moteur de sujet : scénario = { cadre, acteurs, périodes, événements, couches }                 │
│      │                                                                                          │
│ Fournisseurs de données (adaptateurs)                                                           │
│   WikidataProvider · WikipediaProvider · CommonsProvider · BordersProvider[n] · UserData       │
│      │                                                                                          │
│ Cache et ordonnanceur : IndexedDB, déduplication, limitation de débit, annulation              │
│ Service worker : mode hors ligne, paquets de sujets                                             │
└─────────────┬───────────────────────────────────────────────────────────────────────────────────┘
              │ temps réel                                     │ fichiers statiques
   query.wikidata.org (SPARQL) · API Wikidata          PMTiles (frontières, fond de carte)
   API REST Wikipédia · Commons                        Index mondial léger (par tranche de temps)
   (plus tard) serveur : comptes, partage              Sujets éditorialisés (JSON)
```

### 9.2 Choix techniques

| Sujet | Recommandation | Raison |
|---|---|---|
| Langage et build | TypeScript + Vite (à introduire en phase 1) | Le code va croître ; typage du modèle de données |
| Interface | Composants légers (Svelte ou Preact) | Inspecteur, filtres et frise riches en état |
| Carte | MapLibre GL (déjà en place) ; deck.gl pour les trajectoires animées si besoin | Globe, tuiles vectorielles, performance |
| Tuiles | PMTiles sur hébergement statique | Pas de serveur de tuiles, extraction hors ligne possible |
| Stockage local | IndexedDB (cache, paquets), localStorage (préférences) | Hors ligne, volumes importants |
| Hébergement | 100 % statique et gratuit : GitHub Pages ; scripts de données exécutés par GitHub Actions | Budget nul (décision § 17) |
| Tests | Vitest (logique), Playwright (parcours) | Le prototype est déjà testé avec Playwright |

### 9.3 Données en temps réel : stratégie

L'exigence « ne pas tout stocker » est tenue, à une exception près, mesurée et assumée :

- **Détail d'un sujet → en direct.** Requêtes SPARQL ciblées sur une entité et ses relations (rapides,
  quelques centaines de résultats). Résumés Wikipédia et images à la demande.
- **Vue mondiale « Pendant ce temps » → index léger précalculé.** Interroger tout le globe à chaque
  mouvement du curseur serait trop lent et dépasserait les limites de l'API publique. Un script
  périodique (hebdomadaire) extrait de Wikidata les éléments **datés, localisés et importants**
  (quelques centaines de milliers au plus), découpés par tranche de temps et par zone, en fichiers
  statiques compacts. On ne stocke que : identifiant Q, coordonnées, dates, précision, catégorie,
  importance. Libellés et textes restent chargés en direct, dans la langue de l'utilisateur.
- **Frontières → fichiers statiques tuilés** (elles n'existent pas dans Wikidata).

Contraintes à respecter : délai maximal de 60 s par requête SPARQL, limitation de débit et
identification du client (User-Agent) ; requêtes regroupées, mises en cache et annulées lorsque
l'utilisateur change de vue. Budget nul : pas de relais ; en secours, un point d'accès SPARQL
public alternatif et le cache local du navigateur.

- **F-70 (M)** Couche d'accès aux données avec cache, limitation de débit et annulation.
- **F-71 (M)** Mode dégradé explicite si une source ne répond pas (« Wikidata indisponible, données
  en cache du … »).
- **F-72 (S)** Script de construction de l'index mondial et des tuiles de frontières (dépôt séparé ou
  dossier `tools/`), exécuté en intégration continue.

### 9.4 Modèle de données (format commun)

```ts
type Instant   = { t: number; precision: Precision; calendar?: "gregorian" | "julian" };
type Interval  = { start: Instant; end?: Instant; fuzzyStart?: Instant; fuzzyEnd?: Instant };

interface Item {            // événement, personne, découverte, lieu…
  id: string;               // "Q178936" ou identifiant local
  category: Category;
  when: Interval;
  where?: { coords: [number, number]; precision: "exact" | "city" | "region" | "country" };
  path?: { coords: [number, number]; t: number }[];   // mouvements
  importance: number;       // 0–100
  labels?: Record<Lang, string>;                       // sinon chargé en direct
  sources: Source[];
}

interface Polity {          // entité politique
  id: string; when: Interval; geometryRef: GeometryRef; // renvoi vers un fournisseur de frontières
  relations: { type: "vassal" | "successor" | "predecessor" | "part_of"; target: string; when?: Interval }[];
}

interface Scenario {
  id: string; kind: "curated" | "generated"; lang: Lang;
  frame: { when: Interval; view: { center: [number, number]; zoom: number }; timeScale: Precision };
  actors: { role: "focus" | "rival" | "ally"; polities: string[]; when?: Interval[]; color: string }[];
  periods: { when: Interval; label: string }[];
  items: string[] | Item[];  // références (en ligne) ou contenu figé (paquet hors ligne)
  tour?: TourStep[];
}
```

Le format actuel de `data/scenarios.js` sera migré vers ce modèle (outil de conversion fourni).

---

## 10. Mode Préparation et hors ligne (professeurs)

- **F-80 (M)** Bouton **« Préparer un sujet »** : chaque fiche de l'inspecteur, chaque ligne de
  chronologie et chaque couche reçoit une **case à cocher** « inclure ».
- **F-81 (M)** Panneau **Panier du sujet** : liste des éléments cochés, réorganisable, avec la taille
  estimée du paquet.
- **F-82 (M)** **Télécharger le sujet** : paquet `.histomap` (archive) contenant le scénario, les textes
  (dans la ou les langues choisies), les images retenues, les frontières découpées sur l'emprise et la
  période, et le fond de carte pour la zone et des niveaux de zoom limités.
- **F-83 (M)** Ouverture du paquet sans connexion (application web progressive avec service worker),
  par import de fichier ou depuis la bibliothèque locale.
- **F-84 (S)** **Visite guidée** : suite d'étapes (date, vue, sélection, texte du professeur), avec un
  mode projection plein écran et le passage d'étape au clavier ou à la télécommande.
- **F-85 (S)** Annotations du professeur sur la carte (texte, flèche, zone) incluses dans le paquet.
- **F-86 (S)** Fiche élève imprimable ou en PDF (carte + chronologie + questions).
- **F-87 (L)** Partage de sujets entre professeurs (nécessite des comptes et un serveur — à décider).

Contraintes : les fonds de carte publics (OpenStreetMap, CARTO) **interdisent le téléchargement en
masse** de leurs tuiles. Le hors ligne suppose donc un fond de carte que l'on héberge soi-même
(PMTiles généré depuis OpenStreetMap), dont on extrait la zone utile. Les images Wikimedia sont
réutilisables à condition de conserver l'auteur et la licence dans le paquet.

---

## 11. Multilingue

- **F-90 (M)** Tous les textes d'interface dans des fichiers de traduction (`fr`, puis `en`) ; aucun
  texte en dur.
- **F-91 (M)** Langue des contenus : libellés Wikidata et articles Wikipédia demandés dans la langue
  active, avec une chaîne de repli (ex. `fr → en → libellé multilingue`) et un indicateur « texte en
  anglais » quand le repli s'applique.
- **F-92 (M)** Noms d'entités selon l'époque (Royaume de France / République / Empire) et selon la
  langue (le dictionnaire `data/entities.js` devient multilingue, complété par les libellés
  historiques de Wikidata : P1448 « nom officiel » avec dates).
- **F-93 (S)** Formats de date et d'ère localisés (av. J.-C. / BC / BCE), écriture de droite à gauche
  prévue dans la mise en page.
- **F-94 (S)** Sujets éditorialisés traduisibles (textes séparés de la structure).

---

## 12. Intelligence artificielle (spécification future — non développée maintenant)

**Principe** : l'utilisateur fournit **sa propre clé API** (Anthropic, OpenAI ou autre fournisseur
compatible), stockée uniquement dans son navigateur. L'application fonctionne entièrement sans IA ;
l'IA n'est qu'un accélérateur.

Usages envisagés :

| ID | Usage | Exemple |
|---|---|---|
| IA-1 | Requête en langage naturel → sujet | « Montre-moi les routes de la soie au XIIIe siècle avec Marco Polo » |
| IA-2 | Composition de requêtes Wikidata | L'IA choisit la recette, les classes et les propriétés ; l'application exécute et vérifie |
| IA-3 | Enrichissement de sujet | Proposer des événements, acteurs et périodes manquants, **avec leurs sources** |
| IA-4 | Mouvements et batailles | Proposer des trajectoires à partir de textes sourcés, marquées « reconstitution » |
| IA-5 | Aide au professeur | Générer une visite guidée, un questionnaire, un texte adapté au niveau de la classe |
| IA-6 | Contrôle de cohérence | Signaler dates incompatibles, lieux douteux, anachronismes de noms |

Exigences :

- Architecture « outils » : l'IA appelle les mêmes fournisseurs de données que l'interface (recherche
  Wikidata, SPARQL, Wikipédia) ; elle **n'invente pas** les données affichées, elle les cherche.
- Toute donnée produite ou proposée par l'IA est **marquée comme telle** et doit être validée avant
  d'entrer dans un sujet éditorialisé.
- Couche d'abstraction des fournisseurs (un même contrat pour Anthropic, OpenAI…), choix du modèle,
  estimation du coût avant exécution.
- Sécurité : la clé n'est jamais envoyée ailleurs qu'au fournisseur choisi ; un relais optionnel est
  possible pour les établissements (clé gérée côté serveur).

---

## 13. Qualité, fiabilité, éthique

- **F-100 (M)** Chaque donnée affichée indique sa source et sa précision (date, lieu, frontière).
- **F-101 (M)** Lien « Signaler / corriger » vers l'élément Wikidata concerné.
- **F-102 (S)** Indicateur de couverture : densité de données par région et par époque, pour rendre
  visibles les zones peu documentées plutôt que de les laisser paraître vides.
- **F-103 (S)** Plusieurs points de vue : noms et frontières revendiqués par plusieurs parties,
  terminologies différentes (ex. noms endogènes et exogènes).
- **F-104 (M)** Images : auteur et licence affichés ; pas de réutilisation hors licence.
- **F-105 (S)** Note méthodologique accessible (« Comment lire cette carte »).

## 14. Expérience, accessibilité, performance

- **F-110 (M)** Utilisable au clavier (frise, carte, inspecteur) ; ordre de tabulation logique.
- **F-111 (M)** **Vue liste** équivalente à la carte (chronologie textuelle) pour les lecteurs d'écran
  et les petits écrans.
- **F-112 (M)** Palettes lisibles par les daltoniens ; contraste AA ; thème clair et sombre.
- **F-113 (M)** Tablette et téléphone (panneaux en tiroirs, gestes) ; tableau numérique en classe.
- **F-114 (M)** Budgets de performance : affichage initial en moins de 3 s sur une connexion 4G ;
  60 images/s en lecture sur un ordinateur portable courant ; moins de 200 Mo de mémoire.
- **F-115 (S)** Lien partageable complet (sujet, date, vue, filtres, sélection) — déjà amorcé.
- **F-116 (C)** Raccourcis : espace = lecture, ← → = pas, `+`/`−` sur la frise = échelle.

---

## 15. Feuille de route

Chaque phase se termine par une version utilisable. Les durées ne sont pas estimées ici ; elles
dépendront des moyens (seul, en équipe, avec l'IA).

**Jalons**

- 🎯 **Jalon A — Outil fonctionnel personnel** (fin de la phase 3) : utilisable au quotidien par le
  porteur du projet, sur n'importe quel sujet, en ligne. C'est la priorité actuelle.
- 🎯 **Jalon B — Démonstration à des professionnels de l'éducation** (fin de la phase 5) : mode
  Préparation et hors ligne présentables, quelques sujets éditorialisés soignés.
- 🎯 **Jalon C — Ouverture à d'autres utilisateurs** (phase 8) : comptes, partage.

Tant que l'outil n'a qu'un utilisateur, on privilégie ce qui se voit et sert tout de suite ;
l'industrialisation (comptes, serveur) attend le jalon C.

### Phase 0 — Prototype ✅ (fait)
Globe MapLibre, frontières à instantanés (mode rapide), curseur annuel, rôles évolutifs, événements
qui apparaissent et s'estompent, inspecteur Wikipédia, 3 sujets + exploration libre, lien partageable.

### Phase 1 — Fondations ✅ (livrée le 10/11/2026)
Livré : F-10, F-11, F-13, F-14, F-15 (frise zoomable de 100 000 ans à 15 minutes, échelle initiale
adaptée au sujet, densité par catégorie, lecture à vitesse relative au zoom, périodes sur plusieurs
lignes et cliquables) · F-40, F-41 (filtres à icônes, compteurs, légende dynamique) · F-01, F-02, F-03
(importance relative au cadrage du sujet, regroupement des points, indicateur d'éléments masqués) ·
F-04 (inspecteur à tiroirs mémorisés, article complet dans un cadre isolé) · F-70, F-71 (file
d'attente, cache IndexedDB, bandeau hors ligne) · F-90 (fichiers de traduction fr/en, sélecteur de
langue) · F-110, F-111, F-112 (clavier, vue liste « Chronologie », palette daltonisme Okabe-Ito) ·
modèle temporel du § 9.4 (années décimales + précision, dates floues) · F-115 (lien complet).
Deux sujets de démonstration des échelles extrêmes : *Homo sapiens* (graduation 50 000 ans) et
Austerlitz heure par heure.

**Reporté** : passage à TypeScript + Vite → début de phase 2 (le code reste en JavaScript sans
compilation tant qu'il n'y a pas de requêtes Wikidata ; la migration se fera avant d'ajouter le
générateur de sujets).

### Phase 2 — Wikidata en temps réel ✅ (livrée le 11/11/2026)
Livré : passage à TypeScript + Vite (tests Vitest, build vérifié) · F-60 (recherche Wikidata avec
autocomplétion, clavier, raccourci `/`) · F-61 (recherche par date « 1789 » et par lieu « Kyoto en
1600 ») · F-63 (recettes souverain, personne, guerre, État) + événement isolé (remontée vers le
conflit parent) et lieu (événements à moins de 30 km) · F-65 (localisation P625, sinon lieu P276) ·
F-66 (rôles datés : belligérants actifs pendant leurs guerres) · F-32 (trajet de vie des personnes) ·
F-100, F-101 (source Wikidata affichée, lien « signaler ou corriger ») · F-91 partiel (libellés dans
la langue de l'interface, repli fr/en) · publication automatique sur GitHub Pages.

Choix techniques notables :
- Les États des sujets générés sont reliés aux frontières **par leur capitale** : l'État dont le
  polygone contient la capitale sur la carte de l'époque est coloré. Aucune table de noms à maintenir.
- Requêtes SPARQL **légères** (sans service d'étiquettes ni regroupement) puis libellés via l'API
  Wikidata par lots de 50, avec repli SPARQL : environ 1 s par requête au lieu de 10 à 40 s.
- Wikidata ne précise pas les **camps** des belligérants : ils sont tous colorés comme adversaires
  potentiels et une note l'indique. Piste : déduire les camps des batailles (P710 + P1346 vainqueur).
- Les sujets générés sont mémorisés localement (8 derniers) et recréés à l'ouverture d'un lien.

Reste à faire (reporté) : F-64 (dynastie, invention, thème, période) · F-67 (score de qualité) ·
F-92 complet (noms officiels datés P1448) · F-62.

### Phase 3 — Synchronie mondiale ✅ (livrée le 11/11/2026)
Livré : F-72 (index mondial léger : `tools/build-index.mjs`, ≈ 15 000 éléments, 1,2 Mo en 38 tranches
de temps chargées à la demande, reconstruit chaque semaine par GitHub Actions ; l'index du dépôt est
conservé si la reconstruction échoue) · F-50 (couche « Monde » sur la carte, plafonnée par région) ·
F-51 (panneau « Pendant ce temps » : les éléments marquants de 8 grandes régions autour de la date) ·
F-53 (frises parallèles par région sous la frise principale) · F-102 (barre de couverture par région,
mention « peu documenté » et note sur les biais de Wikidata) · catégories Découvertes et Sciences.

Contenu de l'index : batailles et sièges, traités, révolutions et coups d'État, fondations et fins
d'États historiques, naissances de personnalités, découvertes et inventions, monuments, lieux de culte,
fondations de villes anciennes, universités et observatoires, catastrophes et épidémies, expéditions.

Choix techniques notables :
- Requêtes de l'index exécutées sur **QLever** (Université de Fribourg), qui répond en 1 à 7 s à des
  requêtes globales qui dépassent le délai du service public de Wikidata ; ce dernier sert de repli.
- La fenêtre « au même moment » suit l'échelle de la frise (2 % de la durée visible) et s'élargit
  jusqu'à ×4 quand elle contient moins de 40 éléments.
- Les découvertes excluent les objets astronomiques (astéroïdes, galaxies…) sauf les plus notables,
  et les lieux eux-mêmes (continents, îles), qui seraient placés de façon trompeuse.

Biais constaté (F-102) : 61 % des éléments sont situés en Europe, et l'index est beaucoup plus dense
après 1500. La normalisation par région limite l'effet à l'affichage ; les sujets éditorialisés hors
d'Europe restent la vraie parade.

### Phase 4 — Cartographie précise
F-23, F-24, F-25 (fournisseurs, deux modes) · F-30 (PMTiles) · F-26 (import) · intégration
OpenHistoricalMap et d'un second jeu mondial · F-27, F-28 · F-21 (paléogéographie) · F-31
(mouvements).
**Critère de sortie** : la guerre de Cent Ans en mode précis montre la Bourgogne et l'évolution
annuelle des possessions anglaises à partir de jeux de données publics.

### Phase 5 — Professeurs et hors ligne
F-80 à F-86 · fond de carte auto-hébergé · application web progressive.
**Critère de sortie** : un professeur prépare un paquet en ligne en moins de 15 minutes et l'utilise
en classe sans réseau.

### Phase 6 — Anglais puis autres langues
Traduction de l'interface et des sujets éditorialisés, F-93, F-94.

### Phase 7 — Intelligence artificielle
§ 12 : IA-1 et IA-2 d'abord, puis IA-3 et IA-5, enfin IA-4 et IA-6.

### Phase 8 — Comptes et partage (après validation du projet)
Comptes utilisateurs, bibliothèque de sujets en ligne, F-87 (partage entre professeurs),
synchronisation des paquets. Nécessite un hébergement avec serveur (solutions à offre gratuite à
évaluer à ce moment-là). Jusque-là : préférences et sujets dans le navigateur, échange par fichier
`.histomap`.

---

## 16. Risques et parades

| Risque | Impact | Parade |
|---|---|---|
| Lenteur ou limites de l'API SPARQL publique | Recherche lente, échecs | Requêtes ciblées, cache, index précalculé, point d'accès alternatif |
| Limites des offres gratuites (taille du site GitHub Pages, minutes d'Actions) | Fond de carte hors ligne ou index trop lourds | Fond de carte hors ligne limité aux zooms bas ; index compacts ; tuiles détaillées en ligne seulement |
| Frontières historiques lacunaires ou contestées | Erreurs visibles, crédibilité | Deux modes, badges de précision, import de données, sources affichées |
| Licences incompatibles (GPL, CC BY-SA, CC BY-NC…) | Blocage de diffusion | Registre des licences par source ; données chargées et non incorporées au code ; choix de la licence du projet tôt |
| Biais européocentré de Wikidata | Monde « vide » hors Europe | Importance normalisée par région, indicateur de couverture, sujets éditorialisés hors d'Europe |
| Volume des données (frontières détaillées, temps profond) | Lenteur, mémoire | Tuiles vectorielles, niveaux de détail, chargement par zone et par période |
| Conditions d'usage des tuiles de fond de carte | Hors ligne impossible | Fond de carte auto-hébergé (PMTiles) |
| Données générées par l'IA erronées | Désinformation | Marquage, sources obligatoires, validation humaine |

---

## 17. Décisions et questions ouvertes

### Décisions (10/11/2026)

| Sujet | Décision | Conséquence dans le plan |
|---|---|---|
| Données de frontières | Uniquement des **jeux de données publics** | Mode précis fondé sur OpenHistoricalMap, Cliopatria, CShapes… ; l'import personnel (F-26) passe en confort |
| Budget | **Aucun** pour le moment | Tout statique (GitHub Pages), scripts via GitHub Actions, aucun serveur ni relais |
| Comptes utilisateurs | Nécessaires **plus tard**, après un outil fonctionnel | Phase 8, après les jalons A et B ; d'ici là, stockage local et fichiers |
| Utilisateurs | Le porteur du projet seul pour l'instant ; présentation à des professionnels de l'éducation si le projet convainc | Jalon A (outil personnel) prioritaire, puis jalon B (démonstration) |
| Langue | Français d'abord ; anglais et autres langues prévus | Traductions préparées dès la phase 1, traduction effective en phase 6 |
| IA | Spécifiée, non développée | Phase 7 |

### Questions encore ouvertes (non bloquantes)

1. **Licence du projet** : tant que l'usage est personnel, rien ne presse. Avant toute diffusion,
   choisir une licence compatible avec les sources (la GPL-3.0 d'historical-basemaps le permet si
   le projet est lui-même sous GPL-3.0 ; sinon, charger ces données sans les incorporer, comme
   aujourd'hui).
2. **Nom et identité visuelle** : « Histomap » est-il définitif ?
3. **Sujets éditorialisés prioritaires** pour la démonstration (jalon B) : programmes scolaires ?
4. **Appareils en classe** (pour le jalon B) : tablettes, ordinateurs, tableau numérique ?
