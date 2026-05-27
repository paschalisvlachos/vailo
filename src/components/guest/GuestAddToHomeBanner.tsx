import { useState } from 'react';
import { Plus, Share, Smartphone, X } from 'lucide-react';
import type { GuestLocaleKey } from '../../lib/guestLocale';

type Props = {
  t: (key: GuestLocaleKey) => string;
  canPromptNative: boolean;
  isIosSafari: boolean;
  onDismiss: () => void;
  onInstall: () => Promise<'accepted' | 'dismissed' | 'unavailable'>;
  propertyLabel?: string;
};

export default function GuestAddToHomeBanner({
  t,
  canPromptNative,
  isIosSafari,
  onDismiss,
  onInstall,
  propertyLabel,
}: Props) {
  const [iosGuideOpen, setIosGuideOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'waiting' | 'success'>('idle');

  const handleInstallClick = async () => {
    if (canPromptNative) {
      setStatus('waiting');
      const outcome = await onInstall();
      if (outcome === 'accepted') setStatus('success');
      else setStatus('idle');
      return;
    }
    if (isIosSafari) {
      setIosGuideOpen(true);
      return;
    }
    setIosGuideOpen(true);
  };

  return (
    <>
      <div className="fixed left-1/2 -translate-x-1/2 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] z-[55] w-[calc(100%-2rem)] max-w-[360px] pointer-events-none">
        <div className="pointer-events-auto rounded-2xl border border-[#0B4F5C]/15 bg-white shadow-[0_8px_32px_rgba(11,79,92,0.12)] overflow-hidden">
          <div className="flex items-start gap-3 p-4 pr-2">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0B4F5C] to-[#083a43] flex items-center justify-center shrink-0 p-1.5">
              <img
                src="/vailoLogo.png"
                alt=""
                className="w-full h-full object-contain brightness-0 invert"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className="text-sm font-semibold text-[#051F26] leading-snug">{t('installTitle')}</p>
              <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{t('installSub')}</p>
              {status === 'success' && (
                <p className="text-[11px] text-emerald-700 mt-2 font-medium">{t('installSuccess')}</p>
              )}
              {status === 'waiting' && (
                <p className="text-[11px] text-[#0B4F5C] mt-2 font-medium">{t('installWaiting')}</p>
              )}
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-50 shrink-0"
              aria-label={t('installDismiss')}
            >
              <X size={18} />
            </button>
          </div>
          <div className="px-4 pb-4 pt-0">
            <button
              type="button"
              onClick={handleInstallClick}
              disabled={status === 'waiting'}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-gradient-to-r from-[#0B4F5C] to-[#083a43] text-[#C5A059] text-[10px] font-bold uppercase tracking-[0.14em] hover:from-[#083a43] hover:to-[#072d34] transition-colors disabled:opacity-60"
            >
              <img
                src="/vailoLogo.png"
                alt=""
                className="h-4 w-auto brightness-0 invert opacity-95"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              <span>Vailo</span>
              <Plus size={14} className="opacity-90" />
              <span className="normal-case tracking-normal font-semibold text-white/90">
                {t('installCta')}
              </span>
            </button>
          </div>
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
