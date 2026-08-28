import { Compass, Gift, MessageCircle, Sparkles } from 'lucide-react';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import type { GuestLocaleKey } from '../../lib/guestLocale';

const NOTES: { icon: typeof Sparkles; key: GuestLocaleKey }[] = [
  { icon: Gift, key: 'checkInNoteFree' },
  { icon: Sparkles, key: 'checkInNoteLocals' },
  { icon: MessageCircle, key: 'checkInNoteAssistant' },
  { icon: Compass, key: 'checkInNoteExcursions' },
];

export default function GuestCheckInDiscoverNotes({ className = '' }: { className?: string }) {
  const { t } = useGuestLocale();

  return (
    <aside
      className={`rounded-2xl border border-[#C5A059]/20 bg-white/80 px-5 py-4 shadow-[0_8px_28px_rgba(11,79,92,0.06)] ${className}`}
    >
      <p className="guest-eyebrow text-[#C5A059] mb-3">{t('checkInNoteEyebrow')}</p>
      <ul className="space-y-3">
        {NOTES.map(({ icon: Icon, key }) => (
          <li key={key} className="flex items-start gap-3">
            <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#0B4F5C]/6 text-[#0B4F5C]">
              <Icon size={15} strokeWidth={1.75} />
            </span>
            <p className="text-[13px] leading-snug text-[#334155] pt-1">{t(key)}</p>
          </li>
        ))}
      </ul>
    </aside>
  );
}
