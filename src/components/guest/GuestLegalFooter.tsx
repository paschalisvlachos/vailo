import { useGuestLocale } from '../../context/GuestLocaleContext';

type Props = {
  onPrivacyClick: () => void;
  onTermsClick: () => void;
};

/** Footer links for Privacy Policy and Terms of Use at the end of the guest portal. */
export default function GuestLegalFooter({ onPrivacyClick, onTermsClick }: Props) {
  const { t } = useGuestLocale();
  return (
    <div className="text-center pt-5 pb-2 border-t border-gray-200/50 !mt-6">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-3"
        aria-label="Legal"
      >
        <button
          type="button"
          onClick={onPrivacyClick}
          className="text-sm font-bold uppercase tracking-[0.1em] text-[#0B4F5C] hover:text-[#C5A059] underline-offset-4 hover:underline transition-colors min-h-[44px] px-1"
        >
          Privacy Policy
        </button>
        <span className="text-gray-300 text-sm" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={onTermsClick}
          className="text-sm font-bold uppercase tracking-[0.1em] text-[#0B4F5C] hover:text-[#C5A059] underline-offset-4 hover:underline transition-colors min-h-[44px] px-1"
        >
          {t('termsOfUse')}
        </button>
      </nav>
      <img
        src="/vailoLogo.png"
        alt="Vailo"
        className="h-7 w-auto mx-auto mb-1.5 opacity-40 grayscale hover:grayscale-0 hover:opacity-70 transition-all"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '../../../vailoLogo.png';
        }}
      />
      <p className="guest-eyebrow text-gray-400">Powered by Vailo</p>
    </div>
  );
}
