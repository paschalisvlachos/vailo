import VailoMark from './VailoMark';

type Props = {
  /** Status line shown under the logo (e.g. Checking access…). */
  status: string;
};

/**
 * Full-screen guest bootstrap loader — teal like Live like a local, logo + status centered.
 */
export default function GuestPortalLoadingScreen({ status }: Props) {
  return (
    <div className="guest-mobile min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-vailo-teal to-vailo-teal-hover font-sans px-6">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Lora:wght@400;500;600&display=swap');
        .font-sans { font-family: 'DM Sans', sans-serif; }
      `}</style>

      <div className="flex flex-col items-center">
        <div className="relative w-16 h-16" aria-hidden>
          <div className="absolute inset-0 rounded-full border-2 border-vailo-gold/30 border-t-vailo-gold animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center p-3.5">
            <VailoMark className="h-7 w-7 object-contain opacity-95" alt="" />
          </div>
        </div>
        <p className="guest-eyebrow text-center mt-8" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </div>
  );
}
