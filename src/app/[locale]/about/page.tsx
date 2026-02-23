import { useTranslations } from "next-intl";

export default function AboutPage() {
  const t = useTranslations("about");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <p className="mb-4">{t("intro")}</p>
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
        <p className="text-sm">{t("disclaimer")}</p>
      </div>
      <p className="mb-4">{t("openSource")}</p>
      <a
        href="#"
        target="_blank"
        rel="noopener noreferrer"
        className="text-red-600 hover:underline"
      >
        {t("blogLabel")} →
      </a>
    </div>
  );
}
