/*
 * Client Wikidata : recherche d'entités (API wbsearchentities) et requêtes SPARQL
 * (query.wikidata.org), via la couche réseau (cache mémoire + IndexedDB, file d'attente).
 */
import { getJSON } from "./net";
import type { Precision } from "./types";

const SPARQL = "https://query.wikidata.org/sparql";
const API = "https://www.wikidata.org/w/api.php";

export type Binding = Record<string, string>;

/** Exécute une requête SPARQL et renvoie des lignes { variable: valeur } (QID courts pour les entités). */
export async function sparql(query: string): Promise<Binding[]> {
  const url = `${SPARQL}?format=json&query=${encodeURIComponent(query)}`;
  const d = await getJSON<any>(url, { persist: true, init: { headers: { Accept: "application/sparql-results+json" } } });
  return d.results.bindings.map((b: Record<string, { value: string }>) => {
    const row: Binding = {};
    for (const k in b) row[k] = b[k].value.replace("http://www.wikidata.org/entity/", "");
    return row;
  });
}

export interface SearchResult { id: string; label: string; description: string }

/** Recherche plein texte d'entités, dans la langue de l'interface. */
export async function searchEntities(text: string, lang: string, limit = 8): Promise<SearchResult[]> {
  const url = `${API}?action=wbsearchentities&format=json&origin=*&type=item&limit=${limit}` +
    `&language=${lang}&uselang=${lang}&search=${encodeURIComponent(text)}`;
  const d = await getJSON<any>(url);
  return (d.search || []).map((r: any) => ({ id: r.id, label: r.label || r.id, description: r.description || "" }));
}

/** "Point(lon lat)" → [lon, lat] */
export function parsePoint(wkt?: string): [number, number] | null {
  if (!wkt) return null;
  const m = /Point\(([-\d.eE]+) ([-\d.eE]+)\)/.exec(wkt);
  return m ? [+m[1], +m[2]] : null;
}

const PRECISION_MAP: Record<number, Precision> = {
  11: "day", 10: "month", 9: "year", 8: "decade", 7: "century", 6: "millennium", 5: "1e4y", 4: "1e5y"
};

/**
 * Valeur temporelle Wikidata → date au format Histomap.
 * WDQS renvoie les années avant notre ère en numérotation astronomique (XSD 1.1) :
 * "-0479" = 480 av. J.-C.
 */
export function parseTime(value?: string, prec?: string | number): { date: string; precision: Precision } | null {
  if (!value) return null;
  const m = /^([+-]?\d+)-(\d{2})-(\d{2})/.exec(value);
  if (!m) return null;
  const A = parseInt(m[1], 10);
  const Y = A <= 0 ? A - 1 : A;
  let p: number;
  if (prec !== undefined && prec !== "") p = +prec;
  else p = m[2] === "01" && m[3] === "01" ? 9 : 11; // qualificatifs sans précision : heuristique
  const precision = PRECISION_MAP[Math.max(4, Math.min(11, p))] || "year";
  if (precision === "day") return { date: `${Y}-${m[2]}-${m[3]}`, precision };
  if (precision === "month") return { date: `${Y}-${m[2]}`, precision };
  return { date: String(Y), precision };
}

export interface EntityInfo { label?: string; description?: string; frwiki?: string }

/**
 * Libellés, descriptions et titres Wikipédia (fr) d'une liste d'entités, par lots de 50,
 * via l'API Wikidata (moins coûteux que le service d'étiquettes SPARQL).
 */
export async function getEntities(ids: string[], lang: string): Promise<Record<string, EntityInfo>> {
  const langs = [...new Set([lang, "fr", "en", "mul"])];
  const out: Record<string, EntityInfo> = {};
  const uniq = [...new Set(ids)].filter(Boolean);
  const batches: string[][] = [];
  for (let i = 0; i < uniq.length; i += 50) batches.push(uniq.slice(i, i + 50));
  await Promise.all(batches.map(async b => {
    const url = `${API}?action=wbgetentities&format=json&origin=*&props=labels|descriptions|sitelinks` +
      `&languages=${langs.join("|")}&sitefilter=frwiki&ids=${b.join("|")}`;
    try {
      const d = await getJSON<any>(url, { persist: true });
      for (const [id, e] of Object.entries<any>(d.entities || {})) {
        const pick = (o: any) => { for (const l of langs) if (o?.[l]) return o[l].value as string; return undefined; };
        out[id] = { label: pick(e.labels), description: pick(e.descriptions), frwiki: e.sitelinks?.frwiki?.title };
      }
    } catch {
      // Repli : la même information via SPARQL (autre service, autres limites de débit)
      try { Object.assign(out, await entitiesViaSparql(b, langs)); } catch { /* libellés manquants : on affichera les QID */ }
    }
  }));
  return out;
}

async function entitiesViaSparql(ids: string[], langs: string[]): Promise<Record<string, EntityInfo>> {
  const rows = await sparql(`SELECT ?e ?k ?v ?l WHERE {
  VALUES ?e { ${ids.map(q => "wd:" + q).join(" ")} }
  { ?e rdfs:label ?v . BIND("label" AS ?k) BIND(LANG(?v) AS ?l) FILTER(LANG(?v) IN (${langs.map(l => `"${l}"`).join(", ")})) }
  UNION { ?e schema:description ?v . BIND("description" AS ?k) BIND(LANG(?v) AS ?l) FILTER(LANG(?v) IN (${langs.map(l => `"${l}"`).join(", ")})) }
  UNION { ?a schema:about ?e ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?v . BIND("frwiki" AS ?k) BIND("fr" AS ?l) }
}`);
  const out: Record<string, EntityInfo & { _rank?: Record<string, number> }> = {};
  for (const r of rows) {
    const o = (out[r.e] ||= { _rank: {} });
    if (r.k === "frwiki") { o.frwiki = r.v; continue; }
    const rank = langs.indexOf(r.l);
    const key = r.k as "label" | "description";
    if (o._rank![key] === undefined || rank < o._rank![key]) { o[key] = r.v; o._rank![key] = rank; }
  }
  for (const k in out) delete out[k]._rank;
  return out;
}

export const wdUrl = (qid: string) => `https://www.wikidata.org/wiki/${qid}`;
