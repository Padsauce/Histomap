/*
 * Catégories d'éléments ponctuels affichés sur la carte (F-40).
 * Chaque catégorie a une icône, une couleur et un libellé par langue.
 * Plus tard (phase 2), chaque catégorie sera associée à des classes Wikidata (P31/P279).
 */
import type { Category } from "../core/types";

export const CATEGORIES: Category[] = [
  { id: "conflit",     icon: "⚔️", color: "#c62828", label: { fr: "Batailles et conflits", en: "Battles and conflicts" } },
  { id: "traite",      icon: "📜", color: "#6a1b9a", label: { fr: "Traités et actes", en: "Treaties and acts" } },
  { id: "politique",   icon: "👑", color: "#00796b", label: { fr: "Événements politiques", en: "Political events" } },
  { id: "personnage",  icon: "👤", color: "#455a64", label: { fr: "Personnalités", en: "People" } },
  { id: "decouverte",  icon: "💡", color: "#f9a825", label: { fr: "Découvertes et inventions", en: "Discoveries and inventions" } },
  { id: "culture",     icon: "🎨", color: "#d81b60", label: { fr: "Culture et arts", en: "Culture and arts" } },
  { id: "religion",    icon: "⛪", color: "#8d6e63", label: { fr: "Religions", en: "Religions" } },
  { id: "exploration", icon: "🧭", color: "#0277bd", label: { fr: "Explorations et routes", en: "Exploration and routes" } },
  { id: "migration",   icon: "👣", color: "#558b2f", label: { fr: "Migrations et peuplements", en: "Migrations and settlement" } },
  { id: "ville",       icon: "🏙️", color: "#ef6c00", label: { fr: "Villes", en: "Cities" } },
  { id: "catastrophe", icon: "🌋", color: "#4e342e", label: { fr: "Catastrophes et épidémies", en: "Disasters and epidemics" } },
  { id: "science",     icon: "🔬", color: "#00838f", label: { fr: "Sciences et techniques", en: "Science and technology" } }
];
