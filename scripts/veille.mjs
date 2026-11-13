// Récupère les flux RSS de la veille et écrit veille.json (lu par index.html).
// Lancement : node scripts/veille.mjs   (Node 18+ , aucune dépendance)
// Sur GitHub, .github/workflows/veille.yml le lance automatiquement toutes les heures.
import { writeFile } from "node:fs/promises";

const FLUX = [
  { nom: "CERT-FR (ANSSI)", url: "https://www.cert.ssi.gouv.fr/feed/" },
  { nom: "IT-Connect", url: "https://www.it-connect.fr/actualites/actu-securite/feed/" },
  { nom: "Le Monde Informatique", url: "https://www.lemondeinformatique.fr/flux-rss/thematique/securite/rss.xml" },
  { nom: "ZATAZ", url: "https://www.zataz.com/feed/" },
  { nom: "01net", url: "https://www.01net.com/actualites/securite/feed/" },
  { nom: "UnderNews", url: "https://www.undernews.fr/feed" },
];
const PAR_SOURCE = 10;

const decode = s => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
  .replace(/<[^>]+>/g, " ")
  .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
  .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
  .replace(/&nbsp;/g, " ").replace(/&quot;/g, '"').replace(/&#039;|&apos;/g, "'")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
  .replace(/\s+/g, " ").trim();
const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "i")); return m ? m[1] : ""; };

async function lire({ nom, url }) {
  const r = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0 (portfolio veille)" }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const xml = await r.text();
  const blocs = xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || [];
  return blocs.slice(0, PAR_SOURCE).map(b => {
    const lien = decode(tag(b, "link")) || (b.match(/<link[^>]*href="([^"]+)"/i) || [])[1] || "";
    const date = new Date(decode(tag(b, "pubDate") || tag(b, "updated") || tag(b, "published") || tag(b, "dc:date")));
    return {
      src: nom,
      title: decode(tag(b, "title")),
      link: lien,
      description: decode(tag(b, "description") || tag(b, "summary") || tag(b, "content")).slice(0, 400),
      date: isNaN(date) ? null : date.toISOString(),
    };
  }).filter(i => i.title && i.link && !/\[sponso/i.test(i.title));
}

const res = await Promise.allSettled(FLUX.map(lire));
const items = res.flatMap(r => r.status === "fulfilled" ? r.value : [])
  .filter(i => i.date).sort((a, b) => b.date.localeCompare(a.date));
const sources = FLUX.map((f, i) => ({ nom: f.nom, ok: res[i].status === "fulfilled", erreur: res[i].reason?.message }));
sources.forEach(s => console.log(`${s.ok ? "✔" : "✘"} ${s.nom}${s.ok ? "" : " — " + s.erreur}`));
await writeFile(new URL("../veille.json", import.meta.url), JSON.stringify({ updated: new Date().toISOString(), sources, items }, null, 1));
console.log(`${items.length} articles écrits dans veille.json`);
