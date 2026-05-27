import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { AdminButton } from './AdminPageHeader';
import type { PlatformLanguage } from '../../lib/platformLanguages';
import type { SyncedBooking } from '../../lib/syncedBooking';
import { formatBookingDateRange } from '../../lib/syncedBooking';

type Props = {
  booking: SyncedBooking;
  providerLabel: string;
  languages: PlatformLanguage[];
  saving: boolean;
  onClose: () => void;
  onSave: (payload: {
    guestName: string;
    guestEmail: string;
    guestWhatsapp: string;
    guestLocale: string;
  }) => void;
  subtitle?: string;
  saveLabel?: string;
};

export default function CalendarBookingDetailsModal({
  booking,
  providerLabel,
  languages,
  saving,
  onClose,
  onSave,
  subtitle = 'Enter details to enable invitation',
  saveLabel = 'Save details',
}: Props) {
  const [guestName, setGuestName] = useState(booking.guestName || '');
  const [guestEmail, setGuestEmail] = useState(booking.guestEmail || '');
  const [guestWhatsapp, setGuestWhatsapp] = useState(
    booking.guestWhatsapp || booking.guestPhone || ''
  );
  const [guestLocale, setGuestLocale] = useState(booking.guestLocale || '');

  useEffect(() => {
    setGuestName(booking.guestName || '');
    setGuestEmail(booking.guestEmail || '');
    setGuestWhatsapp(booking.guestWhatsapp || booking.guestPhone || '');
    setGuestLocale(booking.guestLocale || languages[0]?.shortName || '');
  }, [booking, languages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestWhatsapp: guestWhatsapp.trim(),
      guestLocale: guestLocale.trim(),
    });
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
            <p className="text-xs font-bold text-vailo-teal uppercase tracking-wider">
              Booked via {providerLabel}
            </p>
            <p className="text-lg font-bold text-gray-900 mt-1">
              {formatBookingDateRange(booking.start, booking.end)}
            </p>
            <p className="text-xs text-gray-500 mt-1">{subtitle}</p>
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

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Guest name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Email <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              WhatsApp
            </label>
            <input
              type="tel"
              value={guestWhatsapp}
              onChange={(e) => setGuestWhatsapp(e.target.value)}
              placeholder="+30 …"
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
              Default language <span className="text-red-500">*</span>
            </label>
            <select
              value={guestLocale}
              onChange={(e) => setGuestLocale(e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm outline-none focus:ring-2 focus:ring-vailo-teal/20"
            >
              <option value="" disabled>
                Select language
              </option>
              {languages.map((lang) => (
                <option key={lang.id} value={lang.shortName}>
                  {lang.title} ({lang.shortName})
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 text-sm font-medium text-gray-700 border border-gray-200 rounded-xl hover:bg-gray-50"
            >
              Cancel
            </button>
            <AdminButton type="submit" disabled={saving} className="flex-1 justify-center">
              {saving ? 'Saving…' : saveLabel}
            </AdminButton>
          </div>
        </form>
      </div>
    </div>
  );
}
