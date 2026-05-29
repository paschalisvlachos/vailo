import { useEffect, useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { Languages, Loader2, Save, Copy } from 'lucide-react';
import { migratePropertyContentFromPrimary } from '../../lib/contentLocaleMigration';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import {
  clampContentLocalesToPlatform,
  hasStaleContentLocales,
  normalizeLocaleCode,
  parsePropertyContentLocaleSettings,
} from '../../lib/propertyContentLocales';
import { AdminButton, AdminCard } from './AdminPageHeader';

type Props = {
  propertyId: string;
  propertyData: Record<string, unknown>;
};

export default function PropertyLanguagesCard({ propertyId, propertyData }: Props) {
  const toast = useToast();
  const { languages, loading: langsLoading } = usePlatformLanguages();
  const platformCodes = languages.map((l) => l.shortName);

  const stored = parsePropertyContentLocaleSettings(propertyData);
  const effective = clampContentLocalesToPlatform(stored, platformCodes);
  const staleLocales = hasStaleContentLocales(stored, platformCodes);
  const [primaryLocale, setPrimaryLocale] = useState(effective.primaryLocale);
  const [enabledLocales, setEnabledLocales] = useState<string[]>(effective.enabledLocales);
  const [reviewedLocales, setReviewedLocales] = useState<string[]>(effective.reviewedLocales);
  const [saving, setSaving] = useState(false);
  const [migrating, setMigrating] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const parsed = parsePropertyContentLocaleSettings(propertyData);
    const next = clampContentLocalesToPlatform(parsed, platformCodes);
    setPrimaryLocale(next.primaryLocale);
    setEnabledLocales(next.enabledLocales);
    setReviewedLocales(next.reviewedLocales);
    setDirty(false);
  }, [propertyData, propertyId, platformCodes.join('|')]);

  const toggleLocale = (code: string) => {
    const c = normalizeLocaleCode(code);
    if (!c) return;
    setDirty(true);
    setEnabledLocales((prev) => {
      if (prev.includes(c)) {
        if (c === primaryLocale) return prev;
        return prev.filter((x) => x !== c);
      }
      return [...prev, c];
    });
  };

  const handlePrimaryChange = (code: string) => {
    const c = normalizeLocaleCode(code);
    if (!c) return;
    setDirty(true);
    setPrimaryLocale(c);
    setEnabledLocales((prev) => (prev.includes(c) ? prev : [c, ...prev]));
  };

  const handleSave = async () => {
    const clamped = clampContentLocalesToPlatform(
      {
        primaryLocale: normalizeLocaleCode(primaryLocale) || 'en',
        enabledLocales: [...new Set(enabledLocales.map(normalizeLocaleCode).filter(Boolean))],
        reviewedLocales: reviewedLocales.map(normalizeLocaleCode).filter(Boolean),
      },
      platformCodes
    );
    const { primaryLocale: primary, enabledLocales: enabled, reviewedLocales: reviewed } = clamped;
    setSaving(true);
    try {
      await updateDoc(doc(db, 'properties', propertyId), {
        contentPrimaryLocale: primary,
        contentEnabledLocales: enabled,
        contentReviewedLocales: reviewed.filter((c) => c !== primary),
      });
      toast.success('Guest content languages saved.');
      setDirty(false);
    } catch (e) {
      console.error(e);
      toast.error('Could not save language settings.');
    } finally {
      setSaving(false);
    }
  };

  const toggleReviewed = (code: string) => {
    const c = normalizeLocaleCode(code);
    const primary = normalizeLocaleCode(primaryLocale);
    if (!c || c === primary) return;
    setDirty(true);
    setReviewedLocales((prev) =>
      prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
    );
  };

  const handleMigratePrimary = async () => {
    if (!window.confirm('Copy primary-language text into empty locale fields for all gems and features?')) return;
    setMigrating(true);
    try {
      const { gemsUpdated, featuresUpdated } = await migratePropertyContentFromPrimary(propertyId);
      toast.success(`Updated ${gemsUpdated} gems and ${featuresUpdated} features.`);
    } catch (e) {
      console.error(e);
      toast.error('Migration failed.');
    } finally {
      setMigrating(false);
    }
  };

  if (langsLoading) {
    return (
      <AdminCard className="p-4 sm:p-6 flex items-center justify-center gap-2 text-gray-500 text-sm min-h-[120px]">
        <Loader2 size={16} className="animate-spin" /> Loading languages…
      </AdminCard>
    );
  }

  return (
    <AdminCard className="p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 pb-5 sm:pb-6 border-b border-gray-100">
        <div className="min-w-0 pr-0 sm:pr-4">
          <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Languages size={20} className="text-vailo-teal shrink-0" />
            Guest content languages
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
            Choose which languages guests can read for gems, features, and house guide copy. Edit each language in
            content tabs; use auto-translate from your primary language, then review before publishing.
          </p>
        </div>
        <AdminButton
          type="button"
          onClick={handleSave}
          disabled={!dirty || saving}
          className="shrink-0 self-start"
        >
          {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
          Save
        </AdminButton>
      </div>

      {staleLocales && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3 mt-5 sm:mt-6">
          Some languages were removed from platform Settings and are no longer available here. Save to
          update this property&apos;s language list.
        </p>
      )}

      <div className="mt-5 sm:mt-6 space-y-5 sm:space-y-6">
        <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Primary language (source for AI translate)</label>
        <select
          value={primaryLocale}
          onChange={(e) => handlePrimaryChange(e.target.value)}
          className="w-full max-w-xs h-10 px-3 border border-gray-200 rounded-xl admin-input bg-white text-sm"
        >
          {languages.map((lang) => (
            <option key={lang.id} value={lang.shortName}>
              {lang.title} ({lang.shortName})
            </option>
          ))}
        </select>
        </div>

        <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Enabled for guests</label>
        <div className="flex flex-wrap gap-2">
          {languages.map((lang) => {
            const code = normalizeLocaleCode(lang.shortName);
            const on = enabledLocales.includes(code);
            return (
              <button
                key={lang.id}
                type="button"
                onClick={() => toggleLocale(code)}
                className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
                  on
                    ? 'bg-vailo-teal/10 border-vailo-teal text-vailo-dark'
                    : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                {lang.title}
                {code === normalizeLocaleCode(primaryLocale) ? ' · primary' : ''}
              </button>
            );
          })}
        </div>
        </div>

        <div className="pt-5 sm:pt-6 border-t border-gray-100">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Reviewed for guests (primary is always live)
        </label>
        <p className="text-xs text-gray-500 mb-3 leading-relaxed">
          Guests only see translations you mark reviewed. Unreviewed locales fall back to primary.
        </p>
        <div className="flex flex-wrap gap-2">
          {enabledLocales
            .filter((c) => normalizeLocaleCode(c) !== normalizeLocaleCode(primaryLocale))
            .map((code) => {
              const c = normalizeLocaleCode(code);
              const on = reviewedLocales.includes(c);
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleReviewed(c)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                    on ? 'bg-green-50 border-green-300 text-green-800' : 'bg-gray-50 border-gray-200 text-gray-500'
                  }`}
                >
                  {c.toUpperCase()} {on ? '✓ reviewed' : 'draft'}
                </button>
              );
            })}
        </div>
        </div>

        <div className="pt-4 border-t border-gray-100">
          <button
            type="button"
            onClick={handleMigratePrimary}
            disabled={migrating}
            className="text-xs text-vailo-teal hover:underline inline-flex items-center gap-1"
          >
            {migrating ? <Loader2 size={12} className="animate-spin" /> : <Copy size={12} />}
            Fill empty locales from primary (gems & features)
          </button>
        </div>
      </div>
    </AdminCard>
  );
}
