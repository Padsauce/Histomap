/*
 * Générateur de sujets depuis Wikidata (F-63 à F-66, F-32).
 *
 * À partir d'une entité Wikidata (Q…), on détecte son type puis on applique une « recette » qui
 * produit un sujet au même format que les sujets éditorialisés (ScenarioSpec) :
 *   - souverain  : règne (P39 + P1001), guerres et batailles du royaume pendant le règne
 *   - personne   : vie (P569–P570), lieux de vie datés → trajet, événements auxquels elle a participé
 *   - guerre     : P580–P582, belligérants (P710), batailles et traités qui en font partie (P361)
 *   - événement  : rattaché à sa guerre (P361) si elle existe, sinon traité comme une guerre
 *   - État       : création–dissolution (P571–P576), capitale, chefs d'État (P35), guerres
 *   - lieu       : événements datés à moins de 30 km
 * Les États sont reliés aux frontières par leur capitale : l'État dont le territoire contient la
 * capitale sur la carte de l'époque est coloré (indépendant des noms du jeu de frontières).
 */
import { sparql, parsePoint, parseTime, getEntities, type Binding } from "./wikidata";
import type { ActorSpec, CategoryId, EventSpec, PathSpec, PeriodSpec, Precision, ScenarioSpec } from "./types";
import { parse as parseDate, histToAstro, fmtYearHist, fromT } from "./time";

export type SubjectKind = "person" | "war" | "event" | "state" | "place" | "unknown";

type Pt = [number, number];
type DateV = { date: string; precision: Precision };
interface Ref { qid: string; label: string; coords?: Pt; start?: DateV; end?: DateV; jurs?: Ref[]; head?: boolean; sl?: number }

export interface Facts {
  qid: string;
  label: string;
  description: string;
  wiki?: string;
  sitelinks: number;
  dates: Record<string, DateV>;
  coord?: Pt;
  capital?: Pt;
  places: Record<string, Ref>;
  lists: Record<string, Ref[]>;
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const LANG_PARAM = (lang: string) => `"${lang},fr,en,mul"`;
const xsd = (Y: number, end = false) => {
  const A = histToAstro(Y);
  const s = (A < 0 ? "-" : "") + String(Math.abs(A)).padStart(4, "0");
  return `"${s}-${end ? "12-31T23:59:59" : "01-01T00:00:00"}Z"^^xsd:dateTime`;
};
const yearOf = (d?: DateV) => (d ? fromT(parseDate(d.date).t).Y : undefined);
const tOf = (d: DateV) => parseDate(d.date, d.precision).t;

const RIVAL_COLORS = ["#dc2626", "#f97316", "#9f1239", "#be185d", "#a16207", "#ea580c", "#db2777", "#7c2d12"];

/** Classes d'événements (P31 direct) et catégorie Histomap associée. */
const EVENT_CLASSES: Record<string, { cat: CategoryId; subtype?: string }> = {
  Q178561: { cat: "conflit", subtype: "Bataille" },
  Q1261499: { cat: "conflit", subtype: "Bataille navale" },
  Q188055: { cat: "conflit", subtype: "Siège" },
  Q831663: { cat: "conflit", subtype: "Campagne militaire" },
  Q645883: { cat: "conflit", subtype: "Opération militaire" },
  Q2001676: { cat: "conflit", subtype: "Offensive" },
  Q467011: { cat: "conflit", subtype: "Invasion" },
  Q1361229: { cat: "conflit", subtype: "Conquête" },
  Q476807: { cat: "conflit", subtype: "Raid" },
  Q678146: { cat: "conflit", subtype: "Bombardement" },
  Q27653727: { cat: "conflit", subtype: "Bombardement naval" },
  Q3199915: { cat: "conflit", subtype: "Massacre" },
  Q124734: { cat: "conflit", subtype: "Rébellion" },
  Q10931: { cat: "politique", subtype: "Révolution" },
  Q209715: { cat: "politique", subtype: "Couronnement" },
  Q131569: { cat: "traite" },
  Q625298: { cat: "traite", subtype: "Traité de paix" }
};
/** Classes de guerres (P31 direct). */
const WAR_CLASSES = new Set(["Q198", "Q8465", "Q1006311", "Q103495", "Q104212151", "Q180684", "Q350604", "Q49773"]);

// ---------------------------------------------------------------------------
// Détection du type
// ---------------------------------------------------------------------------
const KIND_CLASSES: [SubjectKind, string[]][] = [
  ["person", ["Q5"]],
  ["war", ["Q198", "Q180684", "Q350604", "Q8465"]],
  ["event", ["Q178561", "Q188055", "Q131569", "Q1656682", "Q1190554"]],
  ["state", ["Q3024240", "Q7275", "Q6256", "Q1250464", "Q48349", "Q417175"]],
  ["place", ["Q486972", "Q2221906", "Q515"]]
];

export async function detectKind(qid: string): Promise<SubjectKind> {
  const all = KIND_CLASSES.flatMap(([, qs]) => qs).map(q => "wd:" + q).join(" ");
  const rows = await sparql(`SELECT DISTINCT ?t WHERE { VALUES ?t { ${all} } wd:${qid} wdt:P31/wdt:P279* ?t . }`);
  const found = new Set(rows.map(r => r.t));
  for (const [kind, qs] of KIND_CLASSES) if (qs.some(q => found.has(q))) return kind;
  return "unknown";
}

// ---------------------------------------------------------------------------
// Faits sur l'entité (une seule requête, une ligne par fait)
// ---------------------------------------------------------------------------
export async function fetchFacts(qid: string, lang: string): Promise<Facts> {
  const q = `
SELECT ?k ?v ?prec ?o ?oLabel ?coord ?s ?e2 ?j ?jLabel ?hc ?osl WHERE {
  BIND(wd:${qid} AS ?x)
  {
    VALUES (?k ?pp ?pv) {
      ("birth" p:P569 psv:P569) ("death" p:P570 psv:P570) ("start" p:P580 psv:P580) ("end" p:P582 psv:P582)
      ("inception" p:P571 psv:P571) ("dissolved" p:P576 psv:P576) ("date" p:P585 psv:P585)
    }
    ?x ?pp ?st . ?st ?pv [ wikibase:timeValue ?v ; wikibase:timePrecision ?prec ] .
  }
  UNION { ?x wdt:P625 ?coord . BIND("coord" AS ?k) }
  UNION { ?x wdt:P36 ?o . ?o wdt:P625 ?coord . BIND("capital" AS ?k) }
  UNION { VALUES (?k ?pl) { ("birthplace" wdt:P19) ("deathplace" wdt:P20) ("location" wdt:P276) } ?x ?pl ?o . ?o wdt:P625 ?coord . }
  UNION {
    VALUES (?k ?pc) { ("citizenship" wdt:P27) ("country" wdt:P17) ("predecessor" wdt:P1365) ("successor" wdt:P1366) ("participant" wdt:P710) }
    ?x ?pc ?o . OPTIONAL { ?o wdt:P36/wdt:P625 ?coord . }
  }
  UNION { ?x wdt:P361 ?o . BIND("partof" AS ?k) }
  UNION { ?x wdt:P1346 ?o . BIND("winner" AS ?k) }
  UNION {
    ?x p:P39 ?st . ?st ps:P39 ?o . BIND("position" AS ?k)
    OPTIONAL { ?st pq:P580 ?s . } OPTIONAL { ?st pq:P582 ?e2 . }
    OPTIONAL { ?o wdt:P1001 ?j . OPTIONAL { ?j wdt:P36/wdt:P625 ?coord . } }
    OPTIONAL { ?o wdt:P279+ ?hc . FILTER(?hc IN (wd:Q116, wd:Q48352)) }
    OPTIONAL { ?o wikibase:sitelinks ?osl . }
  }
  UNION {
    VALUES (?k ?pr ?ps) { ("residence" p:P551 ps:P551) ("education" p:P69 ps:P69) ("work" p:P937 ps:P937) }
    ?x ?pr ?st . ?st ?ps ?o . ?o wdt:P625 ?coord .
    OPTIONAL { ?st pq:P580 ?s . } OPTIONAL { ?st pq:P582 ?e2 . }
  }
  UNION { ?x p:P35 ?st . ?st ps:P35 ?o ; pq:P580 ?s . OPTIONAL { ?st pq:P582 ?e2 . } BIND("head" AS ?k) }
  UNION { ?x p:P793 ?st . ?st ps:P793 ?o ; pq:P585 ?s . OPTIONAL { ?st pq:P276/wdt:P625 ?coord . } BIND("significant" AS ?k) }
  UNION { ?x schema:description ?v . FILTER(LANG(?v) = "${lang}") BIND("desc" AS ?k) }
  UNION { ?x rdfs:label ?v . FILTER(LANG(?v) IN ("${lang}", "fr", "en", "mul")) BIND("label" AS ?k) BIND(LANG(?v) AS ?prec) }
  UNION { ?w schema:about ?x ; schema:isPartOf <https://fr.wikipedia.org/> ; schema:name ?v . BIND("wiki" AS ?k) }
  UNION { ?x wikibase:sitelinks ?v . BIND("sitelinks" AS ?k) }
  SERVICE wikibase:label { bd:serviceParam wikibase:language ${LANG_PARAM(lang)} . }
}`;
  const rows = await sparql(q);
  const f: Facts = { qid, label: qid, description: "", sitelinks: 0, dates: {}, places: {}, lists: {} };
  const labels: Record<string, string> = {};
  const push = (k: string, r: Ref) => {
    const l = (f.lists[k] ||= []);
    const same = l.find(x => x.qid === r.qid && x.start?.date === r.start?.date);
    if (same) {
      if (!same.coords && r.coords) same.coords = r.coords;
      if (r.head) same.head = true;
      for (const j of r.jurs || []) if (!same.jurs!.some(x => x.qid === j.qid)) same.jurs!.push(j); else if (j.coords) same.jurs!.find(x => x.qid === j.qid)!.coords ||= j.coords;
      return;
    }
    l.push(r);
  };
  for (const r of rows) {
    const coords = parsePoint(r.coord) || undefined;
    switch (r.k) {
      case "birth": case "death": case "start": case "end": case "inception": case "dissolved": case "date": {
        const d = parseTime(r.v, r.prec);
        const prev = f.dates[r.k];
        if (d && (!prev || precRank(d.precision) > precRank(prev.precision))) f.dates[r.k] = d;
        break;
      }
      case "coord": if (coords) f.coord = coords; break;
      case "capital": if (coords && !f.capital) f.capital = coords; break;
      case "birthplace": case "deathplace": case "location":
        if (coords && !f.places[r.k]) f.places[r.k] = { qid: r.o, label: r.oLabel, coords };
        break;
      case "position":
        push("position", {
          qid: r.o, label: r.oLabel, start: parseTime(r.s) || undefined, end: parseTime(r.e2) || undefined,
          jurs: r.j ? [{ qid: r.j, label: r.jLabel, coords }] : [],
          head: !!r.hc, sl: +(r.osl || 0)
        });
        break;
      case "residence": case "education": case "work": case "head": case "significant":
        push(r.k, { qid: r.o, label: r.oLabel, coords, start: parseTime(r.s) || undefined, end: parseTime(r.e2) || undefined });
        break;
      case "citizenship": case "country": case "predecessor": case "successor": case "participant": case "partof": case "winner":
        push(r.k, { qid: r.o, label: r.oLabel, coords });
        break;
      case "desc": f.description = r.v; break;
      case "label": labels[r.prec] = r.v; break;
      case "wiki": f.wiki = r.v; break;
      case "sitelinks": f.sitelinks = +r.v; break;
    }
  }
  f.label = labels[lang] || labels.fr || labels.en || labels.mul || qid;
  return f;
}
const precRank = (p: Precision) => ["1e5y", "1e4y", "millennium", "century", "decade", "year", "month", "day"].indexOf(p);

// ---------------------------------------------------------------------------
// Événements datés et localisés
// ---------------------------------------------------------------------------
interface RawEvent extends EventSpec { sitelinks: number }

/** Événements liés à des entités (participants, signataires) ou faisant partie de guerres données. */
function eventsAnchor(participants: string[], wars: string[]): string {
  const parts = participants.map(q => `{ ?e wdt:P710 wd:${q} }`);
  participants.forEach(q => parts.push(`{ ?e wdt:P1891 wd:${q} }`));
  if (wars.length) parts.push(`{ VALUES ?war { ${wars.map(q => "wd:" + q).join(" ")} } ?e wdt:P361+ ?war }`);
  return parts.join(" UNION ");
}

/**
 * Événements datés et localisés liés à un « ancrage » SPARQL (variable ?e).
 * Requête volontairement légère (pas d'étiquettes, pas de regroupement) ; les libellés sont
 * ensuite demandés à l'API Wikidata pour les seuls événements retenus.
 */
async function fetchEvents(anchor: string, fromY: number, toY: number, lang: string, limit = 150): Promise<RawEvent[]> {
  const q = `
SELECT ?e ?cls ?d ?p ?de ?c0 ?pl ?c1 ?sl WHERE {
  ${anchor}
  ?e wdt:P31 ?cls .
  ?e p:P585|p:P580 ?ds . ?ds psv:P585|psv:P580 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
  FILTER(?d >= ${xsd(fromY)} && ?d <= ${xsd(toY, true)})
  OPTIONAL { ?e wdt:P582 ?de . }
  OPTIONAL { ?e wdt:P625 ?c0 . }
  OPTIONAL { ?e wdt:P276 ?pl . OPTIONAL { ?pl wdt:P625 ?c1 . } }
  ?e wikibase:sitelinks ?sl .
} LIMIT 5000`;
  const rows = await sparql(q);
  const byId = new Map<string, RawEvent & { _pl?: string }>();
  for (const r of rows) {
    const cls = EVENT_CLASSES[r.cls];
    if (!cls) continue;
    const coords = parsePoint(r.c0) || parsePoint(r.c1);
    const start = parseTime(r.d, r.p);
    if (!coords || !start) continue;
    const prev = byId.get(r.e);
    if (prev) { if (!prev.subtype && cls.subtype) { prev.subtype = cls.subtype; prev.category = cls.cat; } continue; }
    const ev: RawEvent & { _pl?: string } = {
      qid: r.e, title: r.e, summary: "", category: cls.cat, subtype: cls.subtype,
      date: start.date, precision: coarse(start),
      coords, place: "", placePrecision: r.c0 ? "exact" : "city",
      sitelinks: +r.sl || 0, _pl: r.pl
    };
    const end = parseTime(r.de);
    if (end && parseDate(end.date).t > parseDate(start.date).t) ev.end = end.date;
    byId.set(r.e, ev);
  }
  const kept = [...byId.values()].sort((a, b) => b.sitelinks - a.sitelinks).slice(0, limit);
  const info = await getEntities([...kept.map(e => e.qid!), ...kept.map(e => e._pl!).filter(Boolean)], lang);
  return kept.map(({ _pl, ...e }) => ({
    ...e,
    title: info[e.qid!]?.label || e.qid!,
    summary: info[e.qid!]?.description || "",
    wiki: info[e.qid!]?.frwiki,
    place: (_pl && info[_pl]?.label) || ""
  }));
}

interface War { qid: string; label: string; start: DateV; end?: DateV; sl: number; participants: Map<string, Ref> }

/** Guerres liées à une entité (périodes de la frise + belligérants). L'ancrage lie la variable ?w. */
async function fetchWars(anchor: string, exclude: string[], fromY: number, toY: number, lang: string): Promise<War[]> {
  const rows = await sparql(`
SELECT ?w ?cls ?s ?e ?sl WHERE {
  ${anchor}
  ?w wdt:P580 ?s .
  FILTER(?s <= ${xsd(toY, true)})
  OPTIONAL { ?w wdt:P582 ?e . }
  FILTER(?s >= ${xsd(fromY)} || (BOUND(?e) && ?e >= ${xsd(fromY)}))
  ?w wdt:P31 ?cls .
  ?w wikibase:sitelinks ?sl .
}`);
  const wars = new Map<string, War>();
  for (const r of rows) {
    if (!WAR_CLASSES.has(r.cls) || wars.has(r.w)) continue;
    const start = parseTime(r.s);
    if (!start) continue;
    wars.set(r.w, { qid: r.w, label: r.w, start, end: parseTime(r.e) || undefined, sl: +r.sl, participants: new Map() });
  }
  const top = [...wars.values()].sort((a, b) => b.sl - a.sl).slice(0, 25);
  if (!top.length) return [];
  const parts = await sparql(`SELECT ?w ?p ?pc WHERE { VALUES ?w { ${top.map(w => "wd:" + w.qid).join(" ")} } ?w wdt:P710 ?p . ?p wdt:P36/wdt:P625 ?pc . FILTER(?p NOT IN (${exclude.map(q => "wd:" + q).join(", ")})) }`);
  for (const r of parts) {
    const w = wars.get(r.w), pc = parsePoint(r.pc);
    if (w && pc && !w.participants.has(r.p)) w.participants.set(r.p, { qid: r.p, label: r.p, coords: pc });
  }
  const ids = top.flatMap(w => [w.qid, ...w.participants.keys()]);
  const info = await getEntities(ids, lang);
  for (const w of top) {
    w.label = info[w.qid]?.label || w.qid;
    for (const p of w.participants.values()) p.label = info[p.qid]?.label || p.qid;
  }
  return top;
}

// ---------------------------------------------------------------------------
// Assemblage
// ---------------------------------------------------------------------------
/** Importance relative (rang dans le sujet) : le premier décile est toujours visible. */
function rankImportance(evs: RawEvent[]): EventSpec[] {
  const sorted = [...evs].sort((a, b) => b.sitelinks - a.sitelinks);
  const n = sorted.length;
  sorted.forEach((e, i) => {
    if (e.importance !== undefined) return;
    const q = n <= 1 ? 0 : i / (n - 1);
    e.importance = q < 0.1 ? 90 : q < 0.35 ? 65 : q < 0.7 ? 45 : 30;
  });
  return sorted.map(({ sitelinks: _s, ...e }) => e);
}

function bboxOf(points: Pt[]): [number, number, number, number] | undefined {
  if (!points.length) return undefined;
  // Écarte les points isolés (12 % de chaque côté) quand il y en a beaucoup
  const xs = points.map(p => p[0]).sort((a, b) => a - b), ys = points.map(p => p[1]).sort((a, b) => a - b);
  const cut = points.length > 12 ? Math.floor(points.length * 0.12) : 0;
  const w = xs[cut], e = xs[xs.length - 1 - cut], s = ys[cut], n = ys[ys.length - 1 - cut];
  const padX = Math.max(0.05, (e - w) * 0.1), padY = Math.max(0.05, (n - s) * 0.1);
  return [w - padX, s - padY, e + padX, n + padY];
}
function viewFromBbox(b?: [number, number, number, number]): { center: Pt; zoom: number } {
  if (!b) return { center: [10, 30], zoom: 1.6 };
  const span = Math.max(b[2] - b[0], (b[3] - b[1]) * 1.4, 0.02);
  return { center: [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2], zoom: Math.max(1.4, Math.min(11, Math.log2(360 / span) - 0.3)) };
}

function personEvents(f: Facts): RawEvent[] {
  const out: RawEvent[] = [];
  const b = f.dates.birth, d = f.dates.death, bp = f.places.birthplace, dp = f.places.deathplace;
  if (b && bp?.coords) out.push({ qid: f.qid, title: `Naissance — ${f.label}`, category: "personnage", date: b.date, precision: coarse(b), coords: bp.coords, place: bp.label, importance: 90, sitelinks: 0, wiki: f.wiki });
  if (d && dp?.coords) out.push({ qid: f.qid, title: `Mort — ${f.label}`, category: "personnage", date: d.date, precision: coarse(d), coords: dp.coords, place: dp.label, importance: 90, sitelinks: 0, wiki: f.wiki });
  for (const s of f.lists.significant || []) {
    if (!s.start || !s.coords) continue;
    out.push({ qid: s.qid, title: s.label, category: "politique", date: s.start.date, coords: s.coords, place: "", importance: 80, sitelinks: 0 });
  }
  return out;
}
const coarse = (d: DateV): Precision | undefined => (["year", "month", "day"].includes(d.precision) ? undefined : d.precision);

function personPath(f: Facts): PathSpec | undefined {
  const steps: PathSpec["steps"] = [];
  const bp = f.places.birthplace, dp = f.places.deathplace;
  if (f.dates.birth && bp?.coords) steps.push({ date: f.dates.birth.date, coords: bp.coords, label: bp.label });
  for (const k of ["residence", "education", "work"]) {
    for (const r of f.lists[k] || []) if (r.start && r.coords) steps.push({ date: r.start.date, coords: r.coords, label: r.label });
  }
  if (f.dates.death && dp?.coords) steps.push({ date: f.dates.death.date, coords: dp.coords, label: dp.label });
  steps.sort((a, b) => parseDate(a.date).t - parseDate(b.date).t);
  return steps.length >= 2 ? { label: f.label, color: "#2563eb", steps } : undefined;
}

function belligerentActors(wars: War[], winners: Set<string> = new Set()): ActorSpec[] {
  const byQid = new Map<string, ActorSpec>();
  for (const w of wars) {
    const a0 = yearOf(w.start)!, a1 = yearOf(w.end) ?? a0;
    for (const p of w.participants.values()) {
      let act = byQid.get(p.qid);
      if (!act) {
        if (byQid.size >= RIVAL_COLORS.length) continue;
        act = { role: "rival", label: p.label + (winners.has(p.qid) ? " (vainqueur)" : ""), color: RIVAL_COLORS[byQid.size], match: [], points: [p.coords!], when: [], qid: p.qid };
        byQid.set(p.qid, act);
      }
      act.when!.push([a0, a1]);
    }
  }
  return [...byQid.values()];
}

function yearsLabel(a?: number, b?: number): string {
  if (a === undefined) return "";
  if (b === undefined || a === b) return fmtYearHist(a);
  return `${fmtYearHist(a)} – ${fmtYearHist(b)}`;
}

function finish(spec: Omit<ScenarioSpec, "view" | "range" | "start" | "subtitle"> & { from?: DateV; to?: DateV; extraPoints?: Pt[] }): ScenarioSpec {
  const events = spec.events;
  const ts = events.map(e => parseDate(e.date).t);
  const fromT = spec.from ? tOf(spec.from) : Math.min(...ts);
  const toT0 = spec.to ? tOf(spec.to) : Math.max(...ts);
  if (!Number.isFinite(fromT) || !Number.isFinite(toT0)) throw new Error("Aucune date exploitable pour ce sujet.");
  const toT = Math.max(toT0, fromT + 1 / 365);
  const pad = Math.max((toT - fromT) * 0.03, 1 / 365);
  const fromY = fromT0Y(fromT - pad), toY = fromT0Y(toT + pad);
  // Cadrage : autour du sujet (capitale…) si la plupart des événements en sont proches
  const focus = spec.actors.find(a => a.role === "focus")?.points?.[0];
  let pts = events.map(e => e.coords);
  if (focus) {
    const near = pts.filter(p => distKm(p, focus) < 2200);
    if (near.length >= pts.length * 0.5) pts = near;
  }
  const bbox = bboxOf([...pts, ...(spec.extraPoints || [])]);
  const { from: _f, to: _t, extraPoints: _p, ...rest } = spec;
  return {
    ...rest,
    subtitle: yearsLabel(fromT0Y(fromT), fromT0Y(toT)),
    range: [fromY, toY],
    start: spec.from ? spec.from.date : fromY,
    view: viewFromBbox(bbox),
    bbox,
    kind: "generated"
  };
}
const fromT0Y = (t: number) => fromT(t).Y;
function distKm(a: Pt, b: Pt): number {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b[1] - a[1]) * rad, dLon = (b[0] - a[0]) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[1] * rad) * Math.cos(b[1] * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// ---------------------------------------------------------------------------
// Recettes
// ---------------------------------------------------------------------------
async function recipePerson(f: Facts, lang: string): Promise<ScenarioSpec> {
  const by = yearOf(f.dates.birth), dy = yearOf(f.dates.death) ?? new Date().getFullYear();
  // Fonction de souverain : monarque ou chef d'État, avec juridiction localisée. Priorité à la
  // fonction citée dans la description, puis à la plus longue, puis à la plus notoire.
  const span = (p: Ref) => (yearOf(p.end) ?? dy) - yearOf(p.start)!;
  const positions = (f.lists.position || []).filter(p => p.head && p.start && p.jurs!.some(j => j.coords));
  const desc = f.description.toLowerCase();
  const score = (p: Ref) => (desc.includes(p.label.toLowerCase()) ? 1e6 : 0) + span(p) * 100 + (p.sl || 0);
  positions.sort((a, b) => score(b) - score(a));
  const reign = positions[0];
  const notes: string[] = [];
  const actors: ActorSpec[] = [];
  const periods: PeriodSpec[] = [];
  let events: RawEvent[] = personEvents(f);
  let from: DateV | undefined = f.dates.birth, to: DateV | undefined = f.dates.death;

  for (const p of f.lists.position || []) {
    if (p.start) periods.push({ from: p.start.date, to: (p.end || p.start).date, label: p.label, color: "#1d4ed8" });
  }
  if (reign) {
    const realms = reign.jurs!.filter(j => j.coords);
    actors.push({ role: "focus", label: realms.map(j => j.label).join(" / "), color: "#2563eb", match: [], points: realms.map(j => j.coords!), qid: realms[0].qid });
    const r0 = yearOf(reign.start)!, r1 = yearOf(reign.end) ?? dy;
    // D'abord les guerres du royaume pendant le règne (requête rapide), puis leurs batailles.
    const warAnchor = [...realms.map(j => `{ ?w wdt:P710 wd:${j.qid} }`), `{ wd:${f.qid} wdt:P607 ?w }`].join(" UNION ");
    const wars = await fetchWars(warAnchor, realms.map(j => j.qid), r0, r1, lang);
    const evs = await fetchEvents(eventsAnchor([...realms.map(j => j.qid), f.qid], wars.map(w => w.qid)), r0, r1, lang);
    events = events.concat(evs);
    wars.forEach(w => periods.push({ from: w.start.date, to: (w.end || w.start).date, label: w.label, color: "#b91c1c" }));
    actors.push(...belligerentActors(wars));
    if (wars.length) notes.push("Wikidata ne précise pas les camps : les autres belligérants des guerres du règne sont tous colorés comme adversaires potentiels.");
    from = reign.start; to = reign.end || to;
  } else {
    const country = (f.lists.citizenship || []).find(c => c.coords);
    if (country) actors.push({ role: "focus", label: country.label, color: "#2563eb", match: [], points: [country.coords!], qid: country.qid });
    if (by !== undefined) {
      const anchor = `{ ?e wdt:P710 wd:${f.qid} } UNION { wd:${f.qid} wdt:P1344 ?e } UNION { wd:${f.qid} wdt:P607 ?w0 . ?e wdt:P361+ ?w0 }`;
      events = events.concat(await fetchEvents(anchor, by, dy, lang, 80));
    }
  }
  const path = personPath(f);
  if (!events.length && !path) throw new Error("Pas assez de données datées et localisées dans Wikidata pour cette personne.");
  return finish({
    id: "wd:" + f.qid, qid: f.qid, title: f.label,
    description: f.description,
    actors, periods, events: rankImportance(events), paths: path ? [path] : [], notes,
    from, to, extraPoints: path ? path.steps.map(s => s.coords) : []
  });
}

async function recipeWar(f: Facts, lang: string, focusEvent?: Facts): Promise<ScenarioSpec> {
  const start = f.dates.start || f.dates.date || f.dates.inception;
  const end = f.dates.end || f.dates.dissolved || start;
  const y0 = yearOf(start), y1 = yearOf(end);
  if (y0 === undefined || y1 === undefined) throw new Error("Cette guerre n'a pas de dates dans Wikidata.");
  const anchor = `{ ?e wdt:P361+ wd:${f.qid} } UNION { BIND(wd:${f.qid} AS ?e) }`;
  const [evs, subs] = await Promise.all([
    fetchEvents(anchor, y0, y1, lang, 200),
    sparql(`SELECT ?w ?wLabel ?s ?e WHERE { ?w wdt:P361 wd:${f.qid} ; wdt:P580 ?s . OPTIONAL { ?w wdt:P582 ?e . } SERVICE wikibase:label { bd:serviceParam wikibase:language ${LANG_PARAM(lang)} . } } LIMIT 40`)
  ]);
  const winners = new Set((f.lists.winner || []).map(w => w.qid));
  const participants = (f.lists.participant || []).filter(p => p.coords);
  const fakeWar = [{ qid: f.qid, label: f.label, start: start!, end, sl: 0, participants: new Map(participants.map(p => [p.qid, p])) }];
  const actors = belligerentActors(fakeWar, winners).map(a => ({ ...a, when: undefined }));
  // Périodes : les sous-conflits d'au moins deux mois (les plus longs d'abord, 12 au plus)
  const periods: PeriodSpec[] = subs
    .map((r: Binding) => ({ s: parseTime(r.s), e: parseTime(r.e), label: r.wLabel }))
    .filter(x => x.s && x.e && tOf(x.e) - tOf(x.s) >= 2 / 12)
    .sort((a, b) => (tOf(b.e!) - tOf(b.s!)) - (tOf(a.e!) - tOf(a.s!)))
    .slice(0, 12)
    .map(x => ({ from: x.s!.date, to: x.e!.date, label: x.label, color: "#b91c1c" }));
  const events = rankImportance(evs);
  if (!events.length) throw new Error("Aucune bataille datée et localisée n'est rattachée à ce conflit dans Wikidata.");
  const notes = participants.length ? ["Wikidata ne précise pas les camps : chaque belligérant a sa couleur."] : [];
  return finish({
    id: "wd:" + (focusEvent?.qid || f.qid), qid: focusEvent?.qid || f.qid,
    title: focusEvent ? `${focusEvent.label} (${f.label})` : f.label,
    description: focusEvent?.description || f.description,
    actors, periods, events, notes,
    from: focusEvent ? (focusEvent.dates.date || focusEvent.dates.start) : start,
    to: end,
    extraPoints: focusEvent?.coord ? [focusEvent.coord] : []
  });
}

async function recipeState(f: Facts, lang: string): Promise<ScenarioSpec> {
  const start = f.dates.inception || f.dates.start;
  const end = f.dates.dissolved || f.dates.end;
  const y0 = yearOf(start), y1 = yearOf(end) ?? new Date().getFullYear();
  if (y0 === undefined) throw new Error("Cet État n'a pas de date de création dans Wikidata.");
  const actors: ActorSpec[] = [];
  if (f.capital) actors.push({ role: "focus", label: f.label, color: "#2563eb", match: [], points: [f.capital], qid: f.qid });
  for (const k of ["predecessor", "successor"]) {
    for (const r of (f.lists[k] || []).filter(x => x.coords).slice(0, 2)) {
      actors.push({ role: "context", label: `${r.label} (${k === "predecessor" ? "prédécesseur" : "successeur"})`, color: k === "predecessor" ? "#8d6e63" : "#64748b", match: [], points: [r.coords!], qid: r.qid });
    }
  }
  const wars = await fetchWars(`?w wdt:P710 wd:${f.qid} .`, [f.qid], y0, y1, lang);
  const evs = await fetchEvents(eventsAnchor([f.qid], wars.map(w => w.qid)), y0, y1, lang, 200);
  actors.push(...belligerentActors(wars));
  const periods: PeriodSpec[] = (f.lists.head || []).filter(h => h.start)
    .map(h => ({ from: h.start!.date, to: (h.end || h.start)!.date, label: h.label, color: "#1d4ed8" }));
  wars.forEach(w => periods.push({ from: w.start.date, to: (w.end || w.start).date, label: w.label, color: "#b91c1c" }));
  const notes = wars.length ? ["Wikidata ne précise pas les camps : les belligérants des guerres sont tous colorés comme adversaires potentiels."] : [];
  if (!evs.length) notes.push("Aucun événement daté et localisé trouvé : seules les frontières et les périodes sont affichées.");
  return finish({
    id: "wd:" + f.qid, qid: f.qid, title: f.label, description: f.description,
    actors, periods, events: rankImportance(evs), notes,
    from: start, to: end || { date: String(y1), precision: "year" },
    extraPoints: f.capital ? [f.capital] : []
  });
}

async function recipePlace(f: Facts, lang: string): Promise<ScenarioSpec> {
  const c = f.coord;
  if (!c) throw new Error("Ce lieu n'a pas de coordonnées dans Wikidata.");
  const anchor = `SERVICE wikibase:around { ?e wdt:P625 ?c0 . bd:serviceParam wikibase:center "Point(${c[0]} ${c[1]})"^^geo:wktLiteral ; wikibase:radius "30" . }`;
  const evs = await fetchEvents(anchor, -5000, new Date().getFullYear(), lang, 120);
  if (!evs.length) throw new Error("Aucun événement daté n'a été trouvé autour de ce lieu.");
  const spec = finish({
    id: "wd:" + f.qid, qid: f.qid, title: `${f.label} : histoire du lieu`, description: f.description,
    actors: [], periods: [], events: rankImportance(evs), notes: [], extraPoints: [c]
  });
  spec.view = { center: c, zoom: 9 };
  spec.bbox = undefined;
  return spec;
}

// ---------------------------------------------------------------------------
// Point d'entrée
// ---------------------------------------------------------------------------
export interface GenerateProgress { (step: string): void }

export async function generate(qid: string, lang: string, progress: GenerateProgress = () => {}): Promise<ScenarioSpec> {
  progress("type");
  const [kind, facts] = await Promise.all([detectKind(qid), fetchFacts(qid, lang)]);
  progress(kind);
  let spec: ScenarioSpec;
  switch (kind) {
    case "person": spec = await recipePerson(facts, lang); break;
    case "war": spec = await recipeWar(facts, lang); break;
    case "event": {
      // Une bataille seule donne un sujet pauvre : on remonte jusqu'à deux niveaux de conflits parents
      // (campagne, puis guerre) et on retient le premier qui contient au moins 3 événements.
      let cur = facts;
      let best: ScenarioSpec | null = null;
      for (let level = 0; level < 2; level++) {
        const parent = (cur.lists.partof || [])[0];
        if (!parent) break;
        progress("parent");
        cur = await fetchFacts(parent.qid, lang);
        try {
          const cand = await recipeWar(cur, lang, facts);
          if (!best || cand.events.length > best.events.length) best = cand;
          if (cand.events.length >= 3) break;
        } catch { /* parent sans dates : on continue de remonter */ }
      }
      spec = best || await recipeWar(facts, lang);
      break;
    }
    case "state": spec = await recipeState(facts, lang); break;
    case "place": spec = await recipePlace(facts, lang); break;
    default:
      if (facts.coord) { spec = await recipePlace(facts, lang); break; }
      throw new Error("Type de sujet non pris en charge pour l'instant (essayez une personne, une guerre, une bataille, un État ou un lieu).");
  }
  spec.description = [spec.description, `Sujet généré automatiquement depuis Wikidata (${spec.events.length} événements). Les données peuvent être incomplètes.`]
    .filter(Boolean).join(" — ");
  return spec;
}
