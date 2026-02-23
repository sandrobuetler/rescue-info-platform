import * as cheerio from "cheerio";
import type { ScrapedCard, SourceAdapter } from "../types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ADAC_URL =
  "https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/rettungskarte/";

const SOURCE_NAME = "ADAC Rettungskarten-Index";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns true if the given href points to an external site (i.e. not an
 * adac.de page and not a relative link).
 */
function isExternalUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      !url.hostname.endsWith("adac.de")
    );
  } catch {
    // Not a valid absolute URL (relative link, mailto:, etc.)
    return false;
  }
}

/**
 * Basic sanity check for manufacturer names extracted from link text.
 */
function isReasonableName(name: string): boolean {
  const trimmed = name.trim();
  return trimmed.length >= 2 && trimmed.length <= 50;
}

// ---------------------------------------------------------------------------
// Adapter
// ---------------------------------------------------------------------------

const adapter: SourceAdapter = {
  name: SOURCE_NAME,

  async scrape(): Promise<ScrapedCard[]> {
    const response = await fetch(ADAC_URL);

    if (!response.ok) {
      throw new Error(
        `Failed to fetch ADAC index page: HTTP ${response.status}`,
      );
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const cards: ScrapedCard[] = [];
    const seen = new Set<string>();

    // NOTE: The selectors below target the main content area of the ADAC
    // rescue-card directory page. They may need adjustment after testing
    // against the live site, as the ADAC page structure can change over time.
    //
    // Strategy: look for <a> tags with external href attributes in the main
    // content. The ADAC page typically lists manufacturers as links pointing
    // to each manufacturer's own rescue-card portal.
    const contentSelectors = [
      "main a[href]",
      "article a[href]",
      ".content-container a[href]",
      '[role="main"] a[href]',
    ];

    // Try each selector; use the first one that yields results.
    let $links = $("___nonexistent___"); // empty selection

    for (const selector of contentSelectors) {
      const $candidate = $(selector);
      // Filter to only external links to see if this selector is useful
      const externalCount = $candidate.filter((_i, el) => {
        const href = $(el).attr("href") ?? "";
        return isExternalUrl(href);
      }).length;

      if (externalCount > 0) {
        $links = $candidate;
        break;
      }
    }

    // Fallback: if none of the content selectors matched, search all links on
    // the page. This is less precise but ensures we still capture data even if
    // the page structure changes.
    if ($links.length === 0) {
      $links = $("a[href]");
    }

    $links.each((_i, el) => {
      const href = $(el).attr("href") ?? "";

      if (!isExternalUrl(href)) {
        return; // skip internal / relative links
      }

      // Derive manufacturer name from the link text
      const name = $(el).text().trim();

      if (!isReasonableName(name)) {
        return;
      }

      // Deduplicate by manufacturer name (case-insensitive)
      const key = name.toLowerCase();
      if (seen.has(key)) {
        return;
      }
      seen.add(key);

      cards.push({
        manufacturer: name,
        model: "All Models",
        yearFrom: null,
        yearTo: null,
        pdfUrl: href,
        sourceUrl: ADAC_URL,
        sourceName: SOURCE_NAME,
      });
    });

    return cards;
  },
};

export default adapter;
