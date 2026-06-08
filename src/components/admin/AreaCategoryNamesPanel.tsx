import { useEffect, useMemo, useState } from 'react';
import { collection, addDoc, deleteDoc, doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { EyeOff, Eye, Languages, Loader2, Plus, Sparkles, Tag, Trash2, Pencil, Check, X } from 'lucide-react';
import { isExcludedFromLiveLikeLocal } from '../../lib/liveLikeLocalCategories';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLanguages } from '../../hooks/usePlatformLanguages';
import { useAreaContentLocaleSettings } from '../../hooks/useAreaContentLocaleSettings';
import { useContentLocaleEditor } from '../../hooks/useContentLocaleEditor';
import { translateContentFields } from '../../lib/adminContentTranslate';
import { categoryPrimaryName, resolveCategoryLabel } from '../../lib/categoryLocale';
import { normalizeLocaleCode } from '../../lib/propertyContentLocales';
import ContentLocaleTabs from './ContentLocaleTabs';
import { AdminTextarea } from './AdminPageHeader';
import { readLiveLikeLocalCategoryKnowledge } from '../../lib/liveLikeLocalCategories';

type Props = {
  country: string;
  areaId: string;
  areaName: string;
  collectionName: 'localGemsCategories' | 'featuresCategories';
  title: string;
  onRename: (
    country: string,
    areaId: string,
    categoryDocId: string,
    oldName: string,
    newName: string
  ) => Promise<number>;
  /** Local gems only: hide category from guest Live like a local wizard. */
  showLiveLikeLocalExclude?: boolean;
  /** Local gems only: per-category notes for the Live like a local AI. */
  showLiveLikeLocalKnowledge?: boolean;
};

export default function AreaCategoryNamesPanel({
  country,
  areaId,
  areaName,
  collectionName,
  title,
  onRename,
  showLiveLikeLocalExclude = false,
  showLiveLikeLocalKnowledge = false,
}: Props) {
  const toast = useToast();
  const localeSettings = useAreaContentLocaleSettings(country, areaId);
  const primary = localeSettings.primaryLocale;
  const { languages } = usePlatformLanguages();
  const languageOptions = useMemo(
    () => languages.map((l) => ({ code: l.shortName, label: l.title })),
    [languages]
  );

  const [categories, setCategories] = useState<{ id: string; data: Record<string, unknown> }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingSourceDoc, setEditingSourceDoc] = useState<Record<string, unknown> | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLocaleTranslating, setIsLocaleTranslating] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [togglingExcludeId, setTogglingExcludeId] = useState<string | null>(null);
  const [newKnowledge, setNewKnowledge] = useState('');
  const [knowledgeEdits, setKnowledgeEdits] = useState<Record<string, string | undefined>>({});
  const [savingKnowledgeId, setSavingKnowledgeId] = useState<string | null>(null);

  const localeEditor = useContentLocaleEditor(primary, ['name'], editingSourceDoc);

  useEffect(() => {
    if (!country || !areaId) return;
    const colRef = collection(db, 'countries', country, 'areas', areaId, collectionName);
    const unsub = onSnapshot(colRef, (snapshot) => {
      const fetched = snapshot.docs.map((d) => ({ id: d.id, data: d.data() as Record<string, unknown> }));
      fetched.sort((a, b) =>
        categoryPrimaryName(a.data, primary).localeCompare(categoryPrimaryName(b.data, primary))
      );
      setCategories(fetched);
      setIsLoading(false);
    });
    return () => unsub();
  }, [country, areaId, collectionName, primary]);

  const primaryNames = useMemo(
    () => categories.map((c) => categoryPrimaryName(c.data, primary).toLowerCase()),
    [categories, primary]
  );

  const activeLocale = localeEditor.contentLocale;
  const isPrimaryTab = normalizeLocaleCode(activeLocale) === normalizeLocaleCode(primary);

  const editingCategory = editingId ? categories.find((c) => c.id === editingId) : null;

  const fromEditorEnglish = localeEditor.getPrimaryValue('name').trim();
  const englishName =
    fromEditorEnglish ||
    (editingCategory ? categoryPrimaryName(editingCategory.data, primary) : '');

  const displayName = (data: Record<string, unknown>) =>
    resolveCategoryLabel(data, activeLocale, primary) || categoryPrimaryName(data, primary);

  const editPlaceholder = isPrimaryTab
    ? 'English category name'
    : englishName
      ? `Greek translation (English: ${englishName})`
      : 'Greek translation';

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!englishName) {
      toast.warning('Enter the English name on the EN tab first.');
      return;
    }
    if (primaryNames.includes(englishName.toLowerCase())) {
      toast.warning('This category already exists.');
      return;
    }
    setIsSubmitting(true);
    try {
      const payload = localeEditor.buildPayload();
      await addDoc(collection(db, 'countries', country, 'areas', areaId, collectionName), {
        ...payload,
        ...(showLiveLikeLocalKnowledge && newKnowledge.trim()
          ? { liveLikeLocalKnowledge: newKnowledge.trim() }
          : {}),
        createdAt: new Date().toISOString(),
      });
      setEditingSourceDoc(null);
      localeEditor.resetMaps();
      setNewKnowledge('');
    } catch (error) {
      console.error(error);
      toast.error('Failed to add category.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!window.confirm(`Delete "${label}"?`)) return;
    try {
      await deleteDoc(doc(db, 'countries', country, 'areas', areaId, collectionName, id));
    } catch {
      toast.error('Failed to delete category.');
    }
  };

  const startEdit = (cat: { id: string; data: Record<string, unknown> }) => {
    setEditingId(cat.id);
    setEditingSourceDoc(cat.data);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditingSourceDoc(null);
  };

  const handleSaveEdit = async (id: string, oldData: Record<string, unknown>) => {
    const oldEnglishName = categoryPrimaryName(oldData, primary);
    const newEnglishName = localeEditor.getPrimaryValue('name').trim() || categoryPrimaryName(oldData, primary);
    if (!newEnglishName) {
      toast.warning('The English name cannot be empty. Switch to the EN tab to set it.');
      return;
    }

    const englishChanged = newEnglishName.toLowerCase() !== oldEnglishName.toLowerCase();
    if (
      englishChanged &&
      categories.some(
        (c) =>
          c.id !== id && categoryPrimaryName(c.data, primary).toLowerCase() === newEnglishName.toLowerCase()
      )
    ) {
      toast.warning('Another category already uses this English name.');
      return;
    }

    setIsSavingEdit(true);
    try {
      const payload = localeEditor.buildPayload();
      await updateDoc(doc(db, 'countries', country, 'areas', areaId, collectionName, id), {
        ...payload,
        updatedAt: new Date().toISOString(),
      });
      let updatedCount = 0;
      if (englishChanged) {
        updatedCount = await onRename(country, areaId, id, oldEnglishName, newEnglishName);
      }
      cancelEdit();
      toast.success(
        englishChanged && updatedCount > 0
          ? `Category saved. Linked items updated (${updatedCount}).`
          : 'Category saved.'
      );
    } catch (error) {
      console.error(error);
      toast.error('Failed to update category.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  const toggleLiveLikeLocalExclude = async (
    id: string,
    data: Record<string, unknown>,
    label: string
  ) => {
    const next = !isExcludedFromLiveLikeLocal(data);
    setTogglingExcludeId(id);
    try {
      await updateDoc(doc(db, 'countries', country, 'areas', areaId, collectionName, id), {
        excludeFromLiveLikeLocal: next,
        updatedAt: new Date().toISOString(),
      });
      toast.success(
        next
          ? `"${label}" hidden from Live like a local.`
          : `"${label}" shown in Live like a local again.`
      );
    } catch (error) {
      console.error(error);
      toast.error('Could not update Live like a local visibility.');
    } finally {
      setTogglingExcludeId(null);
    }
  };

  const knowledgeDraft = (id: string, data: Record<string, unknown>) => {
    if (knowledgeEdits[id] !== undefined) return knowledgeEdits[id]!;
    return readLiveLikeLocalCategoryKnowledge(data);
  };

  const knowledgeIsDirty = (id: string, data: Record<string, unknown>) => {
    if (knowledgeEdits[id] === undefined) return false;
    return knowledgeEdits[id]!.trim() !== readLiveLikeLocalCategoryKnowledge(data);
  };

  const saveLiveLikeLocalKnowledge = async (id: string, data: Record<string, unknown>) => {
    const label = displayName(data);
    const value = knowledgeDraft(id, data).trim();
    setSavingKnowledgeId(id);
    try {
      await updateDoc(doc(db, 'countries', country, 'areas', areaId, collectionName, id), {
        liveLikeLocalKnowledge: value,
        updatedAt: new Date().toISOString(),
      });
      setKnowledgeEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      toast.success(value ? `Knowledge saved for "${label}".` : `Knowledge cleared for "${label}".`);
    } catch (error) {
      console.error(error);
      toast.error('Failed to save category knowledge.');
    } finally {
      setSavingKnowledgeId(null);
    }
  };

  const handleAutoTranslate = async () => {
    if (isPrimaryTab) {
      toast.warning('Switch to the Greek tab to auto-translate.');
      return;
    }
    if (!englishName) {
      toast.warning('Add the English name on the EN tab first.');
      return;
    }
    setIsLocaleTranslating(true);
    try {
      const translated = await translateContentFields({ name: englishName }, primary, activeLocale);
      localeEditor.applyTranslatedFields(activeLocale, translated);
      toast.success('Greek draft added — review and save.');
    } catch {
      toast.error('Auto-translate failed.');
    } finally {
      setIsLocaleTranslating(false);
    }
  };

  const nameInputValue = localeEditor.getValue('name');

  return (
    <div className="rounded-xl border border-vailo-teal/15 bg-white p-4 mb-6 space-y-4">
      <div>
        <p className="text-sm font-bold text-vailo-dark flex items-center gap-2">
          <Languages size={16} /> {title} — {areaName}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          EN = main name for gems/features. EL = Greek translation only (clearing Greek does not remove English).
          {showLiveLikeLocalExclude && (
            <>
              {' '}
              Use <span className="font-medium">Hide from Live like a local</span> to keep a category for Local Gems
              but remove it from the guest concierge category picker.
            </>
          )}
          {showLiveLikeLocalKnowledge && (
            <>
              {' '}
              Add <span className="font-medium">Live like a local knowledge</span> for categories shown in the
              concierge (not &quot;Local gems only&quot;) so the AI can weigh local context when guests pick that theme.
            </>
          )}
        </p>
      </div>

      <ContentLocaleTabs
        enabledLocales={localeSettings.enabledLocales}
        primaryLocale={primary}
        activeLocale={activeLocale}
        onChange={localeEditor.setContentLocale}
        languageOptions={languageOptions}
      />

      {!isPrimaryTab && (
        <button
          type="button"
          onClick={handleAutoTranslate}
          disabled={isLocaleTranslating || !englishName}
          className="flex items-center text-sm font-medium text-vailo-teal hover:underline disabled:opacity-50"
        >
          {isLocaleTranslating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Sparkles size={14} className="mr-1" />}
          Auto-translate name from EN
        </button>
      )}

      {!editingId && (
        <form onSubmit={handleAdd} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInputValue}
              onChange={(e) => localeEditor.setValue('name', e.target.value)}
              placeholder={editPlaceholder}
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg admin-input"
            />
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 bg-vailo-teal text-white rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
            </button>
          </div>
          {showLiveLikeLocalKnowledge && (
            <AdminTextarea
              value={newKnowledge}
              onChange={(e) => setNewKnowledge(e.target.value)}
              rows={2}
              placeholder="Optional: Live like a local knowledge for this category (English is fine)"
              className="text-sm !min-h-0 resize-y"
            />
          )}
        </form>
      )}

      {isLoading ? (
        <p className="text-sm text-gray-400 flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" /> Loading…
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-100 rounded-lg overflow-hidden">
          {categories.map((cat) => {
            const excludedFromLiveLikeLocal = isExcludedFromLiveLikeLocal(cat.data);
            return (
            <li
              key={cat.id}
              className={`p-3 ${
                excludedFromLiveLikeLocal ? 'bg-gray-100/80' : 'bg-gray-50/50'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                {editingId === cat.id ? (
                  <>
                    <input
                      type="text"
                      value={nameInputValue}
                      onChange={(e) => localeEditor.setValue('name', e.target.value)}
                      placeholder={editPlaceholder}
                      className="flex-1 px-2 py-1.5 border rounded-lg text-sm admin-input bg-white"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveEdit(cat.id, cat.data)}
                      disabled={isSavingEdit}
                      className="p-1.5 text-emerald-600"
                      title="Save"
                    >
                      {isSavingEdit ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />}
                    </button>
                    <button type="button" onClick={cancelEdit} className="p-1.5 text-gray-400" title="Cancel">
                      <X size={16} />
                    </button>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium flex items-center gap-2 min-w-0">
                      <Tag size={14} className="text-vailo-teal shrink-0" />
                      <span className={`truncate ${excludedFromLiveLikeLocal ? 'text-gray-500' : ''}`}>
                        {displayName(cat.data)}
                      </span>
                      {showLiveLikeLocalExclude && excludedFromLiveLikeLocal && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 bg-white border border-gray-200 px-1.5 py-0.5 rounded shrink-0">
                          Local gems only
                        </span>
                      )}
                    </span>
                    <div className="flex gap-1 shrink-0">
                      {showLiveLikeLocalExclude && (
                        <button
                          type="button"
                          onClick={() =>
                            toggleLiveLikeLocalExclude(cat.id, cat.data, displayName(cat.data))
                          }
                          disabled={togglingExcludeId === cat.id}
                          className={`p-1.5 ${
                            excludedFromLiveLikeLocal
                              ? 'text-vailo-teal hover:text-vailo-teal/80'
                              : 'text-gray-400 hover:text-amber-700'
                          }`}
                          title={
                            excludedFromLiveLikeLocal
                              ? 'Show in Live like a local'
                              : 'Hide from Live like a local'
                          }
                        >
                          {togglingExcludeId === cat.id ? (
                            <Loader2 size={16} className="animate-spin" />
                          ) : excludedFromLiveLikeLocal ? (
                            <Eye size={16} />
                          ) : (
                            <EyeOff size={16} />
                          )}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => startEdit(cat)}
                        className="p-1.5 text-gray-400 hover:text-vailo-teal"
                        title="Edit name"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(cat.id, displayName(cat.data))}
                        className="p-1.5 text-gray-400 hover:text-red-600"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </>
                )}
              </div>
              {showLiveLikeLocalKnowledge && !excludedFromLiveLikeLocal && (
                <div className="mt-3 pt-3 border-t border-gray-200/80 space-y-2">
                  <label className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-vailo-teal" />
                    Live like a local knowledge
                  </label>
                  <AdminTextarea
                    value={knowledgeDraft(cat.id, cat.data)}
                    onChange={(e) =>
                      setKnowledgeEdits((prev) => ({ ...prev, [cat.id]: e.target.value }))
                    }
                    rows={2}
                    placeholder="e.g. Best May–October; family-friendly beaches; avoid midday in August heat."
                    className="text-sm bg-white !min-h-0 resize-y"
                  />
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => void saveLiveLikeLocalKnowledge(cat.id, cat.data)}
                      disabled={!knowledgeIsDirty(cat.id, cat.data) || savingKnowledgeId === cat.id}
                      className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-vailo-teal text-white disabled:opacity-40"
                    >
                      {savingKnowledgeId === cat.id ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        'Save knowledge'
                      )}
                    </button>
                  </div>
                </div>
              )}
            </li>
          );
          })}
        </ul>
      )}
    </div>
  );
}
