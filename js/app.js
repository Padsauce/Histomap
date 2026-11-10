/* Histomap — application principale */
(function () {
  "use strict";
  const t_ = (k, p) => I18n.t(k, p);

  // ---------------------------------------------------------------------------
  // Frontières (mode rapide) : instantanés datés du projet historical-basemaps,
  // chargés à la demande depuis jsDelivr (version figée par commit).
  // ---------------------------------------------------------------------------
  const BASEMAPS_COMMIT = "4b5039e50d8d2464b065bd76ad6086cd4597108d";
  const BASEMAPS_URL = y =>
    `https://cdn.jsdelivr.net/gh/aourednik/historical-basemaps@${BASEMAPS_COMMIT}/geojson/world_${y < 0 ? "bc" + (-y) : y}.geojson`;
  const SNAPSHOTS = [
    -123000, -10000, -8000, -5000, -4000, -3000, -2000, -1500, -1000, -700, -500, -400, -323, -300,
    -200, -100, -1, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 1100, 1200, 1279, 1300, 1400,
    1492, 1500, 1530, 1600, 1650, 1700, 1715, 1783, 1800, 1815, 1880, 1900, 1914, 1920, 1930, 1938,
    1945, 1960, 1994, 2000, 2010
  ].map(y => ({ year: y, t: Time.fromHistYear(y) }));

  const CATEGORIES = window.HISTOMAP_CATEGORIES;
  const CAT = Object.fromEntries(CATEGORIES.map(c => [c.id, c]));
  const catLabel = c => c.label[I18n.lang] || c.label.fr;
  // Palette adaptée au daltonisme (Okabe-Ito) : une famille de teintes par rôle, une teinte par acteur
  const CVD = {
    focus: ["#0072B2"],
    rival: ["#D55E00", "#E69F00", "#CC79A7", "#F0E442"],
    ally: ["#009E73", "#56B4E9"],
    context: ["#999999", "#CC79A7", "#E69F00"]
  };

  // ---------------------------------------------------------------------------
  // Utilitaires
  // ---------------------------------------------------------------------------
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { const v = localStorage.getItem("histomap." + k); return v === null ? d : JSON.parse(v); } catch (_) { return d; } },
    set(k, v) { try { localStorage.setItem("histomap." + k, JSON.stringify(v)); } catch (_) { /* stockage indisponible */ } }
  };
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
  const PRECISION_LEVEL = { "1e5y": "1e5y", "1e4y": "1e4y", millennium: "millennium", century: "century", decade: "decade", year: "year", month: "month", day: "day", hour: "minute", minute: "minute" };
  function eventDateLabel(e) {
    const lvl = PRECISION_LEVEL[e.precision] || "year";
    const a = Time.format(e.t0, lvl, { circa: e.circa });
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
  // Normalisation d'un sujet vers le modèle interne (temps en années décimales)
  // ---------------------------------------------------------------------------
  function endOf(v) { return Time.interval({ date: v }).t1; }
  function normalize(sc) {
    const events = sc.events.map((e, idx) => {
      const iv = Time.interval(e);
      const cat = CAT[e.category] || CAT.politique;
      const ev = {
        ...e, idx, ...iv, category: cat.id, color: cat.color, icon: cat.icon,
        importance: e.importance ?? 50, hasEnd: e.end !== undefined,
        endPrecision: e.end !== undefined ? Time.parse(e.end).precision : iv.precision
      };
      ev.dateLabel = eventDateLabel(ev);
      return ev;
    }).sort((a, b) => a.t0 - b.t0);
    events.forEach((e, i) => (e.order = i));
    return {
      raw: sc,
      id: sc.id,
      bounds: [Time.parse(sc.range[0]).t, endOf(sc.range[1])],
      startT: Time.parse(sc.start).t,
      actors: sc.actors.map(a => ({ ...a, whenT: a.when && a.when.map(([x, y]) => [Time.parse(x).t, endOf(y)]) })),
      periods: sc.periods.map(p => ({ ...p, t0: Time.parse(p.from).t, t1: endOf(p.to) })),
      events,
      byIdx: Object.fromEntries(events.map(e => [e.idx, e]))
    };
  }
  const SCENARIOS = window.HISTOMAP_SCENARIOS.map(normalize);

  // ---------------------------------------------------------------------------
  // État
  // ---------------------------------------------------------------------------
  const state = {
    sc: SCENARIOS[0],
    t: SCENARIOS[0].startT,
    view: SCENARIOS[0].bounds,
    snapshot: null,
    geo: new Map(),
    labels: new Map(),
    decorated: null,
    hiddenCats: new Set(store.get("hiddenCats", [])),
    showStates: true,
    cvd: store.get("cvd", false),
    playing: false,
    selected: null,
    hoverId: null,
    inspectToken: 0,
    sig: { actors: "", labels: "", events: "", chrono: "" }
  };

  // ---------------------------------------------------------------------------
  // Rôles et couleurs
  // ---------------------------------------------------------------------------
  function actorColor(a) {
    if (!state.cvd) return a.color;
    const pal = CVD[a.role] || CVD.context;
    const sameRole = [...new Set(state.sc.actors.filter(x => x.role === a.role).map(x => x.label))];
    return pal[Math.max(0, sameRole.indexOf(a.label)) % pal.length];
  }
  const activeActors = () => state.sc.actors.filter(a => !a.whenT || a.whenT.some(([x, y]) => state.t >= x && state.t < y));
  function roleOf(props) {
    const name = props.NAME || "";
    const suzerain = props.SUBJECTO || "";
    const acts = activeActors();
    for (const a of acts) if (a.match.includes(name)) return { role: a.role, color: actorColor(a), actor: a };
    for (const a of acts) {
      if (suzerain && suzerain !== name && a.match.includes(suzerain)) return { role: a.role + "-sub", color: lighten(actorColor(a)), actor: a };
    }
    return { role: "other", color: name ? hashColor(name) : "#cccccc", actor: null };
  }

  function decorate(fc) {
    return {
      type: "FeatureCollection",
      features: fc.features.map((f, i) => {
        const r = roleOf(f.properties);
        return { type: "Feature", id: i, geometry: f.geometry, properties: { ...f.properties, _role: r.role, _color: r.color } };
      })
    };
  }

  function labelPoints(snap) {
    if (state.labels.has(snap)) return state.labels.get(snap);
    const byName = new Map();
    state.geo.get(snap).features.forEach(f => {
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
    const year = Time.histYear(state.t);
    return {
      type: "FeatureCollection",
      features: labelPoints(snap).map(l => {
        const r = roleOf(l.props);
        const ent = Wiki.resolveEntity(l.name, year);
        return {
          type: "Feature",
          geometry: { type: "Point", coordinates: l.pt },
          properties: { label: ent ? ent.label : l.name, sort: (r.role === "other" ? 0 : 1e6) + l.area, important: r.role === "other" ? 0 : 1 }
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
  function minImportance() {
    const dz = state.sc.raw.view.zoom - map.getZoom();
    return Math.max(0, Math.min(85, LOD_BASE + dz * LOD_PER_ZOOM));
  }
  function eventPhase(e) {
    const span = state.view[1] - state.view[0];
    const linger = span * 0.04;
    if (state.t < e.t0) return null;
    if (state.t <= e.t1) return "active";
    if (state.t <= e.t1 + linger) return "fading";
    return $("opt-trail").checked ? "past" : null;
  }
  function visibleEvents() {
    const minImp = minImportance();
    const out = [];
    let hidden = 0;
    for (const e of state.sc.events) {
      const phase = eventPhase(e);
      if (!phase || state.hiddenCats.has(e.category)) continue;
      if (e.importance < minImp) { hidden++; continue; }
      const linger = (state.view[1] - state.view[0]) * 0.04 || 1;
      const age = state.t - e.t1;
      const opacity = phase === "active" ? 1 : phase === "fading" ? Math.max(0.35, 1 - age / linger) : 0.35;
      out.push({ e, phase, opacity: Math.round(opacity * 10) / 10 });
    }
    return { list: out, hidden };
  }

  function refreshEvents(force = false) {
    if (!map.getSource("events")) return;
    const { list, hidden } = visibleEvents();
    const sig = list.map(v => v.e.idx + v.phase + v.opacity).join("|");
    if (force || sig !== state.sig.events) {
      state.sig.events = sig;
      const fc = {
        type: "FeatureCollection",
        features: list.map(({ e, phase, opacity }) => ({
          type: "Feature",
          geometry: { type: "Point", coordinates: e.coords },
          properties: { idx: e.idx, title: e.title, category: e.category, color: e.color, phase, opacity, size: phase === "past" ? 0.5 : 0.8 }
        }))
      };
      ["events", "events-text", "clusters-text"].forEach(id => map.getSource(id).setData(fc));
    }
    const note = $("hidden-note");
    note.hidden = hidden === 0;
    note.textContent = t_("filters.hidden", { n: hidden });
    updateFilterCounts(list);
    updateChronoHighlight();
  }

  // ---------------------------------------------------------------------------
  // Carte
  // ---------------------------------------------------------------------------
  const cartoTiles = layer => ["a", "b", "c", "d"].map(s => `https://${s}.basemaps.cartocdn.com/rastertiles/${layer}/{z}/{x}/{y}.png`);
  const fillOpacity = k => ["case",
    ["boolean", ["feature-state", "hover"], false], 0.75 * k,
    ["==", ["get", "_role"], "other"], 0.32 * k,
    0.58 * k];
  const map = new maplibregl.Map({
    container: "map",
    attributionControl: { compact: true },
    center: state.sc.raw.view.center,
    zoom: state.sc.raw.view.zoom,
    maxZoom: 17,
    style: {
      version: 8,
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        voyager: { type: "raster", tiles: cartoTiles("voyager_nolabels"), tileSize: 256, attribution: "© OpenStreetMap contributors © CARTO" },
        modern: { type: "raster", tiles: cartoTiles("voyager_only_labels"), tileSize: 256 },
        satellite: { type: "raster", tiles: ["https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"], tileSize: 256, attribution: "Imagerie © Esri" },
        states: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "Frontières : historical-basemaps (GPL-3.0)" },
        labels: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        // Les textes ont leurs propres sources : si la police ne se charge pas, seuls les textes manquent.
        events: { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 7, clusterRadius: 34 },
        "events-text": { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        "clusters-text": { type: "geojson", data: { type: "FeatureCollection", features: [] }, cluster: true, clusterMaxZoom: 7, clusterRadius: 34 }
      },
      layers: [
        { id: "bg", type: "background", paint: { "background-color": "#c9dbe6" } },
        { id: "voyager", type: "raster", source: "voyager", paint: { "raster-saturation": -0.4 } },
        { id: "satellite", type: "raster", source: "satellite", layout: { visibility: "none" } },
        {
          id: "states-fill", type: "fill", source: "states",
          paint: {
            "fill-color": ["get", "_color"],
            "fill-opacity": ["interpolate", ["linear"], ["zoom"], 7, fillOpacity(1), 12, fillOpacity(0.45)]
          }
        },
        { id: "states-line", type: "line", source: "states", paint: { "line-color": "#4b5563", "line-opacity": 0.45, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.4, 8, 1.2] } },
        {
          id: "states-key-line", type: "line", source: "states",
          filter: ["in", ["get", "_role"], ["literal", ["focus", "rival", "ally", "context"]]],
          paint: { "line-color": ["get", "_color"], "line-width": ["interpolate", ["linear"], ["zoom"], 2, 1.2, 8, 3] }
        },
        { id: "states-selected", type: "line", source: "states", filter: ["==", ["id"], -1], paint: { "line-color": "#111827", "line-width": 2.5, "line-dasharray": [2, 1] } },
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
          id: "clusters", type: "circle", source: "events", filter: ["has", "point_count"],
          paint: {
            "circle-color": "#1f2937", "circle-opacity": 0.85,
            "circle-radius": ["step", ["get", "point_count"], 14, 5, 18, 15, 23],
            "circle-stroke-color": "#fff", "circle-stroke-width": 2
          }
        },
        {
          id: "cluster-count", type: "symbol", source: "clusters-text", filter: ["has", "point_count"],
          layout: { "text-field": ["get", "point_count_abbreviated"], "text-font": ["Open Sans Semibold"], "text-size": 12, "text-allow-overlap": true },
          paint: { "text-color": "#fff" }
        },
        {
          id: "events-halo", type: "circle", source: "events",
          filter: ["all", ["!", ["has", "point_count"]], ["==", ["get", "phase"], "active"]],
          paint: { "circle-radius": 20, "circle-color": ["get", "color"], "circle-opacity": 0.22, "circle-blur": 0.4 }
        },
        {
          id: "events", type: "symbol", source: "events", filter: ["!", ["has", "point_count"]],
          layout: {
            "icon-image": ["concat", "cat-", ["get", "category"]],
            "icon-size": ["get", "size"],
            "icon-allow-overlap": true,
            "icon-ignore-placement": true
          },
          paint: { "icon-opacity": ["get", "opacity"] }
        },
        {
          id: "events-label", type: "symbol", source: "events-text",
          filter: ["!=", ["get", "phase"], "past"],
          minzoom: 6,
          layout: { "text-field": ["get", "title"], "text-font": ["Open Sans Semibold"], "text-size": 12, "text-offset": [0, 1.5], "text-anchor": "top", "text-max-width": 12 },
          paint: { "text-color": "#111827", "text-halo-color": "#fff", "text-halo-width": 1.5, "text-opacity": ["get", "opacity"] }
        }
      ]
    }
  });
  const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  map.addControl(new maplibregl.ScaleControl({ unit: "metric" }), "bottom-right");

  /** Icônes de catégories : pastille colorée + pictogramme, dessinées en canvas. */
  function addCategoryIcons() {
    const S = 64;
    for (const c of CATEGORIES) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = S;
      const g = cv.getContext("2d");
      g.beginPath(); g.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
      g.fillStyle = c.color; g.fill();
      g.lineWidth = 4; g.strokeStyle = "#fff"; g.stroke();
      g.font = `${S * 0.45}px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif`;
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillText(c.icon, S / 2, S / 2 + 2);
      const img = g.getImageData(0, 0, S, S);
      if (map.hasImage("cat-" + c.id)) map.removeImage("cat-" + c.id);
      map.addImage("cat-" + c.id, { width: S, height: S, data: img.data }, { pixelRatio: 2 });
    }
  }

  // ---------------------------------------------------------------------------
  // Chargement des frontières
  // ---------------------------------------------------------------------------
  const snapshotFor = t => { let s = SNAPSHOTS[0]; for (const x of SNAPSHOTS) if (x.t <= t + 1e-9) s = x; return s; };
  let loadSeq = 0;
  const ensureSnapshot = snap => (state.geo.has(snap.year) ? Promise.resolve(state.geo.get(snap.year)) :
    Net.getJSON(BASEMAPS_URL(snap.year), { persist: true }).then(fc => { state.geo.set(snap.year, fc); return fc; }));

  async function refreshStates() {
    if (!map.getSource("states")) return;
    const snap = snapshotFor(state.t);
    const seq = ++loadSeq;
    if (!state.geo.has(snap.year)) { $("loading").hidden = false; $("loading").textContent = t_("map.loading"); }
    try { await ensureSnapshot(snap); } catch (err) {
      if (seq === loadSeq) $("loading").textContent = t_("map.loadError", { error: err.message });
      return;
    }
    if (seq !== loadSeq) return;
    $("loading").hidden = true;
    state.snapshot = snap;
    state.decorated = decorate(state.geo.get(snap.year));
    map.getSource("states").setData(state.decorated);
    refreshLabels(true);
    $("snapshot-badge").textContent = t_("map.borders", { year: Time.fmtYearHist(snap.year) });
    if (state.selected && state.selected.kind === "state") reselectState();
    const i = SNAPSHOTS.indexOf(snap);
    const next = SNAPSHOTS[i + 1];
    if (next && next.t <= state.sc.bounds[1]) ensureSnapshot(next).catch(() => {});
  }
  function refreshLabels(force) {
    if (!state.snapshot) return;
    const sig = state.snapshot.year + ":" + Time.histYear(state.t) + ":" + state.sig.actors;
    if (!force && sig === state.sig.labels) return;
    state.sig.labels = sig;
    map.getSource("labels").setData(labelCollection(state.snapshot.year));
  }

  // ---------------------------------------------------------------------------
  // Temps
  // ---------------------------------------------------------------------------
  const timeline = new Timeline($("timeline"), {
    onChange: t => { stopPlay(); setTime(t, { fromTimeline: true }); },
    onView: v => { state.view = v; updateDateLabel(); refreshEvents(); writeHash(); },
    onSelectEvent: e => focusEvent(e.idx)
  });

  function setTime(t, { fromTimeline = false, follow = false } = {}) {
    const [a, b] = state.sc.bounds;
    t = Math.max(a, Math.min(b, t));
    state.t = t;
    if (!fromTimeline) timeline.setTime(t, { follow });
    const actorsSig = activeActors().map(x => x.label + x.role).join("|");
    const actorsChanged = actorsSig !== state.sig.actors;
    state.sig.actors = actorsSig;
    if (!state.snapshot || snapshotFor(t) !== state.snapshot || actorsChanged) refreshStates();
    else refreshLabels(false);
    if (actorsChanged) renderLegend();
    refreshEvents();
    updateDateLabel();
    writeHash();
  }

  function updateDateLabel() {
    const span = state.view[1] - state.view[0];
    $("date-label").textContent = Time.format(state.t, Time.levelForSpan(span));
    $("scale-label").textContent = t_("time.scale", { unit: t_("unit." + timeline.units().major.id) });
  }

  // Lecture : la vitesse est exprimée en « largeurs de frise par N secondes », elle s'adapte donc au zoom.
  let lastFrame = 0;
  function frame(now) {
    if (!state.playing) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    const span = state.view[1] - state.view[0];
    const next = state.t + (span / +$("speed").value) * dt;
    if (next >= state.sc.bounds[1]) { setTime(state.sc.bounds[1], { follow: true }); stopPlay(); return; }
    setTime(next, { follow: true });
    requestAnimationFrame(frame);
  }
  function startPlay() {
    if (state.t >= state.sc.bounds[1] - 1e-9) setTime(state.sc.bounds[0], { follow: true });
    state.playing = true;
    $("btn-play").textContent = "❚❚"; $("btn-play").setAttribute("aria-label", t_("time.pause"));
    lastFrame = performance.now();
    requestAnimationFrame(frame);
  }
  function stopPlay() {
    state.playing = false;
    $("btn-play").textContent = "▶"; $("btn-play").setAttribute("aria-label", t_("time.play"));
  }
  const stepSize = () => (timeline.minorUnit || timeline.majorUnit || { years: 1 }).years;

  // ---------------------------------------------------------------------------
  // Filtres par catégorie (F-40, F-41)
  // ---------------------------------------------------------------------------
  function renderFilters() {
    const present = [...new Set(state.sc.events.map(e => e.category))];
    const chips = [`<button class="chip-btn" data-cat="__states" aria-pressed="${state.showStates}" title="${esc(t_("filters.states"))}">
      <span class="ico" aria-hidden="true">🏛️</span><span class="lbl">${esc(t_("filters.states"))}</span></button>`];
    for (const id of CATEGORIES.map(c => c.id).filter(id => present.includes(id))) {
      const c = CAT[id];
      chips.push(`<button class="chip-btn" data-cat="${id}" aria-pressed="${!state.hiddenCats.has(id)}" style="--c:${c.color}" title="${esc(catLabel(c))}">
        <span class="ico" aria-hidden="true">${c.icon}</span><span class="lbl">${esc(catLabel(c))}</span><span class="count" data-count="${id}"></span></button>`);
    }
    $("filters").innerHTML = chips.join("");
    $("filters").querySelectorAll("[data-cat]").forEach(btn => btn.onclick = () => toggleCategory(btn.dataset.cat));
  }
  function toggleCategory(id) {
    if (id === "__states") {
      state.showStates = !state.showStates;
      ["states-fill", "states-line", "states-key-line", "states-selected", "state-labels"].forEach(l =>
        map.setLayoutProperty(l, "visibility", state.showStates && (l !== "state-labels" || $("opt-labels").checked) ? "visible" : "none"));
    } else {
      state.hiddenCats.has(id) ? state.hiddenCats.delete(id) : state.hiddenCats.add(id);
      store.set("hiddenCats", [...state.hiddenCats]);
    }
    renderFilters();
    timeline.setHiddenCategories(state.hiddenCats);
    refreshEvents(true);
    renderChronology();
    writeHash();
  }
  function updateFilterCounts(list) {
    const counts = {};
    list.forEach(v => { if (v.phase !== "past") counts[v.e.category] = (counts[v.e.category] || 0) + 1; });
    $("filters").querySelectorAll("[data-count]").forEach(el => {
      const n = counts[el.dataset.count] || 0;
      el.textContent = n ? String(n) : "";
    });
  }

  // ---------------------------------------------------------------------------
  // Panneau gauche : sujet, légende, chronologie (vue liste, F-111)
  // ---------------------------------------------------------------------------
  function renderLegend() {
    const items = [], seen = new Set();
    for (const a of activeActors()) {
      if (seen.has(a.label)) continue; seen.add(a.label);
      items.push(`<li><span class="swatch" style="background:${actorColor(a)}"></span>${esc(a.label)}</li>`);
    }
    if (state.sc.actors.length) {
      items.push(`<li><span class="swatch" style="background:${lighten(state.cvd ? CVD.focus[0] : "#2563eb")}"></span>${esc(t_("legend.subs"))}</li>`);
      items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>${esc(t_("legend.others"))}</li>`);
    } else {
      items.push(`<li><span class="swatch" style="background:linear-gradient(90deg,#e6c9a8,#b8d8c0,#c8c0e0)"></span>${esc(t_("legend.eachState"))}</li>`);
    }
    $("legend").innerHTML = items.join("");
  }
  function renderScenarioInfo() {
    const r = state.sc.raw;
    $("scenario-title").textContent = r.title;
    $("scenario-subtitle").textContent = r.subtitle;
    $("scenario-desc").textContent = r.description;
    renderLegend();
  }
  function renderChronology() {
    const evs = state.sc.events.filter(e => !state.hiddenCats.has(e.category));
    $("chrono-count").textContent = evs.length ? t_("chrono.count", { n: evs.length }) : t_("chrono.empty");
    $("chrono-list").innerHTML = evs.map(e => `
      <li><button data-ev="${e.idx}" style="--c:${e.color}">
        <span class="ico" aria-hidden="true">${e.icon}</span>
        <span class="txt"><span class="d">${esc(e.dateLabel)}</span><span class="ttl">${esc(e.title)}</span></span>
      </button></li>`).join("");
    $("chrono-list").querySelectorAll("[data-ev]").forEach(b => b.onclick = () => focusEvent(+b.dataset.ev));
    state.sig.chrono = "";
    updateChronoHighlight();
  }
  function updateChronoHighlight() {
    const active = state.sc.events.filter(e => state.t >= e.t0 && state.t <= e.t1).map(e => e.idx);
    const sig = active.join(",");
    if (sig === state.sig.chrono) return;
    state.sig.chrono = sig;
    $("chrono-list").querySelectorAll("[data-ev]").forEach(b => b.classList.toggle("now", active.includes(+b.dataset.ev)));
  }

  function setScenario(id, { t, view, fly = true } = {}) {
    stopPlay();
    state.sc = SCENARIOS.find(s => s.id === id) || SCENARIOS[0];
    $("scenario-select").value = state.sc.id;
    state.snapshot = null;
    state.sig = { actors: "", labels: "", events: "", chrono: "" };
    popup.remove();
    clearSelection();
    renderScenarioInfo();
    renderFilters();
    renderChronology();
    timeline.setData({ bounds: state.sc.bounds, periods: state.sc.periods, events: state.sc.events });
    timeline.setHiddenCategories(state.hiddenCats);
    if (view) timeline.setView(view[0], view[1]); else timeline.fit();
    const v = state.sc.raw.view;
    if (fly) map.flyTo({ center: v.center, zoom: v.zoom, duration: 1600 });
    setTime(t ?? state.sc.startT);
  }

  // ---------------------------------------------------------------------------
  // Inspecteur à tiroirs (F-04)
  // ---------------------------------------------------------------------------
  const drawerState = store.get("drawers", { facts: true, summary: true, chronology: true, actors: false, sources: false, article: false });
  function drawer(id, title, body) {
    const d = document.createElement("details");
    d.className = "drawer";
    d.dataset.drawer = id;
    d.open = !!drawerState[id];
    d.innerHTML = `<summary>${esc(title)}</summary><div class="drawer-body"></div>`;
    const b = d.querySelector(".drawer-body");
    if (typeof body === "string") b.innerHTML = body; else if (body) b.appendChild(body);
    d.addEventListener("toggle", () => { drawerState[id] = d.open; store.set("drawers", drawerState); });
    return d;
  }
  function articleDrawer(getArticle, token) {
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
        const body = d.querySelector(".drawer-body");
        body.innerHTML = "";
        body.appendChild(frame);
      }).catch(() => {
        if (token !== state.inspectToken) return;
        d.querySelector(".drawer-body").innerHTML = `<p class="muted small">${esc(t_("inspector.wikiNone"))}</p>`;
      });
    };
    d.addEventListener("toggle", load);
    setTimeout(load, 0);
    return d;
  }
  function wikiBlock(promise, token) {
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
  function eventListHtml(evs) {
    return `<ul class="event-list">${evs.map(e =>
      `<li><button data-ev="${e.idx}"><span class="ico" aria-hidden="true">${e.icon}</span><span class="y">${esc(e.dateLabel)}</span><span>${esc(e.title)}</span></button></li>`).join("")}</ul>`;
  }
  function bindEventButtons(root) { root.querySelectorAll("[data-ev]").forEach(b => b.onclick = () => focusEvent(+b.dataset.ev)); }

  function openInspector() { $("inspector").classList.add("open"); }
  function clearSelection() {
    state.selected = null;
    state.inspectToken++;
    $("inspector").classList.remove("open");
    if (map.getLayer("states-selected")) map.setFilter("states-selected", ["==", ["id"], -1]);
    $("inspector-body").innerHTML = `<p class="muted">${esc(t_("inspector.empty"))}</p>`;
  }

  function inspectState(feature) {
    const p = feature.properties;
    const token = ++state.inspectToken;
    const year = Time.histYear(state.t);
    state.selected = { kind: "state", name: p.NAME, id: feature.id };
    map.setFilter("states-selected", ["==", ["id"], feature.id]);
    const ent = Wiki.resolveEntity(p.NAME, year);
    const r = roleOf(p);
    const geom = state.decorated.features[feature.id].geometry;
    const related = state.sc.events.filter(e => pointInGeom(e.coords, geom));
    const suz = p.SUBJECTO && p.SUBJECTO !== p.NAME ? (Wiki.resolveEntity(p.SUBJECTO, year)?.label || p.SUBJECTO) : null;
    const part = p.PARTOF && p.PARTOF !== p.NAME && p.PARTOF !== p.SUBJECTO ? p.PARTOF : null;
    const precision = t_("precision.border." + (p.BORDERPRECISION || "unknown"));
    const snapLabel = Time.fmtYearHist(state.snapshot.year);
    const chipColor = r.role === "other" ? "#6b7280" : actorColor(r.actor);

    const body = $("inspector-body");
    body.innerHTML = `
      <div class="brief">
        <h2><span class="swatch" style="background:${r.color}"></span>${esc(ent ? ent.label : p.NAME)}</h2>
        <div><span class="chip" style="background:${chipColor}">${esc(t_("role." + r.role))}${r.actor ? " · " + esc(r.actor.label) : ""}</span></div>
        <div class="actions"><button id="btn-fit">${esc(t_("inspector.fit"))}</button></div>
      </div>`;
    body.appendChild(drawer("facts", t_("inspector.facts"), `<dl class="facts">
        ${ent && ent.label !== p.NAME ? `<dt>${esc(t_("inspector.sourceName"))}</dt><dd>${esc(p.NAME)}</dd>` : ""}
        ${suz ? `<dt>${esc(t_("inspector.dependsOn"))}</dt><dd>${esc(suz)}</dd>` : ""}
        ${part ? `<dt>${esc(t_("inspector.partOf"))}</dt><dd>${esc(part)}</dd>` : ""}
        <dt>${esc(t_("inspector.borders"))}</dt><dd>${esc(t_("inspector.bordersValue", { year: snapLabel, precision }))}</dd>
      </dl>`));
    body.appendChild(drawer("summary", t_("inspector.summary"), wikiBlock(Wiki.entitySummary(p.NAME, year), token)));
    body.appendChild(drawer("chronology", t_("inspector.chronology"),
      related.length ? eventListHtml(related) : `<p class="muted small">${esc(t_("inspector.noRelated"))}</p>`));
    const roles = state.sc.actors.filter(a => a.match.includes(p.NAME));
    body.appendChild(drawer("actors", t_("inspector.actors"), roles.length ? `
      <p class="small muted">${esc(t_("inspector.inSubject", { subject: state.sc.raw.title }))}</p>
      <ul class="roles">${roles.map(a => `<li><span class="swatch" style="background:${actorColor(a)}"></span>
        <strong>${esc(t_("role." + a.role))}</strong> · ${esc(a.label)}${a.when ? ` <span class="muted">(${a.when.map(([x, y]) => `${x}–${y}`).join(", ")})</span>` : ""}</li>`).join("")}</ul>`
      : `<p class="small muted">${esc(t_("inspector.notInSubject"))}</p>`));
    body.appendChild(drawer("sources", t_("inspector.sources"), `<dl class="facts">
        <dt>${esc(t_("inspector.borders"))}</dt><dd>${esc(t_("inspector.bordersSource", { year: snapLabel }))} — ${esc(precision)}</dd>
        <dt>${esc(t_("inspector.summary"))}</dt><dd>Wikipédia (CC BY-SA)</dd>
      </dl>`));
    body.appendChild(articleDrawer(() => Wiki.entityArticle(p.NAME, year), token));
    $("btn-fit").onclick = () => {
      const b = bboxOf(geom);
      map.fitBounds([[b[0], b[1]], [b[2], b[3]]], { padding: 60, duration: 1200, maxZoom: 9 });
    };
    bindEventButtons(body);
    openInspector();
  }

  function reselectState() {
    const f = state.decorated.features.find(x => x.properties.NAME === state.selected.name);
    if (f) inspectState(f);
    else {
      map.setFilter("states-selected", ["==", ["id"], -1]);
      const note = document.createElement("p");
      note.className = "muted small";
      note.textContent = t_("inspector.noLongerExists", { name: state.selected.name, year: Time.fmtYearHist(state.snapshot.year) });
      $("inspector-body").prepend(note);
    }
  }

  function inspectEvent(idx) {
    const e = state.sc.byIdx[idx];
    const c = CAT[e.category];
    const token = ++state.inspectToken;
    state.selected = { kind: "event", idx };
    map.setFilter("states-selected", ["==", ["id"], -1]);
    const body = $("inspector-body");
    body.innerHTML = `
      <div class="brief">
        <h2><span class="ico-lg" aria-hidden="true">${e.icon}</span>${esc(e.title)}</h2>
        <div><span class="chip" style="background:${c.color}">${esc(catLabel(c))}${e.subtype ? " · " + esc(e.subtype) : ""}</span></div>
        <p class="muted">${esc(e.dateLabel)} · ${esc(e.place)}</p>
        <div class="actions">
          <button id="btn-zoom-ev">${esc(t_("inspector.zoomPlace"))}</button>
          <button id="btn-goto-ev">${esc(t_("inspector.goto", { date: e.dateLabel.split(" → ")[0] }))}</button>
        </div>
      </div>`;
    body.appendChild(drawer("facts", t_("inspector.facts"), `<p>${esc(e.summary)}</p><dl class="facts">
        <dt>${esc(t_("inspector.date"))}</dt><dd>${esc(e.dateLabel)}</dd>
        <dt>${esc(t_("inspector.place"))}</dt><dd>${esc(e.place)}</dd>
        <dt>${esc(t_("inspector.category"))}</dt><dd>${esc(catLabel(c))}${e.subtype ? " · " + esc(e.subtype) : ""}</dd>
      </dl>`));
    if (e.wiki) body.appendChild(drawer("summary", t_("inspector.summary"), wikiBlock(Wiki.summary(e.wiki), token)));
    const evs = state.sc.events, i = e.order;
    const near = evs.slice(Math.max(0, i - 3), i).concat(evs.slice(i + 1, i + 4));
    body.appendChild(drawer("chronology", t_("inspector.chronology"), eventListHtml(near)));
    body.appendChild(drawer("sources", t_("inspector.sources"), `<dl class="facts">
        <dt>${esc(t_("inspector.dataSource"))}</dt><dd>${esc(t_("inspector.curated"))}</dd>
        <dt>${esc(t_("inspector.datePrecision"))}</dt><dd>${esc(t_("precision." + e.precision))}</dd>
        <dt>${esc(t_("inspector.placePrecision"))}</dt><dd>${esc(t_("precision.place." + (e.placePrecision || "exact")))}</dd>
        <dt>${esc(t_("inspector.summary"))}</dt><dd>Wikipédia (CC BY-SA)</dd>
      </dl>`));
    if (e.wiki) body.appendChild(articleDrawer(() => Promise.resolve({ title: e.wiki, lang: "fr" }), token));
    $("btn-zoom-ev").onclick = () => map.flyTo({ center: e.coords, zoom: 12, duration: 1800 });
    $("btn-goto-ev").onclick = () => { stopPlay(); setTime(e.t0); };
    bindEventButtons(body);
    openInspector();
  }

  function focusEvent(idx) {
    const e = state.sc.byIdx[idx];
    stopPlay();
    if (state.t < e.t0 || state.t > e.t1) setTime(e.t0);
    // S'assurer que l'événement est visible à l'échelle de temps courante
    const span = state.view[1] - state.view[0];
    if (state.t < state.view[0] || state.t > state.view[1]) timeline.setView(state.t - span / 2, state.t + span / 2);
    const minZoomForEvent = state.sc.raw.view.zoom - (e.importance - LOD_BASE) / LOD_PER_ZOOM + 0.2;
    map.flyTo({ center: e.coords, zoom: Math.max(map.getZoom(), minZoomForEvent), duration: 1200 });
    inspectEvent(idx);
  }

  // ---------------------------------------------------------------------------
  // Interactions carte
  // ---------------------------------------------------------------------------
  map.on("mousemove", e => {
    const ev = map.queryRenderedFeatures(e.point, { layers: ["events", "clusters"] })[0];
    if (ev) {
      map.getCanvas().style.cursor = "pointer";
      setHover(null);
      if (ev.properties.title) popup.setLngLat(ev.geometry.coordinates).setHTML(`<strong>${esc(ev.properties.title)}</strong>`).addTo(map);
      else popup.remove();
      return;
    }
    const st = state.showStates && map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
    if (st) {
      map.getCanvas().style.cursor = "pointer";
      setHover(st.id);
      const ent = Wiki.resolveEntity(st.properties.NAME, Time.histYear(state.t));
      popup.setLngLat(e.lngLat).setHTML(esc(ent ? ent.label : st.properties.NAME || "")).addTo(map);
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
    state.hoverId = id ?? null;
    if (state.hoverId !== null) map.setFeatureState({ source: "states", id: state.hoverId }, { hover: true });
  }
  map.on("click", async e => {
    const box = [[e.point.x - 5, e.point.y - 5], [e.point.x + 5, e.point.y + 5]];
    const cl = map.queryRenderedFeatures(box, { layers: ["clusters"] })[0];
    if (cl) {
      const z = await map.getSource("events").getClusterExpansionZoom(cl.properties.cluster_id);
      map.easeTo({ center: cl.geometry.coordinates, zoom: z + 0.2 });
      return;
    }
    const ev = map.queryRenderedFeatures(box, { layers: ["events"] })[0];
    if (ev) return inspectEvent(ev.properties.idx);
    const st = state.showStates && map.queryRenderedFeatures(e.point, { layers: ["states-fill"] })[0];
    if (st) return inspectState(st);
    clearSelection();
  });
  map.on("zoomend", () => refreshEvents());

  // ---------------------------------------------------------------------------
  // Contrôles
  // ---------------------------------------------------------------------------
  function fillSelects() {
    $("scenario-select").innerHTML = SCENARIOS.map(s => `<option value="${s.id}">${esc(s.raw.title)} (${esc(s.raw.subtitle)})</option>`).join("");
    $("scenario-select").value = state.sc.id;
    $("opt-lang").innerHTML = I18n.languages.map(l => `<option value="${l}">${{ fr: "Français", en: "English" }[l] || l}</option>`).join("");
    $("opt-lang").value = I18n.lang;
    $("sources").innerHTML = t_("sources.text", {
      basemaps: `<a href="https://github.com/aourednik/historical-basemaps" target="_blank" rel="noopener">historical-basemaps</a>`,
      wikipedia: `<a href="https://fr.wikipedia.org" target="_blank" rel="noopener">Wikipédia</a>`
    });
  }
  $("scenario-select").onchange = e => setScenario(e.target.value);
  $("btn-play").onclick = () => (state.playing ? stopPlay() : startPlay());
  $("btn-prev").onclick = () => { stopPlay(); setTime(state.t - stepSize(), { follow: true }); };
  $("btn-next").onclick = () => { stopPlay(); setTime(state.t + stepSize(), { follow: true }); };
  $("btn-tzoom-in").onclick = () => timeline.zoom(0.5);
  $("btn-tzoom-out").onclick = () => timeline.zoom(2);
  $("btn-tfit").onclick = () => timeline.fit();
  document.addEventListener("keydown", e => {
    const tag = e.target.tagName;
    if (["INPUT", "SELECT", "TEXTAREA", "BUTTON", "SUMMARY"].includes(tag) || e.target === timeline.canvas) {
      if (e.key === "Escape") clearSelection();
      return;
    }
    if (e.key === "ArrowLeft") { stopPlay(); setTime(state.t - stepSize(), { follow: true }); }
    else if (e.key === "ArrowRight") { stopPlay(); setTime(state.t + stepSize(), { follow: true }); }
    else if (e.key === " ") { e.preventDefault(); state.playing ? stopPlay() : startPlay(); }
    else if (e.key === "Escape") clearSelection();
  });

  $("opt-trail").onchange = () => refreshEvents(true);
  $("opt-labels").onchange = e => map.setLayoutProperty("state-labels", "visibility", e.target.checked && state.showStates ? "visible" : "none");
  $("opt-modern").onchange = e => map.setLayoutProperty("modern", "visibility", e.target.checked ? "visible" : "none");
  $("opt-globe").onchange = e => map.setProjection({ type: e.target.checked ? "globe" : "mercator" });
  $("opt-cvd").checked = state.cvd;
  $("opt-cvd").onchange = e => {
    state.cvd = e.target.checked; store.set("cvd", state.cvd);
    state.sig.actors = ""; setTime(state.t); renderLegend();
  };
  $("opt-basemap").onchange = e => {
    const sat = e.target.value === "satellite";
    map.setLayoutProperty("satellite", "visibility", sat ? "visible" : "none");
    map.setLayoutProperty("voyager", "visibility", sat ? "none" : "visible");
  };
  $("opt-lang").onchange = e => {
    I18n.setLang(e.target.value);
    SCENARIOS.forEach(s => s.events.forEach(ev => (ev.dateLabel = eventDateLabel(ev))));
    fillSelects(); renderScenarioInfo(); renderFilters(); renderChronology(); clearSelection();
    timeline.draw(); updateDateLabel(); refreshEvents(true);
    if (state.snapshot) $("snapshot-badge").textContent = t_("map.borders", { year: Time.fmtYearHist(state.snapshot.year) });
  };
  $("btn-toggle-left").onclick = () => $("left-panel").classList.toggle("open");
  $("btn-close-inspector").onclick = () => $("inspector").classList.remove("open");
  // Onglets du panneau gauche
  const tabs = [["tab-subject", "pane-subject"], ["tab-chrono", "pane-chrono"]];
  tabs.forEach(([tabId]) => $(tabId).onclick = () => tabs.forEach(([tid, pid]) => {
    const on = tid === tabId;
    $(tid).setAttribute("aria-selected", on);
    $(pid).hidden = !on;
  }));

  Net.onStatus(s => { $("offline").hidden = s.online; });

  // ---------------------------------------------------------------------------
  // Lien partageable : #s=<sujet>&t=<temps>&v=<début>,<fin>&f=<catégories masquées>
  // ---------------------------------------------------------------------------
  let hashTimer = null;
  function writeHash() {
    clearTimeout(hashTimer);
    hashTimer = setTimeout(() => {
      const p = new URLSearchParams();
      p.set("s", state.sc.id);
      p.set("t", state.t.toFixed(6));
      p.set("v", state.view.map(x => x.toFixed(6)).join(","));
      if (state.hiddenCats.size) p.set("f", [...state.hiddenCats].join(","));
      history.replaceState(null, "", "#" + p.toString());
    }, 300);
  }
  function readHash() {
    const p = new URLSearchParams(location.hash.slice(1));
    const out = { s: p.get("s") };
    if (p.has("t")) out.t = parseFloat(p.get("t"));
    else if (p.has("y")) out.t = Time.fromHistYear(parseInt(p.get("y"), 10));
    if (p.has("v")) { const v = p.get("v").split(",").map(Number); if (v.length === 2 && v.every(Number.isFinite)) out.view = v; }
    if (p.has("f")) out.hidden = p.get("f").split(",").filter(Boolean);
    return out;
  }

  // ---------------------------------------------------------------------------
  // Démarrage
  // ---------------------------------------------------------------------------
  I18n.apply();
  fillSelects();
  // Lien collé dans la barre d'adresse alors que la page est ouverte
  window.addEventListener("hashchange", () => {
    const h = readHash();
    if (h.hidden) state.hiddenCats = new Set(h.hidden);
    setScenario(h.s || state.sc.id, { t: Number.isFinite(h.t) ? h.t : undefined, view: h.view });
  });

  map.on("load", () => {
    map.setProjection({ type: "globe" });
    addCategoryIcons();
    const h = readHash();
    if (h.hidden) state.hiddenCats = new Set(h.hidden);
    setScenario(h.s || SCENARIOS[0].id, { t: Number.isFinite(h.t) ? h.t : undefined, view: h.view, fly: false });
    map.jumpTo({ center: state.sc.raw.view.center, zoom: state.sc.raw.view.zoom });
  });

  window.Histomap = { state, map, timeline, setTime, setScenario };
})();
