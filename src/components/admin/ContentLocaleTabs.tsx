import { normalizeLocaleCode } from '../../lib/propertyContentLocales';

type LangOption = { code: string; label: string };

type Props = {
  enabledLocales: string[];
  primaryLocale: string;
  activeLocale: string;
  onChange: (locale: string) => void;
  languageOptions: LangOption[];
  className?: string;
};

export default function ContentLocaleTabs({
  enabledLocales,
  primaryLocale,
  activeLocale,
  onChange,
  languageOptions,
  className = '',
}: Props) {
  const primary = normalizeLocaleCode(primaryLocale);
  const codes = enabledLocales.map(normalizeLocaleCode).filter(Boolean);

  const labelFor = (code: string) => {
    const hit = languageOptions.find((o) => normalizeLocaleCode(o.code) === code);
    return hit?.label || code.toUpperCase();
  };

  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {codes.map((code) => {
        const isActive = normalizeLocaleCode(activeLocale) === code;
        const isPrimary = code === primary;
        return (
          <button
            key={code}
            type="button"
            onClick={() => onChange(code)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
              isActive
                ? 'bg-vailo-teal text-white border-vailo-teal'
                : 'bg-white text-gray-700 border-gray-200 hover:border-vailo-teal/40'
            }`}
          >
            {labelFor(code)}
            {isPrimary ? (
              <span className={`ml-1.5 text-[10px] uppercase tracking-wide ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                primary
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
