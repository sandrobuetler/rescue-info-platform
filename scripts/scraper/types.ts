export interface ScrapedCard {
  manufacturer: string;
  model: string;
  yearFrom: number | null;
  yearTo: number | null;
  pdfUrl: string;
  sourceUrl: string;
  sourceName: string;
}

export interface SourceAdapter {
  name: string;
  scrape(): Promise<ScrapedCard[]>;
}
