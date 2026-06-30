import { useMemo, useState } from 'react';
import { ArrowLeft, Bookmark } from 'lucide-react';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { guestUiTFormat } from '../../lib/guestLocaleUi';
import { useSavedLocalGems } from '../../hooks/useSavedLocalGems';
import LocalPickCard from './LocalPickCard';

type Props = {
  propertyId: string;
  typeId: string;
  mapAreaHint: string;
  propertyCoords?: { lat: number; lng: number } | null;
  onClose: () => void;
};

export default function GuestSavedLocalGems({
  propertyId,
  typeId,
  mapAreaHint,
  propertyCoords,
  onClose,
}: Props) {
  const { t, locale } = useGuestLocale();
  const { items, categories } = useSavedLocalGems(propertyId, typeId);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const filterOptions = useMemo(() => ['All', ...categories], [categories]);

  const filtered = useMemo(() => {
    if (categoryFilter === 'All') return items;
    return items.filter((item) => item.category === categoryFilter);
  }, [items, categoryFilter]);

  const grouped = useMemo(() => {
    if (categoryFilter !== 'All') {
      return [{ categoryName: categoryFilter, items: filtered }];
    }
    const map = new Map<string, typeof filtered>();
    for (const item of filtered) {
      const key = item.category || 'Saved';
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries()).map(([categoryName, categoryItems]) => ({
      categoryName,
      items: categoryItems,
    }));
  }, [filtered, categoryFilter]);

  return (
    <div className="guest-mobile fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-b from-vailo-teal to-vailo-teal-hover md:relative md:h-[800px] md:rounded-3xl md:shadow-[4px_0_48px_-8px_rgba(5,31,38,0.45)] md:border md:border-white/10">
      <div className="shrink-0 border-b border-white/10 px-4 py-3.5 flex items-center gap-3">
        <button
          type="button"
          onClick={onClose}
          className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl bg-white/10 border border-white/15 text-white hover:bg-white/15 transition-all"
          aria-label={t('close')}
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex-1 min-w-0">
          <p className="guest-eyebrow text-[10px] sm:text-xs text-white/45">{t('liveLikeLocal')}</p>
          <h2 className="font-luxury text-lg sm:text-xl leading-tight text-white font-medium mt-0.5">
            {t('savedLocalGemsTitle')}
          </h2>
        </div>
        <div className="h-9 w-9 rounded-xl bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/10 border border-vailo-gold/25 flex items-center justify-center shrink-0">
          <Bookmark size={16} className="text-vailo-gold" />
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-5 py-5 ai-expert-scroll">
        <p className="text-sm text-white/55 mb-4 leading-relaxed">{t('savedLocalGemsDeviceNote')}</p>

        {items.length === 0 ? (
          <div className="text-center py-14 rounded-2xl border border-white/10 bg-white/5 px-6">
            <Bookmark size={32} className="mx-auto text-vailo-gold/60 mb-3" />
            <p className="font-luxury text-lg text-white mb-2">{t('savedLocalGemsEmptyTitle')}</p>
            <p className="text-sm text-white/55 leading-relaxed">{t('savedLocalGemsEmptySub')}</p>
          </div>
        ) : (
          <>
            {filterOptions.length > 1 && (
              <div className="flex flex-wrap gap-1.5 pb-4">
                {filterOptions.map((filter) => {
                  const isActive = categoryFilter === filter;
                  return (
                    <button
                      type="button"
                      key={filter}
                      onClick={() => setCategoryFilter(filter)}
                      className={`guest-pill whitespace-nowrap transition-all ${
                        isActive
                          ? 'bg-vailo-gold text-[#051F26] shadow-md'
                          : 'bg-white/10 text-white/70 border border-white/15 hover:border-vailo-gold/40 hover:text-white'
                      }`}
                    >
                      {filter}
                    </button>
                  );
                })}
              </div>
            )}

            <p className="text-sm text-white/55 mb-5">
              {guestUiTFormat(locale, 'savedLocalGemsCount', { count: String(filtered.length) })}
            </p>

            {filtered.length === 0 ? (
              <p className="text-sm text-white/55 text-center py-8 rounded-xl border border-white/10 bg-white/5">
                {t('savedLocalGemsNoMatch')}
              </p>
            ) : (
              <div className="space-y-8 pb-8">
                {grouped.map(({ categoryName, items: categoryItems }) => (
                  <section key={categoryName}>
                    <div className="mb-3">
                      <h4 className="font-semibold text-white text-base tracking-tight">
                        {categoryName}
                      </h4>
                      <p className="text-sm text-white/55 mt-0.5">
                        {categoryItems.length} saved{' '}
                        {categoryItems.length === 1 ? 'pick' : 'picks'}
                      </p>
                    </div>
                    <div className="space-y-4">
                      {categoryItems.map((item) => (
                        <LocalPickCard
                          key={item.id}
                          item={item}
                          categoryName={item.category}
                          mapAreaHint={mapAreaHint}
                          propertyId={propertyId}
                          typeId={typeId}
                          viewMapLabel={t('aiExpertView')}
                          goMapLabel={t('aiExpertGo')}
                          mode="saved"
                          propertyCoords={propertyCoords}
                          className="w-full"
                        />
                      ))}
                    </div>
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
