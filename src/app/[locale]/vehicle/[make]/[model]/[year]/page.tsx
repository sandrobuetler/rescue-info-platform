import { getRescueCard } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";

type Props = {
  params: Promise<{ make: string; model: string; year: string }>;
};

export default async function VehicleDetailPage({ params }: Props) {
  const { make, model, year } = await params;
  const t = await getTranslations();

  const card = getRescueCard(
    decodeURIComponent(make),
    decodeURIComponent(model),
    year === "all" ? 0 : Number(year)
  );

  if (!card) {
    notFound();
  }

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-2">
        {card.manufacturer_name} {card.model_name}
      </h1>
      <p className="text-gray-500 mb-6">
        {card.year_from}–{card.year_to}
      </p>

      <div className="bg-gray-50 rounded-lg p-6 mb-6">
        {card.pdf_path ? (
          <a
            href={`/api/pdfs/${card.pdf_path}`}
            download
            className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
          >
            Download Rescue Card (PDF)
          </a>
        ) : (
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-6 py-3 bg-red-600 text-white rounded-lg font-semibold hover:bg-red-700"
          >
            View Rescue Card (External)
          </a>
        )}
      </div>

      <div className="text-sm text-gray-500 border-t pt-4">
        <p>
          Source:{" "}
          <a
            href={card.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-gray-700"
          >
            {card.source_name}
          </a>
        </p>
        <p>Last updated: {card.last_updated}</p>
        <p className="mt-2 italic">
          This platform is not affiliated with {card.manufacturer_name}. Rescue
          cards are sourced from publicly available resources. Always verify with
          the official manufacturer.
        </p>
      </div>
    </div>
  );
}
