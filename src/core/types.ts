/* Types du modèle de données d'Histomap (voir docs/PLAN.md § 9.4). */

export type Precision =
  | "1e5y" | "1e4y" | "millennium" | "century" | "decade"
  | "year" | "month" | "day" | "hour" | "minute";

/** Date telle qu'écrite dans les données : année historique (nombre) ou chaîne "AAAA-MM-JJTHH:MM", préfixe "~" = approximative. */
export type DateInput = number | string;

export type Role = "focus" | "rival" | "ally" | "context";
export type CategoryId =
  | "conflit" | "traite" | "politique" | "personnage" | "decouverte" | "culture"
  | "religion" | "exploration" | "migration" | "ville" | "catastrophe" | "science";
export type PlacePrecision = "exact" | "city" | "region" | "country";

export interface Category {
  id: CategoryId;
  icon: string;
  color: string;
  label: Record<string, string>;
}

/** Groupe d'États colorés sur la carte. */
export interface ActorSpec {
  role: Role;
  label: string;
  color: string;
  /** Noms d'États tels qu'écrits dans le jeu de frontières. */
  match: string[];
  /** Points (capitales…) : l'État qui contient le point sur la carte de l'époque est retenu. */
  points?: [number, number][];
  /** Périodes (années historiques ou dates) pendant lesquelles ce rôle s'applique. */
  when?: [DateInput, DateInput][];
  /** Identifiant Wikidata de l'entité représentée. */
  qid?: string;
}

export interface PeriodSpec {
  from: DateInput;
  to: DateInput;
  label: string;
  color: string;
}

export interface EventSpec {
  date: DateInput;
  end?: DateInput;
  precision?: Precision;
  category: CategoryId;
  subtype?: string;
  importance?: number;
  title: string;
  place: string;
  placePrecision?: PlacePrecision;
  coords: [number, number];
  wiki?: string;
  summary?: string;
  /** Identifiant Wikidata (sujets générés). */
  qid?: string;
}

export interface PathSpec {
  label: string;
  color: string;
  /** Étapes datées d'un trajet (personnage, armée…). */
  steps: { date: DateInput; coords: [number, number]; label: string }[];
}

export interface ScenarioSpec {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  range: [DateInput, DateInput];
  start: DateInput;
  view: { center: [number, number]; zoom: number };
  /** Si présent, la carte s'ajuste à cette emprise [ouest, sud, est, nord]. */
  bbox?: [number, number, number, number];
  actors: ActorSpec[];
  periods: PeriodSpec[];
  events: EventSpec[];
  paths?: PathSpec[];
  /** Sujet généré automatiquement (Wikidata) ou éditorialisé. */
  kind?: "curated" | "generated";
  /** Entité Wikidata d'origine (sujets générés). */
  qid?: string;
  /** Avertissements de qualité (données manquantes…). */
  notes?: string[];
}

/** Événement normalisé (temps en années astronomiques décimales). */
export interface EventItem extends EventSpec {
  idx: number;
  order: number;
  t0: number;
  t1: number;
  precision: Precision;
  circa: boolean;
  hasEnd: boolean;
  endPrecision: Precision;
  color: string;
  icon: string;
  importance: number;
  dateLabel: string;
}

export interface Scenario {
  raw: ScenarioSpec;
  id: string;
  bounds: [number, number];
  startT: number;
  actors: (ActorSpec & { whenT?: [number, number][] })[];
  periods: (PeriodSpec & { t0: number; t1: number })[];
  events: EventItem[];
  byIdx: Record<number, EventItem>;
  paths: { label: string; color: string; steps: { t: number; coords: [number, number]; label: string }[] }[];
}
