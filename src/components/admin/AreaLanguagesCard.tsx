import { useEffect, useState } from 'react';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { Languages, Loader2, Save } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import {
  AREA_CONTENT_PRIMARY_LOCALE,
  hasStaleContentLocales,
  normalizeLocaleCode,
  parseAreaContentLocaleSettings,
  resolveAreaContentLocaleSettings,
} from '../../lib/propertyContentLocales';
import { AdminButton, AdminCard } from './AdminPageHeader';

type Props = {
  country: string;
  areaId: string;
  areaName: string;
};

export default function AreaLanguagesCard({ country, areaId, areaName }: Props) {
  const toast = useToast();
  const { languages, loading: langsLoading } = usePlatformLanguages();
  const platformCodes = languages.map((l) => l.shortName);

  const [enabledLocales, setEnabledLocales] = useState<string[]>([AREA_CONTENT_PRIMARY_LOCALE]);
  const [staleLocales, setStaleLocales] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!country || !areaId) return;
    const unsub = onSnapshot(doc(db, 'countries', country, 'areas', areaId), (snap) => {
      const stored = parseAreaContentLocaleSettings(
        snap.exists() ? (snap.data() as Record<string, unknown>) : undefined
      );
      const settings = resolveAreaContentLocaleSettings(stored, platformCodes);
      setStaleLocales(hasStaleContentLocales(stored, platformCodes));
      setEnabledLocales(settings.enabledLocales);
      setDirty(false);
    });
    return () => unsub();
  }, [country, areaId, platformCodes.join('|')]);

  const toggleLocale = (code: string) => {
    const c = normalizeLocaleCode(code);
    if (!c) return;
    setDirty(true);
    setEnabledLocales((prev) => {
      if (prev.includes(c)) {
        if (c === AREA_CONTENT_PRIMARY_LOCALE) return prev;
        return prev.filter((x) => x !== c);
      }
      return [...prev, c];
    });
  };

  const handleSave = async () => {
    const resolved = resolveAreaContentLocaleSettings(
      {
        primaryLocale: AREA_CONTENT_PRIMARY_LOCALE,
        enabledLocales: [...new Set(enabledLocales.map(normalizeLocaleCode).filter(Boolean))],
        reviewedLocales: [],
      },
      platformCodes
    );
    const settings = {
      contentPrimaryLocale: resolved.primaryLocale,
      contentEnabledLocales: resolved.enabledLocales,
    };
    setSaving(true);
    try {
      await updateDoc(doc(db, 'countries', country, 'areas', areaId), settings);
      toast.success(`Languages saved for ${areaName}.`);
      setDirty(false);
    } catch (e) {
      console.error(e);
      toast.error('Could not save area languages.');
    } finally {
      setSaving(false);
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
            Area content languages — {areaName}
          </h3>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
            Applies to area Local Gems, features, and category names. Properties can override on Overview.
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
          Some languages were removed from platform Settings. Save to update this area&apos;s language
          list.
        </p>
      )}

      <div className="mt-5 sm:mt-6 space-y-5 sm:space-y-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Primary language</label>
          <p className="text-sm text-gray-800 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 max-w-xs">
            English ({AREA_CONTENT_PRIMARY_LOCALE})
          </p>
          <p className="text-xs text-gray-500 mt-2 max-w-xl leading-relaxed">
            Area gems, features, and categories are authored in English. Enable other languages below for
            translations.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">Enabled for area content</label>
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => {
              const code = normalizeLocaleCode(lang.shortName);
              const on = enabledLocales.includes(code);
              const isPrimary = code === AREA_CONTENT_PRIMARY_LOCALE;
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
                  {isPrimary ? ' · primary' : ''}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </AdminCard>
  );
}
