import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  type DocumentData,
} from 'firebase/firestore';
import { Loader2, Mail, Paperclip, Plus, RefreshCw, Reply, Send, X } from 'lucide-react';
import { db } from '../../lib/firebase';
import { useToast } from '../../context/ToastContext';
import { httpsCallableMessage } from '../../lib/callableError';
import {
  formatInboxDate,
  getAdminInboxAttachmentCallable,
  htmlToPlainText,
  inboxReplyAddress,
  markAdminInboxReadCallable,
  sendAdminInboxEmailCallable,
  syncResendInboxCallable,
  type AdminInboxAttachment,
  type AdminInboxMessage,
} from '../../lib/adminInbox';
import RichTextEditor from '../../components/admin/RichTextEditor';

function mapDoc(id: string, data: DocumentData): AdminInboxMessage {
  return {
    id,
    direction: data.direction,
    from: data.from || '',
    to: Array.isArray(data.to) ? data.to : [],
    subject: data.subject || '(No subject)',
    html: data.html,
    text: data.text,
    replyTo: data.replyTo,
    messageId: data.messageId,
    resendEmailId: data.resendEmailId,
    attachments: data.attachments || [],
    readAt: data.readAt,
    createdAt: data.createdAt,
    source: data.source,
    contactFormMeta: data.contactFormMeta,
  };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export default function MailboxPage() {
  const toast = useToast();
  const [messages, setMessages] = useState<AdminInboxMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeReplyToId, setComposeReplyToId] = useState<string | undefined>();
  const [composeFiles, setComposeFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);

  const selected = useMemo(
    () => messages.find((m) => m.id === selectedId) ?? null,
    [messages, selectedId]
  );

  const runSync = useCallback(async () => {
    setSyncing(true);
    try {
      const { synced } = await syncResendInboxCallable();
      toast.success(synced > 0 ? `Synced ${synced} email(s) from Resend.` : 'Mailbox is up to date.');
    } catch (err) {
      console.error(err);
      toast.error(
        httpsCallableMessage(
          err,
          'Could not sync from Resend. Deploy Cloud Functions (syncResendInbox) and ensure RESEND_API_KEY is set.'
        )
      );
    } finally {
      setSyncing(false);
    }
  }, [toast]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setSyncing(true);
      try {
        const { synced } = await syncResendInboxCallable();
        if (!cancelled && synced > 0) {
          toast.success(`Synced ${synced} email(s) from Resend.`);
        }
      } catch (err) {
        if (!cancelled) {
          console.error(err);
          toast.error(
            httpsCallableMessage(
              err,
              'Could not sync from Resend. Deploy Cloud Functions (syncResendInbox) and ensure RESEND_API_KEY is set.'
            )
          );
        }
      } finally {
        if (!cancelled) setSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [toast]);

  useEffect(() => {
    const q = query(collection(db, 'adminInboxMessages'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => mapDoc(d.id, d.data()));
        setMessages(rows);
        setLoading(false);
        if (!selectedId && rows.length > 0) {
          setSelectedId(rows[0].id);
        }
      },
      (err) => {
        console.error(err);
        setLoading(false);
        toast.error('Could not load mailbox.');
      }
    );
    return () => unsub();
  }, [toast]);

  const openMessage = async (message: AdminInboxMessage) => {
    setSelectedId(message.id);
    if (!message.readAt) {
      try {
        await markAdminInboxReadCallable(message.id);
      } catch (err) {
        console.error(err);
      }
    }
  };

  const openCompose = (replyTo?: AdminInboxMessage) => {
    if (replyTo) {
      setComposeTo(inboxReplyAddress(replyTo));
      setComposeSubject(
        replyTo.subject.startsWith('Re:') ? replyTo.subject : `Re: ${replyTo.subject}`
      );
      setComposeBody('');
      setComposeReplyToId(replyTo.id);
    } else {
      setComposeTo('');
      setComposeSubject('');
      setComposeBody('');
      setComposeReplyToId(undefined);
    }
    setComposeFiles([]);
    setComposeOpen(true);
  };

  const sendCompose = async () => {
    const to = composeTo
      .split(/[,;]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!to.length) {
      toast.warning('Enter a recipient email.');
      return;
    }
    if (!composeSubject.trim()) {
      toast.warning('Enter a subject.');
      return;
    }
    if (!composeBody.trim() || !htmlToPlainText(composeBody)) {
      toast.warning('Enter a message.');
      return;
    }

    setSending(true);
    try {
      const attachments = await Promise.all(
        composeFiles.map(async (file) => ({
          filename: file.name,
          contentBase64: await fileToBase64(file),
        }))
      );
      const html = composeBody.trim();
      await sendAdminInboxEmailCallable({
        to,
        subject: composeSubject.trim(),
        html,
        text: htmlToPlainText(html),
        replyToMessageDocId: composeReplyToId,
        attachments,
      });
      toast.success('Email sent.');
      setComposeOpen(false);
    } catch (err) {
      console.error(err);
      toast.error('Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  const downloadAttachment = async (message: AdminInboxMessage, att: AdminInboxAttachment) => {
    if (!message.resendEmailId || !att.resendAttachmentId) {
      toast.warning('Attachment not available for download.');
      return;
    }
    try {
      const file = await getAdminInboxAttachmentCallable(message.resendEmailId, att.resendAttachmentId);
      const binary = atob(file.contentBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      const blob = new Blob([bytes], { type: file.contentType });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
      toast.error('Could not download attachment.');
    }
  };

  return (
    <div className="admin-page max-w-6xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="text-vailo-teal" size={24} />
            Mailbox
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Platform mail for <strong>info@vailo.app</strong> — powered by{' '}
            <a
              href="https://www.resend.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-vailo-teal font-medium hover:underline"
            >
              Resend
            </a>
            .
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => openCompose()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-vailo-teal text-white text-sm font-semibold hover:bg-vailo-dark transition-colors"
          >
            <Plus size={16} />
            Compose
          </button>
          <button
            type="button"
            onClick={runSync}
            disabled={syncing}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Sync
          </button>
          <a
            href="https://www.resend.com"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
            title="Email delivery by Resend"
          >
            <img
              src="https://resend.com/static/brand/resend-icon-black.svg"
              alt="Resend"
              className="h-5 w-5"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
              }}
            />
            <span className="text-sm font-semibold text-gray-800">Resend</span>
          </a>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,320px)_1fr] gap-4 min-h-[520px]">
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100 text-xs font-bold uppercase tracking-wider text-gray-400">
            Messages
          </div>
          <div className="flex-1 overflow-y-auto admin-scroll-y max-h-[560px]">
            {loading ? (
              <div className="p-8 flex justify-center text-gray-400">
                <Loader2 className="animate-spin" size={22} />
              </div>
            ) : messages.length === 0 ? (
              <p className="p-6 text-sm text-gray-500 text-center">No messages yet.</p>
            ) : (
              <ul>
                {messages.map((m) => {
                  const unread = !m.readAt;
                  const active = m.id === selectedId;
                  return (
                    <li key={m.id}>
                      <button
                        type="button"
                        onClick={() => openMessage(m)}
                        className={`w-full text-left px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors ${
                          active ? 'bg-vailo-teal/5' : ''
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          {unread && (
                            <span className="mt-1.5 h-2 w-2 rounded-full bg-vailo-gold shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className={`text-sm truncate ${unread ? 'font-bold text-gray-900' : 'font-medium text-gray-700'}`}>
                              {m.subject}
                            </p>
                            <p className="text-xs text-gray-500 truncate mt-0.5">
                              {m.direction === 'outbound' ? `To ${m.to.join(', ')}` : m.from}
                            </p>
                            <p className="text-[11px] text-gray-400 mt-1">{formatInboxDate(m.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden flex flex-col min-h-[400px]">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm p-8">
              Select a message
            </div>
          ) : (
            <>
              <div className="px-5 py-4 border-b border-gray-100 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900">{selected.subject}</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    <span className="font-medium text-gray-700">From:</span> {selected.from}
                  </p>
                  <p className="text-sm text-gray-500">
                    <span className="font-medium text-gray-700">To:</span> {selected.to.join(', ') || '—'}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">{formatInboxDate(selected.createdAt)}</p>
                </div>
                {selected.direction !== 'outbound' && (
                  <button
                    type="button"
                    onClick={() => openCompose(selected)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-vailo-teal/20 text-vailo-teal text-sm font-medium hover:bg-vailo-teal/5"
                  >
                    <Reply size={16} />
                    Reply
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-5 py-4">
                {selected.html ? (
                  <div
                    className="prose prose-sm max-w-none text-gray-800"
                    dangerouslySetInnerHTML={{ __html: selected.html }}
                  />
                ) : (
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                    {selected.text || '(No content)'}
                  </pre>
                )}
                {selected.attachments && selected.attachments.length > 0 && (
                  <div className="mt-6 pt-4 border-t border-gray-100">
                    <p className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2">Attachments</p>
                    <ul className="space-y-2">
                      {selected.attachments.map((att) => (
                        <li key={att.id || att.filename}>
                          <button
                            type="button"
                            onClick={() => downloadAttachment(selected, att)}
                            className="inline-flex items-center gap-2 text-sm text-vailo-teal hover:underline"
                          >
                            <Paperclip size={14} />
                            {att.filename}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {composeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">{composeReplyToId ? 'Reply' : 'Compose'}</h3>
              <button type="button" onClick={() => setComposeOpen(false)} className="p-2 text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3">
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">To</span>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  className="mt-1 w-full admin-input border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  placeholder="guest@example.com"
                />
              </label>
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Subject</span>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="mt-1 w-full admin-input border border-gray-200 rounded-lg px-3 py-2 text-sm"
                />
              </label>
              <div className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Message</span>
                <div className="mt-1">
                  <RichTextEditor
                    value={composeBody}
                    onChange={setComposeBody}
                    placeholder="Write your message…"
                    minHeight={180}
                  />
                </div>
              </div>
              <label className="block">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Attachments</span>
                <input
                  type="file"
                  multiple
                  className="mt-1 block w-full text-sm text-gray-600"
                  onChange={(e) => setComposeFiles(Array.from(e.target.files || []))}
                />
              </label>
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setComposeOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={sendCompose}
                disabled={sending}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-vailo-teal text-white text-sm font-semibold hover:bg-vailo-dark disabled:opacity-50"
              >
                {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                Send
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
