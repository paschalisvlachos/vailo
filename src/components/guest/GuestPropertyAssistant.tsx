import { useEffect, useMemo, useRef, useState } from 'react';
import { getGenerativeModel, type Content, type Part } from 'firebase/ai';
import {
  ArrowLeft,
  AlertTriangle,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Send,
  ShieldCheck,
  Sparkles,
  X,
  Bot,
} from 'lucide-react';
import { ai } from '../../lib/firebase';
import { openExternalUrl } from '../../lib/geocoding';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { buildPropertyAssistantSystemPrompt } from '../../lib/guestPropertyAssistantPrompt';
import {
  buildApplianceReferenceUserBlock,
  fetchGuestApplianceGuide,
} from '../../lib/guestApplianceGuide';
import {
  hostNotesForDevice,
  isApplianceOperationQuestion,
  matchDeviceForGuestQuestion,
} from '../../lib/houseGuideAssistantContext';
import { readGuestPortalSession } from '../../lib/guestAccess';
import GuestLanguageMenu from './GuestLanguageMenu';

const CONSENT_KEY = 'vailo:assistant-consent:v1';
const MAX_USER_INPUT = 1000;
const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4 MB

type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  imageDataUrl?: string;
  /** Show report / WhatsApp actions when the model could not answer from the guide. */
  showEscalation?: boolean;
};

type Props = {
  propertyId: string | null;
  typeId: string | null;
  property: any;
  propertyType: any;
  guide: any;
  onClose: () => void;
  onOpenPrivacy: () => void;
  onOpenTerms: () => void;
  onOpenReport: () => void;
  whatsappHref?: string | null;
};

/** True when the reply indicates the guide has no answer — guest should escalate. */
function assistantReplyNeedsEscalation(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (!t) return true;

  const patterns = [
    /not (in|found in) (the )?(house )?guide/,
    /don'?t have (that|this|any|specific|enough)/,
    /do not have (that|this|any|specific)/,
    /no information (about|on|for)/,
    /not (specifically )?mentioned in/,
    /isn'?t (in|listed in) (the )?guide/,
    /contact (your )?host/,
    /reach out to (your )?host/,
    /report (an )?issue/,
    /couldn'?t generate/,
    /try rephrasing/,
    /outside (of )?my (scope|knowledge|abilities)/,
    /cannot (help|answer|assist|find)/,
    /can'?t (help|answer|assist|find)/,
    /unable to (find|answer|help|locate)/,
    /i'?m not sure/,
    /i do not know/,
    /i don'?t know/,
    /not available in/,
    /wasn'?t provided/,
    /haven'?t been given/,
    /only share information/,
    /please (use|tap|click).{0,40}report/i,
  ];

  return patterns.some((p) => p.test(t));
}

function EscalationHelp({
  onOpenReport,
  whatsappHref,
}: {
  onOpenReport: () => void;
  whatsappHref?: string | null;
}) {
  return (
    <div className="mt-3 pt-3 border-t border-[#0B4F5C]/10">
      <p className="text-sm text-gray-600 leading-relaxed mb-3">
        I couldn&apos;t find that in your house guide. Please{' '}
        <span className="font-semibold text-[#051F26]">report the issue</span> so your host can
        help
        {whatsappHref
          ? ', or contact them on WhatsApp for an immediate reply.'
          : '.'}
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onOpenReport}
          className="guest-btn-action w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#0B4F5C] text-white hover:bg-[#083a43] transition-colors"
        >
          <AlertTriangle size={14} />
          Report issue
        </button>
        {whatsappHref ? (
          <button
            type="button"
            onClick={() => openExternalUrl(whatsappHref)}
            className="guest-btn-action w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#25D366] text-white hover:bg-[#20bd5a] transition-colors"
          >
            <MessageCircle size={14} />
            WhatsApp host
          </button>
        ) : null}
      </div>
    </div>
  );
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function stripDataUrlPrefix(dataUrl: string): { mimeType: string; data: string } | null {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

export default function GuestPropertyAssistant({
  propertyId,
  typeId,
  property,
  propertyType,
  guide,
  onClose,
  onOpenPrivacy,
  onOpenTerms,
  onOpenReport,
  whatsappHref,
}: Props) {
  const { locale, setLocale, t, localeOptions } = useGuestLocale();

  const suggestedPrompts = useMemo(
    () => [
      t('assistantSuggestedWifi'),
      t('assistantSuggestedCheckout'),
      t('assistantSuggestedAc'),
      t('assistantSuggestedParking'),
      t('assistantSuggestedWasher'),
    ],
    [t]
  );

  const [hasConsented, setHasConsented] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return localStorage.getItem(CONSENT_KEY) === 'true';
    } catch {
      return false;
    }
  });
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [pendingImage, setPendingImage] = useState<{ dataUrl: string; name: string } | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { track } = useGuestAnalytics();

  const propertyName = property?.propertyName || 'your property';
  const propertyTypeName = propertyType?.propertyTypeName || 'your unit';

  const welcomeText = useMemo(
    () =>
      `${t('welcomeTo')} ${propertyName} — ${propertyTypeName}! ${t('assistantWelcomeBody')}`,
    [propertyName, propertyTypeName, t]
  );

  const systemPrompt = useMemo(
    () =>
      buildPropertyAssistantSystemPrompt(
        property as Record<string, unknown> | null,
        propertyType as Record<string, unknown> | null,
        guide as Record<string, unknown> | null,
        locale
      ),
    [property, propertyType, guide, locale]
  );

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, isSending]);

  const acceptConsent = () => {
    try {
      localStorage.setItem(CONSENT_KEY, 'true');
    } catch {
      // Ignore storage write errors (e.g. private mode) and proceed for this session
    }
    setHasConsented(true);
  };

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please pick an image file.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setError('Images must be under 4 MB.');
      return;
    }

    try {
      const dataUrl = await readFileAsDataUrl(file);
      setPendingImage({ dataUrl, name: file.name });
      setError(null);
    } catch (err) {
      console.error('image read failed:', err);
      setError('Could not read that image. Please try another.');
    }
  };

  const buildHistoryParts = (history: ChatMessage[]): Content[] =>
    history.map((msg) => ({
      role: msg.role === 'model' ? ('model' as const) : ('user' as const),
      parts: [{ text: msg.text || '' }] as Part[],
    }));

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed && !pendingImage) return;
    if (isSending) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
      imageDataUrl: pendingImage?.dataUrl,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    track('assistant_user_message', {
      text: trimmed || '(image)',
    });
    setInput('');
    const pendingImageSnapshot = pendingImage;
    setPendingImage(null);
    setIsSending(true);

    try {
      const model = getGenerativeModel(ai, {
        model: 'gemini-2.5-flash',
        systemInstruction: { role: 'system', parts: [{ text: systemPrompt }] },
        generationConfig: {
          temperature: 0.55,
        },
      });

      const chat = model.startChat({
        history: buildHistoryParts(messages),
      });

      const parts: Part[] = [];
      if (pendingImageSnapshot?.dataUrl) {
        const inline = stripDataUrlPrefix(pendingImageSnapshot.dataUrl);
        if (inline) {
          parts.push({ inlineData: { mimeType: inline.mimeType, data: inline.data } } as Part);
        }
      }
      let userText =
        trimmed || 'Please review this image and help me with my property.';

      if (trimmed && propertyId && typeId) {
        const guideRecord =
          guide && typeof guide === 'object'
            ? (guide as Record<string, unknown>)
            : null;
        const device =
          guideRecord && isApplianceOperationQuestion(trimmed)
            ? matchDeviceForGuestQuestion(trimmed, guideRecord)
            : null;

        if (device && (device.brand || device.model)) {
          const session = readGuestPortalSession();
          if (
            session?.sessionId &&
            session.propertyId === propertyId &&
            session.typeId === typeId
          ) {
            const lookup = await fetchGuestApplianceGuide({
              propertyId,
              typeId,
              sessionId: session.sessionId,
              question: trimmed,
              locale,
              brand: device.brand,
              model: device.model,
              device: device.device,
              room: device.room,
              hostNotes: hostNotesForDevice(guideRecord, device),
            });
            if (lookup?.guideText) {
              userText = buildApplianceReferenceUserBlock(
                trimmed,
                device,
                lookup.guideText
              );
            }
          }
        }
      }

      parts.push({ text: userText } as Part);

      const result = await chat.sendMessage(parts);
      const responseText = (result.response.text() || '').trim();
      const showEscalation = assistantReplyNeedsEscalation(responseText);

      const replyText =
        responseText || "I don't have that information in your house guide yet.";
      track('assistant_reply', { text: replyText });
      setMessages((prev) => [
        ...prev,
        {
          id: `m-${Date.now()}`,
          role: 'model',
          text: replyText,
          showEscalation: showEscalation || !responseText,
        },
      ]);
    } catch (err) {
      console.error('assistant error:', err);
      setError("Something went wrong. Please try again in a moment.");
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
      setPendingImage(pendingImageSnapshot);
    } finally {
      setIsSending(false);
    }
  };

  const handleSuggestionClick = (text: string) => {
    if (isSending) return;
    setInput(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="guest-mobile fixed inset-0 z-50 flex flex-col bg-gradient-to-b from-[#f4f7f6] to-[#eef2f1] md:relative md:h-[800px] md:rounded-3xl md:overflow-hidden md:shadow-2xl md:border md:border-[#0B4F5C]/5">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,500;0,600;1,400;1,500&display=swap');
        .font-luxury { font-family: 'Lora', serif; }
      `}</style>

      <header className="relative shrink-0 overflow-hidden border-b border-[#0B4F5C]/8">
        <div className="absolute inset-0 bg-gradient-to-br from-[#EAF2F2] via-white to-[#FDF9F3]" />
        <div className="absolute -top-12 -right-8 w-44 h-44 bg-[#C5A059]/14 blur-3xl rounded-full pointer-events-none" />
        <div className="absolute -bottom-10 -left-10 w-36 h-36 bg-[#0B4F5C]/10 blur-3xl rounded-full pointer-events-none" />

        <div className="relative px-4 py-3 flex items-center gap-2.5">
          <button
            onClick={onClose}
            className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-white/90 border border-[#0B4F5C]/10 text-[#0B4F5C] shadow-[0_2px_12px_rgba(11,79,92,0.08)] hover:border-[#C5A059]/35 transition-all"
            aria-label="Close assistant"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <p className="guest-eyebrow">
              24/7 Assistant
            </p>
            <h2 className="font-luxury text-lg sm:text-xl leading-tight text-[#051F26] font-medium mt-0.5 truncate">
              AI Vacation Assistant
            </h2>
          </div>

          <GuestLanguageMenu locale={locale} onChange={setLocale} options={localeOptions} />
          <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#C5A059] to-[#a88648] flex items-center justify-center shadow-lg shrink-0">
            <Bot size={18} className="text-white" />
          </div>
        </div>
      </header>

      {!hasConsented ? (
        <div className="flex-1 overflow-y-auto px-5 py-6">
          <div className="max-w-md mx-auto">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#0B4F5C]/8 text-[#0B4F5C] mb-4">
              <ShieldCheck size={22} />
            </div>
            <h3 className="font-luxury text-xl text-[#051F26] font-medium mb-2">
              Before we start
            </h3>
            <p className="text-base text-gray-600 leading-relaxed">
              This is an AI assistant. Information is provided for convenience and may not always
              be accurate. No confidential data is stored. For emergencies, please call your host
              or local emergency services directly.
            </p>

            <div className="mt-4 bg-white border border-gray-100 rounded-2xl p-4 text-base text-gray-600 leading-relaxed">
              <p className="font-semibold text-[#051F26] mb-1.5">Scope</p>
              <p>
                Replies are limited to questions about your stay at{' '}
                <span className="font-semibold text-[#0B4F5C]">{propertyName}</span> —{' '}
                <span className="font-semibold text-[#0B4F5C]">{propertyTypeName}</span>. Off-topic
                or sensitive personal questions will be politely declined.
              </p>
            </div>

            <p className="text-sm text-gray-500 mt-5 leading-relaxed">
              By continuing you accept our{' '}
              <button
                type="button"
                onClick={onOpenPrivacy}
                className="text-[#0B4F5C] font-semibold underline underline-offset-2 hover:text-[#C5A059]"
              >
                Privacy Policy
              </button>{' '}
              and{' '}
              <button
                type="button"
                onClick={onOpenTerms}
                className="text-[#0B4F5C] font-semibold underline underline-offset-2 hover:text-[#C5A059]"
              >
                Terms of Use
              </button>
              .
            </p>

            <div className="flex gap-3 mt-6">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-4 min-h-[48px] rounded-xl border border-gray-200 text-base font-semibold text-gray-600 bg-white hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={acceptConsent}
                className="flex-1 py-4 min-h-[48px] rounded-xl bg-[#0B4F5C] text-[#C5A059] text-base font-bold hover:bg-[#083a43] transition-colors"
              >
                Accept &amp; Continue
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 md:p-5 [scrollbar-width:thin] flex flex-col gap-3">
            <div className="bg-white border border-[#0B4F5C]/8 rounded-2xl p-4 shadow-[0_8px_24px_rgba(11,79,92,0.06)]">
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-full bg-gradient-to-br from-[#0B4F5C] to-[#083a43] flex items-center justify-center shrink-0">
                  <Sparkles size={15} className="text-[#C5A059]" />
                </div>
                <p className="text-base text-gray-700 leading-relaxed whitespace-pre-line">
                  {welcomeText}
                </p>
              </div>

              {messages.length === 0 && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <p className="guest-eyebrow text-gray-400 mb-2">
                    Try asking
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {suggestedPrompts.map((prompt) => (
                      <button
                        key={prompt}
                        type="button"
                        onClick={() => handleSuggestionClick(prompt)}
                        className="guest-pill px-4 py-2.5 rounded-full text-sm font-medium text-[#0B4F5C] bg-[#0B4F5C]/5 border border-[#0B4F5C]/10 hover:bg-[#C5A059]/10 hover:border-[#C5A059]/30 transition-colors"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {messages.map((msg) =>
              msg.role === 'user' ? (
                <div key={msg.id} className="flex justify-end">
                  <div className="max-w-[85%] bg-[#0B4F5C] text-white rounded-2xl rounded-tr-md px-4 py-3 shadow-sm">
                    {msg.imageDataUrl && (
                      <img
                        src={msg.imageDataUrl}
                        alt=""
                        className="rounded-xl mb-2 max-h-48 w-auto object-cover"
                      />
                    )}
                    {msg.text && (
                      <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    )}
                  </div>
                </div>
              ) : (
                <div key={msg.id} className="flex items-start gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#C5A059] to-[#a88648] flex items-center justify-center shrink-0 mt-0.5">
                    <Bot size={14} className="text-white" />
                  </div>
                  <div className="max-w-[85%] bg-white border border-gray-100 text-gray-800 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm">
                    <p className="text-base leading-relaxed whitespace-pre-wrap">{msg.text}</p>
                    {(msg.showEscalation ?? assistantReplyNeedsEscalation(msg.text)) && (
                      <EscalationHelp
                        onOpenReport={onOpenReport}
                        whatsappHref={whatsappHref}
                      />
                    )}
                  </div>
                </div>
              )
            )}

            {isSending && (
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-[#C5A059] to-[#a88648] flex items-center justify-center shrink-0 mt-0.5">
                  <Bot size={14} className="text-white" />
                </div>
                <div className="bg-white border border-gray-100 rounded-2xl rounded-tl-md px-4 py-3 shadow-sm flex items-center gap-2 text-base text-gray-500">
                  <Loader2 size={14} className="animate-spin text-[#0B4F5C]" />
                  Thinking…
                </div>
              </div>
            )}
          </div>

          <div className="shrink-0 border-t border-gray-100 bg-white/95 backdrop-blur px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {error && (
              <p className="text-sm text-red-600 mb-2 px-1" role="alert">
                {error}
              </p>
            )}

            {pendingImage && (
              <div className="flex items-center gap-2 mb-2 bg-[#0B4F5C]/5 border border-[#0B4F5C]/10 rounded-xl px-2.5 py-2">
                <img
                  src={pendingImage.dataUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover shrink-0"
                />
                <span className="flex-1 text-xs text-gray-600 truncate">{pendingImage.name}</span>
                <button
                  type="button"
                  onClick={() => setPendingImage(null)}
                  className="p-1.5 rounded-lg text-gray-500 hover:text-[#0B4F5C] hover:bg-white"
                  aria-label="Remove image"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={handleAttachClick}
                disabled={isSending}
                className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full border border-gray-200 bg-white text-[#0B4F5C] hover:border-[#C5A059]/40 hover:text-[#C5A059] disabled:opacity-50 transition-colors shrink-0"
                aria-label="Attach image"
              >
                <ImageIcon size={20} />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFilePick}
                className="hidden"
              />

              <div className="flex-1 bg-white border border-gray-200 rounded-2xl px-3 py-2 focus-within:border-[#0B4F5C]/40 focus-within:ring-2 focus-within:ring-[#0B4F5C]/10 transition-shadow">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value.slice(0, MAX_USER_INPUT))}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask anything about your stay…"
                  rows={2}
                  disabled={isSending}
                  className="w-full text-base text-gray-800 placeholder:text-gray-400 outline-none resize-none bg-transparent max-h-32 leading-relaxed"
                />
              </div>

              <button
                type="button"
                onClick={sendMessage}
                disabled={isSending || (!input.trim() && !pendingImage)}
                className="h-11 w-11 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[#0B4F5C] text-[#C5A059] shadow-[0_4px_16px_rgba(11,79,92,0.3)] hover:bg-[#083a43] disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label="Send"
              >
                {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>

            <p className="text-xs text-gray-400 text-center mt-2 leading-relaxed px-3">
              You are chatting with an AI. Replies are limited to this property. Do not share
              sensitive personal data.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
