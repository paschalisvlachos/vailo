import { useEffect, useRef, useState } from 'react';
import { Code2, Loader2, Send, Sparkles } from 'lucide-react';
import { adminPath } from '../../../lib/adminRoutes';
import {
  AdminBackHeader,
  AdminButton,
  AdminCard,
  AdminTextarea,
} from '../../../components/admin/AdminPageHeader';
import { useToast } from '../../../context/ToastContext';
import { useAdminSession } from '../../../context/AdminSessionContext';
import { Link } from 'react-router-dom';
import {
  askAppCodeKnowledge,
  fetchAppCodeKnowledgeMeta,
  type AppCodeKnowledgeMeta,
} from '../../../lib/appCodeKnowledge';
import { httpsCallableMessage } from '../../../lib/callableError';

type ChatMessage = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: string[];
};

const SUGGESTIONS = [
  'How does Live like a local load hiking trails?',
  'Where are local trails stored in Firestore?',
  'What admin routes exist for area functionality?',
  'How does guest locale / translation work?',
];

export default function AppCodeKnowledge() {
  const toast = useToast();
  const { authUser, profile } = useAdminSession();
  const authContext =
    profile?.role === 'admin' ? { ownerId: profile.id } : undefined;
  const signInEmail = authUser?.email?.trim() || '';
  const [meta, setMeta] = useState<AppCodeKnowledgeMeta | null>(null);
  const [metaError, setMetaError] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text:
        'Ask anything about how the Vailo app works. Answers are grounded in an indexed snapshot of the codebase (Gemini; default gemini-2.5-flash).',
    },
  ]);
  const [input, setInput] = useState('');
  const [asking, setAsking] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetchAppCodeKnowledgeMeta(authContext)
      .then((m) => {
        setMeta(m);
        setMetaError(null);
      })
      .catch((e) => {
        setMeta({ ready: false, fileCount: 0, builtAt: null });
        setMetaError(httpsCallableMessage(e, 'Could not reach getAppCodeKnowledgeMeta.'));
      });
  }, [profile?.id, profile?.role]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, asking]);

  const sendQuestion = async (text: string) => {
    const q = text.trim();
    if (!q || asking) return;

    setInput('');
    setMessages((prev) => [...prev, { id: `${Date.now()}-u`, role: 'user', text: q }]);
    setAsking(true);

    try {
      const result = await askAppCodeKnowledge(q, authContext);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-a`,
          role: 'assistant',
          text: result.answer,
          sources: result.sources,
        },
      ]);
    } catch (e) {
      console.error(e);
      const msg = e instanceof Error ? e.message : 'Request failed.';
      toast.error(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: `${Date.now()}-err`,
          role: 'assistant',
          text: `Sorry — ${msg}`,
        },
      ]);
    } finally {
      setAsking(false);
    }
  };

  return (
    <div className="admin-page">
      <AdminBackHeader
        backTo={adminPath('/knowledge')}
        backLabel="Knowledge"
        title="App Code Knowledge"
        description="Chat about how Vailo works. Answers use retrieved source files from the repo index — not hand-written articles."
        badge={
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-vailo-teal bg-vailo-teal/10 px-3 py-1.5 rounded-full">
            <Code2 size={14} />
            {meta?.ready
              ? `${meta.fileCount} files · ${meta.model ?? 'gemini-2.5-flash'} · ${meta.builtAt ? new Date(meta.builtAt).toLocaleDateString() : 'indexed'}`
              : 'Index not deployed'}
          </span>
        }
      />

      <AdminCard className="p-4 mb-4 border border-gray-100 bg-vailo-surface-elevated/80 text-sm text-gray-700">
        <p>
          <span className="font-semibold text-vailo-dark">Signed in as:</span>{' '}
          <code className="font-mono text-xs bg-white px-1.5 py-0.5 rounded border border-gray-200">
            {signInEmail || '—'}
          </code>
        </p>
        <p className="mt-1.5">
          <span className="font-semibold text-vailo-dark">Owners CRM profile:</span>{' '}
          {profile ? (
            <>
              {profile.fullName} · <code className="font-mono text-xs">{profile.email}</code> · role{' '}
              <code className="font-mono text-xs">{profile.role}</code>
            </>
          ) : (
            <span className="text-amber-800">
              Not linked — add an owner in{' '}
              <Link to={adminPath('/owners')} className="font-semibold text-vailo-teal underline">
                Owners CRM
              </Link>{' '}
              with the same email and role <code className="font-mono text-xs">admin</code>.
            </span>
          )}
        </p>
      </AdminCard>

      {!meta?.ready && (
        <AdminCard className="p-4 mb-4 border-amber-200 bg-amber-50/80 text-sm text-amber-900 leading-relaxed">
          {metaError ? (
            <>
              <p className="font-semibold mb-1">Could not load App Code Knowledge status</p>
              <p className="mb-2">{metaError}</p>
              {!profile && signInEmail && (
                <p className="text-xs text-amber-800/90 mb-2">
                  Fix: In Firestore → <code className="font-mono">owners</code>, create a document with{' '}
                  <code className="font-mono">email</code> = <code className="font-mono">{signInEmail}</code> and{' '}
                  <code className="font-mono">role</code> = <code className="font-mono">admin</code> (password field is
                  for CRM only; sign-in uses Firebase Auth with the same email).
                </p>
              )}
              <p className="text-xs text-amber-800/90">
                After fixing owners or updating functions, redeploy:{' '}
                <code className="font-mono bg-white/80 px-1 rounded">
                  firebase deploy --only functions:askAppCodeKnowledge,functions:getAppCodeKnowledgeMeta
                </code>
              </p>
            </>
          ) : (
            <>
              Code index not found on the deployed function. From project root run{' '}
              <code className="font-mono text-xs bg-white/80 px-1 rounded">
                node scripts/buildCodeKnowledgeIndex.mjs
              </code>
              , confirm <code className="font-mono text-xs">functions/data/codeKnowledgeIndex.json</code>{' '}
              exists, set <code className="font-mono text-xs">GEMINI_API_KEY</code> in{' '}
              <code className="font-mono text-xs">functions/.env</code>, then redeploy those functions.
            </>
          )}
        </AdminCard>
      )}

      <AdminCard className="flex flex-col h-[min(70vh,720px)] p-0 overflow-hidden">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[92%] sm:max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'bg-vailo-teal text-white'
                    : 'bg-vailo-surface-elevated border border-gray-100 text-gray-800'
                }`}
              >
                {m.role === 'assistant' && m.id !== 'welcome' && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-vailo-teal mb-2">
                    <Sparkles size={12} /> Gemini 2.5 Pro
                  </span>
                )}
                {m.text}
                {m.sources && m.sources.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-gray-200/80">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-1.5">
                      Sources
                    </p>
                    <ul className="text-xs font-mono text-gray-600 space-y-0.5 max-h-28 overflow-y-auto">
                      {m.sources.map((s) => (
                        <li key={s}>{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          ))}
          {asking && (
            <div className="flex items-center gap-2 text-sm text-gray-500 pl-1">
              <Loader2 size={16} className="animate-spin text-vailo-teal" />
              Searching code and drafting answer…
            </div>
          )}
        </div>

        <div className="border-t border-gray-100 p-4 bg-white/80">
          <div className="flex flex-wrap gap-2 mb-3">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                disabled={asking}
                onClick={() => void sendQuestion(s)}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-200 text-gray-600 hover:border-vailo-teal/40 hover:text-vailo-teal transition-colors disabled:opacity-50"
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex gap-2 items-end">
            <AdminTextarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={2}
              placeholder="e.g. How is the guest portal route structured?"
              className="flex-1 min-h-[44px]"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  void sendQuestion(input);
                }
              }}
            />
            <AdminButton
              type="button"
              onClick={() => void sendQuestion(input)}
              disabled={asking || !input.trim()}
              className="shrink-0 min-h-[44px]"
            >
              {asking ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
            </AdminButton>
          </div>
          <p className="text-[11px] text-gray-400 mt-2">
            Vailo app questions only. Re-index after major releases:{' '}
            <span className="font-mono">node scripts/buildCodeKnowledgeIndex.mjs</span>
          </p>
        </div>
      </AdminCard>
    </div>
  );
}
