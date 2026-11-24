import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

const PREVIEW_DEVICE_WIDTH = 390;
const PREVIEW_DEVICE_HEIGHT = 844;
const PREVIEW_CHROME = 12;

/** Phone-frame iframe popup for admin guest-portal preview (not a new browser tab). */
export default function GuestPortalPhonePreviewModal({
  title,
  url,
  onClose,
}: {
  title: string;
  url: string;
  onClose: () => void;
}) {
  const [scale, setScale] = useState(0.72);

  useEffect(() => {
    const update = () => {
      const maxW = Math.max(240, window.innerWidth - 48);
      const maxH = Math.max(360, window.innerHeight - 96);
      const frameW = PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME;
      const frameH = PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME + 28;
      setScale(Math.min(1, maxW / frameW, maxH / frameH));
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  const frameW = (PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME) * scale;
  const frameH = (PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME) * scale;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-label="Guest portal preview"
      onClick={onClose}
    >
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        <button
          type="button"
          onClick={onClose}
          className="absolute -top-3 -right-3 z-20 h-9 w-9 rounded-full bg-white text-gray-700 shadow-lg border border-gray-200 flex items-center justify-center hover:bg-gray-50"
          aria-label="Close guest portal preview"
        >
          <X size={18} />
        </button>
        <p className="text-center text-xs font-semibold text-white/90 mb-2 drop-shadow">
          Guest portal preview · {title}
        </p>
        <div style={{ width: frameW, height: frameH }} className="mx-auto">
          <div
            className="origin-top-left"
            style={{
              width: PREVIEW_DEVICE_WIDTH + PREVIEW_CHROME,
              height: PREVIEW_DEVICE_HEIGHT + PREVIEW_CHROME,
              transform: `scale(${scale})`,
            }}
          >
            <div className="relative rounded-[2rem] border-[6px] border-gray-900 bg-gray-900 shadow-[0_24px_80px_rgba(0,0,0,0.45)] overflow-hidden">
              <div className="absolute top-0 inset-x-0 z-30 flex justify-center pt-1.5 pointer-events-none">
                <div className="h-4 w-[5.5rem] rounded-b-2xl bg-gray-900" />
              </div>
              <iframe
                title={`Guest portal — ${title}`}
                src={url}
                width={PREVIEW_DEVICE_WIDTH}
                height={PREVIEW_DEVICE_HEIGHT}
                className="block bg-white border-0"
                allow="clipboard-write"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
