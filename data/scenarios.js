/*
 * Sujets (scénarios) explorables dans Histomap.
 *
 * Schéma d'un scénario :
 *   id, title, subtitle, description
 *   range: [annéeDébut, annéeFin]       bornes du curseur de temps
 *   start: année affichée à l'ouverture
 *   view:  { center: [lon, lat], zoom }
 *   linger: nb d'années pendant lesquelles un événement reste visible après sa fin
 *   actors: liste de groupes colorés sur la carte
 *     { role: "focus" | "rival" | "ally", label, color,
 *       match: [noms d'États du jeu de données],
 *       when:  [[de, à], ...]   (optionnel) périodes où ce rôle s'applique }
 *     Les territoires dont le suzerain (SUBJECTO) correspond sont colorés
 *     dans une teinte plus claire (colonies, vassaux).
 *   periods: bandes affichées au-dessus de la frise { from, to, label, color }
 *   events:  points datés et localisés
 *     { date: "AAAA-MM-JJ" | "AAAA", end?: même format, type, title, place,
 *       coords: [lon, lat], wiki: "Titre de l'article fr", summary }
 *
 * Types d'événements : bataille, siege, traite, politique, culture, personnage
 */
window.HISTOMAP_EVENT_TYPES = {
  bataille:   { label: "Bataille",            color: "#b91c1c" },
  siege:      { label: "Siège",               color: "#ea580c" },
  traite:     { label: "Traité",              color: "#7c3aed" },
  politique:  { label: "Événement politique", color: "#0f766e" },
  culture:    { label: "Culture & société",   color: "#d97706" },
  personnage: { label: "Personnage",          color: "#475569" }
};

window.HISTOMAP_SCENARIOS = [
  {
    id: "louis-xiv",
    title: "Le règne de Louis XIV",
    subtitle: "1643 – 1715",
    description: "Soixante-douze ans de règne : de la régence d'Anne d'Autriche et de Mazarin à l'absolutisme versaillais, la France affronte successivement l'Espagne, les Provinces-Unies, l'Angleterre et les Habsbourg d'Autriche.",
    range: [1640, 1716],
    start: 1643,
    view: { center: [4, 48.5], zoom: 4.2 },
    linger: 2,
    actors: [
      { role: "focus", label: "Royaume de France", color: "#2563eb", match: ["France"] },
      { role: "rival", label: "Monarchie espagnole", color: "#dc2626", match: ["Spain", "Habsburg Netherlands", "Viceroyalty of New Spain"], when: [[1635, 1700]] },
      { role: "ally",  label: "Espagne (Philippe V)", color: "#16a34a", match: ["Spain", "Viceroyalty of New Spain"], when: [[1701, 1716]] },
      { role: "rival", label: "Habsbourg d'Autriche & Saint-Empire", color: "#f97316", match: ["Austrian Empire", "Holy Roman Empire", "Austrian Netherlands"] },
      { role: "rival", label: "Provinces-Unies", color: "#be185d", match: ["Dutch Republic", "Netherlands"], when: [[1672, 1678], [1688, 1713]] },
      { role: "rival", label: "Angleterre", color: "#9f1239", match: ["England and Ireland", "England", "British American colonies"], when: [[1689, 1713]] },
      { role: "ally",  label: "Angleterre (traité de Douvres)", color: "#22c55e", match: ["England and Ireland", "England"], when: [[1670, 1674]] }
    ],
    periods: [
      { from: 1643, to: 1661, label: "Régence & Mazarin", color: "#64748b" },
      { from: 1667, to: 1668, label: "Dévolution", color: "#b91c1c" },
      { from: 1672, to: 1678, label: "Guerre de Hollande", color: "#b91c1c" },
      { from: 1688, to: 1697, label: "Ligue d'Augsbourg", color: "#b91c1c" },
      { from: 1701, to: 1714, label: "Succession d'Espagne", color: "#b91c1c" }
    ],
    events: [
      { date: "1643-05-14", type: "personnage", title: "Avènement de Louis XIV", place: "Saint-Germain-en-Laye", coords: [2.0938, 48.8989], wiki: "Louis XIV", summary: "À la mort de Louis XIII, son fils de quatre ans devient roi ; Anne d'Autriche exerce la régence avec le cardinal Mazarin." },
      { date: "1643-05-19", type: "bataille", title: "Bataille de Rocroi", place: "Rocroi", coords: [4.5211, 49.9264], wiki: "Bataille de Rocroi", summary: "Le duc d'Enghien (futur Grand Condé) écrase les tercios espagnols." },
      { date: "1648-08-26", end: "1653", type: "politique", title: "La Fronde", place: "Paris", coords: [2.3522, 48.8566], wiki: "Fronde (histoire)", summary: "Révolte des parlementaires puis des princes contre l'autorité royale et Mazarin." },
      { date: "1648-10-24", type: "traite", title: "Traités de Westphalie", place: "Münster", coords: [7.6261, 51.9607], wiki: "Traités de Westphalie", summary: "Fin de la guerre de Trente Ans ; la France obtient l'essentiel de l'Alsace." },
      { date: "1658-06-14", type: "bataille", title: "Bataille des Dunes", place: "Dunkerque", coords: [2.3768, 51.0344], wiki: "Bataille des Dunes (1658)", summary: "Turenne, allié aux Anglais de Cromwell, bat les Espagnols et Condé." },
      { date: "1659-11-07", type: "traite", title: "Traité des Pyrénées", place: "Île des Faisans", coords: [-1.7633, 43.3425], wiki: "Traité des Pyrénées", summary: "Paix avec l'Espagne : la France gagne le Roussillon et l'Artois." },
      { date: "1660-06-09", type: "personnage", title: "Mariage avec Marie-Thérèse d'Autriche", place: "Saint-Jean-de-Luz", coords: [-1.6631, 43.3881], wiki: "Marie-Thérèse d'Autriche (1638-1683)", summary: "Le roi épouse l'infante d'Espagne, scellant la paix des Pyrénées." },
      { date: "1661-03-09", type: "politique", title: "Début du règne personnel", place: "Vincennes", coords: [2.4357, 48.8429], wiki: "Jules Mazarin", summary: "À la mort de Mazarin, Louis XIV décide de gouverner sans Premier ministre." },
      { date: "1667-05-24", end: "1668", type: "bataille", title: "Guerre de Dévolution", place: "Flandre (Lille)", coords: [3.0573, 50.6292], wiki: "Guerre de Dévolution", summary: "Louis XIV revendique les Pays-Bas espagnols au nom de son épouse ; prise de Lille." },
      { date: "1668-05-02", type: "traite", title: "Traité d'Aix-la-Chapelle", place: "Aix-la-Chapelle", coords: [6.0839, 50.7753], wiki: "Traité d'Aix-la-Chapelle (1668)", summary: "La France conserve plusieurs places flamandes, dont Lille." },
      { date: "1672-06-12", type: "bataille", title: "Passage du Rhin", place: "Tolhuis (Lobith)", coords: [6.1170, 51.8620], wiki: "Passage du Rhin", summary: "L'armée royale franchit le Rhin et envahit les Provinces-Unies." },
      { date: "1678-08-10", type: "traite", title: "Paix de Nimègue", place: "Nimègue", coords: [5.8372, 51.8126], wiki: "Traités de Nimègue", summary: "La France obtient la Franche-Comté : apogée de la puissance louis-quatorzienne." },
      { date: "1682-05-06", type: "culture", title: "La cour s'installe à Versailles", place: "Versailles", coords: [2.1204, 48.8049], wiki: "Château de Versailles", summary: "Versailles devient le siège du pouvoir et la vitrine de la monarchie absolue." },
      { date: "1683-09-12", type: "bataille", title: "Bataille de Vienne", place: "Kahlenberg, Vienne", coords: [16.3340, 48.2760], wiki: "Bataille de Vienne", summary: "Les Ottomans échouent devant Vienne face à la coalition menée par Jean III Sobieski." },
      { date: "1685-10-18", type: "politique", title: "Révocation de l'édit de Nantes", place: "Fontainebleau", coords: [2.7006, 48.4022], wiki: "Édit de Fontainebleau", summary: "Le protestantisme est interdit ; des dizaines de milliers de huguenots s'exilent." },
      { date: "1690-07-01", type: "bataille", title: "Bataille de Fleurus", place: "Fleurus", coords: [4.5500, 50.4833], wiki: "Bataille de Fleurus (1690)", summary: "Le maréchal de Luxembourg bat les coalisés de la ligue d'Augsbourg." },
      { date: "1692-05-29", type: "bataille", title: "Bataille de la Hougue", place: "Saint-Vaast-la-Hougue", coords: [-1.2650, 49.5880], wiki: "Bataille de la Hougue", summary: "Défaite navale française face aux flottes anglaise et hollandaise." },
      { date: "1693-07-29", type: "bataille", title: "Bataille de Neerwinden", place: "Neerwinden", coords: [5.0300, 50.7600], wiki: "Bataille de Neerwinden (1693)", summary: "Victoire de Luxembourg sur Guillaume III, « le tapissier de Notre-Dame »." },
      { date: "1697-09-20", type: "traite", title: "Traités de Ryswick", place: "Rijswijk", coords: [4.3200, 52.0360], wiki: "Traités de Ryswick", summary: "Fin de la guerre de la ligue d'Augsbourg ; la France garde Strasbourg." },
      { date: "1700-11-01", type: "politique", title: "Testament de Charles II d'Espagne", place: "Madrid", coords: [-3.7038, 40.4168], wiki: "Guerre de Succession d'Espagne", summary: "Le roi d'Espagne lègue sa couronne à Philippe d'Anjou, petit-fils de Louis XIV." },
      { date: "1704-08-13", type: "bataille", title: "Bataille de Blenheim (Höchstädt)", place: "Blindheim", coords: [10.5900, 48.6200], wiki: "Bataille de Blenheim", summary: "Marlborough et le prince Eugène infligent une lourde défaite aux Franco-Bavarois." },
      { date: "1706-05-23", type: "bataille", title: "Bataille de Ramillies", place: "Ramillies", coords: [4.9100, 50.6400], wiki: "Bataille de Ramillies", summary: "Marlborough chasse les Français des Pays-Bas espagnols." },
      { date: "1709-09-11", type: "bataille", title: "Bataille de Malplaquet", place: "Malplaquet", coords: [3.8600, 50.3300], wiki: "Bataille de Malplaquet", summary: "Bataille la plus sanglante du siècle ; les coalisés l'emportent à un prix énorme." },
      { date: "1712-07-24", type: "bataille", title: "Bataille de Denain", place: "Denain", coords: [3.3900, 50.3300], wiki: "Bataille de Denain", summary: "Villars sauve le royaume d'une invasion et ouvre la voie à la paix." },
      { date: "1713-04-11", type: "traite", title: "Traités d'Utrecht", place: "Utrecht", coords: [5.1214, 52.0907], wiki: "Traités d'Utrecht", summary: "Philippe V garde l'Espagne mais renonce au trône de France ; l'Angleterre gagne Gibraltar et Terre-Neuve." },
      { date: "1715-09-01", type: "personnage", title: "Mort de Louis XIV", place: "Versailles", coords: [2.1204, 48.8049], wiki: "Louis XIV", summary: "Le roi meurt après 72 ans de règne ; son arrière-petit-fils Louis XV, cinq ans, lui succède." }
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
    linger: 3,
    actors: [
      { role: "focus", label: "Royaume de France (Valois)", color: "#2563eb", match: ["France"] },
      { role: "rival", label: "Angleterre & possessions anglaises", color: "#dc2626", match: ["English territory", "England"] },
      { role: "ally",  label: "Écosse (Auld Alliance)", color: "#16a34a", match: ["Scotland"] },
      { role: "ally",  label: "Castille", color: "#22c55e", match: ["Castile", "Castille"], when: [[1369, 1460]] }
    ],
    periods: [
      { from: 1337, to: 1360, label: "Phase édouardienne", color: "#b91c1c" },
      { from: 1369, to: 1389, label: "Phase caroline", color: "#1d4ed8" },
      { from: 1415, to: 1453, label: "Phase lancastrienne", color: "#b91c1c" }
    ],
    events: [
      { date: "1340-06-24", type: "bataille", title: "Bataille de l'Écluse", place: "Sluis", coords: [3.3900, 51.3100], wiki: "Bataille de L'Écluse", summary: "La flotte française est anéantie ; l'Angleterre maîtrise la Manche." },
      { date: "1346-08-26", type: "bataille", title: "Bataille de Crécy", place: "Crécy-en-Ponthieu", coords: [1.8875, 50.2569], wiki: "Bataille de Crécy", summary: "Les archers anglais déciment la chevalerie de Philippe VI." },
      { date: "1346-09-04", end: "1347-08-03", type: "siege", title: "Siège de Calais", place: "Calais", coords: [1.8587, 50.9513], wiki: "Siège de Calais (1346-1347)", summary: "Après onze mois de siège, Calais se rend : les « bourgeois de Calais »." },
      { date: "1348", type: "culture", title: "La Peste noire", place: "Marseille", coords: [5.3698, 43.2965], wiki: "Peste noire", summary: "L'épidémie atteint la France et tue près d'un tiers de la population." },
      { date: "1356-09-19", type: "bataille", title: "Bataille de Poitiers", place: "Nouaillé-Maupertuis", coords: [0.4150, 46.5130], wiki: "Bataille de Poitiers (1356)", summary: "Le Prince Noir capture le roi Jean II le Bon." },
      { date: "1360-05-08", type: "traite", title: "Traité de Brétigny", place: "Brétigny (Sours)", coords: [1.5980, 48.4080], wiki: "Traité de Brétigny", summary: "Édouard III renonce au trône de France contre un vaste Aquitaine souveraine." },
      { date: "1364-05-16", type: "bataille", title: "Bataille de Cocherel", place: "Cocherel", coords: [1.3800, 49.0500], wiki: "Bataille de Cocherel", summary: "Première grande victoire de Du Guesclin, au début du règne de Charles V." },
      { date: "1415-10-25", type: "bataille", title: "Bataille d'Azincourt", place: "Azincourt", coords: [2.1286, 50.4636], wiki: "Bataille d'Azincourt", summary: "Henri V écrase l'armée française ; désastre pour la noblesse." },
      { date: "1420-05-21", type: "traite", title: "Traité de Troyes", place: "Troyes", coords: [4.0744, 48.2973], wiki: "Traité de Troyes", summary: "Henri V devient héritier du trône de France ; le dauphin Charles est déshérité." },
      { date: "1428-10-12", end: "1429-05-08", type: "siege", title: "Siège d'Orléans", place: "Orléans", coords: [1.9093, 47.9029], wiki: "Siège d'Orléans", summary: "Jeanne d'Arc fait lever le siège : le tournant de la guerre." },
      { date: "1429-07-17", type: "politique", title: "Sacre de Charles VII", place: "Reims", coords: [4.0317, 49.2583], wiki: "Charles VII (roi de France)", summary: "Jeanne d'Arc conduit le dauphin à Reims pour y être sacré." },
      { date: "1431-05-30", type: "personnage", title: "Mort de Jeanne d'Arc", place: "Rouen", coords: [1.0993, 49.4431], wiki: "Jeanne d'Arc", summary: "Condamnée pour hérésie, Jeanne est brûlée vive place du Vieux-Marché." },
      { date: "1435-09-21", type: "traite", title: "Traité d'Arras", place: "Arras", coords: [2.7775, 50.2910], wiki: "Traité d'Arras (1435)", summary: "Le duc de Bourgogne se réconcilie avec Charles VII et abandonne l'alliance anglaise." },
      { date: "1450-04-15", type: "bataille", title: "Bataille de Formigny", place: "Formigny", coords: [-0.9000, 49.3350], wiki: "Bataille de Formigny", summary: "Victoire décisive qui rend la Normandie au roi de France." },
      { date: "1453-07-17", type: "bataille", title: "Bataille de Castillon", place: "Castillon-la-Bataille", coords: [-0.0400, 44.8550], wiki: "Bataille de Castillon", summary: "L'artillerie française l'emporte : fin de la présence anglaise en Guyenne." }
    ]
  },

  {
    id: "napoleon",
    title: "L'épopée napoléonienne",
    subtitle: "1796 – 1821",
    description: "De la campagne d'Italie à Sainte-Hélène : l'ascension de Bonaparte, l'Empire et les coalitions européennes. Attention : le jeu de frontières n'a pas d'instantané entre 1800 et 1815, l'extension maximale de l'Empire (1812) n'est donc pas encore dessinée.",
    range: [1795, 1821],
    start: 1796,
    view: { center: [12, 50], zoom: 3.6 },
    linger: 1,
    actors: [
      { role: "focus", label: "France", color: "#2563eb", match: ["France"] },
      { role: "rival", label: "Grande-Bretagne", color: "#dc2626", match: ["United Kingdom", "United Kingdom of Great Britain and Ireland"] },
      { role: "rival", label: "Autriche", color: "#f97316", match: ["Austrian Empire", "Holy Roman Empire", "Austrian Netherlands", "Milano (Austria)"], when: [[1795, 1801], [1805, 1805], [1809, 1809], [1813, 1815]] },
      { role: "rival", label: "Russie", color: "#9f1239", match: ["Russian Empire"], when: [[1799, 1800], [1805, 1807], [1812, 1815]] },
      { role: "rival", label: "Prusse", color: "#be185d", match: ["Prussia"], when: [[1806, 1807], [1813, 1815]] },
      { role: "rival", label: "Empire ottoman", color: "#a16207", match: ["Ottoman Empire"], when: [[1798, 1801]] },
      { role: "ally",  label: "Espagne", color: "#16a34a", match: ["Spain"], when: [[1796, 1807]] },
      { role: "rival", label: "Espagne insurgée", color: "#ef4444", match: ["Spain"], when: [[1808, 1814]] }
    ],
    periods: [
      { from: 1796, to: 1799, label: "Directoire", color: "#64748b" },
      { from: 1799, to: 1804, label: "Consulat", color: "#0f766e" },
      { from: 1804, to: 1814, label: "Premier Empire", color: "#1d4ed8" },
      { from: 1815, to: 1821, label: "Exil", color: "#475569" }
    ],
    events: [
      { date: "1796-11-15", type: "bataille", title: "Bataille du pont d'Arcole", place: "Arcole", coords: [11.2700, 45.3600], wiki: "Bataille du pont d'Arcole", summary: "Bonaparte, général de l'armée d'Italie, bat les Autrichiens." },
      { date: "1797-10-17", type: "traite", title: "Traité de Campo-Formio", place: "Campoformido", coords: [13.1600, 46.0200], wiki: "Traité de Campo-Formio", summary: "L'Autriche cède la Belgique et reconnaît la République cisalpine." },
      { date: "1798-07-21", type: "bataille", title: "Bataille des Pyramides", place: "Embabeh, Égypte", coords: [31.2100, 30.0700], wiki: "Bataille des Pyramides", summary: "« Soldats, du haut de ces pyramides, quarante siècles vous contemplent. »" },
      { date: "1798-08-01", type: "bataille", title: "Bataille d'Aboukir (navale)", place: "Baie d'Aboukir", coords: [30.0700, 31.3200], wiki: "Bataille d'Aboukir (1798)", summary: "Nelson détruit la flotte française : l'armée d'Égypte est isolée." },
      { date: "1799-11-09", type: "politique", title: "Coup d'État du 18 Brumaire", place: "Saint-Cloud", coords: [2.2190, 48.8430], wiki: "Coup d'État du 18 Brumaire", summary: "Bonaparte renverse le Directoire et devient Premier consul." },
      { date: "1800-06-14", type: "bataille", title: "Bataille de Marengo", place: "Marengo", coords: [8.6800, 44.8900], wiki: "Bataille de Marengo", summary: "Victoire arrachée sur les Autrichiens, qui consolide le Consulat." },
      { date: "1804-03-21", type: "politique", title: "Code civil", place: "Paris", coords: [2.3522, 48.8566], wiki: "Code civil des Français", summary: "Promulgation du Code civil des Français, dit Code Napoléon." },
      { date: "1804-12-02", type: "politique", title: "Sacre de Napoléon Ier", place: "Notre-Dame de Paris", coords: [2.3499, 48.8530], wiki: "Sacre de Napoléon Ier", summary: "Napoléon se couronne empereur des Français en présence du pape Pie VII." },
      { date: "1805-10-21", type: "bataille", title: "Bataille de Trafalgar", place: "Cap Trafalgar", coords: [-6.2500, 36.2000], wiki: "Bataille de Trafalgar", summary: "Nelson détruit la flotte franco-espagnole ; fin des projets d'invasion de l'Angleterre." },
      { date: "1805-12-02", type: "bataille", title: "Bataille d'Austerlitz", place: "Slavkov u Brna", coords: [16.7600, 49.1300], wiki: "Bataille d'Austerlitz", summary: "La « bataille des Trois Empereurs », chef-d'œuvre tactique de Napoléon." },
      { date: "1806-10-14", type: "bataille", title: "Bataille d'Iéna", place: "Iéna", coords: [11.5800, 50.9300], wiki: "Bataille d'Iéna", summary: "L'armée prussienne s'effondre ; Napoléon entre à Berlin." },
      { date: "1807-07-07", type: "traite", title: "Traités de Tilsit", place: "Tilsit (Sovetsk)", coords: [21.8800, 55.0800], wiki: "Traités de Tilsit", summary: "Napoléon et Alexandre Ier se partagent l'Europe sur un radeau du Niémen." },
      { date: "1808-05-02", type: "politique", title: "Soulèvement du Dos de Mayo", place: "Madrid", coords: [-3.7038, 40.4168], wiki: "Soulèvement du Dos de Mayo", summary: "Madrid se soulève contre l'occupation française : début de la guerre d'Espagne." },
      { date: "1809-07-06", type: "bataille", title: "Bataille de Wagram", place: "Deutsch-Wagram", coords: [16.5600, 48.3000], wiki: "Bataille de Wagram", summary: "Victoire coûteuse sur l'Autriche, suivie du mariage avec Marie-Louise." },
      { date: "1812-09-07", type: "bataille", title: "Bataille de la Moskova (Borodino)", place: "Borodino", coords: [35.8200, 55.5200], wiki: "Bataille de la Moskova", summary: "Bataille la plus meurtrière de la campagne de Russie." },
      { date: "1812-09-14", type: "politique", title: "Entrée dans Moscou", place: "Moscou", coords: [37.6173, 55.7558], wiki: "Incendie de Moscou (1812)", summary: "La Grande Armée entre dans une ville vidée, bientôt en flammes." },
      { date: "1812-11-26", type: "bataille", title: "Passage de la Bérézina", place: "Studzianka", coords: [28.3500, 54.3300], wiki: "Bataille de la Bérézina", summary: "Les pontonniers permettent à une partie de l'armée en retraite d'échapper." },
      { date: "1813-10-16", type: "bataille", title: "Bataille de Leipzig", place: "Leipzig", coords: [12.4100, 51.3100], wiki: "Bataille de Leipzig", summary: "La « bataille des Nations » : défaite décisive face à la coalition." },
      { date: "1814-04-06", type: "politique", title: "Abdication de Fontainebleau", place: "Fontainebleau", coords: [2.7006, 48.4022], wiki: "Adieux de Fontainebleau", summary: "Napoléon abdique et part pour l'île d'Elbe." },
      { date: "1815-03-01", type: "personnage", title: "Retour de l'île d'Elbe", place: "Golfe-Juan", coords: [7.0730, 43.5670], wiki: "Cent-Jours", summary: "Napoléon débarque et marche sur Paris : début des Cent-Jours." },
      { date: "1815-06-18", type: "bataille", title: "Bataille de Waterloo", place: "Waterloo", coords: [4.4100, 50.6800], wiki: "Bataille de Waterloo", summary: "Wellington et Blücher battent Napoléon : fin définitive de l'Empire." },
      { date: "1821-05-05", type: "personnage", title: "Mort de Napoléon", place: "Sainte-Hélène", coords: [-5.7089, -15.9650], wiki: "Napoléon Ier", summary: "Napoléon meurt en exil à Longwood House." }
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
    linger: 0,
    actors: [],
    periods: [],
    events: []
  }
];
