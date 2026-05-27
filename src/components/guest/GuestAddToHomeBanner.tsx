import { useState } from 'react';
import { Share, Smartphone, X } from 'lucide-react';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  t: (key: GuestLocaleKey) => string;
  canPromptNative: boolean;
  onDismiss: () => void;
  onInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  propertyLabel?: string;
};

export default function GuestAddToHomeBanner({
  t,
  canPromptNative,
  onDismiss,
  onInstall,
  propertyLabel,
}: Props) {
  const [iosGuideOpen, setIosGuideOpen] = useState(false);

  const handleInstallClick = async () => {
    if (canPromptNative) {
      await onInstall();
      return;
    }
    setIosGuideOpen(true);
  };

  return (
    <>
      <div className="w-full mb-3 shrink-0">
        <div className="flex items-center gap-1 rounded-xl bg-gradient-to-r from-[#C5A059] via-[#d4ad65] to-[#C5A059] shadow-[0_4px_20px_rgba(197,160,89,0.35)] border border-[#a88648]/40 overflow-hidden">
          <button
            type="button"
            onClick={handleInstallClick}
            className="flex-1 min-w-0 py-3 pl-4 pr-2 text-left text-[#051F26] text-[11px] sm:text-xs font-bold uppercase tracking-[0.1em] hover:bg-white/10 transition-colors"
          >
            {t('installCta')}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onDismiss();
            }}
            className="shrink-0 p-3 text-[#051F26]/70 hover:text-[#051F26] hover:bg-white/15 transition-colors"
            aria-label={t('installDismiss')}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {iosGuideOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setIosGuideOpen(false)}
        >
          <div
            className="bg-white w-full sm:max-w-sm rounded-2xl shadow-2xl p-5 animate-in slide-in-from-bottom-4 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="h-12 w-12 rounded-2xl bg-[#0B4F5C] flex items-center justify-center p-2">
                <img src="/vailoLogo.png" alt="Vailo" className="w-full h-full object-contain brightness-0 invert" />
              </div>
              <div>
                <p className="font-luxury text-lg text-[#051F26] font-medium">Vailo</p>
                <p className="text-xs text-gray-500">{propertyLabel || 'Guest portal'}</p>
              </div>
            </div>
            <h3 className="font-semibold text-[#051F26] mb-3">{t('installIosTitle')}</h3>
            <ol className="space-y-3 text-sm text-gray-600 mb-5">
              <li className="flex gap-2">
                <Share size={16} className="text-[#0B4F5C] shrink-0 mt-0.5" />
                <span>{t('installIosStep1')}</span>
              </li>
              <li className="flex gap-2">
                <Smartphone size={16} className="text-[#0B4F5C] shrink-0 mt-0.5" />
                <span>{t('installIosStep2')}</span>
              </li>
              <li className="flex gap-2">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-[#0B4F5C] text-[9px] font-bold text-[#C5A059]">
                  +
                </span>
                <span>{t('installIosStep3')}</span>
              </li>
            </ol>
            <button
              type="button"
              onClick={() => setIosGuideOpen(false)}
              className="w-full py-2.5 rounded-xl bg-gray-100 text-[#0B4F5C] text-sm font-semibold"
            >
              {t('close')}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
