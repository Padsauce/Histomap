/*
 * Accès à Wikipédia (API REST publique, CORS ouvert), via la couche réseau (cache, mode dégradé).
 */
import { getJSON, getText } from "./net";
import { ENTITIES, type EntityName } from "../data/entities";

const CONTENT_LANG = "fr"; // langue des contenus (les sujets sont rédigés en français pour l'instant)
const slug = (title: string) => encodeURIComponent(title.replace(/ /g, "_"));

export interface WikiSummary { title: string; extract: string; image?: string; url?: string; lang: string }

export async function summary(title: string, lang = CONTENT_LANG): Promise<WikiSummary> {
  const d = await getJSON<any>(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${slug(title)}`, { persist: true });
  if (d.type === "disambiguation") throw new Error("Page d'homonymie");
  return {
    title: d.title,
    extract: d.extract,
    image: d.thumbnail?.source,
    url: d.content_urls?.desktop?.page,
    lang
  };
}

export function article(title: string, lang = CONTENT_LANG): Promise<string> {
  return getText(`https://${lang}.wikipedia.org/api/rest_v1/page/html/${slug(title)}`, { persist: true });
}

async function frTitleFromEn(enTitle: string): Promise<string | null> {
  const url = "https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&redirects=1" +
    "&prop=langlinks&lllang=fr&titles=" + encodeURIComponent(enTitle);
  const d = await getJSON<any>(url, { persist: true });
  const pages: any[] = d.query?.pages ? Object.values(d.query.pages) : [];
  const ll = pages[0]?.langlinks?.[0];
  return ll ? ll["*"] : null;
}

/** Nom français + article wiki d'un État du jeu de frontières à une année (historique) donnée. */
export function resolveEntity(name: string, year: number): EntityName | null {
  const e = ENTITIES[name];
  if (!e) return null;
  if (!Array.isArray(e)) return e;
  return e.find(x => x.until === undefined || year <= x.until) || e[e.length - 1];
}

/** Titre d'article (et langue) le plus pertinent pour un État. */
export async function entityArticle(name: string, year: number): Promise<{ title: string; lang: string }> {
  const ent = resolveEntity(name, year);
  if (ent?.wiki) return { title: ent.wiki, lang: "fr" };
  try {
    const fr = await frTitleFromEn(name);
    if (fr) return { title: fr, lang: "fr" };
  } catch { /* repli ci-dessous */ }
  return { title: name, lang: "en" };
}

export async function entitySummary(name: string, year: number): Promise<WikiSummary> {
  const a = await entityArticle(name, year);
  try { return await summary(a.title, a.lang); } catch (err) {
    if (a.lang === "fr") return summary(name, "en");
    throw err;
  }
}
