/*
 * Sujets (scénarios) explorables dans Histomap.
 *
 * Schéma d'un scénario :
 *   id, title, subtitle, description
 *   range: [annéeDébut, annéeFin]       bornes du curseur de temps
 *   start: année affichée à l'ouverture
 *   view:  { center: [lon, lat], zoom }
 *   range et start acceptent une année (nombre) ou une date ("1805-12-02T07:00")
 *   actors: liste de groupes colorés sur la carte
 *     { role: "focus" | "rival" | "ally" | "context", label, color,
 *       match: [noms d'États du jeu de données],
 *       when:  [[de, à], ...]   (optionnel) périodes où ce rôle s'applique }
 *     Les territoires dont le suzerain (SUBJECTO) correspond sont colorés
 *     dans une teinte plus claire (colonies, vassaux).
 *   periods: bandes affichées au-dessus de la frise { from, to, label, color }
 *   paths:   trajets et mouvements { label, color, kind: "person" | "army" | "journey", steps: [{ date, coords, label }] }
 *   events:  points datés et localisés
 *     { date: "AAAA-MM-JJ" | "AAAA" | "AAAA-MM-JJTHH:MM" | "~-15000", end?: même format,
 *       precision?: "1e4y" | "millennium" | … (sinon déduite du format de la date),
 *       category (voir data/categories.js), subtype?, importance?: 0–100 (défaut 50),
 *       title, place, placePrecision?: "exact" | "city" | "region" | "country",
 *       coords: [lon, lat], wiki: "Titre de l'article fr", summary }
 *
 * L'importance décide de l'affichage selon le zoom (F-01) : 90 = toujours visible.
 */
import type { ScenarioSpec } from "../core/types";

export const SCENARIOS: ScenarioSpec[] = [
  {
    id: "louis-xiv",
    title: "Le règne de Louis XIV",
    subtitle: "1643 – 1715",
    description: "Soixante-douze ans de règne : de la régence d'Anne d'Autriche et de Mazarin à l'absolutisme versaillais, la France affronte successivement l'Espagne, les Provinces-Unies, l'Angleterre et les Habsbourg d'Autriche.",
    range: [1640, 1716],
    start: 1643,
    view: { center: [4, 48.5], zoom: 4.2 },
    actors: [
      { role: "focus", qids: ["Q207162"], label: "Royaume de France", color: "#2563eb", match: ["France"] , points: [[2.35, 48.86]] },
      { role: "rival", qids: ["Q80702", "Q29"], label: "Monarchie espagnole", color: "#dc2626", match: ["Spain", "Habsburg Netherlands", "Viceroyalty of New Spain"], when: [[1635, 1700]] , points: [[-3.70, 40.42], [4.35, 50.85], [-99.13, 19.43]] },
      { role: "ally",  qids: ["Q80702", "Q29"], label: "Espagne (Philippe V)", color: "#16a34a", match: ["Spain", "Viceroyalty of New Spain"], when: [[1701, 1716]] , points: [[-3.70, 40.42], [-99.13, 19.43]] },
      { role: "rival", qids: ["Q66504140"], label: "Habsbourg d'Autriche & Saint-Empire", color: "#f97316", match: ["Austrian Empire", "Holy Roman Empire", "Austrian Netherlands"] , points: [[16.37, 48.21]] },
      { role: "rival", qids: ["Q170072"], label: "Provinces-Unies", color: "#be185d", match: ["Dutch Republic", "Netherlands"], when: [[1672, 1678], [1688, 1713]] , points: [[4.90, 52.37]] },
      { role: "rival", qids: ["Q179876", "Q23666"], label: "Angleterre", color: "#9f1239", match: ["England and Ireland", "England", "British American colonies"], when: [[1689, 1713]] , points: [[-0.13, 51.51]] },
      { role: "ally",  qids: ["Q179876"], label: "Angleterre (traité de Douvres)", color: "#22c55e", match: ["England and Ireland", "England"], when: [[1670, 1674]] , points: [[-0.13, 51.51]] }
    ],
    periods: [
      { from: 1643, to: 1661, label: "Régence & Mazarin", color: "#64748b" },
      { from: 1667, to: 1668, label: "Dévolution", color: "#b91c1c" },
      { from: 1672, to: 1678, label: "Guerre de Hollande", color: "#b91c1c" },
      { from: 1688, to: 1697, label: "Ligue d'Augsbourg", color: "#b91c1c" },
      { from: 1701, to: 1714, label: "Succession d'Espagne", color: "#b91c1c" }
    ],
    events: [
      { date: "1643-05-14", category: "personnage", title: "Avènement de Louis XIV", importance: 90, place: "Saint-Germain-en-Laye", coords: [2.0938, 48.8989], wiki: "Louis XIV", summary: "À la mort de Louis XIII, son fils de quatre ans devient roi ; Anne d'Autriche exerce la régence avec le cardinal Mazarin." },
      { date: "1643-05-19", category: "conflit", title: "Bataille de Rocroi", place: "Rocroi", coords: [4.5211, 49.9264], wiki: "Bataille de Rocroi", summary: "Le duc d'Enghien (futur Grand Condé) écrase les tercios espagnols." },
      { date: "1648-08-26", end: "1653", category: "politique", title: "La Fronde", place: "Paris", placePrecision: "city", coords: [2.3522, 48.8566], wiki: "Fronde (histoire)", summary: "Révolte des parlementaires puis des princes contre l'autorité royale et Mazarin." },
      { date: "1648-10-24", category: "traite", title: "Traités de Westphalie", importance: 90, place: "Münster", coords: [7.6261, 51.9607], wiki: "Traités de Westphalie", summary: "Fin de la guerre de Trente Ans ; la France obtient l'essentiel de l'Alsace." },
      { date: "1658-06-14", category: "conflit", title: "Bataille des Dunes", place: "Dunkerque", coords: [2.3768, 51.0344], wiki: "Bataille des Dunes (1658)", summary: "Turenne, allié aux Anglais de Cromwell, bat les Espagnols et Condé." },
      { date: "1659-11-07", category: "traite", title: "Traité des Pyrénées", importance: 90, place: "Île des Faisans", coords: [-1.7633, 43.3425], wiki: "Traité des Pyrénées", summary: "Paix avec l'Espagne : la France gagne le Roussillon et l'Artois." },
      { date: "1660-06-09", category: "personnage", title: "Mariage avec Marie-Thérèse d'Autriche", place: "Saint-Jean-de-Luz", coords: [-1.6631, 43.3881], wiki: "Marie-Thérèse d'Autriche (1638-1683)", summary: "Le roi épouse l'infante d'Espagne, scellant la paix des Pyrénées." },
      { date: "1661-03-09", category: "politique", title: "Début du règne personnel", place: "Vincennes", coords: [2.4357, 48.8429], wiki: "Jules Mazarin", summary: "À la mort de Mazarin, Louis XIV décide de gouverner sans Premier ministre." },
      { date: "1667-05-24", end: "1668", category: "conflit", title: "Guerre de Dévolution", place: "Flandre (Lille)", placePrecision: "region", coords: [3.0573, 50.6292], wiki: "Guerre de Dévolution", summary: "Louis XIV revendique les Pays-Bas espagnols au nom de son épouse ; prise de Lille." },
      { date: "1668-05-02", category: "traite", title: "Traité d'Aix-la-Chapelle", place: "Aix-la-Chapelle", coords: [6.0839, 50.7753], wiki: "Traité d'Aix-la-Chapelle (1668)", summary: "La France conserve plusieurs places flamandes, dont Lille." },
      { date: "1672-06-12", category: "conflit", title: "Passage du Rhin", place: "Tolhuis (Lobith)", coords: [6.1170, 51.8620], wiki: "Passage du Rhin", summary: "L'armée royale franchit le Rhin et envahit les Provinces-Unies." },
      { date: "1678-08-10", category: "traite", title: "Paix de Nimègue", place: "Nimègue", coords: [5.8372, 51.8126], wiki: "Traités de Nimègue", summary: "La France obtient la Franche-Comté : apogée de la puissance louis-quatorzienne." },
      { date: "1682-05-06", category: "culture", title: "La cour s'installe à Versailles", importance: 90, place: "Versailles", coords: [2.1204, 48.8049], wiki: "Château de Versailles", summary: "Versailles devient le siège du pouvoir et la vitrine de la monarchie absolue." },
      { date: "1683-09-12", category: "conflit", title: "Bataille de Vienne", importance: 90, place: "Kahlenberg, Vienne", coords: [16.3340, 48.2760], wiki: "Bataille de Vienne", summary: "Les Ottomans échouent devant Vienne face à la coalition menée par Jean III Sobieski." },
      { date: "1685-10-18", category: "religion", title: "Révocation de l'édit de Nantes", importance: 90, place: "Fontainebleau", coords: [2.7006, 48.4022], wiki: "Édit de Fontainebleau", summary: "Le protestantisme est interdit ; des dizaines de milliers de huguenots s'exilent." },
      { date: "1690-07-01", category: "conflit", title: "Bataille de Fleurus", place: "Fleurus", coords: [4.5500, 50.4833], wiki: "Bataille de Fleurus (1690)", summary: "Le maréchal de Luxembourg bat les coalisés de la ligue d'Augsbourg." },
      { date: "1692-05-29", category: "conflit", title: "Bataille de la Hougue", place: "Saint-Vaast-la-Hougue", coords: [-1.2650, 49.5880], wiki: "Bataille de la Hougue", summary: "Défaite navale française face aux flottes anglaise et hollandaise." },
      { date: "1693-07-29", category: "conflit", title: "Bataille de Neerwinden", place: "Neerwinden", coords: [5.0300, 50.7600], wiki: "Bataille de Neerwinden (1693)", summary: "Victoire de Luxembourg sur Guillaume III, « le tapissier de Notre-Dame »." },
      { date: "1697-09-20", category: "traite", title: "Traités de Ryswick", place: "Rijswijk", coords: [4.3200, 52.0360], wiki: "Traités de Ryswick", summary: "Fin de la guerre de la ligue d'Augsbourg ; la France garde Strasbourg." },
      { date: "1700-11-01", category: "politique", title: "Testament de Charles II d'Espagne", place: "Madrid", coords: [-3.7038, 40.4168], wiki: "Guerre de Succession d'Espagne", summary: "Le roi d'Espagne lègue sa couronne à Philippe d'Anjou, petit-fils de Louis XIV." },
      { date: "1704-08-13", category: "conflit", title: "Bataille de Blenheim (Höchstädt)", place: "Blindheim", coords: [10.5900, 48.6200], wiki: "Bataille de Blenheim", summary: "Marlborough et le prince Eugène infligent une lourde défaite aux Franco-Bavarois." },
      { date: "1706-05-23", category: "conflit", title: "Bataille de Ramillies", place: "Ramillies", coords: [4.9100, 50.6400], wiki: "Bataille de Ramillies", summary: "Marlborough chasse les Français des Pays-Bas espagnols." },
      { date: "1709-09-11", category: "conflit", title: "Bataille de Malplaquet", place: "Malplaquet", coords: [3.8600, 50.3300], wiki: "Bataille de Malplaquet", summary: "Bataille la plus sanglante du siècle ; les coalisés l'emportent à un prix énorme." },
      { date: "1712-07-24", category: "conflit", title: "Bataille de Denain", place: "Denain", coords: [3.3900, 50.3300], wiki: "Bataille de Denain", summary: "Villars sauve le royaume d'une invasion et ouvre la voie à la paix." },
      { date: "1713-04-11", category: "traite", title: "Traités d'Utrecht", importance: 90, place: "Utrecht", coords: [5.1214, 52.0907], wiki: "Traités d'Utrecht", summary: "Philippe V garde l'Espagne mais renonce au trône de France ; l'Angleterre gagne Gibraltar et Terre-Neuve." },
      { date: "1715-09-01", category: "personnage", title: "Mort de Louis XIV", importance: 90, place: "Versailles", coords: [2.1204, 48.8049], wiki: "Louis XIV", summary: "Le roi meurt après 72 ans de règne ; son arrière-petit-fils Louis XV, cinq ans, lui succède." }
    ]
  },

  {
    id: "guerre-cent-ans",
    title: "La guerre de Cent Ans",
    subtitle: "1337 – 1453",
    description: "Conflit dynastique entre les Valois et les Plantagenêt pour la couronne de France, entrecoupé de trêves. Il s'achève par l'expulsion des Anglais du continent, Calais excepté.",
    range: [1330, 1460],
    start: 1337,
    view: { center: [0.5, 48], zoom: 4.8 },
    actors: [
      { role: "focus", qids: ["Q207162"], label: "Royaume de France (Valois)", color: "#2563eb", match: ["France"] , points: [[2.35, 48.86]] },
      { role: "rival", qids: ["Q179876"], label: "Angleterre & possessions anglaises", color: "#dc2626", match: ["English territory", "England"] , points: [[-0.13, 51.51]] },
      { role: "rival", label: "Guyenne anglaise", color: "#ef4444", match: [], points: [[-0.58, 44.84]], when: [[1337, 1453]] },
      { role: "rival", qids: ["Q4712"], label: "Bourgogne (alliée des Anglais)", color: "#9f1239", match: [], preciseOnly: true, points: [[5.04, 47.32]], when: [[1419, 1435]] },
      { role: "context", qids: ["Q4712"], label: "Bourgogne", color: "#a16207", match: [], preciseOnly: true, points: [[5.04, 47.32]], when: [[1330, 1418], [1436, 1460]] },
      { role: "context", qids: ["Q71747"], label: "Duché de Bretagne", color: "#78716c", match: ["Britany"], points: [[-1.55, 47.22]] },
      { role: "ally",  qids: ["Q230791"], label: "Écosse (Auld Alliance)", color: "#16a34a", match: ["Scotland"] , points: [[-3.19, 55.95]] },
      { role: "ally",  qids: ["Q217196"], label: "Castille", color: "#22c55e", match: ["Castile", "Castille"], when: [[1369, 1460]] , points: [[-3.70, 42.34]] }
    ],
    periods: [
      { from: 1337, to: 1360, label: "Phase édouardienne", color: "#b91c1c" },
      { from: 1369, to: 1389, label: "Phase caroline", color: "#1d4ed8" },
      { from: 1415, to: 1453, label: "Phase lancastrienne", color: "#b91c1c" }
    ],
    paths: [
      {
        label: "Chevauchée d'Édouard III (1346)", color: "#dc2626", kind: "army",
        steps: [
          { date: "1346-07-12", coords: [-1.27, 49.59], label: "Débarquement à Saint-Vaast-la-Hougue" },
          { date: "1346-07-26", coords: [-0.37, 49.18], label: "Prise de Caen" },
          { date: "1346-08-16", coords: [2.05, 48.93], label: "Passage de la Seine à Poissy" },
          { date: "1346-08-24", coords: [1.78, 50.12], label: "Passage de la Somme à Blanchetaque" },
          { date: "1346-08-26", coords: [1.89, 50.26], label: "Bataille de Crécy" },
          { date: "1346-09-04", coords: [1.86, 50.95], label: "Début du siège de Calais" }
        ]
      },
      {
        label: "Chevauchée de Jeanne d'Arc (1429)", color: "#2563eb", kind: "journey",
        steps: [
          { date: "1429-02-23", coords: [5.66, 48.60], label: "Départ de Vaucouleurs" },
          { date: "1429-03-06", coords: [0.24, 47.17], label: "Chinon : rencontre avec le dauphin" },
          { date: "1429-04-27", coords: [1.33, 47.59], label: "Blois : l'armée de secours se rassemble" },
          { date: "1429-04-29", coords: [1.91, 47.90], label: "Entrée dans Orléans assiégée" },
          { date: "1429-07-17", coords: [4.03, 49.26], label: "Sacre de Charles VII à Reims" }
        ]
      }
    ],
    events: [
      { date: "1340-06-24", category: "conflit", title: "Bataille de l'Écluse", place: "Sluis", coords: [3.3900, 51.3100], wiki: "Bataille de L'Écluse", summary: "La flotte française est anéantie ; l'Angleterre maîtrise la Manche." },
      { date: "1346-08-26", category: "conflit", title: "Bataille de Crécy", importance: 90, place: "Crécy-en-Ponthieu", coords: [1.8875, 50.2569], wiki: "Bataille de Crécy", summary: "Les archers anglais déciment la chevalerie de Philippe VI." },
      { date: "1346-09-04", end: "1347-08-03", category: "conflit", subtype: "Siège", title: "Siège de Calais", place: "Calais", coords: [1.8587, 50.9513], wiki: "Siège de Calais (1346-1347)", summary: "Après onze mois de siège, Calais se rend : les « bourgeois de Calais »." },
      { date: "1348", category: "culture", title: "La Peste noire", importance: 90, place: "Marseille", coords: [5.3698, 43.2965], wiki: "Peste noire", summary: "L'épidémie atteint la France et tue près d'un tiers de la population." },
      { date: "1356-09-19", category: "conflit", title: "Bataille de Poitiers", place: "Nouaillé-Maupertuis", coords: [0.4150, 46.5130], wiki: "Bataille de Poitiers (1356)", summary: "Le Prince Noir capture le roi Jean II le Bon." },
      { date: "1360-05-08", category: "traite", title: "Traité de Brétigny", place: "Brétigny (Sours)", coords: [1.5980, 48.4080], wiki: "Traité de Brétigny", summary: "Édouard III renonce au trône de France contre un vaste Aquitaine souveraine." },
      { date: "1364-05-16", category: "conflit", title: "Bataille de Cocherel", place: "Cocherel", coords: [1.3800, 49.0500], wiki: "Bataille de Cocherel", summary: "Première grande victoire de Du Guesclin, au début du règne de Charles V." },
      { date: "1415-10-25", category: "conflit", title: "Bataille d'Azincourt", importance: 90, place: "Azincourt", coords: [2.1286, 50.4636], wiki: "Bataille d'Azincourt", summary: "Henri V écrase l'armée française ; désastre pour la noblesse." },
      { date: "1420-05-21", category: "traite", title: "Traité de Troyes", importance: 90, place: "Troyes", coords: [4.0744, 48.2973], wiki: "Traité de Troyes", summary: "Henri V devient héritier du trône de France ; le dauphin Charles est déshérité." },
      { date: "1428-10-12", end: "1429-05-08", category: "conflit", subtype: "Siège", title: "Siège d'Orléans", importance: 90, place: "Orléans", coords: [1.9093, 47.9029], wiki: "Siège d'Orléans", summary: "Jeanne d'Arc fait lever le siège : le tournant de la guerre." },
      { date: "1429-07-17", category: "politique", title: "Sacre de Charles VII", place: "Reims", coords: [4.0317, 49.2583], wiki: "Charles VII (roi de France)", summary: "Jeanne d'Arc conduit le dauphin à Reims pour y être sacré." },
      { date: "1431-05-30", category: "personnage", title: "Mort de Jeanne d'Arc", importance: 90, place: "Rouen", coords: [1.0993, 49.4431], wiki: "Jeanne d'Arc", summary: "Condamnée pour hérésie, Jeanne est brûlée vive place du Vieux-Marché." },
      { date: "1435-09-21", category: "traite", title: "Traité d'Arras", place: "Arras", coords: [2.7775, 50.2910], wiki: "Traité d'Arras (1435)", summary: "Le duc de Bourgogne se réconcilie avec Charles VII et abandonne l'alliance anglaise." },
      { date: "1450-04-15", category: "conflit", title: "Bataille de Formigny", place: "Formigny", coords: [-0.9000, 49.3350], wiki: "Bataille de Formigny", summary: "Victoire décisive qui rend la Normandie au roi de France." },
      { date: "1453-07-17", category: "conflit", title: "Bataille de Castillon", importance: 90, place: "Castillon-la-Bataille", coords: [-0.0400, 44.8550], wiki: "Bataille de Castillon", summary: "L'artillerie française l'emporte : fin de la présence anglaise en Guyenne." }
    ]
  },

  {
    id: "napoleon",
    title: "L'épopée napoléonienne",
    subtitle: "1796 – 1821",
    description: "De la campagne d'Italie à Sainte-Hélène : l'ascension de Bonaparte, l'Empire et les coalitions européennes. En mode rapide, les frontières n'ont pas d'instantané entre 1800 et 1815 ; passez en mode précis (Affichage → Frontières) pour suivre l'extension de l'Empire année par année.",
    range: [1795, 1821],
    start: 1796,
    view: { center: [12, 50], zoom: 3.6 },
    actors: [
      { role: "focus", qids: ["Q207162", "Q58296", "Q71084"], label: "France", color: "#2563eb", match: ["France"] , points: [[2.35, 48.86]] },
      { role: "rival", qids: ["Q23666"], label: "Grande-Bretagne", color: "#dc2626", match: ["United Kingdom", "United Kingdom of Great Britain and Ireland"] , points: [[-0.13, 51.51]] },
      { role: "rival", qids: ["Q66504140", "Q131964"], label: "Autriche", color: "#f97316", match: ["Austrian Empire", "Holy Roman Empire", "Austrian Netherlands", "Milano (Austria)"], when: [[1795, 1801], [1805, 1805], [1809, 1809], [1813, 1815]] , points: [[16.37, 48.21]] },
      { role: "rival", qids: ["Q34266"], label: "Russie", color: "#9f1239", match: ["Russian Empire"], when: [[1799, 1800], [1805, 1807], [1812, 1815]] , points: [[30.31, 59.94]] },
      { role: "rival", qids: ["Q27306"], label: "Prusse", color: "#be185d", match: ["Prussia"], when: [[1806, 1807], [1813, 1815]] , points: [[13.40, 52.52]] },
      { role: "rival", qids: ["Q12560"], label: "Empire ottoman", color: "#a16207", match: ["Ottoman Empire"], when: [[1798, 1801]] , points: [[28.98, 41.01]] },
      { role: "ally",  qids: ["Q80702", "Q29"], label: "Espagne", color: "#16a34a", match: ["Spain"], when: [[1796, 1807]] , points: [[-3.70, 40.42]] },
      { role: "rival", qids: ["Q80702", "Q29"], label: "Espagne insurgée", color: "#ef4444", match: ["Spain"], when: [[1808, 1814]] , points: [[-3.70, 40.42]] }
    ],
    periods: [
      { from: 1796, to: 1799, label: "Directoire", color: "#64748b" },
      { from: 1799, to: 1804, label: "Consulat", color: "#0f766e" },
      { from: 1804, to: 1814, label: "Premier Empire", color: "#1d4ed8" },
      { from: 1815, to: 1821, label: "Exil", color: "#475569" }
    ],
    paths: [
      {
        label: "Expédition d'Égypte (1798-1799)", color: "#2563eb", kind: "army",
        steps: [
          { date: "1798-05-19", coords: [5.93, 43.12], label: "Départ de Toulon" },
          { date: "1798-06-10", coords: [14.51, 35.90], label: "Prise de Malte" },
          { date: "1798-07-01", coords: [29.92, 31.20], label: "Débarquement à Alexandrie" },
          { date: "1798-07-21", coords: [31.21, 30.07], label: "Bataille des Pyramides" },
          { date: "1798-07-24", coords: [31.24, 30.04], label: "Entrée au Caire" },
          { date: "1799-03-07", coords: [34.75, 32.05], label: "Prise de Jaffa" },
          { date: "1799-03-20", coords: [35.07, 32.93], label: "Siège de Saint-Jean-d'Acre" },
          { date: "1799-06-14", coords: [31.24, 30.04], label: "Retour au Caire" },
          { date: "1799-07-25", coords: [30.07, 31.32], label: "Bataille terrestre d'Aboukir" },
          { date: "1799-08-23", coords: [29.92, 31.20], label: "Bonaparte quitte l'Égypte" },
          { date: "1799-10-09", coords: [6.74, 43.43], label: "Débarquement à Fréjus" }
        ]
      },
      {
        label: "Campagne de Russie (1812)", color: "#1d4ed8", kind: "army",
        steps: [
          { date: "1812-06-24", coords: [23.90, 54.90], label: "Passage du Niémen à Kowno" },
          { date: "1812-06-28", coords: [25.28, 54.69], label: "Entrée dans Vilnius" },
          { date: "1812-07-28", coords: [30.20, 55.19], label: "Vitebsk" },
          { date: "1812-08-17", coords: [32.05, 54.78], label: "Bataille de Smolensk" },
          { date: "1812-09-07", coords: [35.82, 55.52], label: "Bataille de la Moskova" },
          { date: "1812-09-14", coords: [37.62, 55.76], label: "Entrée dans Moscou" }
        ]
      },
      {
        label: "Retraite de Russie (1812)", color: "#64748b", kind: "army",
        steps: [
          { date: "1812-10-19", coords: [37.62, 55.76], label: "Départ de Moscou" },
          { date: "1812-10-24", coords: [36.47, 55.01], label: "Bataille de Maloïaroslavets" },
          { date: "1812-11-09", coords: [32.05, 54.78], label: "Smolensk" },
          { date: "1812-11-27", coords: [28.35, 54.33], label: "Passage de la Bérézina" },
          { date: "1812-12-08", coords: [25.28, 54.69], label: "Vilnius" },
          { date: "1812-12-14", coords: [23.90, 54.90], label: "Repassage du Niémen à Kowno" }
        ]
      }
    ],
    events: [
      { date: "1796-11-15", category: "conflit", title: "Bataille du pont d'Arcole", place: "Arcole", coords: [11.2700, 45.3600], wiki: "Bataille du pont d'Arcole", summary: "Bonaparte, général de l'armée d'Italie, bat les Autrichiens." },
      { date: "1797-10-17", category: "traite", title: "Traité de Campo-Formio", place: "Campoformido", coords: [13.1600, 46.0200], wiki: "Traité de Campo-Formio", summary: "L'Autriche cède la Belgique et reconnaît la République cisalpine." },
      { date: "1798-07-21", category: "conflit", title: "Bataille des Pyramides", place: "Embabeh, Égypte", coords: [31.2100, 30.0700], wiki: "Bataille des Pyramides", summary: "« Soldats, du haut de ces pyramides, quarante siècles vous contemplent. »" },
      { date: "1798-08-01", category: "conflit", title: "Bataille d'Aboukir (navale)", place: "Baie d'Aboukir", coords: [30.0700, 31.3200], wiki: "Bataille d'Aboukir (1798)", summary: "Nelson détruit la flotte française : l'armée d'Égypte est isolée." },
      { date: "1799-11-09", category: "politique", title: "Coup d'État du 18 Brumaire", importance: 90, place: "Saint-Cloud", coords: [2.2190, 48.8430], wiki: "Coup d'État du 18 Brumaire", summary: "Bonaparte renverse le Directoire et devient Premier consul." },
      { date: "1800-06-14", category: "conflit", title: "Bataille de Marengo", place: "Marengo", coords: [8.6800, 44.8900], wiki: "Bataille de Marengo", summary: "Victoire arrachée sur les Autrichiens, qui consolide le Consulat." },
      { date: "1804-03-21", category: "traite", title: "Code civil", importance: 90, place: "Paris", coords: [2.3522, 48.8566], wiki: "Code civil des Français", summary: "Promulgation du Code civil des Français, dit Code Napoléon." },
      { date: "1804-12-02", category: "politique", title: "Sacre de Napoléon Ier", importance: 90, place: "Notre-Dame de Paris", coords: [2.3499, 48.8530], wiki: "Sacre de Napoléon Ier", summary: "Napoléon se couronne empereur des Français en présence du pape Pie VII." },
      { date: "1805-10-21", category: "conflit", title: "Bataille de Trafalgar", importance: 90, place: "Cap Trafalgar", coords: [-6.2500, 36.2000], wiki: "Bataille de Trafalgar", summary: "Nelson détruit la flotte franco-espagnole ; fin des projets d'invasion de l'Angleterre." },
      { date: "1805-12-02", category: "conflit", title: "Bataille d'Austerlitz", importance: 90, place: "Slavkov u Brna", coords: [16.7600, 49.1300], wiki: "Bataille d'Austerlitz", summary: "La « bataille des Trois Empereurs », chef-d'œuvre tactique de Napoléon." },
      { date: "1806-10-14", category: "conflit", title: "Bataille d'Iéna", place: "Iéna", coords: [11.5800, 50.9300], wiki: "Bataille d'Iéna", summary: "L'armée prussienne s'effondre ; Napoléon entre à Berlin." },
      { date: "1807-07-07", category: "traite", title: "Traités de Tilsit", place: "Tilsit (Sovetsk)", coords: [21.8800, 55.0800], wiki: "Traités de Tilsit", summary: "Napoléon et Alexandre Ier se partagent l'Europe sur un radeau du Niémen." },
      { date: "1808-05-02", category: "politique", title: "Soulèvement du Dos de Mayo", place: "Madrid", coords: [-3.7038, 40.4168], wiki: "Soulèvement du Dos de Mayo", summary: "Madrid se soulève contre l'occupation française : début de la guerre d'Espagne." },
      { date: "1809-07-06", category: "conflit", title: "Bataille de Wagram", place: "Deutsch-Wagram", coords: [16.5600, 48.3000], wiki: "Bataille de Wagram", summary: "Victoire coûteuse sur l'Autriche, suivie du mariage avec Marie-Louise." },
      { date: "1812-09-07", category: "conflit", title: "Bataille de la Moskova (Borodino)", place: "Borodino", coords: [35.8200, 55.5200], wiki: "Bataille de la Moskova", summary: "Bataille la plus meurtrière de la campagne de Russie." },
      { date: "1812-09-14", category: "politique", title: "Entrée dans Moscou", importance: 90, place: "Moscou", coords: [37.6173, 55.7558], wiki: "Incendie de Moscou (1812)", summary: "La Grande Armée entre dans une ville vidée, bientôt en flammes." },
      { date: "1812-11-26", category: "conflit", title: "Passage de la Bérézina", place: "Studzianka", coords: [28.3500, 54.3300], wiki: "Bataille de la Bérézina", summary: "Les pontonniers permettent à une partie de l'armée en retraite d'échapper." },
      { date: "1813-10-16", category: "conflit", title: "Bataille de Leipzig", importance: 90, place: "Leipzig", coords: [12.4100, 51.3100], wiki: "Bataille de Leipzig", summary: "La « bataille des Nations » : défaite décisive face à la coalition." },
      { date: "1814-04-06", category: "politique", title: "Abdication de Fontainebleau", place: "Fontainebleau", coords: [2.7006, 48.4022], wiki: "Adieux de Fontainebleau", summary: "Napoléon abdique et part pour l'île d'Elbe." },
      { date: "1815-03-01", category: "personnage", title: "Retour de l'île d'Elbe", place: "Golfe-Juan", coords: [7.0730, 43.5670], wiki: "Cent-Jours", summary: "Napoléon débarque et marche sur Paris : début des Cent-Jours." },
      { date: "1815-06-18", category: "conflit", title: "Bataille de Waterloo", importance: 90, place: "Waterloo", coords: [4.4100, 50.6800], wiki: "Bataille de Waterloo", summary: "Wellington et Blücher battent Napoléon : fin définitive de l'Empire." },
      { date: "1821-05-05", category: "personnage", title: "Mort de Napoléon", place: "Sainte-Hélène", coords: [-5.7089, -15.9650], wiki: "Napoléon Ier", summary: "Napoléon meurt en exil à Longwood House." }
    ]
  },

  {
    id: "sapiens",
    title: "Homo sapiens à la conquête du monde",
    subtitle: "≈ 300 000 – 10 000 ans av. J.-C.",
    description: "Des premiers Homo sapiens d'Afrique à la naissance des premiers villages : la dispersion de notre espèce sur tous les continents. Les datations sont approximatives et pour certaines débattues ; la carte de fond montre les autres humanités (Néandertaliens, Homo erectus…) telles que reconstituées vers 123 000 av. J.-C. Avant 6000 av. J.-C., la carte montre aussi les terres émergées par la baisse du niveau des mers (approximation : plateaux continentaux de moins de 200 m de profondeur).",
    range: [-320000, -8000],
    start: -320000,
    view: { center: [40, 20], zoom: 1.5 },
    actors: [
      { role: "context", label: "Néandertaliens", color: "#8d6e63", match: ["Neanderthal"] },
      { role: "context", label: "Homo erectus", color: "#a1887f", match: ["Homo erectus"] },
      { role: "context", label: "Homo heidelbergensis", color: "#bcaaa4", match: ["Homo heidelbergensis"] }
    ],
    periods: [
      { from: -320000, to: -130000, label: "Homo sapiens en Afrique", color: "#558b2f" },
      { from: -130000, to: -60000, label: "Premières sorties d'Afrique", color: "#7cb342" },
      { from: -60000, to: -12000, label: "Peuplement des continents", color: "#33691e" },
      { from: -26000, to: -17000, label: "Dernier maximum glaciaire", color: "#0277bd" },
      { from: -10000, to: -8000, label: "Néolithique", color: "#ef6c00" }
    ],
    events: [
      { date: "-313000", precision: "1e4y", category: "migration", importance: 90, title: "Djebel Irhoud : les plus anciens Homo sapiens connus", place: "Djebel Irhoud, Maroc", coords: [-8.872, 31.855], wiki: "Djebel Irhoud", summary: "Des fossiles datés d'environ 315 000 ans font remonter l'origine de notre espèce et montrent qu'elle était répandue dans toute l'Afrique." },
      { date: "-231000", precision: "1e4y", category: "migration", title: "Omo Kibish", place: "Vallée de l'Omo, Éthiopie", placePrecision: "region", coords: [35.95, 5.40], wiki: "Homo sapiens", summary: "Restes d'Homo sapiens parmi les plus anciens d'Afrique de l'Est (au moins 230 000 ans)." },
      { date: "-183000", precision: "1e4y", category: "migration", title: "Grotte de Misliya", place: "Mont Carmel, Israël", coords: [34.97, 32.75], wiki: "Homo sapiens", summary: "Une mâchoire d'Homo sapiens datée d'environ 185 000 ans : l'une des plus anciennes traces hors d'Afrique." },
      { date: "-98000", end: "-78000", precision: "1e4y", category: "migration", title: "Skhul et Qafzeh", place: "Levant", placePrecision: "region", coords: [34.97, 32.67], wiki: "Homo sapiens", summary: "Des sépultures d'Homo sapiens au Proche-Orient, il y a environ 120 000 à 90 000 ans." },
      { date: "-74000", precision: "millennium", category: "catastrophe", importance: 80, title: "Éruption du Toba", place: "Sumatra, Indonésie", coords: [98.88, 2.68], wiki: "Lac Toba", summary: "L'une des plus grandes éruptions volcaniques connues ; son effet sur les populations humaines fait débat." },
      { date: "-73000", precision: "millennium", category: "culture", importance: 80, title: "Gravures de la grotte de Blombos", place: "Afrique du Sud", coords: [21.22, -34.41], wiki: "Grotte de Blombos", summary: "Ocre gravé de motifs géométriques : l'un des plus anciens témoignages de pensée symbolique." },
      { date: "-63000", precision: "1e4y", category: "migration", title: "Madjedbebe : arrivée en Australie ?", place: "Terre d'Arnhem, Australie", coords: [132.9, -12.5], wiki: "Peuplement de l'Australie", summary: "Des outils datés d'environ 65 000 ans suggèrent une arrivée très ancienne en Australie (datation discutée)." },
      { date: "-43000", precision: "millennium", category: "migration", title: "Bacho Kiro : Homo sapiens en Europe", place: "Bulgarie", coords: [25.43, 42.95], wiki: "Homo sapiens", summary: "Parmi les plus anciens Homo sapiens d'Europe, il y a environ 45 000 ans, contemporains des derniers Néandertaliens." },
      { date: "-43000", precision: "millennium", category: "migration", title: "Homme d'Ust'-Ishim", place: "Sibérie occidentale", coords: [71.17, 57.70], wiki: "Homo sapiens", summary: "Le plus ancien génome d'Homo sapiens séquencé (environ 45 000 ans) contient déjà de l'ADN néandertalien." },
      { date: "-40000", precision: "millennium", category: "personnage", title: "Homme de Mungo", place: "Lac Mungo, Australie", coords: [143.1, -33.7], wiki: "Lac Mungo", summary: "Sépulture d'environ 40 000 ans, l'une des plus anciennes d'Australie." },
      { date: "-34000", precision: "millennium", category: "culture", importance: 85, title: "Grotte Chauvet", place: "Ardèche, France", coords: [4.416, 44.389], wiki: "Grotte Chauvet", summary: "Des fresques de lions, rhinocéros et chevaux vieilles d'environ 36 000 ans." },
      { date: "-26000", end: "-11000", precision: "millennium", category: "exploration", importance: 80, title: "La Béringie, pont terrestre vers l'Amérique", place: "Détroit de Béring", placePrecision: "region", coords: [-169.0, 65.5], wiki: "Béringie", summary: "La baisse du niveau des mers relie l'Asie et l'Amérique par une vaste plaine." },
      { date: "-20000", precision: "millennium", category: "migration", title: "Empreintes de White Sands", place: "Nouveau-Mexique, États-Unis", coords: [-106.3, 32.8], wiki: "Peuplement de l'Amérique", summary: "Des empreintes humaines datées de 21 000 à 23 000 ans relancent le débat sur l'arrivée en Amérique." },
      { date: "-15000", precision: "millennium", category: "culture", importance: 85, title: "Grotte de Lascaux", place: "Dordogne, France", coords: [1.175, 45.054], wiki: "Grotte de Lascaux", summary: "La « chapelle Sixtine de la préhistoire », peinte il y a environ 17 000 ans." },
      { date: "-12500", precision: "millennium", category: "migration", title: "Monte Verde", place: "Chili", coords: [-73.2, -41.5], wiki: "Monte Verde", summary: "Un campement vieux d'environ 14 500 ans à l'extrême sud de l'Amérique." },
      { date: "-9500", precision: "millennium", category: "religion", importance: 90, title: "Göbekli Tepe", place: "Anatolie, Turquie", coords: [38.922, 37.223], wiki: "Göbekli Tepe", summary: "Un sanctuaire monumental érigé par des chasseurs-cueilleurs, avant l'agriculture." },
      { date: "-9000", precision: "millennium", category: "ville", importance: 85, title: "Jéricho, l'un des premiers villages", place: "Cisjordanie", coords: [35.444, 31.871], wiki: "Jéricho", summary: "L'un des plus anciens habitats permanents, au début de l'agriculture." }
    ]
  },

  {
    id: "austerlitz",
    title: "La bataille d'Austerlitz, heure par heure",
    subtitle: "1er – 3 décembre 1805",
    description: "La « bataille des Trois Empereurs » en Moravie. Napoléon attire les Austro-Russes vers son flanc droit, volontairement dégarni, puis enfonce leur centre sur le plateau de Pratzen. Les horaires sont approximatifs, d'après les récits de la bataille ; les mouvements de troupes seront représentés en phase 4.",
    range: ["1805-12-01T16:00", "1805-12-03T12:00"],
    start: "1805-12-02T06:00",
    view: { center: [16.76, 49.14], zoom: 11.3 },
    actors: [
      { role: "focus", qids: ["Q71084"], label: "Empire français", color: "#2563eb", match: ["France"] , points: [[2.35, 48.86]] },
      { role: "rival", qids: ["Q131964", "Q66504140"], label: "Empire d'Autriche", color: "#f97316", match: ["Austrian Empire", "Holy Roman Empire"] , points: [[16.37, 48.21]] },
      { role: "rival", qids: ["Q34266"], label: "Empire russe", color: "#9f1239", match: ["Russian Empire"] , points: [[30.31, 59.94]] }
    ],
    periods: [
      { from: "1805-12-01T18:00", to: "1805-12-02T06:59", label: "Veillée", color: "#475569" },
      { from: "1805-12-02T07:00", to: "1805-12-02T08:59", label: "Brouillard : attaque alliée au sud", color: "#b91c1c" },
      { from: "1805-12-02T09:00", to: "1805-12-02T12:59", label: "Prise du Pratzen", color: "#1d4ed8" },
      { from: "1805-12-02T13:00", to: "1805-12-02T13:59", label: "Garde russe", color: "#9f1239" },
      { from: "1805-12-02T14:00", to: "1805-12-02T16:59", label: "Encerclement et déroute alliée", color: "#1d4ed8" }
    ],
    events: [
      { date: "1805-12-01T20:00", end: "1805-12-01T23:00", category: "personnage", title: "Les flambeaux de la veillée", place: "Bivouacs français", placePrecision: "region", coords: [16.72, 49.16], wiki: "Bataille d'Austerlitz", summary: "Napoléon visite les bivouacs ; les soldats l'acclament avec des torches de paille, à la veille de l'anniversaire du sacre." },
      { date: "1805-12-02T07:00", end: "1805-12-02T09:00", category: "conflit", importance: 70, title: "Attaque alliée sur Telnitz", place: "Telnice", coords: [16.717, 49.105], wiki: "Bataille d'Austerlitz", summary: "Dans le brouillard, l'avant-garde autrichienne attaque le village tenu par une poignée de Français." },
      { date: "1805-12-02T07:30", end: "1805-12-02T12:00", category: "conflit", importance: 70, title: "Combats de Sokolnitz", place: "Sokolnice", coords: [16.723, 49.114], wiki: "Bataille d'Austerlitz", summary: "Le corps de Davout, arrivé à marche forcée de Vienne, tient le flanc droit face à des forces très supérieures." },
      { date: "1805-12-02T07:30", category: "personnage", importance: 70, title: "Napoléon au Žuráň", place: "Colline du Žuráň", coords: [16.736, 49.173], wiki: "Napoléon Ier", summary: "Depuis ce poste de commandement, l'Empereur observe les colonnes alliées descendre du plateau." },
      { date: "1805-12-02T09:00", end: "1805-12-02T11:30", category: "conflit", importance: 90, title: "« Le soleil d'Austerlitz » : assaut du Pratzen", place: "Plateau de Pratzen (Prace)", coords: [16.765, 49.138], wiki: "Bataille d'Austerlitz", summary: "Le brouillard se lève : les divisions Saint-Hilaire et Vandamme du corps de Soult gravissent le plateau dégarni et coupent l'armée alliée en deux." },
      { date: "1805-12-02T10:00", end: "1805-12-02T12:30", category: "conflit", importance: 70, title: "Lannes et Murat contre Bagration", place: "Colline du Santon", coords: [16.771, 49.191], wiki: "Bataille d'Austerlitz", summary: "Au nord, le corps de Lannes et la cavalerie de Murat contiennent puis repoussent l'aile droite alliée." },
      { date: "1805-12-02T13:00", end: "1805-12-02T14:00", category: "conflit", importance: 80, title: "Charge de la Garde impériale russe", place: "Près de Blažovice", coords: [16.782, 49.164], wiki: "Bataille d'Austerlitz", summary: "La cavalerie de la Garde du grand-duc Constantin enfonce un bataillon français avant d'être repoussée par la cavalerie de la Garde impériale (Rapp)." },
      { date: "1805-12-02T14:00", end: "1805-12-02T15:30", category: "conflit", importance: 70, title: "Vandamme prend Augezd", place: "Újezd u Brna", coords: [16.757, 49.105], wiki: "Bataille d'Austerlitz", summary: "Napoléon fait pivoter ses forces vers le sud pour encercler l'aile gauche alliée." },
      { date: "1805-12-02T15:00", end: "1805-12-02T16:30", category: "conflit", importance: 80, title: "Déroute par les étangs de Satschan", place: "Žatčany", coords: [16.734, 49.089], wiki: "Bataille d'Austerlitz", summary: "Les Russes refluent par les étangs gelés sous le feu de l'artillerie. La légende de milliers de noyés est très exagérée." },
      { date: "1805-12-02T16:30", category: "politique", importance: 85, title: "Fin de la bataille", place: "Champ de bataille", placePrecision: "region", coords: [16.76, 49.13], wiki: "Bataille d'Austerlitz", summary: "À la tombée de la nuit, l'armée austro-russe est en retraite. Les pertes alliées sont environ trois fois supérieures aux pertes françaises." },
      { date: "1805-12-03", category: "politique", importance: 85, title: "« Soldats, je suis content de vous »", place: "Château d'Austerlitz (Slavkov)", coords: [16.876, 49.153], wiki: "Bataille d'Austerlitz", summary: "Proclamation de Napoléon à la Grande Armée, datée d'Austerlitz." }
    ]
  },

  {
    id: "libre",
    title: "Exploration libre",
    subtitle: "Toutes les époques",
    description: "Parcourez librement les États du monde de l'Antiquité à nos jours. Cliquez sur un territoire pour lire son histoire.",
    range: [-3000, 2010],
    start: 1500,
    view: { center: [15, 30], zoom: 1.6 },
    actors: [],
    periods: [],
    events: []
  }
];
