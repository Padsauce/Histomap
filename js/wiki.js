/*
 * Accès à Wikipédia (API REST publique, CORS ouvert), via la couche Net (cache, mode dégradé).
 * - summary(title, lang)       : résumé + image + lien
 * - article(title, lang)       : HTML complet de l'article (affiché dans un cadre isolé)
 * - entitySummary(name, year)  : résout un nom d'État du jeu de données vers l'article fr le plus pertinent
 */
(function () {
  const CONTENT_LANG = "fr"; // langue des contenus (les sujets sont rédigés en français pour l'instant)
  const slug = title => encodeURIComponent(title.replace(/ /g, "_"));

  async function summary(title, lang = CONTENT_LANG) {
    const d = await Net.getJSON(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug(title)}`, { persist: true });
    if (d.type === "disambiguation") throw new Error("Page d'homonymie");
    return {
      title: d.title,
      extract: d.extract,
      image: d.thumbnail && d.thumbnail.source,
      url: d.content_urls && d.content_urls.desktop && d.content_urls.desktop.page,
      lang
    };
  }

  function article(title, lang = CONTENT_LANG) {
    return Net.getText(`https://${lang}.wikipedia.org/api/rest_v1/page/html/${slug(title)}`, { persist: true });
  }

  async function frTitleFromEn(enTitle) {
    const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1" +
      "&prop=langlinks&lllang=fr&titles=" + encodeURIComponent(enTitle);
    const d = await Net.getJSON(url, { persist: true });
    const pages = d.query && d.query.pages ? Object.values(d.query.pages) : [];
    const ll = pages[0] && pages[0].langlinks && pages[0].langlinks[0];
    return ll ? ll["*"] : null;
  }

  /** Nom français + article wiki d'un État à une année (historique) donnée. */
  function resolveEntity(name, year) {
    const e = (window.HISTOMAP_ENTITIES || {})[name];
    if (!e) return null;
    if (!Array.isArray(e)) return e;
    return e.find(x => x.until === undefined || year <= x.until) || e[e.length - 1];
  }

  /** Titre d'article (et langue) le plus pertinent pour un État. */
  async function entityArticle(name, year) {
    const ent = resolveEntity(name, year);
    if (ent && ent.wiki) return { title: ent.wiki, lang: "fr" };
    try {
      const fr = await frTitleFromEn(name);
      if (fr) return { title: fr, lang: "fr" };
    } catch (_) { /* repli ci-dessous */ }
    return { title: name, lang: "en" };
  }

  async function entitySummary(name, year) {
    const a = await entityArticle(name, year);
    try { return await summary(a.title, a.lang); } catch (err) {
      if (a.lang === "fr") return summary(name, "en");
      throw err;
    }
  }

  window.Wiki = { summary, article, entitySummary, entityArticle, resolveEntity };
})();
