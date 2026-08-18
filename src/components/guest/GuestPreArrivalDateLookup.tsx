import { useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { httpsCallableMessage } from '../../lib/callableError';
import {
  readGuestPortalSession,
  writeGuestPortalSession,
  type GuestPortalSession,
} from '../../lib/guestAccess';
import {
  formatDayMonthYearInput,
  isCompleteDayMonthYear,
  parseDayMonthYearToIso,
} from '../../lib/guestStayDateInput';
import {
  isPreArrivalListingChoiceResult,
  resolvePreArrivalBookingByDatesCallable,
  type PreArrivalListingOption,
} from '../../lib/guestPortalCallables';

type Props = {
  propertyId: string;
  typeId: string;
  propertyName: string;
  unitName: string;
  onSessionGranted: (session: GuestPortalSession) => void;
};

function validateStayDates(checkInIso: string, checkOutIso: string): string | null {
  if (checkOutIso <= checkInIso) {
    return 'Check-out must be after check-in.';
  }
  return null;
}

export default function GuestPreArrivalDateLookup({
  propertyId,
  typeId,
  propertyName,
  unitName,
  onSessionGranted,
}: Props) {
  const [checkInDisplay, setCheckInDisplay] = useState('');
  const [checkOutDisplay, setCheckOutDisplay] = useState('');
  const [listingOptions, setListingOptions] = useState<PreArrivalListingOption[] | null>(null);
  const [selectedListingKey, setSelectedListingKey] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkInComplete = isCompleteDayMonthYear(checkInDisplay);
  const checkOutComplete = isCompleteDayMonthYear(checkOutDisplay);
  const datesReady = checkInComplete && checkOutComplete;
  const needsListingChoice = listingOptions !== null && listingOptions.length > 0;

  const canSubmit = useMemo(() => {
    if (submitting || !datesReady) return false;
    if (needsListingChoice) return Boolean(selectedListingKey);
    return true;
  }, [submitting, datesReady, needsListingChoice, selectedListingKey]);

  const selectedListing = useMemo(() => {
    if (!needsListingChoice || !selectedListingKey) return null;
    return listingOptions.find((option) => `${option.typeId}:${option.bookingId}` === selectedListingKey) ?? null;
  }, [needsListingChoice, listingOptions, selectedListingKey]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    const checkIn = parseDayMonthYearToIso(checkInDisplay);
    const checkOut = parseDayMonthYearToIso(checkOutDisplay);

    if (!checkIn || !checkOut) {
      setError('Please enter valid dates in DD/MM/YYYY format.');
      return;
    }

    const rangeError = validateStayDates(checkIn, checkOut);
    if (rangeError) {
      setError(rangeError);
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      const stored = readGuestPortalSession();
      const result = await resolvePreArrivalBookingByDatesCallable({
        propertyId,
        typeId,
        checkIn,
        checkOut,
        existingSessionId: needsListingChoice ? undefined : stored?.sessionId,
        selectedTypeId: selectedListing?.typeId,
        selectedBookingId: selectedListing?.bookingId,
      });

      if (isPreArrivalListingChoiceResult(result)) {
        setListingOptions(result.listingOptions);
        setSelectedListingKey((prev) => {
          if (
            prev &&
            result.listingOptions.some(
              (option) => `${option.typeId}:${option.bookingId}` === prev
            )
          ) {
            return prev;
          }
          if (result.listingOptions.length === 1) {
            return `${result.listingOptions[0].typeId}:${result.listingOptions[0].bookingId}`;
          }
          return prev;
        });
        return;
      }

      if (!result.session) {
        setError('We could not start your check-in. Please try again.');
        return;
      }

      writeGuestPortalSession(result.session);
      onSessionGranted(result.session);
    } catch (err) {
      setError(
        httpsCallableMessage(
          err,
          'We could not find a reservation for those dates. Please check your dates or contact your host.'
        )
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFA] text-[#051F26]">
      <div className="mx-auto max-w-lg px-5 pt-10 pb-12">
        <div className="rounded-[28px] bg-[#0B4F5C] text-white px-6 py-8 shadow-[0_24px_80px_rgba(5,31,38,0.25)]">
          <p className="guest-eyebrow text-[#C5A059]/95 mb-2">Online check-in</p>
          <h1 className="font-luxury text-[1.75rem] leading-tight font-medium">
            Confirm your stay
          </h1>
          <p className="text-sm text-white/75 mt-3 leading-relaxed">
            Enter your check-in and check-out dates for{' '}
            <span className="text-white font-medium">{propertyName}</span>
            {!needsListingChoice && unitName ? ` · ${unitName}` : ''}.
          </p>
        </div>

        <form
          onSubmit={(e) => void handleSubmit(e)}
          className="mt-6 rounded-2xl border border-[#0B4F5C]/10 bg-white p-6 shadow-sm space-y-5"
        >
          <p className="text-xs text-gray-500">Use day / month / year — for example 18/08/2026.</p>

          <div>
            <label
              htmlFor="pre-arrival-check-in"
              className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5"
            >
              Check-in date <span className="text-red-500">*</span>
            </label>
            <input
              id="pre-arrival-check-in"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DD/MM/YYYY"
              value={checkInDisplay}
              onChange={(e) => {
                setCheckInDisplay(formatDayMonthYearInput(e.target.value));
                setListingOptions(null);
                setSelectedListingKey('');
                setError(null);
              }}
              required
              maxLength={10}
              className="guest-input w-full border border-gray-200 text-gray-900 tabular-nums tracking-wide outline-none focus:ring-2 focus:ring-vailo-teal/20"
            />
          </div>

          <div>
            <label
              htmlFor="pre-arrival-check-out"
              className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5"
            >
              Check-out date <span className="text-red-500">*</span>
            </label>
            <input
              id="pre-arrival-check-out"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="DD/MM/YYYY"
              value={checkOutDisplay}
              onChange={(e) => {
                setCheckOutDisplay(formatDayMonthYearInput(e.target.value));
                setListingOptions(null);
                setSelectedListingKey('');
                setError(null);
              }}
              required
              maxLength={10}
              className="guest-input w-full border border-gray-200 text-gray-900 tabular-nums tracking-wide outline-none focus:ring-2 focus:ring-vailo-teal/20"
            />
          </div>

          {needsListingChoice && (
            <div>
              <label
                htmlFor="pre-arrival-listing"
                className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1.5"
              >
                Which accommodation is your stay? <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-gray-500 mb-2">
                More than one listing has a reservation for these dates. Please choose yours.
              </p>
              <select
                id="pre-arrival-listing"
                value={selectedListingKey}
                onChange={(e) => {
                  setSelectedListingKey(e.target.value);
                  setError(null);
                }}
                required
                className="guest-input w-full border border-gray-200 text-gray-900 bg-white outline-none focus:ring-2 focus:ring-vailo-teal/20"
              >
                <option value="">Select accommodation</option>
                {listingOptions.map((option) => (
                  <option
                    key={`${option.typeId}:${option.bookingId}`}
                    value={`${option.typeId}:${option.bookingId}`}
                  >
                    {option.typeName}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full py-3.5 rounded-2xl bg-[#0B4F5C] text-white text-sm font-semibold hover:bg-[#083A43] disabled:opacity-50 transition-colors inline-flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Verifying…
              </>
            ) : needsListingChoice ? (
              'Continue to check-in'
            ) : (
              'Continue to check-in'
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
