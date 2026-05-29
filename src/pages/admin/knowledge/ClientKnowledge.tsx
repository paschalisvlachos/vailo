import { useEffect, useMemo, useState } from 'react';
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from 'firebase/firestore';
import { Eye, Loader2, Pencil, Trash2, Users, X } from 'lucide-react';
import { adminPath } from '../../../lib/adminRoutes';
import {
  AdminBackHeader,
  AdminBadge,
  AdminButton,
  AdminCard,
} from '../../../components/admin/AdminPageHeader';
import ClientKnowledgeForm, { type ClientKnowledgeFormValues } from './ClientKnowledgeForm';
import { useToast } from '../../../context/ToastContext';
import { db } from '../../../lib/firebase';
import { draftClientKnowledgeAnswer } from '../../../lib/knowledgeAi';
import {
  normalizeLegalContentForEditor,
  sanitizeLegalHtml,
} from '../../../lib/legalHtml';
import {
  buildWebKnowledgeCorpus,
  CLIENT_KNOWLEDGE_COLLECTION,
  WEB_KNOWLEDGE_COLLECTION,
  type ClientKnowledgeEntry,
  type WebKnowledgeEntry,
} from '../../../lib/platformKnowledge';

const EMPTY_FORM: ClientKnowledgeFormValues = {
  question: '',
  staffAnswer: '',
  status: 'draft',
};

function parseClientEntry(id: string, data: Record<string, unknown>): ClientKnowledgeEntry {
  const question = typeof data.question === 'string' ? data.question : '';
  const rawAnswer = typeof data.staffAnswer === 'string' ? data.staffAnswer : '';
  const legacyDraft = typeof data.aiDraft === 'string' ? data.aiDraft.trim() : '';

  const normalizedAnswer = normalizeLegalContentForEditor(rawAnswer);
  const staffAnswer =
    !rawAnswer.trim() && !normalizedAnswer.replace(/<[^>]+>/g, '').trim() && legacyDraft
      ? normalizeLegalContentForEditor(legacyDraft)
      : normalizedAnswer;

  return {
    id,
    question,
    staffAnswer,
    status: data.status === 'ready' ? 'ready' : 'draft',
    updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : undefined,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : undefined,
  };
}

function parseWebEntry(id: string, data: Record<string, unknown>): WebKnowledgeEntry {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    content: typeof data.content === 'string' ? data.content : '',
  };
}

function rowTitle(question: string, max = 72): string {
  const t = question.trim();
  if (!t) return 'Untitled question';
  return t.length <= max ? t : `${t.slice(0, max)}…`;
}

function formatRowDate(iso?: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return iso;
  }
}

export default function ClientKnowledge() {
  const toast = useToast();
  const [entries, setEntries] = useState<ClientKnowledgeEntry[]>([]);
  const [webEntries, setWebEntries] = useState<WebKnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [composer, setComposer] = useState<ClientKnowledgeFormValues>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ClientKnowledgeFormValues>(EMPTY_FORM);
  const [viewEntry, setViewEntry] = useState<ClientKnowledgeEntry | null>(null);
  const [savingNew, setSavingNew] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [generatingNew, setGeneratingNew] = useState(false);
  const [generatingEdit, setGeneratingEdit] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    const webQ = query(collection(db, WEB_KNOWLEDGE_COLLECTION), orderBy('updatedAt', 'desc'));

    const unsubClient = onSnapshot(
      collection(db, CLIENT_KNOWLEDGE_COLLECTION),
      (snap) => {
        const list = snap.docs.map((d) => parseClientEntry(d.id, d.data()));
        list.sort((a, b) => {
          const ta = a.createdAt || a.updatedAt || '';
          const tb = b.createdAt || b.updatedAt || '';
          return ta.localeCompare(tb);
        });
        setEntries(list);
        setLoading(false);
      },
      (err) => {
        console.error(err);
        toast.error('Failed to load client knowledge.');
        setLoading(false);
      }
    );

    const unsubWeb = onSnapshot(webQ, (snap) => {
      setWebEntries(snap.docs.map((d) => parseWebEntry(d.id, d.data())));
    });

    return () => {
      unsubClient();
      unsubWeb();
    };
  }, [toast]);

  const webCorpus = useMemo(() => buildWebKnowledgeCorpus(webEntries), [webEntries]);

  const openEdit = (entry: ClientKnowledgeEntry) => {
    setEditingId(entry.id);
    setEditForm({
      question: entry.question,
      staffAnswer: entry.staffAnswer,
      status: entry.status,
    });
  };

  const closeEdit = () => {
    setEditingId(null);
    setEditForm(EMPTY_FORM);
  };

  const runGenerate = async (
    question: string,
    staffAnswerHtml: string,
    apply: (html: string) => void
  ) => {
    if (!question.trim()) {
      toast.warning('Enter the client question first.');
      return;
    }
    const existingPlain = sanitizeLegalHtml(staffAnswerHtml)
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const plainDraft = await draftClientKnowledgeAnswer(
      webCorpus,
      question,
      existingPlain || undefined
    );
    apply(normalizeLegalContentForEditor(plainDraft));
    toast.success('AI answer added to the editor. Review and save.');
  };

  const saveNew = async (payload: {
    question: string;
    staffAnswerHtml: string;
    status: ClientKnowledgeEntry['status'];
  }) => {
    const question = payload.question.trim();
    if (!question) {
      toast.warning('Enter the client question first.');
      return;
    }

    const now = new Date().toISOString();
    const staffAnswer = sanitizeLegalHtml(payload.staffAnswerHtml);

    setSavingNew(true);
    try {
      await addDoc(collection(db, CLIENT_KNOWLEDGE_COLLECTION), {
        question,
        staffAnswer,
        status: payload.status,
        updatedAt: now,
        createdAt: now,
      });
      setComposer(EMPTY_FORM);
      toast.success('Added to the list.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save.');
    } finally {
      setSavingNew(false);
    }
  };

  const saveEdit = async (payload: {
    question: string;
    staffAnswerHtml: string;
    status: ClientKnowledgeEntry['status'];
  }) => {
    if (!editingId) return;
    const question = payload.question.trim();
    if (!question) {
      toast.warning('Enter the client question first.');
      return;
    }

    const staffAnswer = sanitizeLegalHtml(payload.staffAnswerHtml);
    const updatedAt = new Date().toISOString();

    setSavingEdit(true);
    try {
      await updateDoc(doc(db, CLIENT_KNOWLEDGE_COLLECTION, editingId), {
        question,
        staffAnswer,
        aiDraft: null,
        status: payload.status,
        updatedAt,
      });
      closeEdit();
      toast.success('Updated.');
    } catch (e) {
      console.error(e);
      toast.error('Could not save.');
    } finally {
      setSavingEdit(false);
    }
  };

  const removeEntry = async (id: string) => {
    if (!window.confirm('Delete this entry?')) return;
    setDeletingId(id);
    try {
      await deleteDoc(doc(db, CLIENT_KNOWLEDGE_COLLECTION, id));
      if (editingId === id) closeEdit();
      if (viewEntry?.id === id) setViewEntry(null);
      toast.success('Deleted.');
    } catch (e) {
      console.error(e);
      toast.error('Could not delete.');
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/knowledge')}
        backLabel="Knowledge"
        title="Client Knowledge"
        description="Add client questions and staff answers. Each save appears as a row below."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-vailo-teal bg-vailo-teal/10 px-3 py-1.5 rounded-full">
            <Users size={14} />
            {entries.length} {entries.length === 1 ? 'entry' : 'entries'}
          </span>
        }
      />

      {webEntries.length === 0 && (
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-6">
          Tip: add{' '}
          <a href={adminPath('/knowledge/web')} className="font-semibold underline">
            Web Knowledge
          </a>{' '}
          articles so AI drafts stay aligned with your platform facts.
        </p>
      )}

      <AdminCard className="p-4 sm:p-6 mb-8">
        <h3 className="text-base font-bold text-vailo-dark font-luxury mb-4">New question & answer</h3>
        <ClientKnowledgeForm
          values={composer}
          onChange={(patch) => setComposer((prev) => ({ ...prev, ...patch }))}
          onSave={saveNew}
          onGenerate={async ({ question, staffAnswerHtml }) => {
            setGeneratingNew(true);
            try {
              await runGenerate(question, staffAnswerHtml, (html) =>
                setComposer((prev) => ({ ...prev, staffAnswer: html }))
              );
            } catch (e) {
              console.error(e);
              toast.error('Could not generate answer.');
            } finally {
              setGeneratingNew(false);
            }
          }}
          saving={savingNew}
          generating={generatingNew}
          saveLabel="Save to list"
        />
      </AdminCard>

      {loading ? (
        <div className="flex justify-center py-16 text-gray-500">
          <Loader2 className="animate-spin mr-2" size={22} />
          Loading…
        </div>
      ) : entries.length === 0 ? (
        <AdminCard className="p-10 text-center border-dashed">
          <p className="text-gray-500 text-sm">
            No entries yet. Fill in the form above and click <strong>Save to list</strong>.
          </p>
        </AdminCard>
      ) : (
        <AdminCard className="overflow-hidden p-0">
          <div className="admin-table-wrap border-0">
            <table className="admin-table">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Title</th>
                  <th className="whitespace-nowrap">Last updated</th>
                  <th>Status</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry, index) => (
                  <tr key={entry.id}>
                    <td className="text-gray-400 tabular-nums">{index + 1}</td>
                    <td>
                      <p className="font-semibold text-vailo-dark">{rowTitle(entry.question)}</p>
                    </td>
                    <td className="text-gray-500 text-sm whitespace-nowrap">
                      {formatRowDate(entry.updatedAt || entry.createdAt)}
                    </td>
                    <td>
                      <AdminBadge variant={entry.status === 'ready' ? 'teal' : 'gold'}>
                        {entry.status === 'ready' ? 'Ready' : 'Draft'}
                      </AdminBadge>
                    </td>
                    <td>
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => setViewEntry(entry)}
                          className="p-2 rounded-lg text-gray-500 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="View"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(entry)}
                          className="p-2 rounded-lg text-gray-500 hover:text-vailo-teal hover:bg-vailo-teal/5 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          type="button"
                          onClick={() => void removeEntry(entry.id)}
                          disabled={deletingId === entry.id}
                          className="p-2 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                          title="Delete"
                        >
                          {deletingId === entry.id ? (
                            <Loader2 size={18} className="animate-spin" />
                          ) : (
                            <Trash2 size={18} />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      )}

      {viewEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-vailo-dark/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-knowledge-view-title"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[min(90vh,720px)] flex flex-col">
            <div className="flex items-start justify-between gap-3 p-5 border-b border-gray-100">
              <div className="min-w-0">
                <h3
                  id="client-knowledge-view-title"
                  className="text-lg font-bold text-vailo-dark font-luxury"
                >
                  {rowTitle(viewEntry.question, 120)}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  Updated {formatRowDate(viewEntry.updatedAt || viewEntry.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewEntry(null)}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5 space-y-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Client question
                </p>
                <p className="text-sm text-vailo-dark leading-relaxed whitespace-pre-wrap">
                  {viewEntry.question}
                </p>
              </div>
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">
                  Staff answer
                </p>
                <div
                  className="text-sm text-gray-800 leading-relaxed prose prose-sm max-w-none prose-p:my-2 prose-ul:my-2"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeLegalHtml(viewEntry.staffAnswer) || '<p class="text-gray-400">—</p>',
                  }}
                />
              </div>
            </div>
            <div className="p-4 border-t border-gray-100 flex justify-end gap-2">
              <AdminButton type="button" variant="secondary" onClick={() => setViewEntry(null)}>
                Close
              </AdminButton>
              <AdminButton
                type="button"
                onClick={() => {
                  setViewEntry(null);
                  openEdit(viewEntry);
                }}
              >
                <Pencil size={16} className="mr-1.5" />
                Edit
              </AdminButton>
            </div>
          </div>
        </div>
      )}

      {editingId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-vailo-dark/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-knowledge-edit-title"
        >
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[min(92vh,800px)] flex flex-col">
            <div className="flex items-center justify-between gap-3 p-5 border-b border-gray-100">
              <h3
                id="client-knowledge-edit-title"
                className="text-lg font-bold text-vailo-dark font-luxury"
              >
                Edit entry
              </h3>
              <button
                type="button"
                onClick={closeEdit}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                aria-label="Close"
              >
                <X size={20} />
              </button>
            </div>
            <div className="overflow-y-auto p-5">
              <ClientKnowledgeForm
                values={editForm}
                onChange={(patch) => setEditForm((prev) => ({ ...prev, ...patch }))}
                onSave={saveEdit}
                onGenerate={async ({ question, staffAnswerHtml }) => {
                  setGeneratingEdit(true);
                  try {
                    await runGenerate(question, staffAnswerHtml, (html) =>
                      setEditForm((prev) => ({ ...prev, staffAnswer: html }))
                    );
                  } catch (e) {
                    console.error(e);
                    toast.error('Could not generate answer.');
                  } finally {
                    setGeneratingEdit(false);
                  }
                }}
                saving={savingEdit}
                generating={generatingEdit}
                saveLabel="Save changes"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
