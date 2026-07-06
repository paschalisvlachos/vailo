import { useMemo, useState } from 'react';
import { AlertTriangle, Loader2, X } from 'lucide-react';
import { AdminButton } from './AdminPageHeader';
import {
  countSyncedBookingsInDateRange,
  formatBookingDateRange,
  type SyncedBooking,
} from '../../lib/syncedBooking';

type Props = {
  scopeLabel: string;
  bookings: SyncedBooking[];
  onClose: () => void;
  onConfirm: (rangeStart: string, rangeEnd: string) => Promise<void>;
};

export default function ResetBookingsDateRangeModal({
  scopeLabel,
  bookings,
  onClose,
  onConfirm,
}: Props) {
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const rangeError = useMemo(() => {
    if (!rangeStart || !rangeEnd) return null;
    if (rangeEnd < rangeStart) return 'End date must be on or after the start date.';
    return null;
  }, [rangeStart, rangeEnd]);

  const matchCount = useMemo(() => {
    if (!rangeStart || !rangeEnd || rangeError) return 0;
    return countSyncedBookingsInDateRange(bookings, rangeStart, rangeEnd);
  }, [bookings, rangeStart, rangeEnd, rangeError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rangeStart || !rangeEnd || rangeError) return;

    const label = formatBookingDateRange(rangeStart, rangeEnd);
    const noun = matchCount === 1 ? 'reservation' : 'reservations';
    if (
      !window.confirm(
        `Remove ${matchCount} ${noun} from ${scopeLabel} between ${label}? This cannot be undone. Guest portal access for those stays will be removed.`
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(rangeStart, rangeEnd);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/40 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-md shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-lg font-bold text-gray-900">Clear reservations by date</p>
            <p className="text-sm text-gray-500 mt-1">
              Remove all bookings in <span className="font-medium text-gray-700">{scopeLabel}</span>{' '}
              that overlap the selected dates.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-50"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
                From
              </label>
              <input
                type="date"
                value={rangeStart}
                onChange={(e) => setRangeStart(e.target.value)}
                required
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">To</label>
              <input
                type="date"
                value={rangeEnd}
                onChange={(e) => setRangeEnd(e.target.value)}
                required
                min={rangeStart || undefined}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
              />
            </div>
          </div>

          {rangeError && (
            <p className="text-sm text-red-600">{rangeError}</p>
          )}

          {rangeStart && rangeEnd && !rangeError && (
            <div
              className={`flex gap-2 rounded-xl border px-3 py-2.5 text-sm ${
                matchCount > 0
                  ? 'border-amber-200 bg-amber-50 text-amber-900'
                  : 'border-gray-200 bg-gray-50 text-gray-600'
              }`}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>
                {matchCount > 0
                  ? `${matchCount} reservation${matchCount === 1 ? '' : 's'} will be removed.`
                  : 'No reservations overlap this date range.'}
              </span>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              Cancel
            </button>
            <AdminButton
              type="submit"
              disabled={submitting || !rangeStart || !rangeEnd || !!rangeError || matchCount === 0}
              className="flex-1 justify-center !bg-red-600 hover:!bg-red-700"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin mr-2" />
                  Removing…
                </>
              ) : (
                'Remove reservations'
              )}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
