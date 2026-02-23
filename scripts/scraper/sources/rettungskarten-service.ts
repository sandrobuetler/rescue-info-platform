import * as cheerio from "cheerio";
import type { ScrapedCard, SourceAdapter } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const INDEX_URL =
  "https://www.rettungskarten-service.de/rettungskarten/";

const SOURCE_NAME = "rettungskarten-service.de";

const BASE_URL = "https://www.rettungskarten-service.de";

// Polite delay between manufacturer page fetches (milliseconds)
const REQUEST_DELAY_MS = 500;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a possibly-relative URL to an absolute one based on the
 * rettungskarten-service.de domain.
 */
function toAbsoluteUrl(href: string): string {
  if (href.startsWith("http://") || href.startsWith("https://")) {
    return href;
  }
  // Handle protocol-relative URLs
  if (href.startsWith("//")) {
    return `https:${href}`;
  }
  // Relative URL -- prepend base
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${BASE_URL}${path}`;
}

/**
 * Try to extract a year range (e.g. "2019-2025", "2020 - 2023") from the
 * given text. Returns `[yearFrom, yearTo]` or `[null, null]` when no range
 * is found. Also handles a single four-digit year as yearFrom.
 */
function extractYearRange(text: string): [number | null, number | null] {
  // Pattern: "2019-2025" or "2019 - 2025" or "2019 -- 2025" (en-dash)
  const rangeMatch = text.match(/\b((?:19|20)\d{2})\s*[-\u2013]\s*((?:19|20)\d{2})\b/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
  }

  // Pattern: single year like "(2020)" or "ab 2020" or standalone "2020"
  const singleMatch = text.match(/\b((?:19|20)\d{2})\b/);
  if (singleMatch) {
    return [parseInt(singleMatch[1], 10), null];
  }

  return [null, null];
}

/**
 * Clean up a model name string: trim whitespace, collapse multiple spaces,
 * and strip trailing year-range info that was already extracted.
 */
function cleanModelName(raw: string): string {
  return raw
    .replace(/\s*\(?\s*(?:19|20)\d{2}\s*[-\u2013]\s*(?:19|20)\d{2}\s*\)?\s*/g, " ")
    .replace(/\s*\(?\s*ab\s+(?:19|20)\d{2}\s*\)?\s*/gi, " ")
    .replace(/\.pdf$/i, "")
    .replace(/rettungskarte/gi, "")
    .replace(/rescue\s*card/gi, "")
    .replace(/download/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a model name from the PDF link text, the surrounding context, or
 * the PDF filename as a last resort.
 */
function deriveModelName(
  $el: cheerio.Cheerio<cheerio.Element>,
  $: cheerio.CheerioAPI,
  href: string,
): string {
  // 1. Try the link text itself
  const linkText = $el.text().trim();
  if (linkText.length > 0) {
    const cleaned = cleanModelName(linkText);
    if (cleaned.length >= 2) {
      return cleaned;
    }
  }

  // 2. Try the closest heading or parent element text
  const parent = $el.closest("li, tr, div, section, article");
  if (parent.length > 0) {
    const heading = parent.find("h1, h2, h3, h4, h5, h6, strong, b").first();
    if (heading.length > 0) {
      const headingText = cleanModelName(heading.text().trim());
      if (headingText.length >= 2) {
        return headingText;
      }
    }
  }

  // 3. Try the title or aria-label attribute of the link
  const title = $el.attr("title") ?? $el.attr("aria-label") ?? "";
  if (title.length > 0) {
    const cleaned = cleanModelName(title);
    if (cleaned.length >= 2) {
      return cleaned;
    }
  }

  // 4. Fall back to the PDF filename
  try {
    const url = new URL(toAbsoluteUrl(href));
    const filename = url.pathname.split("/").pop() ?? "";
    const nameFromFile = cleanModelName(
      decodeURIComponent(filename).replace(/[_-]/g, " "),
    );
    if (nameFromFile.length >= 2) {
      return nameFromFile;
    }
  } catch {
    // Ignore URL parsing errors
  }

  return "Unknown Model";
}

/**
 * Extract manufacturer name from either the link text on the index page or
 * the page title / heading of the manufacturer sub-page.
 */
function extractManufacturerName(
  $: cheerio.CheerioAPI,
  fallbackName: string,
): string {
  // Try the main heading on the manufacturer page
  const headingSelectors = [
    "h1.entry-title",
    "h1.page-title",
    "article h1",
    "main h1",
    "h1",
  ];

  for (const selector of headingSelectors) {
    const heading = $(selector).first();
    if (heading.length > 0) {
      const text = heading.text().trim();
      // Strip common prefixes/suffixes like "Rettungskarten" from the heading
      const cleaned = text
        .replace(/rettungskarten?\s*/gi, "")
        .replace(/rescue\s*cards?\s*/gi, "")
        .replace(/[-\u2013|:]\s*/g, "")
        .trim();
      if (cleaned.length >= 2 && cleaned.length <= 50) {
        return cleaned;
      }
      // If cleaning removed too much, use the raw heading if reasonable
      if (text.length >= 2 && text.length <= 50) {
        return text;
      }
    }
  }

  return fallbackName;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

// NOTE: The selectors below are best-effort guesses for the
// rettungskarten-service.de WordPress site. They may need adjustment after
// testing against the live site, as the page structure can change over time.
// This is a multi-page scraper: it first fetches the index page to discover
// manufacturer sub-pages, then fetches each sub-page for PDF links.

const adapter: SourceAdapter = {
  name: SOURCE_NAME,

  async scrape(): Promise<ScrapedCard[]> {
    // -----------------------------------------------------------------
    // Step 1: Fetch the index page to discover manufacturer sub-pages
    // -----------------------------------------------------------------
    const indexResponse = await fetch(INDEX_URL);

    if (!indexResponse.ok) {
      throw new Error(
        `Failed to fetch rettungskarten-service.de index page: HTTP ${indexResponse.status}`,
      );
    }

    const indexHtml = await indexResponse.text();
    const $index = cheerio.load(indexHtml);

    // Find links to manufacturer sub-pages. On this WordPress site,
    // manufacturer pages are typically deeper paths under /rettungskarten/.
    const manufacturerLinks = new Map<string, string>();

    // NOTE: These selectors target the WordPress content area. They may need
    // adjustment if the site layout changes.
    const contentSelectors = [
      'main a[href*="/rettungskarten/"]',
      'article a[href*="/rettungskarten/"]',
      '.entry-content a[href*="/rettungskarten/"]',
      '.content a[href*="/rettungskarten/"]',
      '[role="main"] a[href*="/rettungskarten/"]',
    ];

    let $manufacturerLinks = $index("___nonexistent___"); // empty selection

    for (const selector of contentSelectors) {
      const $candidate = $index(selector);
      if ($candidate.length > 0) {
        $manufacturerLinks = $candidate;
        break;
      }
    }

    // Fallback: search all links on the page
    if ($manufacturerLinks.length === 0) {
      $manufacturerLinks = $index('a[href*="/rettungskarten/"]');
    }

    $manufacturerLinks.each((_i, el) => {
      const href = $index(el).attr("href") ?? "";
      const absoluteUrl = toAbsoluteUrl(href);

      // Skip the index page itself and anchors
      if (absoluteUrl === INDEX_URL || absoluteUrl === INDEX_URL.replace(/\/$/, "")) {
        return;
      }

      // Only include links that go deeper than the index (i.e. manufacturer sub-pages)
      try {
        const url = new URL(absoluteUrl);
        const pathParts = url.pathname.replace(/\/$/, "").split("/").filter(Boolean);
        // The index is at /rettungskarten/ (1 part). Sub-pages have 2+ parts.
        if (pathParts.length < 2) {
          return;
        }
        // Skip links that are clearly not manufacturer pages (e.g. .pdf files)
        if (url.pathname.toLowerCase().endsWith(".pdf")) {
          return;
        }
      } catch {
        return;
      }

      // Deduplicate by URL
      if (!manufacturerLinks.has(absoluteUrl)) {
        const linkText = $index(el).text().trim();
        manufacturerLinks.set(absoluteUrl, linkText || "Unknown");
      }
    });

    // -----------------------------------------------------------------
    // Step 2: Fetch each manufacturer page and extract PDF links
    // -----------------------------------------------------------------
    const cards: ScrapedCard[] = [];
    const seenPdfUrls = new Set<string>();

    let isFirstRequest = true;

    for (const [manufacturerPageUrl, indexLinkText] of manufacturerLinks) {
      // Polite delay between requests
      if (!isFirstRequest) {
        await new Promise((r) => setTimeout(r, REQUEST_DELAY_MS));
      }
      isFirstRequest = false;

      let manufacturerHtml: string;
      try {
        const response = await fetch(manufacturerPageUrl);
        if (!response.ok) {
          console.warn(
            `  Skipping ${manufacturerPageUrl}: HTTP ${response.status}`,
          );
          continue;
        }
        manufacturerHtml = await response.text();
      } catch (err) {
        console.warn(
          `  Skipping ${manufacturerPageUrl}: ${err instanceof Error ? err.message : err}`,
        );
        continue;
      }

      const $ = cheerio.load(manufacturerHtml);

      // Derive the manufacturer name from the page content or the index link text
      const manufacturer = extractManufacturerName($, indexLinkText);

      // Find PDF links on the manufacturer page
      const pdfSelectors = [
        'main a[href$=".pdf"]',
        'article a[href$=".pdf"]',
        '.entry-content a[href$=".pdf"]',
        '.content a[href$=".pdf"]',
        '[role="main"] a[href$=".pdf"]',
      ];

      let $pdfLinks = $("___nonexistent___"); // empty selection

      for (const selector of pdfSelectors) {
        const $candidate = $(selector);
        if ($candidate.length > 0) {
          $pdfLinks = $candidate;
          break;
        }
      }

      // Fallback: search all links on the page for PDF hrefs
      if ($pdfLinks.length === 0) {
        $pdfLinks = $('a[href$=".pdf"]');
      }

      // Additional fallback: case-insensitive or query-parameter PDFs
      if ($pdfLinks.length === 0) {
        $pdfLinks = $("a[href]").filter((_i, el) => {
          const href = ($(el).attr("href") ?? "").toLowerCase();
          return href.includes(".pdf");
        });
      }

      $pdfLinks.each((_i, el) => {
        const $el = $(el);
        const href = $el.attr("href") ?? "";

        if (!href) {
          return;
        }

        const pdfUrl = toAbsoluteUrl(href);

        // Deduplicate by PDF URL across all manufacturers
        if (seenPdfUrls.has(pdfUrl)) {
          return;
        }
        seenPdfUrls.add(pdfUrl);

        // Combine link text, attributes, surrounding context, and href for
        // year extraction
        const contextText = [
          $el.text(),
          $el.attr("title") ?? "",
          $el.attr("aria-label") ?? "",
          $el.closest("li, tr, div").text(),
          href,
        ].join(" ");

        const [yearFrom, yearTo] = extractYearRange(contextText);
        const model = deriveModelName($el, $, href);

        cards.push({
          manufacturer,
          model,
          yearFrom,
          yearTo,
          pdfUrl,
          sourceUrl: manufacturerPageUrl,
          sourceName: SOURCE_NAME,
        });
      });
    }

    return cards;
  },
};

export default adapter;
