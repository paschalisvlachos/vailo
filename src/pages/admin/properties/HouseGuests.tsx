import { useEffect, useMemo, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { collection, onSnapshot } from 'firebase/firestore';
import { Users } from 'lucide-react';
import GuestWhatsAppLink from '../../../components/admin/GuestWhatsAppLink';
import { buildWhatsAppChatUrl } from '../../../lib/guestWhatsApp';
import { db } from '../../../lib/firebase';
import { usePlatformLanguages } from '../../../hooks/usePlatformLanguages';
import { collectHouseGuests, languageTitleForCode } from '../../../lib/houseGuests';

export default function HouseGuests() {
  const { propertyId } = useOutletContext<{ propertyId: string }>();
  const { languages } = usePlatformLanguages();
  const [propertyTypes, setPropertyTypes] = useState<
    { id: string; propertyTypeName?: string; syncedBookings?: unknown[] }[]
  >([]);

  useEffect(() => {
    if (!propertyId) return;
    const unsub = onSnapshot(collection(db, 'properties', propertyId, 'propertyTypes'), (snap) => {
      setPropertyTypes(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, [propertyId]);

  const guests = useMemo(
    () => collectHouseGuests(propertyTypes as Parameters<typeof collectHouseGuests>[0]),
    [propertyTypes]
  );

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
          <Users size={22} className="text-vailo-teal" />
          House Guests
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Guests appear here after you save their details from the{' '}
          <Link to="../calendar" className="text-vailo-teal font-semibold hover:underline">
            Calendar
          </Link>{' '}
          (name, email, and language required).
        </p>
      </div>

      {guests.length === 0 ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-gray-200 bg-gray-50">
          <Users size={36} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-900 font-medium">No house guests yet</p>
          <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
            Open a booking on the calendar, enter name, email, WhatsApp, and language, then save.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    WhatsApp
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Lang
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-bold text-gray-500 uppercase tracking-wider">
                    Dates
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {guests.map((guest) => (
                  <tr key={`${guest.typeId}-${guest.id}`} className="hover:bg-gray-50/80">
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-900 whitespace-nowrap">
                      {guest.guestName}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{guest.guestEmail}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span>{guest.guestWhatsapp}</span>
                        {guest.guestWhatsapp &&
                          guest.guestWhatsapp !== '—' &&
                          buildWhatsAppChatUrl(guest.guestWhatsapp) && (
                            <GuestWhatsAppLink phone={guest.guestWhatsapp} />
                          )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {languageTitleForCode(guest.guestLocale, languages)}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {guest.unitName}
                    </td>
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-900 whitespace-nowrap tabular-nums">
                      {guest.dateRange}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
