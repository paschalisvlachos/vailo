import { useMemo, useState } from 'react';
import {
  Anchor,
  Briefcase,
  Car,
  Mail,
  MessageCircle,
  Sparkles,
  UtensilsCrossed,
  Waves,
  X,
  ExternalLink,
} from 'lucide-react';
import {
  buildServiceEmailLink,
  buildServiceInquiryMessage,
  buildServiceWhatsAppLink,
} from '../../lib/guestServiceContact';
import { normalizeWhatsAppPhone } from '../../lib/whatsappLink';

export type GuestPortalFeature = {
  id: string;
  name?: string;
  businessName?: string;
  description?: string;
  photoUrl?: string;
  categories?: string[];
  whatsapp?: string;
  email?: string;
  agreement?: string;
  isLocal?: boolean;
};

type Props = {
  features: GuestPortalFeature[];
  propertyName: string;
  propertyTypeName?: string;
};

function featureTitle(f: GuestPortalFeature) {
  return f.name || f.businessName || 'Service';
}

function categoryIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes('boat') || n.includes('yacht')) return Anchor;
  if (n.includes('car')) return Car;
  if (n.includes('food') || n.includes('restaurant') || n.includes('chef')) return UtensilsCrossed;
  if (n.includes('pool') || n.includes('spa') || n.includes('wellness')) return Waves;
  return Briefcase;
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
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold shrink-0 ${
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
  const title = featureTitle(feature);
  const category = feature.categories?.[0] || 'Service';
  const CatIcon = categoryIcon(category);
  const inquiryMessage = buildServiceInquiryMessage(propertyName, propertyTypeName, title);
  const emailSubject = `Inquiry from ${[propertyName, propertyTypeName].filter(Boolean).join(' — ')}`;
  const whatsappHref = buildServiceWhatsAppLink(feature.whatsapp, inquiryMessage);
  const emailHref = buildServiceEmailLink(feature.email, inquiryMessage, emailSubject);
  const hasContact = !!(whatsappHref || emailHref);

  return (
    <div
      className="fixed inset-0 z-[85] flex items-end sm:items-center justify-center bg-[#051F26]/55 backdrop-blur-sm p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="service-detail-title"
      onClick={onClose}
    >
      <div
        className="bg-white w-full sm:max-w-md max-h-[92vh] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2.5 pb-1 sm:hidden shrink-0">
          <div className="w-10 h-1 rounded-full bg-gray-200" aria-hidden />
        </div>

        <div className="overflow-y-auto flex-1 px-5 pb-5">
          <div className="flex justify-end mb-3">
            <button
              type="button"
              onClick={onClose}
              className="p-2 rounded-xl text-gray-400 hover:text-[#0B4F5C] hover:bg-gray-50 shrink-0"
              aria-label="Close"
            >
              <X size={20} />
            </button>
          </div>

          <h2
            id="service-detail-title"
            className="font-luxury text-2xl text-[#051F26] font-medium text-center mb-4"
          >
            {title}
          </h2>

          <div className="relative rounded-2xl overflow-hidden bg-gray-100 mb-4 aspect-[16/10]">
            {feature.photoUrl ? (
              <img src={feature.photoUrl} alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[#C5A059] min-h-[140px]">
                <Sparkles size={36} />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#051F26]/25 via-transparent to-transparent pointer-events-none" />
            <span className="absolute top-3 left-3 z-10 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white/95 backdrop-blur-sm text-[#0B4F5C] text-[11px] font-semibold shadow-sm border border-white/60">
              <CatIcon size={14} className="shrink-0" />
              {category}
            </span>
          </div>

          {feature.description && (
            <p className="text-sm text-gray-600 text-center leading-relaxed mb-5 px-1">
              {feature.description}
            </p>
          )}

          {feature.agreement && feature.agreement !== '0' && (
            <p className="text-center text-xs font-semibold text-[#0B4F5C] mb-4">
              {feature.agreement}% offer for guests of {propertyName}
            </p>
          )}

          <div className="space-y-2.5">
            {whatsappHref && (
              <a
                href={whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full px-4 py-3.5 rounded-xl border border-gray-200 bg-white hover:border-[#25D366]/40 hover:bg-[#25D366]/5 transition-colors"
              >
                <span className="flex items-center gap-2.5 text-[#25D366] font-semibold text-sm">
                  <MessageCircle size={18} />
                  WhatsApp
                </span>
                <ExternalLink size={16} className="text-gray-400" />
              </a>
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
            {!hasContact && (
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
}: Props) {
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [selected, setSelected] = useState<GuestPortalFeature | null>(null);

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

  return (
    <>
      <section className="!mt-6 !mb-0">
        <div className="mb-4">
          <p className="text-[10px] font-bold text-[#C5A059] tracking-[0.25em] uppercase mb-1">
            Curated by your host
          </p>
          <h2 className="font-luxury text-2xl text-[#051F26] font-medium">Local Services</h2>
          <p className="text-gray-500 text-xs mt-1.5">
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
                className={`whitespace-nowrap px-3.5 py-2 rounded-full text-[10px] uppercase tracking-wider font-semibold transition-all ${
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
            const title = featureTitle(feature);
            const category = feature.categories?.[0] || 'Service';
            const CatIcon = categoryIcon(category);
            const hasWhatsApp = !!normalizeWhatsAppPhone(feature.whatsapp || '');
            const hasEmail = !!(feature.email?.trim() && feature.email.includes('@'));

            return (
              <div key={feature.id}>
                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#0B4F5C]/8 text-[#0B4F5C] text-[10px] font-semibold mb-1">
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
                      <img
                        src={feature.photoUrl}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="h-full w-full flex items-center justify-center text-[#C5A059]">
                        <Sparkles size={22} />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <h3 className="font-semibold text-[#051F26] text-[15px] leading-tight mb-1 truncate">
                      {title}
                    </h3>
                    {feature.description && (
                      <p className="text-xs text-gray-500 line-clamp-2 leading-snug mb-2">
                        {feature.description}
                      </p>
                    )}
                    {(hasWhatsApp || hasEmail) && (
                      <div className="flex flex-wrap gap-1.5">
                        {hasWhatsApp && <ContactTag kind="whatsapp" label="WhatsApp" />}
                        {hasEmail && <ContactTag kind="email" label="Email" />}
                      </div>
                    )}
                  </div>
                </button>
              </div>
            );
          })}
        </div>
      </section>

      {selected && (
        <ServiceDetailSheet
          feature={selected}
          propertyName={propertyName}
          propertyTypeName={propertyTypeName}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
