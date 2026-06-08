import { useMemo, useState, type ReactNode } from 'react';
import {
  Key,
  ArrowRight,
  Zap,
  Lightbulb,
  Thermometer,
  Droplets,
  BedDouble,
  ChefHat,
  Flame,
  Waves,
  Wifi,
  WashingMachine,
  ScrollText,
  Trash2,
  ShieldAlert,
  Sparkles,
  Box,
  Wrench,
  MessageCircleQuestion,
  ShoppingBag,
  BookOpen,
  ChevronDown,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  HOUSE_GUIDE_CATEGORIES,
  houseGuideGuestCategoryTitle,
  type HouseGuideCategoryDef,
  type HouseGuideFieldDef,
} from '../../lib/houseGuideCategories';
import { listHouseGuideCategoriesWithContent } from '../../lib/houseGuideGuestContent';
import { getGuideTextValue } from '../../lib/houseGuideLocales';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import type { GuestLocaleKey } from '../../lib/guestLocale';
import { openExternalUrl } from '../../lib/geocoding';

const ICONS: Record<string, ReactNode> = {
  Key: <Key size={18} />,
  ArrowRight: <ArrowRight size={18} />,
  Zap: <Zap size={18} />,
  Lightbulb: <Lightbulb size={18} />,
  Thermometer: <Thermometer size={18} />,
  Droplets: <Droplets size={18} />,
  BedDouble: <BedDouble size={18} />,
  ChefHat: <ChefHat size={18} />,
  Flame: <Flame size={18} />,
  Waves: <Waves size={18} />,
  Wifi: <Wifi size={18} />,
  WashingMachine: <WashingMachine size={18} />,
  ScrollText: <ScrollText size={18} />,
  Trash2: <Trash2 size={18} />,
  ShieldAlert: <ShieldAlert size={18} />,
  Sparkles: <Sparkles size={18} />,
  Box: <Box size={18} />,
  Wrench: <Wrench size={18} />,
  MessageCircleQuestion: <MessageCircleQuestion size={18} />,
  ShoppingBag: <ShoppingBag size={18} />,
};

type Props = {
  open: boolean;
  onClose: () => void;
  guide: Record<string, unknown> | null | undefined;
  propertyLabel?: string;
  t: (key: GuestLocaleKey) => string;
};

function FieldBlock({
  guide,
  field,
  locale,
  primaryLocale,
}: {
  guide: Record<string, unknown>;
  field: HouseGuideFieldDef;
  locale: string;
  primaryLocale: string;
}) {
  if (field.type === 'textarea') {
    const text = getGuideTextValue(guide, field.id, locale, primaryLocale).trim();
    if (!text) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{field.label}</p>
        <p className="text-base text-gray-700 whitespace-pre-wrap leading-relaxed">{text}</p>
      </div>
    );
  }

  const rows = guide[field.id];
  if (!Array.isArray(rows) || rows.length === 0) return null;

  if (field.type === 'array_faqs') {
    return (
      <div className="space-y-3">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{field.label}</p>
        <ul className="space-y-3">
          {rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            const q = String(r.question || '').trim();
            const a = String(r.answer || '').trim();
            if (!q && !a) return null;
            return (
              <li key={i} className="rounded-xl bg-[#F8FAFA] border border-gray-100 px-3.5 py-3">
                {q && <p className="font-semibold text-[#0B4F5C] text-sm">{q}</p>}
                {a && <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap leading-relaxed">{a}</p>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (field.type === 'array_devices') {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{field.label}</p>
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-100 overflow-hidden">
          {rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            const parts = [
              r.room,
              r.device,
              [r.brand, r.model].filter(Boolean).join(' '),
            ]
              .map((p) => String(p || '').trim())
              .filter(Boolean);
            if (parts.length === 0) return null;
            return (
              <li key={i} className="px-3.5 py-2.5 bg-white text-sm text-gray-700">
                {parts.join(' · ')}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  if (field.type === 'array_maps' || field.type === 'array_emergencies') {
    return (
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-400">{field.label}</p>
        <ul className="space-y-2">
          {rows.map((row, i) => {
            const r = row as Record<string, unknown>;
            const title = String(r.title || r.category || '').trim();
            const link = String(r.mapsLink || '').trim();
            const phone = String(r.phone || '').trim();
            if (!title && !link && !phone) return null;
            return (
              <li
                key={i}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[#F8FAFA] border border-gray-100 px-3.5 py-2.5"
              >
                <div className="min-w-0">
                  {title && <p className="text-sm font-semibold text-gray-900">{title}</p>}
                  {phone && (
                    <a href={`tel:${phone.replace(/\s/g, '')}`} className="text-sm text-[#0B4F5C] font-medium">
                      {phone}
                    </a>
                  )}
                </div>
                {link && (
                  <button
                    type="button"
                    onClick={() => openExternalUrl(link)}
                    className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-[#C5A059] shrink-0"
                  >
                    Map <ExternalLink size={12} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return null;
}

function CategorySection({
  category,
  guide,
  locale,
  primaryLocale,
  expanded,
  onToggle,
}: {
  category: HouseGuideCategoryDef;
  guide: Record<string, unknown>;
  locale: string;
  primaryLocale: string;
  expanded: boolean;
  onToggle: () => void;
}) {
  const icon = ICONS[category.iconName] || <BookOpen size={18} />;
  const title = houseGuideGuestCategoryTitle(category.title);

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center p-4 min-h-[52px] text-left hover:bg-[#0B4F5C]/[0.02] transition-colors group"
        aria-expanded={expanded}
      >
        <div className="h-10 w-10 rounded-xl bg-[#F8FAFA] border border-gray-100 flex items-center justify-center mr-3 shrink-0 text-[#0B4F5C]">
          {icon}
        </div>
        <span
          className={`flex-1 font-luxury text-base pr-2 transition-colors ${
            expanded ? 'text-[#0B4F5C] font-medium' : 'text-gray-800'
          }`}
        >
          {title}
        </span>
        <div
          className={`p-1.5 rounded-full transition-all shrink-0 ${
            expanded ? 'bg-[#0B4F5C] text-white rotate-180' : 'text-gray-300'
          }`}
        >
          <ChevronDown size={16} />
        </div>
      </button>
      <div
        className={`transition-all duration-300 ease-in-out overflow-hidden ${
          expanded ? 'max-h-[4000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 pb-5 pt-0 space-y-4">
          {category.fields.map((field) => (
            <FieldBlock
              key={field.id}
              guide={guide}
              field={field}
              locale={locale}
              primaryLocale={primaryLocale}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function GuestHouseGuideSheet({ open, onClose, guide, propertyLabel, t }: Props) {
  const { locale, contentPrimaryLocale } = useGuestLocale();
  const [openCategoryId, setOpenCategoryId] = useState<string | null>(null);

  const categoriesWithContent = useMemo(
    () =>
      listHouseGuideCategoriesWithContent(
        guide,
        HOUSE_GUIDE_CATEGORIES,
        locale,
        contentPrimaryLocale
      ),
    [guide, locale, contentPrimaryLocale]
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-[#051F26]/60 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="house-guide-sheet-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-lg max-h-[min(92vh,720px)] rounded-t-3xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-3 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="px-5 pt-2 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="guest-eyebrow mb-1">{propertyLabel || t('houseGuide')}</p>
              <h2 id="house-guide-sheet-title" className="font-luxury text-xl text-[#051F26] font-medium">
                {t('houseGuide')}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{t('houseGuideSheetSub')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
              aria-label={t('close')}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain">
          {categoriesWithContent.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-12 px-6">{t('houseGuideEmpty')}</p>
          ) : (
            <div className="divide-y divide-gray-50">
              {categoriesWithContent.map((category) => (
                <CategorySection
                  key={category.id}
                  category={category}
                  guide={guide!}
                  locale={locale}
                  primaryLocale={contentPrimaryLocale}
                  expanded={openCategoryId === category.id}
                  onToggle={() =>
                    setOpenCategoryId((prev) => (prev === category.id ? null : category.id))
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
