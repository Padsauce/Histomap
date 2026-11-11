/* Traductions de l'interface : t("clé", { param }) et attributs data-i18n* dans le HTML. */
import fr from "./fr";
import en from "./en";

const DICTS: Record<string, Record<string, string | string[]>> = { fr, en };
const FALLBACK = "fr";
let lang = FALLBACK;
// Français par défaut ; l'utilisateur peut choisir une autre langue (mémorisée).
try { lang = localStorage.getItem("histomap.lang") || FALLBACK; } catch { /* stockage indisponible */ }
if (!DICTS[lang]) lang = FALLBACK;

function raw(key: string): string | string[] | undefined {
  const d = DICTS[lang] || {};
  if (key in d) return d[key];
  return DICTS[FALLBACK][key];
}

/** Texte traduit, avec remplacement des {paramètres}. */
export function t(key: string, params?: Record<string, string | number>): string {
  const s = raw(key);
  if (s === undefined) return key;
  if (typeof s !== "string") return s.join(", ");
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m));
}

/** Liste traduite (mois…). */
export function list(key: string): string[] {
  const s = raw(key);
  return Array.isArray(s) ? s : [];
}

/** Applique les traductions : data-i18n (texte), data-i18n-aria (aria-label), data-i18n-title (title). */
export function apply(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n!); });
  root.querySelectorAll<HTMLElement>("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria!)));
  root.querySelectorAll<HTMLElement>("[data-i18n-title]").forEach(el => el.setAttribute("title", t(el.dataset.i18nTitle!)));
  document.documentElement.lang = lang;
}

export function setLang(l: string): void {
  if (!DICTS[l]) return;
  lang = l;
  try { localStorage.setItem("histomap.lang", l); } catch { /* idem */ }
  apply();
}

export const getLang = (): string => lang;
export const languages = Object.keys(DICTS);
