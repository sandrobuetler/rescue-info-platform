import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ScrapedCard, SourceAdapter } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SKODA_URL =
  "https://www.skoda-auto.de/service/rettungskarten";

const SOURCE_NAME = "Skoda DE";

const BASE_URL = "https://www.skoda-auto.de";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a possibly-relative URL to an absolute one based on the Skoda
 * domain.
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
  const rangeMatch = text.match(/\b(20\d{2})\s*[-\u2013]\s*(20\d{2})\b/);
  if (rangeMatch) {
    return [parseInt(rangeMatch[1], 10), parseInt(rangeMatch[2], 10)];
  }

  // Pattern: single year like "(2020)" or "ab 2020" or standalone "2020"
  const singleMatch = text.match(/\b(20\d{2})\b/);
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
    .replace(/\s*\(?\s*20\d{2}\s*[-\u2013]\s*20\d{2}\s*\)?\s*/g, " ")
    .replace(/\s*\(?\s*ab\s+20\d{2}\s*\)?\s*/gi, " ")
    .replace(/\.pdf$/i, "")
    .replace(/rettungskarte/gi, "")
    .replace(/rescue\s*card/gi, "")
    .replace(/download/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a model name from the link text, the surrounding context, or the
 * PDF filename as a last resort.
 */
function deriveModelName(
  $el: cheerio.Cheerio<AnyNode>,
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
 * Check whether a href looks like a PDF link. Skoda may use UUID-based
 * download URLs that do not end with ".pdf", so we also look for common
 * download-related path segments.
 */
function isPdfOrDownloadLink(href: string): boolean {
  const lower = href.toLowerCase();
  return (
    lower.endsWith(".pdf") ||
    lower.includes(".pdf?") ||
    lower.includes("/download") ||
    lower.includes("rettungskarte") ||
    lower.includes("rescue") ||
    // UUID-based download patterns (e.g. /api/download/<uuid>)
    /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      lower,
    )
  );
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

// NOTE: The selectors below are best-effort guesses for the Skoda DE rescue
// card page. They may need adjustment after testing against the live site, as
// the page structure can change over time. Skoda pages often use UUID-based
// PDF download URLs rather than descriptive filenames.

const adapter: SourceAdapter = {
  name: SOURCE_NAME,

  async scrape(): Promise<ScrapedCard[]> {
    const response = await fetch(SKODA_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Skoda rescue card page: HTTP ${response.status}`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const cards: ScrapedCard[] = [];
    const seen = new Set<string>();

    // Strategy 1: find <a> tags whose href ends with ".pdf" -- direct PDF links
    const contentSelectors = [
      'main a[href$=".pdf"]',
      'article a[href$=".pdf"]',
      '.content-container a[href$=".pdf"]',
      '[role="main"] a[href$=".pdf"]',
    ];

    let $pdfLinks = $("___nonexistent___"); // empty selection

    for (const selector of contentSelectors) {
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

    // Strategy 2: Skoda may use UUID-based download links instead of .pdf
    // extensions. Look for links containing "rettungskarte", "download", or
    // "rescue" in their href or text.
    if ($pdfLinks.length === 0) {
      const downloadSelectors = [
        'main a[href*="download"]',
        'main a[href*="rettungskarte"]',
        'article a[href*="download"]',
        'article a[href*="rettungskarte"]',
      ];

      for (const selector of downloadSelectors) {
        const $candidate = $(selector);
        if ($candidate.length > 0) {
          $pdfLinks = $candidate;
          break;
        }
      }
    }

    // Strategy 3: broader fallback -- look at all links on the page and filter
    // for anything that looks like a PDF or download link
    if ($pdfLinks.length === 0) {
      $pdfLinks = $("a[href]").filter((_i, el) => {
        const href = $(el).attr("href") ?? "";
        return isPdfOrDownloadLink(href);
      });
    }

    // Strategy 4: some pages list models as link cards with class-based
    // selectors. Look for any link whose text contains "rettungskarte" or
    // "download".
    if ($pdfLinks.length === 0) {
      $pdfLinks = $("a").filter((_i, el) => {
        const text = $(el).text().toLowerCase();
        return (
          text.includes("rettungskarte") ||
          text.includes("rescue") ||
          text.includes("download")
        );
      });
    }

    $pdfLinks.each((_i, el) => {
      const $el = $(el);
      const href = $el.attr("href") ?? "";

      if (!href) {
        return;
      }

      const pdfUrl = toAbsoluteUrl(href);

      // Deduplicate by resolved PDF URL
      if (seen.has(pdfUrl)) {
        return;
      }
      seen.add(pdfUrl);

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
        manufacturer: "Skoda",
        model,
        yearFrom,
        yearTo,
        pdfUrl,
        sourceUrl: SKODA_URL,
        sourceName: SOURCE_NAME,
      });
    });

    return cards;
  },
};

export default adapter;
