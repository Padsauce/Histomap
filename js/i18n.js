/* Traductions de l'interface : I18n.t("clé", { param }) et attributs data-i18n* dans le HTML. */
(function () {
  const DICTS = window.HISTOMAP_I18N || {};
  const FALLBACK = "fr";
  let lang = FALLBACK;
  // Français par défaut ; l'utilisateur peut choisir une autre langue (mémorisée).
  try { lang = localStorage.getItem("histomap.lang") || FALLBACK; } catch (_) { /* stockage indisponible */ }
  if (!DICTS[lang]) lang = FALLBACK;

  function raw(key) {
    const d = DICTS[lang] || {};
    if (key in d) return d[key];
    return (DICTS[FALLBACK] || {})[key];
  }

  function t(key, params) {
    let s = raw(key);
    if (s === undefined) return key;
    if (typeof s !== "string") return s;
    if (params) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m));
    return s;
  }

  /** Applique les traductions : data-i18n (texte), data-i18n-aria (aria-label), data-i18n-title (title). */
  function apply(root = document) {
    root.querySelectorAll("[data-i18n]").forEach(el => { el.textContent = t(el.dataset.i18n); });
    root.querySelectorAll("[data-i18n-aria]").forEach(el => el.setAttribute("aria-label", t(el.dataset.i18nAria)));
    root.querySelectorAll("[data-i18n-title]").forEach(el => el.setAttribute("title", t(el.dataset.i18nTitle)));
    document.documentElement.lang = lang;
  }

  function setLang(l) {
    if (!DICTS[l]) return;
    lang = l;
    try { localStorage.setItem("histomap.lang", l); } catch (_) { /* idem */ }
    apply();
  }

  window.I18n = { t, apply, setLang, get lang() { return lang; }, languages: Object.keys(DICTS) };
})();
