/*
 * Frise chronologique zoomable (F-10 à F-15).
 * - Molette / pincement : zoom autour du pointeur ; glisser : déplacement ; clic : aller à la date.
 * - Poignée de lecture déplaçable ; graduations automatiques (100 000 ans → 15 minutes).
 * - Bandes de périodes empilées (cliquables : zoom sur la période), marques d'événements
 *   (cliquables), histogramme de densité par catégorie.
 * - Accessible au clavier (rôle slider) : ← → pas, Maj+← → grand pas, + − zoom, Début/Fin.
 */
import * as Time from "../core/time";
import type { Unit } from "../core/time";

const ROW_H = 15, EVENT_H = 14, DENSITY_H = 16, AXIS_H = 24, GAP = 3;
const MIN_SPAN = 2 / 8765.82; // 2 heures

export interface TimelinePeriod { t0: number; t1: number; label: string; color: string }
export interface TimelineEvent { t0: number; t1: number; color: string; category: string; title: string; dateLabel: string; idx: number }
export interface TimelineOptions {
  onChange?: (t: number) => void;
  onView?: (view: [number, number]) => void;
  onSelectEvent?: (e: TimelineEvent) => void;
}
type Hit = { kind: "event"; item: TimelineEvent } | { kind: "period"; item: TimelinePeriod & { row: number } } | null;

export class Timeline {
  opts: TimelineOptions;
  el: HTMLElement;
  canvas: HTMLCanvasElement;
  tip: HTMLDivElement;
  ctx: CanvasRenderingContext2D;
  bounds: [number, number] = [0, 1];
  view: [number, number] = [0, 1];
  t = 0;
  periods: (TimelinePeriod & { row: number })[] = [];
  events: TimelineEvent[] = [];
  hidden = new Set<string>();
  pointers = new Map<number, number>();
  rowCount = 1;
  width = 0;
  majorUnit?: Unit;
  minorUnit?: Unit | null;
  private _raf: number | null = null;
  private drag: { mode: "scrub" | "pan"; x0: number; y0: number; view: [number, number]; moved: number } | null = null;
  private pinch: { d: number; view: [number, number]; mid: number } | null = null;

  constructor(container: HTMLElement, opts: TimelineOptions = {}) {
    this.opts = opts;
    this.el = container;
    this.canvas = document.createElement("canvas");
    this.canvas.className = "tl-canvas";
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("role", "slider");
    this.tip = document.createElement("div");
    this.tip.className = "tl-tip";
    this.tip.hidden = true;
    container.append(this.canvas, this.tip);
    this.ctx = this.canvas.getContext("2d")!;
    this._bind();
    new ResizeObserver(() => this.draw()).observe(container);
  }

  // ------------------------------------------------------------------ API
  setData({ bounds, periods, events }: { bounds: [number, number]; periods: TimelinePeriod[]; events: TimelineEvent[] }) {
    this.bounds = bounds;
    this.events = events;
    // Répartition des périodes en lignes sans chevauchement (3 lignes max)
    const rows: number[] = [];
    this.periods = [...periods].sort((a, b) => a.t0 - b.t0).map(p => {
      let r = rows.findIndex(end => end <= p.t0);
      if (r === -1) { r = rows.length < 3 ? rows.length : rows.indexOf(Math.min(...rows)); }
      rows[r] = p.t1;
      return { ...p, row: r };
    });
    this.rowCount = Math.max(1, rows.length);
    this.draw();
  }
  setHiddenCategories(set: Set<string>) { this.hidden = set; this.draw(); }
  setTime(t: number, { follow = false } = {}) {
    this.t = t;
    if (follow) {
      const [v0, v1] = this.view, span = v1 - v0;
      if (t > v0 + span * 0.9 || t < v0) this.setView(t - span * 0.2, t + span * 0.8);
    }
    this.canvas.setAttribute("aria-valuetext", Time.format(t, Time.levelForSpan(this.view[1] - this.view[0])));
    this.draw();
  }
  setView(v0: number, v1: number) {
    const [b0, b1] = this.bounds;
    const maxSpan = (b1 - b0) * 1.08;
    const span = Math.min(maxSpan, Math.max(MIN_SPAN, v1 - v0));
    const margin = (b1 - b0) * 0.04;
    const c = Math.min(b1 + margin - span / 2, Math.max(b0 - margin + span / 2, (v0 + v1) / 2));
    this.view = [c - span / 2, c + span / 2];
    this.draw();
    if (this.opts.onView) this.opts.onView(this.view);
  }
  fit() {
    const [b0, b1] = this.bounds, pad = (b1 - b0) * 0.03;
    this.setView(b0 - pad, b1 + pad);
  }
  zoom(factor: number, aroundT = this.t) {
    const [v0, v1] = this.view;
    const k = factor;
    this.setView(aroundT - (aroundT - v0) * k, aroundT + (v1 - aroundT) * k);
  }
  /** Unité principale et secondaire de graduation pour la vue courante. */
  units() {
    const w = this.el.clientWidth || this.width || 600;
    const ppy = w / (this.view[1] - this.view[0]);
    const big = Math.abs(this.view[0]) >= 10000;
    const minPx = big ? 110 : 72;
    let major = Time.UNITS[0];
    for (const u of Time.UNITS) if (u.years * ppy >= minPx) major = u;
    const i = Time.UNITS.indexOf(major);
    const next = Time.UNITS[i + 1];
    const minor = next && next.years * ppy >= 7 ? next : null;
    return { major, minor };
  }

  // ------------------------------------------------------------ Géométrie
  get layout() {
    const pH = this.rowCount * (ROW_H + 2);
    const yEvents = GAP + pH + GAP;
    const yDensity = yEvents + EVENT_H + GAP;
    const yAxis = yDensity + DENSITY_H;
    return { pH, yEvents, yDensity, yAxis, height: yAxis + AXIS_H };
  }
  x(t: number) { const [v0, v1] = this.view; return ((t - v0) / (v1 - v0)) * this.width; }
  tAt(x: number) { const [v0, v1] = this.view; return v0 + (x / this.width) * (v1 - v0); }
  clampT(t: number) { return Math.min(this.bounds[1], Math.max(this.bounds[0], t)); }

  // -------------------------------------------------------------- Dessin
  draw() {
    if (!this._raf) this._raf = requestAnimationFrame(() => { this._raf = null; this._draw(); });
  }
  _draw() {
    const L = this.layout;
    const w = this.el.clientWidth;
    if (!w) return;
    this.width = w;
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(L.height * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(L.height * dpr);
      this.canvas.style.height = L.height + "px";
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const css = getComputedStyle(document.documentElement);
    const col = (n: string) => css.getPropertyValue(n).trim();
    const muted = col("--muted"), line = col("--line"), accent = col("--accent");
    ctx.clearRect(0, 0, w, L.height);
    ctx.font = "11px system-ui, sans-serif";
    ctx.textBaseline = "middle";

    // Hors bornes du sujet : grisé
    const xb0 = this.x(this.bounds[0]), xb1 = this.x(this.bounds[1]);
    ctx.fillStyle = line;
    ctx.globalAlpha = 0.5;
    if (xb0 > 0) ctx.fillRect(0, 0, xb0, L.height);
    if (xb1 < w) ctx.fillRect(xb1, 0, w - xb1, L.height);
    ctx.globalAlpha = 1;

    // Périodes
    for (const p of this.periods) {
      const x0 = Math.max(-2, this.x(p.t0)), x1 = Math.min(w + 2, this.x(p.t1));
      if (x1 < 0 || x0 > w) continue;
      const y = GAP + p.row * (ROW_H + 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = 0.85;
      roundRect(ctx, x0, y, Math.max(2, x1 - x0), ROW_H, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (x1 - x0 > 30) {
        ctx.save();
        ctx.beginPath(); ctx.rect(x0 + 3, y, x1 - x0 - 6, ROW_H); ctx.clip();
        ctx.fillStyle = "#fff";
        ctx.fillText(p.label, Math.max(x0, 0) + 5, y + ROW_H / 2 + 0.5);
        ctx.restore();
      }
    }

    // Événements
    for (const e of this.events) {
      const x0 = this.x(e.t0), x1 = this.x(e.t1);
      if (x1 < -2 || x0 > w + 2) continue;
      ctx.globalAlpha = this.hidden.has(e.category) ? 0.12 : 0.95;
      ctx.fillStyle = e.color;
      if (x1 - x0 >= 4) { roundRect(ctx, x0, L.yEvents + 2, x1 - x0, EVENT_H - 4, 3); ctx.fill(); }
      else ctx.fillRect(x0 - 1, L.yEvents, 2.5, EVENT_H);
    }
    ctx.globalAlpha = 1;

    // Densité (histogramme empilé par catégorie)
    const bins = Math.max(10, Math.floor(w / 5));
    const counts = Array.from({ length: bins }, () => new Map<string, number>());
    let max = 0;
    for (const e of this.events) {
      if (this.hidden.has(e.category)) continue;
      const b = Math.floor((this.x(e.t0) / w) * bins);
      if (b < 0 || b >= bins) continue;
      counts[b].set(e.color, (counts[b].get(e.color) || 0) + 1);
    }
    counts.forEach(m => { let s = 0; m.forEach(v => (s += v)); max = Math.max(max, s); });
    if (max > 0) {
      const bw = w / bins;
      counts.forEach((m, i) => {
        let y = L.yDensity + DENSITY_H;
        m.forEach((v, c) => {
          const h = (v / max) * (DENSITY_H - 2);
          ctx.fillStyle = c; ctx.globalAlpha = 0.55;
          ctx.fillRect(i * bw + 0.5, y - h, bw - 1, h);
          y -= h;
        });
      });
      ctx.globalAlpha = 1;
    }

    // Axe et graduations
    ctx.strokeStyle = muted; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, L.yAxis + 0.5); ctx.lineTo(w, L.yAxis + 0.5); ctx.stroke();
    const { major, minor } = this.units();
    this.majorUnit = major; this.minorUnit = minor;
    if (minor) {
      ctx.strokeStyle = muted; ctx.globalAlpha = 0.45;
      ctx.beginPath();
      for (const tk of Time.ticks(minor, this.view[0], this.view[1])) {
        const x = Math.round(this.x(tk.t)) + 0.5;
        ctx.moveTo(x, L.yAxis); ctx.lineTo(x, L.yAxis + 4);
      }
      ctx.stroke(); ctx.globalAlpha = 1;
    }
    ctx.fillStyle = muted; ctx.strokeStyle = muted;
    ctx.textAlign = "center";
    ctx.beginPath();
    for (const tk of Time.ticks(major, this.view[0], this.view[1])) {
      const x = Math.round(this.x(tk.t)) + 0.5;
      if (x < -40 || x > w + 40) continue;
      ctx.moveTo(x, L.yAxis); ctx.lineTo(x, L.yAxis + 7);
      ctx.fillText(tk.label, Math.min(w - 30, Math.max(30, x)), L.yAxis + 16);
    }
    ctx.stroke();
    ctx.textAlign = "left";

    // Tête de lecture
    const xt = this.x(this.t);
    if (xt >= -1 && xt <= w + 1) {
      ctx.strokeStyle = accent; ctx.fillStyle = accent; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(xt, 0); ctx.lineTo(xt, L.yAxis + 6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(xt - 6, 0); ctx.lineTo(xt + 6, 0); ctx.lineTo(xt, 8); ctx.closePath(); ctx.fill();
    }
  }

  // -------------------------------------------------------- Interactions
  _hit(x: number, y: number): Hit {
    const L = this.layout;
    if (y >= L.yEvents - 1 && y <= L.yEvents + EVENT_H + 1) {
      let best: TimelineEvent | null = null, bd = 6;
      for (const e of this.events) {
        if (this.hidden.has(e.category)) continue;
        const x0 = this.x(e.t0), x1 = Math.max(x0, this.x(e.t1));
        const d = x < x0 ? x0 - x : x > x1 ? x - x1 : 0;
        if (d < bd) { bd = d; best = e; }
      }
      if (best) return { kind: "event", item: best };
    }
    if (y < L.yEvents - 1) {
      const row = Math.floor((y - GAP) / (ROW_H + 2));
      const p = this.periods.find(q => q.row === row && x >= this.x(q.t0) && x <= this.x(q.t1));
      if (p) return { kind: "period", item: p };
    }
    return null;
  }

  _bind() {
    const c = this.canvas;
    const local = (e: MouseEvent): [number, number] => { const r = c.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };

    c.addEventListener("wheel", e => {
      e.preventDefault();
      const [x] = local(e);
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey) {
        const d = (e.deltaX || e.deltaY) / this.width * (this.view[1] - this.view[0]);
        this.setView(this.view[0] + d, this.view[1] + d);
      } else {
        this.zoom(Math.exp(e.deltaY * 0.0015), this.tAt(x));
      }
    }, { passive: false });

    c.addEventListener("pointerdown", e => {
      c.setPointerCapture(e.pointerId);
      const [x, y] = local(e);
      this.pointers.set(e.pointerId, x);
      if (this.pointers.size === 2) {
        const xs = [...this.pointers.values()];
        this.pinch = { d: Math.abs(xs[0] - xs[1]) || 1, view: [...this.view], mid: this.tAt((xs[0] + xs[1]) / 2) };
        this.drag = null;
        return;
      }
      const scrub = Math.abs(x - this.x(this.t)) < 9;
      this.drag = { mode: scrub ? "scrub" : "pan", x0: x, y0: y, view: [...this.view], moved: 0 };
      if (scrub) this._emitTime(this.tAt(x));
    });
    c.addEventListener("pointermove", e => {
      const [x, y] = local(e);
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, x);
      if (this.pinch && this.pointers.size === 2) {
        const xs = [...this.pointers.values()];
        const k = this.pinch.d / (Math.abs(xs[0] - xs[1]) || 1);
        const [v0, v1] = this.pinch.view, m = this.pinch.mid;
        this.setView(m - (m - v0) * k, m + (v1 - m) * k);
        return;
      }
      if (this.drag) {
        this.drag.moved = Math.max(this.drag.moved, Math.abs(x - this.drag.x0));
        if (this.drag.mode === "scrub") this._emitTime(this.tAt(x));
        else if (this.drag.moved > 3) {
          const [v0, v1] = this.drag.view;
          const d = ((this.drag.x0 - x) / this.width) * (v1 - v0);
          this.setView(v0 + d, v1 + d);
        }
        return;
      }
      const h = this._hit(x, y);
      c.style.cursor = h || Math.abs(x - this.x(this.t)) < 9 ? "pointer" : "grab";
      if (h) {
        this.tip.hidden = false;
        this.tip.textContent = h.kind === "event" ? `${h.item.dateLabel} — ${h.item.title}` : h.item.label;
        this.tip.style.left = Math.min(this.width - 220, Math.max(0, x - 40)) + "px";
      } else this.tip.hidden = true;
    });
    const end = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.pinch) { if (this.pointers.size < 2) this.pinch = null; return; }
      const d = this.drag; this.drag = null;
      if (!d || d.mode === "scrub" || d.moved > 3) return;
      const h = this._hit(d.x0, d.y0);
      if (h && h.kind === "event" && this.opts.onSelectEvent) this.opts.onSelectEvent(h.item);
      else if (h && h.kind === "period") {
        const pad = (h.item.t1 - h.item.t0) * 0.08;
        this.setView(h.item.t0 - pad, h.item.t1 + pad);
        this._emitTime(h.item.t0);
      } else this._emitTime(this.tAt(d.x0));
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
    c.addEventListener("pointerleave", () => { if (!this.drag) this.tip.hidden = true; });

    c.addEventListener("keydown", e => {
      const step = (this.minorUnit || this.majorUnit || { years: 1 }).years;
      let handled = true;
      if (e.key === "ArrowRight") this._emitTime(this.t + (e.shiftKey ? this.majorUnit!.years : step), true);
      else if (e.key === "ArrowLeft") this._emitTime(this.t - (e.shiftKey ? this.majorUnit!.years : step), true);
      else if (e.key === "+" || e.key === "=") this.zoom(0.6);
      else if (e.key === "-" || e.key === "_") this.zoom(1 / 0.6);
      else if (e.key === "Home") this._emitTime(this.bounds[0], true);
      else if (e.key === "End") this._emitTime(this.bounds[1], true);
      else handled = false;
      if (handled) e.preventDefault();
    });
  }

  _emitTime(t: number, follow = false) {
    t = this.clampT(t);
    this.setTime(t, { follow });
    if (this.opts.onChange) this.opts.onChange(t);
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

