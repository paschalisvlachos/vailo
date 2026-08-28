import { useEffect, useMemo, useRef, useState } from 'react';
import { Car, CheckCircle2, ChevronRight, Loader2, Shield, Upload } from 'lucide-react';
import { httpsCallableMessage } from '../../lib/callableError';
import { submitPreArrivalCheckInCallable } from '../../lib/guestPortalCallables';
import type { GuestPortalSession } from '../../lib/guestAccess';
import { getSortedCountryNames } from '../../lib/countryNames';
import {
  PRE_ARRIVAL_SPECIAL_REQUESTS_MAX,
  PRE_ARRIVAL_IDENTITY_GUIDANCE,
  PRE_ARRIVAL_ID_DOCUMENT_TYPES,
  buildGuestFullName,
  buildPreArrivalIdDetailsPayload,
  buildPreArrivalSubmissionPayload,
  formatPreArrivalDateDisplay,
  formatPreArrivalIdDetailsSummary,
  formatPreArrivalTimeDisplay,
  getPreArrivalHouseRulesText,
  guestFullNameFromSubmission,
  isPreArrivalFormSubmittable,
  preArrivalFormDefaults,
  preArrivalIdDetailsFromSubmission,
  preArrivalIdInputModeFromSubmission,
  readFileAsBase64,
  validatePreArrivalForm,
  validatePreArrivalIdentity,
  validatePreArrivalIdDetails,
  applyTransferToSubmission,
  type PreArrivalIdDetailsInput,
  type PreArrivalIdInputMode,
} from '../../lib/preArrivalSubmission';
import {
  formatPreArrivalTransferPrice,
  isPreArrivalTransferOfferActive,
  normalizePreArrivalTransferOffer,
  type PreArrivalTransferOffer,
} from '../../lib/preArrivalSettings';
import type { PreArrivalSubmission } from '../../lib/syncedBooking';
import { useGuestLocale } from '../../context/GuestLocaleContext';
import GuestCheckInDiscoverNotes from './GuestCheckInDiscoverNotes';

type Props = {
  propertyId: string;
  typeId: string;
  session: GuestPortalSession;
  guide?: Record<string, unknown> | null;
  locale: string;
  contentPrimaryLocale: string;
  guestName?: string;
  guestPhone?: string;
  guestWhatsapp?: string;
  guestEmail?: string;
  existingSubmission?: PreArrivalSubmission | null;
  preArrivalComplete?: boolean;
  transferOffer?: Partial<PreArrivalTransferOffer> | null;
  onSubmitted?: (submission: PreArrivalSubmission) => void;
  onExplorePortal?: () => void;
};

export default function GuestPreArrivalForm({
  propertyId,
  typeId,
  session,
  guide,
  locale,
  contentPrimaryLocale,
  guestName,
  guestPhone,
  guestWhatsapp,
  guestEmail,
  existingSubmission,
  preArrivalComplete,
  transferOffer,
  onSubmitted,
  onExplorePortal,
}: Props) {
  const { t } = useGuestLocale();
  const activeTransferOffer = useMemo(() => {
    const normalized = normalizePreArrivalTransferOffer(transferOffer);
    return isPreArrivalTransferOfferActive(normalized) ? normalized : null;
  }, [transferOffer]);

  const houseRulesText = useMemo(
    () => getPreArrivalHouseRulesText(guide, locale, contentPrimaryLocale),
    [guide, locale, contentPrimaryLocale]
  );

  const countryOptions = useMemo(() => getSortedCountryNames(), []);

  const [form, setForm] = useState(() =>
    preArrivalFormDefaults({
      guestName,
      guestPhone,
      guestWhatsapp,
      guestEmail,
      submission: existingSubmission,
    })
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState<PreArrivalSubmission | null>(
    existingSubmission && preArrivalComplete ? existingSubmission : null
  );
  const [editing, setEditing] = useState(!(existingSubmission && preArrivalComplete));
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [idFile, setIdFile] = useState<File | null>(null);
  const [idInputMode, setIdInputMode] = useState<PreArrivalIdInputMode>(() =>
    preArrivalIdInputModeFromSubmission(existingSubmission)
  );
  const [idDetails, setIdDetails] = useState<PreArrivalIdDetailsInput>(() =>
    preArrivalIdDetailsFromSubmission(existingSubmission)
  );
  const idInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!justSubmitted || editing || !onExplorePortal) return;
    const timer = window.setTimeout(() => onExplorePortal(), 6000);
    return () => window.clearTimeout(timer);
  }, [justSubmitted, editing, onExplorePortal]);

  const storedIdDocument = submitted?.idDocument || existingSubmission?.idDocument;
  const storedIdDetails = submitted?.idDetails || existingSubmission?.idDetails;
  const idOnFile = Boolean(storedIdDocument?.storagePath) && !idFile;
  const idDetailsOnFile = Boolean(storedIdDetails) && idInputMode === 'manual';

  const canSubmit = useMemo(
    () =>
      isPreArrivalFormSubmittable(form, {
        idInputMode,
        idFile,
        idDetails,
        hasStoredIdDocument: Boolean(storedIdDocument?.storagePath),
        hasStoredIdDetails: Boolean(storedIdDetails),
      }),
    [form, idInputMode, idFile, idDetails, storedIdDocument, storedIdDetails]
  );

  const previewOnly =
    session.source === 'admin_preview' || session.source === 'tester';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const validationError = validatePreArrivalForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }

    const identityError = validatePreArrivalIdentity({
      idInputMode,
      idFile,
      idDetails,
      hasStoredIdDocument: Boolean(storedIdDocument?.storagePath),
      hasStoredIdDetails: Boolean(storedIdDetails),
    });
    if (identityError) {
      setError(identityError);
      return;
    }

    if (previewOnly && !session.bookingId) {
      let localSubmission = applyTransferToSubmission(
        buildPreArrivalSubmissionPayload(form, locale),
        form,
        activeTransferOffer
      );
      if (idFile) {
        localSubmission.idDocument = {
          uploadedAt: new Date().toISOString(),
          storagePath: 'preview/id-document.enc',
          contentType: idFile.type,
          sizeBytes: idFile.size,
          encryptionKeyVersion: 'v1',
        };
        delete localSubmission.idDetails;
      } else if (idInputMode === 'manual' && !validatePreArrivalIdDetails(idDetails)) {
        localSubmission.idDetails = buildPreArrivalIdDetailsPayload(idDetails);
        delete localSubmission.idDocument;
      } else if (existingSubmission?.idDocument) {
        localSubmission.idDocument = existingSubmission.idDocument;
      } else if (existingSubmission?.idDetails) {
        localSubmission.idDetails = existingSubmission.idDetails;
      }
      setSubmitted(localSubmission);
      setEditing(false);
      setJustSubmitted(true);
      onSubmitted?.(localSubmission);
      return;
    }

    if (!session.sessionId) {
      setError('Your session expired. Please refresh and sign in again.');
      return;
    }

    setSubmitting(true);
    try {
      let idDocumentBase64: string | undefined;
      let idDocumentContentType: string | undefined;
      if (idInputMode === 'upload' && idFile) {
        idDocumentBase64 = await readFileAsBase64(idFile);
        idDocumentContentType = idFile.type;
      }

      const result = await submitPreArrivalCheckInCallable({
        propertyId,
        typeId,
        sessionId: session.sessionId,
        guestFirstName: form.guestFirstName,
        guestLastName: form.guestLastName,
        guestCountry: form.guestCountry.trim() || undefined,
        expectedArrivalTime: form.expectedArrivalTime,
        guestCount: form.guestCount,
        contactPhone: form.contactPhone,
        contactEmail: form.contactEmail.trim() || undefined,
        dateOfBirth: form.dateOfBirth.trim() || undefined,
        specialRequests: form.specialRequests,
        acceptedHouseRules: form.acceptedHouseRules,
        houseRulesLocale: locale,
        guestLocale: locale,
        transferRequested: form.transferRequested,
        idDocumentBase64,
        idDocumentContentType,
        idDocumentType:
          idInputMode === 'manual' ? idDetails.documentType || undefined : undefined,
        idDocumentNumber:
          idInputMode === 'manual' ? idDetails.documentNumber.trim() || undefined : undefined,
        idIssuingCountry:
          idInputMode === 'manual' ? idDetails.issuingCountry.trim() || undefined : undefined,
        idIssueDate: idInputMode === 'manual' ? idDetails.issueDate.trim() || undefined : undefined,
        idExpiryDate:
          idInputMode === 'manual' ? idDetails.expiryDate.trim() || undefined : undefined,
      });
      setSubmitted(result.submission);
      setIdFile(null);
      setEditing(false);
      setJustSubmitted(true);
      onSubmitted?.(result.submission);
    } catch (err) {
      setError(httpsCallableMessage(err, 'Could not submit your check-in. Please try again.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted && !editing) {
    return (
      <div className="mt-6 space-y-4">
        <div className="rounded-2xl border border-emerald-100 bg-emerald-50/80 px-5 py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 size={22} className="text-emerald-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <h2 className="font-luxury text-lg font-medium text-[#051F26]">
                {t('checkInThanksTitle')}
              </h2>
              <p className="text-sm text-gray-600 leading-relaxed mt-1">
                {t('checkInThanksSub')}
                {previewOnly ? ' (Preview only — not saved.)' : ''}
              </p>
              <dl className="mt-4 space-y-2 text-sm text-gray-700">
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Guest</dt>
                  <dd className="font-medium text-right">
                    {guestFullNameFromSubmission(submitted) ||
                      buildGuestFullName(form.guestFirstName, form.guestLastName)}
                  </dd>
                </div>
                {submitted.guestCountry && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Country</dt>
                    <dd className="font-medium text-right">{submitted.guestCountry}</dd>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Arrival time</dt>
                  <dd className="font-medium tabular-nums">
                    {formatPreArrivalTimeDisplay(submitted.expectedArrivalTime)}
                  </dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Guests</dt>
                  <dd className="font-medium">{submitted.guestCount}</dd>
                </div>
                <div className="flex justify-between gap-4">
                  <dt className="text-gray-500">Phone</dt>
                  <dd className="font-medium text-right">{submitted.contactPhone}</dd>
                </div>
                {submitted.contactEmail && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Email</dt>
                    <dd className="font-medium text-right break-all">{submitted.contactEmail}</dd>
                  </div>
                )}
                {submitted.dateOfBirth && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">Date of birth</dt>
                    <dd className="font-medium tabular-nums">
                      {formatPreArrivalDateDisplay(submitted.dateOfBirth)}
                    </dd>
                  </div>
                )}
                {submitted.specialRequests && (
                  <div>
                    <dt className="text-gray-500 mb-1">Special requests</dt>
                    <dd className="leading-relaxed whitespace-pre-wrap">{submitted.specialRequests}</dd>
                  </div>
                )}
                {submitted.transferRequested && submitted.transferOffer && (
                  <div>
                    <dt className="text-gray-500 mb-1">Transfer requested</dt>
                    <dd className="font-medium">
                      {submitted.transferOffer.label} ·{' '}
                      {formatPreArrivalTransferPrice(submitted.transferOffer.priceEur)}
                    </dd>
                  </div>
                )}
                {submitted.idDocument && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">ID document</dt>
                    <dd className="font-medium text-emerald-700">Uploaded securely</dd>
                  </div>
                )}
                {submitted.idDetails && (
                  <div className="flex justify-between gap-4">
                    <dt className="text-gray-500">ID details</dt>
                    <dd className="font-medium text-right">
                      {formatPreArrivalIdDetailsSummary(submitted.idDetails)}
                    </dd>
                  </div>
                )}
              </dl>
              <button
                type="button"
                onClick={() => {
                  setForm(
                    preArrivalFormDefaults({
                      guestPhone,
                      guestWhatsapp,
                      guestEmail,
                      submission: submitted,
                    })
                  );
                  setIdInputMode(preArrivalIdInputModeFromSubmission(submitted));
                  setIdDetails(preArrivalIdDetailsFromSubmission(submitted));
                  setIdFile(null);
                  setEditing(true);
                }}
                className="mt-5 text-sm font-semibold text-[#0B4F5C] hover:underline"
              >
                Update details
              </button>
            </div>
          </div>
        </div>

        <GuestCheckInDiscoverNotes />

        {onExplorePortal && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onExplorePortal}
              className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F5C] px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#083A43] transition-colors"
            >
              {t('checkInStartUsing')}
              <ChevronRight size={16} />
            </button>
            <p className="text-center text-xs text-gray-400">
              {justSubmitted ? t('checkInRedirectHint') : t('checkInPromoDoneSub')}
            </p>
          </div>
        )}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 space-y-5">
      <div className="rounded-2xl border border-gray-100 bg-white px-5 py-6 shadow-sm space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label htmlFor="pre-arrival-first-name" className="block text-sm font-semibold text-[#051F26] mb-2">
              First name <span className="text-red-500">*</span>
            </label>
            <input
              id="pre-arrival-first-name"
              type="text"
              autoComplete="given-name"
              required
              value={form.guestFirstName}
              onChange={(e) => setForm((prev) => ({ ...prev, guestFirstName: e.target.value }))}
              className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
            />
          </div>
          <div>
            <label htmlFor="pre-arrival-last-name" className="block text-sm font-semibold text-[#051F26] mb-2">
              Surname <span className="text-red-500">*</span>
            </label>
            <input
              id="pre-arrival-last-name"
              type="text"
              autoComplete="family-name"
              required
              value={form.guestLastName}
              onChange={(e) => setForm((prev) => ({ ...prev, guestLastName: e.target.value }))}
              className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
            />
          </div>
        </div>

        <div>
          <label htmlFor="pre-arrival-country" className="block text-sm font-semibold text-[#051F26] mb-2">
            Country <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <select
            id="pre-arrival-country"
            value={form.guestCountry}
            onChange={(e) => setForm((prev) => ({ ...prev, guestCountry: e.target.value }))}
            className="guest-input w-full border border-gray-200 text-gray-900 bg-white focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          >
            <option value="">Select country</option>
            {countryOptions.map((country) => (
              <option key={country} value={country}>
                {country}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="pre-arrival-time" className="block text-sm font-semibold text-[#051F26] mb-2">
            Expected arrival time <span className="text-red-500">*</span>
          </label>
          <input
            id="pre-arrival-time"
            type="time"
            required
            value={form.expectedArrivalTime}
            onChange={(e) => setForm((prev) => ({ ...prev, expectedArrivalTime: e.target.value }))}
            className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          />
        </div>

        <div>
          <label htmlFor="pre-arrival-guests" className="block text-sm font-semibold text-[#051F26] mb-2">
            Number of guests <span className="text-red-500">*</span>
          </label>
          <input
            id="pre-arrival-guests"
            type="number"
            min={1}
            max={30}
            required
            value={form.guestCount}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                guestCount: Number(e.target.value) || 1,
              }))
            }
            className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          />
        </div>

        <div>
          <label htmlFor="pre-arrival-phone" className="block text-sm font-semibold text-[#051F26] mb-2">
            Mobile phone <span className="text-red-500">*</span>
          </label>
          <input
            id="pre-arrival-phone"
            type="tel"
            autoComplete="tel"
            required
            value={form.contactPhone}
            onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
            placeholder="+30 690 000 0000"
            className="guest-input w-full border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          />
        </div>

        <div>
          <label htmlFor="pre-arrival-email" className="block text-sm font-semibold text-[#051F26] mb-2">
            Email <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="pre-arrival-email"
            type="email"
            autoComplete="email"
            value={form.contactEmail}
            onChange={(e) => setForm((prev) => ({ ...prev, contactEmail: e.target.value }))}
            placeholder="you@example.com"
            className="guest-input w-full border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          />
        </div>

        <div>
          <label htmlFor="pre-arrival-dob" className="block text-sm font-semibold text-[#051F26] mb-2">
            Date of birth <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <input
            id="pre-arrival-dob"
            type="date"
            value={form.dateOfBirth}
            onChange={(e) => setForm((prev) => ({ ...prev, dateOfBirth: e.target.value }))}
            className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
          />
        </div>

        <div>
          <label
            htmlFor="pre-arrival-requests"
            className="block text-sm font-semibold text-[#051F26] mb-2"
          >
            Special requests <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            id="pre-arrival-requests"
            rows={4}
            value={form.specialRequests}
            onChange={(e) =>
              setForm((prev) => ({
                ...prev,
                specialRequests: e.target.value.slice(0, PRE_ARRIVAL_SPECIAL_REQUESTS_MAX),
              }))
            }
            placeholder="Early check-in, crib, airport transfer, etc."
            className="guest-input w-full border border-gray-200 text-gray-800 placeholder:text-gray-400 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10 resize-y min-h-[100px]"
          />
          <p className="text-right text-xs text-gray-400 mt-1.5 tabular-nums">
            {form.specialRequests.length}/{PRE_ARRIVAL_SPECIAL_REQUESTS_MAX}
          </p>
        </div>

        {activeTransferOffer && (
          <div className="rounded-xl border border-[#C5A059]/25 bg-[#C5A059]/[0.06] px-4 py-4">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.transferRequested}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, transferRequested: e.target.checked }))
                }
                className="mt-1 rounded border-gray-300 text-[#0B4F5C] focus:ring-[#0B4F5C]/20"
              />
              <span className="min-w-0">
                <span className="text-sm font-semibold text-[#051F26] flex items-center gap-2">
                  <Car size={16} className="text-[#0B4F5C] shrink-0" />
                  {activeTransferOffer.label}
                </span>
                <span className="block text-sm text-gray-600 mt-1">
                  {formatPreArrivalTransferPrice(activeTransferOffer.priceEur)}
                  {activeTransferOffer.paymentNote
                    ? ` · ${activeTransferOffer.paymentNote}`
                    : ''}
                </span>
              </span>
            </label>
          </div>
        )}

        <div className="rounded-xl border border-gray-100 bg-gray-50/80 px-4 py-4">
          <div className="flex items-start gap-3 mb-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#0B4F5C]/8 text-[#0B4F5C]">
              <Shield size={18} />
            </span>
            <div>
              <p className="text-sm font-semibold text-[#051F26]">
                Identity verification <span className="text-red-500">*</span>
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-gray-500 leading-relaxed list-disc pl-4">
                <li>Enter your ID details manually or upload a photo of your ID — one is required.</li>
                {idInputMode === 'upload' && (
                  <>
                    <li>
                      <span className="font-medium text-gray-600">Format:</span>{' '}
                      {PRE_ARRIVAL_IDENTITY_GUIDANCE.formats}
                    </li>
                    <li>
                      <span className="font-medium text-gray-600">Max size:</span>{' '}
                      {PRE_ARRIVAL_IDENTITY_GUIDANCE.maxSizeLabel}
                    </li>
                  </>
                )}
                <li>
                  <span className="font-medium text-gray-600">Privacy:</span>{' '}
                  {PRE_ARRIVAL_IDENTITY_GUIDANCE.gdprSummary}
                </li>
              </ul>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4 bg-white p-1.5 rounded-lg border border-gray-100">
            <button
              type="button"
              onClick={() => {
                setIdInputMode('manual');
                setIdFile(null);
                if (idInputRef.current) idInputRef.current.value = '';
                setError(null);
              }}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                idInputMode === 'manual'
                  ? 'bg-[#0B4F5C]/8 text-[#0B4F5C]'
                  : 'text-gray-500 hover:text-[#0B4F5C]'
              }`}
            >
              Enter details
            </button>
            <span
              className="shrink-0 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400"
              aria-hidden="true"
            >
              or
            </span>
            <button
              type="button"
              onClick={() => {
                setIdInputMode('upload');
                setError(null);
              }}
              className={`flex-1 px-3 py-2 rounded-md text-xs font-semibold transition-all ${
                idInputMode === 'upload'
                  ? 'bg-[#0B4F5C]/8 text-[#0B4F5C]'
                  : 'text-gray-500 hover:text-[#0B4F5C]'
              }`}
            >
              Upload ID
            </button>
          </div>

          {idInputMode === 'upload' ? (
            <>
              <input
                ref={idInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const file = e.target.files?.[0] || null;
                  setIdFile(file);
                  setError(null);
                }}
              />

              {idFile ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-[#0B4F5C]/15 bg-white px-3 py-2.5">
                  <p className="text-sm text-gray-700 truncate">{idFile.name}</p>
                  <button
                    type="button"
                    onClick={() => {
                      setIdFile(null);
                      if (idInputRef.current) idInputRef.current.value = '';
                    }}
                    className="text-xs font-semibold text-gray-500 hover:text-red-600 shrink-0"
                  >
                    Remove
                  </button>
                </div>
              ) : idOnFile ? (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-800">
                  ID document on file. Upload a new photo to replace it.
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => idInputRef.current?.click()}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-dashed border-[#0B4F5C]/25 bg-white px-4 py-3 text-sm font-semibold text-[#0B4F5C] hover:bg-[#0B4F5C]/[0.03] transition-colors"
                >
                  <Upload size={16} />
                  Choose photo or PDF
                </button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              {idDetailsOnFile && (
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-800">
                  ID details on file. Update the fields below to replace them.
                </div>
              )}
              <div>
                <label htmlFor="pre-arrival-id-type" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Document type <span className="text-red-500">*</span>
                </label>
                <select
                  id="pre-arrival-id-type"
                  value={idDetails.documentType}
                  onChange={(e) =>
                    setIdDetails((prev) => ({
                      ...prev,
                      documentType: e.target.value as PreArrivalIdDetailsInput['documentType'],
                    }))
                  }
                  className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
                >
                  <option value="">Select document type</option>
                  {PRE_ARRIVAL_ID_DOCUMENT_TYPES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pre-arrival-id-number" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Document number <span className="text-red-500">*</span>
                </label>
                <input
                  id="pre-arrival-id-number"
                  type="text"
                  value={idDetails.documentNumber}
                  onChange={(e) =>
                    setIdDetails((prev) => ({ ...prev, documentNumber: e.target.value }))
                  }
                  placeholder="As shown on your ID"
                  className="guest-input w-full border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
                />
              </div>
              <div>
                <label htmlFor="pre-arrival-id-country" className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Issuing country <span className="text-red-500">*</span>
                </label>
                <input
                  id="pre-arrival-id-country"
                  type="text"
                  value={idDetails.issuingCountry}
                  onChange={(e) =>
                    setIdDetails((prev) => ({ ...prev, issuingCountry: e.target.value }))
                  }
                  placeholder="e.g. Greece"
                  className="guest-input w-full border border-gray-200 text-gray-900 placeholder:text-gray-400 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor="pre-arrival-id-issue-date" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Issue date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="pre-arrival-id-issue-date"
                    type="date"
                    value={idDetails.issueDate}
                    onChange={(e) =>
                      setIdDetails((prev) => ({ ...prev, issueDate: e.target.value }))
                    }
                    className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
                  />
                </div>
                <div>
                  <label htmlFor="pre-arrival-id-expiry-date" className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Expiry date <span className="font-normal text-gray-400">(optional)</span>
                  </label>
                  <input
                    id="pre-arrival-id-expiry-date"
                    type="date"
                    value={idDetails.expiryDate}
                    onChange={(e) =>
                      setIdDetails((prev) => ({ ...prev, expiryDate: e.target.value }))
                    }
                    className="guest-input w-full border border-gray-200 text-gray-900 focus:border-[#0B4F5C]/40 focus:ring-2 focus:ring-[#0B4F5C]/10"
                  />
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-[#0B4F5C]/10 bg-[#0B4F5C]/[0.03] px-4 py-4">
          <p className="text-sm font-semibold text-[#051F26] mb-2">House rules</p>
          {houseRulesText ? (
            <div className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto mb-3">
              {houseRulesText}
            </div>
          ) : (
            <p className="text-sm text-gray-600 leading-relaxed mb-3">
              Please follow the property house rules during your stay, including quiet hours and
              care of the accommodation.
            </p>
          )}
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={form.acceptedHouseRules}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, acceptedHouseRules: e.target.checked }))
              }
              className="mt-1 h-4 w-4 rounded border-gray-300 text-[#0B4F5C] focus:ring-[#0B4F5C]/20"
            />
            <span className="text-sm text-gray-700 leading-relaxed">
              I have read and accept the house rules for this property.{' '}
              <span className="text-red-500">*</span>
            </span>
          </label>
        </div>
      </div>

      {error && (
        <p className="text-sm text-red-600 px-1" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting || !canSubmit}
        className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0B4F5C] px-4 py-3.5 text-sm font-semibold text-white shadow-sm hover:bg-[#083A43] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Submitting…
          </>
        ) : (
          'Submit check-in details'
        )}
      </button>
    </form>
  );
}
