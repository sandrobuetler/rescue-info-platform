import { searchRescueCards } from "@/lib/queries";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

type Props = {
  searchParams: Promise<{ make?: string; model?: string; year?: string }>;
};

export default async function SearchPage({ searchParams }: Props) {
  const params = await searchParams;
  const t = await getTranslations("search");

  const results = searchRescueCards({
    make: params.make,
    model: params.model,
    year: params.year ? Number(params.year) : undefined,
  });

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">
        {params.make} {params.model} {params.year}
      </h1>

      {results.length === 0 ? (
        <p className="text-gray-500">{t("noResults")}</p>
      ) : (
        <div className="space-y-4">
          {results.map((card) => (
            <div
              key={card.id}
              className="border border-gray-200 rounded-lg p-4 hover:border-gray-400"
            >
              <Link
                href={`/vehicle/${encodeURIComponent(card.manufacturer_name.toLowerCase())}/${encodeURIComponent(card.model_name.toLowerCase())}/${card.year_from ?? "all"}`}
                className="block"
              >
                <h2 className="text-lg font-semibold">
                  {card.manufacturer_name} {card.model_name}
                </h2>
                <p className="text-sm text-gray-500">
                  {card.year_from}–{card.year_to} · {card.source_name}
                </p>
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
