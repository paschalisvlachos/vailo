import { useEffect, useRef, useState } from 'react';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { FileText, Loader2, Save, Shield } from 'lucide-react';
import AdminPageHeader, { AdminAlert, AdminButton, AdminCard } from '../../components/admin/AdminPageHeader';
import RichTextEditor, { type RichTextEditorHandle } from '../../components/admin/RichTextEditor';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { usePlatformLegal } from '../../hooks/usePlatformLegal';
import {
  legalPlainTextLength,
  normalizeLegalContentForEditor,
  sanitizeLegalHtml,
} from '../../lib/legalHtml';

type LegalTab = 'privacy' | 'terms';

export default function LegalDocuments() {
  const toast = useToast();
  const { content, loading, error } = usePlatformLegal();
  const [activeTab, setActiveTab] = useState<LegalTab>('privacy');
  const [privacyPolicy, setPrivacyPolicy] = useState('');
  const [termsOfUse, setTermsOfUse] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const hydratedRef = useRef(false);
  const privacyEditorRef = useRef<RichTextEditorHandle>(null);
  const termsEditorRef = useRef<RichTextEditorHandle>(null);

  useEffect(() => {
    if (loading) return;
    if (dirty) return;
    if (!hydratedRef.current) {
      setPrivacyPolicy(normalizeLegalContentForEditor(content.privacyPolicy));
      setTermsOfUse(normalizeLegalContentForEditor(content.termsOfUse));
      hydratedRef.current = true;
      return;
    }
    setPrivacyPolicy(normalizeLegalContentForEditor(content.privacyPolicy));
    setTermsOfUse(normalizeLegalContentForEditor(content.termsOfUse));
  }, [loading, content.privacyPolicy, content.termsOfUse, dirty]);

  const handleSave = async () => {
    const privacyHtml = sanitizeLegalHtml(privacyEditorRef.current?.getHtml() ?? privacyPolicy);
    const termsHtml = sanitizeLegalHtml(termsEditorRef.current?.getHtml() ?? termsOfUse);

    setPrivacyPolicy(privacyHtml);
    setTermsOfUse(termsHtml);

    if (!legalPlainTextLength(privacyHtml) && !legalPlainTextLength(termsHtml)) {
      toast.warning('Add content to at least one document before saving.');
      return;
    }

    setIsSaving(true);
    try {
      const ref = doc(db, 'platformSettings', 'legal');
      await setDoc(
        ref,
        {
          privacyPolicy: privacyHtml,
          termsOfUse: termsHtml,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setDirty(false);
      toast.success('Legal documents saved.');
    } catch (err) {
      console.error('save legal documents:', err);
      toast.error('Could not save. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const switchTab = (tab: LegalTab) => {
    if (activeTab === 'privacy') {
      setPrivacyPolicy(sanitizeLegalHtml(privacyEditorRef.current?.getHtml() ?? privacyPolicy));
    } else {
      setTermsOfUse(sanitizeLegalHtml(termsEditorRef.current?.getHtml() ?? termsOfUse));
    }
    setActiveTab(tab);
  };

  return (
    <div className="admin-page">
      <AdminPageHeader
        title="Legal Documents"
        description="Privacy Policy and Terms of Use shown to guests on every property portal"
        icon={<FileText size={26} />}
      />

      {error && (
        <AdminAlert variant="warning" title="Could not load documents" className="mb-6">
          {error}
        </AdminAlert>
      )}

      <div className="flex flex-col sm:flex-row gap-1 bg-white p-1 rounded-xl mb-6 border border-gray-100 w-full sm:w-fit shadow-sm">
        <button
          type="button"
          onClick={() => switchTab('privacy')}
          className={`flex items-center justify-center sm:justify-start px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'privacy'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <Shield size={16} className="mr-2 shrink-0" />
          Privacy Policy
        </button>
        <button
          type="button"
          onClick={() => switchTab('terms')}
          className={`flex items-center justify-center sm:justify-start px-4 py-2.5 rounded-lg text-sm font-semibold transition-all ${
            activeTab === 'terms'
              ? 'bg-vailo-teal text-white shadow-sm'
              : 'text-gray-500 hover:text-vailo-teal hover:bg-vailo-surface-elevated'
          }`}
        >
          <FileText size={16} className="mr-2 shrink-0" />
          Terms of Use
        </button>
      </div>

      <AdminCard className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-vailo-dark">
              {activeTab === 'privacy' ? 'Privacy Policy' : 'Terms of Use'}
            </h3>
            <p className="text-xs text-gray-500 mt-1">
              Toolbar: bold, italic, underline, headings, lists, links. Shortcuts: ⌘/Ctrl+B, ⌘/Ctrl+I, ⌘/Ctrl+U.
            </p>
          </div>
          {content.updatedAt && !loading && (
            <p className="text-xs text-gray-400 shrink-0">
              Last saved {content.updatedAt.toLocaleString()}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-gray-500 py-12 justify-center">
            <Loader2 size={20} className="animate-spin text-vailo-teal" />
            Loading…
          </div>
        ) : (
          <>
            <div className={activeTab === 'privacy' ? 'block' : 'hidden'}>
              <RichTextEditor
                ref={privacyEditorRef}
                value={privacyPolicy}
                onChange={(html) => {
                  setPrivacyPolicy(html);
                  setDirty(true);
                }}
                placeholder="Enter your privacy policy…"
              />
            </div>
            <div className={activeTab === 'terms' ? 'block' : 'hidden'}>
              <RichTextEditor
                ref={termsEditorRef}
                value={termsOfUse}
                onChange={(html) => {
                  setTermsOfUse(html);
                  setDirty(true);
                }}
                placeholder="Enter your terms of use…"
              />
            </div>
          </>
        )}

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mt-6 pt-6 border-t border-gray-100">
          <p className="text-xs text-gray-500">
            Privacy: {legalPlainTextLength(privacyPolicy).toLocaleString()} chars · Terms:{' '}
            {legalPlainTextLength(termsOfUse).toLocaleString()} chars
            {dirty ? ' · Unsaved changes' : ''}
          </p>
          <AdminButton
            onClick={handleSave}
            disabled={isSaving || loading || !dirty}
            className="shrink-0 self-start sm:self-auto"
          >
            {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            Save both documents
          </AdminButton>
        </div>
      </AdminCard>
    </div>
  );
}
