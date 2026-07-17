import { XMLParser, XMLValidator } from "fast-xml-parser";

export type Feed = { name: string; url: string; category?: string };
export type FeedItem = {
  guid?: string;
  title: string;
  url: string;
  published?: string;
  content: string;
};

type Xml = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  textNodeName: "#text",
  trimValues: true,
  parseTagValue: false,
});

const array = <T>(value: T | T[] | undefined): T[] =>
  value === undefined ? [] : Array.isArray(value) ? value : [value];
const string = (value: unknown): string =>
  typeof value === "string"
    ? value.trim()
    : typeof value === "object" && value
    ? string((value as Xml)["#text"])
    : "";

export function parseOpml(xml: string): Feed[] {
  const body = object(object(parseXml(xml).opml)?.body);
  if (!body) throw new Error("OPML body is missing");
  const feeds: Feed[] = [];

  const walk = (outlines: unknown) => {
    for (const outline of objects(outlines)) {
      const url = string(outline.xmlUrl) || string(outline.url);
      const name = string(outline.title) || string(outline.text) ||
        hostname(url);
      const category = string(outline.category) || undefined;
      if (url) feeds.push({ name, url, category });
      walk(outline.outline);
    }
  };

  walk(body.outline);
  return feeds;
}

export function parseFeed(xml: string, feedUrl: string): FeedItem[] {
  const document = parseXml(xml);
  const atom = object(document.feed);
  if (atom) return objects(atom.entry).map(atomItem);

  const rss = object(document.rss);
  const channel = rss && object(rss.channel);
  const rdf = object(document.RDF);
  const items = channel?.item ?? rdf?.item;
  if (!items) throw new Error(`Unsupported or empty feed: ${feedUrl}`);
  return objects(items).map(rssItem);
}

function rssItem(item: Xml): FeedItem {
  return {
    guid: string(item.guid) || undefined,
    title: string(item.title) || "Untitled article",
    url: string(item.link),
    published: string(item.pubDate) || string(item["dc:date"]) ||
      string(item.date) || undefined,
    content: string(item["content:encoded"]) || string(item.description),
  };
}

function atomItem(entry: Xml): FeedItem {
  const link =
    array(entry.link).map(object).find((item) =>
      item && string(item.rel) !== "alternate"
    ) ?? object(entry.link);
  return {
    guid: string(entry.id) || undefined,
    title: string(entry.title) || "Untitled article",
    url: link ? string(link.href) : "",
    published: string(entry.published) || string(entry.updated) || undefined,
    content: string(entry.content) || string(entry.summary),
  };
}

function parseXml(xml: string): Xml {
  if (XMLValidator.validate(xml) !== true) throw new Error("Invalid XML");
  return parser.parse(xml) as Xml;
}

function object(value: unknown): Xml | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Xml
    : undefined;
}

function objects(value: unknown): Xml[] {
  return array(value).map(object).filter((item): item is Xml =>
    item !== undefined
  );
}

function hostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Untitled feed";
  }
}
