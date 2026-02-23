import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import LanguageSwitcher from "./LanguageSwitcher";

export default function Header() {
  const t = useTranslations("nav");

  return (
    <header className="border-b border-gray-200">
      <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
        <Link href="/" className="text-xl font-bold">
          Rescue Info
        </Link>
        <nav className="flex items-center gap-6">
          <Link href="/" className="text-sm hover:text-gray-600">
            {t("home")}
          </Link>
          <Link href="/safety" className="text-sm hover:text-gray-600">
            {t("safety")}
          </Link>
          <Link href="/about" className="text-sm hover:text-gray-600">
            {t("about")}
          </Link>
          <Link href="/support" className="text-sm hover:text-gray-600">
            {t("support")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  );
}
