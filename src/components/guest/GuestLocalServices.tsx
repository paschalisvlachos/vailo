import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBodyScrollLock } from '../../hooks/useBodyScrollLock';
import {
  Anchor,
  Bookmark,
  Briefcase,
  Car,
  Check,
  Copy,
  Globe,
  Mail,
  MessageCircle,
  Sparkles,
  Ticket,
  UtensilsCrossed,
  Waves,
  X,
  ExternalLink,
} from 'lucide-react';
import { openExternalUrl, isValidExternalUrl } from '../../lib/geocoding';
import {
  buildServiceEmailLink,
  buildServiceInquiryMessage,
  buildServiceWhatsAppLink,
} from '../../lib/guestServiceContact';
import { normalizeWhatsAppPhone } from '../../lib/whatsappLink';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import { guestUiT } from '../../lib/guestLocaleUi';
import { resolveLocalizedString } from '../../lib/propertyContentLocales';
import { GUEST_PORTAL_Z } from '../../lib/guestPortalLayers';
import MirroredPhotoImg from '../shared/MirroredPhotoImg';
export type GuestPortalFeature = {
  id: string;
  name?: string;
  businessName?: string;
  description?: string;
  photoUrl?: string;
  categories?: string[];
  whatsapp?: string;
  email?: string;
  website?: string;
  voucherCode?: string;
  agreement?: string;
  isLocal?: boolean;
};

type Props = {
  features: GuestPortalFeature[];
  propertyName: string;
  propertyTypeName?: string;
  /** Notifies parent when the detail sheet opens — used to hide FABs and fix stacking. */
  onDetailOpenChange?: (open: boolean) => void;
  layout?: 'list' | 'carousel';
};

function featureTitle(
  f: GuestPortalFeature,
  locale: string,
  primaryLocale: string
) {
  return (
    resolveLocalizedString(f, 'name', locale, primaryLocale) ||
    f.name ||
    f.businessName ||
    'Service'
  );
}

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('boat') || n.includes('yacht')) return Anchor;
  if (n.includes('car')) return Car;
  if (n.includes('food') || n.includes('restaurant') || n.includes('chef')) return UtensilsCrossed;
  if (n.includes('pool') || n.includes('spa') || n.includes('wellness')) return Waves;
  if (n.includes('voucher') || n.includes('discount') || n.includes('promo')) return Ticket;
  return Briefcase;
}

function normalizeWebsiteUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function serviceWebsiteUrl(url?: string): string {
  const normalized = normalizeWebsiteUrl(url || '');
  return isValidExternalUrl(normalized) ? normalized : '';
}

function ContactTag({
  kind,
  label,
}: {
  kind: 'whatsapp' | 'email';
  label: string;
}) {
  const isWa = kind === 'whatsapp';
  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 ${
        isWa
          ? 'bg-[#25D366]/12 text-[#1a9e4b] border border-[#25D366]/25'
          : 'bg-[#C5A059]/12 text-[#6b5420] border border-[#C5A059]/25'
      }`}
    >
      {isWa ? <MessageCircle size={11} /> : <Mail size={11} />}
      {label}
    </span>
  );
}

function ServiceDetailSheet({
  feature,
  propertyName,
  propertyTypeName,
  onClose,
}: {
  feature: GuestPortalFeature;
  propertyName: string;
  propertyTypeName?: string;
  onClose: () => void;
}) {
  const { locale, contentPrimaryLocale } = useGuestLocale();
  const [copiedVoucher, setCopiedVoucher] = useState(false);
  const title = featureTitle(feature, locale, contentPrimaryLocale);
  const description = resolveLocalizedString(
    feature,
    'description',
    locale,
    contentPrimaryLocale
  ) || feature.description || '';
  const category = feature.categories?.[0] || 'Service';
  const CatIcon = categoryIcon(category);
  const inquiryMessage = buildServiceInquiryMessage(propertyName, propertyTypeName, title);
  const emailSubject = `Inquiry from ${[propertyName, propertyTypeName].filter(Boolean).join(' — ')}`;
  const whatsappHref = buildServiceWhatsAppLink(feature.whatsapp, inquiryMessage);
  const emailHref = buildServiceEmailLink(feature.email, inquiryMessage, emailSubject);
  const voucherCode = feature.voucherCode?.trim() || '';
  const websiteUrl = serviceWebsiteUrl(feature.website);
  const hasContact = !!(whatsappHref || emailHref || websiteUrl);

  const copyVoucherCode = () => {
    if (!voucherCode || typeof navigator === 'undefined') return;
    navigator.clipboard.writeText(voucherCode).then(() => {
      setCopiedVoucher(true);
      window.setTimeout(() => setCopiedVoucher(false), 2000);
    });
  };

  useBodyScrollLock(true);

  return (
    <div
      className={`fixed inset-0 ${GUEST_PORTAL_Z.detailSheet} flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-0 sm:p-4`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0 bg-white">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="shrink-0 flex items-center justify-between gap-3 px-4 py-3 border-b border-gray-100 bg-white">
          <h2
            id="service-detail-title"
            className="font-luxury text-lg text-[#051F26] font-medium truncate flex-1 min-w-0"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">

          <div className="relative rounded-2xl overflow-hidden bg-gray-100 mb-4 aspect-[16/10]">
            {feature.photoUrl ? (
              <MirroredPhotoImg
                src={feature.photoUrl}
                alt=""
                className="w-full h-full object-cover"
                mirrorContext={{ docId: feature.id }}
                fallback={
                  <div className="w-full h-full flex items-center justify-center text-[#C5A059] min-h-[140px]">
                    <Sparkles size={36} />
                  </div>
                }
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#C5A059] min-h-[140px]">
                <Sparkles size={36} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/25 via-transparent to-transparent pointer-events-none" />
            <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-[#0B4F5C] text-sm font-semibold shadow-sm border border-white/60">
              <CatIcon size={14} className="shrink-0" />
              {category}
            </span>
          </div>

          {description && (
            <p className="text-sm text-gray-600 text-center leading-relaxed mb-5 px-1">
              {description}
            </p>
          )}

          {feature.agreement && feature.agreement !== '0' && (
            <p className="text-center text-sm font-semibold text-[#0B4F5C] mb-4">
              {feature.agreement}% offer for guests of {propertyName}
            </p>
          )}

          {voucherCode && (
            <div className="mb-5 rounded-xl border border-[#C5A059]/30 bg-[#C5A059]/8 px-4 py-4 text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-[#6b5420] mb-2">
                {guestUiT(locale, 'serviceVoucherLabel')}
              </p>
              <div className="flex items-center justify-center gap-2 mb-2">
                <code className="text-lg font-bold tracking-[0.2em] text-[#051F26]">{voucherCode}</code>
                <button
                  type="button"
                  onClick={copyVoucherCode}
                  className="inline-flex items-center justify-center p-2 rounded-lg border border-[#C5A059]/30 text-[#6b5420] hover:bg-white/70 transition-colors"
                  aria-label={guestUiT(locale, 'serviceVoucherLabel')}
                >
                  {copiedVoucher ? <Check size={16} /> : <Copy size={16} />}
                </button>
              </div>
              <p className="text-sm text-gray-600 leading-relaxed">
                {guestUiT(locale, 'serviceVoucherHint')}
              </p>
            </div>
          )}

          <div className="space-y-2.5">
            {whatsappHref && (
              <button
                type="button"
                onClick={() => openExternalUrl(whatsappHref)}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-[#25D366]/40 hover:bg-[#25D366]/5 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-[#25D366] font-semibold text-sm">
                  <MessageCircle size={18} />
                  WhatsApp
                </span>
                <ExternalLink size={16} className="text-gray-400" />
              </button>
            )}
            {emailHref && (
              <a
                href={emailHref}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-[#C5A059]/40 hover:bg-[#C5A059]/5 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-[#051F26] font-semibold text-sm min-w-0">
                  <Mail size={18} className="shrink-0 text-[#C5A059]" />
                  <span className="truncate">{feature.email?.trim()}</span>
                </span>
                <ExternalLink size={16} className="text-gray-400 shrink-0 ml-2" />
              </a>
            )}
            {websiteUrl && (
              <button
                type="button"
                onClick={() => openExternalUrl(websiteUrl)}
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-[#0B4F5C]/30 hover:bg-[#0B4F5C]/5 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-[#051F26] font-semibold text-sm min-w-0">
                  <Globe size={18} className="shrink-0 text-[#0B4F5C]" />
                  <span className="truncate">{websiteUrl.replace(/^https?:\/\//i, '')}</span>
                </span>
                <ExternalLink size={16} className="text-gray-400 shrink-0 ml-2" />
              </button>
            )}
            {!hasContact && !voucherCode && (
              <p className="text-sm text-gray-500 text-center py-4">
                Contact details are not available. Please ask your host.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function GuestLocalServices({
  features,
  propertyName,
  propertyTypeName,
  onDetailOpenChange,
  layout = 'list',
}: Props) {
  const { locale, contentPrimaryLocale } = useGuestLocale();
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selected, setSelected] = useState<GuestPortalFeature | null>(null);

  useEffect(() => {
    onDetailOpenChange?.(selected != null);
  }, [selected, onDetailOpenChange]);

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(features.map((f) => f.categories?.[0]).filter(Boolean)))],
    [features]
  );

  const filtered = useMemo(
    () =>
      categoryFilter === 'All'
        ? features
        : features.filter((f) => f.categories?.[0] === categoryFilter),
    [features, categoryFilter]
  );

  if (features.length === 0) return null;

  if (layout === 'carousel') {
    return (
      <>
        <div className="flex gap-3 overflow-x-auto pb-1 snap-x snap-mandatory scrollbar-none">
          {features.map((feature) => {
            const title = featureTitle(feature, locale, contentPrimaryLocale);
            const listDescription = resolveLocalizedString(
              feature,
              'description',
              locale,
              contentPrimaryLocale
            );
            const category = feature.categories?.[0];
            return (
              <button
                key={feature.id}
                type="button"
                onClick={() => setSelected(feature)}
                className="snap-start shrink-0 w-[9.75rem] text-left rounded-[0.75rem] overflow-hidden border border-[#EEEAE3] bg-white shadow-[0_8px_20px_-14px_rgba(10,47,50,0.35)]"
              >
                <div className="relative h-[5rem] bg-[#E8DFD0]">
                  {feature.photoUrl ? (
                    <MirroredPhotoImg
                      src={feature.photoUrl}
                      alt=""
                      className="h-full w-full object-cover"
                      mirrorContext={{ docId: feature.id }}
                      fallback={
                        <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                          <Sparkles size={26} />
                        </div>
                      }
                    />
                  ) : (
                    <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                      <Sparkles size={26} />
                    </div>
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0A2F32]/55 via-transparent to-black/10" />
                  <span className="absolute top-2 right-2 h-7 w-7 rounded-full bg-white/95 text-[#0A2F32] flex items-center justify-center shadow-sm">
                    <Bookmark size={13} />
                  </span>
                </div>
                <div className="px-2.5 pt-2 pb-2.5">
                  <h3 className="font-sans text-[11px] font-semibold text-[#0A2F32] leading-tight line-clamp-1">
                    {title}
                  </h3>
                  <p className="text-[9.5px] text-[#7A7266] mt-1 line-clamp-1 leading-snug">
                    {category || listDescription || 'Host pick'}
                  </p>
                </div>
              </button>
            );
          })}
        </div>
        {selected &&
          typeof document !== 'undefined' &&
          createPortal(
            <ServiceDetailSheet
              feature={selected}
              propertyName={propertyName}
              propertyTypeName={propertyTypeName}
              onClose={() => setSelected(null)}
            />,
            document.body
          )}
      </>
    );
  }

  return (
    <>
      <section className="!mt-6 !mb-0">
        <div className="mb-4">
          <p className="guest-eyebrow mb-1">
            Curated by your host
          </p>
          <h2 className="guest-heading-section">Local Services</h2>
          <p className="guest-body-sm mt-1.5">
            {filtered.length} partner{filtered.length !== 1 ? 's' : ''} · trusted for your stay
          </p>
        </div>

        {categories.length > 1 && (
          <div className="flex flex-wrap gap-1.5 pb-3">
            {categories.map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat ?? 'All')}
                className={`guest-pill whitespace-nowrap rounded-full text-sm uppercase tracking-wider font-semibold transition-all ${
                  categoryFilter === cat
                    ? 'bg-[#0B4F5C] text-white shadow-md'
                    : 'bg-white text-gray-500 border border-gray-200/80 hover:border-[#0B4F5C]/30'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        )}

        <div className="space-y-2">
          {filtered.map((feature) => {
            const title = featureTitle(feature, locale, contentPrimaryLocale);
            const listDescription = resolveLocalizedString(
              feature,
              'description',
              locale,
              contentPrimaryLocale
            );
            const category = feature.categories?.[0] || 'Service';
            const CatIcon = categoryIcon(category);
            const hasWhatsApp = !!normalizeWhatsAppPhone(feature.whatsapp || '');
            const hasEmail = !!(feature.email?.trim() && feature.email.includes('@'));
            const hasVoucher = !!feature.voucherCode?.trim();
            const hasWebsite = !!serviceWebsiteUrl(feature.website);

            return (
              <div key={feature.id}>
                <span className="guest-badge inline-flex items-center gap-1.5 rounded-md bg-[#0B4F5C]/8 text-[#0B4F5C] mb-1">
                  <CatIcon size={12} />
                  {category}
                </span>
                <button
                  type="button"
                  onClick={() => setSelected(feature)}
                  className="w-full text-left bg-white rounded-xl border border-gray-200/90 shadow-[0_2px_12px_rgba(11,79,92,0.06)] p-3 flex gap-3 hover:border-[#0B4F5C]/25 hover:shadow-md transition-all active:scale-[0.99]"
                >
                  <div className="h-[72px] w-[72px] rounded-lg overflow-hidden bg-gray-100 shrink-0">
                    {feature.photoUrl ? (
                      <MirroredPhotoImg
                        src={feature.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                        mirrorContext={{ docId: feature.id }}
                        fallback={
                          <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                            <Sparkles size={22} />
                          </div>
                        }
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                        <Sparkles size={22} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="guest-card-title mb-1 truncate">
                      {title}
                    </h3>
                    {listDescription && (
                      <p className="text-sm text-gray-500 line-clamp-2 leading-snug mb-2">
                        {listDescription}
                      </p>
                    )}
                    {(hasWhatsApp || hasEmail || hasVoucher || hasWebsite) && (
                      <div className="flex flex-wrap gap-1.5">
                        {hasVoucher && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 bg-amber-50 text-amber-800 border border-amber-200/80">
                            <Ticket size={11} />
                            Voucher
                          </span>
                        )}
                        {hasWhatsApp && <ContactTag kind="whatsapp" label="WhatsApp" />}
                        {hasEmail && <ContactTag kind="email" label="Email" />}
                        {hasWebsite && (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold shrink-0 bg-[#0B4F5C]/8 text-[#0B4F5C] border border-[#0B4F5C]/15">
                            <Globe size={11} />
                            {guestUiT(locale, 'website')}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {selected &&
        typeof document !== 'undefined' &&
        createPortal(
          <ServiceDetailSheet
            feature={selected}
            propertyName={propertyName}
            propertyTypeName={propertyTypeName}
            onClose={() => setSelected(null)}
          />,
          document.body
        )}
    </>
  );
}
