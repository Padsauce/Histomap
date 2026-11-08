/* Histomap — application principale */
(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Données de frontières : instantanés datés du projet historical-basemaps.
  // Chargés à la demande depuis jsDelivr (version figée par commit).
  // ---------------------------------------------------------------------------
  const BASEMAPS_COMMIT = "4b5039e50d8d2464b065bd76ad6086cd4597108d";
  const BASEMAPS_URL = y =>
    `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAPS_COMMIT}/geojson/world_${y < 0 ? "bc" + (-y) : y}.geojson`;
  const SNAPSHOTS = [
    -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300,
    -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400,
    1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938,
    1945, 1960, 1994, 2000, 2010
  ];
  const PRECISION = { 1: "approximative", 2: "moyenne", 3: "établie (droit international)" };
  const ROLE_LABEL = { focus: "Sujet", "focus-sub": "Possession / vassal", rival: "Adversaire", "rival-sub": "Possession d'un adversaire", ally: "Allié", "ally-sub": "Possession d'un allié", other: "Autre État" };

  const SCENARIOS = window.HISTOMAP_SCENARIOS;
  const EVENT_TYPES = window.HISTOMAP_EVENT_TYPES;

  const state = {
    scenario: SCENARIOS[0],
    year: SCENARIOS[0].start,
    snapshot: null,          // année de l'instantané affiché
    geo: new Map(),          // cache : année d'instantané -> FeatureCollection brute
    labels: new Map(),       // cache : année d'instantané -> points d'étiquettes
    playing: null,
    selected: null,          // { kind: "state" | "event", ... }
    hoverId: null,
    inspectToken: 0
  };

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const yearOf = d => parseInt(String(d).split("-")[0], 10) * (String(d).startsWith("-") ? -1 : 1);
  function fmtYear(y) { return y < 0 ? `${-y} av. J.-C.` : String(y); }
  const MONTHS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
  function fmtDate(d) {
    const p = String(d).split("-");
    if (p.length === 3) return `${parseInt(p[2], 10) === 1 ? "1er" : parseInt(p[2], 10)} ${MONTHS[+p[1] - 1]} ${p[0]}`;
    if (p.length === 2) return `${MONTHS[+p[1] - 1]} ${p[0]}`;
    return fmtYear(+d);
  }
  function snapshotFor(year) {
    let s = SNAPSHOTS[0];
    for (const y of SNAPSHOTS) if (y <= year) s = y;
    return s;
  }
  function hashColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return `hsl(${h % 360}, ${38 + (h >> 9) % 18}%, ${62 + (h >> 13) % 12}%)`;
  }
  function lighten(hex, amt = 0.45) {
    const n = parseInt(hex.slice(1), 16);
    const c = [n >> 16, (n >> 8) & 255, n & 255].map(v => Math.round(v + (255 - v) * amt));
    return `rgb(${c.join(",")})`;
  }
  const inRanges = (y, when) => !when || when.some(([a, b]) => y >= a && y <= b);

  // Géométrie (coordonnées planes lon/lat : suffisant pour l'affichage)
  function ringArea(r) {
    let a = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]);
    return Math.abs(a / 2);
  }
  function polygons(geom) {
    if (!geom) return [];
    return geom.type === "Polygon" ? [geom.coordinates] : geom.type === "MultiPolygon" ? geom.coordinates : [];
  }
  function pointInRing(pt, r) {
    let inside = false;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [xi, yi] = r[i], [xj, yj] = r[j];
      if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  function pointInPoly(pt, poly) {
    if (!pointInRing(pt, poly[0])) return false;
    for (let k = 1; k < poly.length; k++) if (pointInRing(pt, poly[k])) return false;
    return true;
  }
  const pointInGeom = (pt, geom) => polygons(geom).some(p => pointInPoly(pt, p));
  function bboxOf(geom) {
    const b = [Infinity, Infinity, -Infinity, -Infinity];
    for (const p of polygons(geom)) for (const [x, y] of p[0]) {
      if (x < b[0]) b[0] = x; if (y < b[1]) b[1] = y; if (x > b[2]) b[2] = x; if (y > b[3]) b[3] = y;
    }
    return b;
  }
  /** Point d'étiquette : centre du plus grand polygone, recalé à l'intérieur si besoin. */
  function labelPoint(geom) {
    let best = null, bestA = -1;
    for (const p of polygons(geom)) { const a = ringArea(p[0]); if (a > bestA) { bestA = a; best = p; } }
    if (!best) return null;
    const ring = best[0];
    let cx = 0, cy = 0;
    for (const [x, y] of ring) { cx += x; cy += y; }
    cx /= ring.length; cy /= ring.length;
    if (pointInPoly([cx, cy], best)) return { pt: [cx, cy], area: bestA };
    const [x0, y0, x1, y1] = bboxOf({ type: "Polygon", coordinates: best });
    let cand = null, cd = Infinity;
    const N = 10;
    for (let i = 1; i < N; i++) for (let j = 1; j < N; j++) {
      const p = [x0 + (x1 - x0) * i / N, y0 + (y1 - y0) * j / N];
      if (!pointInPoly(p, best)) continue;
      const d = (p[0] - cx) ** 2 + (p[1] - cy) ** 2;
      if (d < cd) { cd = d; cand = p; }
    }
    return { pt: cand || ring[0], area: bestA };
  }

  // ---------------------------------------------------------------------------
  // Rôles et couleurs des États pour le scénario / l'année courants
  // ---------------------------------------------------------------------------
  function activeActors() {
    return state.scenario.actors.filter(a => inRanges(state.year, a.when));
  }
  function roleOf(props) {
    const name = props.NAME || "";
    const suzerain = props.SUBJECTO || "";
    for (const a of activeActors()) {
      if (a.match.includes(name)) return { role: a.role, color: a.color, actor: a };
    }
    for (const a of activeActors()) {
      if (suzerain && suzerain !== name && a.match.includes(suzerain)) return { role: a.role + "-sub", color: lighten(a.color), actor: a };
    }
    return { role: "other", color: name ? hashColor(name) : "#cccccc", actor: null };
  }

  function decorate(fc) {
    const features = fc.features.map((f, i) => {
      const r = roleOf(f.properties);
      return {
        type: "Feature", id: i, geometry: f.geometry,
        properties: { ...f.properties, _role: r.role, _color: r.color, _key: r.role === "other" ? 0 : 1 }
      };
    });
    return { type: "FeatureCollection", features };
  }

  function labelFeatures(snap) {
    if (state.labels.has(snap)) return state.labels.get(snap);
    const fc = state.geo.get(snap);
    const byName = new Map();
    fc.features.forEach(f => {
      const name = f.properties.NAME;
      if (!name) return;
      const lp = labelPoint(f.geometry);
      if (!lp) return;
      const prev = byName.get(name);
      if (!prev || lp.area > prev.area) byName.set(name, { ...lp, props: f.properties });
    });
    const pts = [...byName.entries()].map(([name, lp]) => ({ name, ...lp }));
    state.labels.set(snap, pts);
    return pts;
  }

  function labelCollection(snap) {
    return {
      type: "FeatureCollection",
      features: labelFeatures(snap).map(l => {
        const r = roleOf(l.props);
        const ent = Wiki.resolveEntity(l.name, state.year);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: l.pt },
          properties: {
            label: ent ? ent.label : l.name,
            area: l.area,
            sort: (r.role === "other" ? 0 : 1e6) + l.area,
            important: r.role === "other" ? 0 : 1
          }
        };
      })
    };
  }

  // ---------------------------------------------------------------------------
  // Événements
  // ---------------------------------------------------------------------------
  function eventsCollection() {
    const sc = state.scenario, y = state.year, trail = $("opt-trail").checked;
    const linger = sc.linger ?? 2;
    const features = [];
    sc.events.forEach((e, i) => {
      const a = yearOf(e.date), b = e.end ? yearOf(e.end) : a;
      if (y < a) return;
      let phase;
      if (y <= b) phase = "active";
      else if (y <= b + linger) phase = "fading";
      else if (trail) phase = "past";
      else return;
      const t = EVENT_TYPES[e.type] || EVENT_TYPES.politique;
      const age = y - b;
      features.push({
        type: "Feature", id: i,
        geometry: { type: "Point", coordinates: e.coords },
        properties: {
          idx: i, title: e.title, color: t.color, phase,
          opacity: phase === "active" ? 1 : phase === "fading" ? Math.max(0.35, 1 - age / (linger + 1)) : 0.3,
          radius: phase === "past" ? 4 : 7
        }
      });
    });
    return { type: "FeatureCollection", features };
  }

  // ---------------------------------------------------------------------------
  // Carte
  // ---------------------------------------------------------------------------
  const cartoTiles = layer => ["a", "b", "c", "d"].map(s => `https://${s}.basemaps.cartocdn.com/rastertiles/${layer}/{z}/{x}/{y}.png`);
  const map = new maplibregl.Map({
    container: "map",
    hash: false,
    attributionControl: { compact: true },
    center: state.scenario.view.center,
    zoom: state.scenario.view.zoom,
    maxZoom: 16,
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        voyager: { type: "raster", tiles: cartoTiles("voyager_nolabels"), tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" },
        modern: { type: "raster", tiles: cartoTiles("voyager_only_labels"), tileSize: 256 },
        satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagerie © Esri" },
        states: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "Frontières : historical-basemaps (GPL-3.0)" },
        labels: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        events: { type: "geojson", data: { type: "FeatureCollection", features: [] } }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#c9dbe6" } },
        { id: "voyager", type: "raster", source: "voyager", paint: { "raster-saturation": -0.4 } },
        { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
        {
          id: "states-fill", type: "fill", source: "states",
          paint: {
            "fill-color": ["get", "_color"],
            "fill-opacity": ["case",
              ["boolean", ["feature-state", "hover"], false], 0.75,
              ["==", ["get", "_role"], "other"], 0.32,
              0.58]
          }
        },
        {
          id: "states-line", type: "line", source: "states",
          paint: { "line-color": "#4b5563", "line-opacity": 0.45, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 1.2] }
        },
        {
          id: "states-key-line", type: "line", source: "states",
          filter: ["in", ["get", "_role"], ["literal", ["focus", "rival", "ally"]]],
          paint: { "line-color": ["get", "_color"], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 8, 3] }
        },
        {
          id: "states-selected", type: "line", source: "states",
          filter: ["==", ["id"], -1],
          paint: { "line-color": "#111827", "line-width": 2.5, "line-dasharray": [2, 1] }
        },
        { id: "modern", type: "raster", source: "modern", layout: { visibility: "none" }, paint: { "raster-opacity": 0.85 } },
        {
          id: "state-labels", type: "symbol", source: "labels",
          layout: {
            "text-field": ["get", "label"],
            "text-font": ["Open Sans Semibold"],
            "text-size": ["interpolate", ["linear"], ["zoom"], 1, ["case", ["==", ["get", "important"], 1], 12, 10], 6, ["case", ["==", ["get", "important"], 1], 18, 14]],
            "text-max-width": 8,
            "symbol-sort-key": ["-", 0, ["get", "sort"]],
            "text-padding": 4
          },
          paint: { "text-color": "#1f2937", "text-halo-color": "rgba(255,255,255,.85)", "text-halo-width": 1.4 }
        },
        {
          id: "events-halo", type: "circle", source: "events",
          filter: ["==", ["get", "phase"], "active"],
          paint: { "circle-radius": 16, "circle-color": ["get", "color"], "circle-opacity": 0.22, "circle-blur": 0.4 }
        },
        {
          id: "events", type: "circle", source: "events",
          paint: {
            "circle-radius": ["get", "radius"],
            "circle-color": ["get", "color"],
            "circle-opacity": ["get", "opacity"],
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-stroke-opacity": ["get", "opacity"]
          }
        },
        {
          id: "events-label", type: "symbol", source: "events",
          filter: ["!=", ["get", "phase"], "past"],
          minzoom: 5,
          layout: { "text-field": ["get", "title"], "text-font": ["Open Sans Semibold"], "text-size": 12, "text-offset": [0, 1.2], "text-anchor": "top", "text-max-width": 12 },
          paint: { "text-color": "#111827", "text-halo-color": "#fff", "text-halo-width": 1.5, "text-opacity": ["get", "opacity"] }
        }
      ]
    }
  });
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  // ---------------------------------------------------------------------------
  // Chargement des frontières
  // ---------------------------------------------------------------------------
  let loadSeq = 0;
  async function ensureSnapshot(snap) {
    if (state.geo.has(snap)) return state.geo.get(snap);
    const res = await fetch(BASEMAPS_URL(snap));
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const fc = await res.json();
    state.geo.set(snap, fc);
    return fc;
  }

  async function refreshStates() {
    if (!map.getSource("states")) return;
    const snap = snapshotFor(state.year);
    const seq = ++loadSeq;
    if (!state.geo.has(snap)) $("loading").hidden = false;
    try {
      await ensureSnapshot(snap);
    } catch (err) {
      if (seq === loadSeq) { $("loading").textContent = "Impossible de charger les frontières (" + err.message + ")"; }
      return;
    }
    if (seq !== loadSeq) return;
    $("loading").hidden = true;
    $("loading").textContent = "Chargement des frontières…";
    state.snapshot = snap;
    const decorated = decorate(state.geo.get(snap));
    state.decorated = decorated;
    map.getSource("states").setData(decorated);
    map.getSource("labels").setData(labelCollection(snap));
    $("snapshot-badge").textContent = `Frontières : état vers ${fmtYear(snap)}`;
    if (state.selected && state.selected.kind === "state") reselectState();
    // Précharge l'instantané suivant pour une lecture fluide
    const next = SNAPSHOTS.find(y => y > snap);
    if (next !== undefined && next <= state.scenario.range[1]) ensureSnapshot(next).catch(() => {});
  }

  function refreshEvents() {
    if (!map.getSource("events")) return;
    map.getSource("events").setData(eventsCollection());
  }

  // ---------------------------------------------------------------------------
  // Temps
  // ---------------------------------------------------------------------------
  function setYear(y, { fromSlider = false } = {}) {
    const [a, b] = state.scenario.range;
    y = Math.max(a, Math.min(b, Math.round(y)));
    if (y === 0) y = y >= state.year ? 1 : -1; // pas d'an 0
    const prevSnap = snapshotFor(state.year);
    const actorsBefore = JSON.stringify(activeActors().map(x => x.label));
    state.year = y;
    $("year-label").textContent = fmtYear(y);
    if (!fromSlider) $("year-slider").value = y;
    const actorsChanged = actorsBefore !== JSON.stringify(activeActors().map(x => x.label));
    if (snapshotFor(y) !== prevSnap || actorsChanged || !state.snapshot) refreshStates();
    else if (map.getSource("labels")) map.getSource("labels").setData(labelCollection(state.snapshot));
    if (actorsChanged) renderLegend();
    refreshEvents();
    writeHash();
  }

  function stopPlay() {
    clearInterval(state.playing); state.playing = null;
    $("btn-play").textContent = "▶"; $("btn-play").setAttribute("aria-label", "Lecture");
  }
  function startPlay() {
    if (state.year >= state.scenario.range[1]) setYear(state.scenario.range[0]);
    const step = Math.max(1, Math.round((state.scenario.range[1] - state.scenario.range[0]) / 300));
    state.playing = setInterval(() => {
      if (state.year >= state.scenario.range[1]) return stopPlay();
      setYear(state.year + step);
    }, +$("speed").value);
    $("btn-play").textContent = "❚❚"; $("btn-play").setAttribute("aria-label", "Pause");
  }

  // ---------------------------------------------------------------------------
  // Frise
  // ---------------------------------------------------------------------------
  function renderTimeline() {
    const sc = state.scenario, [a, b] = sc.range, span = b - a || 1;
    const pct = y => ((y - a) / span) * 100;
    const slider = $("year-slider");
    slider.min = a; slider.max = b;
    slider.step = span > 1000 ? 5 : 1;
    $("scale-min").textContent = fmtYear(a);
    $("scale-max").textContent = fmtYear(b);
    $("periods").innerHTML = sc.periods.map(p =>
      `<div class="period" title="${esc(p.label)} (${p.from}–${p.to})" style="left:${pct(p.from)}%;width:${Math.max(0.6, pct(p.to) - pct(p.from))}%;background:${p.color}">${esc(p.label)}</div>`
    ).join("");
    $("ticks").innerHTML = sc.events.map(e => {
      const t = EVENT_TYPES[e.type] || EVENT_TYPES.politique;
      return `<span class="tick" title="${esc(e.title)}" style="left:${pct(yearOf(e.date))}%;background:${t.color}"></span>`;
    }).join("");
  }

  // ---------------------------------------------------------------------------
  // Panneau gauche
  // ---------------------------------------------------------------------------
  function renderLegend() {
    const items = [];
    const seen = new Set();
    for (const act of activeActors()) {
      if (seen.has(act.label)) continue; seen.add(act.label);
      items.push(`<li><span class="swatch" style="background:${act.color}"></span>${esc(act.label)}</li>`);
    }
    if (state.scenario.actors.length) {
      items.push(`<li><span class="swatch" style="background:${lighten("#2563eb")}"></span>Possessions, colonies, vassaux (teinte claire)</li>`);
      items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>Autres États</li>`);
    } else {
      items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>Chaque État a sa couleur</li>`);
    }
    $("legend").innerHTML = items.join("");
    const types = new Set(state.scenario.events.map(e => e.type));
    $("events-legend").innerHTML = [...types].map(t =>
      `<li><span class="swatch dot" style="background:${EVENT_TYPES[t].color}"></span>${EVENT_TYPES[t].label}</li>`).join("");
  }

  function renderScenarioInfo() {
    const sc = state.scenario;
    $("scenario-title").textContent = sc.title;
    $("scenario-subtitle").textContent = sc.subtitle;
    $("scenario-desc").textContent = sc.description;
    renderLegend();
  }

  function setScenario(id, { year, fly = true } = {}) {
    stopPlay();
    state.scenario = SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
    $("scenario-select").value = state.scenario.id;
    state.snapshot = null;
    state.year = year ?? state.scenario.start;
    popup.remove();
    renderScenarioInfo();
    renderTimeline();
    clearSelection();
    if (fly) map.flyTo({ center: state.scenario.view.center, zoom: state.scenario.view.zoom, duration: 1600 });
    setYear(state.year);
  }

  // ---------------------------------------------------------------------------
  // Inspecteur
  // ---------------------------------------------------------------------------
  function openInspector() { $("inspector").classList.add("open"); }
  function clearSelection() {
    state.selected = null;
    state.inspectToken++;
    $("inspector").classList.remove("open");
    if (map.getLayer("states-selected")) map.setFilter("states-selected", ["==", ["id"], -1]);
    $("inspector-body").innerHTML = `<p class="muted">Cliquez sur un territoire ou un point de la carte pour en afficher le détail.</p>`;
  }

  function wikiBlock(promise, token) {
    const holder = document.createElement("div");
    holder.innerHTML = `<p class="muted small">Chargement de Wikipédia…</p>`;
    promise.then(w => {
      if (token !== state.inspectToken) return;
      holder.innerHTML = `
        ${w.image ? `<img class="thumb" src="${esc(w.image)}" alt="">` : ""}
        <p class="wiki-extract">${esc(w.extract)}</p>
        <p class="small"><a href="${esc(w.url)}" target="_blank" rel="noopener">Lire « ${esc(w.title)} » sur Wikipédia${w.lang !== "fr" ? " (en anglais)" : ""} ↗</a></p>`;
    }).catch(() => {
      if (token !== state.inspectToken) return;
      holder.innerHTML = `<p class="muted small">Aucun article Wikipédia trouvé.</p>`;
    });
    return holder;
  }

  function inspectState(feature) {
    const p = feature.properties;
    const token = ++state.inspectToken;
    state.selected = { kind: "state", name: p.NAME, id: feature.id };
    map.setFilter("states-selected", ["==", ["id"], feature.id]);
    const ent = Wiki.resolveEntity(p.NAME, state.year);
    const r = roleOf(p);
    const geom = state.decorated.features[feature.id].geometry;
    const related = state.scenario.events
      .map((e, i) => ({ e, i }))
      .filter(({ e }) => pointInGeom(e.coords, geom));
    const suz = p.SUBJECTO && p.SUBJECTO !== p.NAME ? (Wiki.resolveEntity(p.SUBJECTO, state.year)?.label || p.SUBJECTO) : null;
    const part = p.PARTOF && p.PARTOF !== p.NAME && p.PARTOF !== p.SUBJECTO ? p.PARTOF : null;

    const body = $("inspector-body");
    body.innerHTML = `
      <h2><span class="swatch" style="background:${r.color}"></span>${esc(ent ? ent.label : p.NAME)}</h2>
      <div><span class="chip" style="background:${r.role === "other" ? "#6b7280" : r.actor.color}">${ROLE_LABEL[r.role]}${r.actor ? " · " + esc(r.actor.label) : ""}</span></div>
      <dl class="facts">
        ${ent && ent.label !== p.NAME ? `<dt>Nom (source)</dt><dd>${esc(p.NAME)}</dd>` : ""}
        ${suz ? `<dt>Dépend de</dt><dd>${esc(suz)}</dd>` : ""}
        ${part ? `<dt>Ensemble</dt><dd>${esc(part)}</dd>` : ""}
        <dt>Frontières</dt><dd>état vers ${fmtYear(state.snapshot)}, précision ${PRECISION[p.BORDERPRECISION] || "inconnue"}</dd>
      </dl>
      <div class="actions"><button id="btn-fit">Centrer sur ce territoire</button></div>
      <div id="wiki-slot"></div>
      ${related.length ? `<section><h3>Événements du sujet sur ce territoire</h3><ul class="event-list">${related.map(({ e, i }) =>
        `<li><button data-ev="${i}"><span class="y">${fmtYear(yearOf(e.date))}</span><span>${esc(e.title)}</span></button></li>`).join("")}</ul></section>` : ""}
    `;
    $("wiki-slot").appendChild(wikiBlock(Wiki.entitySummary(p.NAME, state.year), token));
    $("btn-fit").onclick = () => {
      const b = bboxOf(geom);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 1200, maxZoom: 9 });
    };
    body.querySelectorAll("[data-ev]").forEach(btn => btn.onclick = () => focusEvent(+btn.dataset.ev));
    openInspector();
  }

  /** Après changement d'instantané, retrouve l'État sélectionné par son nom. */
  function reselectState() {
    const f = state.decorated.features.find(x => x.properties.NAME === state.selected.name);
    if (f) inspectState(f);
    else {
      map.setFilter("states-selected", ["==", ["id"], -1]);
      const note = document.createElement("p");
      note.className = "muted small";
      note.textContent = `« ${state.selected.name} » n'existe plus sur la carte de ${fmtYear(state.snapshot)}.`;
      $("inspector-body").prepend(note);
    }
  }

  function inspectEvent(i) {
    const e = state.scenario.events[i];
    const t = EVENT_TYPES[e.type] || EVENT_TYPES.politique;
    const token = ++state.inspectToken;
    state.selected = { kind: "event", idx: i };
    map.setFilter("states-selected", ["==", ["id"], -1]);
    const body = $("inspector-body");
    body.innerHTML = `
      <h2>${esc(e.title)}</h2>
      <div><span class="chip" style="background:${t.color}">${t.label}</span></div>
      <dl class="facts">
        <dt>Date</dt><dd>${fmtDate(e.date)}${e.end ? " → " + fmtDate(e.end) : ""}</dd>
        <dt>Lieu</dt><dd>${esc(e.place)}</dd>
      </dl>
      <p>${esc(e.summary)}</p>
      <div class="actions">
        <button id="btn-zoom-ev">Zoomer sur le lieu</button>
        <button id="btn-goto-ev">Aller en ${fmtYear(yearOf(e.date))}</button>
      </div>
      <div id="wiki-slot"></div>`;
    if (e.wiki) $("wiki-slot").appendChild(wikiBlock(Wiki.summary(e.wiki), token));
    $("btn-zoom-ev").onclick = () => map.flyTo({ center: e.coords, zoom: 11, duration: 1800 });
    $("btn-goto-ev").onclick = () => { stopPlay(); setYear(yearOf(e.date)); };
    openInspector();
  }

  function focusEvent(i) {
    const e = state.scenario.events[i];
    stopPlay();
    if (state.year < yearOf(e.date) || state.year > (e.end ? yearOf(e.end) : yearOf(e.date)) + (state.scenario.linger ?? 2)) setYear(yearOf(e.date));
    map.flyTo({ center: e.coords, zoom: Math.max(map.getZoom(), 6), duration: 1200 });
    inspectEvent(i);
  }

  // ---------------------------------------------------------------------------
  // Interactions carte
  // ---------------------------------------------------------------------------
  map.on("mousemove", e => {
    const ev = map.queryRenderedFeatures(e.point, { layers: ["events"] })[0];
    if (ev) {
      map.getCanvas().style.cursor = "pointer";
      setHover(null);
      popup.setLngLat(ev.geometry.coordinates).setHTML(`<strong>${esc(ev.properties.title)}</strong>`).addTo(map);
      return;
    }
    const st = map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
    if (st) {
      map.getCanvas().style.cursor = "pointer";
      setHover(st.id);
      const ent = Wiki.resolveEntity(st.properties.NAME, state.year);
      popup.setLngLat(e.lngLat).setHTML(esc(ent ? ent.label : st.properties.NAME)).addTo(map);
    } else {
      map.getCanvas().style.cursor = "";
      setHover(null);
      popup.remove();
    }
  });
  map.on("mouseout", () => { setHover(null); popup.remove(); });

  function setHover(id) {
    if (state.hoverId === id) return;
    if (state.hoverId !== null) map.setFeatureState({ source: "states", id: state.hoverId }, { hover: false });
    state.hoverId = id;
    if (id !== null && id !== undefined) map.setFeatureState({ source: "states", id }, { hover: true });
    else state.hoverId = null;
  }

  map.on("click", e => {
    const ev = map.queryRenderedFeatures([[e.point.x - 4, e.point.y - 4], [e.point.x + 4, e.point.y + 4]], { layers: ["events"] })[0];
    if (ev) return inspectEvent(ev.properties.idx);
    const st = map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
    if (st) return inspectState(st);
    clearSelection();
  });

  // ---------------------------------------------------------------------------
  // Contrôles
  // ---------------------------------------------------------------------------
  const select = $("scenario-select");
  select.innerHTML = SCENARIOS.map(s => `<option value="${s.id}">${esc(s.title)} (${esc(s.subtitle)})</option>`).join("");
  select.onchange = () => setScenario(select.value);

  $("year-slider").addEventListener("input", e => { stopPlay(); setYear(+e.target.value, { fromSlider: true }); });
  $("btn-play").onclick = () => (state.playing ? stopPlay() : startPlay());
  $("btn-prev").onclick = () => { stopPlay(); setYear(state.year - 1); };
  $("btn-next").onclick = () => { stopPlay(); setYear(state.year + 1); };
  $("speed").onchange = () => { if (state.playing) { stopPlay(); startPlay(); } };
  document.addEventListener("keydown", e => {
    if (["INPUT", "SELECT", "TEXTAREA"].includes(e.target.tagName) && e.target.id !== "year-slider") return;
    if (e.target.id === "year-slider") return; // le curseur gère déjà ses flèches
    if (e.key === "ArrowLeft") { stopPlay(); setYear(state.year - 1); }
    else if (e.key === "ArrowRight") { stopPlay(); setYear(state.year + 1); }
    else if (e.key === " ") { e.preventDefault(); state.playing ? stopPlay() : startPlay(); }
    else if (e.key === "Escape") { clearSelection(); $("inspector").classList.remove("open"); }
  });

  $("opt-trail").onchange = refreshEvents;
  $("opt-labels").onchange = e => map.setLayoutProperty("state-labels", "visibility", e.target.checked ? "visible" : "none");
  $("opt-modern").onchange = e => map.setLayoutProperty("modern", "visibility", e.target.checked ? "visible" : "none");
  $("opt-globe").onchange = e => map.setProjection({ type: e.target.checked ? "globe" : "mercator" });
  $("opt-basemap").onchange = e => {
    const sat = e.target.value === "satellite";
    map.setLayoutProperty("satellite", "visibility", sat ? "visible" : "none");
    map.setLayoutProperty("voyager", "visibility", sat ? "none" : "visible");
  };
  $("btn-toggle-left").onclick = () => $("left-panel").classList.toggle("open");
  $("btn-close-inspector").onclick = () => $("inspector").classList.remove("open");

  // ---------------------------------------------------------------------------
  // Lien partageable : #s=<scénario>&y=<année>
  // ---------------------------------------------------------------------------
  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => history.replaceState(null, "", `#s=${state.scenario.id}&y=${state.year}`), 250);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    return { s: p.get("s"), y: p.has("y") ? parseInt(p.get("y"), 10) : undefined };
  }

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------
  map.on("load", () => {
    map.setProjection({ type: "globe" });
    const h = readHash();
    setScenario(h.s || SCENARIOS[0].id, { year: Number.isFinite(h.y) ? h.y : undefined, fly: false });
    const sc = state.scenario;
    map.jumpTo({ center: sc.view.center, zoom: sc.view.zoom });
  });

  // Exposé pour le débogage dans la console
  window.Histomap = { state, map, setYear, setScenario };
})();
