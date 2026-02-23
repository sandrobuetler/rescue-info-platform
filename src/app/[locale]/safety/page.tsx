import { useTranslations } from "next-intl";

const safetyLinks = [
  { name: "TCS (Touring Club Schweiz)", url: "https://www.tcs.ch" },
  { name: "BFU (Beratungsstelle für Unfallverhütung)", url: "https://www.bfu.ch" },
  { name: "REGA (Schweizerische Rettungsflugwacht)", url: "https://www.rega.ch" },
  { name: "ADAC Rettungskarten", url: "https://www.adac.de/rund-ums-fahrzeug/unfall-schaden-panne/rettungskarte/" },
  { name: "Euro NCAP Rescue Sheets", url: "https://www.euroncap.com/en/vehicle-safety/rescue-sheets/" },
];

export default function SafetyPage() {
  const t = useTranslations("safety");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-8">{t("intro")}</p>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-3">{t("emergencyNumbers")}</h2>
        <p className="text-lg">{t("emergencyNumbersList")}</p>
      </section>
      <section>
        <h2 className="text-xl font-semibold mb-3">{t("usefulLinks")}</h2>
        <div className="space-y-3">
          {safetyLinks.map((link) => (
            <a
              key={link.url}
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block p-3 border border-gray-200 rounded-lg hover:border-gray-400"
            >
              <span className="font-medium">{link.name}</span>
              <span className="block text-sm text-gray-500">
                {t("sourceLabel")}: {link.url}
              </span>
            </a>
          ))}
        </div>
      </section>
    </div>
  );
}
