import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Save, Sparkles, Search } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import { translateContentFields } from '../../lib/adminContentTranslate';
import {
  GUEST_UI_STRING_CATALOG,
  GUEST_UI_STRING_GROUPS,
  type GuestUiStringGroup,
} from '../../lib/guestUiStringCatalog';
import { mergeGuestStringsForLocale } from '../../lib/platformGuestUiStrings';
import { PLATFORM_SETTINGS_DOC } from '../../lib/platformLanguages';
import { normalizeLocaleCode } from '../../lib/propertyContentLocales';
import { AdminButton, AdminCard } from './AdminPageHeader';

const TRANSLATE_BATCH = 28;

function stringsMatch(
  a: Record<string, string>,
  b: Record<string, string>
): boolean {
  return GUEST_UI_STRING_CATALOG.every(
    (entry) => (a[entry.key] ?? '').trim() === (b[entry.key] ?? '').trim()
  );
}

export default function PlatformGuestUiStringsEditor() {
  const toast = useToast();
  const { languages, guestUiStrings, loading } = usePlatformLanguages();
  const primaryCode = normalizeLocaleCode(languages[0]?.shortName) || 'en';

  const [selectedLocale, setSelectedLocale] = useState(primaryCode);
  const [values, setValues] = useState<Record<string, string>>({});
  /** Last loaded / saved snapshot for the active locale — edits are compared to this. */
  const [baseline, setBaseline] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [search, setSearch] = useState('');
  const [groupFilter, setGroupFilter] = useState<GuestUiStringGroup | 'all'>('all');

  const guestUiStringsRef = useRef(guestUiStrings);
  const valuesRef = useRef(values);
  const baselineRef = useRef(baseline);
  guestUiStringsRef.current = guestUiStrings;
  valuesRef.current = values;
  baselineRef.current = baseline;

  const loadLocale = useCallback((code: string) => {
    const normalized = normalizeLocaleCode(code);
    if (!normalized) return;
    const merged = mergeGuestStringsForLocale(normalized, guestUiStringsRef.current);
    setSelectedLocale(normalized);
    setValues(merged);
    setBaseline(merged);
  }, []);

  useEffect(() => {
    if (languages.length === 0) return;
    const codes = languages.map((l) => normalizeLocaleCode(l.shortName)).filter(Boolean);
    if (!codes.includes(selectedLocale)) {
      loadLocale(codes[0] || 'en');
    }
  }, [languages, selectedLocale, loadLocale]);

  // Initial load + remote updates (e.g. auto-fill): refresh form only if user has not edited.
  useEffect(() => {
    if (loading || !selectedLocale) return;
    const merged = mergeGuestStringsForLocale(selectedLocale, guestUiStrings);
    if (!stringsMatch(valuesRef.current, baselineRef.current)) return;
    setValues(merged);
    setBaseline(merged);
  }, [loading, guestUiStrings, selectedLocale]);

  const hasUnsavedChanges = useMemo(
    () => !stringsMatch(values, baseline),
    [values, baseline]
  );

  const filteredCatalog = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GUEST_UI_STRING_CATALOG.filter((entry) => {
      if (groupFilter !== 'all' && entry.group !== groupFilter) return false;
      if (!q) return true;
      return (
        entry.key.toLowerCase().includes(q) ||
        entry.label.toLowerCase().includes(q) ||
        (values[entry.key] || '').toLowerCase().includes(q)
      );
    });
  }, [search, groupFilter, values]);

  const handleSave = async () => {
    if (!selectedLocale) return;
    setSaving(true);
    try {
      const code = normalizeLocaleCode(selectedLocale);
      const trimmed: Record<string, string> = {};
      for (const entry of GUEST_UI_STRING_CATALOG) {
        const v = (values[entry.key] || '').trim();
        if (v) trimmed[entry.key] = v;
      }
      await setDoc(
        doc(db, 'platformSettings', 'settings'),
        {
          guestUiStrings: { ...guestUiStrings, [code]: trimmed },
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setBaseline({ ...values });
      toast.success(`Guest UI text saved for ${code.toUpperCase()}.`);
    } catch (err) {
      console.error(err);
      toast.error('Could not save guest UI strings.');
    } finally {
      setSaving(false);
    }
  };

  const handleAutoTranslate = async () => {
    const target = normalizeLocaleCode(selectedLocale);
    if (!target || target === primaryCode) {
      toast.warning('Select a non-primary language to auto-translate.');
      return;
    }
    const sourceValues = mergeGuestStringsForLocale(primaryCode, guestUiStrings);
    const keys = GUEST_UI_STRING_CATALOG.map((e) => e.key);
    setTranslating(true);
    try {
      const next = { ...values };
      for (let i = 0; i < keys.length; i += TRANSLATE_BATCH) {
        const batchKeys = keys.slice(i, i + TRANSLATE_BATCH);
        const batchFields: Record<string, string> = {};
        for (const key of batchKeys) {
          const src = sourceValues[key]?.trim();
          if (src) batchFields[key] = src;
        }
        if (Object.keys(batchFields).length === 0) continue;
        const translated = await translateContentFields(batchFields, primaryCode, target);
        Object.assign(next, translated);
      }
      setValues(next);
      toast.success(`Draft translation added for ${target.toUpperCase()}. Review and save.`);
    } catch {
      toast.error('Auto-translate failed.');
    } finally {
      setTranslating(false);
    }
  };

  if (loading) {
    return (
      <AdminCard className="p-6 sm:p-8 flex items-center justify-center gap-2 text-sm text-gray-500 min-h-[200px]">
        <Loader2 size={18} className="animate-spin text-vailo-teal" /> Loading guest UI strings…
      </AdminCard>
    );
  }

  if (languages.length === 0) {
    return (
      <AdminCard className="p-6 sm:p-8 text-sm text-gray-500 text-center min-h-[160px] flex items-center justify-center">
        Add at least one language on the Languages tab before editing guest UI text.
      </AdminCard>
    );
  }

  const controlClass =
    'h-10 px-3 border border-gray-200 rounded-xl admin-input bg-white text-sm focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal';

  return (
    <AdminCard className="p-4 sm:p-6 lg:p-8">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 sm:gap-6 pb-5 sm:pb-6 border-b border-gray-100">
        <div className="min-w-0 pr-0 lg:pr-4">
          <h3 className="text-lg font-bold text-gray-900">Guest portal UI text</h3>
          <p className="text-sm text-gray-500 mt-2 max-w-2xl leading-relaxed">
            Labels and messages guests see in the portal (not property gems or house guide). Stored in{' '}
            <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded-md font-mono">
              {PLATFORM_SETTINGS_DOC}
            </code>
            . Defaults are filled in automatically when something is missing; use Save after you edit.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0 lg:pt-0.5">
          <AdminButton type="button" onClick={handleSave} disabled={!hasUnsavedChanges || saving}>
            {saving ? <Loader2 size={16} className="animate-spin mr-2" /> : <Save size={16} className="mr-2" />}
            Save
          </AdminButton>
        </div>
      </div>

      <div className="mt-5 sm:mt-6 rounded-xl border border-vailo-teal/10 bg-vailo-teal/[0.03] p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <label className="sr-only" htmlFor="guest-ui-locale">
            Language
          </label>
          <select
            id="guest-ui-locale"
            value={selectedLocale}
            onChange={(e) => loadLocale(e.target.value)}
            className={`${controlClass} w-full sm:w-auto sm:min-w-[200px]`}
          >
            {languages.map((lang) => (
              <option key={lang.id} value={lang.shortName}>
                {lang.title} ({lang.shortName})
                {normalizeLocaleCode(lang.shortName) === primaryCode ? ' · primary' : ''}
              </option>
            ))}
          </select>
          {selectedLocale !== primaryCode && (
            <button
              type="button"
              onClick={handleAutoTranslate}
              disabled={translating}
              className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium text-vailo-teal border border-vailo-teal/25 rounded-xl bg-white hover:bg-vailo-teal/5 disabled:opacity-50 transition-colors"
            >
              {translating ? (
                <Loader2 size={16} className="mr-2 animate-spin" />
              ) : (
                <Sparkles size={16} className="mr-2 shrink-0" />
              )}
              Auto-translate from {primaryCode.toUpperCase()}
            </button>
          )}
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" size={16} />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search keys or text…"
              className={`${controlClass} w-full pl-10 pr-4`}
            />
          </div>
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as GuestUiStringGroup | 'all')}
            className={`${controlClass} w-full sm:w-48 shrink-0`}
          >
            <option value="all">All sections</option>
            {GUEST_UI_STRING_GROUPS.map((g) => (
              <option key={g.id} value={g.id}>
                {g.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 mt-4 sm:mt-5 px-0.5">
        <p className="text-xs text-gray-500">
          {filteredCatalog.length} of {GUEST_UI_STRING_CATALOG.length} strings
          {hasUnsavedChanges ? (
            <span className="ml-2 text-amber-700 font-medium">· Unsaved changes</span>
          ) : null}
        </p>
      </div>

      <div className="mt-3 max-h-[min(70vh,640px)] overflow-y-auto rounded-xl border border-gray-200/80 bg-gray-50/40 divide-y divide-gray-100">
        {filteredCatalog.length === 0 ? (
          <p className="px-5 py-10 text-sm text-gray-500 text-center">No strings match your search.</p>
        ) : (
          filteredCatalog.map((entry) => (
            <div
              key={entry.key}
              className="px-4 sm:px-5 py-4 sm:py-5 bg-white first:rounded-t-xl last:rounded-b-xl hover:bg-vailo-surface-elevated/30 transition-colors"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-2">
                <label
                  htmlFor={`guest-ui-${entry.key}`}
                  className="text-[11px] font-mono text-gray-400 tracking-wide"
                >
                  {entry.key}
                </label>
                <span className="text-xs text-gray-500">· {entry.label}</span>
              </div>
              <textarea
                id={`guest-ui-${entry.key}`}
                rows={entry.key.includes('Body') || entry.key.includes('Sub') ? 3 : 2}
                value={values[entry.key] || ''}
                onChange={(e) => {
                  setValues((prev) => ({ ...prev, [entry.key]: e.target.value }));
                }}
                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm admin-input resize-y min-h-[42px] bg-white focus:ring-2 focus:ring-vailo-teal/15 focus:border-vailo-teal/40"
              />
            </div>
          ))
        )}
      </div>
    </AdminCard>
  );
}
