import { useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import {
  ExternalLink,
  FileText,
  FolderPlus,
  Loader2,
  Plus,
  Save,
  ScrollText,
  Shield,
  Trash2,
  Upload,
} from 'lucide-react';
import AdminPageHeader, { AdminAlert, AdminButton, AdminCard } from '../../components/admin/AdminPageHeader';
import RichTextEditor, { type RichTextEditorHandle } from '../../components/admin/RichTextEditor';
import { db, storage } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import {
  legalPlainTextLength,
  normalizeLegalContentForEditor,
  sanitizeLegalHtml,
} from '../../lib/legalHtml';
import {
  createLegalId,
  DEFAULT_LEGAL_CATEGORY,
  isLockedLegalCategory,
  LEGAL_CATEGORY_ID,
  LEGAL_CATEGORY_NAME,
  legalCategoryDisplayName,
  serializeCategoriesForFirestore,
  type LegalCategory,
  type LegalFileDocument,
} from '../../lib/platformLegal';

type MainTab = 'published' | 'agreement' | string;

function isFileCategoryTab(tab: MainTab): boolean {
  return tab !== 'published' && tab !== 'agreement';
}

const ACCEPTED_FILE_TYPES =
  '.pdf,.doc,.docx,.md,.txt,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain';

function cloneCategories(cats: LegalCategory[]): LegalCategory[] {
  return cats.map((c) => ({
    ...c,
    documents: c.documents.map((d) => ({ ...d })),
  }));
}

export default function LegalDocuments() {
  const toast = useToast();
  const { content, loading, error } = usePlatformLegal();
  const [activeTab, setActiveTab] = useState<MainTab>('legal');
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [termsOfUse, setTermsOfUse] = useState('');
  const [agreement, setAgreement] = useState('');
  const [categories, setCategories] = useState<LegalCategory[]>([DEFAULT_LEGAL_CATEGORY]);
  const [isSavingPublished, setIsSavingPublished] = useState(false);
  const [isSavingAgreement, setIsSavingAgreement] = useState(false);
  const [isSavingCategories, setIsSavingCategories] = useState(false);
  const [uploadingDocId, setUploadingDocId] = useState<string | null>(null);
  const [publishedDirty, setPublishedDirty] = useState(false);
  const [agreementDirty, setAgreementDirty] = useState(false);
  const [categoriesDirty, setCategoriesDirty] = useState(false);
  const privacyEditorRef = useRef<RichTextEditorHandle>(null);
  const termsEditorRef = useRef<RichTextEditorHandle>(null);
  const agreementEditorRef = useRef<RichTextEditorHandle>(null);

  const editorSyncKey = content.updatedAt?.getTime() ?? 0;
  const storedPrivacyChars = legalPlainTextLength(content.privacyPolicy);
  const storedTermsChars = legalPlainTextLength(content.termsOfUse);
  const storedAgreementChars = legalPlainTextLength(content.agreement);

  const legalCategory = categories.find((c) => c.id === LEGAL_CATEGORY_ID);
  const customCategories = categories.filter((c) => c.id !== LEGAL_CATEGORY_ID);

  /** Load published pages from Firestore unless the admin has unsaved edits. */
  useEffect(() => {
    if (loading || publishedDirty) return;
    setPrivacyPolicy(normalizeLegalContentForEditor(content.privacyPolicy));
    setTermsOfUse(normalizeLegalContentForEditor(content.termsOfUse));
  }, [loading, content.privacyPolicy, content.termsOfUse, editorSyncKey, publishedDirty]);

  /** Load agreement from Firestore unless the admin has unsaved edits. */
  useEffect(() => {
    if (loading || agreementDirty) return;
    setAgreement(normalizeLegalContentForEditor(content.agreement));
  }, [loading, content.agreement, editorSyncKey, agreementDirty]);

  /** Load file categories from Firestore unless the admin has unsaved category edits. */
  useEffect(() => {
    if (loading || categoriesDirty) return;
    setCategories(cloneCategories(content.categories));
  }, [loading, editorSyncKey, categoriesDirty, content.categories]);

  const activeCategory = isFileCategoryTab(activeTab)
    ? categories.find((c) => c.id === activeTab) ?? null
    : null;

  const syncPublishedFromEditors = () => {
    setPrivacyPolicy(sanitizeLegalHtml(privacyEditorRef.current?.getHtml() ?? privacyPolicy));
    setTermsOfUse(sanitizeLegalHtml(termsEditorRef.current?.getHtml() ?? termsOfUse));
  };

  const syncAgreementFromEditor = () => {
    setAgreement(sanitizeLegalHtml(agreementEditorRef.current?.getHtml() ?? agreement));
  };

  const switchTab = (tab: MainTab) => {
    if (activeTab === 'published') syncPublishedFromEditors();
    if (activeTab === 'agreement') syncAgreementFromEditor();
    setActiveTab(tab);
  };

  const persistLegal = async (payload: Record<string, unknown>, successMessage: string) => {
    const ref = doc(db, 'platformSettings', 'legal');
    await setDoc(ref, { ...payload, updatedAt: serverTimestamp() }, { merge: true });
    toast.success(successMessage);
  };

  const handleSavePublished = async () => {
    syncPublishedFromEditors();
    const privacyHtml = sanitizeLegalHtml(privacyPolicy);
    const termsHtml = sanitizeLegalHtml(termsOfUse);

    if (!legalPlainTextLength(privacyHtml) && !legalPlainTextLength(termsHtml)) {
      toast.warning('Add content to at least one published page before saving.');
      return;
    }

    setIsSavingPublished(true);
    try {
      await persistLegal(
        {
          privacyPolicy: privacyHtml,
          termsOfUse: termsHtml,
        },
        'Published pages saved.'
      );
      setPublishedDirty(false);
    } catch (err) {
      console.error('save published legal:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSavingPublished(false);
    }
  };

  const handleSaveAgreement = async () => {
    syncAgreementFromEditor();
    const agreementHtml = sanitizeLegalHtml(agreement);

    setIsSavingAgreement(true);
    try {
      await persistLegal({ agreement: agreementHtml }, 'Agreement saved.');
      setAgreementDirty(false);
    } catch (err) {
      console.error('save agreement:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSavingAgreement(false);
    }
  };

  const handleSaveCategories = async () => {
    const invalid = categories.find(
      (c) => !isLockedLegalCategory(c.id) && !c.name.trim()
    );
    if (invalid) {
      toast.warning('Every custom category needs a title.');
      return;
    }
    const missingTitle = categories.some((c) =>
      c.documents.some((d) => d.fileUrl && !d.title.trim())
    );
    if (missingTitle) {
      toast.warning('Every uploaded document needs a title.');
      return;
    }

    setIsSavingCategories(true);
    try {
      await persistLegal(
        {
          categories: serializeCategoriesForFirestore(categories),
        },
        'Document categories saved.'
      );
      setCategoriesDirty(false);
    } catch (err) {
      console.error('save legal categories:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSavingCategories(false);
    }
  };

  const updateCategories = (updater: (prev: LegalCategory[]) => LegalCategory[]) => {
    setCategories((prev) => updater(prev));
    setCategoriesDirty(true);
  };

  const addCategory = () => {
    const id = createLegalId();
    updateCategories((prev) => [...prev, { id, name: 'New category', documents: [] }]);
    setActiveTab(id);
  };

  const removeCategory = (categoryId: string) => {
    if (isLockedLegalCategory(categoryId)) {
      toast.warning('The Legal category cannot be deleted.');
      return;
    }
    if (categories.length <= 1) {
      toast.warning('Keep at least one category.');
      return;
    }
    if (!window.confirm('Delete this category and all its documents?')) return;
    updateCategories((prev) => prev.filter((c) => c.id !== categoryId));
    if (activeTab === categoryId) {
      const next = categories.find((c) => c.id !== categoryId);
      setActiveTab(next?.id ?? 'published');
    }
  };

  const renameCategory = (categoryId: string, name: string) => {
    if (isLockedLegalCategory(categoryId)) return;
    updateCategories((prev) =>
      prev.map((c) => (c.id === categoryId ? { ...c, name } : c))
    );
  };

  const addDocumentRow = (categoryId: string) => {
    const docId = createLegalId();
    updateCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              documents: [
                ...c.documents,
                {
                  id: docId,
                  title: '',
                  fileUrl: '',
                  fileName: '',
                  storagePath: '',
                },
              ],
            }
          : c
      )
    );
  };

  const updateDocumentTitle = (
    categoryId: string,
    documentId: string,
    title: string
  ) => {
    updateCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? {
              ...c,
              documents: c.documents.map((d) =>
                d.id === documentId ? { ...d, title } : d
              ),
            }
          : c
      )
    );
  };

  const removeDocument = async (categoryId: string, document: LegalFileDocument) => {
    if (document.fileUrl && !window.confirm(`Remove "${document.title || document.fileName}"?`)) {
      return;
    }
    if (document.storagePath) {
      try {
        await deleteObject(ref(storage, document.storagePath));
      } catch (err) {
        console.warn('storage delete:', err);
      }
    }
    updateCategories((prev) =>
      prev.map((c) =>
        c.id === categoryId
          ? { ...c, documents: c.documents.filter((d) => d.id !== document.id) }
          : c
      )
    );
  };

  const uploadDocumentFile = async (
    categoryId: string,
    documentId: string,
    file: File
  ) => {
    setUploadingDocId(documentId);
    try {
      const storagePath = `platform/legal/${categoryId}/${documentId}/${Date.now()}_${file.name}`;
      const storageRef = ref(storage, storagePath);
      await uploadBytes(storageRef, file);
      const fileUrl = await getDownloadURL(storageRef);

      const existing = categories
        .find((c) => c.id === categoryId)
        ?.documents.find((d) => d.id === documentId);

      if (existing?.storagePath && existing.storagePath !== storagePath) {
        try {
          await deleteObject(ref(storage, existing.storagePath));
        } catch {
          /* ignore */
        }
      }

      updateCategories((prev) =>
        prev.map((c) =>
          c.id === categoryId
            ? {
                ...c,
                documents: c.documents.map((d) =>
                  d.id === documentId
                    ? {
                        ...d,
                        fileUrl,
                        fileName: file.name,
                        storagePath,
                        contentType: file.type,
                        updatedAt: new Date().toISOString(),
                        title: d.title.trim() || file.name.replace(/\.[^.]+$/, ''),
                      }
                    : d
                ),
              }
            : c
        )
      );
      toast.success('File uploaded. Save categories when you are done editing.');
    } catch (err) {
      console.error('legal file upload:', err);
      toast.error('Upload failed. Please try again.');
    } finally {
      setUploadingDocId(null);
    }
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Legal Documents"
        description="Published pages for guests, owner agreement text, and downloadable files by category."
        icon={<FileText size={26} />}
        action={
          <AdminButton variant="secondary" onClick={addCategory}>
            <FolderPlus size={16} />
            Add category
          </AdminButton>
        }
      />

      {error && (
        <AdminAlert variant="warning" title="Could not load documents" className="mb-6">
          {error}
        </AdminAlert>
      )}

      <div className="flex flex-wrap gap-1 bg-white p-1 rounded-xl mb-6 border border-gray-100 w-full shadow-sm">
        <button
          type="button"
          onClick={() => switchTab('published')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'published'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <Shield size={16} className="mr-2 shrink-0" />
          Published pages
        </button>
        <button
          type="button"
          onClick={() => switchTab('agreement')}
          className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'agreement'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <ScrollText size={16} className="mr-2 shrink-0" />
          Agreement
        </button>
        {legalCategory && (
          <button
            type="button"
            onClick={() => switchTab(LEGAL_CATEGORY_ID)}
            className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === LEGAL_CATEGORY_ID
                ? 'bg-vailo-teal text-white shadow-sm'
                : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
            }`}
          >
            <FileText size={16} className="mr-2 shrink-0" />
            {LEGAL_CATEGORY_NAME}
          </button>
        )}
        {customCategories.map((cat) => (
          <button
            key={cat.id}
            type="button"
            onClick={() => switchTab(cat.id)}
            className={`flex items-center px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
              activeTab === cat.id
                ? 'bg-vailo-teal text-white shadow-sm'
                : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
            }`}
          >
            <FileText size={16} className="mr-2 shrink-0" />
            {legalCategoryDisplayName(cat)}
          </button>
        ))}
      </div>

      <AdminCard className={`p-6 ${activeTab === 'agreement' ? '' : 'hidden'}`}>
        <div className="mb-6">
          <h3 className="text-sm font-bold text-vailo-dark">Agreement</h3>
          <p className="text-xs text-gray-500 mt-1">
            Owner or partner agreement text (rich text). Stored separately from guest Privacy Policy and
            Terms of Use.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
            <Loader2 size={20} className="animate-spin text-vailo-teal" />
            Loading…
          </div>
        ) : (
          <RichTextEditor
            key={`agreement-${editorSyncKey}`}
            ref={agreementEditorRef}
            value={agreement}
            onChange={(html) => {
              setAgreement(html);
              setAgreementDirty(true);
            }}
            placeholder="Enter agreement content…"
            minHeight={360}
          />
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-6 border-t border-gray-100">
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              Editor: {legalPlainTextLength(agreement).toLocaleString()} chars
              {agreementDirty ? ' · Unsaved changes' : ''}
            </p>
            {!loading && storedAgreementChars > 0 && (
              <p className="text-vailo-teal">
                Saved in database: {storedAgreementChars.toLocaleString()} chars
              </p>
            )}
          </div>
          <AdminButton
            onClick={handleSaveAgreement}
            disabled={isSavingAgreement || loading || !agreementDirty}
            className="shrink-0"
          >
            {isSavingAgreement ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save agreement
          </AdminButton>
        </div>
      </AdminCard>

      <AdminCard className={`p-6 ${activeTab === 'published' ? '' : 'hidden'}`}>
        <div className="mb-6">
          <h3 className="text-sm font-bold text-vailo-dark">Published pages</h3>
          <p className="text-xs text-gray-500 mt-1">
            Same content guests see when they tap Privacy Policy or Terms of Use in the portal footer.
          </p>
        </div>

        <PublishedEditors
          loading={loading}
          editorSyncKey={editorSyncKey}
          privacyPolicy={privacyPolicy}
          termsOfUse={termsOfUse}
          privacyEditorRef={privacyEditorRef}
          termsEditorRef={termsEditorRef}
          onPrivacyChange={(html) => {
            setPrivacyPolicy(html);
            setPublishedDirty(true);
          }}
          onTermsChange={(html) => {
            setTermsOfUse(html);
            setPublishedDirty(true);
          }}
          updatedAt={content.updatedAt}
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-6 border-t border-gray-100">
          <div className="text-xs text-gray-500 space-y-1">
            <p>
              Editor: Privacy {legalPlainTextLength(privacyPolicy).toLocaleString()} chars · Terms{' '}
              {legalPlainTextLength(termsOfUse).toLocaleString()} chars
              {publishedDirty ? ' · Unsaved changes' : ''}
            </p>
            {!loading && (storedPrivacyChars > 0 || storedTermsChars > 0) && (
              <p className="text-vailo-teal">
                Saved in database (guest portal): Privacy {storedPrivacyChars.toLocaleString()} chars ·
                Terms {storedTermsChars.toLocaleString()} chars
              </p>
            )}
            {!loading &&
              publishedDirty &&
              (storedPrivacyChars > 0 || storedTermsChars > 0) &&
              legalPlainTextLength(privacyPolicy) === 0 &&
              legalPlainTextLength(termsOfUse) === 0 && (
                <p className="text-amber-700">
                  Your edits look empty but the database still has content. Discard changes by refreshing
                  the page, or copy from the guest portal before saving.
                </p>
              )}
          </div>
          <AdminButton
            onClick={handleSavePublished}
            disabled={isSavingPublished || loading || !publishedDirty}
            className="shrink-0"
          >
            {isSavingPublished ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save published pages
          </AdminButton>
        </div>
      </AdminCard>

      {activeCategory ? (
        <AdminCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
            <div className="flex-1 min-w-0">
              {isLockedLegalCategory(activeCategory.id) ? (
                <>
                  <h3 className="text-lg font-bold text-vailo-dark">{LEGAL_CATEGORY_NAME}</h3>
                  <p className="text-xs text-gray-500 mt-2">
                    Fixed category for downloadable legal files (contracts, DPAs, GDPR briefs, etc.).
                  </p>
                </>
              ) : (
                <>
                  <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Category title
                  </label>
                  <input
                    type="text"
                    value={activeCategory.name}
                    onChange={(e) => renameCategory(activeCategory.id, e.target.value)}
                    className="w-full max-w-md px-4 py-2.5 border border-gray-200 rounded-xl text-sm font-semibold text-vailo-dark focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none"
                    placeholder="e.g. Compliance"
                  />
                  <p className="text-xs text-gray-500 mt-2">
                    Upload PDF, Word, Markdown, or text files. Set a display title for each document.
                  </p>
                </>
              )}
            </div>
            {!isLockedLegalCategory(activeCategory.id) && categories.length > 1 && (
              <AdminButton
                variant="danger"
                onClick={() => removeCategory(activeCategory.id)}
                className="shrink-0"
              >
                <Trash2 size={16} />
                Delete category
              </AdminButton>
            )}
          </div>

          {loading ? (
            <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
              <Loader2 size={20} className="animate-spin text-vailo-teal" />
              Loading…
            </div>
          ) : activeCategory.documents.length === 0 ? (
            <div className="text-center py-12 rounded-xl border border-dashed border-gray-200 bg-gray-50">
              <FileText size={32} className="mx-auto text-gray-300 mb-3" />
              <p className="text-sm font-medium text-gray-700">No documents in this category</p>
              <p className="text-xs text-gray-500 mt-1 mb-4">Add a document, set its title, and upload a file.</p>
              <AdminButton onClick={() => addDocumentRow(activeCategory.id)}>
                <Plus size={16} />
                Add document
              </AdminButton>
            </div>
          ) : (
            <ul className="space-y-4">
              {activeCategory.documents.map((document) => (
                <li
                  key={document.id}
                  className="p-4 rounded-xl border border-gray-100 bg-vailo-surface-elevated/50 flex flex-col gap-3"
                >
                  <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
                    <div className="flex-1 min-w-0">
                      <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1">
                        Document title
                      </label>
                      <input
                        type="text"
                        value={document.title}
                        onChange={(e) =>
                          updateDocumentTitle(activeCategory.id, document.id, e.target.value)
                        }
                        placeholder="e.g. Terms of Use v2.0"
                        className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal outline-none"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          accept={ACCEPTED_FILE_TYPES}
                          className="sr-only"
                          disabled={uploadingDocId === document.id}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) void uploadDocumentFile(activeCategory.id, document.id, file);
                            e.target.value = '';
                          }}
                        />
                        <span
                          className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide border transition-colors ${
                            uploadingDocId === document.id
                              ? 'bg-gray-100 text-gray-400 border-gray-200'
                              : 'bg-white text-vailo-teal border-vailo-teal/20 hover:bg-vailo-teal/5'
                          }`}
                        >
                          {uploadingDocId === document.id ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Upload size={14} />
                          )}
                          {document.fileUrl ? 'Replace file' : 'Upload file'}
                        </span>
                      </label>
                      {document.fileUrl && (
                        <a
                          href={document.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide bg-vailo-teal text-white hover:bg-vailo-teal-hover"
                        >
                          <ExternalLink size={14} />
                          Open
                        </a>
                      )}
                      <button
                        type="button"
                        onClick={() => void removeDocument(activeCategory.id, document)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-red-600 border border-red-200 hover:bg-red-50"
                      >
                        <Trash2 size={14} />
                        Remove
                      </button>
                    </div>
                  </div>
                  {document.fileName && (
                    <p className="text-xs text-gray-500 truncate">
                      File: <span className="font-medium text-gray-700">{document.fileName}</span>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          )}

          {activeCategory.documents.length > 0 && (
            <button
              type="button"
              onClick={() => addDocumentRow(activeCategory.id)}
              className="mt-4 flex items-center text-sm font-semibold text-vailo-teal hover:text-vailo-dark"
            >
              <Plus size={16} className="mr-1.5" />
              Add another document
            </button>
          )}

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-6 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              {activeCategory.documents.length} document
              {activeCategory.documents.length !== 1 ? 's' : ''} in{' '}
              {legalCategoryDisplayName(activeCategory)}
              {categoriesDirty ? ' · Unsaved changes' : ''}
            </p>
            <AdminButton
              onClick={handleSaveCategories}
              disabled={isSavingCategories || loading || !categoriesDirty}
            >
              {isSavingCategories ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Save size={16} />
              )}
              Save categories
            </AdminButton>
          </div>
        </AdminCard>
      ) : null}
    </div>
  );
}

function PublishedEditors({
  loading,
  editorSyncKey,
  privacyPolicy,
  termsOfUse,
  privacyEditorRef,
  termsEditorRef,
  onPrivacyChange,
  onTermsChange,
  updatedAt,
}: {
  loading: boolean;
  editorSyncKey: number;
  privacyPolicy: string;
  termsOfUse: string;
  privacyEditorRef: React.RefObject<RichTextEditorHandle | null>;
  termsEditorRef: React.RefObject<RichTextEditorHandle | null>;
  onPrivacyChange: (html: string) => void;
  onTermsChange: (html: string) => void;
  updatedAt: Date | null;
}) {
  const [subTab, setSubTab] = useState<'privacy' | 'terms'>('privacy');

  return (
    <>
      <div className="flex gap-1 bg-vailo-surface-elevated p-1 rounded-lg mb-4 w-full sm:w-fit">
        <button
          type="button"
          onClick={() => setSubTab('privacy')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            subTab === 'privacy' ? 'bg-white text-vailo-teal shadow-sm' : 'text-gray-500'
          }`}
        >
          Privacy Policy
        </button>
        <button
          type="button"
          onClick={() => setSubTab('terms')}
          className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
            subTab === 'terms' ? 'bg-white text-vailo-teal shadow-sm' : 'text-gray-500'
          }`}
        >
          Terms of Use
        </button>
      </div>

      {updatedAt && !loading && (
        <p className="text-xs text-gray-400 mb-3">Last saved {updatedAt.toLocaleString()}</p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
          <Loader2 size={20} className="animate-spin text-vailo-teal" />
          Loading…
        </div>
      ) : (
        <>
          <div className={subTab === 'privacy' ? 'block' : 'hidden'}>
            <RichTextEditor
              key={`privacy-${editorSyncKey}`}
              ref={privacyEditorRef}
              value={privacyPolicy}
              onChange={onPrivacyChange}
              placeholder="Enter your privacy policy…"
            />
          </div>
          <div className={subTab === 'terms' ? 'block' : 'hidden'}>
            <RichTextEditor
              key={`terms-${editorSyncKey}`}
              ref={termsEditorRef}
              value={termsOfUse}
              onChange={onTermsChange}
              placeholder="Enter your terms of use…"
            />
          </div>
        </>
      )}
    </>
  );
}
