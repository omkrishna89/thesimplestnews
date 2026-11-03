// Reads RSS 2.0, RSS 1.0 (RDF) and Atom feeds into one simple shape:
// { title, link, guid, published (ms), text, image, videoId }
import { XMLParser } from "fast-xml-parser";
import { cleanUrl, decodeEntities, parseDate, plain } from "./util.mjs";

const ARRAYS = new Set(["item", "entry", "link", "media:content", "media:thumbnail", "enclosure", "category"]);

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  isArray: (name) => ARRAYS.has(name),
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
});

const text = (v) => {
  if (v == null) return "";
  if (typeof v === "string" || typeof v === "number") return String(v);
  if (Array.isArray(v)) return text(v[0]);
  if (typeof v === "object") return text(v["#text"] ?? v["__cdata"] ?? "");
  return "";
};

// First <img src> inside an HTML snippet
const imgIn = (html = "") => {
  const m = /<img[^>]+src=["']([^"']+)["']/i.exec(decodeEntities(String(html)));
  return m ? m[1] : "";
};

function mediaImage(node) {
  const pick = (list) => {
    for (const m of list || []) {
      const url = m?.["@_url"];
      const type = m?.["@_type"] || m?.["@_medium"] || "";
      if (url && (!type || /image/i.test(type) || /\.(jpe?g|png|webp|gif)(\?|$)/i.test(url))) return url;
    }
    return "";
  };
  return (
    pick(node["media:content"]) ||
    pick(node["media:thumbnail"]) ||
    pick(node["media:group"]?.["media:content"]) ||
    pick(node["media:group"]?.["media:thumbnail"]) ||
    pick(node.enclosure) ||
    text(node.image?.url) ||
    text(node["image"]) ||
    ""
  );
}

function atomLink(links) {
  if (!links) return "";
  const list = Array.isArray(links) ? links : [links];
  const alt = list.find((l) => !l["@_rel"] || l["@_rel"] === "alternate") || list[0];
  return alt?.["@_href"] || text(alt);
}

export function parseFeed(xml) {
  if (!xml || !/<(rss|feed|rdf:RDF|channel)[\s>]/i.test(xml)) throw new Error("not a feed");
  // Some feeds put stray "&" in text; escape the ones that aren't entities so the XML stays valid.
  const fixed = xml.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]{1,31});)/gi, "&amp;");
  const doc = parser.parse(fixed);
  const channel = doc.rss?.channel || doc["rdf:RDF"]?.channel || doc.channel;
  const nodes = doc.rss?.channel?.item || doc["rdf:RDF"]?.item || doc.feed?.entry || channel?.item || [];
  const feedTitle = plain(text(channel?.title || doc.feed?.title));

  const items = [];
  for (const n of nodes) {
    const isAtom = !!doc.feed;
    const rawLink = isAtom ? atomLink(n.link) : text(n.link) || atomLink(n.link) || (text(n.guid).startsWith("http") ? text(n.guid) : "");
    const link = cleanUrl(decodeEntities(rawLink));
    const title = plain(text(n.title));
    if (!link || !title) continue;
    const html = text(n["content:encoded"]) || text(n.description) || text(n.summary) || text(n.content) || text(n["media:group"]?.["media:description"]);
    const published =
      parseDate(text(n.pubDate)) || parseDate(text(n.published)) || parseDate(text(n["dc:date"])) || parseDate(text(n.updated)) || NaN;
    let image = mediaImage(n) || imgIn(html);
    if (image.startsWith("//")) image = "https:" + image;
    items.push({
      title,
      link,
      guid: text(n.guid) || text(n.id) || link,
      published: Number.isFinite(published) ? published : NaN,
      text: plain(html),
      image: /^https?:\/\//.test(image) ? image : "",
      videoId: text(n["yt:videoId"]) || "",
      channel: plain(text(n.author?.name)) || "",
    });
  }
  return { title: feedTitle, items };
}
