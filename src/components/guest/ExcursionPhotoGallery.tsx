import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';

type Props = {
  photos: string[];
  title?: string;
};

export default function ExcursionPhotoGallery({ photos, title }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  useEffect(() => {
    if (activeIndex == null) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activeIndex]);

  if (photos.length === 0) return null;

  const close = () => setActiveIndex(null);
  const showPrev = () =>
    setActiveIndex((index) =>
      index == null ? null : (index - 1 + photos.length) % photos.length
    );
  const showNext = () =>
    setActiveIndex((index) => (index == null ? null : (index + 1) % photos.length));

  return (
    <>
      <div className="rounded-2xl bg-white border border-gray-100 px-5 py-5 shadow-sm">
        <h3 className="font-luxury text-lg text-[#051F26] font-medium mb-3">More photos</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {photos.map((url, index) => (
            <button
              key={url}
              type="button"
              onClick={() => setActiveIndex(index)}
              className="relative aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0B4F5C]/40"
              aria-label={`View photo ${index + 1} of ${photos.length}`}
            >
              <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
            </button>
          ))}
        </div>
      </div>

      {activeIndex != null && (
        <div
          className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-center justify-center bg-[#051F26]/90 backdrop-blur-md p-4`}
          role="dialog"
          aria-modal="true"
          aria-label={title ? `Photos for ${title}` : 'Excursion photos'}
          onClick={close}
        >
          <button
            type="button"
            onClick={close}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25 transition-colors"
            aria-label="Close gallery"
          >
            <X size={18} />
          </button>

          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showPrev();
                }}
                className="absolute left-3 sm:left-5 p-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25 transition-colors"
                aria-label="Previous photo"
              >
                <ChevronLeft size={20} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  showNext();
                }}
                className="absolute right-3 sm:right-5 p-2.5 rounded-full bg-white/15 backdrop-blur-md border border-white/20 text-white hover:bg-white/25 transition-colors"
                aria-label="Next photo"
              >
                <ChevronRight size={20} />
              </button>
            </>
          )}

          <div
            className="max-w-4xl w-full max-h-[85vh] flex flex-col items-center"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={photos[activeIndex]}
              alt=""
              className="max-h-[78vh] w-auto max-w-full object-contain rounded-xl shadow-2xl"
            />
            {photos.length > 1 && (
              <p className="mt-3 text-sm text-white/70">
                {activeIndex + 1} / {photos.length}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
