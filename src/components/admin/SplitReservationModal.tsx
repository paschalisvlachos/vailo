import { useMemo, useState } from 'react';
import { Loader2, Plus, Scissors, Trash2, X } from 'lucide-react';
import { AdminButton } from './AdminPageHeader';
import {
  formatBookingDateRange,
  validateReservationSplitParts,
  type SplitBookingPart,
  type SyncedBooking,
} from '../../lib/syncedBooking';

type Props = {
  booking: SyncedBooking & { typeName?: string };
  onClose: () => void;
  onConfirm: (parts: SplitBookingPart[]) => Promise<void>;
};

function emptyPart(): SplitBookingPart {
  return { start: '', end: '' };
}

export default function SplitReservationModal({ booking, onClose, onConfirm }: Props) {
  const [parts, setParts] = useState<SplitBookingPart[]>([emptyPart(), emptyPart()]);
  const [submitting, setSubmitting] = useState(false);

  const validationError = useMemo(
    () => validateReservationSplitParts(booking, parts),
    [booking, parts]
  );

  const updatePart = (index: number, field: keyof SplitBookingPart, value: string) => {
    setParts((prev) =>
      prev.map((part, i) => (i === index ? { ...part, [field]: value } : part))
    );
  };

  const addPart = () => {
    setParts((prev) => [...prev, emptyPart()]);
  };

  const removePart = (index: number) => {
    setParts((prev) => (prev.length <= 2 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (validationError) return;

    const label = formatBookingDateRange(booking.start, booking.end);
    const hadInvite = Boolean(booking.isInvited);
    const inviteNote = hadInvite
      ? ' Any existing invitation on this stay will be cleared — send a new invite for each segment.'
      : '';

    if (
      !window.confirm(
        `Split this reservation (${label}) into ${parts.length} separate stays?${inviteNote}`
      )
    ) {
      return;
    }

    setSubmitting(true);
    try {
      await onConfirm(parts);
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
        className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between p-5 border-b border-gray-100">
          <div>
            <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <Scissors size={18} className="text-vailo-teal" />
              Split reservation
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {booking.guestName || booking.summary || 'Guest'}
              {booking.typeName ? ` · ${booking.typeName}` : ''}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Original stay: {formatBookingDateRange(booking.start, booking.end)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={(e) => void handleSubmit(e)} className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            Define separate check-in / check-out dates for each real stay. Segments must stay
            within the original dates and must not overlap — gaps are allowed (e.g. when iCal
            merged two bookings into one block).
          </p>

          <div className="space-y-3">
            {parts.map((part, index) => (
              <div
                key={`split-part-${index}`}
                className="grid grid-cols-[auto_1fr_1fr_auto] gap-2 items-end p-3 rounded-xl border border-gray-200 bg-gray-50"
              >
                <span className="text-xs font-bold text-gray-500 pb-2">#{index + 1}</span>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Check-in</label>
                  <input
                    type="date"
                    required
                    min={booking.start?.slice(0, 10)}
                    max={booking.end?.slice(0, 10)}
                    value={part.start}
                    onChange={(e) => updatePart(index, 'start', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Check-out</label>
                  <input
                    type="date"
                    required
                    min={part.start || booking.start?.slice(0, 10)}
                    max={booking.end?.slice(0, 10)}
                    value={part.end}
                    onChange={(e) => updatePart(index, 'end', e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20 focus:border-vailo-teal"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removePart(index)}
                  disabled={parts.length <= 2}
                  className="p-2 text-gray-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed"
                  title="Remove segment"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addPart}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-vailo-teal hover:text-vailo-teal-hover"
          >
            <Plus size={16} />
            Add another segment
          </button>

          {validationError && parts.some((p) => p.start && p.end) ? (
            <p className="text-sm text-red-600">{validationError}</p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <AdminButton type="button" variant="secondary" onClick={onClose} disabled={submitting}>
              Cancel
            </AdminButton>
            <AdminButton
              type="submit"
              disabled={submitting || Boolean(validationError) || !parts.every((p) => p.start && p.end)}
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Splitting…
                </>
              ) : (
                <>
                  <Scissors size={16} /> Split into {parts.length} stays
                </>
              )}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
