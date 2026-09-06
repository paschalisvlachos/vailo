import { useGuestLocale } from '../../context/GuestLocaleContext';

type Props = {
  onPrivacyClick: () => void;
  onTermsClick: () => void;
};

/** Footer links for Privacy Policy and Terms of Use at the end of the guest portal. */
export default function GuestLegalFooter({ onPrivacyClick, onTermsClick }: Props) {
  const { t } = useGuestLocale();
  return (
    <footer className="text-center pt-3 pb-1 !mt-3">
      <div className="mb-2.5 flex items-center gap-3" aria-hidden>
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[#C5A059]/35" />
        <span className="h-1.5 w-1.5 rotate-45 border border-[#C5A059]/60" />
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[#C5A059]/35" />
      </div>
      <nav
        className="flex items-center justify-center gap-3"
        aria-label="Legal"
      >
        <button
          type="button"
          onClick={onPrivacyClick}
          className="min-h-[36px] px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0A4544]/65 transition-colors hover:text-[#B08B46]"
        >
          Privacy Policy
        </button>
        <span className="h-1 w-1 rounded-full bg-[#C5A059]/55" aria-hidden>
        </span>
        <button
          type="button"
          onClick={onTermsClick}
          className="min-h-[36px] px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#0A4544]/65 transition-colors hover:text-[#B08B46]"
        >
          {t('termsOfUse')}
        </button>
      </nav>
      <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#8E8A82]/55">
        Powered by Vailo
      </p>
    </footer>
  );
}
