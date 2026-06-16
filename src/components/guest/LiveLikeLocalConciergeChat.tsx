import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Loader2, Send } from 'lucide-react';
import VailoMark from './VailoMark';
import { useGuestAnalytics } from '../../context/GuestAnalyticsContext';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { truncateAnalyticsText } from '../../lib/guestAnalytics';
import {
  buildConciergeOpeningMessage,
  sendConciergeChatMessage,
  type ConciergeChatContext,
  type ConciergeChatMessage,
} from '../../lib/liveLikeLocalConciergeChat';

const AI_EXPERT_BTN_PRIMARY =
  'bg-gradient-to-br from-vailo-gold to-[#a88648] text-white font-semibold shadow-[0_4px_16px_rgba(197,160,89,0.4)] hover:from-[#d4ad65] hover:to-vailo-gold hover:shadow-[0_6px_22px_rgba(197,160,89,0.5)] disabled:opacity-40 transition-all';

const CHAT_TEXTAREA_MAX_PX = 128;

type Props = {
  locale: string;
  context: ConciergeChatContext;
};

export default function LiveLikeLocalConciergeChat({ locale, context }: Props) {
  const { track } = useGuestAnalytics();
  const { t } = useGuestLocale();

  const [messages, setMessages] = useState<ConciergeChatMessage[]>(() => [
    {
      id: 'opening',
      role: 'model',
      text: buildConciergeOpeningMessage(locale, context),
    },
  ]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const next = Math.min(el.scrollHeight, CHAT_TEXTAREA_MAX_PX);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > CHAT_TEXTAREA_MAX_PX ? 'auto' : 'hidden';
  }, []);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [input, resizeTextarea]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, isSending]);

  const sendMessage = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;

    setError(null);
    const userMessage: ConciergeChatMessage = {
      id: `u-${Date.now()}`,
      role: 'user',
      text: trimmed,
    };
    const priorHistory = messages;
    setMessages((prev) => [...prev, userMessage]);
    track('ai_expert_user_message', { text: truncateAnalyticsText(trimmed) });
    setInput('');
    setIsSending(true);

    try {
      const reply = await sendConciergeChatMessage({
        locale,
        context,
        history: priorHistory,
        userMessage: trimmed,
      });
      track('ai_expert_reply', { text: truncateAnalyticsText(reply, 1000) });
      setMessages((prev) => [
        ...prev,
        { id: `m-${Date.now()}`, role: 'model', text: reply },
      ]);
    } catch (err) {
      console.error('concierge chat error:', err);
      setError(t('aiExpertErrorConnect'));
      setMessages((prev) => prev.slice(0, -1));
      setInput(trimmed);
    } finally {
      setIsSending(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendMessage();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    void sendMessage();
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden ai-expert-scroll px-4 md:px-6 py-4"
      >
        {messages.map((msg) =>
          msg.role === 'user' ? (
            <div key={msg.id} className="flex justify-end mb-5 animate-in fade-in duration-300">
              <div className="max-w-[85%] bg-gradient-to-br from-vailo-gold/30 to-vailo-gold/15 text-white px-4 py-3 rounded-2xl rounded-br-md border border-vailo-gold/35 shadow-[0_2px_12px_rgba(197,160,89,0.18)] text-base leading-relaxed whitespace-pre-wrap">
                {msg.text}
              </div>
            </div>
          ) : (
            <div key={msg.id} className="mb-5 flex items-end gap-2.5 animate-in fade-in duration-300">
              <div className="h-8 w-8 rounded-full bg-gradient-to-br from-vailo-gold/35 to-vailo-gold/10 border border-vailo-gold/30 flex items-center justify-center shrink-0 shadow-inner p-1">
                <VailoMark alt="" className="w-full h-full object-contain" />
              </div>
              <div className="max-w-[85%] bg-white/[0.16] border border-white/20 text-white px-4 py-3 rounded-2xl rounded-bl-md shadow-sm text-base leading-relaxed whitespace-pre-wrap">
                {msg.text}
              </div>
            </div>
          )
        )}

        {isSending && (
          <div className="mb-5 flex items-end gap-2.5">
            <div className="h-8 w-8 rounded-full bg-gradient-to-br from-vailo-gold/35 to-vailo-gold/10 border border-vailo-gold/30 flex items-center justify-center shrink-0 p-1">
              <VailoMark alt="" className="w-full h-full object-contain" />
            </div>
            <div className="bg-white/[0.16] border border-white/20 text-white/70 px-4 py-3 rounded-2xl rounded-bl-md text-sm flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-vailo-gold" />
              {t('aiExpertConciergeThinking')}
            </div>
          </div>
        )}

        {error && (
          <p className="text-sm text-red-200/90 text-center mb-4 px-2">{error}</p>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="bg-vailo-teal-hover/95 backdrop-blur-sm p-3 md:p-4 shrink-0 border-t border-white/10">
        <form onSubmit={handleSubmit} className="flex gap-2 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onInput={resizeTextarea}
            onKeyDown={handleKeyDown}
            disabled={isSending}
            rows={1}
            placeholder={t('aiExpertChatPlaceholder')}
            aria-label={t('aiExpertChatAria')}
            className="flex-1 text-base leading-normal px-4 py-2.5 rounded-xl outline-none bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:ring-2 focus:ring-vailo-gold/25 focus:border-vailo-gold/40 transition-[height,box-shadow] disabled:opacity-50 resize-none overflow-y-auto max-h-32"
          />
          <button
            type="submit"
            disabled={!input.trim() || isSending}
            className={`min-h-[48px] min-w-[48px] p-3 rounded-xl flex items-center justify-center shrink-0 self-end ${AI_EXPERT_BTN_PRIMARY}`}
            aria-label={t('aiExpertSendAria')}
          >
            <Send size={20} />
          </button>
        </form>
        <p className="text-center text-xs text-white/40 leading-relaxed mt-2.5">
          {t('aiExpertChatDisclaimer')}
        </p>
      </div>
    </div>
  );
}
