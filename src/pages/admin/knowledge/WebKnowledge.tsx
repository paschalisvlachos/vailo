import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore';
import { Globe, Loader2, MessageCircle, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { adminPath } from '../../../lib/adminRoutes';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminInput,
  AdminLabel,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';
import { useToast } from '../../../context/ToastContext';
import { db } from '../../../lib/firebase';
import { answerWebKnowledgeQuestion } from '../../../lib/knowledgeAi';
import {
  buildWebKnowledgeCorpus,
  WEB_KNOWLEDGE_COLLECTION,
  type WebKnowledgeEntry,
} from '../../../lib/platformKnowledge';

function parseWebEntry(id: string, data: Record<string, unknown>): WebKnowledgeEntry {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    content: typeof data.content === 'string' ? data.content : '',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
  };
}

export default function WebKnowledge() {
  const toast = useToast();
  const [entries, setEntries] = useState<WebKnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [askText, setAskText] = useState('');
  const [askAnswer, setAskAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);

  useEffect(() => {
    const q = query(collection(db, WEB_KNOWLEDGE_COLLECTION), orderBy('updatedAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setEntries(snap.docs.map((d) => parseWebEntry(d.id, d.data())));
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load web knowledge.');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [toast]);

  const corpus = useMemo(() => buildWebKnowledgeCorpus(entries), [entries]);

  const addEntry = async () => {
    try {
      await addDoc(collection(db, WEB_KNOWLEDGE_COLLECTION), {
        title: 'New article',
        content: '',
        updatedAt: new Date().toISOString(),
        createdAt: serverTimestamp(),
      });
      toast.success('Article added.');
    } catch (e) {
      console.error(e);
      toast.error('Could not add article.');
    }
  };

  const saveEntry = async (entry: WebKnowledgeEntry) => {
    setSavingId(entry.id);
    try {
      await updateDoc(doc(db, WEB_KNOWLEDGE_COLLECTION, entry.id), {
        title: entry.title.trim(),
        content: entry.content.trim(),
        updatedAt: new Date().toISOString(),
      });
      toast.success('Saved.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save.');
    } finally {
      setSavingId(null);
    }
  };

  const removeEntry = async (id: string) => {
    if (!window.confirm('Delete this article?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, WEB_KNOWLEDGE_COLLECTION, id));
      toast.success('Article deleted.');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  const patchLocal = (id: string, patch: Partial<WebKnowledgeEntry>) => {
    setEntries((prev) => prev.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  };

  const handleAsk = async () => {
    if (!askText.trim()) return;
    setAsking(true);
    setAskAnswer(null);
    try {
      const answer = await answerWebKnowledgeQuestion(corpus, askText.trim());
      setAskAnswer(answer);
    } catch (e) {
      console.error(e);
      toast.error('AI could not answer. Try again.');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/knowledge')}
        backLabel="Knowledge"
        title="Web Knowledge"
        description="Articles about the Vailo website and product. Staff questions are answered using only this content."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-vailo-teal bg-vailo-teal/10 px-3 py-1.5 rounded-full">
            <Globe size={14} />
            {entries.length} article{entries.length === 1 ? '' : 's'}
          </span>
        }
        action={
          <AdminButton type="button" onClick={() => void addEntry()}>
            <Plus size={16} className="mr-1.5" />
            Add article
          </AdminButton>
        }
      />

      {loading ? (
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={22} />
          Loading…
        </div>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 xl:gap-8">
          <div className="space-y-4">
            {entries.length === 0 && (
              <AdminCard className="p-8 text-center border-dashed">
                <p className="text-gray-500 text-sm">
                  No articles yet. Add content about the site, pricing, onboarding, guest portal, etc.
                </p>
              </AdminCard>
            )}
            {entries.map((entry) => (
              <AdminCard key={entry.id} className="p-4 sm:p-5 space-y-3">
                <div>
                  <AdminLabel>Title</AdminLabel>
                  <AdminInput
                    value={entry.title}
                    onChange={(e) => patchLocal(entry.id, { title: e.target.value })}
                    placeholder="e.g. Guest portal access"
                  />
                </div>
                <div>
                  <AdminLabel>Content</AdminLabel>
                  <AdminTextarea
                    value={entry.content}
                    onChange={(e) => patchLocal(entry.id, { content: e.target.value })}
                    rows={8}
                    placeholder="Facts, URLs, policies, how-tos…"
                  />
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <AdminButton
                    type="button"
                    onClick={() => void saveEntry(entry)}
                    disabled={savingId === entry.id}
                  >
                    {savingId === entry.id ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <Save size={16} className="mr-1.5" />
                    )}
                    Save
                  </AdminButton>
                  <AdminButton
                    type="button"
                    variant="danger"
                    onClick={() => void removeEntry(entry.id)}
                    disabled={deletingId === entry.id}
                  >
                    <Trash2 size={16} />
                  </AdminButton>
                </div>
              </AdminCard>
            ))}
          </div>

          <AdminCard className="p-4 sm:p-6 xl:sticky xl:top-24 h-fit">
            <h3 className="text-base font-bold text-vailo-dark font-luxury flex items-center gap-2 mb-1">
              <MessageCircle size={18} className="text-vailo-teal" />
              Ask the knowledge base
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              AI answers using saved articles only — useful to test coverage before staff rely on it.
            </p>
            <AdminTextarea
              value={askText}
              onChange={(e) => setAskText(e.target.value)}
              rows={3}
              placeholder="e.g. How does guest portal access work?"
            />
            <AdminButton
              type="button"
              className="mt-3 w-full sm:w-auto"
              onClick={() => void handleAsk()}
              disabled={asking || !askText.trim()}
            >
              {asking ? (
                <Loader2 size={16} className="animate-spin mr-2" />
              ) : (
                <Sparkles size={16} className="mr-2" />
              )}
              Get AI answer
            </AdminButton>
            {askAnswer && (
              <div className="mt-4 p-4 rounded-xl bg-vailo-surface-elevated border border-gray-100 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">
                {askAnswer}
              </div>
            )}
          </AdminCard>
        </div>
      )}
    </div>
  );
}
