import { useEffect, useMemo, useState } from 'react';
import {
  Baby,
  Building2,
  Check,
  ChevronDown,
  ChevronUp,
  Fuel,
  Gem,
  Hospital,
  Info,
  Landmark,
  Loader2,
  MapPin,
  Phone,
  Plane,
  RefreshCw,
  Shield,
  ShoppingBag,
  Siren,
  Store,
  UtensilsCrossed,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import type { AddPropertyAreaContext } from '../../lib/addPropertyDraft';
import {
  LOCAL_GEMS_CLOSEST_COUNT,
  SAFETY_ESSENTIAL_SLOTS,
  TRANSPORT_ESSENTIAL_SLOTS,
  USEFUL_ESSENTIAL_SLOTS,
  countEssentialsFound,
  essentialSelectionKey,
  type AreaLocalGemOption,
  type EssentialPlaceProposal,
  type EssentialSectionId,
  type EssentialSlotDef,
} from '../../lib/addPropertyEssentials';
import {
  distanceMetersFromProperty,
  formatDistance,
} from '../../lib/addPropertyAroundData';
import { getCountryEmergencyNumbers } from '../../lib/countryEmergencyNumbers';
import MirroredPhotoImg, {
  type MirrorContext,
} from '../shared/MirroredPhotoImg';
import { AdminButton } from './AdminPageHeader';

type Props = {
  areaContext: AddPropertyAreaContext | null;
  locationLabel: string;
  country: string;
  /** Property pin — used to rank gems closest → farthest per category. */
  propertyLatitude: string;
  propertyLongitude: string;
  gems: AreaLocalGemOption[];
  selectedLocalGemIds: string[];
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>;
  selectedEssentialKeys: string[];
  loadingGems: boolean;
  loadingEssentials: boolean;
  essentialsError?: string | null;
  onToggleGem: (gemId: string) => void;
  /** Select or deselect every gem id in a category at once. */
  onSetCategoryGems: (gemIds: string[], selected: boolean) => void;
  onToggleEssential: (key: string) => void;
  onSetEssentialKeys: (keys: string[], selected: boolean) => void;
  onRefreshEssentials: () => void;
};

const SECTION_META: Record<
  EssentialSectionId,
  { title: string; blurb: string; icon: LucideIcon }
> = {
  localGems: {
    title: 'Local gems',
    blurb: `Each category shows the ${LOCAL_GEMS_CLOSEST_COUNT} closest gems. Expand a category to browse and use Select all — or skip and add more later.`,
    icon: Gem,
  },
  safety: {
    title: 'Safety & Emergency',
    blurb:
      'Pharmacies, hospitals, clinics, police, fire, doctors, dentists, and paediatricians. Add more later anytime.',
    icon: Shield,
  },
  useful: {
    title: 'Useful information',
    blurb:
      'Supermarkets (including larger/farther ones), mini markets, bakeries, gas stations, and ATMs. Add more later anytime.',
    icon: ShoppingBag,
  },
  transport: {
    title: 'Transportation',
    blurb: 'Major hubs only — e.g. international airports and main ferry ports like Souda. Add more later anytime.',
    icon: Plane,
  },
  emergencyPhones: {
    title: 'Emergency telephone numbers',
    blurb: 'Important national emergency numbers for this country. Always available to guests.',
    icon: Phone,
  },
};

const SLOT_ICONS: Record<string, LucideIcon> = {
  pharmacy: Store,
  hospital: Hospital,
  clinic: Hospital,
  police: Landmark,
  fire: Siren,
  doctor: Hospital,
  dentist: Hospital,
  paediatrician: Baby,
  supermarket: ShoppingBag,
  minimarket: Store,
  bakery: UtensilsCrossed,
  gas: Fuel,
  atm: Building2,
  airport: Plane,
  port: Waves,
};

function SectionHeader({
  section,
  open,
  countLabel,
  onToggle,
}: {
  section: EssentialSectionId;
  open: boolean;
  countLabel: string;
  onToggle: () => void;
}) {
  const meta = SECTION_META[section];
  const Icon = meta.icon;
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-slate-50/80 transition-colors"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0b4f5c]/10 text-[#0b4f5c]">
        <Icon size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-vailo-dark">{meta.title}</span>
        <span className="block text-xs text-gray-500 mt-0.5">{countLabel}</span>
      </span>
      {open ? (
        <ChevronUp size={18} className="text-gray-400 shrink-0" />
      ) : (
        <ChevronDown size={18} className="text-gray-400 shrink-0" />
      )}
    </button>
  );
}

function PlaceCard({
  title,
  subtitle,
  meta,
  photoUrl,
  mirrorContext,
  selected,
  onToggle,
  selectable,
}: {
  title: string;
  subtitle?: string;
  meta?: string;
  photoUrl?: string | null;
  mirrorContext?: MirrorContext;
  selected?: boolean;
  onToggle?: () => void;
  selectable?: boolean;
}) {
  const photoFallback = (
    <div className="h-full w-full flex items-center justify-center text-slate-300">
      <MapPin size={20} />
    </div>
  );
  const body = (
    <>
      <div className="h-16 w-16 rounded-lg overflow-hidden bg-slate-100 shrink-0">
        {photoUrl ? (
          <MirroredPhotoImg
            src={photoUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            mirrorContext={mirrorContext}
            fallback={photoFallback}
          />
        ) : (
          photoFallback
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-vailo-dark truncate">{title}</p>
        {subtitle ? (
          <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{subtitle}</p>
        ) : null}
        {meta ? <p className="text-[11px] text-gray-400 mt-1">{meta}</p> : null}
      </div>
      {selectable ? (
        <span
          className={`flex h-5 w-5 items-center justify-center rounded border shrink-0 ${
            selected
              ? 'bg-[#0b4f5c] border-[#0b4f5c] text-white'
              : 'border-slate-300 bg-white text-transparent'
          }`}
        >
          <Check size={12} strokeWidth={3} />
        </span>
      ) : null}
    </>
  );

  if (!selectable || !onToggle) {
    return (
      <div className="min-w-[240px] max-w-[280px] flex gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
        {body}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className={`min-w-[240px] max-w-[280px] flex gap-3 rounded-xl border p-3 text-left shadow-sm transition-colors ${
        selected
          ? 'border-[#0b4f5c]/40 bg-[#0b4f5c]/5'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      {body}
    </button>
  );
}

function EssentialPlaceRow({
  place,
  selected,
  onToggle,
}: {
  place: EssentialPlaceProposal;
  selected: boolean;
  onToggle: () => void;
}) {
  const Icon = SLOT_ICONS[place.slotId] || MapPin;
  const distance = formatDistance(place.distanceMeters);
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full rounded-xl border px-3 py-3 flex gap-3 text-left shadow-sm transition-colors ${
        selected
          ? 'border-[#0b4f5c]/40 bg-[#0b4f5c]/5'
          : 'border-slate-200 bg-white hover:border-slate-300'
      }`}
    >
      <div className="h-14 w-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
        {place.photoUrl ? (
          <MirroredPhotoImg
            src={place.photoUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            mirrorContext={{ googlePlaceId: place.googlePlaceId }}
            fallback={
              <div className="h-full w-full flex items-center justify-center text-[#0b4f5c]/50">
                <Icon size={18} />
              </div>
            }
          />
        ) : (
          <div className="h-full w-full flex items-center justify-center text-[#0b4f5c]/50">
            <Icon size={18} />
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-vailo-dark truncate">{place.name}</p>
          {distance ? (
            <span className="text-[11px] font-medium text-gray-500 tabular-nums shrink-0">
              {distance}
            </span>
          ) : null}
        </div>
        {place.address ? (
          <p className="text-xs text-gray-500 mt-1 line-clamp-2">{place.address}</p>
        ) : null}
        {place.phoneNumber ? (
          <p className="text-xs font-medium text-vailo-dark mt-1">{place.phoneNumber}</p>
        ) : (
          <p className="text-[11px] text-gray-400 mt-1">Phone not listed on Google</p>
        )}
      </div>
      <span
        className={`flex h-5 w-5 items-center justify-center rounded border shrink-0 mt-1 ${
          selected
            ? 'bg-[#0b4f5c] border-[#0b4f5c] text-white'
            : 'border-slate-300 bg-white text-transparent'
        }`}
      >
        <Check size={12} strokeWidth={3} />
      </span>
    </button>
  );
}

function EssentialSlotsAccordion({
  slots,
  essentialsBySlot,
  selectedEssentialKeys,
  openSlotIds,
  onToggleSlotOpen,
  onToggleEssential,
  onSetEssentialKeys,
}: {
  slots: EssentialSlotDef[];
  essentialsBySlot: Record<string, EssentialPlaceProposal[]>;
  selectedEssentialKeys: string[];
  openSlotIds: Record<string, boolean>;
  onToggleSlotOpen: (slotId: string) => void;
  onToggleEssential: (key: string) => void;
  onSetEssentialKeys: (keys: string[], selected: boolean) => void;
}) {
  return (
    <div className="rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
      {slots.map((slot) => {
        const places = [...(essentialsBySlot[slot.id] || [])].sort(
          (a, b) =>
            (a.distanceMeters ?? Number.POSITIVE_INFINITY) -
            (b.distanceMeters ?? Number.POSITIVE_INFINITY)
        );
        const keys = places.map((p) => essentialSelectionKey(p));
        const selectedInSlot = keys.filter((k) => selectedEssentialKeys.includes(k)).length;
        const allSelected = keys.length > 0 && selectedInSlot === keys.length;
        const someSelected = selectedInSlot > 0 && !allSelected;
        const isOpen = openSlotIds[slot.id] === true;
        const Icon = SLOT_ICONS[slot.id] || MapPin;

        return (
          <div key={slot.id}>
            <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50/80">
              <button
                type="button"
                onClick={() => onToggleSlotOpen(slot.id)}
                className="min-w-0 flex-1 flex items-center gap-2 text-left"
              >
                {isOpen ? (
                  <ChevronUp size={16} className="text-gray-400 shrink-0" />
                ) : (
                  <ChevronDown size={16} className="text-gray-400 shrink-0" />
                )}
                <Icon size={14} className="text-[#0b4f5c] shrink-0" />
                <span className="text-xs font-bold uppercase tracking-wide text-slate-600 truncate">
                  {slot.label}
                </span>
                <span className="text-[11px] text-slate-400 shrink-0">
                  ({places.length}
                  {selectedInSlot ? ` · ${selectedInSlot} selected` : ''})
                </span>
              </button>

              {places.length > 0 ? (
                <label
                  className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer select-none text-[11px] font-semibold text-slate-600 pl-2 border-l border-slate-200"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-[#0b4f5c] focus:ring-[#0b4f5c]/30"
                    checked={allSelected}
                    ref={(el) => {
                      if (el) el.indeterminate = someSelected;
                    }}
                    onChange={() => onSetEssentialKeys(keys, !allSelected)}
                  />
                  {allSelected ? 'Deselect all' : 'Select all'}
                </label>
              ) : null}
            </div>

            {isOpen ? (
              <div className="px-3 py-3 space-y-2.5">
                {places.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3 py-3 text-xs text-slate-400">
                    No reliable match nearby — you can add one manually later.
                  </div>
                ) : (
                  places.map((place, index) => {
                    const key = essentialSelectionKey(place);
                    return (
                      <EssentialPlaceRow
                        key={key || `${place.name}-${index}`}
                        place={place}
                        selected={selectedEssentialKeys.includes(key)}
                        onToggle={() => onToggleEssential(key)}
                      />
                    );
                  })
                )}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export default function AddPropertyAroundStep({
  areaContext,
  locationLabel,
  country,
  propertyLatitude,
  propertyLongitude,
  gems,
  selectedLocalGemIds,
  essentialsBySlot,
  selectedEssentialKeys,
  loadingGems,
  loadingEssentials,
  essentialsError,
  onToggleGem,
  onSetCategoryGems,
  onToggleEssential,
  onSetEssentialKeys,
  onRefreshEssentials,
}: Props) {
  const [openSections, setOpenSections] = useState<Record<EssentialSectionId, boolean>>({
    localGems: true,
    safety: false,
    useful: false,
    transport: false,
    emergencyPhones: false,
  });
  const [openGemCategories, setOpenGemCategories] = useState<Record<string, boolean>>({});
  const [openEssentialSlots, setOpenEssentialSlots] = useState<Record<string, boolean>>({});

  const emergencyNumbers = useMemo(() => getCountryEmergencyNumbers(country), [country]);

  const gemsByCategory = useMemo(() => {
    // Always recompute distance from the live property pin (draft cache can be stale/null).
    const withDistance = gems.map((gem) => ({
      ...gem,
      distanceMeters: distanceMetersFromProperty(
        propertyLatitude,
        propertyLongitude,
        gem
      ),
    }));

    const map = new Map<string, AreaLocalGemOption[]>();
    for (const gem of withDistance) {
      const keys =
        gem.categories?.length > 0
          ? gem.categories
          : [gem.category || 'Other'];
      for (const rawKey of keys) {
        const key = String(rawKey || '').trim() || 'Other';
        const list = map.get(key) || [];
        // Avoid duplicates if categories repeats the same label.
        if (!list.some((g) => g.id === gem.id)) list.push(gem);
        map.set(key, list);
      }
    }

    return [...map.entries()]
      .map(([category, list]) => {
        const sorted = [...list].sort((a, b) => {
          const da = a.distanceMeters;
          const dbm = b.distanceMeters;
          if (da == null && dbm == null) return a.name.localeCompare(b.name);
          if (da == null) return 1;
          if (dbm == null) return -1;
          return da - dbm;
        });
        return [category, sorted.slice(0, LOCAL_GEMS_CLOSEST_COUNT)] as const;
      })
      .sort((a, b) => a[0].localeCompare(b[0]));
  }, [gems, propertyLatitude, propertyLongitude]);

  // First two categories open by default; newly seen categories stay collapsed.
  useEffect(() => {
    setOpenGemCategories((prev) => {
      const next = { ...prev };
      gemsByCategory.forEach(([category], index) => {
        if (next[category] === undefined) {
          next[category] = index < 2;
        }
      });
      return next;
    });
  }, [gemsByCategory]);

  useEffect(() => {
    const allSlots = [
      ...SAFETY_ESSENTIAL_SLOTS,
      ...USEFUL_ESSENTIAL_SLOTS,
      ...TRANSPORT_ESSENTIAL_SLOTS,
    ];
    setOpenEssentialSlots((prev) => {
      const next = { ...prev };
      const bySection: Record<string, EssentialSlotDef[]> = {
        safety: SAFETY_ESSENTIAL_SLOTS,
        useful: USEFUL_ESSENTIAL_SLOTS,
        transport: TRANSPORT_ESSENTIAL_SLOTS,
      };
      for (const sectionSlots of Object.values(bySection)) {
        sectionSlots.forEach((slot, index) => {
          if (next[slot.id] === undefined) next[slot.id] = index < 2;
        });
      }
      // Ensure we don't leave unknown keys blocking updates
      void allSlots;
      return next;
    });
  }, []);

  const selectedCount = selectedLocalGemIds.length;
  const displayedGemCount = gemsByCategory.reduce((sum, [, list]) => sum + list.length, 0);
  const safetyFound = countEssentialsFound(essentialsBySlot, SAFETY_ESSENTIAL_SLOTS);
  const usefulFound = countEssentialsFound(essentialsBySlot, USEFUL_ESSENTIAL_SLOTS);
  const transportFound = countEssentialsFound(essentialsBySlot, TRANSPORT_ESSENTIAL_SLOTS);

  const toggleSection = (section: EssentialSectionId) => {
    setOpenSections((prev) => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-4">
      <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-vailo-dark">Around the property</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-xl">
              Proposals use the listing pin. Nothing here is final — you can skip now and add or
              edit everything later in Local gems and House guide.
            </p>
          </div>
          <AdminButton
            type="button"
            variant="secondary"
            onClick={onRefreshEssentials}
            disabled={loadingEssentials}
            className="shrink-0"
          >
            {loadingEssentials ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RefreshCw size={15} />
            )}
            Refresh nearby
          </AdminButton>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-slate-50 border border-slate-200 px-3 py-1.5 text-xs text-slate-600">
            <MapPin size={13} className="text-[#0b4f5c]" />
            <span className="font-semibold text-vailo-dark">
              {locationLabel || 'Property location'}
            </span>
            {areaContext?.areaName ? (
              <span className="text-slate-400">· Master area {areaContext.areaName}</span>
            ) : null}
          </div>
        </div>

        <div className="flex items-start gap-2.5 rounded-2xl border border-teal-100 bg-teal-50/70 px-3.5 py-3 text-sm text-teal-950">
          <Info size={16} className="shrink-0 mt-0.5 text-teal-700" />
          <p>
            <span className="font-semibold">You can add these later.</span> Keep what looks right
            now, or finish without selecting — Local gems, Safety, Useful info, and Transportation
            stay editable after the property is created.
          </p>
        </div>

        {essentialsError ? (
          <p className="text-sm text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">
            {essentialsError}
          </p>
        ) : null}
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white overflow-hidden divide-y divide-slate-100">
        {/* Local gems */}
        <div>
          <SectionHeader
            section="localGems"
            open={openSections.localGems}
            countLabel={
              loadingGems
                ? 'Loading area gems…'
                : displayedGemCount
                  ? `${selectedCount} selected · ${displayedGemCount} shown`
                  : 'None in this area yet — add later'
            }
            onToggle={() => toggleSection('localGems')}
          />
          {openSections.localGems ? (
            <div className="px-4 pb-4 space-y-4">
              <p className="text-xs text-gray-500">{SECTION_META.localGems.blurb}</p>

              <div className="rounded-xl border border-[#0b4f5c]/20 bg-[#0b4f5c]/5 px-4 py-3 flex items-start gap-2.5">
                <Info size={18} className="shrink-0 mt-0.5 text-[#0b4f5c]" />
                <p className="text-sm text-[#0b4f5c]">
                  <span className="font-bold">You can add more local gems later.</span>{' '}
                  Pick from these now, or finish and add from the area / property Local gems page
                  anytime.
                </p>
              </div>

              {loadingGems ? (
                <div className="flex items-center gap-2 text-sm text-[#0b4f5c] py-6 justify-center">
                  <Loader2 size={16} className="animate-spin" />
                  Loading local gems…
                </div>
              ) : gems.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
                  <p className="text-sm font-medium text-slate-600">
                    No local gems saved for this area yet
                  </p>
                  <p className="text-xs text-slate-500 mt-1">
                    You can add them later from the area or property Local gems page.
                  </p>
                </div>
              ) : (
                <div className="rounded-2xl border border-slate-100 overflow-hidden divide-y divide-slate-100">
                  {gemsByCategory.map(([category, list]) => {
                    const isOpen = openGemCategories[category] === true;
                    const selectedInCategory = list.filter((g) =>
                      selectedLocalGemIds.includes(g.id)
                    ).length;
                    const allSelected =
                      list.length > 0 && selectedInCategory === list.length;
                    const someSelected = selectedInCategory > 0 && !allSelected;

                    return (
                      <div key={category}>
                        <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50/80">
                          <button
                            type="button"
                            onClick={() =>
                              setOpenGemCategories((prev) => ({
                                ...prev,
                                [category]: !isOpen,
                              }))
                            }
                            className="min-w-0 flex-1 flex items-center gap-2 text-left"
                          >
                            {isOpen ? (
                              <ChevronUp size={16} className="text-gray-400 shrink-0" />
                            ) : (
                              <ChevronDown size={16} className="text-gray-400 shrink-0" />
                            )}
                            <span className="text-xs font-bold uppercase tracking-wide text-slate-600 truncate">
                              {category}
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0">
                              ({list.length}
                              {selectedInCategory
                                ? ` · ${selectedInCategory} selected`
                                : ''}
                              )
                            </span>
                          </button>

                          <label
                            className="inline-flex items-center gap-1.5 shrink-0 cursor-pointer select-none text-[11px] font-semibold text-slate-600 pl-2 border-l border-slate-200"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <input
                              type="checkbox"
                              className="h-3.5 w-3.5 rounded border-slate-300 text-[#0b4f5c] focus:ring-[#0b4f5c]/30"
                              checked={allSelected}
                              ref={(el) => {
                                if (el) el.indeterminate = someSelected;
                              }}
                              onChange={() =>
                                onSetCategoryGems(
                                  list.map((g) => g.id),
                                  !allSelected
                                )
                              }
                              aria-label={
                                allSelected
                                  ? `Deselect all in ${category}`
                                  : `Select all in ${category}`
                              }
                            />
                            {allSelected ? 'Deselect all' : 'Select all'}
                          </label>
                        </div>

                        {isOpen ? (
                          <div className="px-3 py-3 flex gap-3 overflow-x-auto">
                            {list.map((gem, index) => (
                              <PlaceCard
                                key={gem.id}
                                title={gem.name}
                                subtitle={gem.address || gem.description}
                                meta={
                                  formatDistance(gem.distanceMeters)
                                    ? `#${index + 1} · ${formatDistance(gem.distanceMeters)}`
                                    : `#${index + 1}`
                                }
                                photoUrl={gem.photoUrl}
                                mirrorContext={
                                  areaContext
                                    ? {
                                        country: areaContext.country,
                                        areaId: areaContext.areaId,
                                        docId: gem.id,
                                        googlePlaceId: gem.googlePlaceId,
                                      }
                                    : { googlePlaceId: gem.googlePlaceId }
                                }
                                selectable
                                selected={selectedLocalGemIds.includes(gem.id)}
                                onToggle={() => onToggleGem(gem.id)}
                              />
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

            </div>
          ) : null}
        </div>

        {/* Safety */}
        <div>
          <SectionHeader
            section="safety"
            open={openSections.safety}
            countLabel={
              loadingEssentials ? 'Finding nearby…' : `${safetyFound} places`
            }
            onToggle={() => toggleSection('safety')}
          />
          {openSections.safety ? (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">{SECTION_META.safety.blurb}</p>
              <EssentialSlotsAccordion
                slots={SAFETY_ESSENTIAL_SLOTS}
                essentialsBySlot={essentialsBySlot}
                selectedEssentialKeys={selectedEssentialKeys}
                openSlotIds={openEssentialSlots}
                onToggleSlotOpen={(slotId) =>
                  setOpenEssentialSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }))
                }
                onToggleEssential={onToggleEssential}
                onSetEssentialKeys={onSetEssentialKeys}
              />
            </div>
          ) : null}
        </div>

        {/* Useful */}
        <div>
          <SectionHeader
            section="useful"
            open={openSections.useful}
            countLabel={
              loadingEssentials ? 'Finding nearby…' : `${usefulFound} places`
            }
            onToggle={() => toggleSection('useful')}
          />
          {openSections.useful ? (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">{SECTION_META.useful.blurb}</p>
              <EssentialSlotsAccordion
                slots={USEFUL_ESSENTIAL_SLOTS}
                essentialsBySlot={essentialsBySlot}
                selectedEssentialKeys={selectedEssentialKeys}
                openSlotIds={openEssentialSlots}
                onToggleSlotOpen={(slotId) =>
                  setOpenEssentialSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }))
                }
                onToggleEssential={onToggleEssential}
                onSetEssentialKeys={onSetEssentialKeys}
              />
            </div>
          ) : null}
        </div>

        {/* Transport */}
        <div>
          <SectionHeader
            section="transport"
            open={openSections.transport}
            countLabel={
              loadingEssentials ? 'Finding airports & ports…' : `${transportFound} places`
            }
            onToggle={() => toggleSection('transport')}
          />
          {openSections.transport ? (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">{SECTION_META.transport.blurb}</p>
              <EssentialSlotsAccordion
                slots={TRANSPORT_ESSENTIAL_SLOTS}
                essentialsBySlot={essentialsBySlot}
                selectedEssentialKeys={selectedEssentialKeys}
                openSlotIds={openEssentialSlots}
                onToggleSlotOpen={(slotId) =>
                  setOpenEssentialSlots((prev) => ({ ...prev, [slotId]: !prev[slotId] }))
                }
                onToggleEssential={onToggleEssential}
                onSetEssentialKeys={onSetEssentialKeys}
              />
            </div>
          ) : null}
        </div>

        {/* Emergency phones */}
        <div>
          <SectionHeader
            section="emergencyPhones"
            open={openSections.emergencyPhones}
            countLabel={`${emergencyNumbers.length} numbers for ${country.trim() || 'this country'}`}
            onToggle={() => toggleSection('emergencyPhones')}
          />
          {openSections.emergencyPhones ? (
            <div className="px-4 pb-4 space-y-3">
              <p className="text-xs text-gray-500">{SECTION_META.emergencyPhones.blurb}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {emergencyNumbers.map((row) => (
                  <div
                    key={row.id}
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-3 flex items-start gap-3 shadow-sm"
                  >
                    <span className="mt-0.5 text-[#0b4f5c]">
                      <Phone size={16} />
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-vailo-dark">{row.label}</p>
                      <p className="text-base font-bold tabular-nums text-[#0b4f5c] mt-0.5">
                        {row.number}
                      </p>
                      {row.note ? (
                        <p className="text-[11px] text-gray-400 mt-0.5">{row.note}</p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
