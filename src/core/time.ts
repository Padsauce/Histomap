/*
 * Modèle temporel d'Histomap.
 *
 * Représentation interne : année astronomique décimale `t` (nombre flottant).
 *   1 apr. J.-C. = 1, 1 av. J.-C. = 0, 2 av. J.-C. = -1 …
 *   t = A + (fraction écoulée de l'année A), calendrier grégorien proleptique.
 * Dans les données et à l'affichage, on utilise l'année historique (sans an 0) :
 *   "-50" = 50 av. J.-C.
 *
 * Formats de date acceptés dans les données :
 *   1643 | "1643" | "1643-05" | "1643-05-19" | "1805-12-02T09:30" | "-313000"
 *   Préfixe "~" = date approximative ("~-15000").
 */
import type { DateInput, Precision } from "./types";
import { t as tr, list, getLang } from "../i18n";

export const PRECISION_YEARS: Record<Precision, number> = {
  "1e5y": 1e5, "1e4y": 1e4, millennium: 1000, century: 100, decade: 10, year: 1,
  month: 1 / 12, day: 1 / 365.2425, hour: 1 / 8765.82, minute: 1 / 525949
};
const CUM = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334, 365];

const mod = (a: number, n: number) => ((a % n) + n) % n;
const isLeap = (A: number) => (mod(A, 4) === 0 && mod(A, 100) !== 0) || mod(A, 400) === 0;
const diy = (A: number) => (isLeap(A) ? 366 : 365);
export const histToAstro = (Y: number) => (Y < 0 ? Y + 1 : Y === 0 ? 1 : Y);
export const astroToHist = (A: number) => (A <= 0 ? A - 1 : A);
const monthStart = (A: number, m: number) => CUM[m] + (isLeap(A) && m >= 2 ? 1 : 0); // m : 0..11

export interface DateParts { Y: number; A: number; mo: number; d: number; h: number; mi: number }

/** Composantes (année historique, mois 1-12, jour, heure, minute) → t */
export function toT(Y: number, mo = 1, d = 1, h = 0, mi = 0): number {
  const A = histToAstro(Y);
  const doy = monthStart(A, mo - 1) + (d - 1);
  return A + (doy + (h + mi / 60) / 24) / diy(A);
}

/** t → composantes */
export function fromT(t: number): DateParts {
  const A = Math.floor(t);
  const n = diy(A);
  const days = (t - A) * n;
  const doy = Math.min(n - 1, Math.floor(days + 1e-9));
  let m = 11;
  while (m > 0 && monthStart(A, m) > doy) m--;
  const d = doy - monthStart(A, m) + 1;
  const mins = Math.max(0, Math.round((days - doy) * 1440));
  return { Y: astroToHist(A), A, mo: m + 1, d, h: Math.min(23, Math.floor(mins / 60)), mi: mins % 60 };
}

export interface ParsedDate { t: number; precision: Precision; circa: boolean }

/** Analyse une date des données. */
export function parse(v: DateInput, precisionOverride?: Precision): ParsedDate {
  let s = String(v).trim(), circa = false;
  if (s.startsWith("~")) { circa = true; s = s.slice(1); }
  const m = /^(-?\d+)(?:-(\d{1,2}))?(?:-(\d{1,2}))?(?:T(\d{1,2}):(\d{2}))?$/.exec(s);
  if (!m) throw new Error("Date invalide : " + v);
  const Y = parseInt(m[1], 10);
  const mo = m[2] ? +m[2] : 1, d = m[3] ? +m[3] : 1;
  const h = m[4] ? +m[4] : 0, mi = m[5] ? +m[5] : 0;
  let precision: Precision = m[5] ? (mi === 0 ? "hour" : "minute") : m[3] ? "day" : m[2] ? "month" : "year";
  if (precisionOverride) precision = precisionOverride;
  return { t: toT(Y, mo, d, h, mi), precision, circa };
}

export interface Interval { t0: number; t1: number; precision: Precision; circa: boolean }

/** Intervalle [t0, t1] d'un objet { date, end?, precision? } */
export function interval(obj: { date: DateInput; end?: DateInput; precision?: Precision }): Interval {
  const a = parse(obj.date, obj.precision);
  let t1: number;
  if (obj.end !== undefined) {
    const b = parse(obj.end);
    t1 = b.t + PRECISION_YEARS[b.precision];
  } else {
    t1 = a.t + PRECISION_YEARS[a.precision];
  }
  return { t0: a.t, t1: Math.max(t1, a.t), precision: a.precision, circa: a.circa };
}

/** Fin d'une date (dernier instant couvert par sa précision). */
export const endOf = (v: DateInput) => interval({ date: v }).t1;

// -------------------------------------------------------------------------
// Formatage
// -------------------------------------------------------------------------
function fmtNum(n: number): string {
  return Math.abs(n) >= 10000 ? new Intl.NumberFormat(getLang()).format(n) : String(n);
}
export function fmtYearHist(Y: number): string {
  return Y < 0 ? `${fmtNum(-Y)} ${tr("era.bc")}` : fmtNum(Y);
}
const pad = (n: number) => String(n).padStart(2, "0");
const dayLabel = (d: number) => (d === 1 ? tr("dayFirst") : String(d));

export type Level = Precision | "minute";

/**
 * Formate t selon un niveau de détail ("year" | "month" | "day" | "minute")
 * ou selon une précision de donnée (millennium, century…).
 */
export function format(t: number, level: Level = "year", opts: { circa?: boolean } = {}): string {
  const c = fromT(t);
  const circa = opts.circa ? tr("era.circa") + " " : "";
  const coarse = ({ "1e5y": 1e5, "1e4y": 1e4, millennium: 1000, century: 100, decade: 10 } as Record<string, number>)[level];
  if (coarse) {
    const r = Math.round(c.Y / coarse) * coarse || c.Y;
    return (opts.circa === false ? "" : tr("era.circa") + " ") + fmtYearHist(r);
  }
  const months = list("months");
  const en = getLang() === "en";
  switch (level) {
    case "month": return circa + `${months[c.mo - 1]} ${fmtYearHist(c.Y)}`;
    case "day": return circa + (en ? `${months[c.mo - 1]} ${c.d}, ${fmtYearHist(c.Y)}` : `${dayLabel(c.d)} ${months[c.mo - 1]} ${fmtYearHist(c.Y)}`);
    case "hour":
    case "minute": return circa + (en ? `${months[c.mo - 1]} ${c.d}, ${fmtYearHist(c.Y)}, ${pad(c.h)}:${pad(c.mi)}` : `${dayLabel(c.d)} ${months[c.mo - 1]} ${fmtYearHist(c.Y)}, ${pad(c.h)}:${pad(c.mi)}`);
    default: return circa + fmtYearHist(c.Y);
  }
}

/** Niveau de détail d'affichage adapté à la durée visible (en années). */
export function levelForSpan(span: number): Level {
  if (span > 3) return "year";
  if (span > 60 / 365) return "month";
  if (span > 3 / 365) return "day";
  return "minute";
}

// -------------------------------------------------------------------------
// Graduations de la frise
// -------------------------------------------------------------------------
export interface Unit { id: string; years: number; kind: "year" | "month" | "day" | "hour" | "minute"; step: number }
export const UNITS: Unit[] = [
  { id: "100000y", years: 1e5, kind: "year", step: 1e5 },
  { id: "50000y", years: 5e4, kind: "year", step: 5e4 },
  { id: "10000y", years: 1e4, kind: "year", step: 1e4 },
  { id: "5000y", years: 5e3, kind: "year", step: 5e3 },
  { id: "1000y", years: 1e3, kind: "year", step: 1e3 },
  { id: "500y", years: 500, kind: "year", step: 500 },
  { id: "100y", years: 100, kind: "year", step: 100 },
  { id: "50y", years: 50, kind: "year", step: 50 },
  { id: "10y", years: 10, kind: "year", step: 10 },
  { id: "5y", years: 5, kind: "year", step: 5 },
  { id: "1y", years: 1, kind: "year", step: 1 },
  { id: "1mo", years: 1 / 12, kind: "month", step: 1 },
  { id: "1d", years: 1 / 365.2425, kind: "day", step: 1 },
  { id: "6h", years: 6 / 8765.82, kind: "hour", step: 6 },
  { id: "1h", years: 1 / 8765.82, kind: "hour", step: 1 },
  { id: "15min", years: 15 / 525949, kind: "minute", step: 15 }
];

/** Liste des graduations { t, label } d'une unité sur [v0, v1]. */
export function ticks(unit: Unit, v0: number, v1: number): { t: number; label: string }[] {
  const out: { t: number; label: string }[] = [];
  const MAX = 3000;
  const monthsShort = list("monthsShort");
  const en = getLang() === "en";
  if (unit.kind === "year") {
    const y0 = fromT(v0).Y, y1 = fromT(v1).Y;
    let Y = Math.floor(y0 / unit.step) * unit.step;
    for (let i = 0; Y <= y1 + unit.step && i < MAX; i++, Y += unit.step) {
      const t = histToAstro(Y);
      if (t < v0 - unit.years || t > v1 + unit.years) continue;
      out.push({ t, label: fmtYearHist(Y === 0 ? 1 : Y) });
    }
  } else if (unit.kind === "month") {
    let { Y, mo } = fromT(v0);
    for (let i = 0; i < MAX; i++) {
      const t = toT(Y, mo);
      if (t > v1) break;
      out.push({ t, label: mo === 1 ? `${monthsShort[0]} ${fmtYearHist(Y)}` : monthsShort[mo - 1] });
      mo++; if (mo > 12) { mo = 1; Y = Y === -1 ? 1 : Y + 1; }
    }
  } else {
    const c = fromT(v0);
    const dayLen = 1 / diy(c.A);
    let t = c.A + monthStart(c.A, c.mo - 1) * dayLen + (c.d - 1) * dayLen; // début du jour
    const stepT = unit.kind === "day" ? dayLen : unit.kind === "hour" ? dayLen * unit.step / 24 : dayLen * unit.step / 1440;
    for (let i = 0; t <= v1 && i < MAX * 4; i++, t += stepT) {
      if (t < v0 - stepT) continue;
      const k = fromT(t + 1e-9);
      const dayStr = en ? `${monthsShort[k.mo - 1]} ${k.d}` : `${k.d} ${monthsShort[k.mo - 1]}`;
      const label = unit.kind === "day" || (k.h === 0 && k.mi === 0) ? dayStr : `${pad(k.h)}:${pad(k.mi)}`;
      out.push({ t, label });
    }
  }
  return out;
}

export const histYear = (t: number) => fromT(t).Y;
export const fromHistYear = (Y: number) => histToAstro(Y);
