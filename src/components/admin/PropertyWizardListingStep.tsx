import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Building2,
  CalendarSync,
  FileText,
  Image as ImageIcon,
  Loader2,
  MapPin,
  MessageCircle,
  Sparkles,
  Trash2,
  UploadCloud,
  Wand2,
  X,
} from 'lucide-react';
import {
  EMPTY_WIZARD_LISTING,
  isWizardListingComplete,
  newWizardListingInternalRefCode,
  referenceUrlRowsWithTrailingBlank,
  wizardListingFieldDomId,
  type WizardListingDraft,
  type WizardListingFieldErrors,
  type WizardListingFieldKey,
} from '../../lib/wizardListingOnboarding';
import { autofillListingFromGoogleMaps } from '../../lib/wizardMapsAutofill';
import { useToast } from '../../context/ToastContext';
import { AdminButton, AdminInput, AdminLabel, AdminSelect } from './AdminPageHeader';
import MunicipalityAreaField from './MunicipalityAreaField';
import { loadCountryNames } from '../../lib/countryNames';
import { useAdminSession } from '../../context/AdminSessionContext';
import ListingLocationPinMap from './ListingLocationPinMap';

export type { WizardListingDraft, WizardListingFieldErrors, WizardListingFieldKey };
export { EMPTY_WIZARD_LISTING, isWizardListingComplete };

type Props = {
  value: WizardListingDraft;
  onChange: (next: WizardListingDraft) => void;
  photoFile: File | null;
  onPhotoFileChange: (file: File | null, previewUrl: string | null) => void;
  photoPreview: string | null;
  calendarSyncEnabled: boolean;
  fieldErrors?: WizardListingFieldErrors;
  onClearFieldError?: (key: WizardListingFieldKey) => void;
  onboardingFiles?: File[];
  onOnboardingFilesChange?: (files: File[]) => void;
  /** Optional allocated-owner control (Property Listings add flow). */
  ownerSlot?: ReactNode;
  /** Hide the category hero banner (used on the standalone Add Property page). */
  hideHero?: boolean;
  /** Hide House Guide notes / reference URLs / file upload (Add Property step 1). */
  hideHouseGuideNotes?: boolean;
  /**
   * Add Property step 3: only Notes for House Guide (links, paste, files).
   * Listing / Maps / photo fields stay hidden.
   */
  houseGuideOnly?: boolean;
};

function slugFromName(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
}

function fieldClass(hasError: boolean, extra = '') {
  return `${extra} ${
    hasError
      ? 'border-rose-400 ring-2 ring-rose-200 bg-rose-50/40 focus:border-rose-500 focus:ring-rose-200'
      : ''
  }`.trim();
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="mt-1.5 text-xs font-semibold text-rose-700 flex items-start gap-1.5">
      <AlertCircle size={13} className="shrink-0 mt-0.5" />
      <span>{message}</span>
    </p>
  );
}

export default function PropertyWizardListingStep({
  value,
  onChange,
  photoFile,
  onPhotoFileChange,
  photoPreview,
  calendarSyncEnabled,
  fieldErrors = {},
  onClearFieldError,
  onboardingFiles = [],
  onOnboardingFilesChange,
  ownerSlot,
  hideHero = false,
  hideHouseGuideNotes = false,
  houseGuideOnly = false,
}: Props) {
  const showListingFields = !houseGuideOnly;
  const showHouseGuideNotes = houseGuideOnly || !hideHouseGuideNotes;
  const toast = useToast();
  const { isPlatformAdmin } = useAdminSession();
  const canEditAdminFields = isPlatformAdmin;
  const notesFileInputRef = useRef<HTMLInputElement>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [isMagicFilling, setIsMagicFilling] = useState(false);
  const [slugManual, setSlugManual] = useState(false);
  const [mapsError, setMapsError] = useState<string | null>(null);
  const [notesDragOver, setNotesDragOver] = useState(false);
  const [photoDragOver, setPhotoDragOver] = useState(false);

  const referenceUrlRows = referenceUrlRowsWithTrailingBlank(value.referenceUrls);

  useEffect(() => {
    loadCountryNames()
      .then(setCountries)
      .catch((err) => console.error('Failed to load countries:', err));
  }, []);

  const patch = (partial: Partial<WizardListingDraft>) => onChange({ ...value, ...partial });

  useEffect(() => {
    if (value.internalRefCode.trim()) return;
    patch({ internalRefCode: newWizardListingInternalRefCode() });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed ref once when empty
  }, [value.internalRefCode]);

  const clearError = (key: WizardListingFieldKey) => onClearFieldError?.(key);

  useEffect(() => {
    if (slugManual) return;
    const nextSlug = slugFromName(value.propertyTypeName);
    if (nextSlug === value.urlSlug) return;
    patch({ urlSlug: nextSlug });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync slug from name only
  }, [value.propertyTypeName, slugManual, value.urlSlug]);

  const handleAutoFillMaps = async () => {
    const url = value.googleMapsUrl.trim();
    if (!url) {
      setMapsError('Paste a Google Maps, maps.app.goo.gl, or share.google link in this field first.');
      clearError('googleMapsUrl');
      toast.warning('Paste a Maps link in the highlighted field, then click Auto-fill.');
      return;
    }

    setMapsError(null);
    setIsMagicFilling(true);
    try {
      const result = await autofillListingFromGoogleMaps(value, { keepManualSlug: slugManual });
      // Apply listing fields first (name, address, pin, …). Photo preview is a separate
      // parent channel — parents MUST merge with functional setState so they don't wipe
      // this draft (a stale closure here previously left only the photo filled).
      onChange(result.draft);
      if (result.photoUrl) {
        onPhotoFileChange(null, result.photoUrl);
      }
      setMapsError(null);
      if (result.warning) toast.warning(result.warning);
      const filledBits = [
        result.listingName ? 'name' : null,
        result.draft.addressLine.trim() ? 'address' : null,
        result.draft.city.trim() ? 'city' : null,
        result.draft.latitude.trim() && result.draft.longitude.trim() ? 'pin' : null,
        result.photoUrl ? 'photo' : null,
      ].filter(Boolean);
      toast.success(
        filledBits.length
          ? `Filled from Google Maps: ${filledBits.join(', ')}.`
          : 'Address and map details filled from Google Maps.'
      );
    } catch (error) {
      console.error('Maps auto-fill error:', error);
      const partial = (error as Error & { partialDraft?: WizardListingDraft }).partialDraft;
      if (partial) {
        onChange(partial);
        setMapsError(
          error instanceof Error
            ? error.message
            : 'Coordinates only — fill the highlighted address fields below manually.'
        );
        toast.info('Coordinates saved. Complete the highlighted address fields manually.');
      } else {
        const message =
          error instanceof Error
            ? error.message
            : 'Could not read this Maps link. Or skip Maps and fill the address fields below.';
        setMapsError(message);
        toast.error(message);
      }
    } finally {
      setIsMagicFilling(false);
    }
  };

  const errorEntries = Object.entries(fieldErrors).filter(([, msg]) => Boolean(msg));
  const mapsFieldError = mapsError || fieldErrors.googleMapsUrl;

  return (
    <div className="space-y-6">
      {showListingFields ? (
      <div
        id={wizardListingFieldDomId('googleMapsUrl')}
        className={`rounded-3xl border bg-white p-5 sm:p-6 space-y-4 ${
          mapsFieldError ? 'border-rose-300 ring-2 ring-rose-100' : 'border-slate-100'
        }`}
      >
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <MapPin size={18} className="text-teal-600" />
          Google Maps
        </div>
        <p className="text-sm text-slate-500 -mt-1">
          <span className="underline underline-offset-2">Optional but recommended</span>: paste a
          Maps place link and auto-fill listing name, URL slug, address, photo, and coordinates. If
          the place is not on Maps, skip this and fill fields below.
        </p>
        <div className="flex flex-col sm:flex-row gap-2">
          <AdminInput
            type="url"
            value={value.googleMapsUrl}
            onChange={(e) => {
              setMapsError(null);
              clearError('googleMapsUrl');
              patch({ googleMapsUrl: e.target.value });
            }}
            placeholder="maps/place/…, maps.app.goo.gl, share.google/… (cid= links: open first, then paste place URL)"
            className={`flex-1 ${fieldClass(Boolean(mapsFieldError))}`}
            aria-invalid={Boolean(mapsFieldError)}
          />
          <AdminButton
            type="button"
            onClick={() => void handleAutoFillMaps()}
            disabled={isMagicFilling || !value.googleMapsUrl.trim()}
            className="shrink-0"
          >
            {isMagicFilling ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Wand2 size={16} />
            )}
            Auto-fill
          </AdminButton>
        </div>
        <FieldError message={mapsFieldError || undefined} />
      </div>
      ) : null}

      {showListingFields && !hideHero ? (
        <div className="rounded-3xl border border-sky-100 bg-gradient-to-br from-sky-50/90 via-teal-50/40 to-emerald-50/30 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="h-11 w-11 rounded-2xl bg-white/80 text-sky-700 flex items-center justify-center shrink-0 shadow-sm">
              <Building2 size={20} strokeWidth={1.75} />
            </span>
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-sky-700 mb-1">
                Category · Property listing
              </p>
              <h3 className="text-base sm:text-lg font-bold text-slate-800 font-luxury">
                Add your first unit
              </h3>
              <p className="text-sm text-slate-600 mt-1.5 leading-relaxed max-w-2xl">
                Confirm or finish the listing details below. Network URLs (Airbnb, Booking.com) are
                saved on the listing. House Guide is filled next via AI Import.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {showListingFields && errorEntries.length > 0 ? (
        <div
          className="rounded-3xl border-2 border-rose-300 bg-rose-50 px-4 py-4 sm:px-5"
          role="alert"
        >
          <p className="text-sm font-bold text-rose-900 flex items-center gap-2">
            <AlertCircle size={16} className="shrink-0" />
            {errorEntries.length === 1
              ? '1 required field is missing'
              : `${errorEntries.length} required fields are missing`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {errorEntries.map(([key, msg]) => (
              <li key={key}>
                <button
                  type="button"
                  className="text-left text-sm text-rose-800 hover:underline"
                  onClick={() =>
                    document
                      .getElementById(wizardListingFieldDomId(key as WizardListingFieldKey))
                      ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
                  }
                >
                  • {msg}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {showHouseGuideNotes ? (
        <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-5">
          {!houseGuideOnly ? (
            <div>
              <div className="flex items-center gap-2 text-slate-800 font-bold">
                <FileText size={18} className="text-amber-600" />
                Notes for House Guide
              </div>
              <p className="text-sm text-slate-500 mt-1">
                Feed the guest AI what it should know about this property. Add listing URLs, paste
                text, or upload files — once is enough; you can add more later.
              </p>
            </div>
          ) : null}

          <div className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <div>
              <AdminLabel>Property website URLs</AdminLabel>
              <p className="text-xs text-slate-500 mt-0.5 mb-2">
                Airbnb, Booking, your own site — pages the AI can learn from.
              </p>
            </div>
            {referenceUrlRows.map((url, index) => {
              const isLast = index === referenceUrlRows.length - 1;
              const isTrailingBlank = isLast && !url.trim();
              return (
                <div key={`ref-url-${index}`} className="space-y-1">
                  <div className="flex gap-2 items-center">
                    <AdminInput
                      type="url"
                      value={url}
                      onChange={(e) => {
                        const next = [...referenceUrlRows];
                        next[index] = e.target.value;
                        patch({ referenceUrls: referenceUrlRowsWithTrailingBlank(next) });
                      }}
                      placeholder="https://…"
                      className="flex-1"
                    />
                    {url.trim() && referenceUrlRows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => {
                          const next = referenceUrlRows.filter((_, i) => i !== index);
                          patch({ referenceUrls: referenceUrlRowsWithTrailingBlank(next) });
                        }}
                        className="shrink-0 h-11 w-11 rounded-xl border border-slate-200 text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 flex items-center justify-center"
                        aria-label="Remove URL"
                      >
                        <Trash2 size={16} />
                      </button>
                    ) : null}
                  </div>
                  {isTrailingBlank ? (
                    <p className="text-xs text-slate-500 pl-0.5">Add another URL, or leave blank</p>
                  ) : null}
                </div>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <AdminLabel htmlFor="onboardingNotes">Paste text</AdminLabel>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              Check-in steps, Wi‑Fi, house rules, appliance tips — anything guests ask about.
            </p>
            <textarea
              id="onboardingNotes"
              value={value.onboardingNotes}
              onChange={(e) => patch({ onboardingNotes: e.target.value })}
              rows={5}
              placeholder="Paste instructions or answers here…"
              className="admin-textarea w-full"
            />
          </div>

          <div className="rounded-2xl border border-slate-100 bg-slate-50/60 p-4">
            <AdminLabel>Upload files</AdminLabel>
            <p className="text-xs text-slate-500 mt-0.5 mb-2">
              House manuals, PDFs, photos, or docs the AI should read.
            </p>
            <div
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotesDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotesDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotesDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setNotesDragOver(false);
                const files = Array.from(e.dataTransfer.files || []);
                if (!files.length || !onOnboardingFilesChange) return;
                onOnboardingFilesChange([
                  ...onboardingFiles,
                  ...files.filter((f) => !onboardingFiles.some((x) => x.name === f.name)),
                ]);
              }}
              className={`flex flex-col items-center justify-center min-h-[140px] border-2 border-dashed rounded-2xl px-4 py-6 transition-colors ${
                notesDragOver
                  ? 'border-teal-400 bg-teal-50'
                  : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40'
              }`}
            >
              <UploadCloud size={26} className="text-teal-600/80 mb-2" />
              <p className="text-sm font-semibold text-slate-700">Drag & drop files here</p>
              <p className="text-xs text-slate-500 mt-1">PDF, TXT, MD, CSV, photos</p>
              <button
                type="button"
                onClick={() => notesFileInputRef.current?.click()}
                className="mt-3 text-sm font-bold text-teal-800 hover:underline"
              >
                Browse files
              </button>
              <input
                ref={notesFileInputRef}
                type="file"
                multiple
                accept=".txt,.md,.csv,.pdf,image/*,text/plain,application/pdf"
                className="hidden"
                onChange={(e) => {
                  const files = Array.from(e.target.files || []);
                  e.target.value = '';
                  if (!files.length || !onOnboardingFilesChange) return;
                  onOnboardingFilesChange([
                    ...onboardingFiles,
                    ...files.filter((f) => !onboardingFiles.some((x) => x.name === f.name)),
                  ]);
                }}
              />
            </div>
            {onboardingFiles.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {onboardingFiles.map((file) => (
                  <li
                    key={file.name}
                    className="flex items-center justify-between text-sm bg-white border border-slate-200 rounded-xl px-3 py-2"
                  >
                    <span className="truncate text-slate-700">{file.name}</span>
                    <button
                      type="button"
                      onClick={() =>
                        onOnboardingFilesChange?.(
                          onboardingFiles.filter((f) => f.name !== file.name)
                        )
                      }
                      className="text-slate-400 hover:text-rose-600 p-1"
                      aria-label={`Remove ${file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>

          {calendarSyncEnabled ? (
            <div>
              <AdminLabel htmlFor="iCalUrl">
                <span className="inline-flex items-center gap-1.5">
                  <CalendarSync size={14} /> iCal feed URL (optional)
                </span>
              </AdminLabel>
              <AdminInput
                id="iCalUrl"
                type="url"
                value={value.iCalUrl}
                onChange={(e) => patch({ iCalUrl: e.target.value })}
                placeholder="Export link from your channel manager"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {showListingFields ? (
      <>
      <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <Building2 size={18} className="text-teal-600" />
          Listing identity & address
        </div>
        <p className="text-sm text-slate-500 -mt-1">
          Required to create the listing. Maps Auto-fill usually completes name, slug, and address;
          otherwise fill them here.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div id={wizardListingFieldDomId('propertyTypeName')}>
            <AdminLabel htmlFor="propertyTypeName">Listing name *</AdminLabel>
            <AdminInput
              id="propertyTypeName"
              required
              value={value.propertyTypeName}
              onChange={(e) => {
                clearError('propertyTypeName');
                patch({ propertyTypeName: e.target.value });
              }}
              placeholder="e.g. Sea View Villa"
              className={fieldClass(Boolean(fieldErrors.propertyTypeName))}
              aria-invalid={Boolean(fieldErrors.propertyTypeName)}
            />
            <FieldError message={fieldErrors.propertyTypeName} />
            <p className="text-xs text-gray-500 mt-1">
              The name guests see for this unit — e.g. Garden Suite, Apartment 2, Main House.
            </p>
          </div>
          <div id={wizardListingFieldDomId('urlSlug')}>
            <AdminLabel htmlFor="listingSlug">URL slug *</AdminLabel>
            <AdminInput
              id="listingSlug"
              required
              readOnly={!canEditAdminFields}
              value={value.urlSlug}
              onChange={(e) => {
                if (!canEditAdminFields) return;
                setSlugManual(true);
                clearError('urlSlug');
                patch({
                  urlSlug: e.target.value.toLowerCase().replace(/[^a-z0-9-]+/g, ''),
                });
              }}
              placeholder="e.g. sea-view-villa"
              className={`font-mono text-sm ${
                canEditAdminFields ? '' : 'bg-slate-50 text-slate-600'
              } ${fieldClass(Boolean(fieldErrors.urlSlug))}`}
              aria-invalid={Boolean(fieldErrors.urlSlug)}
            />
            <FieldError message={fieldErrors.urlSlug} />
            <p className="text-xs text-gray-500 mt-1">
              {canEditAdminFields
                ? 'Guest link for this listing — e.g. /sea-view-villa, /garden-suite.'
                : 'Generated from the listing name. Only admins can edit the slug.'}
            </p>
          </div>
          <div className="md:col-span-2" id={wizardListingFieldDomId('addressLine')}>
            <AdminLabel htmlFor="addressLine">Street address *</AdminLabel>
            <AdminInput
              id="addressLine"
              required
              value={value.addressLine}
              onChange={(e) => {
                clearError('addressLine');
                patch({ addressLine: e.target.value });
              }}
              className={fieldClass(Boolean(fieldErrors.addressLine))}
              aria-invalid={Boolean(fieldErrors.addressLine)}
            />
            <FieldError message={fieldErrors.addressLine} />
          </div>
          <div id={wizardListingFieldDomId('country')}>
            <AdminLabel htmlFor="listingCountry">Country *</AdminLabel>
            <AdminSelect
              id="listingCountry"
              required
              value={value.country}
              onChange={(e) => {
                clearError('country');
                clearError('city');
                patch({ country: e.target.value, city: '', area: value.area });
              }}
              className={fieldClass(Boolean(fieldErrors.country))}
              aria-invalid={Boolean(fieldErrors.country)}
            >
              <option value="" disabled>
                Select country
              </option>
              {countries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </AdminSelect>
            <FieldError message={fieldErrors.country} />
          </div>
          <div id={wizardListingFieldDomId('city')}>
            <MunicipalityAreaField
              country={value.country}
              value={value.city}
              required
              label="City / Master Area *"
              helpText="Municipality for local gems and area content. Created automatically if new."
              onChange={(next) => {
                clearError('city');
                patch({ city: next.name });
              }}
            />
            <FieldError message={fieldErrors.city} />
          </div>
          <div id={wizardListingFieldDomId('area')}>
            <AdminLabel htmlFor="listingArea">Area</AdminLabel>
            <AdminInput
              id="listingArea"
              value={value.area}
              onChange={(e) => {
                clearError('area');
                patch({ area: e.target.value });
              }}
              placeholder="e.g. Old Town"
              className={fieldClass(Boolean(fieldErrors.area))}
              aria-invalid={Boolean(fieldErrors.area)}
            />
            <FieldError message={fieldErrors.area} />
          </div>
          <div>
            <AdminLabel htmlFor="postCode">Postal code</AdminLabel>
            <AdminInput
              id="postCode"
              value={value.postCode}
              onChange={(e) => patch({ postCode: e.target.value })}
            />
          </div>

          <div id={wizardListingFieldDomId('coordinates')} className="md:col-span-2">
            <ListingLocationPinMap
              latitude={value.latitude}
              longitude={value.longitude}
              addressLine={value.addressLine}
              area={value.area}
              city={value.city}
              country={value.country}
              postCode={value.postCode}
              onChange={({ latitude, longitude }) => {
                clearError('coordinates');
                patch({ latitude, longitude });
              }}
            />
            <FieldError message={fieldErrors.coordinates} />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <MessageCircle size={18} className="text-sky-600" />
          Guest Wi‑Fi &amp; WhatsApp
        </div>
        <p className="text-sm text-slate-500 -mt-1">
          Shown to guests on the portal — network login and a direct WhatsApp contact button.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <AdminLabel htmlFor="wifiName">WiFi Name</AdminLabel>
            <AdminInput
              id="wifiName"
              value={value.wifiName}
              onChange={(e) => patch({ wifiName: e.target.value })}
              placeholder="e.g. Guest_WiFi"
            />
          </div>
          <div>
            <AdminLabel htmlFor="wifiPassword">WiFi Password</AdminLabel>
            <AdminInput
              id="wifiPassword"
              value={value.wifiPassword}
              onChange={(e) => patch({ wifiPassword: e.target.value })}
            />
          </div>
          <div className="md:col-span-2">
            <AdminLabel htmlFor="whatsapp">WhatsApp</AdminLabel>
            <div className="relative">
              <MessageCircle className="absolute left-3 top-2.5 text-gray-400" size={18} />
              <AdminInput
                id="whatsapp"
                type="tel"
                value={value.whatsapp}
                onChange={(e) => patch({ whatsapp: e.target.value })}
                placeholder="+30 69… (shown to guests as a contact button)"
                className="pl-10"
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              When filled in, guests see a WhatsApp button on the portal to message you directly.
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <MapPin size={18} className="text-teal-600" />
          Maps &amp; admin details
        </div>
        <p className="text-sm text-slate-500 -mt-1">
          Google place details and internal reference. Rating, Place ID, and ref stay admin-managed
          when you are not a platform admin.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <AdminLabel htmlFor="googleRating">Google rating (1–5)</AdminLabel>
            <AdminInput
              id="googleRating"
              type="number"
              min={0}
              max={5}
              step={0.1}
              readOnly={!canEditAdminFields}
              value={value.googleRating}
              onChange={(e) => {
                if (!canEditAdminFields) return;
                patch({ googleRating: e.target.value });
              }}
              placeholder="Filled from Maps auto-fill"
              className={canEditAdminFields ? '' : 'bg-slate-50 text-slate-600'}
            />
            <p className="text-xs text-gray-500 mt-1">
              {canEditAdminFields
                ? 'Shown on the guest portal; guests can tap to leave a Google review.'
                : 'Filled from Maps. Only admins can edit rating.'}
            </p>
          </div>
          <div>
            <AdminLabel htmlFor="googlePlaceId">Google Place ID</AdminLabel>
            <AdminInput
              id="googlePlaceId"
              readOnly={!canEditAdminFields}
              value={value.googlePlaceId}
              onChange={(e) => {
                if (!canEditAdminFields) return;
                patch({ googlePlaceId: e.target.value });
              }}
              placeholder="Auto-filled from Maps"
              className={`font-mono text-xs ${
                canEditAdminFields ? '' : 'bg-slate-50 text-slate-600'
              }`}
            />
          </div>
          <div className="md:col-span-2">
            <AdminLabel htmlFor="internalRefCode">Internal Reference Code *</AdminLabel>
            <AdminInput
              id="internalRefCode"
              required
              readOnly={!canEditAdminFields}
              value={value.internalRefCode}
              onChange={(e) => {
                if (!canEditAdminFields) return;
                patch({ internalRefCode: e.target.value });
              }}
              className={canEditAdminFields ? '' : 'bg-slate-50 text-slate-600'}
            />
            {!canEditAdminFields ? (
              <p className="text-xs text-gray-500 mt-1">
                Auto-generated. Only admins can edit the reference code.
              </p>
            ) : null}
          </div>
          {ownerSlot ? <div className="md:col-span-2">{ownerSlot}</div> : null}
        </div>
      </div>

      <div className="rounded-3xl border border-slate-100 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-center gap-2 text-slate-800 font-bold">
          <ImageIcon size={18} className="text-emerald-600" />
          Cover photo
        </div>
        <p className="text-sm text-slate-500 -mt-1">
          Optional. Maps Auto-fill may already set a Google photo — you can replace it here.
        </p>

        <div
          onDragEnter={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPhotoDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPhotoDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPhotoDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setPhotoDragOver(false);
            const file = Array.from(e.dataTransfer.files || []).find((f) =>
              f.type.startsWith('image/')
            );
            if (!file) return;
            onPhotoFileChange(file, URL.createObjectURL(file));
          }}
          className={`rounded-2xl border-2 border-dashed px-4 py-5 transition-colors ${
            photoDragOver
              ? 'border-teal-400 bg-teal-50'
              : 'border-slate-200 bg-slate-50/70 hover:border-teal-300 hover:bg-teal-50/40'
          }`}
        >
          <div className="flex flex-col sm:flex-row gap-4 items-center sm:items-start">
            <div className="h-28 w-40 rounded-xl border border-slate-200 bg-white overflow-hidden flex items-center justify-center shrink-0">
              {photoPreview || value.photoUrl ? (
                <img
                  src={photoPreview || value.photoUrl}
                  alt="Listing cover"
                  className="h-full w-full object-cover"
                />
              ) : (
                <UploadCloud size={22} className="text-slate-300" />
              )}
            </div>

            <div className="min-w-0 flex-1 text-center sm:text-left">
              <p className="text-sm font-semibold text-slate-700">
                {photoPreview || value.photoUrl || photoFile
                  ? 'Replace cover photo'
                  : 'Add a cover photo'}
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Drag & drop an image here, or browse from your device.
              </p>
              <div className="mt-3 flex flex-wrap items-center justify-center sm:justify-start gap-2">
                <AdminButton
                  type="button"
                  variant="secondary"
                  onClick={() => photoFileInputRef.current?.click()}
                >
                  <ImageIcon size={16} />
                  Browse photo
                </AdminButton>
                {(photoFile || value.photoUrl || photoPreview) && (
                  <button
                    type="button"
                    className="text-sm font-semibold text-rose-600 hover:underline px-2 py-1.5"
                    onClick={() => {
                      onPhotoFileChange(null, null);
                      patch({ photoUrl: '' });
                      if (photoFileInputRef.current) photoFileInputRef.current.value = '';
                    }}
                  >
                    Remove
                  </button>
                )}
              </div>
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  e.target.value = '';
                  if (!file) return;
                  onPhotoFileChange(file, URL.createObjectURL(file));
                }}
              />
            </div>
          </div>
        </div>
      </div>
      </>
      ) : null}

      {showHouseGuideNotes ? (
        <div className="rounded-3xl border border-amber-100 bg-amber-50/60 px-4 py-3.5 sm:px-5">
          <p className="text-sm text-amber-950 leading-relaxed flex items-start gap-2">
            <Sparkles size={16} className="text-amber-600 shrink-0 mt-0.5" />
            <span>
              {houseGuideOnly ? (
                <>
                  <span className="font-semibold">House Guide + chatbot:</span> what you add here
                  powers both. Guest stays keep teaching it for next visitors — top up anytime.
                </>
              ) : (
                <>
                  <span className="font-semibold">What happens next:</span> we save the property +
                  listing, then AI Import starts from your links, pasted text, and files.
                </>
              )}
            </span>
          </p>
        </div>
      ) : null}
    </div>
  );
}
