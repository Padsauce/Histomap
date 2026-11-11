#!/usr/bin/env node
/*
 * Construit l'« index mondial léger » d'Histomap (F-72) à partir de Wikidata.
 *
 * On n'y stocke que le strict nécessaire pour la vue « Pendant ce temps » : identifiant, position,
 * dates, précision, catégorie, notoriété (nombre d'articles Wikipédia). Les libellés et les textes
 * restent chargés en direct, dans la langue de l'utilisateur.
 *
 * Sortie : public/index/manifest.json + un fichier par tranche de temps (chargé à la demande).
 * Format d'un enregistrement (tableau compact) :
 *   [qid (nombre), lon, lat, t0, t1, précision, catégorie, notoriété, sorte, précisionLieu]
 *   t0/t1 en années astronomiques décimales (1 av. J.-C. = 0) ; sorte : 0 événement, 1 naissance,
 *   2 fondation/création, 3 fin/dissolution ; précisionLieu : 0 exact, 1 ville, 2 pays.
 *
 * Usage : node tools/build-index.mjs [--out public/index] [--only clé,clé]
 * Respecte les règles d'usage de Wikidata : requêtes en série, User-Agent identifié, réessais espacés.
 */
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const OUT = args.includes("--out") ? args[args.indexOf("--out") + 1] : "public/index";
const ONLY = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const UA = "Histomap/0.3 (https://github.com/Padsauce/Histomap; index builder)";
// QLever (Université de Fribourg) répond en quelques secondes aux requêtes globales qui dépassent
// le délai du service public de Wikidata ; ce dernier sert de repli.
const ENDPOINTS = ["https://qlever.dev/api/wikidata", "https://query.wikidata.org/sparql"];
const PREFIXES = `PREFIX wd: <http://www.wikidata.org/entity/>
PREFIX wdt: <http://www.wikidata.org/prop/direct/>
PREFIX p: <http://www.wikidata.org/prop/>
PREFIX psv: <http://www.wikidata.org/prop/statement/value/>
PREFIX wikibase: <http://wikiba.se/ontology#>
PREFIX xsd: <http://www.w3.org/2001/XMLSchema#>
`;

export const CATEGORIES = ["conflit", "traite", "politique", "personnage", "decouverte", "culture", "religion", "exploration", "migration", "ville", "catastrophe", "science"];
const PRECISIONS = { 11: 0, 10: 1, 9: 2, 8: 3, 7: 4, 6: 5, 5: 6, 4: 7 }; // jour, mois, année, décennie, siècle, millénaire, 1e4, 1e5
const PRECISION_YEARS = [1 / 365.2425, 1 / 12, 1, 10, 100, 1000, 1e4, 1e5];

// Coordonnées : propres, sinon lieu (P276), sinon capitale du pays (P17) — avec la précision du lieu
const COORDS = (v = "?e") => `
  OPTIONAL { ${v} wdt:P625 ?c0 . }
  OPTIONAL { ${v} wdt:P276/wdt:P625 ?c1 . }
  OPTIONAL { ${v} wdt:P17/wdt:P36/wdt:P625 ?c2 . }`;

/** Familles d'éléments indexés. */
const QUERIES = [
  {
    key: "battles", cat: "conflit", kind: 0,
    q: `SELECT ?e ?d ?p ?c0 ?c1 ?c2 ?sl ?de WHERE {
      VALUES ?cls { wd:Q178561 wd:Q188055 wd:Q1261499 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 10)
      ?e p:P585|p:P580 ?ds . ?ds psv:P585|psv:P580 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      OPTIONAL { ?e wdt:P582 ?de . }
      ${COORDS()} }`
  },
  {
    key: "treaties", cat: "traite", kind: 0,
    q: `SELECT ?e ?d ?p ?c0 ?c1 ?c2 ?sl WHERE {
      VALUES ?cls { wd:Q131569 wd:Q625298 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 8)
      ?e p:P585|p:P571 ?ds . ?ds psv:P585|psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ${COORDS()} }`
  },
  {
    key: "revolutions", cat: "politique", kind: 0,
    q: `SELECT ?e ?d ?p ?c0 ?c1 ?c2 ?sl ?de WHERE {
      VALUES ?cls { wd:Q10931 wd:Q45382 wd:Q124734 wd:Q209715 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 8)
      ?e p:P585|p:P580 ?ds . ?ds psv:P585|psv:P580 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      OPTIONAL { ?e wdt:P582 ?de . }
      ${COORDS()} }`
  },
  {
    key: "states-start", cat: "politique", kind: 2,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      ?e wdt:P31 wd:Q3024240 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)
      ?e p:P571/psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P36/wdt:P625 ?c0 . }`
  },
  {
    key: "states-end", cat: "politique", kind: 3,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      ?e wdt:P31 wd:Q3024240 ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)
      ?e p:P576/psv:P576 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P36/wdt:P625 ?c0 . }`
  },
  {
    key: "births", cat: "personnage", kind: 1,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      ?e wdt:P31 wd:Q5 ; wikibase:sitelinks ?sl . FILTER(?sl >= 60)
      ?e p:P569/psv:P569 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P19/wdt:P625 ?c0 . }`
  },
  {
    key: "discoveries", cat: "decouverte", kind: 0,
    // Inventions, éléments, phénomènes… localisés au lieu de travail du découvreur, sinon dans son pays.
    // Exclus : les lieux eux-mêmes (ils ont des coordonnées propres : continents, îles…) et les objets
    // astronomiques (astéroïdes, galaxies…), sauf les plus notables (planètes, grandes lunes).
    q: `SELECT ?e ?d ?p ?c1 ?c2 ?sl WHERE {
      ?e wdt:P575 [] ; wdt:P61 ?who ; wikibase:sitelinks ?sl . FILTER(?sl >= 20)
      FILTER NOT EXISTS { ?e wdt:P625 [] }
      OPTIONAL { ?e wdt:P31/wdt:P279* wd:Q6999 . BIND(1 AS ?astro) }
      FILTER(!BOUND(?astro) || ?sl >= 120)
      ?e p:P575/psv:P575 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      OPTIONAL { ?who wdt:P937/wdt:P625 ?c1 . }
      OPTIONAL { ?who wdt:P27/wdt:P36/wdt:P625 ?c2 . } }`
  },
  {
    key: "monuments", cat: "culture", kind: 2,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      VALUES ?cls { wd:Q23413 wd:Q16560 wd:Q12516 wd:Q12280 wd:Q4989906 wd:Q57821 wd:Q1081138 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)
      ?e p:P571/psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P625 ?c0 . }`
  },
  {
    key: "worship", cat: "religion", kind: 2,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      VALUES ?cls { wd:Q2977 wd:Q44539 wd:Q32815 wd:Q16970 wd:Q44613 wd:Q842402 wd:Q5393308 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 25)
      ?e p:P571/psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P625 ?c0 . }`
  },
  {
    key: "cities", cat: "ville", kind: 2,
    // Beaucoup de villes portent une date administrative récente : on ne garde que les fondations anciennes
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      ?e wdt:P31 wd:Q515 ; wikibase:sitelinks ?sl . FILTER(?sl >= 60)
      ?e p:P571/psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      FILTER(?d < "1500-01-01T00:00:00Z"^^xsd:dateTime)
      ?e wdt:P625 ?c0 . }`
  },
  {
    key: "science", cat: "science", kind: 2,
    q: `SELECT ?e ?d ?p ?c0 ?sl WHERE {
      VALUES ?cls { wd:Q3918 wd:Q62832 wd:Q414147 wd:Q33506 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 30)
      ?e p:P571/psv:P571 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      ?e wdt:P625 ?c0 . }`
  },
  {
    key: "disasters", cat: "catastrophe", kind: 0,
    q: `SELECT ?e ?d ?p ?c0 ?c1 ?c2 ?sl ?de WHERE {
      VALUES ?cls { wd:Q7944 wd:Q7692360 wd:Q44512 wd:Q12184 wd:Q168247 wd:Q8070 wd:Q8068 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 8)
      ?e p:P585|p:P580 ?ds . ?ds psv:P585|psv:P580 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      OPTIONAL { ?e wdt:P582 ?de . }
      ${COORDS()} }`
  },
  {
    key: "expeditions", cat: "exploration", kind: 0,
    q: `SELECT ?e ?d ?p ?c0 ?c1 ?c2 ?sl ?de WHERE {
      VALUES ?cls { wd:Q2401485 wd:Q1690211 }
      ?e wdt:P31 ?cls ; wikibase:sitelinks ?sl . FILTER(?sl >= 6)
      ?e p:P585|p:P580 ?ds . ?ds psv:P585|psv:P580 ?tv . ?tv wikibase:timeValue ?d ; wikibase:timePrecision ?p .
      OPTIONAL { ?e wdt:P582 ?de . }
      ${COORDS()} }`
  }
];

// ---------------------------------------------------------------------------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function sparql(query, label) {
  for (const endpoint of ENDPOINTS) {
    const host = new URL(endpoint).host;
    for (let attempt = 0; attempt < 4; attempt++) {
      const t0 = Date.now();
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "User-Agent": UA, Accept: "application/sparql-results+json", "Content-Type": "application/x-www-form-urlencoded" },
          body: "query=" + encodeURIComponent(PREFIXES + query)
        });
        if (res.ok) {
          const d = JSON.parse(await res.text()); // une réponse tronquée (délai dépassé) lève une erreur ici
          console.log(`  ${label}: ${d.results.bindings.length} lignes en ${((Date.now() - t0) / 1000).toFixed(1)} s (${host})`);
          return d.results.bindings;
        }
        const ra = res.headers.get("retry-after");
        const wait = Math.min(120, ra ? +ra : 10 * 2 ** attempt);
        console.log(`  ${label}: HTTP ${res.status} (${host}), nouvel essai dans ${wait} s`);
        if (res.status === 400) break; // requête refusée par ce moteur : on passe au suivant
        await sleep(wait * 1000);
      } catch (err) {
        console.log(`  ${label}: ${err.message.slice(0, 80)} (${host})`);
        await sleep(5000 * (attempt + 1));
      }
    }
  }
  throw new Error(`Échec de la requête ${label}`);
}

const point = s => { const m = s && /Point\(([-\d.eE]+) ([-\d.eE]+)\)/i.exec(s); return m ? [+m[1], +m[2]] : null; };
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];
const leap = A => ((A % 4 + 4) % 4 === 0 && (A % 100 + 100) % 100 !== 0) || (A % 400 + 400) % 400 === 0;
/** Valeur temporelle WDQS (numérotation astronomique) → année astronomique décimale. */
function toT(v) {
  const m = /^([+-]?\d+)-(\d{2})-(\d{2})/.exec(v || "");
  if (!m) return null;
  const A = parseInt(m[1], 10), mo = Math.max(1, +m[2]), d = Math.max(1, +m[3]);
  const n = leap(A) ? 366 : 365;
  return A + (CUM[mo - 1] + (leap(A) && mo > 2 ? 1 : 0) + d - 1) / n;
}
const round = (x, k) => Math.round(x * 10 ** k) / 10 ** k;

async function main() {
  const records = new Map(); // qid+sorte -> enregistrement (on garde la meilleure précision)
  const stats = {};
  for (const fam of QUERIES) {
    if (ONLY && !ONLY.includes(fam.key)) continue;
    const rows = await sparql(fam.q, fam.key);
    let kept = 0;
    for (const r of rows) {
      const qid = +r.e.value.split("/Q").pop();
      const c0 = point(r.c0?.value), c1 = point(r.c1?.value), c2 = point(r.c2?.value);
      const coords = c0 || c1 || c2;
      const t0 = toT(r.d?.value);
      if (!coords || t0 === null || !Number.isFinite(qid)) continue;
      const pcode = PRECISIONS[Math.max(4, Math.min(11, +r.p.value))];
      let t1 = t0 + PRECISION_YEARS[pcode];
      const te = toT(r.de?.value);
      if (te !== null && te > t0) t1 = Math.max(t1, te + 1 / 365.2425);
      const placePrec = c0 ? 0 : c1 ? 1 : 2;
      const key = qid + ":" + fam.kind;
      const prev = records.get(key);
      if (prev && prev[5] <= pcode && prev[9] <= placePrec) continue;
      records.set(key, [qid, round(coords[0], 3), round(coords[1], 3), round(t0, 4), round(t1, 4), pcode,
        CATEGORIES.indexOf(fam.cat), +r.sl.value, fam.kind, placePrec]);
      kept++;
    }
    stats[fam.key] = kept;
    await sleep(1500); // politesse envers les services publics
  }

  // Tranches de temps (années astronomiques) : larges dans le passé lointain, fines à l'époque moderne
  const edges = [-400000, -10000, -3000, -1000, -500, 0];
  for (let y = 100; y <= 1500; y += 100) edges.push(y);
  for (let y = 1550; y <= 1700; y += 50) edges.push(y);
  for (let y = 1725; y <= 2050; y += 25) edges.push(y);
  const buckets = edges.slice(0, -1).map((from, i) => ({ from, to: edges[i + 1], items: [] }));
  for (const rec of records.values()) {
    const b = buckets.find(x => rec[3] >= x.from && rec[3] < x.to);
    if (b) b.items.push(rec);
  }
  await mkdir(OUT, { recursive: true });
  const manifest = {
    version: 1,
    built: new Date().toISOString(),
    source: "Wikidata (CC0)",
    fields: ["qid", "lon", "lat", "t0", "t1", "precision", "category", "sitelinks", "kind", "placePrecision"],
    categories: CATEGORIES,
    stats,
    buckets: []
  };
  for (const b of buckets) {
    if (!b.items.length) continue;
    b.items.sort((x, y) => y[7] - x[7]);
    const file = `b${b.from}_${b.to}.json`;
    await writeFile(path.join(OUT, file), JSON.stringify(b.items));
    manifest.buckets.push({ from: b.from, to: b.to, file, count: b.items.length });
  }
  await writeFile(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 1));
  const total = manifest.buckets.reduce((s, b) => s + b.count, 0);
  console.log(`Index : ${total} éléments en ${manifest.buckets.length} tranches →`, OUT, stats);
}

// En cas d'échec (service indisponible), on conserve l'index déjà présent s'il existe.
main().catch(async err => {
  console.error(err.message);
  if (existsSync(path.join(OUT, "manifest.json"))) {
    const m = JSON.parse(await readFile(path.join(OUT, "manifest.json"), "utf8"));
    console.error(`Index existant conservé (construit le ${m.built}).`);
    process.exit(0);
  }
  process.exit(1);
});
