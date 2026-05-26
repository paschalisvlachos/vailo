type Props = {
  onPrivacyClick: () => void;
  onTermsClick: () => void;
};

/** Footer links for Privacy Policy and Terms of Use at the end of the guest portal. */
export default function GuestLegalFooter({ onPrivacyClick, onTermsClick }: Props) {
  return (
    <div className="text-center pt-8 pb-6 border-t border-gray-200/50 mt-4">
      <nav
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mb-5"
        aria-label="Legal"
      >
        <button
          type="button"
          onClick={onPrivacyClick}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F5C] hover:text-[#C5A059] underline-offset-4 hover:underline transition-colors"
        >
          Privacy Policy
        </button>
        <span className="text-gray-300 text-xs" aria-hidden>
          |
        </span>
        <button
          type="button"
          onClick={onTermsClick}
          className="text-[11px] font-bold uppercase tracking-[0.14em] text-[#0B4F5C] hover:text-[#C5A059] underline-offset-4 hover:underline transition-colors"
        >
          Terms of Use
        </button>
      </nav>
      <img
        src="/vailoLogo.png"
        alt="Vailo"
        className="h-7 w-auto mx-auto mb-3 opacity-40 grayscale hover:grayscale-0 hover:opacity-70 transition-all"
        onError={(e) => {
          (e.target as HTMLImageElement).src = '../../../vailoLogo.png';
        }}
      />
      <p className="text-[9px] font-semibold text-gray-400 tracking-[0.2em] uppercase">Powered by Vailo</p>
    </div>
  );
}
