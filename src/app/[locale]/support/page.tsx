import { useTranslations } from "next-intl";

export default function SupportPage() {
  const t = useTranslations("support");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-6">{t("intro")}</p>
      <div className="space-y-4">
        <a href="#" className="block p-4 border border-gray-200 rounded-lg hover:border-gray-400">
          {t("githubSponsors")} →
        </a>
        <a href="#" className="block p-4 border border-gray-200 rounded-lg hover:border-gray-400">
          {t("openCollective")} →
        </a>
      </div>
    </div>
  );
}
