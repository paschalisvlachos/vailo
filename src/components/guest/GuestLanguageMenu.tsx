import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Languages } from 'lucide-react';
import { FALLBACK_GUEST_LOCALES, type GuestLocale } from '../../lib/guestLocale';

type LocaleOption = { code: string; label: string; nativeLabel: string };

type Props = {
  locale: GuestLocale;
  onChange: (locale: GuestLocale) => void;
  options?: LocaleOption[];
  /** `hero` = on dark photo header; `surface` = on light panels (e.g. AI Concierge). */
  variant?: 'hero' | 'surface';
};

export default function GuestLanguageMenu({
  locale,
  onChange,
  options,
  variant = 'hero',
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const list = options !== undefined ? options : FALLBACK_GUEST_LOCALES;

  if (list.length <= 1) return null;

  const current = list.find((l) => l.code === locale) ?? list[0];

  const triggerClass =
    variant === 'surface'
      ? 'flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-full bg-[#0B4F5C]/8 border border-[#0B4F5C]/15 text-[#0B4F5C] text-xs font-semibold uppercase tracking-wider hover:bg-[#0B4F5C]/12 transition-all'
      : 'flex items-center gap-1.5 px-3.5 py-2.5 min-h-[44px] rounded-full bg-white/12 backdrop-blur-md border border-white/25 text-white text-xs font-semibold uppercase tracking-wider hover:bg-white/20 transition-all';

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className={`relative shrink-0 ${open ? 'z-[80]' : 'z-20'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={triggerClass}
        aria-expanded={open}
        aria-haspopup="listbox"
        aria-label="Language"
      >
        <Languages size={13} className="text-[#C5A059] shrink-0" />
        <span>{current.nativeLabel}</span>
        <ChevronDown size={12} className={`opacity-70 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <ul
          role="listbox"
          className="absolute right-0 top-full mt-2 min-w-[168px] py-1.5 rounded-xl bg-white border border-[#0B4F5C]/12 shadow-[0_16px_48px_rgba(5,31,38,0.22)] z-[90] overflow-hidden animate-in fade-in slide-in-from-top-1 duration-150"
        >
          {list.map((item) => (
            <li key={item.code} role="option" aria-selected={item.code === locale}>
              <button
                type="button"
                onClick={() => {
                  onChange(item.code);
                  setOpen(false);
                }}
                className={`w-full text-left px-3.5 py-3 min-h-[44px] text-sm font-semibold transition-colors flex items-center justify-between gap-2 ${
                  item.code === locale
                    ? 'bg-[#0B4F5C]/8 text-[#0B4F5C]'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span>{item.label}</span>
                <span className="text-[#C5A059] tabular-nums">{item.nativeLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
