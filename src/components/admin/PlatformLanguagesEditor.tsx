import { useEffect, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { Loader2, Plus, Save, Trash2 } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import {
  createLanguageId,
  normalizeShortName,
  type PlatformLanguage,
} from '../../lib/platformLanguages';
import { AdminButton, AdminCard } from './AdminPageHeader';

function cloneLanguages(list: PlatformLanguage[]): PlatformLanguage[] {
  return list.map((l) => ({ ...l }));
}

export default function PlatformLanguagesEditor() {
  const toast = useToast();
  const { languages: remoteLanguages, loading, error } = usePlatformLanguages();
  const [languages, setLanguages] = useState<PlatformLanguage[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading || dirty) return;
    setLanguages(cloneLanguages(remoteLanguages));
  }, [loading, remoteLanguages, dirty]);

  const addLanguage = () => {
    setLanguages((prev) => [
      ...prev,
      { id: createLanguageId(), title: '', shortName: '' },
    ]);
    setDirty(true);
  };

  const updateLanguage = (id: string, patch: Partial<PlatformLanguage>) => {
    setLanguages((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
    setDirty(true);
  };

  const removeLanguage = (id: string) => {
    if (languages.length <= 1) {
      toast.warning('Keep at least one language.');
      return;
    }
    if (!window.confirm('Remove this language?')) return;
    setLanguages((prev) => prev.filter((l) => l.id !== id));
    setDirty(true);
  };

  const handleSave = async () => {
    const normalized = languages.map((l) => ({
      id: l.id,
      title: l.title.trim(),
      shortName: normalizeShortName(l.shortName),
    }));

    if (normalized.some((l) => !l.title || !l.shortName)) {
      toast.warning('Every language needs a title and short name (e.g. English, en).');
      return;
    }

    const codes = normalized.map((l) => l.shortName);
    if (new Set(codes).size !== codes.length) {
      toast.warning('Short names must be unique.');
      return;
    }

    setSaving(true);
    try {
      await setDoc(
        doc(db, 'platformSettings', 'settings'),
        { languages: normalized, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setDirty(false);
      toast.success('Languages saved. Guest portal picker will update.');
    } catch (err) {
      console.error('save languages:', err);
      toast.error('Could not save languages.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AdminCard className="p-6">
      {error && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 mb-4">
          {error}
        </p>
      )}

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-500">
          <Loader2 size={20} className="animate-spin text-vailo-teal" />
          Loading…
        </div>
      ) : (
        <ul className="space-y-3">
          {languages.map((lang) => (
            <li
              key={lang.id}
              className="flex flex-col sm:flex-row gap-3 p-4 rounded-xl border border-gray-100 bg-vailo-surface-elevated/40"
            >
              <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Title
                  </label>
                  <input
                    type="text"
                    value={lang.title}
                    onChange={(e) => updateLanguage(lang.id, { title: e.target.value })}
                    placeholder="English"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                    Short name
                  </label>
                  <input
                    type="text"
                    value={lang.shortName}
                    onChange={(e) =>
                      updateLanguage(lang.id, { shortName: normalizeShortName(e.target.value) })
                    }
                    placeholder="en"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm font-mono outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal"
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={() => removeLanguage(lang.id)}
                className="self-end sm:self-center p-2 text-red-600 hover:bg-red-50 rounded-lg border border-red-100"
                title="Delete language"
              >
                <Trash2 size={18} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={addLanguage}
        className="mt-4 flex items-center text-sm font-semibold text-vailo-teal hover:text-vailo-dark"
      >
        <Plus size={16} className="mr-1.5" />
        Add language
      </button>

      <div className="flex justify-end mt-6 pt-6 border-t border-gray-100">
        <AdminButton onClick={handleSave} disabled={saving || loading || !dirty}>
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          Save languages
        </AdminButton>
      </div>
    </AdminCard>
  );
}
