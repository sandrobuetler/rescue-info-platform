import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function Footer() {
  const t = useTranslations("footer");

  return (
    <footer className="border-t border-gray-200 mt-auto">
      <div className="max-w-5xl mx-auto px-4 py-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-gray-500">{t("disclaimer")}</p>
          <div className="flex gap-4 text-sm">
            <Link href="/legal" className="text-gray-500 hover:text-gray-700">
              Legal
            </Link>
            <a
              href="#"
              className="text-gray-500 hover:text-gray-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("blog")}
            </a>
            <a
              href="https://github.com"
              className="text-gray-500 hover:text-gray-700"
              target="_blank"
              rel="noopener noreferrer"
            >
              {t("sourceCode")}
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
