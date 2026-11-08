/*
 * Accès à Wikipédia (API REST publique, CORS ouvert).
 * - summary(title, lang) : résumé + image + lien d'un article
 * - entitySummary(name, year) : résout un nom d'État du jeu de données vers
 *   l'article fr le plus pertinent (dictionnaire local, puis liens interlangues).
 */
(function () {
  const cache = new Map();

  function cached(key, fn) {
    if (!cache.has(key)) cache.set(key, fn().catch(err => { cache.delete(key); throw err; }));
    return cache.get(key);
  }

  function summary(title, lang = "fr") {
    const slug = encodeURIComponent(title.replace(/ /g, "_"));
    return cached(`s:${lang}:${title}`, async () => {
      const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug}`);
      if (!res.ok) throw new Error(`Wikipédia ${res.status}`);
      const d = await res.json();
      if (d.type === "disambiguation") throw new Error("Page d'homonymie");
      return {
        title: d.title,
        extract: d.extract,
        image: d.thumbnail && d.thumbnail.source,
        url: d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page,
        lang
      };
    });
  }

  function frTitleFromEn(enTitle) {
    return cached(`ll:${enTitle}`, async () => {
      const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1" +
        "&prop=langlinks&lllang=fr&titles=" + encodeURIComponent(enTitle);
      const res = await fetch(url);
      if (!res.ok) return null;
      const d = await res.json();
      const pages = d.query && d.query.pages ? Object.values(d.query.pages) : [];
      const ll = pages[0] && pages[0].langlinks && pages[0].langlinks[0];
      return ll ? ll["*"] : null;
    });
  }

  /** Nom français + article wiki d'un État à une année donnée. */
  function resolveEntity(name, year) {
    const e = (window.HISTOMAP_ENTITIES || {})[name];
    if (!e) return null;
    if (!Array.isArray(e)) return e;
    return e.find(x => x.until === undefined || year <= x.until) || e[e.length - 1];
  }

  async function entitySummary(name, year) {
    const ent = resolveEntity(name, year);
    if (ent && ent.wiki) {
      try { return await summary(ent.wiki, "fr"); } catch (_) { /* on tente la suite */ }
    }
    try {
      const fr = await frTitleFromEn(name);
      if (fr) return await summary(fr, "fr");
    } catch (_) { /* idem */ }
    return summary(name, "en");
  }

  window.Wiki = { summary, entitySummary, resolveEntity };
})();
