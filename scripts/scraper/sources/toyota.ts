import * as cheerio from "cheerio";
import type { AnyNode } from "domhandler";
import type { ScrapedCard, SourceAdapter } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TOYOTA_URL =
  "https://www.toyota.de/service-zubehoer/rettungsdatenblaetter";

const SOURCE_NAME = "Toyota DE";

const BASE_URL = "https://www.toyota.de";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Resolve a possibly-relative URL to an absolute one based on the Toyota
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
  // Relative URL — prepend base
  const path = href.startsWith("/") ? href : `/${href}`;
  return `${BASE_URL}${path}`;
}

/**
 * Try to extract a year range (e.g. "2019-2025", "2020 - 2023") from the
 * given text. Returns `[yearFrom, yearTo]` or `[null, null]` when no range
 * is found. Also handles a single four-digit year as yearFrom.
 */
function extractYearRange(text: string): [number | null, number | null] {
  // Pattern: "2019-2025" or "2019 - 2025" or "2019 – 2025" (en-dash)
  const rangeMatch = text.match(/\b(20\d{2})\s*[-–]\s*(20\d{2})\b/);
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
    .replace(/\s*\(?\s*20\d{2}\s*[-–]\s*20\d{2}\s*\)?\s*/g, " ")
    .replace(/\s*\(?\s*ab\s+20\d{2}\s*\)?\s*/gi, " ")
    .replace(/\.pdf$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Derive a model name from the link text, the surrounding context, or the
 * PDF filename as a last resort.
 */
function deriveModelName(
  $el: cheerio.Cheerio<AnyNode>,
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
  const parent = $el.closest("li, tr, div, section");
  if (parent.length > 0) {
    const heading = parent.find("h1, h2, h3, h4, h5, h6, strong, b").first();
    if (heading.length > 0) {
      const headingText = cleanModelName(heading.text().trim());
      if (headingText.length >= 2) {
        return headingText;
      }
    }
  }

  // 3. Fall back to the PDF filename
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

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

// NOTE: The selectors below are best-effort guesses for the Toyota DE rescue
// card page. They may need adjustment after testing against the live site, as
// the page structure can change over time. Multiple fallback strategies are
// included to improve resilience.

const adapter: SourceAdapter = {
  name: SOURCE_NAME,

  async scrape(): Promise<ScrapedCard[]> {
    const response = await fetch(TOYOTA_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch Toyota rescue card page: HTTP ${response.status}`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const cards: ScrapedCard[] = [];
    const seen = new Set<string>();

    // Strategy: find all <a> tags whose href ends with ".pdf" — these are the
    // direct PDF download links for rescue data sheets. We try progressively
    // broader selectors until we find matches.
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

    // Additional fallback: some sites use query parameters or uppercase
    // extensions, so also look for links that contain ".pdf" anywhere in href
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

      // Deduplicate by PDF URL
      if (seen.has(pdfUrl)) {
        return;
      }
      seen.add(pdfUrl);

      // Combine link text, surrounding context, and filename for year extraction
      const contextText = [
        $el.text(),
        $el.attr("title") ?? "",
        $el.closest("li, tr, div").text(),
        href,
      ].join(" ");

      const [yearFrom, yearTo] = extractYearRange(contextText);
      const model = deriveModelName($el, href);

      cards.push({
        manufacturer: "Toyota",
        model,
        yearFrom,
        yearTo,
        pdfUrl,
        sourceUrl: TOYOTA_URL,
        sourceName: SOURCE_NAME,
      });
    });

    return cards;
  },
};

export default adapter;
