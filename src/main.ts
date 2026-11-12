/* Histomap — application principale */
import maplibregl, { type GeoJSONSource, type MapGeoJSONFeature } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./style.css";

import * as I18n from "./i18n";
import * as Time from "./core/time";
import * as Net from "./core/net";
import * as Wiki from "./core/wiki";
import { searchEntities, wdUrl, type SearchResult } from "./core/wikidata";
import { generate, fetchFacts } from "./core/generator";
import { Timeline, type TimelineEvent, type TimelineLane } from "./ui/timeline";
import * as World from "./core/worldindex";
import * as Borders from "./core/borders";
import { Morpher, CrossFade } from "./core/morph";
import { morphService, morphKey } from "./core/morphstore";
import { Teacher, worldToEvent } from "./ui/teacher";
import { CATEGORIES } from "./data/categories";
import { SCENARIOS as CURATED } from "./data/scenarios";
import type { Category, EventItem, Scenario, ScenarioSpec, ActorSpec } from "./core/types";

const t_ = I18n.t;
type Pt = [number, number];
type FC = GeoJSON.FeatureCollection;
type Feature = GeoJSON.Feature<GeoJSON.Geometry, Record<string, any>>;


const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c])) as Record<string, Category>;
const catLabel = (c: Category) => c.label[I18n.getLang()] || c.label.fr;
// Palette adaptée au daltonisme (Okabe-Ito) : une famille de teintes par rôle, une teinte par acteur
const CVD: Record<string, string[]> = {
  focus: ["#0072B2"],
  rival: ["#D55E00", "#E69F00", "#CC79A7", "#F0E442"],
  ally: ["#009E73", "#56B4E9"],
  context: ["#999999", "#CC79A7", "#E69F00"]
};

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------
const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const store = {
  get<T>(k: string, d: T): T { try { const v = localStorage.getItem("histomap." + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k: string, v: unknown) { try { localStorage.setItem("histomap." + k, JSON.stringify(v)); } catch { /* stockage indisponible ou plein */ } }
};
function hashColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, ${38 + (h >> 9) % 18}%, ${62 + (h >> 13) % 12}%)`;
}
function lighten(hex: string, amt = 0.45): string {
  const n = parseInt(hex.slice(1), 16);
  const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * amt));
  return `rgb(${c.join(",")})`;
}
const PRECISION_LEVEL: Record<string, Time.Level> = {
  "1e5y": "1e5y", "1e4y": "1e4y", millennium: "millennium", century: "century", decade: "decade",
  year: "year", month: "month", day: "day", hour: "minute", minute: "minute"
};
function eventDateLabel(e: EventItem): string {
  const a = Time.format(e.t0, PRECISION_LEVEL[e.precision] || "year", { circa: e.circa });
  if (!e.hasEnd) return a;
  const endT = e.t1 - Time.PRECISION_YEARS[e.endPrecision] * 0.5;
  const endLvl = PRECISION_LEVEL[e.endPrecision] || "year";
  const s0 = Time.fromT(e.t0), s1 = Time.fromT(endT);
  if (endLvl === "minute" && s0.Y === s1.Y && s0.mo === s1.mo && s0.d === s1.d) {
    return `${a} → ${String(s1.h).padStart(2, "0")}:${String(s1.mi).padStart(2, "0")}`;
  }
  return `${a} → ${Time.format(endT, endLvl, { circa: false })}`;
}

// Géométrie (coordonnées planes lon/lat : suffisant pour l'affichage)
function ringArea(r: number[][]): number {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
  return Math.abs(a / 2);
}
function polygons(geom: GeoJSON.Geometry | null): number[][][][] {
  if (!geom) return [];
  return geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
}
function pointInRing(pt: Pt, r: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function pointInPoly(pt: Pt, poly: number[][][]): boolean {
  if (!pointInRing(pt, poly[0])) return false;
  for (let k = 1; k < poly.length; k++) if (pointInRing(pt, poly[k])) return false;
  return true;
}
const pointInGeom = (pt: Pt, geom: GeoJSON.Geometry | null) => polygons(geom).some(p => pointInPoly(pt, p));
function bboxOf(geom: GeoJSON.Geometry | null): [number, number, number, number] {
  const b: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const p of polygons(geom)) for (const [x, y] of p[0]) {
    if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
  }
  return b;
}
function labelPoint(geom: GeoJSON.Geometry | null): { pt: Pt; area: number } | null {
  let best: number[][][] | null = null, bestA = -1;
  for (const p of polygons(geom)) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p; } }
  if (!best) return null;
  const ring = best[0];
  let cx = 0, cy = 0;
  for (const [x, y] of ring) { cx += x; cy += y; }
  cx /= ring.length; cy /= ring.length;
  if (pointInPoly([cx, cy], best)) return { pt: [cx, cy], area: bestA };
  const [x0, y0, x1, y1] = bboxOf({ type: "Polygon", coordinates: best });
  let cand: Pt | null = null, cd = Infinity;
  const N = 10;
  for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
    const p: Pt = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N];
    if (!pointInPoly(p, best)) continue;
    const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
    if (d < cd) { cd = d; cand = p; }
  }
  return { pt: cand || (ring[0] as Pt), area: bestA };
}

// ---------------------------------------------------------------------------
// Normalisation d'un sujet vers le modèle interne (temps en années décimales)
// ---------------------------------------------------------------------------
function normalize(sc: ScenarioSpec): Scenario {
  const events: EventItem[] = sc.events.map((e, idx) => {
    const iv = Time.interval(e);
    const cat = CAT[e.category] || CAT.politique;
    const ev = {
      ...e, idx, order: 0, ...iv, category: cat.id, color: cat.color, icon: cat.icon,
      importance: e.importance ?? 50, hasEnd: e.end !== undefined,
      endPrecision: e.end !== undefined ? Time.parse(e.end).precision : iv.precision, dateLabel: ""
    } as EventItem;
    ev.dateLabel = eventDateLabel(ev);
    return ev;
  }).sort((a, b) => a.t0 - b.t0);
  events.forEach((e, i) => (e.order = i));
  return {
    raw: sc,
    id: sc.id,
    bounds: [Time.parse(sc.range[0]).t, Time.endOf(sc.range[1])],
    startT: Time.parse(sc.start).t,
    actors: sc.actors.map(a => ({ ...a, whenT: a.when?.map(([x, y]) => [Time.parse(x).t, Time.endOf(y)] as [number, number]) })),
    periods: sc.periods.map(p => ({ ...p, t0: Time.parse(p.from).t, t1: Time.endOf(p.to) })),
    events,
    byIdx: Object.fromEntries(events.map(e => [e.idx, e])),
    paths: (sc.paths || []).map(p => ({
      label: p.label, color: p.color, kind: p.kind || "person",
      steps: p.steps.map(s => ({ t: Time.parse(s.date).t, coords: s.coords, label: s.label })).sort((a, b) => a.t - b.t)
    }))
  };
}

// Sujets éditorialisés + sujets générés mémorisés (les plus récents d'abord)
const MAX_GENERATED = 8;
const scenarios: Scenario[] = CURATED.map(normalize);
const generatedSpecs: ScenarioSpec[] = store.get<ScenarioSpec[]>("generated", []);
for (const g of generatedSpecs) { try { scenarios.push(normalize(g)); } catch { /* sujet mémorisé invalide */ } }

// ---------------------------------------------------------------------------
// État
// ---------------------------------------------------------------------------
const state = {
  sc: scenarios[0],
  t: scenarios[0].startT,
  view: scenarios[0].bounds as [number, number],
  frame: null as Borders.BordersFrame | null,
  bordersMode: store.get<Borders.BordersMode>("bordersMode", "fast"),
  dynamic: store.get("dynamicBorders", true),
  morph: null as null | { key: string; m: Morpher | CrossFade; tA: number; tB: number; nextYear: number; fallback: boolean },
  morphF: -1,
  labels: new Map<string, { name: string; pt: Pt; area: number; props: Record<string, any> }[]>(),
  decorated: null as FC | null,
  hiddenCats: new Set<string>(store.get<string[]>("hiddenCats", [])),
  showStates: true,
  cvd: store.get("cvd", false),
  playing: false,
  selected: null as null | { kind: "state"; name: string; id: number } | { kind: "event"; idx: number } | { kind: "world"; qid: string },
  showWorld: store.get("showWorld", true),
  lanesOn: store.get("lanes", false),
  worldAll: [] as World.WorldItem[],     // éléments de l'index mondial dans la fenêtre courante
  worldItems: [] as World.WorldItem[],   // sélection affichée (plafonnée par région)
  laneItems: [] as World.WorldItem[],
  worldSig: "",
  hoverId: null as number | null,
  inspectToken: 0,
  sig: { actors: "", labels: "", events: "", chrono: "", paths: "", decorated: "" },
  actorNames: new Map<string, string[]>() // cache : cadre de frontières + acteur -> noms d'États (acteurs localisés par point)
};

// ---------------------------------------------------------------------------
// Rôles et couleurs
// ---------------------------------------------------------------------------
type ActorN = Scenario["actors"][number];
function actorColor(a: ActorSpec): string {
  if (!state.cvd) return a.color;
  const pal = CVD[a.role] || CVD.context;
  const sameRole = [...new Set(state.sc.actors.filter(x => x.role === a.role).map(x => x.label))];
  return pal[Math.max(0, sameRole.indexOf(a.label)) % pal.length];
}
const activeActors = () => state.sc.actors.filter(a => !a.whenT || a.whenT.some(([x, y]) => state.t >= x && state.t < y));

/**
 * Noms d'États d'un acteur sur le cadre courant. Priorité : identifiants Wikidata (mode précis),
 * puis noms explicites, puis États contenant ses points (capitales…) — un point ne peut pas
 * revendiquer un État déjà rattaché à un autre acteur par identifiant ou par nom (ex. : Paris,
 * occupée par les Anglais en 1422, ne fait pas de l'Angleterre le « royaume de France »).
 */
const actorKey = (a: ActorN) => a.label + "|" + a.role;
/** Pour chaque État du cadre : les acteurs qui le revendiquent par identifiant ou par nom. */
function strongClaims(): Map<string, Set<string>> {
  const key = state.sc.id + "|" + state.frame!.key;
  const cached = strongCache.get(key);
  if (cached) return cached;
  const m = new Map<string, Set<string>>();
  for (const a of state.sc.actors) {
    if (a.preciseOnly && state.frame!.source !== "clio") continue;
    const qids = new Set([...(a.qids || []), ...(a.qid ? [a.qid] : [])]);
    for (const f of state.frame!.fc.features) {
      const p = f.properties || {};
      if ((p.QID && qids.has(p.QID)) || a.match.includes(p.NAME)) {
        if (!m.has(p.NAME)) m.set(p.NAME, new Set());
        m.get(p.NAME)!.add(actorKey(a));
      }
    }
  }
  strongCache.set(key, m);
  if (strongCache.size > 50) strongCache.delete(strongCache.keys().next().value!);
  return m;
}
const strongCache = new Map<string, Map<string, Set<string>>>();
function actorMatch(a: ActorN): string[] {
  if (a.preciseOnly && state.frame?.source !== "clio") return [];
  if (!state.frame) return a.match;
  const key = state.sc.id + "|" + state.frame.key + "|" + actorKey(a);
  let names = state.actorNames.get(key);
  if (!names) {
    const strong = strongClaims();
    const me = actorKey(a);
    names = [...strong.entries()].filter(([, acts]) => acts.has(me)).map(([n]) => n);
    for (const n of a.match) if (!names.includes(n)) names.push(n);
    for (const pt of a.points || []) {
      const f = state.frame.fc.features.find(ft => ft.properties?.NAME && pointInGeom(pt, ft.geometry));
      if (!f) continue;
      const owner = strong.get(f.properties!.NAME);
      if (owner && !owner.has(me)) continue;
      if (!names.includes(f.properties!.NAME)) names.push(f.properties!.NAME);
    }
    state.actorNames.set(key, names);
  }
  return names;
}
function roleOf(props: Record<string, any>) {
  const name = props.NAME || "";
  const suzerain = props.SUBJECTO || "";
  const acts = activeActors();
  for (const a of acts) if (actorMatch(a).includes(name)) return { role: a.role as string, color: actorColor(a), actor: a as ActorN | null };
  for (const a of acts) {
    if (suzerain && suzerain !== name && actorMatch(a).includes(suzerain)) return { role: a.role + "-sub", color: lighten(actorColor(a)), actor: a as ActorN | null };
  }
  return { role: "other", color: name ? hashColor(name) : "#cccccc", actor: null as ActorN | null };
}

function decorate(fc: FC): FC {
  return {
    type: "FeatureCollection",
    features: fc.features.map((f, i) => {
      const r = roleOf(f.properties || {});
      return { type: "Feature", id: i, geometry: f.geometry, properties: { ...f.properties, _role: r.role, _color: r.color } };
    })
  };
}

function labelPoints(frame: Borders.BordersFrame) {
  const snap = frame.key;
  if (state.labels.has(snap)) return state.labels.get(snap)!;
  const byName = new Map<string, { pt: Pt; area: number; props: Record<string, any> }>();
  frame.fc.features.forEach(f => {
    const name = f.properties?.NAME;
    if (!name) return;
    const lp = labelPoint(f.geometry);
    if (!lp) return;
    const prev = byName.get(name);
    if (!prev || lp.area > prev.area) byName.set(name, { ...lp, props: f.properties! });
  });
  const pts = [...byName.entries()].map(([name, lp]) => ({ name, ...lp }));
  state.labels.set(snap, pts);
  return pts;
}
/** Nom affiché d'un État : nom Wikidata dans la langue de l'interface (mode précis), sinon dictionnaire d'époque. */
function stateLabel(props: Record<string, any>, year: number): string {
  if (props.QID) return World.labelOf(props.QID)?.label || props.NAME;
  const ent = Wiki.resolveEntity(props.NAME, year);
  return ent ? ent.label : props.NAME;
}
function labelCollection(frame: Borders.BordersFrame): FC {
  const year = Time.histYear(state.t);
  const pts = labelPoints(frame);
  // Mode précis : libellés Wikidata chargés à la demande, puis réaffichés
  const missing = pts.map(l => l.props.QID).filter((q: string) => q && !World.labelOf(q));
  if (missing.length) World.loadLabels(missing, I18n.getLang()).then(() => { if (state.frame === frame) refreshLabels(true); });
  return {
    type: "FeatureCollection",
    features: pts.map(l => {
      const r = roleOf(l.props);
      const label = stateLabel(l.props, year);
      return {
        type: "Feature",
        geometry: { type: "Point", coordinates: l.pt },
        properties: { label, sort: (r.role === "other" ? 0 : 1e6) + l.area, important: r.role === "other" ? 0 : 1 }
      };
    })
  };
}

// ---------------------------------------------------------------------------
// Événements : visibilité temporelle + niveau de détail (F-01)
// ---------------------------------------------------------------------------
// Seuil d'importance relatif au cadrage du sujet : au zoom prévu, presque tout est visible ;
// chaque niveau de zoom en arrière masque les éléments les moins importants.
const LOD_BASE = 20, LOD_PER_ZOOM = 20;
function minImportance(): number {
  const dz = state.sc.raw.view.zoom - map.getZoom();
  return Math.max(0, Math.min(85, LOD_BASE + dz * LOD_PER_ZOOM));
}
function eventPhase(e: EventItem): "active" | "fading" | "past" | null {
  const linger = (state.view[1] - state.view[0]) * 0.04;
  if (state.t < e.t0) return null;
  if (state.t <= e.t1) return "active";
  if (state.t <= e.t1 + linger) return "fading";
  return $<HTMLInputElement>("opt-trail").checked ? "past" : null;
}
function visibleEvents() {
  const minImp = minImportance();
  const out: { e: EventItem; phase: string; opacity: number }[] = [];
  let hidden = 0;
  const linger = (state.view[1] - state.view[0]) * 0.04 || 1;
  for (const e of state.sc.events) {
    const phase = eventPhase(e);
    if (!phase || state.hiddenCats.has(e.category)) continue;
    if (e.importance < minImp) { hidden++; continue; }
    const opacity = phase === "active" ? 1 : phase === "fading" ? Math.max(0.35, 1 - (state.t - e.t1) / linger) : 0.35;
    out.push({ e, phase, opacity: Math.round(opacity * 10) / 10 });
  }
  return { list: out, hidden };
}

function refreshEvents(force = false): void {
  if (!map.getSource("events")) return;
  const { list, hidden } = visibleEvents();
  const sig = list.map(v => v.e.idx + v.phase + v.opacity).join("|");
  if (force || sig !== state.sig.events) {
    state.sig.events = sig;
    const fc: FC = {
      type: "FeatureCollection",
      features: list.map(({ e, phase, opacity }) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: e.coords },
        properties: { idx: e.idx, title: e.title, category: e.category, color: e.color, phase, opacity, size: phase === "past" ? 0.5 : 0.8 }
      }))
    };
    ["events", "events-text", "clusters-text"].forEach(id => (map.getSource(id) as GeoJSONSource).setData(fc));
  }
  const note = $("hidden-note");
  note.hidden = hidden === 0;
  note.textContent = t_("filters.hidden", { n: hidden });
  updateFilterCounts(list);
  updateChronoHighlight();
  refreshPaths();
  scheduleWorld();
}

/**
 * Trajets (F-32) et mouvements (F-31) : segments parcourus jusqu'à la date courante, flèches de
 * direction et « tête » interpolée entre deux étapes (elle avance pendant la lecture).
 */
function refreshPaths(): void {
  const src = map.getSource("paths") as GeoJSONSource | undefined;
  if (!src) return;
  const features: Feature[] = [];
  for (const p of state.sc.paths) {
    const steps = p.steps;
    if (!steps.length || state.t < steps[0].t) continue;
    // Un mouvement terminé s'efface (comme un événement passé), sauf si l'on garde la trace
    const linger = (state.view[1] - state.view[0]) * 0.04;
    if (p.kind !== "person" && state.t > steps[steps.length - 1].t + linger && !$<HTMLInputElement>("opt-trail").checked) continue;
    const done = steps.filter(s => s.t <= state.t);
    const next = steps[done.length];
    const coords = done.map(s => s.coords);
    let head = coords[coords.length - 1];
    if (next) {
      const prev = done[done.length - 1];
      const f = (state.t - prev.t) / Math.max(1e-9, next.t - prev.t);
      head = [prev.coords[0] + (next.coords[0] - prev.coords[0]) * f, prev.coords[1] + (next.coords[1] - prev.coords[1]) * f];
      coords.push(head);
    }
    const props = { color: p.color, ptype: p.kind, label: p.label };
    if (coords.length >= 2) features.push({ type: "Feature", geometry: { type: "LineString", coordinates: coords }, properties: { ...props, kind: "line" } });
    done.forEach(s => features.push({ type: "Feature", geometry: { type: "Point", coordinates: s.coords }, properties: { ...props, kind: "step", label: s.label, date: Time.format(s.t, PRECISION_LEVEL[Time.levelForSpan(state.view[1] - state.view[0])] || "year") } }));
    if (p.kind !== "person" && (next || state.t - steps[steps.length - 1].t < (state.view[1] - state.view[0]) * 0.004)) {
      features.push({ type: "Feature", geometry: { type: "Point", coordinates: head }, properties: { ...props, kind: "head", label: p.label, date: "" } });
    }
  }
  const sig = state.sc.id + ":" + features.map(f => f.geometry.type === "Point" ? (f.geometry as GeoJSON.Point).coordinates.map(x => x.toFixed(3)).join(",") : (f.geometry as GeoJSON.LineString).coordinates.length).join("|");
  if (sig === state.sig.paths) return;
  state.sig.paths = sig;
  src.setData({ type: "FeatureCollection", features });
}

// ---------------------------------------------------------------------------
// Carte
// ---------------------------------------------------------------------------
/*
 * Fond de carte : tuiles vectorielles OpenFreeMap (données OpenStreetMap, schéma OpenMapTiles),
 * gratuites, sans clé ni filigrane. Style sobre sur mesure : terres, mers, glaces et grands fleuves ;
 * aucune frontière moderne ; villes et routes actuelles en option (« Repères modernes »).
 */
const OFM = "https://tiles.openfreemap.org";
const BASE_LAYERS = ["ofm-ice", "ofm-water", "ofm-rivers"];
const MODERN_LAYERS = ["ofm-roads", "ofm-places"];
const fillOpacity = (k: number): any => ["*", ["coalesce", ["get", "_op"], 1], ["case",
  ["boolean", ["feature-state", "hover"], false], 0.75 * k,
  ["==", ["get", "_role"], "other"], 0.32 * k,
  0.58 * k]];
const emptyFC = (): FC => ({ type: "FeatureCollection", features: [] });
const map = new maplibregl.Map({
  container: "map",
  attributionControl: { compact: true },
  center: state.sc.raw.view.center,
  zoom: state.sc.raw.view.zoom,
  maxZoom: 17,
  style: {
    version: 8,
    glyphs: `${OFM}/fonts/{fontstack}/{range}.pbf`,
    sources: {
      ofm: { type: "vector", url: `${OFM}/planet`, attribution: '<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> Données © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">contributeurs OpenStreetMap</a>' },
      satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagerie © Esri" },
      states: { type: "geojson", data: emptyFC(), attribution: "Frontières : historical-basemaps (GPL-3.0) / Cliopatria (Seshat)" },
      composites: { type: "geojson", data: emptyFC() },
      user: { type: "geojson", data: emptyFC() },
      paleo: { type: "geojson", data: emptyFC(), attribution: "Bathymétrie : Natural Earth" },
      labels: { type: "geojson", data: emptyFC() },
      paths: { type: "geojson", data: emptyFC() },
      // Les textes ont leurs propres sources : si la police ne se charge pas, seuls les textes manquent.
      world: { type: "geojson", data: emptyFC() },
      events: { type: "geojson", data: emptyFC(), cluster: true, clusterMaxZoom: 7, clusterRadius: 34, attribution: "Événements : Wikidata (CC0) / Histomap" },
      "events-text": { type: "geojson", data: emptyFC() },
      "clusters-text": { type: "geojson", data: emptyFC(), cluster: true, clusterMaxZoom: 7, clusterRadius: 34 }
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#ece6d8" } },
      { id: "ofm-ice", type: "fill", source: "ofm", "source-layer": "landcover", filter: ["==", ["get", "class"], "ice"], paint: { "fill-color": "#f7f9fb", "fill-opacity": 0.9 } },
      { id: "ofm-water", type: "fill", source: "ofm", "source-layer": "water", paint: { "fill-color": "#bcd2df" } },
      {
        id: "ofm-rivers", type: "line", source: "ofm", "source-layer": "waterway", filter: ["==", ["get", "class"], "river"],
        paint: { "line-color": "#a7c3d4", "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.3, 8, 1.2, 12, 2.5] }
      },
      { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
      // Paléogéographie (F-21) : terres émergées au dernier maximum glaciaire, approximées par
      // les plateaux continentaux (profondeur < 200 m) ; seules les mers profondes restent en bleu.
      { id: "paleo-land", type: "background", layout: { visibility: "none" }, paint: { "background-color": "#d8c9a3", "background-opacity": 0 } },
      { id: "paleo-sea", type: "fill", source: "paleo", layout: { visibility: "none" }, paint: { "fill-color": "#8fb5cf", "fill-opacity": 0 } },
      { id: "states-fill", type: "fill", source: "states", paint: { "fill-color": ["get", "_color"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, fillOpacity(1), 12, fillOpacity(0.45)] } },
      { id: "states-line", type: "line", source: "states", paint: { "line-color": "#4b5563", "line-opacity": ["*", 0.45, ["coalesce", ["get", "_op"], 1]], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 1.2] } },
      {
        id: "states-key-line", type: "line", source: "states",
        filter: ["in", ["get", "_role"], ["literal", ["focus", "rival", "ally", "context"]]],
        paint: { "line-color": ["get", "_color"], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 8, 3] }
      },
      { id: "states-selected", type: "line", source: "states", filter: ["==", ["get", "NAME"], "\u0000"], paint: { "line-color": "#111827", "line-width": 2.5, "line-dasharray": [2, 1] } },
      // Frontières importées par l'utilisateur (F-26)
      { id: "user-fill", type: "fill", source: "user", paint: { "fill-color": "#f59e0b", "fill-opacity": 0.25 } },
      { id: "user-line", type: "line", source: "user", paint: { "line-color": "#b45309", "line-width": 2.5, "line-dasharray": [1, 1] } },
      // Ensembles composites du mode précis (empires, alliances, suzerainetés) : contour seul (F-27)
      { id: "composites-line", type: "line", source: "composites", paint: { "line-color": "#374151", "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1, 8, 2.2], "line-dasharray": [3, 2], "line-opacity": 0.75 } },
      {
        id: "ofm-roads", type: "line", source: "ofm", "source-layer": "transportation", layout: { visibility: "none", "line-cap": "round" },
        filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary"]]],
        paint: { "line-color": "#8a7f6d", "line-opacity": 0.6, "line-width": ["interpolate", ["linear"], ["zoom"], 5, 0.4, 10, 1.4, 14, 3] }
      },
      {
        id: "ofm-places", type: "symbol", source: "ofm", "source-layer": "place", layout: {
          visibility: "none",
          "text-field": ["coalesce", ["get", "name:fr"], ["get", "name:latin"], ["get", "name"]],
          "text-font": ["Noto Sans Regular"], "text-size": ["interpolate", ["linear"], ["zoom"], 4, 10, 10, 13],
          "symbol-sort-key": ["get", "rank"]
        },
        filter: ["in", ["get", "class"], ["literal", ["city", "town", "village"]]],
        paint: { "text-color": "#4b4337", "text-halo-color": "rgba(255,255,255,.85)", "text-halo-width": 1.2 }
      },
      {
        id: "state-labels", type: "symbol", source: "labels",
        layout: {
          "text-field": ["get", "label"], "text-font": ["Noto Sans Bold"],
          "text-size": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["==", ["get", "important"], 1], 12, 10], 6, ["case", ["==", ["get", "important"], 1], 18, 14]],
          "text-max-width": 8, "symbol-sort-key": ["-", 0, ["get", "sort"]], "text-padding": 4
        },
        paint: { "text-color": "#1f2937", "text-halo-color": "rgba(255,255,255,.85)", "text-halo-width": 1.4 }
      },
      {
        id: "paths-line", type: "line", source: "paths", filter: ["all", ["==", ["get", "kind"], "line"], ["==", ["get", "ptype"], "person"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 2, 10, 4], "line-dasharray": [2, 1.5], "line-opacity": 0.85 }
      },
      {
        // Mouvements de troupes et voyages : trait plein, plus épais
        id: "paths-move", type: "line", source: "paths", filter: ["all", ["==", ["get", "kind"], "line"], ["!=", ["get", "ptype"], "person"]],
        layout: { "line-cap": "round", "line-join": "round" },
        paint: { "line-color": ["get", "color"], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 3, 10, 7], "line-opacity": 0.8 }
      },
      {
        id: "paths-arrows", type: "symbol", source: "paths", filter: ["==", ["get", "kind"], "line"],
        layout: {
          "symbol-placement": "line", "symbol-spacing": 70, "icon-image": "arrow", "icon-size": ["interpolate", ["linear"], ["zoom"], 2, 0.7, 10, 1.2],
          "icon-allow-overlap": true, "icon-rotation-alignment": "map"
        },
        paint: { "icon-color": ["get", "color"], "icon-halo-color": "#ffffff", "icon-halo-width": 1 }
      },
      {
        id: "paths-head", type: "circle", source: "paths", filter: ["==", ["get", "kind"], "head"],
        paint: { "circle-radius": 9, "circle-color": ["get", "color"], "circle-stroke-color": "#fff", "circle-stroke-width": 3, "circle-opacity": 0.95 }
      },
      {
        id: "paths-steps", type: "circle", source: "paths", filter: ["==", ["get", "kind"], "step"],
        paint: {
          "circle-radius": 4, "circle-color": ["get", "color"],
          "circle-stroke-color": "#fff", "circle-stroke-width": 2
        }
      },
      {
        // Couche « Monde » (F-50) : ce qui se passe ailleurs au même moment
        id: "world-dots", type: "circle", source: "world",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["+", 2, ["get", "w"]], 6, ["+", 4, ["*", 2, ["get", "w"]]]],
          "circle-color": ["get", "color"], "circle-opacity": 0.7,
          "circle-stroke-color": "#ffffff", "circle-stroke-width": 0.8, "circle-stroke-opacity": 0.8
        }
      },
      {
        id: "clusters", type: "circle", source: "events", filter: ["has", "point_count"],
        paint: { "circle-color": "#1f2937", "circle-opacity": 0.85, "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 23], "circle-stroke-color": "#fff", "circle-stroke-width": 2 }
      },
      {
        id: "cluster-count", type: "symbol", source: "clusters-text", filter: ["has", "point_count"],
        layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-allow-overlap": true },
        paint: { "text-color": "#fff" }
      },
      {
        id: "events-halo", type: "circle", source: "events",
        filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "phase"], "active"]],
        paint: { "circle-radius": 20, "circle-color": ["get", "color"], "circle-opacity": 0.22, "circle-blur": 0.4 }
      },
      {
        id: "events", type: "symbol", source: "events", filter: ["!", ["has", "point_count"]],
        layout: { "icon-image": ["concat", "cat-", ["get", "category"]], "icon-size": ["get", "size"], "icon-allow-overlap": true, "icon-ignore-placement": true },
        paint: { "icon-opacity": ["get", "opacity"] }
      },
      {
        id: "events-label", type: "symbol", source: "events-text", filter: ["!=", ["get", "phase"], "past"], minzoom: 6,
        layout: { "text-field": ["get", "title"], "text-font": ["Noto Sans Bold"], "text-size": 12, "text-offset": [0, 1.5], "text-anchor": "top", "text-max-width": 12 },
        paint: { "text-color": "#111827", "text-halo-color": "#fff", "text-halo-width": 1.5, "text-opacity": ["get", "opacity"] }
      }
    ]
  }
});
const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

/** Flèche de direction (image SDF, teintée par icon-color). */
function addArrowIcon(): void {
  const S = 32;
  const cv = document.createElement("canvas");
  cv.width = cv.height = S;
  const g = cv.getContext("2d")!;
  g.fillStyle = "#000";
  g.beginPath(); g.moveTo(6, 7); g.lineTo(27, 16); g.lineTo(6, 25); g.lineTo(11, 16); g.closePath(); g.fill();
  const img = g.getImageData(0, 0, S, S);
  if (!map.hasImage("arrow")) map.addImage("arrow", { width: S, height: S, data: new Uint8Array(img.data.buffer) }, { pixelRatio: 2, sdf: true });
}

/** Icônes de catégories : pastille colorée + pictogramme, dessinées en canvas. */
function addCategoryIcons(): void {
  const S = 64;
  for (const c of CATEGORIES) {
    const cv = document.createElement("canvas");
    cv.width = cv.height = S;
    const g = cv.getContext("2d")!;
    g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    g.fillStyle = c.color; g.fill();
    g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
    g.font = `${S * 0.45}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText(c.icon, S / 2, S / 2 + 2);
    const img = g.getImageData(0, 0, S, S);
    if (map.hasImage("cat-" + c.id)) map.removeImage("cat-" + c.id);
    map.addImage("cat-" + c.id, { width: S, height: S, data: new Uint8Array(img.data.buffer) }, { pixelRatio: 2 });
  }
}

// ---------------------------------------------------------------------------
// Chargement des frontières (mode rapide ou précis, F-24)
// ---------------------------------------------------------------------------
let loadSeq = 0;
function bordersBadge(f: Borders.BordersFrame): string {
  return f.source === "clio" ? t_("map.bordersPrecise", { year: Time.fmtYearHist(f.year) }) : t_("map.borders", { year: Time.fmtYearHist(f.year) });
}
/** Le cadre de frontières doit-il changer pour cette date ? (sans chargement) */
function frameStale(t: number): boolean {
  if (!state.frame) return true;
  if (state.bordersMode === "precise") return Time.histYear(t) !== state.frame.year;
  return Borders.fastYear(t) !== state.frame.year;
}

async function refreshStates(force = false): Promise<void> {
  if (!map.getSource("states")) return;
  const seq = ++loadSeq;
  const slow = window.setTimeout(() => { if (seq === loadSeq) { $("loading").hidden = false; $("loading").textContent = t_("map.loading"); } }, 250);
  let frame: Borders.BordersFrame;
  try { frame = await Borders.frameFor(state.t, state.bordersMode); } catch (err) {
    clearTimeout(slow);
    if (seq === loadSeq) { $("loading").hidden = false; $("loading").textContent = t_("map.loadError", { error: (err as Error).message }); }
    return;
  }
  clearTimeout(slow);
  if (seq !== loadSeq) return;
  $("loading").hidden = true;
  const sameShape = !force && state.frame?.key === frame.key && state.decorated;
  const frameChanged = state.frame?.key !== frame.key;
  state.frame = frame;
  $("snapshot-badge").textContent = bordersBadge(frame);
  if (frameChanged || force) (map.getSource("composites") as GeoJSONSource).setData(frame.composites);
  // Frontières dynamiques : interpolation vers l'état connu suivant
  if (state.dynamic) {
    ensureMorph(frame); // préparation en arrière-plan ; en attendant, l'état connu est affiché tel quel
    if (state.morph && state.morph.key.startsWith(frame.key + "→")) {
      const rolesChanged = state.sig.decorated !== state.sig.actors;
      state.sig.decorated = state.sig.actors;
      applyMorph(force || frameChanged || rolesChanged);
      if (frameChanged || force || rolesChanged) { refreshLabels(true); renderLegend(); if (state.selected?.kind === "state") reselectState(); }
      Borders.prefetch(state.t + (state.view[1] - state.view[0]) * 0.05, state.bordersMode);
      return;
    }
  } else state.morph = null;
  if (state.morph && !state.morph.key.startsWith(frame.key + "→")) state.morph = null;
  if (sameShape && state.sig.decorated === state.sig.actors) return; // mêmes tracés, mêmes rôles
  state.sig.decorated = state.sig.actors;
  state.decorated = decorate(frame.fc);
  (map.getSource("states") as GeoJSONSource).setData(state.decorated);
  refreshLabels(true);
  renderLegend();
  if (state.selected?.kind === "state") reselectState();
  Borders.prefetch(state.t + (state.view[1] - state.view[0]) * 0.05, state.bordersMode);
}
/** Prépare l'interpolation entre le cadre courant et l'état connu suivant (une fois par couple). */
/*
 * Transitions : d'abord la mémoire ou l'enregistrement local ; sinon calcul immédiat (prioritaire sur
 * la préparation de fond) avec un délai de 8 s, au-delà duquel un fondu enchaîné s'affiche pendant
 * que le calcul complet se poursuit en arrière-plan.
 */
let morphPending = "";
async function ensureMorph(frame: Borders.BordersFrame): Promise<void> {
  if (state.morph && state.morph.key.startsWith(frame.key + "→")) return;
  const pair = await Borders.nextFrame(frame, state.bordersMode).catch(() => null);
  if (!pair || pair.next.key === frame.key) { state.morph = null; return; }
  const key = morphKey(frame, pair.next);
  const install = (m: Morpher | CrossFade) => {
    if (state.frame?.key !== frame.key || !state.dynamic) return;
    state.morph = { key: frame.key + "→" + pair.next.key, m, tA: pair.tA, tB: pair.tB, nextYear: pair.next.year, fallback: m instanceof CrossFade };
    state.morphF = -1;
    applyMorph(true);
  };
  const known = await morphService.load(key, frame.fc);
  if (known) { install(known); return; }
  if (morphPending === key) return;
  morphPending = key;
  const m = await morphService.compute(key, frame.fc, pair.next.fc, { timeout: 8000, background: false });
  if (morphPending === key) morphPending = "";
  if (m) { install(m); return; }
  install(new CrossFade(frame.fc, pair.next.fc));
  morphService.compute(key, frame.fc, pair.next.fc, { timeout: 180000, background: true }).then(full => { if (full) install(full); });
}

/**
 * Préparation en continu des transitions du sujet (période visible élargie), en arrière-plan.
 * Relancée quand le sujet, le mode de frontières ou la période visible changent.
 */
let planTimer = 0, planSig = "";
function schedulePlan(delay = 1500): void {
  clearTimeout(planTimer);
  planTimer = window.setTimeout(planMorphs, delay);
}
async function planMorphs(): Promise<void> {
  if (!state.dynamic) { planSig = ""; morphService.cancelPlan(); return; }
  const [b0, b1] = state.sc.bounds;
  const span = state.view[1] - state.view[0];
  const r0 = Math.max(b0, state.view[0] - span * 0.25), r1 = Math.min(b1, state.view[1] + span * 0.25);
  const sig = `${state.sc.id}|${state.bordersMode}|${r0.toFixed(1)}|${r1.toFixed(1)}`;
  if (sig === planSig) return;
  planSig = sig;
  const pairs = await Borders.framePairs(r0, r1, state.bordersMode, 150).catch(() => []);
  if (sig !== planSig) return;
  morphService.startPlan(pairs, p => morphKey(p.A, p.B));
}
morphService.onProgress = p => {
  const el = $("morph-progress");
  if (!p.total) { el.hidden = true; return; }
  el.hidden = false;
  const pct = Math.round((100 * (p.done + p.failed)) / p.total);
  $("morph-progress-bar").style.width = pct + "%";
  $("morph-progress-text").textContent = p.active
    ? t_("morph.progress", { done: p.done, total: p.total })
    : t_("morph.ready", { done: p.done, total: p.total }) + (p.failed ? " " + t_("morph.failed", { n: p.failed }) : "");
};

let morphTimer = 0, morphLast = 0;
/** Applique l'interpolation pour la date courante (limitée à ≈ 12 rafraîchissements par seconde). */
function applyMorph(force = false): void {
  const mo = state.morph;
  if (!mo) return;
  const f = Math.max(0, Math.min(1, (state.t - mo.tA) / Math.max(1e-9, mo.tB - mo.tA)));
  if (!force && Math.abs(f - state.morphF) < 0.004) return;
  const now = performance.now();
  if (!force && now - morphLast < 80) {
    if (!morphTimer) morphTimer = window.setTimeout(() => { morphTimer = 0; applyMorph(); }, 80);
    return;
  }
  morphLast = now;
  state.morphF = f;
  setHover(null);
  state.decorated = decorate(mo.m.at(f));
  (map.getSource("states") as GeoJSONSource).setData(state.decorated);
  const badge = state.frame ? bordersBadge(state.frame) : "";
  $("snapshot-badge").textContent = f > 0.001 ? `${badge} → ${Time.fmtYearHist(mo.nextYear)} · ${t_(mo.fallback ? "map.transitionFade" : "map.transition")}` : badge;
}

function refreshLabels(force: boolean): void {
  if (!state.frame) return;
  const sig = state.frame.key + ":" + Time.histYear(state.t) + ":" + state.sig.actors;
  if (!force && sig === state.sig.labels) return;
  state.sig.labels = sig;
  (map.getSource("labels") as GeoJSONSource).setData(labelCollection(state.frame));
}

// ---------------------------------------------------------------------------
// Import de frontières (F-26) : GeoJSON avec dates de début et de fin facultatives
// ---------------------------------------------------------------------------
const FROM_KEYS = ["start_date", "FromYear", "from", "start", "begin", "valid_from", "date_start", "debut", "début"];
const TO_KEYS = ["end_date", "ToYear", "to", "end", "valid_to", "date_end", "fin"];
const NAME_KEYS = ["name", "NAME", "Name", "nom", "title", "label"];
let userSig = "";
function pickKey(props: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (props[k] !== undefined && props[k] !== null && props[k] !== "") return props[k];
  return undefined;
}
function parseUserDate(v: unknown, end: boolean): number | null {
  if (v === undefined) return null;
  try { return end ? Time.endOf(String(v).split("T")[0]) : Time.parse(String(v).split("T")[0]).t; } catch { return null; }
}
async function importBorders(file: File): Promise<void> {
  const status = $("user-status");
  try {
    const fc = JSON.parse(await file.text()) as FC;
    if (fc.type !== "FeatureCollection" || !Array.isArray(fc.features)) throw new Error("FeatureCollection attendue");
    let dated = 0;
    const features = fc.features.filter(f => f.geometry).map((f, i) => {
      const p = f.properties || {};
      const t0 = parseUserDate(pickKey(p, FROM_KEYS), false), t1 = parseUserDate(pickKey(p, TO_KEYS), true);
      if (t0 !== null || t1 !== null) dated++;
      return { ...f, id: i, properties: { ...p, _name: String(pickKey(p, NAME_KEYS) ?? `#${i + 1}`), _t0: t0 ?? -1e7, _t1: t1 ?? 1e7 } };
    });
    (map.getSource("user") as GeoJSONSource).setData({ type: "FeatureCollection", features });
    userSig = "";
    updateUserLayer();
    status.textContent = t_("import.done", { n: features.length, dated, file: file.name });
  } catch (err) {
    status.textContent = t_("import.error", { error: (err as Error).message });
  }
}
function updateUserLayer(): void {
  if (!map.getLayer("user-fill")) return;
  const sig = state.t.toFixed(3);
  if (sig === userSig) return;
  userSig = sig;
  const f: any = ["all", ["<=", ["get", "_t0"], state.t], [">=", ["get", "_t1"], state.t]];
  map.setFilter("user-fill", f);
  map.setFilter("user-line", f);
}

/**
 * Paléogéographie : visible avant ≈ 6000 av. J.-C., pleinement avant 16 000 av. J.-C.
 * (remontée du niveau marin après le dernier maximum glaciaire).
 */
let paleoLoaded = false, paleoLevel = -1;
function paleoOpacity(t: number): number {
  const Y = Time.histYear(t);
  if (Y >= -6000) return 0;
  if (Y <= -16000) return 1;
  return (-6000 - Y) / 10000;
}
function updatePaleo(): void {
  if (!map.getLayer("paleo-land")) return;
  const k = Math.round(paleoOpacity(state.t) * 20) / 20;
  if (k === paleoLevel) return;
  paleoLevel = k;
  if (k > 0 && !paleoLoaded) {
    paleoLoaded = true;
    (map.getSource("paleo") as GeoJSONSource).setData((import.meta.env.BASE_URL || "./") + "paleo/deep-sea.json");
  }
  const vis = k > 0 ? "visible" : "none";
  map.setLayoutProperty("paleo-land", "visibility", vis);
  map.setLayoutProperty("paleo-sea", "visibility", vis);
  map.setPaintProperty("paleo-land", "background-opacity", 0.6 * k);
  map.setPaintProperty("paleo-sea", "fill-opacity", 0.95 * k);
  renderLegend();
}

// ---------------------------------------------------------------------------
// Temps
// ---------------------------------------------------------------------------
const timeline = new Timeline($("timeline"), {
  onChange: t => { stopPlay(); setTime(t, { fromTimeline: true }); },
  onView: v => { state.view = v; updateDateLabel(); refreshEvents(); scheduleLanes(); schedulePlan(2500); writeHash(); },
  onSelectEvent: e => focusEvent(e.idx),
  onSelectLaneItem: (_lane, e) => { const it = state.laneItems[e.idx]; if (it) inspectWorld(it, true); }
});

function setTime(t: number, { fromTimeline = false, follow = false } = {}): void {
  const [a, b] = state.sc.bounds;
  t = Math.max(a, Math.min(b, t));
  state.t = t;
  if (!fromTimeline) timeline.setTime(t, { follow });
  const actorsSig = activeActors().map(x => x.label + x.role).join("|");
  const actorsChanged = actorsSig !== state.sig.actors;
  state.sig.actors = actorsSig;
  if (frameStale(t) || actorsChanged) refreshStates();
  else { refreshLabels(false); if (state.dynamic) applyMorph(); }
  updatePaleo();
  updateUserLayer();
  refreshEvents();
  updateDateLabel();
  writeHash();
}

function updateDateLabel(): void {
  const span = state.view[1] - state.view[0];
  $("date-label").textContent = Time.format(state.t, Time.levelForSpan(span));
  $("scale-label").textContent = t_("time.scale", { unit: t_("unit." + timeline.units().major.id) });
}

// Lecture : la vitesse est exprimée en « largeurs de frise par N secondes », elle s'adapte donc au zoom.
let lastFrame = 0;
function frame(now: number): void {
  if (!state.playing) return;
  const dt = Math.min(0.1, (now - lastFrame) / 1000);
  lastFrame = now;
  const span = state.view[1] - state.view[0];
  const next = state.t + (span / +$<HTMLSelectElement>("speed").value) * dt;
  if (next >= state.sc.bounds[1]) { setTime(state.sc.bounds[1], { follow: true }); stopPlay(); return; }
  setTime(next, { follow: true });
  requestAnimationFrame(frame);
}
function startPlay(): void {
  if (state.t >= state.sc.bounds[1] - 1e-9) setTime(state.sc.bounds[0], { follow: true });
  state.playing = true;
  $("btn-play").textContent = "❚❚"; $("btn-play").setAttribute("aria-label", t_("time.pause"));
  lastFrame = performance.now();
  requestAnimationFrame(frame);
}
function stopPlay(): void {
  state.playing = false;
  $("btn-play").textContent = "▶"; $("btn-play").setAttribute("aria-label", t_("time.play"));
}
const stepSize = () => (timeline.minorUnit || timeline.majorUnit || { years: 1 }).years;

// ---------------------------------------------------------------------------
// Filtres par catégorie (F-40, F-41)
// ---------------------------------------------------------------------------
function renderFilters(): void {
  const present = new Set<string>(state.sc.events.map(e => e.category));
  if (state.showWorld) CATEGORIES.forEach(c => c.id !== "migration" && present.add(c.id));
  const chips = [`<button class="chip-btn" data-cat="__states" aria-pressed="${state.showStates}" title="${esc(t_("filters.states"))}">
    <span class="ico" aria-hidden="true">🏛️</span><span class="lbl">${esc(t_("filters.states"))}</span></button>`,
  `<button class="chip-btn" data-cat="__world" aria-pressed="${state.showWorld}" title="${esc(t_("world.title"))}">
    <span class="ico" aria-hidden="true">🌍</span><span class="lbl">${esc(t_("world.toggle"))}</span></button>`];
  for (const c of CATEGORIES.filter(c => present.has(c.id))) {
    chips.push(`<button class="chip-btn" data-cat="${c.id}" aria-pressed="${!state.hiddenCats.has(c.id)}" style="--c:${c.color}" title="${esc(catLabel(c))}">
      <span class="ico" aria-hidden="true">${c.icon}</span><span class="lbl">${esc(catLabel(c))}</span><span class="count" data-count="${c.id}"></span></button>`);
  }
  $("filters").innerHTML = chips.join("");
  $("filters").querySelectorAll<HTMLElement>("[data-cat]").forEach(btn => btn.onclick = () => toggleCategory(btn.dataset.cat!));
}
function toggleCategory(id: string): void {
  if (id === "__world") {
    state.showWorld = !state.showWorld;
    store.set("showWorld", state.showWorld);
    state.worldSig = "";
  } else if (id === "__states") {
    state.showStates = !state.showStates;
    ["states-fill", "states-line", "states-key-line", "states-selected", "state-labels"].forEach(l =>
      map.setLayoutProperty(l, "visibility", state.showStates && (l !== "state-labels" || $<HTMLInputElement>("opt-labels").checked) ? "visible" : "none"));
  } else {
    if (state.hiddenCats.has(id)) state.hiddenCats.delete(id); else state.hiddenCats.add(id);
    store.set("hiddenCats", [...state.hiddenCats]);
  }
  renderFilters();
  timeline.setHiddenCategories(state.hiddenCats);
  refreshEvents(true);
  renderChronology();
  writeHash();
}
function updateFilterCounts(list: { e: EventItem; phase: string }[]): void {
  const counts: Record<string, number> = {};
  list.forEach(v => { if (v.phase !== "past") counts[v.e.category] = (counts[v.e.category] || 0) + 1; });
  $("filters").querySelectorAll<HTMLElement>("[data-count]").forEach(el => {
    const n = counts[el.dataset.count!] || 0;
    el.textContent = n ? String(n) : "";
  });
}

// ---------------------------------------------------------------------------
// Panneau gauche : sujet, légende, chronologie (vue liste, F-111)
// ---------------------------------------------------------------------------
function renderLegend(): void {
  const items: string[] = [], seen = new Set<string>();
  for (const a of activeActors()) {
    if (seen.has(a.label)) continue; seen.add(a.label);
    items.push(`<li><span class="swatch" style="background:${actorColor(a)}"></span>${esc(a.label)}</li>`);
  }
  if (paleoLevel > 0) items.push(`<li><span class="swatch" style="background:#d8c9a3"></span>${esc(t_("legend.paleo"))}</li>`);
  if (state.frame?.composites.features.length) items.push(`<li><span class="swatch outline"></span>${esc(t_("legend.composites"))}</li>`);
  for (const p of state.sc.paths) items.push(`<li><span class="swatch line${p.kind !== "person" ? " solid" : ""}" style="--c:${p.color}"></span>${esc(p.kind === "person" ? t_("legend.path", { name: p.label }) : p.label)}</li>`);
  if (state.sc.actors.length) {
    items.push(`<li><span class="swatch" style="background:${lighten(state.cvd ? CVD.focus[0] : "#2563eb")}"></span>${esc(t_("legend.subs"))}</li>`);
    items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>${esc(t_("legend.others"))}</li>`);
  } else {
    items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>${esc(t_("legend.eachState"))}</li>`);
  }
  $("legend").innerHTML = items.join("");
}
function renderScenarioInfo(): void {
  const r = state.sc.raw;
  $("scenario-title").textContent = r.title;
  $("scenario-subtitle").textContent = r.subtitle;
  $("scenario-desc").textContent = r.description;
  $("scenario-notes").innerHTML = (r.notes || []).map(n => `<li>${esc(n)}</li>`).join("");
  $("scenario-source").innerHTML = r.qid ? t_("scenario.source", { link: `<a href="${wdUrl(r.qid)}" target="_blank" rel="noopener">Wikidata ${esc(r.qid)}</a>` }) : "";
  renderLegend();
}
function renderChronology(): void {
  const evs = state.sc.events.filter(e => !state.hiddenCats.has(e.category));
  $("chrono-count").textContent = evs.length ? t_("chrono.count", { n: evs.length }) : t_("chrono.empty");
  $("chrono-list").innerHTML = evs.map(e => `
    <li class="chrono-item"><input type="checkbox" class="prep-only" data-prep="${e.idx}" ${teacher?.has(eventItemId(e)) ? "checked" : ""} aria-label="${esc(t_("prep.add"))}"><button data-ev="${e.idx}" style="--c:${e.color}">
      <span class="ico" aria-hidden="true">${e.icon}</span>
      <span class="txt"><span class="d">${esc(e.dateLabel)}</span><span class="ttl">${esc(e.title)}</span></span>
    </button></li>`).join("");
  $("chrono-list").querySelectorAll<HTMLElement>("[data-ev]").forEach(b => b.onclick = () => focusEvent(+b.dataset.ev!));
  $("chrono-list").querySelectorAll<HTMLInputElement>("[data-prep]").forEach(c => c.onchange = () => teacher.toggle(eventBasketItem(state.sc.byIdx[+c.dataset.prep!])));
  state.sig.chrono = "";
  updateChronoHighlight();
}
function updateChronoHighlight(): void {
  const active = state.sc.events.filter(e => state.t >= e.t0 && state.t <= e.t1).map(e => e.idx);
  const sig = active.join(",");
  if (sig === state.sig.chrono) return;
  state.sig.chrono = sig;
  $("chrono-list").querySelectorAll<HTMLElement>("[data-ev]").forEach(b => b.classList.toggle("now", active.includes(+b.dataset.ev!)));
}

function fillScenarioSelect(): void {
  const opt = (s: Scenario) => `<option value="${esc(s.id)}">${esc(s.raw.title)}${s.raw.subtitle ? ` (${esc(s.raw.subtitle)})` : ""}</option>`;
  const isPkg = (s: Scenario) => s.id.startsWith("pkg:");
  const cur = scenarios.filter(s => s.raw.kind !== "generated" && !isPkg(s)), gen = scenarios.filter(s => s.raw.kind === "generated");
  const pkgs = scenarios.filter(isPkg);
  $("scenario-select").innerHTML = `<optgroup label="${esc(t_("group.curated"))}">${cur.map(opt).join("")}</optgroup>` +
    (gen.length ? `<optgroup label="${esc(t_("group.generated"))}">${gen.map(opt).join("")}</optgroup>` : "") +
    (pkgs.length ? `<optgroup label="${esc(t_("group.packages"))}">${pkgs.map(opt).join("")}</optgroup>` : "");
  $<HTMLSelectElement>("scenario-select").value = state.sc.id;
}

function setScenario(id: string, { t, view, fly = true }: { t?: number; view?: [number, number]; fly?: boolean } = {}): void {
  stopPlay();
  state.sc = scenarios.find(s => s.id === id) || scenarios[0];
  $<HTMLSelectElement>("scenario-select").value = state.sc.id;
  state.frame = null;
  state.morph = null;
  state.sig = { actors: "", labels: "", events: "", chrono: "", paths: "", decorated: "" };
  popup.remove();
  clearSelection();
  renderScenarioInfo();
  renderFilters();
  renderChronology();
  timeline.setData({ bounds: state.sc.bounds, periods: state.sc.periods, events: state.sc.events });
  state.worldSig = "";
  scheduleLanes();
  timeline.setHiddenCategories(state.hiddenCats);
  if (view) timeline.setView(view[0], view[1]); else timeline.fit();
  const r = state.sc.raw;
  if (fly) {
    if (r.bbox) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 40, duration: 1600, maxZoom: 11 });
    else map.flyTo({ center: r.view.center, zoom: r.view.zoom, duration: 1600 });
  }
  setTime(t ?? state.sc.startT);
  teacher?.onScenario(state.sc);
  schedulePlan();
}

/** Ajoute (ou remplace) un sujet généré et le mémorise localement. */
function addGenerated(spec: ScenarioSpec): Scenario {
  const sc = normalize(spec);
  const i = scenarios.findIndex(s => s.id === sc.id);
  if (i >= 0) scenarios.splice(i, 1);
  scenarios.push(sc);
  const kept = [spec, ...generatedSpecs.filter(g => g.id !== spec.id)].slice(0, MAX_GENERATED);
  generatedSpecs.splice(0, generatedSpecs.length, ...kept);
  store.set("generated", generatedSpecs);
  // Retire de la liste les sujets générés qui ne sont plus mémorisés
  for (let k = scenarios.length - 1; k >= 0; k--) {
    if (scenarios[k].raw.kind === "generated" && !kept.some(g => g.id === scenarios[k].id)) scenarios.splice(k, 1);
  }
  fillScenarioSelect();
  return sc;
}

// ---------------------------------------------------------------------------
// Recherche (F-60, F-61) et génération de sujets (F-63 à F-66)
// ---------------------------------------------------------------------------
type SearchItem = { kind: "date"; t: number; label: string } | { kind: "place"; text: string; year: number; label: string } | { kind: "entity"; r: SearchResult };
let searchItems: SearchItem[] = [];
let searchActive = -1;
let searchTimer = 0, searchSeq = 0;
let genAbort = { cancelled: false };

function parseQuickQuery(q: string): SearchItem[] {
  const out: SearchItem[] = [];
  const bc = /\b(av(\.|ant)?\s*J\.?-?C\.?|BC|BCE)\b/i.test(q);
  const yearOnly = /^\s*(-?\d{1,6})\s*(av(\.|ant)?\s*J\.?-?C\.?|BC|BCE)?\s*$/i.exec(q);
  if (yearOnly) {
    let Y = parseInt(yearOnly[1], 10);
    if (bc && Y > 0) Y = -Y;
    if (Y !== 0) out.push({ kind: "date", t: Time.fromHistYear(Y), label: t_("search.gotoDate", { date: Time.fmtYearHist(Y) }) });
  }
  const placeAt = /^(.+?)\s+(?:en|in|à|a)\s+(-?\d{1,6})\s*(av(\.|ant)?\s*J\.?-?C\.?|BC|BCE)?\s*$/i.exec(q);
  if (placeAt) {
    let Y = parseInt(placeAt[2], 10);
    if (placeAt[3] && Y > 0) Y = -Y;
    out.push({ kind: "place", text: placeAt[1], year: Y, label: t_("search.placeAt", { place: placeAt[1], year: Time.fmtYearHist(Y) }) });
  }
  return out;
}

function renderSearch(status?: string): void {
  const ul = $("search-results");
  const input = $<HTMLInputElement>("search");
  if (!searchItems.length && !status) { ul.hidden = true; input.setAttribute("aria-expanded", "false"); return; }
  ul.hidden = false;
  input.setAttribute("aria-expanded", "true");
  ul.innerHTML = searchItems.map((it, i) => {
    const main = it.kind === "entity" ? it.r.label : it.label;
    const sub = it.kind === "entity" ? it.r.description : "";
    const ico = it.kind === "date" ? "🕰️" : it.kind === "place" ? "📍" : "🔎";
    return `<li role="option" id="sr-${i}" data-i="${i}" aria-selected="${i === searchActive}">
      <span class="ico" aria-hidden="true">${ico}</span><span class="txt"><span class="m">${esc(main)}</span>${sub ? `<span class="s">${esc(sub)}</span>` : ""}</span>
      ${it.kind === "entity" ? `<span class="q">${esc(it.r.id)}</span>` : ""}</li>`;
  }).join("") + (status ? `<li class="status muted small">${esc(status)}</li>` : "");
  input.setAttribute("aria-activedescendant", searchActive >= 0 ? `sr-${searchActive}` : "");
  ul.querySelectorAll<HTMLElement>("[data-i]").forEach(li => li.onmousedown = ev => { ev.preventDefault(); chooseSearch(+li.dataset.i!); });
}

function onSearchInput(): void {
  const q = $<HTMLInputElement>("search").value.trim();
  clearTimeout(searchTimer);
  const seq = ++searchSeq;
  searchItems = q ? parseQuickQuery(q) : [];
  searchActive = searchItems.length ? 0 : -1;
  if (q.length < 2 || /^\s*-?\d+\s*$/.test(q)) { renderSearch(); return; }
  renderSearch(t_("search.searching"));
  searchTimer = window.setTimeout(async () => {
    try {
      const res = await searchEntities(q, I18n.getLang(), 8);
      if (seq !== searchSeq) return;
      searchItems = [...parseQuickQuery(q), ...res.map(r => ({ kind: "entity" as const, r }))];
      if (searchActive < 0 && searchItems.length) searchActive = 0;
      renderSearch(searchItems.length ? undefined : t_("search.none"));
    } catch (err) {
      if (seq === searchSeq) renderSearch(t_("search.error", { error: (err as Error).message }));
    }
  }, 280);
}

function closeSearch(): void {
  searchItems = []; searchActive = -1;
  renderSearch();
}

async function chooseSearch(i: number): Promise<void> {
  const it = searchItems[i];
  if (!it) return;
  closeSearch();
  $<HTMLInputElement>("search").blur();
  if (it.kind === "date") {
    if (it.t < state.sc.bounds[0] || it.t > state.sc.bounds[1]) setScenario("libre", { t: it.t, fly: false });
    else setTime(it.t, { follow: true });
    return;
  }
  if (it.kind === "place") {
    try {
      const [hit] = await searchEntities(it.text, I18n.getLang(), 1);
      if (!hit) throw new Error(t_("search.none"));
      const f = await fetchFacts(hit.id, I18n.getLang());
      if (!f.coord) throw new Error(t_("search.none"));
      setScenario("libre", { t: Time.fromHistYear(it.year), fly: false });
      map.flyTo({ center: f.coord, zoom: 8, duration: 1800 });
    } catch (err) { showGenError((err as Error).message); }
    return;
  }
  await generateSubject(it.r.id, it.r.label);
}

async function generateSubject(qid: string, label: string): Promise<void> {
  const token = (genAbort = { cancelled: false });
  $("generating").hidden = false;
  $("generating").classList.remove("error");
  $("generating-title").textContent = t_("gen.title", { label });
  $("generating-step").textContent = t_("gen.step.type");
  try {
    const spec = await generate(qid, I18n.getLang(), step => {
      if (token.cancelled) return;
      const key = "gen.step." + step;
      $("generating-step").textContent = t_(key) === key ? t_("gen.step.unknown") : t_(key);
    });
    if (token.cancelled) return;
    $("generating").hidden = true;
    addGenerated(spec);
    setScenario(spec.id);
  } catch (err) {
    if (!token.cancelled) showGenError((err as Error).message);
  }
}
function showGenError(msg: string): void {
  $("generating").hidden = false;
  $("generating").classList.add("error");
  $("generating-title").textContent = t_("gen.failed", { error: msg });
  $("generating-step").textContent = "";
}

// ---------------------------------------------------------------------------
// Mode Préparation (phase 5) : éléments du panier
// ---------------------------------------------------------------------------
const eventItemId = (e: EventItem) => "ev:" + (e.qid || e.title);
function eventBasketItem(e: EventItem) {
  return { id: eventItemId(e), kind: "event" as const, title: e.title, t: e.t0, dateLabel: e.dateLabel, coords: e.coords as Pt, event: state.sc.raw.events[e.idx], wiki: e.wiki };
}

// ---------------------------------------------------------------------------
// Inspecteur à tiroirs (F-04)
// ---------------------------------------------------------------------------
const drawerState = store.get<Record<string, boolean>>("drawers", { facts: true, summary: true, chronology: true, actors: false, sources: false, article: false });
function drawer(id: string, title: string, body: string | Node): HTMLDetailsElement {
  const d = document.createElement("details");
  d.className = "drawer";
  d.dataset.drawer = id;
  d.open = !!drawerState[id];
  d.innerHTML = `<summary>${esc(title)}</summary><div class="drawer-body"></div>`;
  const b = d.querySelector(".drawer-body")!;
  if (typeof body === "string") b.innerHTML = body; else b.appendChild(body);
  d.addEventListener("toggle", () => { drawerState[id] = d.open; store.set("drawers", drawerState); });
  return d;
}
function articleDrawer(getArticle: () => Promise<{ title: string; lang: string }>, token: number): HTMLDetailsElement {
  const d = drawer("article", t_("inspector.article"), `<p class="muted small">${esc(t_("inspector.articleLoading"))}</p>`);
  let loaded = false;
  const load = () => {
    if (loaded || !d.open) return;
    loaded = true;
    getArticle().then(({ title, lang }) => Wiki.article(title, lang)).then(html => {
      if (token !== state.inspectToken) return;
      const frame = document.createElement("iframe");
      frame.className = "article-frame";
      frame.setAttribute("sandbox", "allow-popups allow-popups-to-escape-sandbox");
      frame.setAttribute("referrerpolicy", "no-referrer");
      frame.srcdoc = html.replace(/<head([^>]*)>/i, `<head$1><base target="_blank"><style>body{font:15px/1.55 Georgia,serif;margin:12px;color:#1f2430;background:#fffdf8}img{max-width:100%;height:auto}table{display:block;overflow:auto;max-width:100%}</style>`);
      const body = d.querySelector(".drawer-body")!;
      body.innerHTML = "";
      body.appendChild(frame);
    }).catch(() => {
      if (token !== state.inspectToken) return;
      d.querySelector(".drawer-body")!.innerHTML = `<p class="muted small">${esc(t_("inspector.wikiNone"))}</p>`;
    });
  };
  d.addEventListener("toggle", load);
  setTimeout(load, 0);
  return d;
}
function wikiBlock(promise: Promise<Wiki.WikiSummary>, token: number): HTMLElement {
  const holder = document.createElement("div");
  holder.innerHTML = `<p class="muted small">${esc(t_("inspector.wikiLoading"))}</p>`;
  promise.then(w => {
    if (token !== state.inspectToken) return;
    holder.innerHTML = `
      ${w.image ? `<img class="thumb" src="${esc(w.image)}" alt="">` : ""}
      <p class="wiki-extract">${esc(w.extract)}</p>
      <p class="small"><a href="${esc(w.url)}" target="_blank" rel="noopener">${esc(t_("inspector.wikiRead", { title: w.title }))}${w.lang !== "fr" ? " " + esc(t_("inspector.wikiOtherLang")) : ""} ↗</a></p>`;
  }).catch(() => {
    if (token !== state.inspectToken) return;
    holder.innerHTML = `<p class="muted small">${esc(t_("inspector.wikiNone"))}</p>`;
  });
  return holder;
}
function eventListHtml(evs: EventItem[]): string {
  return `<ul class="event-list">${evs.map(e =>
    `<li><button data-ev="${e.idx}"><span class="ico" aria-hidden="true">${e.icon}</span><span class="y">${esc(e.dateLabel)}</span><span>${esc(e.title)}</span></button></li>`).join("")}</ul>`;
}
function bindEventButtons(root: HTMLElement): void { root.querySelectorAll<HTMLElement>("[data-ev]").forEach(b => b.onclick = () => focusEvent(+b.dataset.ev!)); }

function openInspector(): void { $("inspector").classList.add("open"); }
function clearSelection(): void {
  state.selected = null;
  state.inspectToken++;
  $("inspector").classList.remove("open");
  if (map.getLayer("states-selected")) map.setFilter("states-selected", ["==", ["get", "NAME"], "\u0000"]);
  renderMeanwhile();
}

function inspectState(feature: { id?: string | number; properties: Record<string, any> }): void {
  const p = feature.properties;
  const fid = Number(feature.id);
  const token = ++state.inspectToken;
  const year = Time.histYear(state.t);
  state.selected = { kind: "state", name: p.NAME, id: fid };
  map.setFilter("states-selected", ["==", ["get", "NAME"], p.NAME]);
  const clio = !!p.QID || p.FROM !== undefined;
  const shown = stateLabel(p, year);
  const r = roleOf(p);
  const geom = state.decorated!.features[fid].geometry;
  const related = state.sc.events.filter(e => pointInGeom(e.coords, geom));
  const suz = p.SUBJECTO && p.SUBJECTO !== p.NAME ? (clio ? p.SUBJECTO : Wiki.resolveEntity(p.SUBJECTO, year)?.label || p.SUBJECTO) : null;
  const part = p.PARTOF && p.PARTOF !== p.NAME && p.PARTOF !== p.SUBJECTO ? p.PARTOF : null;
  const precision = t_("precision.border." + (p.BORDERPRECISION || "unknown"));
  const snapLabel = Time.fmtYearHist(state.frame!.year);
  const bordersFact = clio
    ? t_("inspector.bordersClio", { from: Time.fmtYearHist(p.FROM), to: Time.fmtYearHist(p.TO) })
    : t_("inspector.bordersValue", { year: snapLabel, precision });
  const bordersSrc = clio ? t_("inspector.bordersClioSource") : `${t_("inspector.bordersSource", { year: snapLabel })} — ${precision}`;
  // Article : identifiant Wikidata du tracé (mode précis) ou dictionnaire d'époque
  const articleRef = async (): Promise<{ title: string; lang: string }> => {
    if (p.QID) {
      await World.loadLabels([p.QID], I18n.getLang());
      const fr = World.labelOf(p.QID)?.frwiki;
      if (fr) return { title: fr, lang: "fr" };
      if (p.WIKI) return { title: p.WIKI, lang: "en" };
    }
    return Wiki.entityArticle(p.NAME, year);
  };
  const summaryP = clio ? articleRef().then(a => Wiki.summary(a.title, a.lang)) : Wiki.entitySummary(p.NAME, year);
  const chipColor = r.actor ? actorColor(r.actor) : "#6b7280";
  // Un acteur localisé par un point (sujet généré) peut renvoyer vers son entité Wikidata
  const actorQid = r.actor?.qid;

  const body = $("inspector-body");
  body.innerHTML = `
    <div class="brief">
      <h2><span class="swatch" style="background:${r.color}"></span>${esc(shown)}</h2>
      <div><span class="chip" style="background:${chipColor}">${esc(t_("role." + r.role))}${r.actor ? " · " + esc(r.actor.label) : ""}</span></div>
      <div class="actions"><button id="btn-fit">${esc(t_("inspector.fit"))}</button></div>
    </div>`;
  body.appendChild(drawer("facts", t_("inspector.facts"), `<dl class="facts">
      ${shown !== p.NAME ? `<dt>${esc(t_("inspector.sourceName"))}</dt><dd>${esc(p.NAME)}</dd>` : ""}
      ${suz ? `<dt>${esc(t_("inspector.dependsOn"))}</dt><dd>${esc(suz)}</dd>` : ""}
      ${part ? `<dt>${esc(t_("inspector.partOf"))}</dt><dd>${esc(part)}</dd>` : ""}
      <dt>${esc(t_("inspector.borders"))}</dt><dd>${esc(bordersFact)}</dd>
    </dl>`));
  body.appendChild(drawer("summary", t_("inspector.summary"), wikiBlock(summaryP, token)));
  body.appendChild(drawer("chronology", t_("inspector.chronology"),
    related.length ? eventListHtml(related) : `<p class="muted small">${esc(t_("inspector.noRelated"))}</p>`));
  const roles = state.sc.actors.filter(a => actorMatch(a).includes(p.NAME));
  body.appendChild(drawer("actors", t_("inspector.actors"), roles.length ? `
    <p class="small muted">${esc(t_("inspector.inSubject", { subject: state.sc.raw.title }))}</p>
    <ul class="roles">${roles.map(a => `<li><span class="swatch" style="background:${actorColor(a)}"></span>
      <strong>${esc(t_("role." + a.role))}</strong> · ${esc(a.label)}${a.when ? ` <span class="muted">(${a.when.map(([x, y]) => `${x}–${y}`).join(", ")})</span>` : ""}</li>`).join("")}</ul>`
    : `<p class="small muted">${esc(t_("inspector.notInSubject"))}</p>`));
  body.appendChild(drawer("sources", t_("inspector.sources"), `<dl class="facts">
      <dt>${esc(t_("inspector.borders"))}</dt><dd>${esc(bordersSrc)}</dd>
      ${p.QID ? `<dt>Wikidata</dt><dd><a href="${wdUrl(p.QID)}" target="_blank" rel="noopener">${esc(p.QID)}</a></dd>` : ""}
      <dt>${esc(t_("inspector.summary"))}</dt><dd>Wikipédia (CC BY-SA)</dd>
      ${actorQid ? `<dt>${esc(t_("inspector.dataSource"))}</dt><dd><a href="${wdUrl(actorQid)}" target="_blank" rel="noopener">${esc(t_("inspector.wikidataSource", { qid: actorQid }))}</a></dd>` : ""}
    </dl>`));
  body.appendChild(articleDrawer(articleRef, token));
  body.querySelector(".brief .actions")!.appendChild(teacher.button({ id: "st:" + p.NAME + "@" + year, kind: "state", title: shown, t: state.t, dateLabel: Time.format(state.t, Time.levelForSpan(state.view[1] - state.view[0])), wiki: undefined }));
  $("btn-fit").onclick = () => {
    const b = bboxOf(geom);
    map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 1200, maxZoom: 9 });
  };
  bindEventButtons(body);
  openInspector();
}

function reselectState(): void {
  if (state.selected?.kind !== "state") return;
  const name = state.selected.name;
  const f = state.decorated!.features.find(x => x.properties?.NAME === name);
  if (f) inspectState({ id: f.id, properties: f.properties! });
  else {
    map.setFilter("states-selected", ["==", ["get", "NAME"], "\u0000"]);
    const note = document.createElement("p");
    note.className = "muted small";
    note.textContent = t_("inspector.noLongerExists", { name, year: Time.fmtYearHist(state.frame!.year) });
    $("inspector-body").prepend(note);
  }
}

function inspectEvent(idx: number): void {
  const e = state.sc.byIdx[idx];
  const c = CAT[e.category];
  const token = ++state.inspectToken;
  state.selected = { kind: "event", idx };
  map.setFilter("states-selected", ["==", ["get", "NAME"], "\u0000"]);
  const body = $("inspector-body");
  body.innerHTML = `
    <div class="brief">
      <h2><span class="ico-lg" aria-hidden="true">${e.icon}</span>${esc(e.title)}</h2>
      <div><span class="chip" style="background:${c.color}">${esc(catLabel(c))}${e.subtype ? " · " + esc(e.subtype) : ""}</span></div>
      <p class="muted">${esc(e.dateLabel)}${e.place ? " · " + esc(e.place) : ""}</p>
      <div class="actions">
        <button id="btn-zoom-ev">${esc(t_("inspector.zoomPlace"))}</button>
        <button id="btn-goto-ev">${esc(t_("inspector.goto", { date: e.dateLabel.split(" → ")[0] }))}</button>
      </div>
    </div>`;
  body.appendChild(drawer("facts", t_("inspector.facts"), `${e.summary ? `<p>${esc(e.summary)}</p>` : ""}<dl class="facts">
      <dt>${esc(t_("inspector.date"))}</dt><dd>${esc(e.dateLabel)}</dd>
      ${e.place ? `<dt>${esc(t_("inspector.place"))}</dt><dd>${esc(e.place)}</dd>` : ""}
      <dt>${esc(t_("inspector.category"))}</dt><dd>${esc(catLabel(c))}${e.subtype ? " · " + esc(e.subtype) : ""}</dd>
    </dl>`));
  if (e.wiki) body.appendChild(drawer("summary", t_("inspector.summary"), wikiBlock(Wiki.summary(e.wiki), token)));
  const evs = state.sc.events, i = e.order;
  const near = evs.slice(Math.max(0, i - 3), i).concat(evs.slice(i + 1, i + 4));
  body.appendChild(drawer("chronology", t_("inspector.chronology"), eventListHtml(near)));
  const source = e.qid
    ? `<a href="${wdUrl(e.qid)}" target="_blank" rel="noopener">${esc(t_("inspector.wikidataSource", { qid: e.qid }))}</a>`
    : esc(t_("inspector.curated"));
  body.appendChild(drawer("sources", t_("inspector.sources"), `<dl class="facts">
      <dt>${esc(t_("inspector.dataSource"))}</dt><dd>${source}</dd>
      <dt>${esc(t_("inspector.datePrecision"))}</dt><dd>${esc(t_("precision." + e.precision))}</dd>
      <dt>${esc(t_("inspector.placePrecision"))}</dt><dd>${esc(t_("precision.place." + (e.placePrecision || "exact")))}</dd>
      <dt>${esc(t_("inspector.summary"))}</dt><dd>Wikipédia (CC BY-SA)</dd>
    </dl>${e.qid ? `<p class="small"><a href="${wdUrl(e.qid)}" target="_blank" rel="noopener">✎ ${esc(t_("inspector.fixOnWikidata"))}</a></p>` : ""}`));
  if (e.wiki) body.appendChild(articleDrawer(() => Promise.resolve({ title: e.wiki!, lang: "fr" }), token));
  body.querySelector(".brief .actions")!.appendChild(teacher.button(eventBasketItem(e)));
  $("btn-zoom-ev").onclick = () => map.flyTo({ center: e.coords, zoom: 12, duration: 1800 });
  $("btn-goto-ev").onclick = () => { stopPlay(); setTime(e.t0); };
  bindEventButtons(body);
  openInspector();
}

function focusEvent(idx: number): void {
  const e = state.sc.byIdx[idx];
  stopPlay();
  if (state.t < e.t0 || state.t > e.t1) setTime(e.t0);
  const span = state.view[1] - state.view[0];
  if (state.t < state.view[0] || state.t > state.view[1]) timeline.setView(state.t - span / 2, state.t + span / 2);
  const minZoomForEvent = state.sc.raw.view.zoom - (e.importance - LOD_BASE) / LOD_PER_ZOOM + 0.2;
  map.flyTo({ center: e.coords, zoom: Math.max(map.getZoom(), minZoomForEvent), duration: 1200 });
  inspectEvent(idx);
}

// ---------------------------------------------------------------------------
// Synchronie mondiale (F-50 à F-53, F-102) : index mondial léger
// ---------------------------------------------------------------------------
const WORLD_PER_REGION = 30;
const KIND_BUILD = new Set(["culture", "religion"]);
function worldTitle(it: World.WorldItem): string {
  const label = World.labelOf(it.qid)?.label || "…";
  if (it.kind === 1) {
    // Élision française : « Naissance d'Aristote »
    const de = I18n.getLang() === "fr" ? (/^[aeiouyhàâäéèêëîïôöûüœæ]/i.test(label) ? "d'" : "de ") : "";
    return t_("world.kind.1", { label, de });
  }
  if (it.kind === 2) return t_(KIND_BUILD.has(it.category) ? "world.kind.2.build" : "world.kind.2", { label });
  if (it.kind === 3) return t_("world.kind.3", { label });
  return label;
}
const worldDate = (it: World.WorldItem) => Time.format(it.t0, PRECISION_LEVEL[it.precision] || "year");
/**
 * Fenêtre « au même moment » : proportionnelle à l'échelle de la frise, élargie (jusqu'à ×4)
 * tant qu'elle contient trop peu d'éléments pour comparer les régions.
 */
let worldWin: [number, number] = [0, 0];
const worldWindow = (): [number, number] => worldWin;
async function computeWorldWindow(): Promise<World.WorldItem[]> {
  const base = Math.max((state.view[1] - state.view[0]) * 0.02, 2 / 365.25);
  const own = new Set(state.sc.events.map(e => e.qid).filter(Boolean));
  let all: World.WorldItem[] = [];
  for (const k of [1, 2, 4]) {
    const w = base * k;
    worldWin = [state.t - w, state.t + w];
    await World.ensure(worldWin[0], worldWin[1]);
    all = World.query(worldWin[0], worldWin[1], it => !own.has(it.qid));
    if (all.length >= 40) break;
  }
  return all;
}
let worldTimer = 0;
function scheduleWorld(): void {
  if (worldTimer) return;
  worldTimer = window.setTimeout(() => { worldTimer = 0; refreshWorld(); }, 200);
}
async function refreshWorld(): Promise<void> {
  const all = await computeWorldWindow();
  // Normalisation par région : les plus notables de chaque région, pour ne pas laisser l'Europe tout couvrir
  const per = new Map<string, number>();
  const items: World.WorldItem[] = [];
  for (const it of all) {
    if (state.hiddenCats.has(it.category)) continue;
    const n = per.get(it.region) || 0;
    if (n < WORLD_PER_REGION) { per.set(it.region, n + 1); items.push(it); }
  }
  state.worldAll = all;
  state.worldItems = items;
  const dateKey = Time.format(state.t, Time.levelForSpan(state.view[1] - state.view[0]));
  const sig = `${state.showWorld}|${items.map(i => i.qid).join(",")}`;
  if (sig === state.worldSig) {
    if (!state.selected && dateKey !== meanwhileDate) renderMeanwhile(); // seule la date affichée a changé
    return;
  }
  state.worldSig = sig;
  const maxSl = Math.max(1, ...items.map(i => i.sitelinks));
  (map.getSource("world") as GeoJSONSource | undefined)?.setData({
    type: "FeatureCollection",
    features: state.showWorld ? items.map(it => ({
      type: "Feature", geometry: { type: "Point", coordinates: it.coords },
      properties: { qid: it.qid, color: CAT[it.category]?.color || "#666", w: Math.round((it.sitelinks / maxSl) * 3 * 10) / 10 }
    })) : []
  });
  if (!state.selected) renderMeanwhile();
}

let meanwhileToken = 0, meanwhileDate = "";
/** Panneau « Pendant ce temps » (F-51) avec indicateur de couverture par région (F-102). */
function renderMeanwhile(): void {
  if (state.selected) return;
  const token = ++meanwhileToken;
  meanwhileDate = Time.format(state.t, Time.levelForSpan(state.view[1] - state.view[0]));
  const body = $("inspector-body");
  const [a, b] = worldWindow();
  const span = (b - a) / 2;
  const spanLabel = span >= 1 ? `${Math.round(span)} ${t_("unit.1y")}${Math.round(span) > 1 ? "s" : ""}` : `${Math.max(1, Math.round(span * 365))} ${t_("unit.1d")}${span * 365 >= 2 ? "s" : ""}`;
  const counts = new Map<string, number>();
  state.worldAll.forEach(it => counts.set(it.region, (counts.get(it.region) || 0) + 1));
  const maxC = Math.max(1, ...counts.values());
  const top = new Map<string, World.WorldItem[]>();
  for (const it of state.worldItems) {
    const l = top.get(it.region) || [];
    if (l.length < 3) { l.push(it); top.set(it.region, l); }
  }
  const qids = [...top.values()].flat().map(i => i.qid);
  const missing = qids.filter(q => !World.labelOf(q));
  if (missing.length) World.loadLabels(missing, I18n.getLang()).then(() => { if (token === meanwhileToken) renderMeanwhile(); });
  const html = World.REGIONS.map(r => {
    const n = counts.get(r) || 0;
    const items = top.get(r) || [];
    return `<section class="mw-region">
      <div class="mw-head"><strong>${esc(t_("region." + r))}</strong>
        <span class="mw-cov" title="${esc(t_("world.coverage", { n }))}"><span style="width:${Math.round((n / maxC) * 100)}%"></span></span>
        ${n < 3 ? `<span class="mw-sparse">${esc(t_("world.sparse"))}</span>` : ""}</div>
      ${items.length ? `<ul class="event-list">${items.map(it => `<li><button data-wq="${it.qid}">
        <span class="ico" aria-hidden="true">${CAT[it.category]?.icon || "•"}</span><span class="y">${esc(worldDate(it))}</span><span>${esc(worldTitle(it))}</span></button></li>`).join("")}</ul>` : ""}
    </section>`;
  }).join("");
  body.innerHTML = `<div class="brief"><h2>🌍 ${esc(t_("world.title"))}</h2>
    <p class="muted small">${esc(t_("world.window", { date: Time.format(state.t, Time.levelForSpan(state.view[1] - state.view[0])), span: spanLabel }))}</p></div>
    ${state.worldAll.length ? html : `<p class="muted">${esc(t_("world.empty"))}</p>`}
    <p class="muted small">${esc(t_("world.bias"))}</p>
    <p class="muted small">${esc(t_("inspector.empty"))}</p>`;
  body.querySelectorAll<HTMLElement>("[data-wq]").forEach(btn => btn.onclick = () => {
    const it = state.worldItems.find(x => x.qid === btn.dataset.wq);
    if (it) inspectWorld(it, true);
  });
}

async function inspectWorld(it: World.WorldItem, fly: boolean): Promise<void> {
  const token = ++state.inspectToken;
  state.selected = { kind: "world", qid: it.qid };
  map.setFilter("states-selected", ["==", ["get", "NAME"], "\u0000"]);
  if (fly) map.flyTo({ center: it.coords, zoom: Math.max(map.getZoom(), 5), duration: 1200 });
  await World.loadLabels([it.qid], I18n.getLang());
  if (token !== state.inspectToken) return;
  const info = World.labelOf(it.qid) || {};
  const c = CAT[it.category];
  const inRange = it.t0 >= state.sc.bounds[0] && it.t0 <= state.sc.bounds[1];
  const built = await World.builtAt();
  const body = $("inspector-body");
  body.innerHTML = `
    <button id="btn-mw-back" class="ghost small">${esc(t_("world.back"))}</button>
    <div class="brief">
      <h2><span class="ico-lg" aria-hidden="true">${c?.icon || "🌍"}</span>${esc(worldTitle(it))}</h2>
      <div><span class="chip" style="background:${c?.color || "#666"}">${esc(c ? catLabel(c) : it.category)}</span></div>
      <p class="muted">${esc(worldDate(it))} · ${esc(t_("region." + it.region))}</p>
      <div class="actions">
        <button id="btn-zoom-w">${esc(t_("inspector.zoomPlace"))}</button>
        <button id="btn-goto-w">${esc(inRange ? t_("inspector.goto", { date: worldDate(it) }) : t_("world.goExplore"))}</button>
      </div>
    </div>`;
  body.appendChild(drawer("facts", t_("inspector.facts"), `${info.description ? `<p>${esc(info.description)}</p>` : ""}<dl class="facts">
      <dt>${esc(t_("inspector.date"))}</dt><dd>${esc(worldDate(it))}</dd>
      <dt>${esc(t_("world.region"))}</dt><dd>${esc(t_("region." + it.region))}</dd>
    </dl>`));
  if (info.frwiki) body.appendChild(drawer("summary", t_("inspector.summary"), wikiBlock(Wiki.summary(info.frwiki), token)));
  body.appendChild(drawer("sources", t_("inspector.sources"), `<dl class="facts">
      <dt>${esc(t_("inspector.dataSource"))}</dt><dd><a href="${wdUrl(it.qid)}" target="_blank" rel="noopener">${esc(t_("inspector.wikidataSource", { qid: it.qid }))}</a></dd>
      <dt>${esc(t_("inspector.datePrecision"))}</dt><dd>${esc(t_("precision." + it.precision))}</dd>
      <dt>${esc(t_("inspector.placePrecision"))}</dt><dd>${esc(t_("precision.place." + it.placePrecision))}</dd>
      ${built ? `<dt>Index</dt><dd>${esc(t_("world.source", { date: new Date(built).toLocaleDateString(I18n.getLang()) }))}</dd>` : ""}
    </dl><p class="small"><a href="${wdUrl(it.qid)}" target="_blank" rel="noopener">✎ ${esc(t_("inspector.fixOnWikidata"))}</a></p>`));
  if (info.frwiki) body.appendChild(articleDrawer(() => Promise.resolve({ title: info.frwiki!, lang: "fr" }), token));
  body.querySelector(".brief .actions")!.appendChild(teacher.button({
    id: "ev:" + it.qid, kind: "world", title: worldTitle(it), t: it.t0, dateLabel: worldDate(it), coords: it.coords, wiki: info.frwiki,
    event: worldToEvent({ ...it, title: worldTitle(it), description: info.description, wiki: info.frwiki })
  }));
  $("btn-mw-back").onclick = () => clearSelection();
  $("btn-zoom-w").onclick = () => map.flyTo({ center: it.coords, zoom: it.placePrecision === "exact" ? 11 : 6, duration: 1600 });
  $("btn-goto-w").onclick = () => {
    stopPlay();
    if (inRange) setTime(it.t0, { follow: true });
    else { setScenario("libre", { t: it.t0, fly: false }); map.flyTo({ center: it.coords, zoom: 5, duration: 1600 }); }
  };
  openInspector();
}

/** Frises parallèles par région (F-53) : éléments marquants de l'index sur la période visible. */
let lanesTimer = 0;
function scheduleLanes(): void {
  clearTimeout(lanesTimer);
  lanesTimer = window.setTimeout(refreshLanes, 300);
}
async function refreshLanes(): Promise<void> {
  $("btn-lanes").setAttribute("aria-pressed", String(state.lanesOn));
  if (!state.lanesOn) { state.laneItems = []; timeline.setLanes([]); return; }
  const [v0, v1] = state.view;
  await World.ensure(v0, v1);
  const items: World.WorldItem[] = [];
  const lanes: TimelineLane[] = World.REGIONS.map(r => {
    const evs: TimelineEvent[] = World.query(v0, v1, it => it.region === r).slice(0, 120).map(it => {
      items.push(it);
      return { t0: it.t0, t1: Math.max(it.t1, it.t0), color: CAT[it.category]?.color || "#666", category: it.category, title: worldTitle(it), dateLabel: worldDate(it), idx: items.length - 1 };
    });
    return { id: r, label: t_("regionShort." + r), items: evs };
  });
  state.laneItems = items;
  timeline.setLanes(lanes);
}

// ---------------------------------------------------------------------------
// Interactions carte
// ---------------------------------------------------------------------------
map.on("mousemove", e => {
  const ev = map.queryRenderedFeatures(e.point, { layers: ["events", "clusters", "paths-steps", "paths-head", "world-dots"] })[0];
  if (ev) {
    map.getCanvas().style.cursor = "pointer";
    setHover(null);
    const pr = ev.properties || {};
    if (pr.qid && ev.layer.id === "world-dots") {
      const it = state.worldItems.find(x => x.qid === pr.qid);
      const ll = (ev.geometry as GeoJSON.Point).coordinates as Pt;
      const show = () => it && popup.setLngLat(ll).setHTML(`🌍 <strong>${esc(worldTitle(it))}</strong><br><span class="muted">${esc(worldDate(it))} · ${esc(t_("region." + it.region))}</span>`).addTo(map);
      show();
      if (it && !World.labelOf(it.qid)) World.loadLabels([it.qid], I18n.getLang()).then(show);
      return;
    }
    const html = pr.title ? `<strong>${esc(pr.title)}</strong>`
      : pr.kind === "step" ? `${esc(t_("inspector.path"))} · <strong>${esc(pr.label)}</strong> (${esc(pr.date)})`
      : pr.kind === "head" ? `➜ <strong>${esc(pr.label)}</strong>` : "";
    if (html) popup.setLngLat((ev.geometry as GeoJSON.Point).coordinates as Pt).setHTML(html).addTo(map);
    else popup.remove();
    return;
  }
  const uf = map.queryRenderedFeatures(e.point, { layers: ["user-fill"] })[0];
  if (uf) {
    map.getCanvas().style.cursor = "pointer";
    setHover(null);
    popup.setLngLat(e.lngLat).setHTML(`📥 <strong>${esc(uf.properties._name)}</strong>`).addTo(map);
    return;
  }
  const st = state.showStates ? map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0] : undefined;
  if (st) {
    map.getCanvas().style.cursor = "pointer";
    setHover(Number(st.id));
    popup.setLngLat(e.lngLat).setHTML(esc(stateLabel(st.properties, Time.histYear(state.t)) || "")).addTo(map);
  } else {
    map.getCanvas().style.cursor = "";
    setHover(null);
    popup.remove();
  }
});
map.on("mouseout", () => { setHover(null); popup.remove(); });
function setHover(id: number | null): void {
  if (state.hoverId === id) return;
  if (state.hoverId !== null) map.setFeatureState({ source: "states", id: state.hoverId }, { hover: false });
  state.hoverId = id;
  if (id !== null) map.setFeatureState({ source: "states", id }, { hover: true });
}
map.on("click", async e => {
  if (teacher.mapClick(e.lngLat)) return;
  const box: [Pt, Pt] = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
  const cl = map.queryRenderedFeatures(box, { layers: ["clusters"] })[0];
  if (cl) {
    const z = await (map.getSource("events") as GeoJSONSource).getClusterExpansionZoom(cl.properties.cluster_id);
    map.easeTo({ center: (cl.geometry as GeoJSON.Point).coordinates as Pt, zoom: z + 0.2 });
    return;
  }
  const ev = map.queryRenderedFeatures(box, { layers: ["events"] })[0];
  if (ev) return inspectEvent(ev.properties.idx);
  const wd = map.queryRenderedFeatures(box, { layers: ["world-dots"] })[0];
  if (wd) { const it = state.worldItems.find(x => x.qid === wd.properties.qid); if (it) return inspectWorld(it, false); }
  const st: MapGeoJSONFeature | undefined = state.showStates ? map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0] : undefined;
  if (st) return inspectState({ id: st.id, properties: st.properties });
  clearSelection();
});
map.on("zoomend", () => refreshEvents());

// ---------------------------------------------------------------------------
// Contrôles
// ---------------------------------------------------------------------------
function fillStatic(): void {
  fillScenarioSelect();
  $<HTMLSelectElement>("opt-lang").innerHTML = I18n.languages.map(l => `<option value="${l}">${({ fr: "Français", en: "English" } as Record<string, string>)[l] || l}</option>`).join("");
  $<HTMLSelectElement>("opt-lang").value = I18n.getLang();
  $<HTMLInputElement>("search").placeholder = t_("search.placeholder");
  $("sources").innerHTML = t_("sources.text", {
    basemaps: `<a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>`,
    wikipedia: `<a href="https://fr.wikipedia.org" target="_blank" rel="noopener">Wikipédia</a>`
  }) + ` · <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a> (CC0)`;
}
$<HTMLSelectElement>("scenario-select").onchange = e => setScenario((e.target as HTMLSelectElement).value);
$("btn-play").onclick = () => (state.playing ? stopPlay() : startPlay());
$("btn-prev").onclick = () => { stopPlay(); setTime(state.t - stepSize(), { follow: true }); };
$("btn-next").onclick = () => { stopPlay(); setTime(state.t + stepSize(), { follow: true }); };
$("btn-tzoom-in").onclick = () => timeline.zoom(0.5);
$("btn-tzoom-out").onclick = () => timeline.zoom(2);
$("btn-tfit").onclick = () => timeline.fit();
$("btn-lanes").onclick = () => { state.lanesOn = !state.lanesOn; store.set("lanes", state.lanesOn); refreshLanes(); };
document.addEventListener("keydown", e => {
  if (teacher.key(e)) return;
  const target = e.target as HTMLElement;
  if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(target.tagName) || target === timeline.canvas) {
    if (e.key === "Escape" && target.id !== "search") clearSelection();
    return;
  }
  if (e.key === "ArrowLeft") { stopPlay(); setTime(state.t - stepSize(), { follow: true }); }
  else if (e.key === "ArrowRight") { stopPlay(); setTime(state.t + stepSize(), { follow: true }); }
  else if (e.key === " ") { e.preventDefault(); if (state.playing) stopPlay(); else startPlay(); }
  else if (e.key === "Escape") clearSelection();
  else if (e.key === "/") { e.preventDefault(); $("search").focus(); }
});

// Recherche
const searchInput = $<HTMLInputElement>("search");
searchInput.addEventListener("input", onSearchInput);
searchInput.addEventListener("keydown", e => {
  if (e.key === "ArrowDown" && searchItems.length) { e.preventDefault(); searchActive = (searchActive + 1) % searchItems.length; renderSearch(); }
  else if (e.key === "ArrowUp" && searchItems.length) { e.preventDefault(); searchActive = (searchActive - 1 + searchItems.length) % searchItems.length; renderSearch(); }
  else if (e.key === "Enter") { e.preventDefault(); if (searchActive >= 0) chooseSearch(searchActive); }
  else if (e.key === "Escape") { closeSearch(); searchInput.blur(); }
});
searchInput.addEventListener("blur", () => setTimeout(closeSearch, 150));
$("generating-cancel").onclick = () => { genAbort.cancelled = true; $("generating").hidden = true; };

$<HTMLInputElement>("opt-trail").onchange = () => refreshEvents(true);
$<HTMLInputElement>("opt-labels").onchange = e => map.setLayoutProperty("state-labels", "visibility", (e.target as HTMLInputElement).checked && state.showStates ? "visible" : "none");
$<HTMLInputElement>("opt-modern").onchange = e => MODERN_LAYERS.forEach(l => map.setLayoutProperty(l, "visibility", (e.target as HTMLInputElement).checked ? "visible" : "none"));
$<HTMLInputElement>("opt-globe").onchange = e => map.setProjection({ type: (e.target as HTMLInputElement).checked ? "globe" : "mercator" });
$<HTMLInputElement>("opt-cvd").checked = state.cvd;
$<HTMLInputElement>("opt-cvd").onchange = e => {
  state.cvd = (e.target as HTMLInputElement).checked; store.set("cvd", state.cvd);
  state.sig.actors = ""; setTime(state.t); renderLegend();
};
$<HTMLInputElement>("opt-import").onchange = e => {
  const f = (e.target as HTMLInputElement).files?.[0];
  if (f) importBorders(f);
};
$<HTMLInputElement>("opt-dynamic").checked = state.dynamic;
$<HTMLInputElement>("opt-dynamic").onchange = e => {
  state.dynamic = (e.target as HTMLInputElement).checked;
  store.set("dynamicBorders", state.dynamic);
  state.morph = null;
  refreshStates(true);
  schedulePlan(200);
};
$<HTMLSelectElement>("opt-borders").value = state.bordersMode;
$<HTMLSelectElement>("opt-borders").onchange = e => {
  state.bordersMode = (e.target as HTMLSelectElement).value as Borders.BordersMode;
  store.set("bordersMode", state.bordersMode);
  state.frame = null;
  state.morph = null;
  state.actorNames.clear();
  refreshStates(true);
  schedulePlan(200);
  writeHash();
};
$<HTMLSelectElement>("opt-basemap").onchange = e => {
  const sat = (e.target as HTMLSelectElement).value === "satellite";
  map.setLayoutProperty("satellite", "visibility", sat ? "visible" : "none");
  BASE_LAYERS.forEach(l => map.setLayoutProperty(l, "visibility", sat ? "none" : "visible"));
};
$<HTMLSelectElement>("opt-lang").onchange = e => {
  I18n.setLang((e.target as HTMLSelectElement).value);
  scenarios.forEach(s => s.events.forEach(ev => (ev.dateLabel = eventDateLabel(ev))));
  fillStatic(); renderScenarioInfo(); renderFilters(); renderChronology(); clearSelection();
  timeline.draw(); updateDateLabel(); refreshEvents(true);
  if (state.frame) $("snapshot-badge").textContent = bordersBadge(state.frame);
};
$("btn-toggle-left").onclick = () => $("left-panel").classList.toggle("open");
$("btn-close-inspector").onclick = () => $("inspector").classList.remove("open");
// Onglets du panneau gauche
const tabs: [string, string][] = [["tab-subject", "pane-subject"], ["tab-chrono", "pane-chrono"], ["tab-prep", "pane-prep"]];
tabs.forEach(([tabId]) => $(tabId).onclick = () => tabs.forEach(([tid, pid]) => {
  const on = tid === tabId;
  $(tid).setAttribute("aria-selected", String(on));
  $(pid).hidden = !on;
}));

Net.onStatus(s => { $("offline").hidden = s.online; });

// ---------------------------------------------------------------------------
// Lien partageable : #s=<sujet>&t=<temps>&v=<début>,<fin>&f=<catégories masquées>
// Les sujets générés (s=wd:Q…) sont recréés à l'ouverture du lien s'ils ne sont pas mémorisés.
// ---------------------------------------------------------------------------
let hashTimer = 0;
function writeHash(): void {
  clearTimeout(hashTimer);
  hashTimer = window.setTimeout(() => {
    const p = new URLSearchParams();
    p.set("s", state.sc.id);
    p.set("t", state.t.toFixed(6));
    p.set("v", state.view.map(x => x.toFixed(6)).join(","));
    if (state.hiddenCats.size) p.set("f", [...state.hiddenCats].join(","));
    if (state.bordersMode === "precise") p.set("b", "p");
    history.replaceState(null, "", "#" + p.toString());
  }, 300);
}
function readHash() {
  const p = new URLSearchParams(location.hash.slice(1));
  const out: { s: string | null; t?: number; view?: [number, number]; hidden?: string[] } = { s: p.get("s") };
  if (p.has("t")) out.t = parseFloat(p.get("t")!);
  else if (p.has("y")) out.t = Time.fromHistYear(parseInt(p.get("y")!, 10));
  if (p.has("v")) { const v = p.get("v")!.split(",").map(Number); if (v.length === 2 && v.every(Number.isFinite)) out.view = [v[0], v[1]]; }
  if (p.has("f")) out.hidden = p.get("f")!.split(",").filter(Boolean);
  if (p.get("b") === "p") { state.bordersMode = "precise"; $<HTMLSelectElement>("opt-borders").value = "precise"; }
  return out;
}
async function openFromHash(fly: boolean): Promise<void> {
  const h = readHash();
  if (h.hidden) state.hiddenCats = new Set(h.hidden);
  if (h.s?.startsWith("wd:") && !scenarios.some(s => s.id === h.s)) {
    setScenario(scenarios[0].id, { fly: false });
    await generateSubject(h.s.slice(3), h.s.slice(3));
    if (state.sc.id === h.s && Number.isFinite(h.t)) setTime(h.t!);
    return;
  }
  setScenario(h.s || scenarios[0].id, { t: Number.isFinite(h.t) ? h.t : undefined, view: h.view, fly });
}
window.addEventListener("hashchange", () => {
  const h = readHash();
  if (h.s === state.sc.id && Number.isFinite(h.t) && Math.abs(h.t! - state.t) < 1e-6) return; // notre propre écriture
  openFromHash(true);
});

// ---------------------------------------------------------------------------
// Mode Préparation, paquets hors ligne, visite guidée (phase 5)
// ---------------------------------------------------------------------------
const teacher: Teacher = new Teacher({
  map, t: t_, lang: I18n.getLang,
  current: () => ({ sc: state.sc, t: state.t, view: state.view, bordersMode: state.bordersMode }),
  setScenario: (id, o) => setScenario(id, o),
  setTime: t => { stopPlay(); setTime(t, { follow: true }); },
  setBordersMode: m => {
    if (state.bordersMode === m) return;
    state.bordersMode = m;
    $<HTMLSelectElement>("opt-borders").value = m;
    state.frame = null; state.morph = null; state.actorNames.clear();
    refreshStates(true);
  },
  inspectEvent: idx => inspectEvent(idx),
  inspectStateByName: name => {
    const f = state.decorated?.features.find(x => x.properties?.NAME === name);
    if (f) inspectState({ id: f.id, properties: f.properties! });
  },
  addScenario: spec => {
    const sc = normalize(spec);
    const i = scenarios.findIndex(s => s.id === sc.id);
    if (i >= 0) scenarios.splice(i, 1);
    scenarios.push(sc);
    fillScenarioSelect();
  },
  refresh: () => renderChronology()
});

// Application installable et utilisable hors ligne (service worker, en production)
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => { /* indisponible : mode en ligne seul */ }));
}

// ---------------------------------------------------------------------------
// Démarrage
// ---------------------------------------------------------------------------
I18n.apply();
fillStatic();
map.on("load", () => {
  map.setProjection({ type: "globe" });
  addCategoryIcons();
  addArrowIcon();
  openFromHash(false).then(() => {
    const r = state.sc.raw;
    if (r.bbox) map.fitBounds([[r.bbox[0], r.bbox[1]], [r.bbox[2], r.bbox[3]]], { padding: 40, duration: 0, maxZoom: 11 });
    else map.jumpTo({ center: r.view.center, zoom: r.view.zoom });
  });
});

// Exposé pour le débogage dans la console
(window as any).Histomap = { state, map, timeline, setTime, setScenario, generateSubject };
