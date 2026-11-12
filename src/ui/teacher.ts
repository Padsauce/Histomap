/*
 * Mode Préparation et hors ligne (F-80 à F-86).
 * - Panier du sujet : éléments ajoutés depuis l'inspecteur ou la chronologie, réorganisables, annotés.
 * - Notes sur la carte (F-85).
 * - Paquet .histomap (F-82) : sujet, étapes, textes et images, frontières découpées sur l'emprise.
 * - Ouverture d'un paquet sans réseau (F-83, avec le service worker de l'application).
 * - Visite guidée en mode présentation (F-84) et fiche élève imprimable (F-86).
 */
import maplibregl from "maplibre-gl";
import * as Time from "../core/time";
import * as Wiki from "../core/wiki";
import * as Net from "../core/net";
import * as Borders from "../core/borders";
import { morphService, morphKey } from "../core/morphstore";
import type { MorphData } from "../core/morph";
import type { EventSpec, Scenario, ScenarioSpec, CategoryId, Precision } from "../core/types";

type Pt = [number, number];
type FC = GeoJSON.FeatureCollection;

export interface BasketItem {
  id: string;
  kind: "event" | "world" | "state" | "view";
  title: string;
  t: number;
  dateLabel: string;
  view: { center: Pt; zoom: number };
  coords?: Pt;
  note: string;
  /** Données nécessaires pour reconstruire l'élément dans le paquet. */
  event?: EventSpec;
  wiki?: string;
}
export interface MapNote { id: string; coords: Pt; text: string }
interface Basket { title: string; items: BasketItem[]; notes: MapNote[] }

export interface TourStep { title: string; note: string; t: number; view: { center: Pt; zoom: number }; ref?: string }
export interface HistomapPackage {
  format: "histomap-package";
  version: 1;
  created: string;
  title: string;
  lang: string;
  scenario: ScenarioSpec;
  tour: TourStep[];
  notes: MapNote[];
  texts: Record<string, { title: string; extract: string; image?: string; url?: string }>;
  borders: { mode: Borders.BordersMode; hb: { year: number; fc: FC }[]; clio?: { from: number; to: number; fc: FC } };
  /** Transitions des frontières dynamiques, calculées sur les frontières du paquet (facultatif). */
  morphs?: Record<string, MorphData>;
}

export interface TeacherContext {
  map: maplibregl.Map;
  t: (k: string, p?: Record<string, string | number>) => string;
  lang: () => string;
  current: () => { sc: Scenario; t: number; view: [number, number]; bordersMode: Borders.BordersMode };
  setScenario: (id: string, opts?: { t?: number; fly?: boolean }) => void;
  setTime: (t: number) => void;
  setBordersMode: (m: Borders.BordersMode) => void;
  inspectEvent: (idx: number) => void;
  inspectStateByName: (name: string) => void;
  addScenario: (spec: ScenarioSpec) => void;
  refresh: () => void;
}

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase().slice(0, 60) || "sujet";

export class Teacher {
  ctx: TeacherContext;
  on = false;
  private basket: Basket = { title: "", items: [], notes: [] };
  private scId = "";
  private markers: maplibregl.Marker[] = [];
  private placingNote = false;
  private tour: { steps: TourStep[]; i: number } | null = null;

  constructor(ctx: TeacherContext) {
    this.ctx = ctx;
    this.bind();
  }

  // ------------------------------------------------------------------ Panier
  private storeKey() { return "histomap.basket." + this.scId; }
  /** Appelé à chaque changement de sujet : recharge le panier mémorisé de ce sujet. */
  onScenario(sc: Scenario, pkgNotes?: MapNote[]) {
    this.scId = sc.id;
    try { this.basket = JSON.parse(localStorage.getItem(this.storeKey()) || "null") || { title: sc.raw.title, items: [], notes: [] }; } catch { this.basket = { title: sc.raw.title, items: [], notes: [] }; }
    if (pkgNotes && !this.basket.notes.length) this.basket.notes = pkgNotes;
    this.renderNotes();
    this.render();
  }
  private save() { try { localStorage.setItem(this.storeKey(), JSON.stringify(this.basket)); } catch { /* stockage plein */ } }
  has(id: string) { return this.basket.items.some(i => i.id === id); }
  toggle(item: Omit<BasketItem, "note" | "view"> & { view?: BasketItem["view"] }) {
    const i = this.basket.items.findIndex(x => x.id === item.id);
    if (i >= 0) this.basket.items.splice(i, 1);
    else {
      const c = this.ctx.map.getCenter();
      this.basket.items.push({ ...item, view: item.view || { center: [c.lng, c.lat], zoom: this.ctx.map.getZoom() }, note: "" });
    }
    this.basket.items.sort((a, b) => a.t - b.t);
    this.save();
    this.render();
    this.ctx.refresh();
  }
  /** Bouton « Ajouter au sujet » à placer dans l'inspecteur (visible en mode Préparation). */
  button(item: Omit<BasketItem, "note" | "view">): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "prep-only prep-add";
    const upd = () => { b.textContent = this.has(item.id) ? "✓ " + this.ctx.t("prep.added") : "＋ " + this.ctx.t("prep.add"); b.setAttribute("aria-pressed", String(this.has(item.id))); };
    upd();
    b.onclick = () => { this.toggle(item); upd(); };
    return b;
  }

  setOn(on: boolean) {
    this.on = on;
    document.body.classList.toggle("prep", on);
    $("btn-prep").setAttribute("aria-pressed", String(on));
    if (on) $("tab-prep").click();
    this.ctx.refresh();
  }

  private render() {
    const list = $("prep-items");
    $<HTMLInputElement>("prep-title").value = this.basket.title;
    $("prep-count").textContent = this.ctx.t("prep.count", { n: this.basket.items.length });
    list.innerHTML = this.basket.items.map((it, i) => `
      <li data-i="${i}">
        <div class="prep-row">
          <span class="prep-n">${i + 1}</span>
          <span class="prep-txt"><span class="d">${esc(it.dateLabel)}</span><strong>${esc(it.title)}</strong></span>
          <span class="prep-ctl">
            <button class="ghost icon-btn" data-act="up" aria-label="${esc(this.ctx.t("prep.up"))}">↑</button>
            <button class="ghost icon-btn" data-act="down" aria-label="${esc(this.ctx.t("prep.down"))}">↓</button>
            <button class="ghost icon-btn" data-act="go" aria-label="${esc(this.ctx.t("prep.go"))}">◎</button>
            <button class="ghost icon-btn" data-act="del" aria-label="${esc(this.ctx.t("prep.remove"))}">✕</button>
          </span>
        </div>
        <textarea rows="2" data-act="note" placeholder="${esc(this.ctx.t("prep.notePlaceholder"))}">${esc(it.note)}</textarea>
      </li>`).join("") || `<li class="muted small">${esc(this.ctx.t("prep.empty"))}</li>`;
    list.querySelectorAll<HTMLElement>("li[data-i]").forEach(li => {
      const i = +li.dataset.i!;
      li.querySelectorAll<HTMLElement>("[data-act]").forEach(el => {
        const act = el.dataset.act;
        if (act === "note") el.oninput = () => { this.basket.items[i].note = (el as HTMLTextAreaElement).value; this.save(); };
        else el.onclick = () => {
          const items = this.basket.items;
          if (act === "up" && i > 0) [items[i - 1], items[i]] = [items[i], items[i - 1]];
          else if (act === "down" && i < items.length - 1) [items[i + 1], items[i]] = [items[i], items[i + 1]];
          else if (act === "del") items.splice(i, 1);
          else if (act === "go") { this.showStep(this.stepOf(items[i])); return; }
          this.save(); this.render(); this.ctx.refresh();
        };
      });
    });
    $("prep-notes").innerHTML = this.basket.notes.map((n, i) => `<li><span>📝 ${esc(n.text)}</span>
      <button class="ghost icon-btn" data-note="${i}" aria-label="${esc(this.ctx.t("prep.remove"))}">✕</button></li>`).join("");
    $("prep-notes").querySelectorAll<HTMLElement>("[data-note]").forEach(b => b.onclick = () => {
      this.basket.notes.splice(+b.dataset.note!, 1); this.save(); this.renderNotes(); this.render();
    });
  }

  // ------------------------------------------------------------------ Notes sur la carte (F-85)
  private renderNotes() {
    this.markers.forEach(m => m.remove());
    this.markers = this.basket.notes.map(n => {
      const el = document.createElement("div");
      el.className = "map-note";
      el.textContent = "📝 " + n.text;
      return new maplibregl.Marker({ element: el, anchor: "bottom-left" }).setLngLat(n.coords).addTo(this.ctx.map);
    });
  }
  private startNote() {
    this.placingNote = true;
    this.ctx.map.getCanvas().style.cursor = "crosshair";
    $("prep-status").textContent = this.ctx.t("prep.placeNote");
  }
  /** Clic sur la carte : renvoie true s'il a servi à placer une note. */
  mapClick(lngLat: { lng: number; lat: number }): boolean {
    if (!this.placingNote) return false;
    this.placingNote = false;
    this.ctx.map.getCanvas().style.cursor = "";
    $("prep-status").textContent = "";
    const text = prompt(this.ctx.t("prep.noteText"));
    if (text && text.trim()) {
      this.basket.notes.push({ id: String(Date.now()), coords: [lngLat.lng, lngLat.lat], text: text.trim().slice(0, 200) });
      this.save(); this.renderNotes(); this.render();
    }
    return true;
  }

  // ------------------------------------------------------------------ Visite guidée (F-84)
  private stepOf(it: BasketItem): TourStep { return { title: it.title, note: it.note, t: it.t, view: it.view, ref: it.id }; }
  startTour(steps?: TourStep[]) {
    steps = steps || this.basket.items.map(it => this.stepOf(it));
    if (!steps.length) { $("prep-status").textContent = this.ctx.t("prep.empty"); return; }
    this.tour = { steps, i: 0 };
    document.body.classList.add("touring");
    $("tour").hidden = false;
    document.documentElement.requestFullscreen?.().catch(() => { /* plein écran refusé : on continue */ });
    this.go(0);
  }
  stopTour() {
    this.tour = null;
    document.body.classList.remove("touring");
    $("tour").hidden = true;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
  private go(i: number) {
    if (!this.tour) return;
    const n = this.tour.steps.length;
    this.tour.i = Math.max(0, Math.min(n - 1, i));
    const st = this.tour.steps[this.tour.i];
    $("tour-n").textContent = `${this.tour.i + 1} / ${n}`;
    $("tour-title").textContent = st.title;
    $("tour-date").textContent = Time.format(st.t, "day");
    $("tour-note").textContent = st.note;
    $<HTMLButtonElement>("tour-prev").disabled = this.tour.i === 0;
    $<HTMLButtonElement>("tour-next").textContent = this.tour.i === n - 1 ? this.ctx.t("tour.end") : this.ctx.t("tour.next") + " →";
    this.showStep(st);
  }
  private showStep(st: TourStep) {
    this.ctx.setTime(st.t);
    this.ctx.map.flyTo({ center: st.view.center, zoom: st.view.zoom, duration: 1800 });
    const sc = this.ctx.current().sc;
    if (st.ref?.startsWith("ev:")) {
      const e = sc.events.find(x => (x.qid && "ev:" + x.qid === st.ref) || "ev:" + x.title === st.ref);
      if (e) this.ctx.inspectEvent(e.idx);
    } else if (st.ref?.startsWith("st:")) this.ctx.inspectStateByName(st.ref.slice(3).split("@")[0]);
  }
  /** Touches de la visite (prioritaires sur les raccourcis de la frise). */
  key(e: KeyboardEvent): boolean {
    if (!this.tour) return false;
    if (["ArrowRight", "PageDown", "Enter"].includes(e.key)) this.tour.i === this.tour.steps.length - 1 ? this.stopTour() : this.go(this.tour.i + 1);
    else if (["ArrowLeft", "PageUp"].includes(e.key)) this.go(this.tour.i - 1);
    else if (e.key === "Escape") this.stopTour();
    else return false;
    e.preventDefault();
    return true;
  }

  // ------------------------------------------------------------------ Paquet .histomap (F-82)
  async download() {
    const status = $("prep-status");
    const cur = this.ctx.current();
    const items = this.basket.items;
    if (!items.length) { status.textContent = this.ctx.t("prep.empty"); return; }
    status.textContent = this.ctx.t("prep.building");
    const sc = cur.sc.raw;
    // Événements retenus (ceux du sujet + éléments du monde convertis)
    const events: EventSpec[] = items.filter(i => i.event).map(i => i.event!);
    const points: Pt[] = [...events.map(e => e.coords), ...items.map(i => i.view.center), ...this.basket.notes.map(n => n.coords)];
    const bbox = bboxAround(points);
    // Textes et images (résumés Wikipédia), pour une lecture sans réseau
    const texts: HistomapPackage["texts"] = {};
    const titles = [...new Set(items.map(i => i.wiki || i.event?.wiki).filter(Boolean) as string[])];
    let done = 0;
    let missing = 0;
    for (const title of titles) {
      try {
        const w = await Wiki.summary(title).catch(async () => { await new Promise(r => setTimeout(r, 3000)); return Wiki.summary(title); });
        texts[title] = { title: w.title, extract: w.extract, url: w.url, image: w.image ? await toDataUrl(w.image).catch(() => undefined) : undefined };
      } catch { missing++; /* article indisponible : signalé à la fin */ }
      status.textContent = this.ctx.t("prep.buildingTexts", { n: ++done, total: titles.length });
    }
    status.textContent = this.ctx.t("prep.buildingBorders");
    const t0 = Time.parse(sc.range[0]).t, t1 = Time.endOf(sc.range[1]);
    const borders = await collectBorders(cur.bordersMode, t0, t1, bbox);
    // Transitions des frontières dynamiques, calculées sur les frontières exactes du paquet
    let morphs: Record<string, MorphData> | undefined;
    if ($<HTMLInputElement>("prep-morphs").checked) {
      const pairs = await Borders.framePairs(t0, t1, borders.mode, 300, borders);
      const keys: string[] = [];
      let n = 0;
      for (const p of pairs) {
        const key = morphKey(p.A, p.B);
        status.textContent = this.ctx.t("prep.buildingMorphs", { n: ++n, total: pairs.length });
        if (await morphService.has(key) || await morphService.compute(key, p.A.fc, p.B.fc, { timeout: 120000, background: false })) keys.push(key);
      }
      morphs = await morphService.export(keys);
    }
    const scenario: ScenarioSpec = {
      ...sc,
      id: "pkg:" + slug(this.basket.title || sc.title),
      title: this.basket.title || sc.title,
      kind: "curated",
      events,
      bbox: bbox && [bbox[0], bbox[1], bbox[2], bbox[3]],
      notes: [...(sc.notes || []), this.ctx.t("prep.packageNote", { date: new Date().toLocaleDateString(this.ctx.lang()) })]
    };
    const pkg: HistomapPackage = {
      format: "histomap-package", version: 1, created: new Date().toISOString(),
      title: scenario.title, lang: this.ctx.lang(), scenario,
      tour: items.map(i => this.stepOf(i)), notes: this.basket.notes, texts, borders, morphs
    };
    const blob = await gzip(JSON.stringify(pkg));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = slug(scenario.title) + ".histomap";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = this.ctx.t("prep.downloaded", { size: (blob.size / 1e6).toFixed(1) }) + (missing ? " " + this.ctx.t("prep.textsMissing", { n: missing }) : "");
  }

  // ------------------------------------------------------------------ Ouverture (F-83)
  async open(file: File) {
    const status = $("prep-status");
    try {
      const text = await gunzipIfNeeded(file);
      const pkg = JSON.parse(text) as HistomapPackage;
      if (pkg.format !== "histomap-package") throw new Error(this.ctx.t("prep.badFile"));
      Borders.installPackage(pkg.borders);
      if (pkg.morphs) await morphService.import(pkg.morphs); // transitions prêtes, sans recalcul
      if (pkg.borders.clio) this.ctx.setBordersMode("precise");
      for (const [title, x] of Object.entries(pkg.texts || {})) {
        // Les résumés sont servis depuis le paquet, sans réseau
        Net.prime(`https://fr.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, "_"))}`,
          { type: "standard", title: x.title, extract: x.extract, thumbnail: x.image ? { source: x.image } : undefined, content_urls: { desktop: { page: x.url } } });
      }
      // Les étapes renvoient aux événements par leur identifiant
      pkg.tour.forEach(st => { if (st.ref?.startsWith("ev:")) { /* déjà au bon format */ } });
      this.ctx.addScenario(pkg.scenario);
      try { localStorage.setItem("histomap.basket." + pkg.scenario.id, JSON.stringify({ title: pkg.title, items: [], notes: pkg.notes })); } catch { /* idem */ }
      this.pkgTours.set(pkg.scenario.id, pkg.tour);
      this.ctx.setScenario(pkg.scenario.id);
      status.textContent = this.ctx.t("prep.opened", { title: pkg.title, n: pkg.tour.length });
      $("btn-tour-pkg").hidden = false;
    } catch (err) {
      status.textContent = this.ctx.t("prep.openError", { error: (err as Error).message });
    }
  }
  pkgTours = new Map<string, TourStep[]>();

  // ------------------------------------------------------------------ Fiche élève (F-86)
  printSheet() {
    const map = this.ctx.map;
    map.once("render", () => {
      let img = "";
      try { img = map.getCanvas().toDataURL("image/png"); } catch { /* tuiles sans CORS : pas d'image */ }
      const t = this.ctx.t;
      const rows = this.basket.items.map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.dateLabel)}</td><td><strong>${esc(it.title)}</strong>${it.note ? `<br><em>${esc(it.note)}</em>` : ""}</td></tr>`).join("");
      const html = `<!doctype html><html lang="${this.ctx.lang()}"><head><meta charset="utf-8"><title>${esc(this.basket.title)}</title>
        <style>body{font:14px/1.5 Georgia,serif;margin:2rem;color:#111}h1{font-size:1.6rem}img{max-width:100%;border:1px solid #ccc}
        table{border-collapse:collapse;width:100%;margin:1rem 0}td{border-bottom:1px solid #ddd;padding:.4rem;vertical-align:top}
        .q{border-bottom:1px dotted #999;height:2rem}.src{font-size:.8rem;color:#555}@media print{button{display:none}}</style></head><body>
        <button onclick="print()">${esc(t("prep.print"))}</button>
        <h1>${esc(this.basket.title)}</h1>
        ${img ? `<img src="${img}" alt="">` : ""}
        <h2>${esc(t("sheet.chronology"))}</h2><table>${rows}</table>
        <h2>${esc(t("sheet.questions"))}</h2>
        ${this.basket.items.slice(0, 5).map(it => `<p>${esc(t("sheet.question", { title: it.title }))}</p><div class="q"></div><div class="q"></div>`).join("")}
        <p class="src">${esc(t("sheet.sources"))}</p></body></html>`;
      const w = window.open("", "_blank");
      if (w) { w.document.write(html); w.document.close(); }
      else $("prep-status").textContent = t("prep.popupBlocked");
    });
    map.triggerRepaint();
  }

  // ------------------------------------------------------------------ Liaisons
  private bind() {
    $("btn-prep").onclick = () => this.setOn(!this.on);
    $<HTMLInputElement>("prep-title").oninput = e => { this.basket.title = (e.target as HTMLInputElement).value; this.save(); };
    $("btn-prep-view").onclick = () => {
      const cur = this.ctx.current();
      this.toggle({ id: "view:" + Date.now(), kind: "view", title: this.ctx.t("prep.viewTitle"), t: cur.t, dateLabel: Time.format(cur.t, Time.levelForSpan(cur.view[1] - cur.view[0])) });
    };
    $("btn-prep-note").onclick = () => this.startNote();
    $("btn-tour").onclick = () => this.startTour();
    $("btn-tour-pkg").onclick = () => this.startTour(this.pkgTours.get(this.ctx.current().sc.id));
    $("btn-download").onclick = () => this.download();
    $("btn-print").onclick = () => this.printSheet();
    $<HTMLInputElement>("open-pkg").onchange = e => { const f = (e.target as HTMLInputElement).files?.[0]; if (f) this.open(f); };
    $("tour-prev").onclick = () => this.tour && this.go(this.tour.i - 1);
    $("tour-next").onclick = () => this.tour && (this.tour.i === this.tour.steps.length - 1 ? this.stopTour() : this.go(this.tour.i + 1));
    $("tour-close").onclick = () => this.stopTour();
  }
}

// ---------------------------------------------------------------------------
// Utilitaires du paquet
// ---------------------------------------------------------------------------
function bboxAround(points: Pt[]): [number, number, number, number] | undefined {
  if (!points.length) return undefined;
  const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
  const w = Math.min(...xs), e = Math.max(...xs), s = Math.min(...ys), n = Math.max(...ys);
  // Marge large : les voisins du sujet restent visibles sur la carte hors ligne
  const px = Math.max(12, (e - w) * 0.6), py = Math.max(8, (n - s) * 0.6);
  return [w - px, s - py, e + px, n + py];
}
function intersects(g: GeoJSON.Geometry | null, b: [number, number, number, number]): boolean {
  if (!g) return false;
  const polys = g.type === "Polygon" ? [g.coordinates] : g.type === "MultiPolygon" ? g.coordinates : [];
  for (const p of polys) for (const [x, y] of p[0]) if (x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3]) return true;
  return false;
}
/** Frontières de la période, limitées aux États qui touchent l'emprise du sujet. */
async function collectBorders(mode: Borders.BordersMode, t0: number, t1: number, bbox?: [number, number, number, number]): Promise<HistomapPackage["borders"]> {
  const keep = (fc: FC): FC => ({ type: "FeatureCollection", features: bbox ? fc.features.filter(f => intersects(f.geometry, bbox)) : fc.features });
  const hb: { year: number; fc: FC }[] = [];
  const snaps = Borders.SNAPSHOTS.filter((s, i, arr) => (s.t >= t0 && s.t <= t1) || (s.t < t0 && (arr[i + 1]?.t ?? Infinity) > t0));
  for (const s of snaps) {
    const fr = await Borders.frameFor(s.t, "fast");
    hb.push({ year: fr.year, fc: keep(fr.fc) });
  }
  let clio: HistomapPackage["borders"]["clio"];
  if (mode === "precise") {
    const recs = await Borders.clioRecords(Time.histYear(t0), Time.histYear(t1));
    if (recs) clio = { from: Time.histYear(t0), to: Time.histYear(t1), fc: keep(recs) };
  }
  return { mode, hb, clio };
}
async function toDataUrl(url: string): Promise<string> {
  const r = await fetch(url);
  const b = await r.blob();
  return new Promise((res, rej) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result)); fr.onerror = rej; fr.readAsDataURL(b); });
}
async function gzip(text: string): Promise<Blob> {
  if (typeof CompressionStream === "undefined") return new Blob([text], { type: "application/json" });
  const s = new Blob([text]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Response(s).blob().then(b => new Blob([b], { type: "application/gzip" }));
}
async function gunzipIfNeeded(file: File): Promise<string> {
  const head = new Uint8Array(await file.slice(0, 2).arrayBuffer());
  if (head[0] === 0x1f && head[1] === 0x8b) {
    const s = file.stream().pipeThrough(new DecompressionStream("gzip"));
    return new Response(s).text();
  }
  return file.text();
}

/** Convertit un élément de l'index mondial en événement de sujet (pour le paquet). */
export function worldToEvent(w: { qid: string; coords: Pt; t0: number; t1: number; precision: Precision; category: CategoryId; title: string; description?: string; wiki?: string; placePrecision: string }): EventSpec {
  const c = Time.fromT(w.t0);
  const date = w.precision === "day" ? `${c.Y}-${String(c.mo).padStart(2, "0")}-${String(c.d).padStart(2, "0")}` : w.precision === "month" ? `${c.Y}-${String(c.mo).padStart(2, "0")}` : String(c.Y);
  return {
    qid: w.qid, title: w.title, summary: w.description || "", category: w.category, date,
    precision: ["day", "month", "year"].includes(w.precision) ? undefined : w.precision,
    coords: w.coords, place: "", placePrecision: w.placePrecision === "exact" ? "exact" : w.placePrecision === "city" ? "city" : "country",
    wiki: w.wiki, importance: 80
  };
}
