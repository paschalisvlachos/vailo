import type { ReactNode } from 'react';
import {
  ChevronRight,
  Compass,
  MapPin,
  ShoppingBag,
  Sparkles,
  Star,
  Shield,
  Trophy,
  Wifi,
} from 'lucide-react';
import type { WizardListingDraft } from '../../lib/wizardListingOnboarding';

const GLASS =
  'flex items-center justify-center h-7 w-7 rounded-full bg-[#0A2F32]/45 backdrop-blur-md border border-[#D4B57A]/35 ring-1 ring-inset ring-white/10 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]';

type Props = {
  draft: WizardListingDraft;
  photoPreview?: string | null;
  stepLabel?: string;
};

export default function AddPropertyGuestPortalPreview({
  draft,
  photoPreview = null,
  stepLabel = 'Step 1 · Listing details',
}: Props) {
  const heroPhoto = (photoPreview || draft.photoUrl || '').trim();
  const propertyName = draft.propertyTypeName.trim();
  const heroLocation = (draft.city || draft.area || '').trim();
  const ratingRaw = Number(draft.googleRating);
  const rating = Number.isFinite(ratingRaw) && ratingRaw > 0 ? ratingRaw : null;
  const hasCoords = Boolean(draft.latitude.trim() && draft.longitude.trim());
  const wifiName = draft.wifiName.trim();

  return (
    <div className="w-full max-w-[232px] mx-auto lg:mx-0">
      <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-gray-400 mb-2 text-center lg:text-left">
        Guest portal preview
      </p>

      <div className="relative mx-auto w-[220px]">
        <div className="relative rounded-[1.85rem] border-[5px] border-gray-900 bg-gray-900 shadow-[0_18px_50px_rgba(0,0,0,0.16)] overflow-hidden">
          <div className="absolute top-0 inset-x-0 z-30 flex justify-center pt-1 pointer-events-none">
            <div className="h-3.5 w-[4.5rem] rounded-b-xl bg-gray-900" />
          </div>

          <div className="relative h-[470px] bg-[#F7F7F5] overflow-hidden flex flex-col">
            <div className="relative flex-1 overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-[132px] overflow-hidden">
                {heroPhoto ? (
                  <img
                    src={heroPhoto}
                    alt=""
                    className="w-full h-full object-cover object-[center_32%]"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-[#0A3D3A] via-[#08332F] to-[#041C1E]" />
                )}
                <div className="absolute inset-0 bg-gradient-to-b from-[#041C1E]/50 via-[#041C1E]/5 to-[#041C1E]/20" />
              </div>

              <div className="relative z-10 px-2 pt-5">
                <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                  <div className="justify-self-start">
                    {rating != null ? (
                      <span className="relative z-30 flex h-7 items-center gap-0.5 rounded-full border border-[#D4B57A]/35 bg-[#0A2F32]/55 px-1.5 text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)] ring-1 ring-inset ring-white/10 backdrop-blur-md">
                        <GoogleMark />
                        <span className="text-[10px] font-semibold tabular-nums">
                          {rating.toFixed(1)}
                        </span>
                        <Star size={8} className="fill-[#E7C46F] text-[#E7C46F]" />
                      </span>
                    ) : null}
                  </div>
                  <img
                    src="/vailoLogo.png"
                    alt="Vailo"
                    className="h-6 w-[3.75rem] object-contain drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]"
                  />
                  <div className="justify-self-end">
                    <span
                      className={`${GLASS} ${hasCoords ? 'text-[#E8D5A8]' : 'opacity-40'}`}
                      aria-hidden
                    >
                      <MapPin size={11} />
                    </span>
                  </div>
                </div>

                <div
                  className="mt-3 mb-2 text-center"
                  style={{ textShadow: '0 2px 28px rgba(0,0,0,0.45)' }}
                >
                  <p className="text-[8px] font-semibold uppercase tracking-[0.28em] text-[#D4B57A] mb-0.5">
                    Welcome to
                  </p>
                  <h2 className="font-luxury text-[1.2rem] text-white leading-[0.95] font-medium tracking-[-0.025em] min-h-[1.25rem] truncate px-1">
                    {propertyName || 'Your property'}
                  </h2>
                  {heroLocation ? (
                    <p className="text-white/90 text-[10px] mt-1 flex items-center justify-center gap-1">
                      <MapPin size={10} className="text-[#D4B57A] shrink-0" />
                      <span className="truncate max-w-[160px]">{heroLocation}</span>
                    </p>
                  ) : (
                    <p className="text-white/40 text-[10px] mt-1 min-h-[0.85rem]">&nbsp;</p>
                  )}
                </div>

                <div className="relative isolate overflow-hidden mx-0.5 min-h-[78px] text-left rounded-[0.85rem] border border-[#C5A059]/45 bg-[#004845] px-2 py-2 mb-2 shadow-[0_14px_28px_-12px_rgba(4,28,30,0.58)]">
                  {heroPhoto ? (
                    <img
                      src={heroPhoto}
                      alt=""
                      aria-hidden
                      className="pointer-events-none absolute inset-0 -z-20 h-full w-full object-cover object-center opacity-[0.16] mix-blend-luminosity"
                    />
                  ) : null}
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(105deg,rgba(0,72,69,0.98)_0%,rgba(0,72,69,0.9)_52%,rgba(0,54,53,0.82)_100%)]"
                  />
                  <div className="relative z-10 flex items-center gap-1.5">
                    <div className="h-7 w-7 rounded-full bg-[#C5A059] flex items-center justify-center shrink-0 text-white">
                      <Trophy size={12} />
                    </div>
                    <span className="w-px shrink-0 self-stretch bg-[#D4B57A]/35" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="text-[8px] font-semibold uppercase tracking-[0.16em] text-[#D4B57A]">
                        Before you arrive
                      </p>
                      <span className="mt-1 flex w-full items-center justify-center rounded-md bg-[#E7C46F] px-1.5 py-1 text-[#0A2F32] text-[10px] font-medium leading-none">
                        Complete online check-in
                        <ChevronRight size={10} className="inline ml-0.5 shrink-0" />
                      </span>
                      <p className="text-white/75 text-[9px] mt-1 leading-snug line-clamp-2">
                        Complete your check-in to unlock your stay experience.
                      </p>
                    </div>
                  </div>
                  <div className="relative z-10 mt-1.5 border-t border-white/10 pt-1">
                    <span className="inline-flex items-center gap-1 text-[8px] text-white/50 font-medium tracking-wide">
                      <Shield size={8} className="text-[#7FC3BD]" />
                      Secure <span className="text-[#D4B57A]/65">·</span> Private{' '}
                      <span className="text-[#D4B57A]/65">·</span> 2 min
                    </span>
                  </div>
                </div>
              </div>

              <div className="relative z-20 px-2.5 flex flex-col gap-2 pb-14">
                <div className="grid grid-cols-2 gap-1.5">
                  <DestinationCard
                    title="Live like a local"
                    subtitle="Local tips"
                    photoUrl={heroPhoto || undefined}
                  />
                  <DestinationCard
                    title="Book & Arrange"
                    subtitle="Experiences"
                    photoUrl="/portal-book-arrange-hero.png"
                  />
                </div>

                {wifiName ? (
                  <div className="rounded-[0.65rem] border border-[#EEEAE3] bg-white px-2 py-1.5 flex items-center gap-1.5 shadow-[0_8px_22px_-15px_rgba(10,47,50,0.28)]">
                    <span className="h-7 w-7 rounded-full bg-[#F1EDE5] text-[#0A3330] flex items-center justify-center shrink-0">
                      <Wifi size={12} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold text-[#0A2F32] leading-tight">Wi-Fi</p>
                      <p className="text-[9px] text-[#5F5B54] truncate">{wifiName}</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="absolute inset-x-0 bottom-0 z-30 bg-[#0A2F32] text-white/70 pt-1.5 pb-1.5 px-1">
              <div className="grid grid-cols-5 items-end">
                <NavItem label="Home" active icon={<HomeGlyph />} />
                <NavItem label="Book" icon={<ShoppingBag size={13} strokeWidth={1.75} />} />
                <div className="flex flex-col items-center -mt-4 text-white/80">
                  <div className="h-8 w-8 rounded-full bg-[#0A3330] border-[2.5px] border-[#F7F7F5] flex items-center justify-center shadow-[0_8px_18px_rgba(4,28,30,0.4)]">
                    <Sparkles size={12} className="text-[#E8D5A8]" />
                  </div>
                  <span className="text-[8px] font-medium mt-0.5">Ask Vailo</span>
                </div>
                <NavItem label="Explore" icon={<Compass size={13} strokeWidth={1.75} />} />
                <NavItem label="Stay" icon={<StayGlyph />} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <p className="text-[10px] text-gray-400 mt-2 text-center lg:text-left leading-relaxed">
        {stepLabel}
      </p>
    </div>
  );
}

function DestinationCard({
  title,
  subtitle,
  photoUrl,
}: {
  title: string;
  subtitle: string;
  photoUrl?: string;
}) {
  return (
    <div className="relative aspect-[1.25/1] rounded-[0.45rem] overflow-hidden border border-white/60 text-left shadow-[0_10px_24px_-14px_rgba(4,28,30,0.5)]">
      {photoUrl ? (
        <img src={photoUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-[#0A3D3A] to-[#041C1E]" />
      )}
      <div aria-hidden className="absolute inset-0 bg-[#041C1E]/38" />
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.78)_0%,rgba(0,0,0,0.45)_28%,rgba(4,20,22,0.18)_58%,rgba(4,20,22,0.28)_100%)]"
      />
      <div className="relative z-10 p-1.5 flex flex-col h-full">
        <p className="font-luxury text-white text-[10px] leading-tight tracking-[-0.01em]">
          {title}
        </p>
        <p className="text-[8px] text-white/85 mt-0.5 leading-snug">{subtitle}</p>
      </div>
    </div>
  );
}

function NavItem({
  label,
  icon,
  active = false,
}: {
  label: string;
  icon: ReactNode;
  active?: boolean;
}) {
  return (
    <div
      className={`flex min-h-[30px] flex-col items-center justify-end gap-0.5 pb-0.5 ${
        active ? 'text-[#D4B57A]' : 'text-white/75'
      }`}
    >
      {icon}
      <span className="text-[8px] font-medium">{label}</span>
    </div>
  );
}

function HomeGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M4.4 10.7 12 4.2l7.6 6.5c.3.26.4.7.25 1.08A.9.9 0 0 1 19 12.4h-.7V19a1.1 1.1 0 0 1-1.1 1.1h-4.1v-5.2h-2.2v5.2H6.8A1.1 1.1 0 0 1 5.7 19v-6.6H5a.9.9 0 0 1-.85-.62.95.95 0 0 1 .25-1.08Z" />
    </svg>
  );
}

function StayGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4.5 8.5h15v10.2A1.8 1.8 0 0 1 17.7 20.5H6.3A1.8 1.8 0 0 1 4.5 18.7V8.5Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M8 8.5V7.2A2.7 2.7 0 0 1 10.7 4.5h2.6A2.7 2.7 0 0 1 16 7.2V8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M12 11.2v5.2M12 11.2l-2 2M12 11.2l2 2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GoogleMark() {
  return (
    <svg className="h-2.5 w-2.5 shrink-0" viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.6 12.3c0-.8-.1-1.5-.2-2.3H12v4.3h5.9a5 5 0 0 1-2.2 3.3v2.8h3.6c2.1-2 3.3-4.8 3.3-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c3 0 5.5-1 7.3-2.6l-3.6-2.8c-1 .7-2.2 1.1-3.7 1.1a6.5 6.5 0 0 1-6.2-4.5H2.2V17A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.8 14.2a6.5 6.5 0 0 1 0-4.2V7.1H2.2A11 11 0 0 0 1 12c0 1.8.4 3.5 1.2 5l3.6-2.8Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.4c1.6 0 3.1.5 4.2 1.6l3.2-3.1A10.7 10.7 0 0 0 2.2 7.1L5.8 10A6.5 6.5 0 0 1 12 5.4Z"
      />
    </svg>
  );
}
