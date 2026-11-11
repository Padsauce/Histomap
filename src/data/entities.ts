/*
 * Correspondance entre les noms (anglais) des États du jeu de données
 * historical-basemaps et leur nom français + article Wikipédia (fr).
 *
 * Une entrée peut être :
 *   - un objet { label, wiki }
 *   - un tableau d'objets { until, label, wiki } : la première entrée dont
 *     `until` est >= à l'année affichée est utilisée (la dernière sans `until`
 *     sert de valeur par défaut). Cela permet de nommer correctement un même
 *     territoire selon l'époque (Royaume de France, République, Empire…).
 *
 * Les États absents d'ici sont résolus automatiquement via les liens
 * interlangues de Wikipédia (en → fr).
 */
export interface EntityName { label: string; wiki: string; until?: number }

export const ENTITIES: Record<string, EntityName | EntityName[]> = {
  "France": [
    { until: 1791, label: "Royaume de France", wiki: "Royaume de France" },
    { until: 1803, label: "République française", wiki: "Première République (France)" },
    { until: 1814, label: "Empire français", wiki: "Premier Empire" },
    { until: 1847, label: "Royaume de France (Restauration)", wiki: "Restauration (histoire de France)" },
    { label: "France", wiki: "France" }
  ],
  "English territory": { label: "Possessions anglaises", wiki: "Royaume d'Angleterre" },
  "England": { label: "Royaume d'Angleterre", wiki: "Royaume d'Angleterre" },
  "England and Ireland": { label: "Angleterre et Irlande", wiki: "Royaume d'Angleterre" },
  "United Kingdom": [
    { until: 1800, label: "Grande-Bretagne", wiki: "Royaume de Grande-Bretagne" },
    { label: "Royaume-Uni", wiki: "Royaume-Uni" }
  ],
  "United Kingdom of Great Britain and Ireland": { label: "Royaume-Uni", wiki: "Royaume-Uni de Grande-Bretagne et d'Irlande" },
  "Scotland": { label: "Royaume d'Écosse", wiki: "Royaume d'Écosse" },
  "Britany": { label: "Duché de Bretagne", wiki: "Duché de Bretagne" },
  "Holy Roman Empire": { label: "Saint-Empire romain germanique", wiki: "Saint-Empire romain germanique" },
  "Spain": { label: "Monarchie espagnole", wiki: "Empire espagnol" },
  "Castile": { label: "Couronne de Castille", wiki: "Couronne de Castille" },
  "Castille": { label: "Couronne de Castille", wiki: "Couronne de Castille" },
  "Aragón": { label: "Couronne d'Aragon", wiki: "Couronne d'Aragon" },
  "Navarre": { label: "Royaume de Navarre", wiki: "Royaume de Navarre" },
  "Portugal": { label: "Royaume de Portugal", wiki: "Royaume de Portugal" },
  "Ottoman Empire": { label: "Empire ottoman", wiki: "Empire ottoman" },
  "Venice": { label: "République de Venise", wiki: "République de Venise" },
  "Dutch Republic": { label: "Provinces-Unies", wiki: "Provinces-Unies" },
  "Netherlands": [
    { until: 1794, label: "Provinces-Unies", wiki: "Provinces-Unies" },
    { label: "Pays-Bas", wiki: "Pays-Bas" }
  ],
  "Habsburg Netherlands": { label: "Pays-Bas des Habsbourg", wiki: "Pays-Bas des Habsbourg" },
  "Austrian Netherlands": { label: "Pays-Bas autrichiens", wiki: "Pays-Bas autrichiens" },
  "Austrian Empire": [
    { until: 1803, label: "Monarchie de Habsbourg", wiki: "Monarchie de Habsbourg" },
    { label: "Empire d'Autriche", wiki: "Empire d'Autriche" }
  ],
  "Prussia": [
    { until: 1700, label: "Brandebourg-Prusse", wiki: "Brandebourg-Prusse" },
    { label: "Royaume de Prusse", wiki: "Royaume de Prusse" }
  ],
  "Sweden": [
    { until: 1721, label: "Empire suédois", wiki: "Empire suédois" },
    { label: "Royaume de Suède", wiki: "Suède" }
  ],
  "Tsardom of Muscovy": { label: "Tsarat de Russie", wiki: "Tsarat de Russie" },
  "Russian Empire": { label: "Empire russe", wiki: "Empire russe" },
  "Savoy": { label: "États de Savoie", wiki: "États de Savoie" },
  "New France": { label: "Nouvelle-France", wiki: "Nouvelle-France" },
  "Viceroyalty of New Spain": { label: "Nouvelle-Espagne", wiki: "Vice-royauté de Nouvelle-Espagne" },
  "United States of America": { label: "États-Unis", wiki: "États-Unis" },
  "United States": { label: "États-Unis", wiki: "États-Unis" },
  "Papal States": { label: "États pontificaux", wiki: "États pontificaux" }
};
