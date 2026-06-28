import { Globe } from "lucide-react";
import { useTranslation } from "../lib/i18n/context";

export default function LanguageSwitcher() {
  const { lang, setLang, languages, t } = useTranslation();

  return (
    <div className="lang-switcher">
      <Globe size={18} className="lang-icon" aria-hidden />
      <label className="sr-only" htmlFor="lang-select">{t("common.language")}</label>
      <select
        id="lang-select"
        className="lang-select"
        value={lang}
        onChange={(e) => setLang(e.target.value)}
        aria-label={t("common.language")}
      >
        {languages.map((l) => (
          <option key={l.code} value={l.code}>
            {l.native}
          </option>
        ))}
      </select>
    </div>
  );
}
