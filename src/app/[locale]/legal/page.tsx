import { useTranslations } from "next-intl";

export default function LegalPage() {
  const t = useTranslations("legal");

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-3xl font-bold mb-6">{t("title")}</h1>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("impressumTitle")}</h2>
        <p>{t("impressumContent")}</p>
      </section>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("privacyTitle")}</h2>
        <p>{t("privacyContent")}</p>
      </section>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("licenseTitle")}</h2>
        <p>{t("licenseContent")}</p>
      </section>
      <section className="mb-8">
        <h2 className="text-xl font-semibold mb-2">{t("disclaimerTitle")}</h2>
        <p>{t("disclaimerContent")}</p>
      </section>
    </div>
  );
}
