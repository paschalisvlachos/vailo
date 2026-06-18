import { httpsCallable } from 'firebase/functions';
import { cloudFunctions } from './firebase';

function call<T>(name: string) {
  return httpsCallable<Record<string, unknown>, T>(cloudFunctions, name);
}

export type AdminInboxAttachment = {
  id?: string;
  filename: string;
  contentType?: string;
  size?: number | null;
  resendAttachmentId?: string;
  outbound?: boolean;
};

export type AdminInboxMessage = {
  id: string;
  direction: 'inbound' | 'outbound' | 'contact_form';
  from: string;
  to: string[];
  subject: string;
  html?: string | null;
  text?: string | null;
  replyTo?: string | null;
  messageId?: string | null;
  resendEmailId?: string | null;
  attachments?: AdminInboxAttachment[];
  readAt?: { seconds: number } | null;
  createdAt?: { seconds: number } | null;
  source?: string;
  contactFormMeta?: {
    name?: string;
    company?: string | null;
    role?: string | null;
    country?: string | null;
    phone?: string | null;
  };
};

export async function syncResendInboxCallable(): Promise<{ synced: number }> {
  const res = await call<{ ok: boolean; synced: number }>('syncResendInbox')({});
  return { synced: res.data.synced ?? 0 };
}

export async function markAdminInboxReadCallable(messageId: string): Promise<void> {
  await call<{ ok: boolean }>('markAdminInboxRead')({ messageId });
}

export async function sendAdminInboxEmailCallable(input: {
  to: string[];
  subject: string;
  text?: string;
  html?: string;
  replyToMessageDocId?: string;
  attachments?: { filename: string; contentBase64: string }[];
}): Promise<{ id: string }> {
  const res = await call<{ ok: boolean; id: string }>('sendAdminInboxEmail')(input);
  return { id: res.data.id };
}

export function htmlToPlainText(html: string): string {
  if (typeof document === 'undefined') return html.replace(/<[^>]+>/g, ' ').trim();
  const div = document.createElement('div');
  div.innerHTML = html;
  return (div.textContent || div.innerText || '').replace(/\s+/g, ' ').trim();
}

export async function getAdminInboxAttachmentCallable(
  resendEmailId: string,
  attachmentId: string
): Promise<{ filename: string; contentType: string; contentBase64: string }> {
  const res = await call<{
    filename: string;
    contentType: string;
    contentBase64: string;
  }>('getAdminInboxAttachment')({ resendEmailId, attachmentId });
  return res.data;
}

export function inboxReplyAddress(message: AdminInboxMessage): string {
  if (message.direction === 'contact_form') {
    return message.replyTo || message.from || '';
  }
  if (message.direction === 'inbound') {
    return message.from || message.replyTo || '';
  }
  return message.to?.[0] || '';
}

export function formatInboxDate(ts?: { seconds: number } | null): string {
  if (!ts?.seconds) return '';
  return new Date(ts.seconds * 1000).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

export function isMailboxInboxMessage(message: AdminInboxMessage): boolean {
  return message.direction === 'inbound' || message.direction === 'contact_form';
}

export function isMailboxSentMessage(message: AdminInboxMessage): boolean {
  return message.direction === 'outbound';
}
